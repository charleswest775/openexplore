# OpenExplore

[![CI](https://github.com/charleswest775/openexplore/actions/workflows/ci.yml/badge.svg)](https://github.com/charleswest775/openexplore/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)

**Tools to explore and analyze iPhone backup datasets.**

A web-based tool for opening, browsing, and querying the contents of iPhone backups — encrypted or unencrypted. Built to support development efforts where you need to understand backup structures, validate results from other backup readers, and explore the raw data.

## Features

- **Backup Discovery** — Auto-detects iPhone backups on your system
- **Full Encryption Support** — Decrypts encrypted backups with password (PBKDF2 + AES-CBC)
- **SQLite Explorer** — Browse tables, view schemas, run custom SQL queries against any database in the backup
- **Plist Viewer** — Parse and display property list files as navigable trees
- **File Catalog** — Browse all files organized by domain with search and filtering
- **Known Database Highlights** — Quick access to Messages, Contacts, Call History, Photos, Notes, Safari, and more

## Quick Start

```bash
# Clone
git clone https://github.com/charleswest775/openexplore.git
cd openexplore

# Setup
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# Windows: .venv\Scripts\activate

# Install
pip install -r requirements.txt

# Run
python run.py
```

Then open `http://localhost:5000` in your browser.

## Development

```bash
# Install dev dependencies
pip install -r requirements-dev.txt

# Run tests
pytest tests/ -v

# Lint
ruff check openexplore/

# Format check
ruff format --check openexplore/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full development guidelines.

## Security

This tool handles sensitive data. Key security measures:

- Backup passwords are held in memory only, never persisted to disk
- All SQLite access is read-only (`PRAGMA query_only = ON`)
- Server binds to localhost only — no network exposure
- Temp files are cleaned up on session close

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE) — Copyright (c) 2026 Charles West

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) first.
