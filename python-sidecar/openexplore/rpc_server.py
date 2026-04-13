"""JSON-RPC server over stdin/stdout for communication with Electron."""

import base64
import json
import os
import plistlib
import sys
import time
import traceback
from typing import Any, Optional

from .backup import Backup
from .database import (
    discover_databases,
    execute_sql,
    get_deleted_records,
    get_table_data,
    search_global,
    search_table,
)


class RPCServer:
    """JSON-RPC 2.0 server communicating over stdin/stdout."""

    def __init__(self):
        self.backup: Optional[Backup] = None
        self._databases_cache: Optional[list[dict]] = None
        self.methods = {
            "backup.open": self._backup_open,
            "backup.getFileTree": self._get_file_tree,
            "backup.getDatabases": self._get_databases,
            "backup.getSchema": self._get_schema,
            "backup.getTableData": self._get_table_data,
            "backup.searchTable": self._search_table,
            "backup.searchGlobal": self._search_global,
            "backup.getFileContent": self._get_file_content,
            "backup.exportTable": self._export_table,
            "backup.getDeletedRecords": self._get_deleted_records,
            "backup.getPlistContent": self._get_plist_content,
            "backup.executeSQL": self._execute_sql,
            "backup.close": self._backup_close,
            "ping": self._ping,
        }

    def run(self):
        """Main loop: read JSON-RPC requests from stdin, write responses to stdout."""
        # Set stdin/stdout to binary mode on Windows
        if sys.platform == "win32":
            import msvcrt
            msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
            msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

        for line in sys.stdin.buffer:
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except json.JSONDecodeError as e:
                self._write_error(None, -32700, f"Parse error: {e}")
                continue

            req_id = request.get("id")
            method = request.get("method")
            params = request.get("params", {})

            if not method:
                self._write_error(req_id, -32600, "Invalid request: missing method")
                continue

            handler = self.methods.get(method)
            if not handler:
                self._write_error(req_id, -32601, f"Method not found: {method}")
                continue

            try:
                start = time.time()
                result = handler(params)
                duration = int((time.time() - start) * 1000)
                if isinstance(result, dict):
                    result["_rpc_duration_ms"] = duration
                self._write_result(req_id, result)
            except Exception as e:
                tb = traceback.format_exc()
                self._write_error(req_id, -32000, str(e), data={"traceback": tb})

    def _write_result(self, req_id: Any, result: Any):
        response = json.dumps({"jsonrpc": "2.0", "id": req_id, "result": result}, default=str)
        sys.stdout.buffer.write((response + "\n").encode("utf-8"))
        sys.stdout.buffer.flush()

    def _write_error(self, req_id: Any, code: int, message: str, data: Any = None):
        error: dict[str, Any] = {"code": code, "message": message}
        if data:
            error["data"] = data
        response = json.dumps({"jsonrpc": "2.0", "id": req_id, "error": error})
        sys.stdout.buffer.write((response + "\n").encode("utf-8"))
        sys.stdout.buffer.flush()

    # ---- RPC Method Handlers ----

    def _ping(self, params: dict) -> dict:
        return {"status": "ok", "version": "0.1.0"}

    def _backup_open(self, params: dict) -> dict:
        path = params.get("path")
        password = params.get("password")
        if not path:
            raise ValueError("Missing required parameter: path")

        if self.backup:
            self.backup.close()
            self.backup = None
            self._databases_cache = None

        backup = Backup(path)
        info = backup.open(password=password)
        # Only assign after successful open — failed opens leave self.backup = None
        self.backup = backup
        return info

    def _backup_close(self, params: dict) -> dict:
        if self.backup:
            self.backup.close()
            self.backup = None
            self._databases_cache = None
        return {"status": "closed"}

    def _get_file_tree(self, params: dict) -> dict:
        self._require_backup()
        tree = self.backup.get_file_tree()
        return {"tree": tree}

    def _get_databases(self, params: dict) -> dict:
        self._require_backup()
        if self._databases_cache is None:
            self._databases_cache = discover_databases(self.backup)
        return {"databases": self._databases_cache}

    def _get_schema(self, params: dict) -> dict:
        self._require_backup()
        file_id = params.get("fileId")
        if not file_id:
            raise ValueError("Missing required parameter: fileId")

        # Find this database in the cache or discover it
        if self._databases_cache:
            for db in self._databases_cache:
                if db["fileId"] == file_id:
                    return db

        # Not cached, extract schema directly
        entry = self.backup.files.get(file_id)
        if not entry:
            raise ValueError(f"File not found: {file_id}")

        from .database import _extract_database_info
        info = _extract_database_info(self.backup, file_id, entry)
        if not info:
            raise ValueError(f"Cannot extract schema from: {file_id}")
        return info

    def _get_table_data(self, params: dict) -> dict:
        self._require_backup()
        return get_table_data(
            self.backup,
            file_id=params["fileId"],
            table=params["table"],
            offset=params.get("offset", 0),
            limit=params.get("limit", 100),
            order_by=params.get("orderBy"),
            order_dir=params.get("orderDir", "ASC"),
        )

    def _search_table(self, params: dict) -> dict:
        self._require_backup()
        return search_table(
            self.backup,
            file_id=params["fileId"],
            table=params["table"],
            query=params["query"],
            columns=params.get("columns"),
        )

    def _search_global(self, params: dict) -> dict:
        self._require_backup()
        return search_global(self.backup, query=params["query"])

    def _get_file_content(self, params: dict) -> dict:
        self._require_backup()
        file_id = params.get("fileId")
        if not file_id:
            raise ValueError("Missing required parameter: fileId")

        content = self.backup.read_file_content(file_id)
        if content is None:
            raise ValueError(f"Cannot read file: {file_id}")

        entry = self.backup.files.get(file_id)

        # Try to detect type and return appropriately
        if content[:16] == b"SQLite format 3\x00":
            return {"type": "database", "fileId": file_id, "size": len(content)}

        if content[:6] == b"bplist" or content[:5] == b"<?xml":
            try:
                parsed = plistlib.loads(content)
                return {"type": "plist", "data": _make_json_safe(parsed), "size": len(content)}
            except Exception:
                pass

        if content[:3] == b"\xff\xd8\xff" or content[:8] == b"\x89PNG\r\n\x1a\n":
            fmt = "jpeg" if content[:3] == b"\xff\xd8\xff" else "png"
            return {
                "type": "image",
                "format": fmt,
                "data": base64.b64encode(content).decode("ascii"),
                "size": len(content),
            }

        # Try JSON
        try:
            parsed = json.loads(content)
            return {"type": "json", "data": parsed, "size": len(content)}
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

        # Try as text
        try:
            text = content.decode("utf-8")
            return {"type": "text", "data": text[:100000], "size": len(content)}
        except UnicodeDecodeError:
            pass

        # Binary fallback
        return {
            "type": "binary",
            "hex_preview": content[:256].hex(),
            "size": len(content),
        }

    def _export_table(self, params: dict) -> dict:
        self._require_backup()
        file_id = params["fileId"]
        table = params["table"]
        fmt = params.get("format", "csv")
        output_dir = params.get("outputDir", os.path.expanduser("~/Desktop"))

        conn = self.backup.open_database(file_id)
        if not conn:
            raise ValueError(f"Cannot open database: {file_id}")

        entry = self.backup.files.get(file_id)
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in table)
        output_path = os.path.join(output_dir, f"{safe_name}.{fmt}")

        if fmt == "csv":
            import csv
            columns = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()]
            rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()

            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(columns)
                for row in rows:
                    writer.writerow([_cell_to_export_val(v) for v in row])

        elif fmt == "json":
            columns = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()]
            rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()

            records = []
            for row in rows:
                record = {}
                for i, col in enumerate(columns):
                    record[col] = _cell_to_export_val(row[i]) if i < len(row) else None
                records.append(record)

            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(records, f, indent=2, default=str)

        elif fmt == "sqlite":
            import shutil
            content = self.backup.read_file_content(file_id)
            if content:
                with open(output_path, "wb") as f:
                    f.write(content)

        return {"path": output_path, "format": fmt, "table": table}

    def _get_deleted_records(self, params: dict) -> dict:
        self._require_backup()
        return get_deleted_records(
            self.backup,
            file_id=params["fileId"],
            table=params["table"],
        )

    def _get_plist_content(self, params: dict) -> dict:
        self._require_backup()
        file_id = params.get("fileId")
        if not file_id:
            raise ValueError("Missing required parameter: fileId")

        content = self.backup.read_file_content(file_id)
        if content is None:
            raise ValueError(f"Cannot read file: {file_id}")

        try:
            parsed = plistlib.loads(content)
            return {"data": _make_json_safe(parsed)}
        except Exception as e:
            raise ValueError(f"Failed to parse plist: {e}")

    def _execute_sql(self, params: dict) -> dict:
        self._require_backup()
        return execute_sql(
            self.backup,
            file_id=params["fileId"],
            sql=params["sql"],
            limit=params.get("limit", 1000),
        )

    def _require_backup(self):
        if not self.backup:
            raise ValueError("No backup is open — call backup.open first")


def _make_json_safe(obj):
    """Recursively convert plist objects to JSON-safe types."""
    import datetime

    if isinstance(obj, bytes):
        if len(obj) <= 256:
            return {"_type": "data", "base64": base64.b64encode(obj).decode("ascii")}
        return {"_type": "data", "base64": base64.b64encode(obj[:256]).decode("ascii") + "...", "size": len(obj)}
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {str(k): _make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_json_safe(v) for v in obj]
    if isinstance(obj, (int, float, str, bool)) or obj is None:
        return obj
    return str(obj)


def _cell_to_export_val(val):
    """Convert a cell value for export."""
    if val is None:
        return ""
    if isinstance(val, bytes):
        return f"<blob:{len(val)} bytes>"
    return val
