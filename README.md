# VaultNote

A local-first, privacy-focused Markdown note-taking app for Windows. All notes live on your own disk — no cloud sync, no accounts, no telemetry.

Built with **Tauri v2 + React 18 + CodeMirror 6**.

---

## Features

- **Vault-based organisation** — open any folder on your machine as a vault
- **Live Markdown preview** — side-by-side or below, draggable split divider
- **Per-directory password protection** — lock individual folders with PBKDF2-derived keys; unlock lasts only for the current session
- **Multi-tab editing** — open several files at once with dirty-state indicators
- **Full-text & fuzzy search** — Fuse.js index built on vault load, accessible via `Ctrl+F`
- **Command palette** — `Ctrl+P` for quick file navigation
- **Daily notes** — one-click today's note (`Ctrl+D`)
- **Auto-save** — configurable idle-time auto-save
- **File watcher** — external changes detected via Rust `notify` crate and reflected live
- **Dark / Light theme** — toggle in settings
- **Keyboard shortcuts** — `Ctrl+S` save, `Ctrl+W` close tab, `Ctrl+Tab` cycle tabs
- **Atomic writes** — crash-safe saves via tmp→rename on disk

---

## Screenshots

<img width="3840" height="2160" alt="image" src="https://github.com/user-attachments/assets/8fdef4fc-3f05-4c88-9b2d-2d03639ac4cd" />
<img width="3840" height="2160" alt="image" src="https://github.com/user-attachments/assets/0f6ce125-0c4a-4ed4-b7e4-bc8e4404d933" />
<img width="3840" height="2160" alt="image" src="https://github.com/user-attachments/assets/ce8b341f-2770-4eb8-93e2-ba0d3f98649a" />




---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (WebView2 on Windows) |
| Frontend | React 18, TypeScript 5, Vite 5 |
| Editor | CodeMirror 6 |
| Markdown | unified / remark / rehype pipeline |
| State | Zustand v4 with `persist` middleware |
| Search | Fuse.js v7 |
| Styling | Tailwind CSS v3 + CSS custom properties |
| Icons | Lucide React |
| Crypto | Web Crypto API (PBKDF2 / AES-GCM) |
| File watching | Rust `notify` + `notify-debouncer-mini` |

---

## Architecture

```
MarkDown_NoteTaker/
├── src/                        # React / TypeScript frontend
│   ├── components/
│   │   ├── CommandPalette/     # Ctrl+P quick-open palette
│   │   ├── Editor/
│   │   │   ├── index.tsx       # Pane orchestrator, split drag logic
│   │   │   ├── CodeMirrorEditor.tsx
│   │   │   ├── EditorTabs.tsx
│   │   │   ├── MarkdownPreview.tsx
│   │   │   └── EmptyEditor.tsx
│   │   ├── Search/             # Full-text search modal
│   │   ├── Settings/           # Settings panel
│   │   ├── Sidebar/
│   │   │   ├── index.tsx       # Sidebar shell
│   │   │   ├── FileTreeNode.tsx # Lazy-loading tree node + lock UI
│   │   │   └── ContextMenu.tsx  # Right-click menu + lock modals
│   │   ├── LockModal.tsx       # Set / verify / remove password modal
│   │   └── VaultPicker.tsx     # Open-folder dialog on first launch
│   ├── hooks/
│   │   ├── useAutoSave.ts      # Debounced auto-save on content change
│   │   ├── useFileWatcher.ts   # Subscribes to Tauri vault-file-change events
│   │   └── useKeyboardShortcuts.ts
│   ├── lib/
│   │   ├── fs.ts               # Typed invoke() wrappers for all FS ops
│   │   ├── directoryLock.ts    # PBKDF2 lock/verify/remove helpers
│   │   ├── markdown.ts         # unified pipeline + word-count util
│   │   ├── pathUtils.ts        # Cross-platform path helpers
│   │   ├── search.ts           # Fuse.js index builder
│   │   └── dailyNote.ts        # Daily-note path generator
│   ├── stores/                 # Zustand state (all persisted to localStorage)
│   │   ├── vaultStore.ts       # Active vault path
│   │   ├── fileStore.ts        # Lazy file tree + flatNodes Map
│   │   ├── tabStore.ts         # Open tabs, dirty state, scroll position
│   │   ├── editorStore.ts      # File load / save / in-memory content cache
│   │   ├── searchStore.ts      # Search query + Fuse.js results
│   │   ├── settingsStore.ts    # Theme, preview side, split ratio, etc.
│   │   ├── lockStore.ts        # Locked paths + session-unlocked paths
│   │   └── uiStore.ts          # Modal visibility, context menu, rename target
│   └── types/index.ts
│
└── src-tauri/                  # Rust / Tauri backend
    ├── src/
    │   ├── main.rs             # Tauri app entry point
    │   └── lib.rs              # All custom commands + file watcher
    ├── Cargo.toml
    ├── tauri.conf.json         # Window config, app identifier
    └── capabilities/
        └── default.json        # Minimal permissions (core + dialog only)
```

