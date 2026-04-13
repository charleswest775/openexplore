"""Backup ingestion: open, validate, parse manifests, build file trees."""

import os
import plistlib
import sqlite3
import struct
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .crypto import KeyBag, decrypt_file_content


@dataclass
class DeviceInfo:
    device_name: str = ""
    model: str = ""
    ios_version: str = ""
    serial_number: str = ""
    imei: str = ""
    phone_number: str = ""
    last_backup_date: str = ""
    iccid: str = ""


@dataclass
class BackupStatus:
    is_full: bool = False
    snapshot_state: str = ""
    backup_date: str = ""


@dataclass
class FileEntry:
    file_id: str
    domain: str
    relative_path: str
    flags: int  # 1=file, 2=directory, 4=symlink
    size: int = 0
    birth_date: str = ""
    modified_date: str = ""
    protection_class: int = 0
    encryption_key: Optional[bytes] = None


@dataclass
class FileTreeNode:
    name: str
    path: str
    is_directory: bool
    file_id: Optional[str] = None
    size: int = 0
    domain: str = ""
    children: list = field(default_factory=list)
    file_type: str = ""  # "database", "plist", "image", "other"


class Backup:
    """Represents an opened iPhone backup."""

    def __init__(self, path: str):
        self.path = Path(path)
        self.is_encrypted = False
        self.device_info = DeviceInfo()
        self.backup_status = BackupStatus()
        self.files: dict[str, FileEntry] = {}
        self.keybag: Optional[KeyBag] = None
        self._manifest_db: Optional[sqlite3.Connection] = None
        self._db_cache: dict[str, sqlite3.Connection] = {}

    def open(self, password: Optional[str] = None) -> dict:
        """Open and validate a backup directory. Returns backup info."""
        self._validate_structure()
        self._parse_info_plist()
        self._parse_status_plist()
        self._parse_manifest_plist(password)
        self._parse_manifest_db()
        return self.get_info()

    def _validate_structure(self):
        """Check that required files exist."""
        required = ["Manifest.db", "Manifest.plist", "Info.plist"]
        for f in required:
            if not (self.path / f).exists():
                raise ValueError(f"Missing required file: {f} — not a valid iPhone backup")

    def _parse_info_plist(self):
        """Extract device metadata from Info.plist."""
        with open(self.path / "Info.plist", "rb") as f:
            info = plistlib.load(f)

        self.device_info = DeviceInfo(
            device_name=info.get("Device Name", ""),
            model=info.get("Product Type", ""),
            ios_version=info.get("Product Version", ""),
            serial_number=info.get("Serial Number", ""),
            imei=info.get("IMEI", ""),
            phone_number=info.get("Phone Number", ""),
            last_backup_date=str(info.get("Last Backup Date", "")),
            iccid=info.get("ICCID", ""),
        )

    def _parse_status_plist(self):
        """Parse Status.plist for backup status."""
        status_path = self.path / "Status.plist"
        if not status_path.exists():
            return

        with open(status_path, "rb") as f:
            status = plistlib.load(f)

        self.backup_status = BackupStatus(
            is_full=status.get("IsFullBackup", False),
            snapshot_state=str(status.get("SnapshotState", "")),
            backup_date=str(status.get("Date", "")),
        )

    def _parse_manifest_plist(self, password: Optional[str] = None):
        """Parse Manifest.plist to detect encryption and extract keybag."""
        with open(self.path / "Manifest.plist", "rb") as f:
            manifest = plistlib.load(f)

        self.is_encrypted = manifest.get("IsEncrypted", False)

        if self.is_encrypted:
            if not password:
                raise ValueError("Backup is encrypted — password required")
            keybag_data = manifest.get("BackupKeyBag")
            if not keybag_data:
                raise ValueError("Encrypted backup but no BackupKeyBag found in Manifest.plist")
            manifest_key = manifest.get("ManifestKey")
            self.keybag = KeyBag(keybag_data)
            self.keybag.unlock_with_password(password)
            if manifest_key:
                self._decrypt_manifest_db(manifest_key)

    def _decrypt_manifest_db(self, manifest_key: bytes):
        """Decrypt Manifest.db for encrypted backups."""
        from Crypto.Cipher import AES
        from .crypto import aes_key_unwrap

        protection_class = struct.unpack("<I", manifest_key[:4])[0]
        wrapped_key = manifest_key[4:]

        class_key = self.keybag.get_class_key(protection_class)
        if class_key is None:
            raise ValueError(f"Cannot find class key for protection class {protection_class}")

        # Unwrap the manifest DB key using AES Key Wrap (RFC 3394)
        db_key = aes_key_unwrap(class_key, wrapped_key)

        # Read the encrypted Manifest.db
        encrypted_db_path = self.path / "Manifest.db"
        with open(encrypted_db_path, "rb") as f:
            encrypted_data = f.read()

        # Decrypt with AES-256-CBC, zero IV
        cipher = AES.new(db_key[:32], AES.MODE_CBC, iv=b"\x00" * 16)
        decrypted_data = cipher.decrypt(encrypted_data)

        # Remove PKCS7 padding if present
        if decrypted_data:
            pad_len = decrypted_data[-1]
            if 0 < pad_len <= 16 and all(b == pad_len for b in decrypted_data[-pad_len:]):
                decrypted_data = decrypted_data[:-pad_len]

        import tempfile
        self._decrypted_manifest_path = tempfile.NamedTemporaryFile(
            suffix=".db", delete=False
        )
        self._decrypted_manifest_path.write(decrypted_data)
        self._decrypted_manifest_path.close()

    def _parse_manifest_db(self):
        """Open Manifest.db and build the file map."""
        db_path = self.path / "Manifest.db"
        if hasattr(self, "_decrypted_manifest_path"):
            db_path = self._decrypted_manifest_path.name

        self._manifest_db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        self._manifest_db.execute("PRAGMA query_only = ON")

        cursor = self._manifest_db.execute(
            "SELECT fileID, domain, relativePath, flags, file FROM Files"
        )

        for row in cursor:
            file_id, domain, relative_path, flags, file_blob = row
            entry = FileEntry(
                file_id=file_id,
                domain=domain or "",
                relative_path=relative_path or "",
                flags=flags or 1,
            )

            if file_blob:
                self._parse_file_metadata(entry, file_blob)

            self.files[file_id] = entry

    def _parse_file_metadata(self, entry: FileEntry, file_blob: bytes):
        """Parse the file metadata blob (NSKeyedArchiver plist)."""
        try:
            meta = plistlib.loads(file_blob)
        except Exception:
            return

        # NSKeyedArchiver format — the actual data is in $objects
        objects = meta.get("$objects")
        if isinstance(objects, list) and len(objects) > 1:
            obj = objects[1] if isinstance(objects[1], dict) else {}
            entry.size = obj.get("Size", 0) or 0
            entry.protection_class = obj.get("ProtectionClass", 0) or 0

            birth = obj.get("Birth")
            if birth:
                entry.birth_date = str(birth)
            modified = obj.get("LastModified")
            if modified:
                entry.modified_date = str(modified)

            # EncryptionKey is a reference index into $objects
            enc_key_ref = obj.get("EncryptionKey")
            if isinstance(enc_key_ref, plistlib.UID):
                enc_key_ref = enc_key_ref.data
            if isinstance(enc_key_ref, int) and 0 < enc_key_ref < len(objects):
                key_obj = objects[enc_key_ref]
                if isinstance(key_obj, dict):
                    ns_data = key_obj.get("NS.data")
                    if isinstance(ns_data, bytes) and len(ns_data) > 4:
                        entry.encryption_key = ns_data
                elif isinstance(key_obj, bytes) and len(key_obj) > 4:
                    entry.encryption_key = key_obj
        else:
            # Flat plist format (older backups)
            entry.size = meta.get("Size", 0) or 0
            entry.protection_class = meta.get("ProtectionClass", 0) or 0
            birth = meta.get("Birth", "")
            if birth:
                entry.birth_date = str(birth)
            modified = meta.get("LastModified", "")
            if modified:
                entry.modified_date = str(modified)
            enc_key = meta.get("EncryptionKey")
            if isinstance(enc_key, bytes) and len(enc_key) > 4:
                entry.encryption_key = enc_key

    def get_info(self) -> dict:
        """Return backup info as a serializable dict."""
        total_size = sum(f.size for f in self.files.values())
        file_count = sum(1 for f in self.files.values() if f.flags == 1)

        # Count likely databases by extension (fast, no I/O)
        db_extensions = {".db", ".sqlite", ".sqlitedb"}
        db_count_hint = sum(
            1 for f in self.files.values()
            if f.flags == 1 and any(f.relative_path.lower().endswith(ext) for ext in db_extensions)
        )

        return {
            "path": str(self.path),
            "is_encrypted": self.is_encrypted,
            "device": {
                "name": self.device_info.device_name,
                "model": self.device_info.model,
                "ios_version": self.device_info.ios_version,
                "serial_number": self.device_info.serial_number,
                "imei": self.device_info.imei,
                "phone_number": self.device_info.phone_number,
                "last_backup_date": self.device_info.last_backup_date,
                "iccid": self.device_info.iccid,
            },
            "status": {
                "is_full": self.backup_status.is_full,
                "snapshot_state": self.backup_status.snapshot_state,
                "date": self.backup_status.backup_date,
            },
            "stats": {
                "total_files": file_count,
                "total_size": total_size,
                "database_count_hint": db_count_hint,
            },
        }

    def get_file_tree(self) -> list[dict]:
        """Build and return the virtual filesystem tree."""
        root: dict[str, FileTreeNode] = {}

        for entry in self.files.values():
            domain = entry.domain or "Unknown"
            full_path = f"{domain}/{entry.relative_path}" if entry.relative_path else domain

            parts = full_path.split("/")
            current_dict = root

            for i, part in enumerate(parts[:-1]):
                path_so_far = "/".join(parts[: i + 1])
                if part not in current_dict:
                    node = FileTreeNode(
                        name=part,
                        path=path_so_far,
                        is_directory=True,
                        domain=domain,
                    )
                    current_dict[part] = {"_node": node, "_children": {}}
                current_dict = current_dict[part]["_children"]

            leaf_name = parts[-1] if parts[-1] else domain
            file_type = self._detect_file_type(entry)
            node = FileTreeNode(
                name=leaf_name,
                path=full_path,
                is_directory=entry.flags == 2,
                file_id=entry.file_id,
                size=entry.size,
                domain=domain,
                file_type=file_type,
            )
            current_dict[leaf_name] = {"_node": node, "_children": {}}

        def _dict_to_list(d: dict) -> list[dict]:
            result = []
            for key, val in sorted(d.items()):
                if key.startswith("_"):
                    continue
                node: FileTreeNode = val["_node"]
                children = _dict_to_list(val["_children"])
                result.append({
                    "name": node.name,
                    "path": node.path,
                    "isDirectory": node.is_directory,
                    "fileId": node.file_id,
                    "size": node.size,
                    "domain": node.domain,
                    "fileType": node.file_type,
                    "children": children,
                })
            return result

        return _dict_to_list(root)

    def _detect_file_type(self, entry: FileEntry) -> str:
        """Detect file type from extension and magic bytes."""
        rp = entry.relative_path.lower()
        if rp.endswith((".db", ".sqlite", ".sqlitedb")):
            return "database"
        if rp.endswith((".plist",)):
            return "plist"
        if rp.endswith((".jpg", ".jpeg", ".png", ".gif", ".heic")):
            return "image"
        return "other"

    def _get_file_path_on_disk(self, file_id: str) -> Optional[Path]:
        """Get the actual file path on disk for a file ID."""
        # iTunes stores files as hash[0:2]/hash
        subdir = file_id[:2]
        file_path = self.path / subdir / file_id
        if file_path.exists():
            return file_path
        # Some backups store files flat
        flat_path = self.path / file_id
        if flat_path.exists():
            return flat_path
        return None

    def _read_file_header(self, file_id: str, num_bytes: int) -> Optional[bytes]:
        """Read the first N bytes of a file, decrypting if needed."""
        file_path = self._get_file_path_on_disk(file_id)
        if not file_path:
            return None

        try:
            with open(file_path, "rb") as f:
                data = f.read(max(num_bytes, 4096))  # Read at least 4K for decryption
        except (OSError, IOError):
            return None

        entry = self.files.get(file_id)
        if entry and entry.encryption_key and self.keybag:
            data = decrypt_file_content(data, entry.encryption_key, entry.protection_class, self.keybag)
            if data is None:
                return None

        return data[:num_bytes]

    def read_file_content(self, file_id: str) -> Optional[bytes]:
        """Read the full content of a file, decrypting if needed."""
        file_path = self._get_file_path_on_disk(file_id)
        if not file_path:
            return None

        try:
            with open(file_path, "rb") as f:
                data = f.read()
        except (OSError, IOError):
            return None

        entry = self.files.get(file_id)
        if entry and entry.encryption_key and self.keybag:
            data = decrypt_file_content(data, entry.encryption_key, entry.protection_class, self.keybag)

        return data

    def open_database(self, file_id: str) -> Optional[sqlite3.Connection]:
        """Open a SQLite database from the backup, with caching."""
        if file_id in self._db_cache:
            return self._db_cache[file_id]

        entry = self.files.get(file_id)
        if not entry:
            return None

        if self.is_encrypted and entry.encryption_key:
            # Decrypt to a temp file
            content = self.read_file_content(file_id)
            if not content:
                return None

            import tempfile
            tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
            tmp.write(content)
            tmp.close()
            db_path = tmp.name
        else:
            file_path = self._get_file_path_on_disk(file_id)
            if not file_path:
                return None
            db_path = str(file_path)

        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            conn.execute("PRAGMA query_only = ON")
            # Verify it's a valid DB
            conn.execute("SELECT name FROM sqlite_master LIMIT 1")
            self._db_cache[file_id] = conn
            return conn
        except sqlite3.Error:
            return None

    def close(self):
        """Clean up resources."""
        for conn in self._db_cache.values():
            try:
                conn.close()
            except Exception:
                pass
        self._db_cache.clear()

        if self._manifest_db:
            try:
                self._manifest_db.close()
            except Exception:
                pass

        # Clean up temp files
        if hasattr(self, "_decrypted_manifest_path"):
            try:
                os.unlink(self._decrypted_manifest_path.name)
            except Exception:
                pass
