# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in OpenExplore, please report it
responsibly. **Do not open a public GitHub issue.**

### How to Report

1. Email: charleswest775@users.noreply.github.com
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- Acknowledgment within 48 hours
- Status update within 7 days
- Fix timeline based on severity

### Scope

This project handles sensitive data (iPhone backup contents including messages,
contacts, photos, call history). Security issues we care about include:

- **Data leakage**: Backup data exposed outside the local session
- **Injection attacks**: SQL injection via the query interface
- **Path traversal**: Accessing files outside the backup directory
- **Credential exposure**: Backup passwords logged or persisted to disk
- **Temp file cleanup**: Decrypted data not properly cleaned up

### Design Principles

- Backup passwords are held in memory only, never written to disk
- All SQLite connections use `PRAGMA query_only = ON`
- Write statements are blocked at both application and database levels
- Temp files are cleaned up on session close and via `atexit` handlers
- The server binds to `localhost` only — no network exposure by default

## Thank You

We appreciate responsible disclosure and will credit reporters (with permission)
in release notes.
