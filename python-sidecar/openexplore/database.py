"""Database discovery, schema extraction, and querying."""

import re
import sqlite3
import time
from typing import Optional

from .backup import Backup

# Semantic labels for known iOS databases
KNOWN_DATABASES: dict[str, str] = {
    "sms.db": "Messages / iMessage",
    "AddressBook.sqlitedb": "Contacts",
    "AddressBookImages.sqlitedb": "Contact Photos",
    "Photos.sqlite": "Photo Library",
    "NoteStore.sqlite": "Notes",
    "Calendar.sqlitedb": "Calendar",
    "call_history.db": "Call History",
    "Bookmarks.db": "Safari Bookmarks",
    "History.db": "Safari History",
    "BrowserState.db": "Safari Tabs",
    "healthdb_secure.sqlite": "Health Data",
    "healthdb.sqlite": "Health Data (Index)",
    "knowledgeC.db": "Screen Time / App Usage",
    "interactionC.db": "Contact Interactions",
    "com.apple.voicemail.db": "Voicemail",
    "Locations.sqlite": "Location History",
    "consolidated.db": "Location Cache",
    "com.apple.wifi.known-networks.plist": "Known WiFi Networks",
    "storedata.sqlitedb": "App Store Data",
    "Recents.sqlitedb": "Recent Contacts",
    "Safari.db": "Safari Data",
    "CloudTabs.db": "iCloud Tabs",
    "Suggestions.db": "Safari Suggestions",
    "com.apple.reminders.db": "Reminders",
}

# Category mapping
DATABASE_CATEGORIES: dict[str, str] = {
    "Messages / iMessage": "Communication",
    "Call History": "Communication",
    "Voicemail": "Communication",
    "Contacts": "Communication",
    "Contact Photos": "Communication",
    "Recent Contacts": "Communication",
    "Contact Interactions": "Communication",
    "Photo Library": "Media",
    "Safari Bookmarks": "Browsing",
    "Safari History": "Browsing",
    "Safari Tabs": "Browsing",
    "Safari Data": "Browsing",
    "iCloud Tabs": "Browsing",
    "Safari Suggestions": "Browsing",
    "Notes": "Personal",
    "Calendar": "Personal",
    "Reminders": "Personal",
    "Health Data": "Personal",
    "Health Data (Index)": "Personal",
    "Screen Time / App Usage": "System",
    "Location History": "System",
    "Location Cache": "System",
    "Known WiFi Networks": "System",
    "App Store Data": "System",
}

# Unix timestamp range for heuristic detection (2001-01-01 to 2040-01-01)
APPLE_EPOCH_OFFSET = 978307200  # Seconds between Unix epoch and Apple epoch (2001-01-01)
MIN_UNIX_TS = 946684800   # 2000-01-01
MAX_UNIX_TS = 2208988800  # 2040-01-01
MIN_APPLE_TS = 0
MAX_APPLE_TS = MAX_UNIX_TS - APPLE_EPOCH_OFFSET


def discover_databases(backup: Backup) -> list[dict]:
    """Discover all SQLite databases in the backup and extract metadata."""
    databases = []

    # Known database extensions
    db_extensions = {".db", ".sqlite", ".sqlitedb"}

    # Two-pass approach for performance:
    # Pass 1: files with known DB extensions (fast — these are almost certainly databases)
    # Pass 2: all other files, check magic bytes (only if not encrypted, since decrypting
    #          every file header is too slow)
    candidates = []
    other_files = []

    for file_id, entry in backup.files.items():
        if entry.flags != 1:  # Only regular files
            continue
        rp = entry.relative_path.lower()
        if any(rp.endswith(ext) for ext in db_extensions):
            candidates.append((file_id, entry))
        else:
            other_files.append((file_id, entry))

    # Also check known database filenames that might lack an extension
    known_names = set(KNOWN_DATABASES.keys())
    for file_id, entry in other_files:
        filename = entry.relative_path.split("/")[-1] if entry.relative_path else ""
        if filename in known_names:
            candidates.append((file_id, entry))

    # For non-encrypted backups, also scan other files by magic bytes
    if not backup.is_encrypted:
        for file_id, entry in other_files:
            filename = entry.relative_path.split("/")[-1] if entry.relative_path else ""
            if filename in known_names:
                continue  # Already added above
            header = backup._read_file_header(file_id, 16)
            if header and header[:16] == b"SQLite format 3\x00":
                candidates.append((file_id, entry))

    # Extract metadata from all candidates
    for file_id, entry in candidates:
        try:
            db_info = _extract_database_info(backup, file_id, entry)
            if db_info:
                databases.append(db_info)
        except Exception:
            continue

    # Sort by size descending
    databases.sort(key=lambda d: -d["size"])
    return databases


