# VaultNote — System Design

> **Audience**: Internal developers and new contributors.
> This is a white-box document. It covers architecture, every subsystem, every store, data flow, key design decisions, and where things live. Read it top-to-bottom once; use it as a reference after that.

---

## Table of Contents

1. [Stack at a Glance](#1-stack-at-a-glance)
2. [Repository Layout](#2-repository-layout)
3. [Process Model](#3-process-model)
4. [Rust Layer (src-tauri)](#4-rust-layer-src-tauri)
5. [Frontend Architecture](#5-frontend-architecture)
6. [State Management — Stores](#6-state-management--stores)
7. [Library Layer (src/lib)](#7-library-layer-srclib)
8. [Component Breakdown](#8-component-breakdown)
9. [Hooks](#9-hooks)
10. [Semantic Intelligence Pipeline](#10-semantic-intelligence-pipeline)
11. [Knowledge Graph Subsystem](#11-knowledge-graph-subsystem)
12. [Encryption & Security Model](#12-encryption--security-model)
13. [Markdown Rendering Pipeline](#13-markdown-rendering-pipeline)
14. [Persistence Model](#14-persistence-model)
15. [CRUD Cascade Model](#15-crud-cascade-model)
16. [Quick Capture Window](#16-quick-capture-window)
17. [Data Flow Diagrams](#17-data-flow-diagrams)
18. [Key Design Decisions & Tradeoffs](#18-key-design-decisions--tradeoffs)
19. [Adding a New Feature — Checklist](#19-adding-a-new-feature--checklist)
20. [Known Limitations](#20-known-limitations)

---

## 1. Stack at a Glance

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Tauri | v2 |
| Webview | WebView2 (Windows) | bundled |
| UI framework | React | 18 |
| Language | TypeScript | 5 |
| Build tool | Vite | 5 |
| Styling | CSS custom properties + Tailwind utility classes | 3 |
| Editor | CodeMirror | 6 |
| State | Zustand | 4 |
| Markdown | unified / remark / rehype pipeline | 11 |
| Syntax highlight | highlight.js | 11 |
| Fuzzy search | Fuse.js | 7 |
| AI embeddings | @huggingface/transformers (ONNX WASM) | 4 |
| AI model | all-MiniLM-L6-v2 (384-dim, 22 MB) | — |
| Graph | D3 v7 (force-directed) | 7 |
| Date math | date-fns | 3 |
| Icons | lucide-react | 0.400 |
| Rust | edition 2021, rust-version 1.77.2 | — |
| File watching | notify + notify-debouncer-mini | 6 / 0.4 |
| Tauri plugins | plugin-dialog, plugin-global-shortcut | 2 |

---

## 2. Repository Layout

```
MarkDown_NoteTaker/
├── index.html                  # Vite entry HTML; single div#root
├── vite.config.ts              # Port 1420, COOP+COEP headers, @ alias
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
│
├── src/
│   ├── main.tsx                # React root; routes capture vs. main window
│   ├── App.tsx                 # Theme wiring, hooks mount, vault routing, ciphertext sanitiser
│   ├── index.css               # All global CSS + CSS custom properties
│   │
│   ├── types/
│   │   └── index.ts            # All shared TypeScript interfaces
│   │
│   ├── lib/                    # Pure logic, no React
│   │   ├── fs.ts               # Tauri invoke wrappers (thin FS API)
│   │   ├── pathUtils.ts        # Windows path utilities
│   │   ├── markdown.ts         # unified pipeline (remark → rehype → HTML)
│   │   ├── wikilinks.ts        # Wiki-link regex + remark plugin
│   │   ├── embeddings.ts       # Transformers.js singleton + cosine sim + topK
│   │   ├── entities.ts         # Regex entity extractor
│   │   ├── search.ts           # Fuse.js index wrapper
│   │   ├── sm2.ts              # SM-2 spaced repetition algorithm
│   │   ├── vaultCrypto.ts      # AES-GCM + PBKDF2 (vault-level)
│   │   ├── directoryLock.ts    # Per-directory AES-256-GCM archive encryption
│   │   └── dailyNote.ts        # Daily note path + templates
│   │
│   ├── stores/                 # Zustand stores (one concern per file)
│   │   ├── vaultStore.ts
│   │   ├── fileStore.ts
│   │   ├── tabStore.ts
│   │   ├── editorStore.ts
│   │   ├── graphStore.ts
│   │   ├── embeddingStore.ts
│   │   ├── flashcardStore.ts
│   │   ├── highlightStore.ts
│   │   ├── noteRegistryStore.ts
│   │   ├── searchStore.ts
│   │   ├── settingsStore.ts
│   │   ├── uiStore.ts
│   │   ├── vaultPasswordStore.ts
│   │   └── lockStore.ts
│   │
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useAutoSave.ts
│   │   └── useFileWatcher.ts
│   │
│   └── components/
│       ├── Layout.tsx
│       ├── VaultPicker.tsx
│       ├── LockModal.tsx
│       ├── Sidebar/
│       │   ├── index.tsx
│       │   ├── FileTreeNode.tsx
│       │   └── ContextMenu.tsx
│       ├── Editor/
│       │   ├── index.tsx           # EditorArea (orchestrator)
│       │   ├── CodeMirrorEditor.tsx
│       │   ├── MarkdownPreview.tsx
│       │   ├── EditorTabs.tsx
│       │   └── EmptyEditor.tsx
│       ├── GraphView/index.tsx
│       ├── RelatedNotes/index.tsx
│       ├── EntityPanel/index.tsx
│       ├── FlashcardMode/index.tsx
│       ├── Canvas/index.tsx
│       ├── QuickCapture/index.tsx
│       ├── Search/SearchModal.tsx
│       ├── CommandPalette/index.tsx
│       ├── Settings/index.tsx
│       └── VaultLock/index.tsx
│
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── lib.rs              # All Tauri commands + watcher state
        └── main.rs             # tauri::Builder entry point
```

---

## 3. Process Model

VaultNote runs two OS processes:

```
┌───────────────────────────────────────────────┐
│  Rust process (Tauri)                          │
│  ├─ Global shortcut listener (Ctrl+Shift+Space)│
│  ├─ File system watcher (notify debouncer)     │
│  └─ Tauri command dispatcher                   │
│         │ IPC bridge (JSON over postMessage)   │
│         ▼                                      │
│  WebView2 process                              │
│  ├─ main window  (/?capture= absent)           │
│  │   └─ React App                              │
│  └─ capture window (/?capture=1)               │
│      └─ QuickCapture component                 │
└───────────────────────────────────────────────┘
```

The two windows share the **same Rust process** but have **separate WebView2 contexts** (separate JS heaps, separate React trees, separate Zustand stores). They communicate only via Tauri IPC (`invoke` / `emit`).

The capture window:
- Is created at startup as `visible: false`, `alwaysOnTop: true`, `decorations: false`
- Is toggled via the global shortcut → `toggle_capture_window` Rust command
- Reads the active vault path from `localStorage` (shared between windows on the same origin) because it has no access to the main window's in-memory Zustand state

---

## 4. Rust Layer (src-tauri)

### Commands (lib.rs)

All commands are registered in `tauri::generate_handler!` in `main.rs` → `lib.rs::run()`.

#### File system commands

| Command | Purpose | Notes |
|---|---|---|
| `read_text_file(path)` | Read UTF-8 file | Surfaces Rust IO errors as `Result<String, String>` |
| `write_text_file(path, content)` | Atomic write | Writes to `.tmp` sibling, then `rename` — prevents corrupt files on crash |
| `write_binary_file(path, bytes)` | Binary write | Creates parent dirs via `create_dir_all` |
| `read_dir(path)` | List directory | Skips dotfiles; sorts directories before files, then alphabetically |
| `create_dir(path)` | Create directory | `create_dir_all` (recursive) |
| `remove_path(path, recursive)` | Delete file or tree | `remove_file` or `remove_dir_all` |
| `rename_path(old, new)` | Rename or move | Works cross-directory |
| `path_exists(path)` | Existence check | Returns `bool` (not a Result) |
| `copy_file(src, dst)` | File copy | Creates parent dirs |
| `get_file_info(path)` | Stat a single entry | Returns `DirEntryInfo` |

`DirEntryInfo` struct:
```rust
{ name: String, path: String, is_file: bool, is_directory: bool,
  modified: Option<u64>, size: Option<u64> }
```

#### File watcher commands

```
watch_vault(path, app_handle, watcher_state)
  → Starts notify-debouncer-mini with 500 ms debounce
  → Emits `vault-file-change` event: { paths: Vec<String>, kind: String }

unwatch_vault(watcher_state)
  → Drops the debouncer (stops watching)
```

`WatcherState` is `Mutex<Option<Debouncer<RecommendedWatcher>>>`, managed as Tauri managed state.

#### Window commands

```
toggle_capture_window(app)  → show() if hidden, hide() if visible
hide_capture_window(app)    → always hide
```

#### Global shortcut

Registered in `lib.rs::run()` setup closure using `tauri_plugin_global_shortcut`:

```
CommandOrControl+Shift+Space → toggle_capture_window
```

### Capabilities (capabilities/default.json)

Both `main` and `capture` windows receive:
- `core:default` — window management, events, IPC
- `dialog:*` — native open/save file dialogs
- `global-shortcut:*` — register / unregister / query shortcuts

### Build config

Release profile: `panic = "abort"`, LTO enabled, `opt-level = "s"` (size-optimized), debug symbols stripped. Results in a compact binary.

---

## 5. Frontend Architecture

### Entry point routing

`src/main.tsx` reads `window.location.search`:

```typescript
const isCapture = new URLSearchParams(window.location.search).get('capture') === '1';
ReactDOM.render(isCapture ? <QuickCaptureWindow /> : <App />, root);
```

This is the only routing in the app. There is no React Router.

### App.tsx responsibilities

1. Read `settingsStore` → write `data-theme` attribute on `<html>` (triggering CSS variable swaps)
2. Write `--editor-font-size` and `--editor-line-height` CSS variables to `document.documentElement.style`
3. Mount `useKeyboardShortcuts()` and `useAutoSave()` hooks globally
4. Run a startup sanitiser IIFE before first render — clears any ciphertext that may have been persisted to `tabStore.savedContent` or `editorStore.contents` (guards against the old bug where `loadFile` cached raw ciphertext to localStorage, and against HMR state pollution in development)
5. Render `<VaultPicker />` when `currentVault === null`, else `<Layout />`

### Layout.tsx

Flex row: `<Sidebar>` (variable width, collapsible) + `<EditorArea>` (flex-1). The sidebar width comes from `settingsStore.sidebarWidth` (set by drag; default 260 px).

### CSS architecture

`src/index.css` uses CSS custom properties as a design token system:

```css
:root[data-theme="dark"] {
  --bg-base: #0f0f10;
  --bg-surface: #161618;
  --accent: #7c6af0;
  --accent-hover: #9b8ef5;
  --text-primary: #e8e8ea;
  /* … */
}
```

All components reference these tokens directly (no CSS-in-JS, minimal Tailwind — Tailwind is used only for layout utilities like `flex`, `gap-*`, `px-*`).

---

## 6. State Management — Stores

All state is managed with **Zustand**. The stores are independent modules; cross-store calls use `StoreName.getState()` (never import hooks across stores to avoid circular dependencies or stale closures).

### Store dependency map

```
vaultStore          (no deps)
fileStore           → editorStore, tabStore, embeddingStore, noteRegistryStore, lockStore
tabStore            (no deps)
editorStore         → tabStore, searchStore, lockStore
graphStore          → embeddings lib (cosineSim)
embeddingStore      → embeddings lib
flashcardStore      → sm2 lib
highlightStore      → fs lib
noteRegistryStore   → fs lib
searchStore         → search lib
settingsStore       (no deps)
uiStore             (no deps)
vaultPasswordStore  → vaultCrypto lib
lockStore           (no deps)
```

### Store catalog

#### vaultStore
- **Persisted**: `vaultnote-vault`
- Tracks `currentVault: VaultInfo | null` and `recentVaults: VaultInfo[]` (max 10)
- `openVault(path)` → sets current vault, adds to recents
- `closeVault()` → clears current vault (triggers App to render VaultPicker)

#### fileStore
- **Not persisted** (rebuilds from disk on vault open)
- Core state: `rootNodes: FileNode[]`, `flatNodes: Map<string, FileNode>`, `vaultPath: string | null`
- `flatNodes` is the canonical source of truth for all known paths; `rootNodes` is the display tree derived from it
- Lazy directory expansion: `expandDir` reads children from disk when a folder is first opened — **unless** the directory has a session-unlocked ancestor, in which case it calls `findVirtualAncestor(node.path)` and, if found, synthesises `FileNode` children from `lockStore.virtualContents` via `buildVirtualChildren` (no disk read at all)
- `createFile`: if the parent is inside a virtual (locked but unlocked for session) directory, adds the new file to `lockStore.virtualContents` and re-encrypts the archive to disk instead of writing to disk directly
- `refreshNode(parentPath)`: if the directory is virtual, rebuilds children from `lockStore.virtualContents` instead of reading the filesystem; otherwise merges fresh disk state with existing `isExpanded`/`childrenLoaded` flags so the tree doesn't collapse on refresh
- `deleteNode`: if the target file or directory is virtual, removes the path(s) from `lockStore.virtualContents` and re-encrypts the archive; otherwise performs the normal disk `removePath` cascade
- All directory reads filter both `LOCK_FILENAME` (`.vaultnote-lock.json`) and `VAULT_ARCHIVE_FILENAME` (`.vaultnote-vault`) from the displayed tree

**Root detection**: `vaultPath` is stored so `refreshNode` can distinguish the vault root (which is not itself a node in `flatNodes`) from subdirectories.

#### tabStore
- **Persisted**: `vaultnote-tabs` (`isDirty` reset to false on hydration)
- `Tab` shape: `{ id, path, title, isPinned, isDirty, scrollPosition, savedContent }`
- `savedContent` is the last version written to disk — used to compute dirty state without a round-trip
- `recentlyClosed` (max 10) is intentionally **not** persisted (not meaningful across restarts)
- Tab title is derived from `extractTitle(content)` (H1 → first line → filename) at open time; updated on save

#### editorStore
- **Not persisted**
- `contents: Map<string, string>` — in-memory cache of file content keyed by absolute path. Ciphertext is **never** stored in this map — triple-guarded: `loadFile` sanitises, `Editor/index.tsx` has a sync-effect guard, and `App.tsx`'s startup sanitiser evicts any persisted ciphertext from localStorage on boot.
- `loadFile(path)`: checks `lockStore.virtualContents` before hitting disk — if the file path is found in the virtual FS, returns the in-memory plaintext directly without any disk read. For files that are not virtual but belong to a locked directory (legacy individually-encrypted format), decrypts them transparently using the session password. Cache miss on normal files falls through to `fs.readTextFile`.
- `saveFile(path, content)`: calls `findSessionUnlockedAncestor(path)` to detect whether the file lives inside a session-unlocked locked directory. If found, updates `lockStore.virtualContents` for that path and re-encrypts the entire archive to disk via `saveVaultArchive` — no plaintext ever touches disk. If no virtual ancestor is found but an ancestor is in `lockedPaths`, falls through to per-file encryption (legacy path). Otherwise performs a normal `fs.writeTextFile`, updates cache, marks tab clean, and triggers search index update.
- `setContent` marks tab dirty/clean by comparing against `tab.savedContent`

#### graphStore
- **Not persisted**
- Two edge kinds: `wiki` (structural) and `semantic` (AI-computed)
- `nameToPath` is the resolution dictionary for `[[Wiki-Links]]`: normalized note name → absolute path
- `indexFile` is called on file open/save; `indexAll` bulk-indexes in the background on vault load
- `addSemanticEdges` is called once after the embedding index is built; it replaces all semantic edges atomically (drops and rebuilds to prevent duplicates on re-runs)

#### embeddingStore
- **Not persisted in React state** — persisted to disk as `.vaultnote-embeddings.json`
- Module-level `_persistVaultPath` and `_persistPassword` vars enable fire-and-forget `autoPersist()` on mutations (`renameIndexEntry`, `removeIndexEntry`)
- Disk format v2: `Record<absolutePath, { vec: number[], hash: string }>`; migrates from v1 (`Record<absolutePath, number[]>`) via `asDiskEntry()`
- Content hash (SHA-256 of first 4 KB, truncated to 16 hex chars) enables skip-unchanged on `indexAll`
- `cleanContent(raw, title)` preprocesses note text: strips frontmatter, code fences, markdown symbols, prepends filename stem (unless H1 already matches), caps at 3000 chars
- `expandQuery(q)` expands short queries (≤3 words) for better vector-space anchoring

#### flashcardStore
- **Persisted**: `vaultnote-flashcards`
- `states: Record<cardId, CardState>` — SM-2 per-card state; survives app restarts
- `queue` is built fresh per review session (due cards first, all others appended)
- Card ID format: `"absolutePath::cardIndex"` — stable as long as Q/A blocks don't reorder

#### highlightStore
- **Not persisted in React state** — persisted to sidecar `.filename.highlights.json` files
- Highlights are loaded lazily (on file open); written on every add/remove
- Sidecar naming: `pathUtils.join(dir, '.' + pathUtils.basename(path) + '.highlights.json')`
- The Rust `read_dir` skips dotfiles, so sidecars are invisible in the sidebar

#### noteRegistryStore
- **Not persisted in React state** — persisted to `.vaultnote-registry.json`
- Disk format: `{ [uuid: string]: absolutePath }` (UUID → path direction only; path → UUID is rebuilt in-memory at load)
- `getOrCreate(path)` → idempotent; creates UUID via `crypto.randomUUID()` on first call; auto-saves fire-and-forget
- Intended purpose: stable identity across renames/moves for future cross-reference features

#### searchStore
- **Not persisted**
- Thin wrapper around the Fuse.js index in `src/lib/search.ts`
- `setQuery` triggers `runSearch` deferred by `setTimeout(0)` to avoid blocking the input keystroke

#### settingsStore
- **Persisted**: `vaultnote-settings`
- Consumed by `App.tsx` (theme, font vars), `CodeMirrorEditor` (theme construction), `EditorArea` (layout flags)

#### uiStore
- **Not persisted**
- Ephemeral overlay state: context menu position/target, rename target, modal open/close flags

#### vaultPasswordStore
- **Not persisted** (password is memory-only)
- `isLocked` = lock file exists; `isUnlocked` = password has been verified this session
- `unlock(password)` → calls `verifyIntelPassword` from `vaultCrypto.ts`; returns bool without exposing internals

#### lockStore
- **Not persisted**
- Tracks per-directory lock and session state, plus an in-memory virtual file system for session-unlocked archive directories.

**State shape:**
```typescript
{
  lockedPaths: Set<string>;         // dirs confirmed to have a .vaultnote-lock.json
  sessionUnlocked: Set<string>;     // dirs unlocked this session (password verified)
  sessionPasswords: Map<string, string>; // per-dir password held in memory for re-encryption
  virtualContents: Map<string, string>;  // abs path → plaintext (in-memory virtual FS)
}
```

**Virtual FS concept**: when a directory is unlocked for a session, its `.vaultnote-vault` archive is decrypted in memory and all file paths with their plaintext content are stored in `virtualContents`. This map acts as an in-memory overlay file system — no decrypted content ever reaches disk. The file tree, editor, and save path all consult `virtualContents` instead of the real filesystem for any path that belongs to a session-unlocked directory.

**Methods:**
- `grantSession(dirPath, password)` — marks a directory as session-unlocked, stores its password
- `revokeSession(dirPath)` — removes session unlock and clears virtual contents for that dir (also called from `ContextMenu.handleRevokeSession`)
- `isLocked(path)` — returns true if the directory has a lock file and is not session-unlocked
- `setVirtualContents(map)` — replaces the entire virtual FS map (called on initial archive decrypt)
- `updateVirtualContent(absPath, content)` — update a single file's plaintext (called on save)
- `removeVirtualContent(absPath)` — remove a single file (called on virtual delete)
- `clearVirtualContentsForDir(dirPath)` — evict all virtual entries under a given directory path (called on re-lock)
- `getVirtualContent(absPath)` — retrieve plaintext for a single path
- `hasVirtualContent(absPath)` — check if a path is in the virtual FS
- `getAllVirtualPaths()` — returns all keys in `virtualContents`
- `getVirtualPathsForDir(dirPath)` — returns all virtual paths under a given directory

---

## 7. Library Layer (src/lib)

### fs.ts — Tauri FS wrapper

Every function is a one-liner `invoke(commandName, args)`. The return type mirrors the Rust command's `Result<T, String>` — errors are thrown as JS exceptions.

```typescript
// Example
export const writeTextFile = (path: string, content: string) =>
  invoke<void>('write_text_file', { path, content });
```

This indirection means swapping the backend (e.g., to a Node.js adapter for testing) requires changes only in `fs.ts`.

### pathUtils.ts

Windows-centric path utilities. Key design: `SEP = '\\'`. All methods operate on strings; no Node.js `path` module is used (unavailable in WebView2).

- `join(...parts)` — variadic join with SEP
- `normalize(p)` — resolves `.` and `..` by splitting on `[/\\]+` (handles forward slashes from web APIs), popping for `..`, rejoining with `\\`
- `relative(from, to)` — simple prefix strip; used for descendant checks in ContextMenu
- `isMarkdown(p)` — `.endsWith('.md')`
- `stem(p)` — basename without extension

### markdown.ts — Rendering pipeline

```
Input (Markdown string)
  → remark-parse          (CommonMark AST)
  → remark-gfm            (GFM extensions)
  → remarkWikiLinks        (custom plugin: [[x]] → <a data-wiki-link>)
  → remark-rehype          (MDAST → HAST)
  → addSourceLines         (stamps data-source-line on block elements)
  → addYouTubeMarkers      (detects YouTube URLs → div.yt-card-placeholder)
  → rehype-highlight       (code block syntax highlighting via highlight.js)
  → rehype-sanitize        (XSS prevention with extended schema)
  → rehype-stringify       (HAST → HTML string)
```

The sanitize schema is carefully extended to allow:
- `class` (for highlight.js CSS classes)
- `data-wiki-link`, `data-source-line`, `data-yt-id` (custom data attributes)
- `style`, `align` (tables)
- `href` patterns including `#wiki` internal anchors

This pipeline runs async (returns `Promise<string>`); results are not memoized at the library level — callers are responsible for memoization if needed.

### embeddings.ts — AI embedding singleton

```
Module state:
  _pipe: FeatureExtractionPipeline | null   (singleton)
  _loading: boolean
  _loadPromise: Promise<...> | null         (deduplicates concurrent load calls)
  _error: string | null

loadModel()
  → import('@huggingface/transformers')    (dynamic import — deferred until needed)
  → env.useBrowserCache = true             (IndexedDB cache survives restarts)
  → env.backends.onnx.wasm.proxy = false   (disable WASM web worker — Tauri lacks COOP/COEP)
  → pipeline('feature-extraction', MODEL) → _pipe

embed(text: string) → Float32Array
  → _pipe(text.slice(0, 3000), { pooling: 'mean', normalize: true })
  → returns .data as Float32Array (384 dims)

embedBatch(texts, onProgress) → Float32Array[]
  → sequential embeds with yield every 5 items to keep UI responsive

cosineSim(a, b) → number
  → dot product / (|a| × |b|)
  → normalized vectors → dot product alone would suffice, but we compute norms defensively

topK(queryVec, index, k, excludePath?, minScore=0.3) → { path, score }[]
  → O(N) scan of all embeddings, sort by score, slice(0,k), filter by minScore
```

**Why ONNX proxy is disabled**: WebView2 on Windows does not set `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers by default. Without these, `SharedArrayBuffer` is unavailable, which is required by the WASM multi-threaded backend. Running on the main thread is slightly slower but universally compatible. Vite sets COOP+COEP headers in dev mode to enable SharedArrayBuffer for potential future use.

### wikilinks.ts

```
extractWikiLinks(text) → WikiLink[]
  Regex: /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g
  Returns: { target: string, display: string | null, index: number }

normaliseName(name) → string
  Lowercase, strip .md extension, trim whitespace

remarkWikiLinks() → remark plugin
  Visits 'text' nodes in MDAST
  Splits on wiki-link regex
  Inserts <a data-wiki-link="target" class="wiki-link">display</a> HAST nodes
```

### search.ts — Fuse.js wrapper

Maintains a **module-level** `fuse` instance. Rebuilt by `buildIndex(entries)` on vault load; updated incrementally by `updateIndexEntry` / `removeIndexEntry` on CRUD events.

```typescript
fuse = new Fuse(entries, {
  keys: [{ name: 'title', weight: 2 }, { name: 'content', weight: 1 }],
  threshold: 0.35,
  ignoreLocation: true,
  includeMatches: true,
})
```

`search(query, limit=50)` extracts the first match position to compute a ±60-char excerpt and line number.

### sm2.ts — SM-2 algorithm

Pure function: `sm2(state: CardState, quality: 0–5) → CardState`

```
quality < 3:
  reset repetitions to 0, interval to 1 day, keep easeFactor

quality >= 3:
  repetitions === 0 → interval = 1
  repetitions === 1 → interval = 6
  else → interval = Math.round(state.interval × state.easeFactor)
  easeFactor += 0.1 - (5 - quality) × 0.08 (clamped 1.3–2.5)
  repetitions += 1
  nextReview = Date.now() + interval × 86_400_000
```

`parseFlashcards(notePath, content) → Flashcard[]`:
- Regex: `/^Q:\s*(.+?)[\r\n]+A:\s*([\s\S]+?)(?=\n\nQ:|\n\nQ |$)/gm`
- Card ID: `"${notePath}::${index}"` (stable by order in file)

### vaultCrypto.ts — AES-GCM encryption

```
Key derivation:
  PBKDF2(password, salt[32 random bytes], 200_000 iterations, SHA-256) → 256-bit key

createIntelLock(password) → IntelLockFile
  { version: 1, salt: hex, hash: hex, lockedAt: ISO string }
  hash = SHA-256(exported key bytes), hex-encoded — for verification without decryption

verifyIntelPassword(lock, password)
  → re-derive key, export, hash, compare with stored hash

encryptJson(obj, password) → EncryptedBlob
  { encrypted: true, salt: hex, iv: hex, data: base64 }
  iv = 12 random bytes (AES-GCM standard)
  data = AES-GCM(key, iv, JSON.stringify(obj))

decryptJson<T>(blob, password) → T
  → re-derive key, decrypt, JSON.parse
```

`isEncryptedBlob(v)` type guard checks for the `encrypted: true` sentinel — used in `embeddingStore.loadIndex` to branch between plaintext and ciphertext.

### directoryLock.ts — Archive-based AES-256-GCM encryption

`directoryLock.ts` implements the full lifecycle of per-directory encryption. It uses the same PBKDF2 + AES-256-GCM primitives as `vaultCrypto.ts` but operates on a **single encrypted archive** (`.vaultnote-vault`) that contains all `.md` files in a directory packed into one JSON manifest.

**Constants:**
- `LOCK_FILENAME = '.vaultnote-lock.json'` — stores salt + key hash for password verification
- `VAULT_ARCHIVE_FILENAME = '.vaultnote-vault'` — stores the AES-GCM ciphertext of the manifest

**Archive manifest format (plaintext, before encryption):**
```json
{ "version": 1, "files": { "rel/path/to/note.md": "note content", ... } }
```
Keys are paths relative to the locked directory root. This means no absolute paths are embedded in the ciphertext, making the archive portable.

**Exported functions:**

```typescript
// Low-level symmetric crypto (string in, string out)
encryptContent(plaintext: string, password: string): Promise<string>
  → VAULTNOTE_ENCRYPTED:1:<salt_hex>:<iv_hex>:<base64_ciphertext>

decryptContent(encryptedStr: string, password: string): Promise<string>
  → plaintext string

isEncryptedContent(s: string): boolean
  → checks for VAULTNOTE_ENCRYPTED:1 header prefix

// Archive lifecycle
createVaultArchive(dirPath: string, password: string): Promise<void>
  → reads all .md files recursively
  → serialises into manifest JSON
  → AES-256-GCM encrypts
  → writes .vaultnote-vault
  → deletes all .md originals
  → prunes empty subdirectories

openVaultArchive(dirPath: string, password: string): Promise<Record<string, string>>
  → reads .vaultnote-vault
  → decrypts in memory
  → returns { absPath: content } map (never writes to disk)

saveVaultArchive(dirPath: string, password: string, absContents: Record<string, string>): Promise<void>
  → re-serialises the abs-path map to relative-path manifest
  → re-encrypts
  → overwrites .vaultnote-vault (atomic write via Rust)

extractVaultArchive(dirPath: string, password: string): Promise<void>
  → decrypts archive
  → writes all .md files back to disk (creates subdirs as needed)
  → deletes .vaultnote-vault

hasVaultArchive(dirPath: string): Promise<boolean>
  → checks for existence of .vaultnote-vault

// Lock file management
setDirectoryLock(dirPath: string, password: string): Promise<void>
  → derives key, stores salt + key hash in .vaultnote-lock.json

verifyDirectoryPassword(dirPath: string, password: string): Promise<boolean>
  → re-derives key, compares hash

removeDirectoryLock(dirPath: string): Promise<void>
  → deletes .vaultnote-lock.json

isDirectoryLocked(dirPath: string): Promise<boolean>
  → checks for existence of .vaultnote-lock.json

// Migration shim
migrateToArchiveIfNeeded(dirPath: string, password: string): Promise<void>
  → detects old format: .md files on disk with VAULTNOTE_ENCRYPTED:1 headers
  → decrypts each individually
  → calls createVaultArchive to repack into the new format
  → called automatically on first unlock of a legacy-format directory
```

**Removed from public API:** `encryptAllFiles` and `decryptAllFiles` (the old per-file approach) are no longer exported. They exist only inside `migrateToArchiveIfNeeded`.

### entities.ts

Curated `TECH_TERMS` set (~150 entries covering languages, frameworks, cloud, ML, system design). Entity extraction priority order in `extractEntities`:

1. Strip code blocks (avoid false positives from code)
2. Match hashtags (`#word`)
3. Match mentions (`@word`)
4. Scan text for known TECH_TERMS (case-insensitive)
5. Match DATE_RE (multiple formats)
6. Match URL_RE
7. Match CONCEPT_RE (2–4 capitalized words)

Deduplicates by text (case-insensitive), sorts by count descending, caps at 30 total.

### dailyNote.ts

```typescript
getDailyNotePath(vaultPath, date?) 
  → `${vaultPath}/Journal/${yyyy}/${yyyy-MM-dd}.md`

getDailyNoteTemplate(date?)
  → `# ${date string}\n\n## Today\n\n## Notes\n\n## Tasks\n`
```

`NOTE_TEMPLATES` is a `Record<string, string>` used by the Command Palette to seed new notes.

---

## 8. Component Breakdown

### Layout.tsx

Simple flex wrapper. Sidebar width controlled by `settingsStore.sidebarWidth` CSS variable. Passes no props to children — all state is consumed from stores directly.

### VaultPicker.tsx

Landing screen rendered by `App.tsx` when `currentVault === null`. Uses `@tauri-apps/plugin-dialog` `open({ directory: true })` for the native folder picker. "New Vault" creates `Journal/`, `Notes/`, `Inbox/` subdirs and a `Welcome.md` via `fs.createDir` + `fs.writeTextFile`.

### Sidebar/index.tsx

**Intelligence wiring** (critical path on vault load):

```
useEffect on [currentVault.path, isLoading, rootNodes.length]:
  1. vaultPasswordStore.loadLock(vaultPath)       (check for intel lock)
  2. noteRegistryStore.loadRegistry(vaultPath)    (UUID map)
  3. graphStore.buildNameIndex(mdPaths)            (name → path)
  4. graphStore.indexAll(mdPaths)                  (wiki-link extraction, background)
  5. embeddingStore.warmModel()                    (eager model download)
  6. embeddingStore.loadIndex(vaultPath, password) (load cached embeddings)
     .then → embeddingStore.indexAll(...)          (embed dirty files)
     .then → graphStore.addSemanticEdges(          (enrich graph)
               useEmbeddingStore.getState().index  ← live state, not closure
             )
```

Note the live state read at step 6: `embeddingStore.index` captured in the `useEffect` closure would be stale (empty Map from initial render). `useEmbeddingStore.getState()` reads the current store state at call time, bypassing the closure.

**Semantic search** is debounced 350 ms from the filter input. It only runs when `modelStatus === 'ready'`.

### Sidebar/FileTreeNode.tsx

Recursive component (renders children). Key behaviors:
- **Dirty dot**: checks `tabStore.tabs` for open dirty tabs matching the node path
- **Inline rename**: `uiStore.renameTarget` drives visibility; commits via `fileStore.renameNode`
- **Directory lock**: `lockStore.isLocked(path)` on click → renders `<LockModal>` if locked and not session-unlocked

### Sidebar/ContextMenu.tsx

Rendered in a portal at the click position (`uiStore.contextMenu`). The **Move to…** modal:
- Collects `flatNodes` entries that are directories
- Excludes: self, current parent (`pathUtils.dirname(src) === dir`), descendants (`src` is a prefix of `dir`)
- Calls `fileStore.moveNode(srcPath, targetDir)` on selection

**Re-locking**: `handleRevokeSession` calls both `lockStore.revokeSession(targetPath)` (which removes the session unlock grant and password) and `lockStore.clearVirtualContentsForDir(targetPath)` (which evicts all decrypted content from the in-memory virtual FS). After this, the directory is inaccessible again until the user re-enters the password.

### Editor/CodeMirrorEditor.tsx

Exposes `EditorHandle { scrollToLine(n) }` via `useImperativeHandle`. Key implementation details:

- **Theme construction**: `EditorView.theme({...})` is rebuilt from settings on every settings change. This causes a full CM6 reconfigure but is acceptable since settings changes are rare.
- **Ctrl+F intercept**: a custom keymap extension captures `Ctrl+F` before `searchKeymap` and calls `uiStore.openSearch()` instead — the native CM6 search panel is not used.
- **Image drag-drop**: `DOMEventHandlers` on `drop` event; calls `fs.copyFile` then reads drop position via `view.posAtCoords`.
- **Scroll sync**: uses `EditorView.scrollSnapshot()` or manually tracks the topmost visible line via `view.visibleRanges`.
- **Ciphertext guard**: a sync effect checks the incoming `value` prop; if it starts with `VAULTNOTE_ENCRYPTED:1`, it does not set the editor content (prevents raw ciphertext from appearing in the editing surface).

### Editor/MarkdownPreview.tsx

Renders HTML from `renderMarkdown(content)` via `dangerouslySetInnerHTML`. Heavy DOM post-processing in `useEffect`:

1. **Image resolution**: `querySelectorAll('img')` → for each `src`, call `convertFileSrc(pathUtils.normalize(pathUtils.join(dir, src)))` to get a `tauri://` protocol URL
2. **YouTube lazy embed**: `querySelectorAll('.yt-card-placeholder')` → fetch thumbnail from `noembed.com`, render `<img>` + title; on click, replace with `<iframe>`
3. **Wiki-link click**: `querySelectorAll('[data-wiki-link]')` → `addEventListener('click', ...)`
4. **Checkbox disable**: `querySelectorAll('input[type=checkbox]')` → `disabled = true`
5. **Highlights**: apply `<mark>` wrappers via TreeWalker (text node traversal), handle selection events for the color toolbar

**Highlight injection** uses TreeWalker to walk text nodes, finds substrings matching each highlight's `text` field, and wraps them in `<mark data-highlight-id="...">` elements. The source line of each highlight is tracked via the nearest `[data-source-line]` ancestor.

### Editor/index.tsx (EditorArea)

Orchestrates:
- Split pane layout with a draggable `mousedown`/`mousemove`/`mouseup` divider
- Scroll sync: `syncSource` ref (`'editor' | 'preview' | null`) with a 150 ms debounce prevents ping-pong feedback loops
- Click-to-edit: `onLineClick(lineNum)` → `editorRef.current.scrollToLine(lineNum)`
- Status bar: word count (from `markdown.wordCount`), dirty state, panel toggles
- **Ciphertext sync guard**: a `useEffect` on the active tab's content checks `isEncryptedContent(content)` — if true, does not propagate the value to the editor (second line of defence after `loadFile` sanitisation)

**Canvas branch**: if `activeTab?.path.endsWith('.canvas')`, renders `<Canvas>` instead of the split editor/preview.

### GraphView/index.tsx

The entire D3 graph is re-created (`svg.selectAll('*').remove()`) on every state change that affects `draw` (node list, edges, active tab path, toggles, threshold). This is intentional: D3's mutable DOM manipulation doesn't compose well with React's reconciliation, so full redraws are simpler and fast enough for typical vault sizes (< 500 nodes).

**Semantic edge scoring and coloring**:

```typescript
function scoreColor(score: number): string {
  const t = Math.log1p(score * (Math.E - 1));  // log curve [0,1]→[0,1]
  return `hsl(${Math.round(t * 120)}, 70%, 52%)`;
}
```

Why logarithmic: real cosine similarity scores for thematically related notes in `all-MiniLM-L6-v2` cluster between 0.3–0.65. A linear 0–1 scale would make all edges appear orange/red. The natural-log curve pushes score 0.5 to ~74° (yellow-green) and score 0.3 to ~50° (amber), giving useful visual differentiation in the realistic range.

**SVG marker trick** (`context-stroke`): a single `arr-sem` marker uses `fill="context-stroke"`. SVG `context-stroke` inherits the stroke color of the element referencing the marker, allowing per-edge arrowhead colors without creating one `<marker>` element per edge.

### QuickCapture/index.tsx

Rendered in the capture window (frameless, transparent). Reads vault path from `localStorage['vaultnote-vault']` (Zustand persist key) at save time since it has no IPC channel to the main window's store.

**Auto-title logic**:
```typescript
function extractHeadingTitle(content: string): string | null {
  const match = content.trimStart().match(/^#{1,3}\s+(.+)/);
  if (!match) return null;
  return match[1].replace(/[*_~`[\]]/g, '').trim();
}

function toFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

async function findUnusedPath(dir, base): Promise<string> {
  // tries base.md, base 2.md, base 3.md ... base 99.md
}
```

### FlashcardMode/index.tsx

Self-contained overlay. Calls `parseFlashcards(path, content)` on the current tab's content. Flip state (`showAnswer`) is local React state. Ratings call `flashcardStore.rateCard(quality)`.

### Canvas/index.tsx

The canvas maintains its own pan/zoom state (`offset: {x,y}`, `scale: number`). Cards are rendered as absolute-positioned `div`s within a transformed container. The resize handle uses `mousedown` on a corner div with global `mousemove`/`mouseup` listeners during drag. All mutations debounce a `saveCanvas()` call by 800 ms.

---

## 9. Hooks

### useKeyboardShortcuts.ts

Registers a single `keydown` listener on `window`. Guard at top:

```typescript
const tag = (e.target as HTMLElement).tagName;
if (tag === 'INPUT' || tag === 'TEXTAREA') return;
```

All shortcuts check `e.ctrlKey` (or `e.metaKey` for future Mac support). Dispatch calls store actions directly — no event bus.

### useAutoSave.ts

Subscribes to `tabStore` with a selector for `activeTabId` and its `isDirty` status:

```typescript
useEffect(() => {
  if (!isDirty || !activeTab) return;
  const timer = setTimeout(() => editorStore.saveFile(activeTab.path, content), interval);
  return () => clearTimeout(timer);
}, [isDirty, activeTabId, content, interval]);
```

The timer is cancelled on `activeTabId` change, preventing a stale save from firing after switching tabs.

### useFileWatcher.ts

```typescript
useEffect(() => {
  if (!currentVault) return;
  fs.watchVault(currentVault.path);
  const unlisten = listen('vault-file-change', (event) => {
    const { paths, kind } = event.payload;
    // for each changed path:
    //   if open tab and not dirty → editorStore.loadFile(path)
    //   refreshNode(pathUtils.dirname(path))
  });
  return () => { fs.unwatchVault(); unlisten.then(fn => fn()); };
}, [currentVault?.path]);
```

---

## 10. Semantic Intelligence Pipeline

End-to-end flow from vault open to semantic edges in the graph:

```
Vault opens
  │
  ├─ [Sidebar useEffect]
  │     embeddingStore.warmModel()          → starts model download
  │     embeddingStore.loadIndex(vault, pw) → reads .vaultnote-embeddings.json
  │
  ├─ [Model download — background]
  │     Transformers.js downloads all-MiniLM-L6-v2 (22 MB)
  │     Caches to browser IndexedDB/Cache API
  │     Sets modelStatus = 'ready'
  │
  ├─ [embeddingStore.indexAll]
  │     For each .md file:
  │       1. Read raw content from disk
  │       2. cleanContent(raw, stem) → strip noise, prepend title
  │       3. hashContent(cleaned) → 16-char SHA-256 prefix
  │       4. Compare hash vs stored hash → skip if equal
  │     Batch embed dirty files via embedBatch()
  │     Save updated index to disk (JSON or AES-GCM encrypted)
  │
  ├─ [graphStore.addSemanticEdges(liveIndex)]
  │     Pairwise cosine similarity for all embedded notes
  │     Threshold: 0.3; maxPerNode: 5
  │     Deduplicates pairs: canonical key = min(pathA, pathB) + '|||' + max(...)
  │     Merges into graphStore.edges alongside wiki edges
  │
  └─ [GraphView + RelatedNotes + SearchModal]
        Consume edges / index on demand
```

### Content cleaning detail

```typescript
function cleanContent(raw: string, title?: string): string {
  const body = raw
    .replace(/^---[\s\S]*?---\n?/, '')    // strip YAML frontmatter
    .replace(/```[\s\S]*?```/g, '')        // strip code fences
    .replace(/`[^`]+`/g, '')               // strip inline code
    .replace(/[#*_~[\]]/g, '')             // strip markdown punctuation
    .trim()
    .slice(0, 2800);                        // hard cap

  if (!title) return body;
  const normalizedTitle = title.replace(/[-_]+/g, ' ').trim();
  if (body.toLowerCase().startsWith(normalizedTitle.toLowerCase())) return body;
  return `${normalizedTitle}\n\n${body}`.slice(0, 3000);  // title prepended
}
```

Why title prepending: `all-MiniLM-L6-v2` is symmetric similarity trained on sentence pairs. A note with just "Met with Alice today" has weak signal about what it's *about*. Prepending the filename stem (e.g., "Sofia Vergara") anchors the embedding to the topic identity even when the body is sparse.

### Query expansion detail

```typescript
function expandQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.split(/\s+/).length > 3) return trimmed;
  return `${trimmed} ${trimmed} topics and notes about ${trimmed}`;
}
```

Without expansion, "TV" embeds near a noisy region of the model's vector space (the token is ambiguous — television, TV show, TV channel). Repeating and framing it disambiguates the embedding.

---

## 11. Knowledge Graph Subsystem

### Data model

```typescript
interface GraphEdge {
  from:   string;   // absolute path
  to:     string;   // absolute path
  kind:   'wiki' | 'semantic';
  score?: number;   // cosine similarity (semantic only)
}
```

`graphStore.edges` holds both kinds together. Visual filtering happens in `GraphView` at render time (not in the store) so UI state changes (toggles, threshold slider) don't require store mutations.

### Wiki edge extraction

`extractWikiLinks(content)` runs the regex → resolves each target via `nameToPath.get(normaliseName(target))` → emits `{ from: path, to: resolved, kind: 'wiki' }`.

`indexFile` is called:
- On file open (from `EditorArea`)
- On file save (from `editorStore.saveFile`)
- Bulk on vault load (from `graphStore.indexAll`, background)

### Semantic edge construction

`addSemanticEdges` runs O(N²) pairwise cosine similarity. For N = 200 notes, that's 40,000 dot-product operations over 384-dim vectors — takes < 100 ms in WASM. For N = 1000+, consider moving to an approximate nearest-neighbor index (annoy, hnswlib) in the future.

The deduplication key:
```typescript
const key = pathA < pathB ? `${pathA}|||${pathB}` : `${pathB}|||${pathA}`;
```
Ensures each pair appears once regardless of which side initiated the comparison, keeping the graph undirected at the data layer even though edges have a `from`/`to` (which is used for arrow direction in the visual only).

### D3 simulation parameters

```typescript
d3.forceSimulation(nodes)
  .force('link',      forceLink(links).distance(kind==='semantic' ? 120 : 70).strength(0.4))
  .force('charge',    forceManyBody().strength(-130))
  .force('center',    forceCenter(width/2, height/2))
  .force('collision', forceCollide(20))
```

Semantic links have a longer rest distance (120 vs 70 px) to visually separate the two edge types even when the graph is small.

---

## 12. Encryption & Security Model

### What is encrypted

| Data | Encrypted | Method |
|---|---|---|
| `.md` files (unlocked dirs) | Never | Plain text on disk |
| `.md` files (locked dirs) | Always | AES-256-GCM, single-archive format (`.vaultnote-vault`) |
| Embedding index | Optional | AES-GCM-256 via Vault Intelligence Lock |
| Vault lock verification hash | N/A | PBKDF2 hash (not reversible) |
| Directory lock verification hash | N/A | PBKDF2 hash |
| Highlight sidecars | Never | Plain JSON |
| UUID registry | Never | Plain JSON |

### Single-archive encryption model

When a directory is locked, all `.md` files are packed into a single JSON manifest and encrypted as one blob. The on-disk layout of a locked directory is:

```
locked-dir/
  .vaultnote-lock.json    ← PBKDF2 salt + key hash (public metadata)
  .vaultnote-vault        ← AES-256-GCM ciphertext of the manifest
```

No file names, file count, or directory structure are visible to an observer without the password. The manifest format uses relative paths as keys, so the archive is self-contained.

On unlock, the archive is decrypted **entirely in memory**. The resulting `{ absPath → content }` map is stored in `lockStore.virtualContents`. All subsequent reads and writes for that directory go through this map — the real filesystem is never touched for the content of locked files within a session. On save, the entire virtual contents map for the directory is re-serialised, re-encrypted, and written back atomically.

### Key derivation

All password-based operations use the same pattern:

```
password + random_salt (32 bytes) 
  → PBKDF2(SHA-256, 200,000 iterations) 
  → 256-bit CryptoKey (AES-GCM)
```

For verification (lock files): the derived key is exported as raw bytes and SHA-256 hashed. The hash is stored. To verify: re-derive key, export, hash, compare — the original password is never stored.

For encryption (embedding index, directory vault): derive key → AES-GCM encrypt with a fresh 12-byte IV. Ciphertext is base64-encoded in the JSON blob (embedding index) or written as a raw encrypted string (vault archive).

### What `.vaultnote-lock.json` exposes

- **`salt`**: a random 32-byte value, public by design. It prevents rainbow-table precomputation — knowing the salt is not useful without the password.
- **`hash`**: SHA-256 of the PBKDF2-derived key. Functionally equivalent to a bcrypt or Argon2 stored hash. It cannot be reversed to recover the password or the encryption key.

The only viable attack is offline brute-force: compute `PBKDF2(candidate, salt, 200_000)`, hash it, compare. At 200,000 iterations per attempt, this is expensive. For strong passwords, it is computationally infeasible.

### Password storage

Passwords exist **only in JS heap memory** (`vaultPasswordStore.password` for the intel lock; `lockStore.sessionPasswords` map for directory locks). They are never:
- Written to disk
- Sent over any network
- Stored in `localStorage`

The session ends when the app closes, clearing all passwords and the virtual FS.

### Ciphertext guard (defence-in-depth)

An old bug caused `loadFile` to cache raw ciphertext into `tabStore.savedContent` (persisted in localStorage). Three guards now prevent any ciphertext from appearing in the UI or being persisted:

1. **`App.tsx` startup sanitiser**: runs before first render, evicts any entry from `tabStore.savedContent` and `editorStore.contents` whose value matches `isEncryptedContent()`.
2. **`Editor/index.tsx` sync guard**: rejects a `value` prop that starts with the `VAULTNOTE_ENCRYPTED:1` prefix before it reaches CodeMirror.
3. **`editorStore.loadFile` sanitiser**: if a disk read returns a ciphertext string (legacy file format), it decrypts before caching — the plaintext (or an error) is what ends up in `contents`, never the ciphertext.

---

## 13. Markdown Rendering Pipeline

```
renderMarkdown(content: string): Promise<string>

unified()
  .use(remarkParse)
  .use(remarkGfm)               ← tables, strikethrough, task lists
  .use(remarkWikiLinks)          ← [[links]] → <a data-wiki-link>
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(addSourceLines)           ← stamps data-source-line on block elements
  .use(addYouTubeMarkers)        ← YouTube URLs → .yt-card-placeholder divs
  .use(rehypeHighlight)          ← code block syntax highlighting
  .use(rehypeRaw)                ← pass through raw HTML (from allowDangerousHtml)
  .use(rehypeSanitize, schema)   ← XSS sanitization
  .use(rehypeStringify)
  .process(content)
  → String(result)
```

The `addSourceLines` plugin walks the HAST and stamps `data-source-line="N"` on: `p`, `h1`–`h6`, `blockquote`, `ul`, `ol`, `li`, `pre`, `table`, `hr`. This is used for scroll sync and click-to-edit.

The `addYouTubeMarkers` plugin detects `<p>` nodes containing exactly one `<a>` child with a YouTube URL. It replaces the `<p>` with a `<div class="yt-card-placeholder" data-yt-id="videoId">`. `MarkdownPreview` post-processes these divs with fetch calls to `noembed.com`.

---

## 14. Persistence Model

### What lives where

| Data | Storage | Key/Path |
|---|---|---|
| Current & recent vaults | `localStorage` | `vaultnote-vault` |
| Open tabs | `localStorage` | `vaultnote-tabs` |
| Flashcard SM-2 states | `localStorage` | `vaultnote-flashcards` |
| Settings | `localStorage` | `vaultnote-settings` |
| Embedding index | Disk (vault root) | `.vaultnote-embeddings.json` |
| UUID registry | Disk (vault root) | `.vaultnote-registry.json` |
| Vault intel lock | Disk (vault root) | `.vaultnote-intel.lock` |
| Directory lock descriptor | Disk (each locked dir) | `.vaultnote-lock.json` |
| Directory encrypted archive | Disk (each locked dir) | `.vaultnote-vault` |
| Highlights | Disk (per-note sidecar) | `.{basename}.highlights.json` |
| Notes | Disk (vault, user dirs) | `*.md` |
| Canvas files | Disk | `*.canvas` |
| Virtual FS (locked dir contents) | JS heap only (lockStore) | — (never persisted) |

### Atomic writes

`write_text_file` in Rust:
1. Write content to `{path}.tmp`
2. `fs::rename({path}.tmp, path)` (atomic on same filesystem)

This prevents partial files if the app crashes mid-write. The vault archive (`.vaultnote-vault`) is rewritten via the same atomic path, so a crash during re-encryption cannot corrupt the archive — the previous version remains until the rename succeeds.

### Browser cache (model)

The AI model is downloaded by Transformers.js and cached via the browser's Cache API (via `env.useBrowserCache = true`). WebView2 persists Cache API storage between sessions in the app's user data directory (`%LOCALAPPDATA%\com.vaultnote.dev\`).

---

## 15. CRUD Cascade Model

All file mutations go through `fileStore` which cascades side effects to other stores:

```
fileStore.renameNode(oldPath, newName)
  │
  ├─ fs.renamePath(oldPath, newPath)           [Rust]
  ├─ refreshNode(parentDir)                    [file tree]
  ├─ tabStore.renameTabPath(old, new)          [tab path + title]
  ├─ editorStore.renameContentPath(old, new)   [content cache key]
  ├─ embeddingStore.renameIndexEntry(old, new) [embedding index + autoPersist]
  └─ noteRegistryStore.movePath(old, new)      [UUID registry + disk save]

fileStore.deleteNode(path, isDirectory)
  │
  ├─ [if virtual node] lockStore.removeVirtualContent(path)
  │   → re-encrypt archive to disk (saveVaultArchive)
  │   → skip fs.removePath (no disk file exists)
  ├─ [if real node] fs.removePath(path, recursive)   [Rust]
  ├─ refreshNode(parentDir)                    [file tree — or virtual rebuild]
  ├─ tabStore.closeTabByPath(path)             [close tab if open]
  ├─ editorStore.removeContent(path)           [evict from cache]
  ├─ embeddingStore.removeIndexEntry(path)     [embedding + autoPersist]
  └─ noteRegistryStore.deregister(path)        [UUID registry + disk save]

fileStore.createFile(parentPath, name)
  │
  ├─ [if virtual parent] lockStore.updateVirtualContent(absPath, '')
  │   → re-encrypt archive to disk (saveVaultArchive)
  │   → skip fs.writeTextFile
  ├─ [if real parent] fs.writeTextFile(absPath, '')   [Rust]
  └─ refreshNode(parentPath)                   [file tree — or virtual rebuild]

fileStore.moveNode(oldPath, targetDir)
  │
  ├─ fs.renamePath(oldPath, newPath)           [Rust — cross-dir move]
  ├─ refreshNode(oldParentDir)                 [old parent tree update]
  ├─ refreshNode(targetDir)                    [new parent tree update]
  └─ [same cascade as renameNode]
```

**Virtual node handling summary**: for any CRUD operation where the target path has a session-unlocked ancestor, `fileStore` bypasses disk operations and instead mutates `lockStore.virtualContents`, then calls `saveVaultArchive` to re-encrypt the archive. The `refreshNode` call for virtual directories rebuilds children from `virtualContents` via `buildVirtualChildren` rather than reading the filesystem.

The cascades use `.getState()` to avoid stale closures:
```typescript
useTabStore.getState().renameTabPath(oldPath, newPath);
```

`embeddingStore.renameIndexEntry` and `removeIndexEntry` call `autoPersist()` (fire-and-forget) so the disk index stays consistent without blocking the UI.

---

## 16. Quick Capture Window

The capture window is a separate Tauri window:

```json
{
  "label": "capture",
  "url": "/?capture=1",
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": true,
  "visible": false,
  "skipTaskbar": true
}
```

`main.tsx` detects `?capture=1` and renders `<QuickCaptureWindow>` instead of `<App>`.

### Vault path resolution in capture window

The capture window has no access to the main window's Zustand store (separate JS context). It reads the vault path from `localStorage`:

```typescript
const raw = localStorage.getItem('vaultnote-vault');
const stored = raw ? JSON.parse(raw) : null;
const vaultPath = stored?.state?.currentVault?.path ?? null;
```

This relies on Zustand's persist middleware writing to `localStorage['vaultnote-vault']` in the main window. Both windows share the same `localStorage` because they share the same origin (`http://localhost:1420` in dev, or the Tauri asset protocol in production).

---

## 17. Data Flow Diagrams

### File open flow

```
User clicks file in sidebar
  → handleFileClick(path)
  → lockStore.isLocked(path)?
      YES → show LockModal → on success: openVaultArchive(dirPath, password)
            → lockStore.setVirtualContents(decryptedMap)
  → editorStore.loadFile(path)
      → check lockStore.virtualContents (virtual FS hit? return plaintext immediately)
      → virtual miss: check contents Map (cache hit? return immediately)
      → cache miss: fs.readTextFile(path)
          → if isEncryptedContent(result): decryptContent(result, sessionPw) [legacy path]
      → tabStore.updateSavedContent(tab.id, content)
  → tabStore.openTab(path, content)
      → existing tab? activate it
      → new tab: push Tab, set activeTabId
  → [EditorArea sees new activeTabId]
  → graphStore.indexFile(path, content)     (update wiki-links)
  → highlightStore.loadHighlights(path)     (load sidecar)
  → [CodeMirrorEditor receives new value prop]
      → ciphertext guard: reject if isEncryptedContent(value)
  → [MarkdownPreview renders new content]
```

### Save flow

```
Auto-save timer fires (or Ctrl+S)
  → editorStore.saveFile(path, content)
  → findSessionUnlockedAncestor(path)?
      YES (virtual path) →
        lockStore.updateVirtualContent(path, content)
        saveVaultArchive(dirPath, sessionPw, allVirtualContentsForDir)
        [atomic Rust write of .vaultnote-vault — no plaintext on disk]
      NO, ancestor in lockedPaths (legacy per-file) →
        encryptContent(content, sessionPw)
        fs.writeTextFile(path, ciphertext)
      NO (normal path) →
        fs.writeTextFile(path, content)         [atomic Rust write]
  → contents.set(path, content)             [update cache]
  → tabStore.updateSavedContent(tab.id, content)
  → tabStore.markDirty(tab.id, false)
  → searchStore.updateIndexEntry(...)       [keep search index fresh]
  → embeddingStore.indexFile(path, content) [re-embed if model ready]
```

### Search flow (semantic)

```
User types in search modal
  → debounce 400ms
  → embeddingStore.search(query, 10)
  → expandQuery(query)                      [short query expansion]
  → embed(expandedQuery)                    [384-dim vector]
  → topK(queryVec, index, 10, _, 0.2)      [O(N) scan + sort]
  → [{path, score}, ...]
  → UI renders results with score bars
```

---

## 18. Key Design Decisions & Tradeoffs

### 1. Single-process Tauri with two windows
**Decision**: Both windows share one Rust process.
**Tradeoff**: Simpler Rust code; no IPC between windows needed for FS operations. Downside: the capture window cannot read main window's in-memory state, requiring the `localStorage` vault path hack.

### 2. No React Router
**Decision**: URL query param (`?capture=1`) as the only routing mechanism.
**Rationale**: Single-page app with no navigation history needed. Adding React Router would be complexity for zero benefit.

### 3. Full D3 redraws
**Decision**: `svg.selectAll('*').remove()` + full rebuild on every graph state change.
**Rationale**: D3's imperative DOM mutations don't reconcile with React. A hybrid (D3 for physics, React for DOM) is more complex. For vaults < 500 notes, full redraws are imperceptible. For larger vaults, move node rendering to a canvas element.

### 4. ONNX on main thread (no WASM proxy)
**Decision**: `env.backends.onnx.wasm.proxy = false`
**Rationale**: Tauri's WebView2 does not serve COOP/COEP headers in production, making `SharedArrayBuffer` unavailable. The multi-threaded WASM backend requires `SharedArrayBuffer`. Single-threaded is ~2–3× slower for large batches but always works.
**Future**: Add COOP/COEP headers in `tauri.conf.json` → re-enable proxy for multi-threaded WASM.

### 5. Embedding index on disk as JSON
**Decision**: Store vectors as `number[]` in a JSON file.
**Rationale**: Simple, debuggable, no binary format dependency. At 384 floats × 8 bytes × 500 notes ≈ 1.5 MB — acceptable. For 10,000+ notes, switch to a binary format (FlatBuffers, raw Float32 binary).

### 6. O(N²) pairwise similarity for semantic graph
**Decision**: Brute-force all pairs.
**Rationale**: Fast enough for < 1,000 notes (< 200 ms). Simple, no external library.
**Future**: For large vaults, use approximate nearest neighbor (e.g., HNSW from `hnswlib-node` or a WASM port).

### 7. Content hash for embedding staleness
**Decision**: SHA-256 of first 4 KB of cleaned content, truncated to 16 hex chars.
**Rationale**: Cheap to compute, stable across equal content, detects edits before paying the embedding cost. False negatives (hash collision) are negligible.

### 8. UUID registry for note identity
**Decision**: Separate `.vaultnote-registry.json` stores `uuid → path`.
**Rationale**: Enables stable cross-note references that survive renames. Currently used as foundation; future features (cross-vault links, reference tracking) can build on it.

### 9. Zustand over Redux / Context
**Decision**: Zustand for all state.
**Rationale**: Minimal boilerplate, supports `getState()` for cross-store calls without hooks, built-in persistence middleware. Context API would cause excessive re-renders across the tree.

### 10. Logarithmic score-to-color mapping
**Decision**: `t = Math.log1p(score × (e−1))` instead of linear.
**Rationale**: `all-MiniLM-L6-v2` cosine scores for related notes cluster between 0.3–0.65. A linear 0–1 scale makes all edges appear orange. The log curve maps score 0.5 → hue 74° (yellow-green) and score 0.38 → hue 60° (yellow midpoint), giving perceptually useful distribution across the realistic score range.

### 11. Single-archive vault format over per-file encryption
**Decision**: All `.md` files in a locked directory are packed into one encrypted archive (`.vaultnote-vault`) rather than encrypting each file individually in-place.
**Rationale**:
- **Metadata leakage**: per-file encryption keeps filenames and directory structure visible on disk. The archive format reveals nothing — no filenames, no count, no structure.
- **Simplicity of virtual FS**: a single archive decrypts to a flat map of paths → content in one operation. There is no need to track which individual files are encrypted and decrypt them lazily.
- **Atomic consistency**: re-encrypting one archive on save is a single atomic disk write. Per-file would require writing N files, any of which could fail mid-way, leaving the directory in a mixed state.
- **Migration**: old per-file encrypted directories are automatically migrated to the archive format on first unlock via `migrateToArchiveIfNeeded`, with no user action required.
- **Tradeoff**: the entire archive must be re-encrypted on every save, even for a small edit. For directories with thousands of large notes, this could be slow. At typical note sizes (1–50 KB each) and counts (< 200 per directory), it is imperceptible.

---

## 19. Adding a New Feature — Checklist

### New store

1. Create `src/stores/featureStore.ts`
2. Define interface + `create<FeatureStore>()`
3. If persisted: add `persist` middleware with a unique key
4. If it writes to disk: use module-level vars for vault path / password, add `autoPersist()` pattern
5. If it needs cross-store calls: use `useSomeStore.getState()` (not the hook) inside actions

### New Tauri command

1. Add function in `src-tauri/src/lib.rs`
2. Register in `tauri::generate_handler!` macro in `run()`
3. Add capability permission in `capabilities/default.json` if needed
4. Add wrapper in `src/lib/fs.ts` (or a dedicated lib file)

### New component

1. Create `src/components/FeatureName/index.tsx`
2. Consume stores via hooks at the top level of the component
3. Add CSS to `src/index.css` under an appropriate section comment
4. Add a keyboard shortcut in `useKeyboardShortcuts.ts` if applicable
5. Add a command in `CommandPalette/index.tsx` if applicable

### CRUD side effects

If your feature tracks per-file state (like embeddings, highlights, registry):
1. Add `renameEntry(oldPath, newPath)` and `removeEntry(path)` actions
2. Wire them into `fileStore.renameNode` and `fileStore.deleteNode` cascades

---

## 20. Known Limitations

| Area | Limitation | Workaround / Future |
|---|---|---|
| **Semantic graph** | O(N²) pairwise similarity | Switch to HNSW for > 1,000 notes |
| **ONNX threading** | Single-threaded (main thread) | Add COOP/COEP headers to enable proxy |
| **Embedding format** | JSON `number[]` (verbose) | Switch to binary Float32 for large vaults |
| **Highlights** | Text-match based; breaks if note content changes | Add offset-based tracking |
| **Capture window** | Reads vault path from `localStorage` (fragile) | Structured IPC channel between windows |
| **Cross-vault links** | Not supported | UUID registry provides the foundation |
| **Mobile / Linux / macOS** | Tested on Windows only | WebView2 → WKWebView/WebKitGTK; path SEP may need adjustment |
| **Conflict resolution** | No CRDT; last-write-wins | External editor changes are auto-reloaded only if tab is clean |
| **Large vaults** | D3 graph becomes cluttered | Virtualized graph or clustering for > 200 nodes |
| **Spell check** | Browser native only | Could integrate a WASM spell-check library |
| **Large locked dirs** | Full archive re-encrypt on every save | Acceptable for typical note sizes; for very large dirs, consider chunked archives |