### Key design decisions

**Custom Rust FS commands instead of `tauri-plugin-fs`**
Tauri's built-in FS plugin requires declaring every allowed path in capabilities JSON, which doesn't work for a vault-picker that can open *any* folder. All file operations (`read_text_file`, `write_text_file`, `read_dir`, `create_dir`, `remove_path`, `rename_path`, etc.) are implemented as `#[tauri::command]` functions in `lib.rs` and called via `invoke()`.

**Atomic writes**
`write_text_file` writes to `<path>.tmp` then renames over the target. If the process is killed mid-write the original file is untouched.

**Lazy file tree**
`fileStore` only fetches a directory's children when it is expanded. Each node is stored in a `flatNodes: Map<string, FileNode>` for O(1) path lookup during file-watcher updates.

**Per-directory locking**
Locking a folder creates a `.vaultnote-lock.json` file inside it containing a PBKDF2-derived key hash (200 000 iterations, SHA-256, random 16-byte salt). Verification re-derives the key and compares hashes — no plaintext password is ever stored. A successful unlock is recorded in-memory (`lockStore.sessionUnlocked`) and forgotten when the app closes.

**Split-pane resize**
`Editor/index.tsx` tracks a `mousedown` on the divider, then updates `settings.editorPreviewSplit` (0.2–0.8) on every `mousemove`. The ratio is persisted via Zustand `persist` so it survives restarts.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 or later |
| Rust + Cargo | stable (1.77+) |
| Tauri CLI | v2 (`npm i -g @tauri-apps/cli`) |
| WebView2 runtime | Pre-installed on Windows 10/11 |

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/vaultnote.git
cd vaultnote

# 2. Install JS dependencies
npm install

# 3. Start development build (hot-reload)
npm run tauri dev

# 4. Production build (outputs to src-tauri/target/release/)
npm run tauri build
```

The first Rust compile takes a few minutes. Subsequent builds are incremental.

---

## Usage

### Opening a vault

On first launch, click **Open Folder** and pick any directory on your machine. VaultNote treats that folder (and all subfolders) as your vault. The path is remembered across sessions.

### Editing files

- Click a `.md` file in the sidebar to open it in a new tab.
- The editor and preview panels are separated by a draggable divider — drag it left/right (or up/down if preview is set to **bottom**) to resize.
- Toggle the preview on/off with the **Preview** button in the status bar.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Cycle to next tab |
| `Ctrl+P` | Open command palette |
| `Ctrl+F` | Open search |
| `Ctrl+D` | Open / create today's daily note |

### Password-protecting a directory

1. Right-click a folder in the sidebar.
2. Choose **Lock Directory…**
3. Enter and confirm a password. A `.vaultnote-lock.json` file is written into the folder.

To access a locked folder:

1. Click (or right-click → **Unlock for Session…**) on the locked folder.
2. Enter the password. The folder stays unlocked until you close the app or choose **Re-lock**.

To remove the password entirely, right-click an unlocked folder and choose **Remove Password…**, then confirm with the current password.

> The lock file is a plain JSON file in the folder. Deleting `.vaultnote-lock.json` manually removes the lock without needing the password.

### Settings

Click the gear icon in the sidebar footer to open Settings. Options include:

- **Theme** — Dark / Light
- **Font size**
- **Editor width** — narrow / normal / wide
- **Preview side** — Right or Bottom
- **Auto-save delay**

---

## Project Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server only (no Tauri shell) |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run tauri dev` | Full dev build with Tauri shell + hot-reload |
| `npm run tauri build` | Production `.exe` / installer |

---

## Contributing

1. Fork the repo and create a feature branch.
2. Run `npm run tauri dev` to verify your changes locally.
3. Keep PRs focused — one feature or fix per PR.

---

## License

MIT