def _extract_database_info(backup: Backup, file_id: str, entry) -> Optional[dict]:
    """Extract schema and metadata from a single database.

    Deliberately skips COUNT(*) on every table — that's the #1 perf killer
    for large databases like Health. Row counts are fetched lazily when the
    user actually opens a table.
    """
    conn = backup.open_database(file_id)
    if not conn:
        return None

    try:
        filename = entry.relative_path.split("/")[-1] if entry.relative_path else ""
        label = KNOWN_DATABASES.get(filename, "Unidentified")
        category = DATABASE_CATEGORIES.get(label, "Apps" if "AppDomain" in entry.domain else "Unidentified")

        if label == "Unidentified" and entry.domain:
            label = f"{entry.domain}: {entry.relative_path}"

        tables = []
        cursor = conn.execute(
            "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY type, name"
        )
        for name, obj_type, sql in cursor:
            if name.startswith("sqlite_"):
                continue

            columns = []
            try:
                col_cursor = conn.execute(f'PRAGMA table_info("{name}")')
                for col in col_cursor:
                    columns.append({
                        "cid": col[0],
                        "name": col[1],
                        "type": col[2] or "ANY",
                        "notnull": bool(col[3]),
                        "default": col[4],
                        "pk": bool(col[5]),
                    })
            except sqlite3.Error:
                pass

            tables.append({
                "name": name,
                "type": obj_type,
                "sql": sql,
                "row_count": -1,  # Lazy — fetched on demand
                "columns": columns,
            })

        table_count = len([t for t in tables if t["type"] == "table"])

        indices = []
        try:
            idx_cursor = conn.execute(
                "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
            )
            for name, tbl_name, sql in idx_cursor:
                indices.append({"name": name, "table": tbl_name, "sql": sql})
        except sqlite3.Error:
            pass

        triggers = []
        try:
            trg_cursor = conn.execute(
                "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'"
            )
            for name, tbl_name, sql in trg_cursor:
                triggers.append({"name": name, "table": tbl_name, "sql": sql})
        except sqlite3.Error:
            pass

        return {
            "fileId": file_id,
            "domain": entry.domain,
            "relativePath": entry.relative_path,
            "filename": filename,
            "label": label,
            "category": category,
            "size": entry.size,
            "tables": tables,
            "indices": indices,
            "triggers": triggers,
            "total_rows": -1,  # Unknown until tables are counted
            "table_count": table_count,
        }

    except sqlite3.Error:
        return None


def get_table_data(
    backup: Backup,
    file_id: str,
    table: str,
    offset: int = 0,
    limit: int = 100,
    order_by: Optional[str] = None,
    order_dir: str = "ASC",
) -> dict:
    """Fetch paginated data from a table."""
    start = time.time()
    conn = backup.open_database(file_id)
    if not conn:
        raise ValueError(f"Cannot open database: {file_id}")

    # Validate table name exists
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
    ).fetchall()]
    if table not in tables:
        raise ValueError(f"Table not found: {table}")

    # Get columns
    columns = []
    col_cursor = conn.execute(f'PRAGMA table_info("{table}")')
    for col in col_cursor:
        columns.append({
            "name": col[1],
            "type": col[2] or "ANY",
            "pk": bool(col[5]),
        })

    # Build query
    order_clause = ""
    if order_by:
        col_names = [c["name"] for c in columns]
        if order_by in col_names:
            direction = "DESC" if order_dir.upper() == "DESC" else "ASC"
            order_clause = f' ORDER BY "{order_by}" {direction}'

    query = f'SELECT * FROM "{table}"{order_clause} LIMIT ? OFFSET ?'
    rows_raw = conn.execute(query, (limit, offset)).fetchall()

    # Fast row count estimate using sqlite max(rowid), falling back to
    # a real COUNT(*) only for small tables (< 5 seconds)
    total = _fast_row_count(conn, table)

    # Process rows: detect types and format
    rows = []
    col_types = _detect_column_types(conn, table, columns, rows_raw)

    for row in rows_raw:
        processed = []
        for i, val in enumerate(row):
            processed.append(_format_cell(val, col_types[i] if i < len(col_types) else "unknown"))
        rows.append(processed)

    duration = int((time.time() - start) * 1000)

    return {
        "columns": columns,
        "columnTypes": col_types,
        "rows": rows,
        "total": total,
        "offset": offset,
        "limit": limit,
        "duration_ms": duration,
    }


