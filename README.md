# RestMan

RestMan is a desktop API client built with Tauri (Rust) and React (Vite). It imports OpenAPI specs, turns them into grouped endpoints, and lets you send requests with prefilled parameters and body examples. It also keeps a local request history and supports automatic polling for selected endpoints.

## Highlights
- OpenAPI-driven collections grouped by tag with per-collection sync toggles.
- Request builder with path, query, and header parameter inputs.
- Query DTO expansion: query parameters defined as a schema ref are expanded into individual inputs.
- Enum-aware parameters render as select inputs with fixed choices.
- Body support for JSON, multipart form-data (with file picker), and x-www-form-urlencoded.
- Response viewer with status, headers, JSON tree view, and one-click body copy.
- Request history with preview and reuse.
- Background OpenAPI refresh using ETag caching.

## Project Layout
- `webui/` React + Vite frontend
  - entry: `webui/src/main.tsx`
  - main UI: `webui/src/App.tsx`
  - components: `webui/src/components/*`
  - styles: `webui/src/*.css`
- `src-tauri/` Rust backend and Tauri wrapper
  - commands: `src-tauri/src/main.rs`
  - config: `src-tauri/tauri.conf.json`
- Assets: `src-tauri/icons/`
- Build output: `webui/dist/` and `src-tauri/target/`

## Requirements
- Node.js + npm
- Rust toolchain (cargo)
- Tauri prerequisites for your OS (see Tauri docs)

## Setup
From repo root:
```bash
npm run install:webui
```

## Development
Run the full desktop app (uses the local webui dev server):
```bash
npm run tauri:dev
```

Windows shortcut:
```bat
run-dev.bat
```

UI-only dev server:
```bash
cd webui
npm run dev
```

## Build
Desktop build:
```bash
npm run tauri:build
```

Web bundle only:
```bash
cd webui
npm run build
```

## Testing
- Rust backend tests (if present):
```bash
cd src-tauri
cargo test
```
- Frontend tests are not configured.

## Using the App
### 1) Import an OpenAPI spec
- Paste a public OpenAPI JSON URL in the left sidebar and click Import.
- Imported specs appear as collections grouped by tags.
- A recent URL list is stored locally for quick reuse.

### 2) Browse collections and endpoints
- Expand a collection, then expand a tag group to see its endpoints.
- Endpoints are sorted by summary/description/path.
- Selecting an endpoint populates the request panel.

### 3) Build a request
- Method selector supports GET, POST, PUT, DELETE.
- URL is prefilled from the OpenAPI server base + path.
- Parameters appear in a card when defined in the spec:
  - Path parameters replace `{param}` placeholders in the URL.
  - Query parameters are appended to the query string.
  - Header parameters are added to the request headers.
  - Required params are marked with `*`.
  - Enum params are rendered as select inputs.
  - Query DTO parameters (schema refs) are expanded into individual fields.

### 4) Configure the request body
- Body card appears when the method allows a body.
- Supported content types:
  - `application/json` (freeform JSON editor)
  - `multipart/form-data` (form fields + file picker)
  - `application/x-www-form-urlencoded` (form fields)
- Body descriptions and examples are pulled from the OpenAPI schema.

### 5) Send and review
- Response tab shows:
  - Status line
  - Headers (collapsible)
  - Body (pretty-printed JSON when possible)
  - JSON tree view for structured inspection
  - Copy button for body content

### 6) History and reuse
- History tab shows recent requests for the selected endpoint (or all if none).
- Each entry records URL, method, params, body, and response.
- You can preview a response or reuse a request draft.
- History is stored in localStorage.

### 7) Auto request mode
- Each endpoint supports auto request polling.
- Available intervals: 30s, 1m, 5m.
- When enabled, the app sends a request immediately and continues on the interval.
- Overlapping calls are avoided per endpoint.

### 8) OpenAPI sync
- Collections can be synced on a timer using ETag caching.
- The sidebar shows sync status and last synced time.
- Sync can be toggled per collection.

## OpenAPI Support Details
- Parameters are merged from both path-level and operation-level definitions.
- Query parameters defined as a schema reference are expanded using the schema properties.
- Examples are pulled from:
  1) `example`
  2) `default`
  3) first `enum` value
- Schema examples are built recursively for objects and arrays.
- Request body example and description are pulled from `application/json` content when available.
- The first `servers[0].url` is used as the base URL (if defined).

## Data Persistence
Stored in `localStorage`:
- Request history (`restman.history`)
- OpenAPI URL history (`restman.openapiHistory`)
- Auto request interval (`restman.autoRequestInterval`)
- Sidebar width (`restman.sidebarWidth`)

## Commands Reference
From repo root:
- `npm run install:webui` install frontend dependencies
- `npm run tauri:dev` run desktop app in dev mode
- `npm run tauri:build` build desktop app for distribution

From `webui/`:
- `npm run dev` start Vite dev server
- `npm run build` type-check and build the web UI
- `npm run preview` preview the production build

From `src-tauri/`:
- `cargo build` build Rust backend
- `cargo test` run Rust tests

## Troubleshooting and Notes
- If an OpenAPI import fails, ensure the URL is publicly reachable and returns JSON.
- Only header parameters defined in the OpenAPI spec are editable in the UI.
- Multipart uploads remove any pre-set `Content-Type` header so the boundary can be set correctly.
- Background sync uses ETag; servers that do not send ETag will be fetched every interval.

## License
Not specified.
