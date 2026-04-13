"""Encryption support: keybag parsing, key derivation, file decryption."""

import hashlib
import struct
from typing import Optional


class KeyBag:
    """Parse and manage iOS backup keybag for decryption."""

    WRAP_PASSCODE = 2
    CLASSKEY_TAGS = {b"CLAS", b"WRAP", b"WPKY", b"KTYP", b"PBKY"}

    def __init__(self, data: bytes):
        self.attrs: dict[bytes, bytes] = {}
        self.class_keys: dict[int, dict] = {}
        self.wrap_type = 0
        self._parse(data)

    def _parse(self, data: bytes):
        """Parse the binary keybag TLV structure."""
        current_class: Optional[dict] = None
        pos = 0

        while pos + 8 <= len(data):
            tag = data[pos : pos + 4]
            length = struct.unpack(">I", data[pos + 4 : pos + 8])[0]
            value = data[pos + 8 : pos + 8 + length]
            pos += 8 + length

            if tag == b"UUID":
                if current_class:
                    clas = current_class.get("CLAS", 0)
                    if clas:
                        self.class_keys[clas] = current_class
                current_class = {"UUID": value}
            elif tag == b"CLAS":
                if current_class is not None:
                    current_class["CLAS"] = struct.unpack(">I", value)[0]
            elif tag == b"WRAP":
                if current_class is not None:
                    current_class["WRAP"] = struct.unpack(">I", value)[0]
                else:
                    self.wrap_type = struct.unpack(">I", value)[0]
            elif tag == b"WPKY":
                if current_class is not None:
                    current_class["WPKY"] = value
            elif tag == b"SALT":
                self.attrs[b"SALT"] = value
            elif tag == b"ITER":
                self.attrs[b"ITER"] = value
            elif tag == b"DPWT":
                self.attrs[b"DPWT"] = value
            elif tag == b"DPIC":
                self.attrs[b"DPIC"] = value
            elif tag == b"DPSL":
                self.attrs[b"DPSL"] = value
            else:
                if current_class is not None:
                    current_class[tag.decode("ascii", errors="replace")] = value
                else:
                    self.attrs[tag] = value

        if current_class:
            clas = current_class.get("CLAS", 0)
            if clas:
                self.class_keys[clas] = current_class

    def unlock_with_password(self, password: str):
        """Derive keys from the backup password and unwrap class keys."""
        salt = self.attrs.get(b"SALT", b"")
        iterations = struct.unpack(">I", self.attrs.get(b"ITER", b"\x00\x00\x27\x10"))[0]

        # Double-protection password derivation (iOS 10.2+)
        dpsl = self.attrs.get(b"DPSL")
        dpic = self.attrs.get(b"DPIC")

        password_bytes = password.encode("utf-8")

        if dpsl and dpic:
            dpic_count = struct.unpack(">I", dpic)[0]
            password_key = hashlib.pbkdf2_hmac(
                "sha256", password_bytes, dpsl, dpic_count, dklen=32
            )
            derived_key = hashlib.pbkdf2_hmac(
                "sha1", password_key, salt, iterations, dklen=32
            )
        else:
            derived_key = hashlib.pbkdf2_hmac(
                "sha1", password_bytes, salt, iterations, dklen=32
            )

        self._unwrap_class_keys(derived_key)

    def _unwrap_class_keys(self, key: bytes):
        """AES key unwrap (RFC 3394) each class key."""
        for clas, ck in self.class_keys.items():
            wpky = ck.get("WPKY")
            wrap = ck.get("WRAP", 0)
            if wpky and (wrap & self.WRAP_PASSCODE):
                try:
                    unwrapped = aes_key_unwrap(key, wpky)
                    ck["KEY"] = unwrapped
                except Exception:
                    pass

    def get_class_key(self, protection_class: int) -> Optional[bytes]:
        """Get the unwrapped key for a protection class."""
        ck = self.class_keys.get(protection_class)
        if ck:
            return ck.get("KEY")
        return None


def aes_key_unwrap(kek: bytes, wrapped: bytes) -> bytes:
    """AES Key Unwrap per RFC 3394."""
    try:
        from Crypto.Cipher import AES
    except ImportError:
        raise ImportError("pycryptodome is required for encrypted backup support")

    n = len(wrapped) // 8 - 1
    if n < 1:
        raise ValueError("Invalid wrapped key length")

    # Initialize
    a = bytearray(wrapped[:8])
    r = [bytearray(wrapped[i * 8 : (i + 1) * 8]) for i in range(1, n + 1)]

    cipher = AES.new(kek, AES.MODE_ECB)

    for j in range(5, -1, -1):
        for i in range(n, 0, -1):
            t = n * j + i
            t_bytes = struct.pack(">Q", t)
            a_xor = bytearray(a[k] ^ t_bytes[k] for k in range(8))
            block = cipher.decrypt(bytes(a_xor + r[i - 1]))
            a = bytearray(block[:8])
            r[i - 1] = bytearray(block[8:])

    # Check integrity: A should be the default IV
    if a != bytearray(b"\xa6" * 8):
        raise ValueError("AES key unwrap failed — wrong password or corrupted keybag")

    return b"".join(bytes(x) for x in r)


def decrypt_file_content(
    data: bytes,
    encryption_key: bytes,
    protection_class: int,
    keybag: KeyBag,
) -> Optional[bytes]:
    """Decrypt a file's content using its per-file key and the keybag."""
    try:
        from Crypto.Cipher import AES
    except ImportError:
        return None

    # Extract the per-file key
    if len(encryption_key) < 8:
        return None

    # The encryption key blob has a 4-byte class prefix (little-endian)
    file_protection_class = struct.unpack("<I", encryption_key[:4])[0]
    file_key = encryption_key[4:]

    class_key = keybag.get_class_key(file_protection_class)
    if class_key is None:
        return None

    # Unwrap the per-file key
    try:
        unwrapped_key = aes_key_unwrap(class_key, file_key)
    except Exception:
        return None

    # Decrypt the file content (AES-256-CBC with zero IV)
    if len(unwrapped_key) < 32:
        return None

    cipher = AES.new(unwrapped_key[:32], AES.MODE_CBC, iv=b"\x00" * 16)
    decrypted = cipher.decrypt(data)

    # Remove PKCS7 padding
    if decrypted:
        pad_len = decrypted[-1]
        if 0 < pad_len <= 16:
            decrypted = decrypted[:-pad_len]

    return decrypted
