# VaultNote

A local-first, AI-powered Markdown knowledge base — built with Tauri, React, and on-device semantic intelligence. All your notes stay on your machine. No cloud, no subscriptions, no tracking.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Feature Overview](#feature-overview)
3. [Installation & First Launch](#installation--first-launch)
4. [Vault Management](#vault-management)
5. [The Editor](#the-editor)
6. [Markdown & Wiki-Links](#markdown--wiki-links)
7. [Tabs](#tabs)
8. [Full-Text Search](#full-text-search)
9. [Semantic (AI) Search](#semantic-ai-search)
10. [Knowledge Graph](#knowledge-graph)
11. [Related Notes Panel](#related-notes-panel)
12. [Entity Panel](#entity-panel)
13. [Quick Capture](#quick-capture)
14. [Flashcards](#flashcards)
15. [Canvas](#canvas)
16. [Text Highlights](#text-highlights)
17. [Daily Notes & Templates](#daily-notes--templates)
18. [Vault Intelligence Lock](#vault-intelligence-lock)
19. [Directory Locks](#directory-locks)
20. [Settings](#settings)
21. [Keyboard Shortcuts](#keyboard-shortcuts)
22. [Internal Files Written to Your Vault](#internal-files-written-to-your-vault)

---

## Philosophy

VaultNote is built around one idea: **your knowledge should live on your machine, in plain Markdown files, and be as smart as possible without ever leaving your device.**

- Every note is a `.md` file you can open in any editor — unless it lives in a locked directory, in which case it is AES-256-GCM encrypted on disk and only accessible through VaultNote after entering your password.
- AI embeddings are computed locally (no API key, no internet after first model download).
- Encryption is done in the browser with AES-GCM; passwords never touch disk.
- The app is a thin Tauri shell — your vault is just a folder.

---

## Feature Overview

| Category | Features |
|---|---|
| **Editor** | CodeMirror 6, split editor/preview, live markdown render, scroll sync, click-to-edit |
| **Linking** | `[[Wiki-Links]]`, backlinks panel, graph view |
| **AI Search** | On-device semantic search (all-MiniLM-L6-v2), no API key required |
| **Knowledge Graph** | Force-directed graph, wiki + semantic edges, color-coded similarity, threshold slider |
| **Capture** | Global hotkey (`Ctrl+Shift+Space`), auto-titles from headings, appends to Inbox |
| **Flashcards** | SM-2 spaced repetition, parsed from `Q:`/`A:` blocks in any note |
| **Canvas** | Infinite freeform canvas, markdown cards, color-coded, drag/resize |
| **Highlights** | In-preview text highlights, 5 colors, persisted as sidecar files |
| **Security** | Real AES-256-GCM encryption for locked directories (single-archive approach), Vault Intelligence Lock (encrypts AI index) |
| **Portability** | Plain `.md` files — works with Obsidian, Typora, VS Code, etc. (for unlocked notes) |

---

## Installation & First Launch

### Requirements

- Windows 10/11 with WebView2 (pre-installed on Win 11; auto-downloaded on Win 10)
- ~50 MB disk for the app + ~25 MB for the AI model (downloaded once on first use)

### From source

```bash
# Prerequisites: Node 18+, Rust 1.77+, Tauri CLI v2
git clone <repo>
cd MarkDown_NoteTaker
npm install
npm run tauri dev        # development build
npm run tauri build      # production installer
```

### First launch

1. The vault picker screen appears.
2. Click **Open Vault** to point VaultNote at any existing folder of Markdown files.
3. Or click **New Vault** — enter a name, pick a location. VaultNote creates starter folders (`Journal/`, `Notes/`, `Inbox/`) and a `Welcome.md`.
4. Recent vaults appear on the picker for one-click reopening. Remove any with the ✕ button.

---

## Vault Management

A *vault* is just a directory on disk. VaultNote adds a few hidden metadata files (prefixed with `.vaultnote-`); everything else is standard Markdown.

### Opening, switching, closing

- **Open Vault**: sidebar header → folder icon, or the vault picker screen.
- **Close Vault**: sidebar footer → ✕ button. Returns to the picker.
- **Recent Vaults**: shown on the picker; up to 10 remembered.

### File tree

The sidebar shows your vault's folder structure. Directories expand/collapse on click. Hidden files (names starting with `.`) are filtered out by the Rust layer.

### Creating files and folders

- **New File** (`Ctrl+N` or the `FilePlus` icon): prompts for a name; `.md` is added automatically if omitted.
- **New Folder** (`FolderPlus` icon): prompts for a name.

### Right-click context menu

Right-click any file or folder in the tree for:

| Action | Description |
|---|---|
| **New File / New Folder** | Create inside that directory |
| **Rename** | Inline rename; updates all open tabs and the search index automatically |
| **Move to…** | Pick any other directory in the vault; cascades to tabs and search |
| **Copy Path** | Copies the absolute path to the clipboard |
| **Lock / Unlock** | Set or verify a directory password (see [Directory Locks](#directory-locks)) |
| **Delete** | Removes the file or folder; evicts from all open tabs |

### File watcher

VaultNote watches your vault with a debounced (500 ms) Rust file watcher. If you edit a note externally (in VS Code, etc.) and it has an open tab that is not dirty, the tab reloads automatically.

---

## The Editor

### Split view

The editor area is split between a **CodeMirror 6** source editor (left/top) and a **Markdown preview** (right/bottom). You can:

- Drag the divider to adjust the split ratio.
- Toggle the editor pane: status bar editor icon or `Ctrl+Shift+E`.
- Toggle the preview pane: status bar preview icon or `Ctrl+Shift+V`.
- Flip the layout (side-by-side ↔ top-bottom): status bar flip icon.

### Source editor features

- Full Markdown syntax highlighting (CodeMirror `@codemirror/lang-markdown` with all code language support)
- Bracket matching and auto-close
- Line numbers, highlight active line
- Word wrap (toggleable in Settings)
- Indentation with Tab
- History (undo/redo)
- Drag-and-drop images: drop an image file onto the editor; it is copied to `vault/_assets/`, and a `![name](_assets/file.ext)` link is inserted at the drop position.

### Preview features

- Full GFM (GitHub Flavored Markdown): tables, strikethrough, task lists, etc.
- Syntax-highlighted code blocks (via `highlight.js` — GitHub Dark theme)
- Wiki-link rendering (styled as `[[Link]]` with click navigation)
- Relative image rendering (paths resolved to Tauri asset URLs automatically)
- YouTube embeds: paste a YouTube URL on its own line; preview shows the video thumbnail and title, lazy-loading the iframe on click
- Click any preview block to jump the source editor to that line (click-to-edit)
- Scroll sync: scrolling editor or preview moves the other pane to the matching line

### Auto-save

Changes are auto-saved after an idle period (default: 1 second). Configurable in Settings (500 ms – 5 s). A dirty dot (●) on the tab indicates unsaved changes. Save manually with `Ctrl+S`.

### Canvas files

Files with a `.canvas` extension open in the [Canvas](#canvas) view instead of the editor.

---

## Markdown & Wiki-Links

### Supported syntax

VaultNote renders standard CommonMark + GitHub Flavored Markdown extensions:

- Headings, bold, italic, strikethrough, inline code, code blocks
- Tables, task lists (checkboxes disabled in preview — edit the source)
- Blockquotes, horizontal rules
- Images and links

### Wiki-Links

Type `[[Note Name]]` to link to another note by its filename (without extension). Capitalization and spaces are normalized.

- Use a pipe for custom display text: `[[Note Name|What you see]]`
- Click a wiki-link in the preview to open that note.
- Unresolved links (file does not exist) are still rendered but do nothing on click.

### Backlinks

The **Related Notes** panel (Sparkles icon in the status bar) shows which other notes link *to* the current note in a **Backlinks** section.

---

## Tabs

- **Open**: click a file in the sidebar, or click a wiki-link.
- **Close**: click the × on the tab, or `Ctrl+W`. A dirty tab asks for confirmation.
- **Reorder**: drag tabs left or right.
- **Pin**: right-click a tab to pin it; pinned tabs cannot be closed with `Ctrl+W`.
- **Middle-click**: closes a tab.
- **Restore**: `Ctrl+Shift+T` reopens the last closed tab (up to 10 remembered).
- **Switch by number**: `Ctrl+1` through `Ctrl+9` jumps to the nth tab.

Tabs survive app restarts (persisted in `localStorage`).

---

## Full-Text Search

Press `Ctrl+F` or `Ctrl+P` to open the search modal.

- Powered by **Fuse.js** — fuzzy matching across note titles (weight 2×) and content (weight 1×).
- Results show the note title, a highlighted excerpt around the match, and the parent directory.
- Arrow keys to navigate; `Enter` to open the selected note.
- Switch to Semantic Search mode by clicking the **Semantic** tab or pressing `Tab` inside the modal.

The index is built in the background when a vault loads and updated incrementally on every save.

---

## Semantic (AI) Search

VaultNote embeds every note locally using **all-MiniLM-L6-v2** (22 MB, runs in WebView2 via ONNX WebAssembly). The model is downloaded once and cached by the browser.

### Setup

No configuration needed. When you open a vault:

1. The model downloads in the background (progress shown in the Vault Intelligence status).
2. Notes are embedded one batch at a time; unchanged notes (detected by content hash) are skipped on subsequent loads.
3. The embedding index is saved to `.vaultnote-embeddings.json` in your vault root so the next load is fast.

A ✦ (Sparkles) icon in the sidebar filter input lights up when the model is ready.

### Using semantic search

- **Sidebar filter**: type any query. Below the name-match results, a **Semantic** section appears with the top 8 most similar notes and a percentage score.
- **Search modal**: switch to the **Semantic** tab for a full semantic search with similarity bars.
- Short queries (1–2 words) are automatically expanded internally for better accuracy (e.g., "TV" → "TV TV topics and notes about TV").

### Similarity scores

Scores reflect cosine similarity of 384-dimensional embedding vectors:

| Score | Meaning |
|---|---|
| 70%+ | Strongly related |
| 45–70% | Thematically related |
| < 45% | Loosely related |

---

## Knowledge Graph

Click the **Network** icon in the sidebar header to open the Knowledge Graph — a force-directed visualization of all notes and their connections.

### Node types

- Every `.md` file is a node.
- The **active file** appears larger and highlighted in the accent color.
- Click any node to open that note.
- Drag nodes to pin them; release to let them float again.
- Zoom (0.15× – 5×) and pan with scroll/drag on the background.

### Edge types

| Edge | Appearance | Meaning |
|---|---|---|
| **Wiki** | Solid gray line with arrow | An explicit `[[Wiki-Link]]` from one note to another |
| **Semantic** | Dashed colored line with arrow | AI-detected thematic similarity above the current threshold |

### Controls

**Links toggle** — show/hide wiki-link edges (displays count).

**Semantic toggle** — show/hide semantic edges (displays visible / total count).

**Color mode** (Palette icon, visible when semantic edges are on) — when active, each semantic edge is colored on a log-scale gradient:

- Red → low similarity
- Yellow → moderate similarity
- Green → high similarity

The scale is logarithmic: because real semantic scores rarely exceed 0.7–0.8, the color midpoint (yellow) corresponds to a score of ~0.38 rather than 0.50, giving a much more useful color spread across the realistic range.

**Similarity threshold slider** — drag to set the minimum similarity score for displaying semantic edges (0.10 – 0.99). The current threshold value is displayed in its own gradient color so you can immediately see where you are on the scale. Edge counts update live.

**Redraw button** — re-runs the force simulation from scratch.

---

## Related Notes Panel

Open from the status bar **Sparkles** icon (or the Graph button inside the editor).

Two sections:

**Semantically Similar** — the 6 most similar notes to the current file, with similarity percentages. Color-coded: green (> 60%), accent (45–60%), muted (< 45%). Updates when you switch tabs.

**Backlinks** — notes that contain a `[[Wiki-Link]]` pointing to the current file.

---

## Entity Panel

Open from the status bar **Tag** icon.

Extracts structured entities from the current note using regex (no ML, instant):

| Type | Example |
|---|---|
| Hashtag | `#project` |
| Mention | `@alice` |
| Tech term | React, Kubernetes, WASM |
| Concept | Capitalized 2–4 word phrases |
| Date | 2024-01-15, January 15, etc. |
| URL | https://… |

Entities are grouped by type and shown as tag chips with a tooltip showing how many times they appear.

---

## Quick Capture

Press `Ctrl+Shift+Space` (global — works even when VaultNote is in the background or minimized) to open a small floating capture window.

### How it works

1. The capture window appears in the top-right of your screen, transparent and always on top.
2. Type or paste your content.
3. Press `Ctrl+Enter` to save, or `Escape` to dismiss without saving.

### Auto-titling

VaultNote inspects the first line of your content:

- **Starts with a Markdown heading** (`# Title`, `## Title`, etc.) → saved as its own file named after the heading. If `Title.md` already exists, it tries `Title 2.md`, `Title 3.md`, etc.
- **No heading** → appended as a timestamped entry to `Inbox.md` in your vault root.

The footer of the capture window shows a live destination hint (e.g., `📄 → My Article.md` or `📥 → Inbox.md`) before you save.

This makes it ideal for dumping LLM responses: paste the response, and if the AI put a `# Title` at the top, the file is automatically created and named correctly.

---

## Flashcards

VaultNote turns any note into a flashcard deck. Add question/answer pairs in this format anywhere in a note:

```
Q: What is spaced repetition?
A: A memorization technique where review intervals increase based on recall quality.

Q: Who invented the SM-2 algorithm?
A: Piotr Wozniak.
```

### Using flashcard mode

1. Open the note containing Q/A pairs.
2. Click the **Brain** icon in the status bar.
3. Cards are presented one at a time. Click the card to reveal the answer.
4. Rate yourself: **Again** (forgot), **Hard**, **Good**, **Easy**.
5. VaultNote uses the SM-2 algorithm to schedule each card's next review. Cards due today are prioritized; the rest are shown in order.

SM-2 state (repetitions, interval, ease factor) is persisted in `localStorage`.

---

## Canvas

Double-click any `.canvas` file to open the infinite canvas view (or create one via New File with a `.canvas` extension).

### Canvas controls

| Action | How |
|---|---|
| Pan | Drag the background |
| Zoom | Scroll wheel (0.2× – 2.5×) |
| Reset zoom | Reset button (HUD) |
| New card | Double-click background, or "+ Card" button |
| Move card | Drag card header |
| Resize card | Drag bottom-right handle |
| Edit card | Double-click card body |
| Delete card | Select card → Delete/Backspace |
| Color card | Click color dot on card header |

Cards render full Markdown including code highlighting. Canvas state is auto-saved 800 ms after any change.

---

## Text Highlights

While in preview mode, select any text with your mouse. A floating color toolbar appears with five colors: Yellow, Green, Blue, Pink, and Orange.

- Click a color to create a highlight.
- Highlights are shown as `<mark>` elements in the preview.
- Double-click an existing highlight to remove it.
- Highlights are stored in hidden sidecar files (e.g., `.MyNote.highlights.json`) and do not modify your Markdown source.

---

## Daily Notes & Templates

Press `Ctrl+D` to open or create today's daily note. It is stored at:

```
vault/Journal/yyyy/yyyy-MM-dd.md
```

The file is created with a date heading and sections for Today / Notes / Tasks if it doesn't exist yet.

### Note templates

The Command Palette (`Ctrl+Shift+P`) offers five templates:

| Template | Description |
|---|---|
| Daily Note | Date, Today, Notes, Tasks |
| Meeting Note | Attendees, Agenda, Notes, Action Items |
| Research Note | Source, Key Findings, Questions, References |
| Reflection | What went well, What to improve, Gratitude |
| Idea | Problem, Solution, Implementation, Next Steps |

---

## Vault Intelligence Lock

VaultNote's AI features (semantic search, knowledge graph) rely on an embedding index stored in `.vaultnote-embeddings.json`. If your notes are sensitive, you can encrypt this index with a password.

Click the **Shield** icon in the sidebar header.

- **Set up lock**: choose a password. The index is re-saved in AES-GCM encrypted form. The PBKDF2-derived key (200,000 iterations, SHA-256) is verified against a stored hash — the password itself is never written anywhere.
- **Unlock**: enter your password each session. The index is decrypted in memory only.
- **Remove lock**: verified removal; index is re-saved unencrypted.

The vault's `.md` files are **not** encrypted by this feature — this lock protects only the AI metadata. To encrypt the notes themselves, use [Directory Locks](#directory-locks).

---

## Directory Locks

Right-click any folder → **Lock**. Set a password for that directory.

This is **real AES-256-GCM encryption** — your note contents are cryptographically protected on disk, not merely hidden behind an app-level gate.

### What happens when you lock a directory

1. VaultNote reads all `.md` files in the directory and serialises them into a single JSON manifest: `{ version: 1, files: { "rel/path.md": "content", ... } }`.
2. That manifest is AES-256-GCM encrypted using a key derived from your password via PBKDF2 (200,000 iterations, SHA-256).
3. The ciphertext is written to `.vaultnote-vault` inside the directory.
4. The original `.md` files are **permanently deleted from disk**. Empty subdirectories are pruned.
5. A `.vaultnote-lock.json` file stores the PBKDF2 salt and a SHA-256 hash of the derived key (for future password verification). The actual encryption key is never stored anywhere.

After locking, the directory on disk contains exactly two files: `.vaultnote-lock.json` and `.vaultnote-vault`. No file names, no directory structure, and no note count are visible to anyone without the password.

### What happens when you unlock (session access)

1. You enter your password; VaultNote verifies it against the hash in `.vaultnote-lock.json`.
2. The `.vaultnote-vault` archive is decrypted **in memory only** — nothing is written back to disk.
3. The decrypted file paths and content are held in an in-memory virtual file system for the duration of your session.
4. The file tree in the sidebar synthesises the virtual files as normal nodes — you can open, edit, create, and delete notes just as you would with unlocked files.
5. When you save an edit to a note inside the locked directory, VaultNote updates the in-memory content, re-encrypts the entire archive, and writes the new ciphertext to `.vaultnote-vault`. **No plaintext ever touches disk.**

### Permanently removing a lock

Right-click the directory → **Remove Lock** (requires your password). VaultNote decrypts the archive, restores all `.md` files to disk, and deletes `.vaultnote-vault`.

### Security of the lock file

`.vaultnote-lock.json` contains two fields:

- **`salt`**: public by design (a random value that prevents rainbow-table attacks); not secret.
- **`hash`**: a PBKDF2-derived key hash, equivalent in role to a bcrypt or Argon2 stored hash. It cannot be reversed to recover your password.

The only attack vector against a locked directory is offline brute-force against the PBKDF2 hash. The 200,000-iteration count makes this computationally expensive.

### Re-locking a session

Right-click the directory → **Revoke Session**. This clears the in-memory virtual file system for that directory — the decrypted content is gone from memory and the directory is locked again until you re-enter the password.

---

## Settings

Open with `Ctrl+,` or the sidebar Settings icon.

| Setting | Options | Default |
|---|---|---|
| **Theme** | Dark, Light, System | Dark |
| **Editor Font Family** | Mono, Sans-serif, Serif | Mono |
| **Editor Font Size** | 12–20 px | 14 px |
| **Line Height** | 1.2–2.0 | 1.7 |
| **Editor Width** | Readable (prose-width), Full | Readable |
| **Word Wrap** | On / Off | On |
| **Spell Check** | On / Off | Off |
| **Show Preview** | On / Off | On |
| **Preview Side** | Right, Bottom | Right |
| **Auto-save Interval** | 500 ms – 5 s | 1 s |

---

## Keyboard Shortcuts

### Global (work even when the app is unfocused)

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Space` | Toggle Quick Capture window |

### App shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+F` / `Ctrl+P` | Open search modal |
| `Ctrl+Shift+P` | Open command palette |
| `Ctrl+S` | Save current file |
| `Ctrl+N` | New file |
| `Ctrl+D` | Open / create today's daily note |
| `Ctrl+W` | Close active tab |
| `Ctrl+Shift+T` | Restore last closed tab |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+E` | Toggle editor pane |
| `Ctrl+Shift+V` | Toggle preview pane |
| `Ctrl+,` | Open settings |
| `Ctrl+1` – `Ctrl+9` | Switch to tab by index |
| `Escape` | Close topmost overlay |

Shortcuts are ignored when a text input or textarea has focus, so they don't interfere with typing.

---

## Internal Files Written to Your Vault

VaultNote creates the following hidden files inside your vault. They are filtered out of the sidebar but are standard files you can back up or delete:

| File | Purpose | Encrypted? |
|---|---|---|
| `.vaultnote-registry.json` | UUID ↔ path map for stable note identity | No |
| `.vaultnote-embeddings.json` | AI embedding vectors + content hashes | Optional (Vault Intelligence Lock) |
| `.vaultnote-intel.lock` | Vault Intelligence Lock descriptor (hash only) | N/A |
| `.vaultnote-lock.json` | Per-directory lock descriptor (PBKDF2 salt + key hash) | N/A |
| `.vaultnote-vault` | AES-256-GCM encrypted archive of all `.md` files in a locked directory | Yes (always) |
| `.<filename>.highlights.json` | Text highlights sidecar for each note | No |

Deleting any of these files is safe — VaultNote will rebuild them on next launch (embeddings will re-compute, highlights will be lost). **Do not delete `.vaultnote-vault` while a directory is locked** — that file is the only copy of your notes for that directory.