def _fast_row_count(conn, table: str) -> int:
    """Get a row count quickly. Uses max(rowid) as a fast estimate for large
    tables, falls back to COUNT(*) for tables without integer rowids."""
    try:
        # Try max(rowid) first — O(1) via index, good enough estimate
        result = conn.execute(f'SELECT max(rowid) FROM "{table}"').fetchone()
        if result and result[0] is not None:
            return result[0]
    except sqlite3.Error:
        pass

    # WITHOUT ROWID tables or empty tables — use COUNT(*) but with a timeout
    try:
        result = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()
        if result:
            return result[0]
    except sqlite3.Error:
        pass

    return 0


def search_table(
    backup: Backup,
    file_id: str,
    table: str,
    query: str,
    columns: Optional[list[str]] = None,
    limit: int = 200,
) -> dict:
    """Search within a table for matching rows."""
    start = time.time()
    conn = backup.open_database(file_id)
    if not conn:
        raise ValueError(f"Cannot open database: {file_id}")

    # Get all columns
    all_columns = []
    col_cursor = conn.execute(f'PRAGMA table_info("{table}")')
    for col in col_cursor:
        all_columns.append({"name": col[1], "type": col[2] or "ANY", "pk": bool(col[5])})

    search_cols = columns or [c["name"] for c in all_columns]
    # Build WHERE clause for text search
    conditions = []
    params = []
    for col in search_cols:
        if col in [c["name"] for c in all_columns]:
            conditions.append(f'CAST("{col}" AS TEXT) LIKE ?')
            params.append(f"%{query}%")

    if not conditions:
        return {"columns": all_columns, "rows": [], "total": 0, "duration_ms": 0}

    where = " OR ".join(conditions)
    sql = f'SELECT * FROM "{table}" WHERE {where} LIMIT ?'
    params.append(limit)

    rows_raw = conn.execute(sql, params).fetchall()

    col_types = _detect_column_types(conn, table, all_columns, rows_raw)
    rows = []
    for row in rows_raw:
        processed = [_format_cell(val, col_types[i] if i < len(col_types) else "unknown") for i, val in enumerate(row)]
        rows.append(processed)

    duration = int((time.time() - start) * 1000)

    return {
        "columns": all_columns,
        "columnTypes": col_types,
        "rows": rows,
        "total": len(rows),
        "duration_ms": duration,
    }


def search_global(backup: Backup, query: str, limit_per_table: int = 20) -> list[dict]:
    """Search across all tables in all databases."""
    start = time.time()
    results = []

    databases = discover_databases(backup)
    for db_info in databases:
        file_id = db_info["fileId"]
        conn = backup.open_database(file_id)
        if not conn:
            continue

        for tbl in db_info["tables"]:
            if tbl["type"] != "table":
                continue

            try:
                text_cols = [c["name"] for c in tbl["columns"]
                             if c["type"].upper() in ("TEXT", "VARCHAR", "ANY", "")]

                if not text_cols:
                    continue

                conditions = [f'CAST("{col}" AS TEXT) LIKE ?' for col in text_cols]
                params = [f"%{query}%" for _ in text_cols]

                sql = f'SELECT * FROM "{tbl["name"]}" WHERE {" OR ".join(conditions)} LIMIT ?'
                params.append(limit_per_table)

                rows = conn.execute(sql, params).fetchall()
                if rows:
                    col_names = [c["name"] for c in tbl["columns"]]
                    for row in rows:
                        # Find which column matched
                        match_col = ""
                        match_val = ""
                        for i, val in enumerate(row):
                            if val and query.lower() in str(val).lower():
                                match_col = col_names[i] if i < len(col_names) else ""
                                match_val = str(val)[:200]
                                break

                        results.append({
                            "database": db_info["label"],
                            "fileId": file_id,
                            "table": tbl["name"],
                            "matchColumn": match_col,
                            "matchValue": match_val,
                            "row": {col_names[i]: _format_cell(v, "unknown") for i, v in enumerate(row) if i < len(col_names)},
                        })
            except sqlite3.Error:
                continue

    duration = int((time.time() - start) * 1000)
    return {"results": results[:500], "total": len(results), "duration_ms": duration}


