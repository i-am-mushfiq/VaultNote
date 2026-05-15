# VaultNote

A local-first, privacy-focused Markdown note-taking app for Windows. All notes live on your own disk — no cloud sync, no accounts, no telemetry.

Built with **Tauri v2 + React 18 + CodeMirror 6**.

---

## Features

### Core editing
- **Vault-based organisation** — open any folder on your machine as a vault
- **Live Markdown preview** — side-by-side or below, draggable split divider
- **Multi-tab editing** — open several files at once with dirty-state indicators
- **Bidirectional scroll sync** — scrolling either pane moves the other to match; click preview to jump the editor to that line
- **Full-text & fuzzy search** — Fuse.js index built on vault load (`Ctrl+F`)
- **Command palette** — `Ctrl+P` for quick file navigation
- **Daily notes** — one-click today's note (`Ctrl+D`)
- **Auto-save** — configurable idle-time auto-save
- **File watcher** — external changes detected via Rust `notify` crate and reflected live
- **Dark / Light / System theme** — toggle in Settings
- **Atomic writes** — crash-safe saves via tmp→rename on disk

### Highlighting & annotations
- **Text highlighting** — select any text in the preview, pick a colour from the floating toolbar
- **Persistent highlights** — stored in a sidecar `.filename.md.highlights.json` file, never touching the original Markdown
- **Double-click to remove** a highlight

### Canvas
- **Infinite canvas** — create `.canvas` files for free-form note arrangement
- **Drag, resize, pan, zoom** cards; each card holds Markdown content

### Intelligence layer *(all 100% local — nothing leaves your machine)*

| Feature | How to access |
|---|---|
| **Semantic search** | `Ctrl+F` → "Semantic" tab after model loads |
| **Similar notes** | ✨ Sparkles button in the status bar |
| **`[[WikiLink]]` navigation** | Click any `[[Note Name]]` link in the preview |
| **Knowledge graph** | 🔗 Network button in status bar *or* sidebar |
| **Backlinks panel** | Part of the Related Notes panel (✨) |
| **Entity / auto-tag panel** | 🏷 Tag button in the status bar |
| **Flashcard review** | 🧠 Brain button in the status bar |
| **Quick Capture** | `Ctrl+Shift+Space` global hotkey (anywhere on the desktop) |
| **Vault Intelligence Lock** | 🛡 Shield button in the sidebar header |

### Privacy & security
- **Per-directory password protection** — lock individual folders; unlock lasts for the session only
- **Vault Intelligence Lock** — optionally encrypt the entire AI embeddings index (AES-GCM, PBKDF2 × 200 000 iterations) with a separate password; unencrypted Markdown files are never touched

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
| Search | Fuse.js v7 (text) + cosine similarity (semantic) |
| Embeddings | Transformers.js — `all-MiniLM-L6-v2` (22 MB ONNX, runs locally in WebView2) |
| Graph | d3-force v7 |
| Styling | Tailwind CSS v3 + CSS custom properties |
| Icons | Lucide React |
| Crypto | Web Crypto API (PBKDF2 / AES-GCM) |
| File watching | Rust `notify` + `notify-debouncer-mini` |
| Global shortcut | `tauri-plugin-global-shortcut` |

---

## Architecture

