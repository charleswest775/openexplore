# OpenExplore

[![CI](https://github.com/charleswest775/openexplore/actions/workflows/ci.yml/badge.svg)](https://github.com/charleswest775/openexplore/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A cross-platform desktop app to explore and analyze iPhone backups.**

Point it at an iTunes/Finder backup directory, and it dynamically discovers every database, plist, and structured data source inside — then lets you browse schemas, preview data, search across tables, and export what you find.

## Features

- **Backup Discovery** — Auto-detects iPhone backups on macOS and Windows
- **Full Encryption Support** — Decrypts encrypted backups with password (PBKDF2 + AES-256-CBC keybag)
- **Dynamic Database Discovery** — Finds every SQLite database via magic byte detection, extracts full schemas
- **Semantic Labeling** — Recognizes Messages, Contacts, Photos, Notes, Safari, Health, and 20+ known databases
- **Smart Data Grid** — Virtualized table viewer with timestamp detection, blob previews, phone number formatting
- **Plist Viewer** — Browse property lists as navigable trees with search
- **SQL Query Editor** — Execute raw SQL against any discovered database
- **Global Search** — Search across all tables in all databases simultaneously
- **Deleted Record Recovery** — Parse SQLite freelist pages for deleted rows
- **Export Manager** — Bulk export tables to CSV, JSON, or standalone SQLite files
- **Virtual File Tree** — Browse the complete reconstructed backup filesystem

## Architecture

- **Frontend**: Electron + React + TypeScript
- **Backend**: Python sidecar (JSON-RPC over stdin/stdout) for backup parsing and data processing
- **Communication**: JSON-RPC 2.0 bridge between Electron main process and Python

## Quick Start

```bash
# Clone
git clone https://github.com/charleswest775/openexplore.git
cd openexplore

# Install Node dependencies
npm install

# Set up Python sidecar
cd python-sidecar
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Run in development
npm run dev
```

## Development

```bash
# TypeScript type checking
npm run typecheck

# Lint
npm run lint

# Build for production
npm run build

# Package for distribution
npm run package
```

## Packaging the Python Sidecar

```bash
cd python-sidecar
pip install pyinstaller
pyinstaller --onefile --name openexplore main.py
```

The bundled executable will be in `python-sidecar/dist/`.

## Security

- Backup passwords are held in memory only, never persisted to disk
- All SQLite access is read-only (`PRAGMA query_only = ON`)
- The Python sidecar communicates only via stdin/stdout (no network exposure)
- Decrypted content is never written to disk (memory-only, except temp files for SQLite)

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE) — Copyright (c) 2026 Charles West
