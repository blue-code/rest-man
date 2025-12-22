# RestMan

Desktop API client built with Tauri (Rust) and React (Vite). It imports OpenAPI specs and lets you send requests with prefilled parameters and body examples.

## Requirements
- Node.js + npm
- Rust toolchain (cargo)
- Tauri prerequisites for your OS (see Tauri docs)

## Quick Start
```bash
npm run install:webui
npm run tauri:dev
```

Windows shortcut:
```bat
run-dev.bat
```

## Key Commands
From repo root:
- `npm run install:webui` install frontend dependencies.
- `npm run tauri:dev` run the desktop app in dev mode.
- `npm run tauri:build` build a production desktop bundle.

From `webui/`:
- `npm run dev` start the Vite dev server.
- `npm run build` type-check and build the web UI.

From `src-tauri/`:
- `cargo build` build the Rust backend.
- `cargo test` run Rust tests.

## OpenAPI Import
Use the left sidebar input to paste a public OpenAPI JSON URL. The app extracts parameters, request bodies, and examples when available.

## Project Structure
- `webui/` React UI (Vite), main UI in `webui/src/App.tsx`.
- `src-tauri/` Rust commands and Tauri wrapper.
- `run-dev.bat` one-click dev runner on Windows.

## Notes
- Request/response history is stored in `localStorage`.
- Output formatting assumes JSON when possible.