```
MarkDown_NoteTaker/
├── src/
│   ├── components/
│   │   ├── Canvas/             # Infinite canvas for .canvas files
│   │   ├── CommandPalette/     # Ctrl+P quick-open palette
│   │   ├── Editor/
│   │   │   ├── index.tsx       # Pane orchestrator + intelligence panel buttons
│   │   │   ├── CodeMirrorEditor.tsx
│   │   │   ├── EditorTabs.tsx
│   │   │   ├── MarkdownPreview.tsx  # Highlights, wiki-links, YouTube cards, scroll sync
│   │   │   └── EmptyEditor.tsx
│   │   ├── EntityPanel/        # Auto-extracted entity chips (hashtags, tech, dates…)
│   │   ├── FlashcardMode/      # Full-screen SM-2 flashcard review
│   │   ├── GraphView/          # d3-force knowledge graph overlay
│   │   ├── QuickCapture/       # Floating capture window (global hotkey)
│   │   ├── RelatedNotes/       # Semantic similar + backlinks panel
│   │   ├── Search/             # Text search modal
│   │   ├── Settings/
│   │   ├── Sidebar/            # File tree + graph/lock triggers
│   │   ├── VaultLock/          # Intelligence lock modal (set up / unlock)
│   │   ├── LockModal.tsx       # Per-directory password modal
│   │   └── VaultPicker.tsx
│   ├── hooks/
│   │   ├── useAutoSave.ts
│   │   ├── useFileWatcher.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── lib/
│   │   ├── directoryLock.ts    # Per-folder PBKDF2 lock helpers
│   │   ├── embeddings.ts       # Transformers.js singleton (load, embed, topK)
│   │   ├── entities.ts         # Regex entity extraction (200+ tech terms)
│   │   ├── fs.ts               # Typed invoke() wrappers for all FS ops
│   │   ├── markdown.ts         # unified pipeline: WikiLinks + YouTube markers
│   │   ├── pathUtils.ts
│   │   ├── search.ts           # Fuse.js index
│   │   ├── sm2.ts              # SM-2 algorithm + Q:/A: flashcard parser
│   │   ├── vaultCrypto.ts      # AES-GCM encryption for AI metadata
│   │   └── wikilinks.ts        # remark plugin + wiki-link helpers
│   ├── stores/
│   │   ├── embeddingStore.ts   # Vector index: load/save/search/related
│   │   ├── flashcardStore.ts   # SM-2 review queue (persisted)
│   │   ├── graphStore.ts       # Wiki-link graph: edges, backlinks, name index
│   │   ├── highlightStore.ts   # Highlight sidecar persistence
│   │   ├── lockStore.ts        # Per-directory session unlock state
│   │   ├── vaultPasswordStore.ts # Intelligence lock state (in-memory password)
│   │   ├── editorStore.ts
│   │   ├── fileStore.ts
│   │   ├── searchStore.ts
│   │   ├── settingsStore.ts
│   │   ├── tabStore.ts
│   │   ├── uiStore.ts
│   │   └── vaultStore.ts
│   └── types/index.ts
│
└── src-tauri/
    ├── src/
    │   ├── main.rs
    │   └── lib.rs              # FS commands + file watcher + global-shortcut setup
    ├── Cargo.toml
    ├── tauri.conf.json         # Main window + capture window config
    └── capabilities/
        └── default.json        # Core + dialog + global-shortcut permissions
```

### Key design decisions

**Custom Rust FS commands**
Tauri's built-in FS plugin requires declaring every allowed path in capabilities JSON, which doesn't work for a vault-picker that can open *any* folder. All file operations are implemented as `#[tauri::command]` functions and called via `invoke()`.

**Atomic writes**
`write_text_file` writes to `<path>.tmp` then renames over the target, so a crash mid-write never corrupts the original.

**Local-only embeddings**
`Transformers.js` runs the `all-MiniLM-L6-v2` ONNX model entirely inside WebView2. The model is downloaded once (~22 MB) and cached by the browser's Cache API — it persists across restarts. Zero network calls after first load.

**Vault Intelligence Lock**
Embeddings are stored in `.vaultnote-embeddings.json` at the vault root. Without a lock, this file is plaintext JSON. When locked, the entire object is AES-GCM encrypted with a PBKDF2-derived key (200 000 iterations, SHA-256, random salt). The password is kept in memory only and discarded when the app closes. Markdown files are never encrypted.

**Per-directory locking**
A `.vaultnote-lock.json` inside the folder holds the PBKDF2 key hash — never a plaintext password. Verification re-derives and compares hashes. A successful unlock is remembered in-memory for the session.

**WikiLinks**
A custom remark plugin intercepts `[[Note Name]]` and `[[Note Name|Display]]` syntax before the rehype pass. Each link becomes an `<a data-wiki-link="Note Name">` element. A click handler in `MarkdownPreview` resolves the name via `graphStore.nameToPath` and opens the target file.

**YouTube cards**
The rehype pipeline detects paragraphs containing a single standalone YouTube URL and marks them as `<div class="yt-card-placeholder" data-yt-id="…">`. After render, a `useEffect` fetches thumbnail + title from noembed.com and replaces the placeholder with a card.

**Quick Capture window**
A second Tauri window (`label: "capture"`) is configured as borderless, always-on-top, and hidden at startup. The global shortcut `Ctrl+Shift+Space` toggles its visibility. The window loads the same SPA at `/?capture=1`; `main.tsx` detects this and renders `<QuickCaptureWindow>` instead of `<App>`.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 or later |
| Rust + Cargo | stable (1.77+) |
| Tauri CLI | v2 (`npm i -g @tauri-apps/cli`) |
| WebView2 runtime | Pre-installed on Windows 10 / 11 |

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