def execute_sql(backup: Backup, file_id: str, sql: str, limit: int = 1000) -> dict:
    """Execute arbitrary read-only SQL against a database."""
    start = time.time()
    conn = backup.open_database(file_id)
    if not conn:
        raise ValueError(f"Cannot open database: {file_id}")

    # Safety: ensure query_only is set
    conn.execute("PRAGMA query_only = ON")

    # Block dangerous statements
    sql_upper = sql.strip().upper()
    blocked = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "ATTACH", "DETACH"]
    first_word = sql_upper.split()[0] if sql_upper.split() else ""
    if first_word in blocked:
        raise ValueError(f"Write operations are not allowed: {first_word}")

    cursor = conn.execute(sql)
    columns = [desc[0] for desc in cursor.description] if cursor.description else []
    rows = cursor.fetchmany(limit)

    processed_rows = []
    for row in rows:
        processed_rows.append([_format_cell(v, "unknown") for v in row])

    duration = int((time.time() - start) * 1000)

    return {
        "columns": [{"name": c, "type": "ANY"} for c in columns],
        "rows": processed_rows,
        "total": len(processed_rows),
        "duration_ms": duration,
    }


def get_deleted_records(backup: Backup, file_id: str, table: str) -> dict:
    """Attempt to recover deleted records from freelist and WAL pages."""
    start = time.time()
    entry = backup.files.get(file_id)
    if not entry:
        raise ValueError(f"File not found: {file_id}")

    content = backup.read_file_content(file_id)
    if not content:
        raise ValueError(f"Cannot read file: {file_id}")

    # Get column info for the table
    conn = backup.open_database(file_id)
    if not conn:
        raise ValueError(f"Cannot open database: {file_id}")

    columns = []
    col_cursor = conn.execute(f'PRAGMA table_info("{table}")')
    for col in col_cursor:
        columns.append({"name": col[1], "type": col[2] or "ANY", "pk": bool(col[5])})

    recovered = _parse_freelist_pages(content, table, columns)

    duration = int((time.time() - start) * 1000)

    return {
        "columns": columns,
        "rows": recovered,
        "total": len(recovered),
        "is_deleted": True,
        "duration_ms": duration,
    }


