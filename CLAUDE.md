# CLAUDE.md — OpenExplore

## What is this project?

OpenExplore is a cross-platform Electron desktop app for exploring and analyzing iPhone backups. Users point it at an iTunes/Finder backup directory and it discovers every SQLite database, plist, and structured data source inside — with full encryption support.

## Architecture

```
Renderer (React/Vite) ←→ Preload (context bridge) ←→ Main (Electron) ←→ Python Sidecar (JSON-RPC over stdin/stdout)
```

- **Renderer** (`src/renderer/`): React 18 + TypeScript + Zustand + Vite. Screens: Welcome, Dashboard, Explorer, Search, Plist, Export.
- **Main** (`src/main/`): Electron main process. IPC bridge, sidecar lifecycle, native dialogs, electron-store persistence.
- **Preload** (`src/preload/`): Context bridge exposing `window.api` with RPC, dialogs, store, and menu events.
- **Python sidecar** (`python-sidecar/`): JSON-RPC 2.0 server over stdin/stdout. Handles backup parsing, encryption, SQLite queries, exports.

## Quick reference

```bash
npm install                          # Node deps
python3 -m venv .venv && source .venv/bin/activate && pip install -r python-sidecar/requirements.txt  # Python deps (venv MUST be at project root .venv/)

npm run dev                          # Full dev (builds main+preload, runs Vite + Electron)
npm run build                        # Production build (main + preload + renderer)
npm run package                      # Build + electron-builder (DMG/NSIS/AppImage)
npm run typecheck                    # tsc --noEmit on all tsconfigs
npm run lint                         # ESLint
```

## Project structure

```
src/main/              Electron main process (CommonJS, compiled to dist/main/)
  index.ts             Window, IPC handlers, sidecar setup, electron-store
  sidecar.ts           SidecarManager: spawn Python, JSON-RPC bridge, request tracking
  menu.ts              Application menu
src/preload/           Context bridge (CommonJS, compiled to dist/preload/)
  index.ts             Exposes window.api (rpc, dialogs, store, menu events)
src/renderer/          React UI (ESNext, Vite bundles to dist/renderer/)
  src/store/index.ts   Zustand store (all app state)
  src/hooks/useRPC.ts  RPC wrapper that updates store
  src/screens/         Full-screen views (Welcome, Dashboard, Explorer, Search, Plist, Export)
  src/components/      DataGrid, SchemaTree, FileTree, SQLEditor, RecordDetail, etc.
  src/types/index.ts   Shared TypeScript types
  src/utils/format.ts  Cell formatting (blobs, images, dates)
  vite.config.ts       Vite config (port 5173, @/ alias, output to ../../dist/renderer/)
python-sidecar/
  main.py              Entry point
  openexplore/
    rpc_server.py      JSON-RPC handler, all RPC methods
    backup.py          Backup class: open, validate, parse manifests, file I/O, DB connections
    database.py        Database discovery, schema extraction, querying, search, export
    crypto.py          KeyBag parsing, PBKDF2 key derivation, AES key unwrap, file decryption
```

## Critical gotchas

### app.getAppPath() returns `dist/main` in dev mode
When running `electron dist/main/index.js`, `app.getAppPath()` returns the entry script directory, NOT the project root. Resolve with:
```typescript
const projectRoot = path.resolve(app.getAppPath(), '..', '..');
```

### SQLite URI mode fails on macOS temp files
`sqlite3.connect("file:/var/folders/.../tmp.db?mode=ro", uri=True)` fails with "unable to open database file" on macOS. For decrypted temp files, use regular `sqlite3.connect(path)` instead. Keep URI mode only for on-disk backup files (where read-only matters).

### Zustand selector pattern — avoid infinite render loops
```typescript
// BAD: returns new object every state change, breaks useEffect deps
const store = useAppStore();

// GOOD: individual selectors return stable references
const setIsLoading = useAppStore((s) => s.setIsLoading);
```
All `useCallback` functions in `useRPC.ts` must depend on individual setters, never the whole store.

### Python venv must be at project root `.venv/`
The sidecar manager looks for `.venv/bin/python` (or `.venv/Scripts/python.exe`) relative to the project root. Not inside `python-sidecar/`.

### dev script must build preload
The `dev` script builds both main and preload before starting. Without `build:preload`, Electron fails with "unable to load preload script".

## RPC methods

All called via `window.api.rpc(method, params)` → preload → main → sidecar.

| Method | Params | Returns |
|---|---|---|
| `ping` | — | `{status, version}` |
| `backup.open` | `{path, password?}` | BackupInfo |
| `backup.close` | — | `{status}` |
| `backup.getDatabases` | — | `{databases: DatabaseInfo[]}` |
| `backup.getFileTree` | — | `{tree: FileTreeNode[]}` |
| `backup.getTableData` | `{fileId, table, offset?, limit?, orderBy?, orderDir?}` | TableData |
| `backup.searchTable` | `{fileId, table, query, columns?}` | TableData |
| `backup.searchGlobal` | `{query}` | `{results: GlobalSearchResult[]}` |
| `backup.executeSQL` | `{fileId, sql}` | TableData |
| `backup.exportTable` | `{fileId, table, format, outputDir}` | `{path}` |
| `backup.getDeletedRecords` | `{fileId, table}` | TableData |
| `backup.getFileContent` | `{fileId}` | FileContent |
| `backup.getPlistContent` | `{fileId}` | parsed plist data |

## Encryption flow

1. Parse `Manifest.plist` → extract `BackupKeyBag` (TLV binary)
2. `KeyBag.unlock_with_password()` → PBKDF2-SHA256 (double-protection, iOS 10.2+) then PBKDF2-SHA1
3. Unwrap each class key via AES Key Unwrap (RFC 3394)
4. Decrypt `Manifest.db` with class key → AES-256-CBC, zero IV, PKCS7 padding
5. Per-file decryption: unwrap per-file key from class key, then AES-256-CBC

## Code conventions

- TypeScript strict mode everywhere. Three separate tsconfigs (main=CommonJS, preload=CommonJS, renderer=ESNext).
- Renderer imports use `@/` path alias (Vite + tsconfig).
- Components: PascalCase. Hooks: `useX`. Screens: `XScreen.tsx`.
- Python: dataclasses for data, classes for stateful objects, type hints throughout.
- All SQLite access is read-only (`PRAGMA query_only = ON`). Backup data is never modified.
- No test framework currently. Validate with `npm run typecheck && npm run lint`.

## Performance notes

- Database discovery deliberately skips `COUNT(*)` — uses `max(rowid)` for O(1) row count estimates.
- Table data loaded in 100-row pages with optional server-side sorting.
- Decrypted database connections are cached per `file_id` in `Backup._db_cache`.
- `discover_databases()` result is cached after first call per backup session.
- React Window used for virtualizing large data grids.