# 4. Production build  →  src-tauri/target/release/
npm run tauri build
```

The first Rust compile takes a few minutes. Subsequent builds are incremental.

---

## Usage

### Opening a vault

On first launch click **Open Folder** and pick any directory. VaultNote treats that folder (and all subfolders) as your vault. The path is remembered across sessions.

### Editing

- Click a `.md` file in the sidebar to open it.
- Drag the divider between editor and preview to resize; toggle preview on/off with the **Preview** button in the status bar.
- Switch the preview to bottom layout with the **⊞** icon next to Preview.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+P` | Command palette |
| `Ctrl+F` | Search |
| `Ctrl+D` | Today's daily note |
| `Ctrl+N` | New file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+Space` | Quick Capture (global, works when app is in background) |

### WikiLinks

Write `[[Note Name]]` or `[[Note Name|Display Text]]` anywhere in a note. In the preview, clicking the link opens the target file. The graph and backlinks panel are built from these links.

### Knowledge graph

Click the **🔗 Network** icon in the status bar (or the sidebar header). The graph shows every note as a node and every `[[WikiLink]]` as an edge. You can:
- **Drag** nodes to rearrange
- **Zoom / pan** with scroll + drag
- **Click a node** to open that note and close the graph

### Semantic search & Similar Notes

On first vault open, VaultNote downloads `all-MiniLM-L6-v2` (~22 MB, once) and indexes all your Markdown files in the background. After the model is ready:
- Press **Ctrl+F**, switch to the **Semantic** tab, and type a natural-language query.
- Open the **✨ Sparkles** panel (status bar) to see the 6 most similar notes to the one currently open, sorted by cosine similarity.

### Backlinks

The ✨ Sparkles panel also shows a **Backlinks** section — every note that links *to* the current file via `[[WikiLink]]`.

### Entity panel

Click the **🏷 Tag** icon in the status bar. VaultNote extracts and groups:
- `#Hashtags` and `@Mentions` from the text
- **Tech terms** (200+ keywords: React, Python, Docker, etc.)
- **Concepts** (capitalised multi-word phrases)
- **Dates** and **URLs**

### Flashcard review (spaced repetition)

Write flashcards anywhere in a note using this format:

```
Q: What is the SM-2 algorithm?
A: A spaced-repetition scheduling algorithm that adjusts review intervals based on recall quality.

Q: What does PBKDF2 stand for?
A: Password-Based Key Derivation Function 2.
```

Click the **🧠 Brain** icon in the status bar to start a review session for the current file. Rate each card **Again / Hard / Good / Easy** after flipping it. The next review date is calculated automatically.

### YouTube video cards

Paste a YouTube URL on its own line (no other text on that line):

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

The preview renders it as a card with the video thumbnail, title, and channel name. Click the card to open YouTube.

### Highlighting

Select any text in the preview — a colour toolbar appears above the selection. Click a colour to save the highlight. Highlights survive re-renders and are stored in a hidden sidecar file (`.filename.md.highlights.json`). Double-click a highlighted word to remove it.

### Quick Capture

Press **`Ctrl+Shift+Space`** from anywhere on your desktop (even when VaultNote is minimised). A small floating window appears. Type your thought, then press **Ctrl+Enter** (or the Save button) to append it to `Inbox.md` in your vault root. Press **Esc** to dismiss without saving.

### Per-directory password protection

1. Right-click a folder → **Lock Directory…**
2. Enter and confirm a password. A `.vaultnote-lock.json` file is written inside that folder.

To access: click (or right-click → **Unlock for Session…**) and enter the password. The folder stays unlocked until the app closes.

To remove: right-click an unlocked folder → **Remove Password…**

### Vault Intelligence Lock

Click the **🛡 Shield** icon in the sidebar header.

- **First time (Setup mode):** Enter and confirm a password. The AI embeddings index is encrypted on disk from this point on. The lock badge next to the vault name shows "locked" when the password hasn't been entered yet for this session.
- **Subsequent opens (Unlock mode):** Enter the password to decrypt the index and enable semantic search and Similar Notes.
- **Remove lock:** Enter the current password and click "Remove lock" to switch back to unencrypted storage.

> Without a Vault Intelligence Lock, the embeddings index (`.vaultnote-embeddings.json`) is stored as plaintext. Your Markdown files are **never** encrypted either way.

### Canvas

Create a file with a `.canvas` extension to open the infinite canvas view. Use the toolbar to add cards, then drag, resize, and connect them freely.

---

## Project Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server only (no Tauri shell) |
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