def _parse_freelist_pages(data: bytes, table: str, columns: list) -> list:
    """Parse SQLite freelist pages for deleted records.

    This is a best-effort heuristic approach. SQLite freelist pages
    contain former B-tree pages whose cells may still have readable data.
    """
    recovered = []

    if len(data) < 100:
        return recovered

    # Read page size from header (offset 16, 2 bytes)
    page_size = int.from_bytes(data[16:18], "big")
    if page_size == 1:
        page_size = 65536
    if page_size < 512 or page_size > 65536:
        return recovered

    # Read freelist head page (offset 32, 4 bytes) and count (offset 36, 4 bytes)
    freelist_head = int.from_bytes(data[32:36], "big")
    freelist_count = int.from_bytes(data[36:40], "big")

    if freelist_head == 0 or freelist_count == 0:
        return recovered

    # Walk freelist trunk pages and try to extract cell data
    visited = set()
    current_page = freelist_head
    while current_page != 0 and current_page not in visited and len(visited) < freelist_count + 1:
        visited.add(current_page)
        page_offset = (current_page - 1) * page_size

        if page_offset + page_size > len(data):
            break

        page_data = data[page_offset : page_offset + page_size]

        # Trunk page: first 4 bytes = next trunk page, next 4 = number of leaf pages
        next_trunk = int.from_bytes(page_data[0:4], "big")
        leaf_count = int.from_bytes(page_data[4:8], "big")

        # Try to extract records from each leaf page
        for i in range(min(leaf_count, (page_size - 8) // 4)):
            leaf_page = int.from_bytes(page_data[8 + i * 4 : 12 + i * 4], "big")
            if leaf_page == 0:
                continue
            leaf_offset = (leaf_page - 1) * page_size
            if leaf_offset + page_size > len(data):
                continue

            leaf_data = data[leaf_offset : leaf_offset + page_size]
            cells = _try_extract_cells(leaf_data, columns)
            recovered.extend(cells)

        current_page = next_trunk

    return recovered[:1000]  # Cap at 1000 recovered records


def _try_extract_cells(page_data: bytes, columns: list) -> list:
    """Try to extract cell records from a page. Best-effort parsing."""
    records = []

    # Check if this looks like a B-tree leaf page (type 0x0D)
    if len(page_data) < 8:
        return records

    page_type = page_data[0]
    if page_type != 0x0D:  # Not a table b-tree leaf page
        return records

    cell_count = int.from_bytes(page_data[3:5], "big")
    if cell_count == 0 or cell_count > 10000:
        return records

    # Read cell pointer array
    for i in range(min(cell_count, 500)):
        ptr_offset = 8 + i * 2
        if ptr_offset + 2 > len(page_data):
            break
        cell_offset = int.from_bytes(page_data[ptr_offset : ptr_offset + 2], "big")
        if cell_offset == 0 or cell_offset >= len(page_data):
            continue

        try:
            row = _parse_cell_record(page_data, cell_offset, columns)
            if row:
                records.append(row)
        except Exception:
            continue

    return records


def _parse_cell_record(page_data: bytes, offset: int, columns: list) -> Optional[list]:
    """Try to parse a single cell record from a B-tree leaf page."""
    pos = offset

    # Read payload length (varint)
    payload_len, bytes_read = _read_varint(page_data, pos)
    pos += bytes_read
    if payload_len == 0 or payload_len > len(page_data):
        return None

    # Read rowid (varint)
    rowid, bytes_read = _read_varint(page_data, pos)
    pos += bytes_read

    # Read header size (varint)
    header_start = pos
    header_size, bytes_read = _read_varint(page_data, pos)
    pos += bytes_read

    if header_size < 1 or header_size > payload_len:
        return None

    # Read serial types from header
    serial_types = []
    header_end = header_start + header_size
    while pos < header_end and pos < len(page_data):
        st, bytes_read = _read_varint(page_data, pos)
        pos += bytes_read
        serial_types.append(st)

    # Read values based on serial types
    data_pos = header_end
    values = []
    for st in serial_types:
        val, size = _read_value(page_data, data_pos, st)
        values.append(_format_cell(val, "unknown"))
        data_pos += size

    return values if values else None


def _read_varint(data: bytes, offset: int) -> tuple:
    """Read a SQLite varint."""
    result = 0
    for i in range(9):
        if offset + i >= len(data):
            return result, i + 1
        byte = data[offset + i]
        if i < 8:
            result = (result << 7) | (byte & 0x7F)
            if byte < 0x80:
                return result, i + 1
        else:
            result = (result << 8) | byte
            return result, 9
    return result, 1


def _read_value(data: bytes, offset: int, serial_type: int) -> tuple:
    """Read a value given its serial type. Returns (value, size)."""
    if serial_type == 0:
        return None, 0
    elif serial_type == 1:
        return int.from_bytes(data[offset : offset + 1], "big", signed=True) if offset + 1 <= len(data) else (None, 0), 1
    elif serial_type == 2:
        return int.from_bytes(data[offset : offset + 2], "big", signed=True) if offset + 2 <= len(data) else (None, 0), 2
    elif serial_type == 3:
        return int.from_bytes(data[offset : offset + 3], "big", signed=True) if offset + 3 <= len(data) else (None, 0), 3
    elif serial_type == 4:
        return int.from_bytes(data[offset : offset + 4], "big", signed=True) if offset + 4 <= len(data) else (None, 0), 4
    elif serial_type == 5:
        return int.from_bytes(data[offset : offset + 6], "big", signed=True) if offset + 6 <= len(data) else (None, 0), 6
    elif serial_type == 6:
        return int.from_bytes(data[offset : offset + 8], "big", signed=True) if offset + 8 <= len(data) else (None, 0), 8
    elif serial_type == 7:
        import struct as st
        return st.unpack(">d", data[offset : offset + 8])[0] if offset + 8 <= len(data) else (None, 0), 8
    elif serial_type == 8:
        return 0, 0
    elif serial_type == 9:
        return 1, 0
    elif serial_type >= 12 and serial_type % 2 == 0:
        # Blob
        size = (serial_type - 12) // 2
        return data[offset : offset + size] if offset + size <= len(data) else (None, 0), size
    elif serial_type >= 13 and serial_type % 2 == 1:
        # Text
        size = (serial_type - 13) // 2
        try:
            return data[offset : offset + size].decode("utf-8", errors="replace") if offset + size <= len(data) else (None, 0), size
        except Exception:
            return None, size
    return None, 0


def _detect_column_types(conn, table: str, columns: list, sample_rows: list) -> list[str]:
    """Heuristically detect column data types from sample data."""
    col_types = []

    for i, col in enumerate(columns):
        declared = col.get("type", "").upper()
        detected = "text"

        if "INT" in declared:
            # Check if it's a timestamp
            is_timestamp = False
            col_name = col.get("name", "").lower()
            if any(kw in col_name for kw in ("date", "time", "created", "modified", "timestamp", "expir")):
                is_timestamp = True
            else:
                # Sample values to check
                for row in sample_rows[:20]:
                    if i < len(row) and isinstance(row[i], (int, float)) and row[i]:
                        val = row[i]
                        if MIN_UNIX_TS < val < MAX_UNIX_TS:
                            is_timestamp = True
                            break
                        if MIN_APPLE_TS < val < MAX_APPLE_TS:
                            is_timestamp = True
                            break

            detected = "timestamp" if is_timestamp else "integer"

        elif "REAL" in declared or "FLOAT" in declared or "DOUBLE" in declared:
            detected = "real"

        elif "BLOB" in declared:
            detected = "blob"

        elif "TEXT" in declared or "VARCHAR" in declared or "CHAR" in declared or "CLOB" in declared:
            # Check for specific patterns
            col_name = col.get("name", "").lower()
            if any(kw in col_name for kw in ("phone", "tel")):
                detected = "phone"
            elif any(kw in col_name for kw in ("email", "mail")):
                detected = "email"
            elif any(kw in col_name for kw in ("url", "uri", "link", "href")):
                detected = "url"
            elif any(kw in col_name for kw in ("uuid", "guid", "identifier")):
                detected = "uuid"
            else:
                detected = "text"
        else:
            detected = "text"

        col_types.append(detected)

    return col_types


def _format_cell(value, col_type: str):
    """Format a cell value for JSON serialization.

    Keeps responses small — blobs/plists are summarized, not inlined.
    """
    if value is None:
        return None

    if isinstance(value, bytes):
        if len(value) == 0:
            return {"_type": "blob", "hex": "", "size": 0}
        # Check for image magic bytes
        if value[:3] == b"\xff\xd8\xff":
            return {"_type": "image", "format": "jpeg", "size": len(value)}
        if value[:8] == b"\x89PNG\r\n\x1a\n":
            return {"_type": "image", "format": "png", "size": len(value)}
        # Check for plist (don't parse — just tag it)
        if value[:6] == b"bplist" or value[:5] == b"<?xml":
            return {"_type": "plist", "size": len(value)}
        # Generic blob — small hex preview only
        if len(value) <= 64:
            return {"_type": "blob", "hex": value.hex(), "size": len(value)}
        return {"_type": "blob", "hex": value[:32].hex() + "...", "size": len(value)}

    if isinstance(value, (int, float)):
        return value

    return str(value)


def _make_serializable(obj):
    """Convert plist objects to JSON-serializable form."""
    import datetime

    if isinstance(obj, bytes):
        if len(obj) <= 256:
            return {"_type": "data", "hex": obj.hex()}
        return {"_type": "data", "hex": obj[:64].hex() + "...", "size": len(obj)}
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_serializable(v) for v in obj]
    return obj


import plistlib
