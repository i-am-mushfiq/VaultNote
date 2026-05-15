import { create } from 'zustand';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import { embed, embedBatch, topK, vecToArray, arrayToVec, setProgressCallback, loadModel, resetModelError } from '@/lib/embeddings';
import { encryptJson, decryptJson, isEncryptedBlob } from '@/lib/vaultCrypto';

const INDEX_FILENAME = '.vaultnote-embeddings.json';

// ── Disk format (v2 — includes content hash for staleness detection) ─────────
type DiskEntry = { vec: number[]; hash: string };
type DiskIndex  = Record<string, DiskEntry>;

// Migrate old format (plain number[]) → DiskEntry
function asDiskEntry(raw: number[] | DiskEntry): DiskEntry {
  return Array.isArray(raw) ? { vec: raw, hash: '' } : raw;
}

// ── Persistence context ────────────────────────────────────────────────────
let _persistVaultPath: string | null      = null;
let _persistPassword:  string | undefined = undefined;

function autoPersist(getIndex: () => Map<string, Float32Array>, getHashes: () => Map<string, string>) {
  if (!_persistVaultPath) return;
  const vaultPath = _persistVaultPath;
  const password  = _persistPassword;
  (async () => {
    try {
      const data: DiskIndex = {};
      const hashes = getHashes();
      for (const [p, vec] of getIndex()) {
        data[p] = { vec: vecToArray(vec), hash: hashes.get(p) ?? '' };
      }
      const toWrite = password ? await encryptJson(data, password) : data;
      await fs.writeTextFile(pathUtils.join(vaultPath, INDEX_FILENAME), JSON.stringify(toWrite));
    } catch { /* best-effort */ }
  })();
}

// Fast content fingerprint using the first 4 KB
async function hashContent(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.slice(0, 4096));
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ── Query expansion for short / ambiguous queries ────────────────────────────
// all-MiniLM-L6-v2 was trained for symmetric (sentence↔sentence) similarity,
// so single-word queries land in a noisy region of vector space.
// Framing and repeating the term anchors the embedding more reliably.
function expandQuery(query: string): string {
  const trimmed = query.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 3) return trimmed; // already contextual
  // Repeat + frame: "TV" → "TV television TV topics and notes about TV"
  return `${trimmed} ${trimmed} topics and notes about ${trimmed}`;
}

// ── Note content cleaner ──────────────────────────────────────────────────────
// title: the filename stem (e.g. "Sofia Vergara") — prepended so that even
// sparse notes carry a strong identity signal in the embedding.
function cleanContent(raw: string, title?: string): string {
  const body = raw
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~[\]]/g, '')
    .trim()
    .slice(0, 2800);

  if (!title) return body;

  // Normalise filename hyphens/underscores → spaces ("sofia-vergara" → "sofia vergara")
  const normalizedTitle = title.replace(/[-_]+/g, ' ').trim();

  // Don't duplicate if body already starts with the same text (H1 = filename)
  if (body.toLowerCase().startsWith(normalizedTitle.toLowerCase())) return body;

  return `${normalizedTitle}\n\n${body}`.slice(0, 3000);
}

interface EmbeddingStore {
  index:         Map<string, Float32Array>;
  hashes:        Map<string, string>;         // path → content hash
  modelStatus:   'idle' | 'loading' | 'ready' | 'error';
  modelError:    string | null;
  modelProgress: number;
  indexStatus:   'idle' | 'building' | 'ready';
  indexProgress: number;

  warmModel:  () => Promise<void>;
  loadIndex:  (vaultPath: string, password?: string) => Promise<void>;
  saveIndex:  (vaultPath: string, password?: string) => Promise<void>;
  indexFile:  (path: string, content: string) => Promise<void>;
  indexAll:   (vaultPath: string, paths: string[], password?: string) => Promise<void>;
  search:     (query: string, k?: number) => Promise<{ path: string; score: number }[]>;
  related:    (path: string, k?: number) => { path: string; score: number }[];
  setModelStatus: (s: EmbeddingStore['modelStatus']) => void;
  retryModel: (vaultPath: string, paths: string[], password?: string) => Promise<void>;
  renameIndexEntry: (oldPath: string, newPath: string) => void;
  removeIndexEntry: (path: string) => void;
}

export const useEmbeddingStore = create<EmbeddingStore>((set, get) => ({
  index:         new Map(),
  hashes:        new Map(),
  modelStatus:   'idle',
  modelError:    null,
  modelProgress: 0,
  indexStatus:   'idle',
  indexProgress: 0,

  setModelStatus(s) { set({ modelStatus: s }); },

  async warmModel() {
    const { modelStatus } = get();
    if (modelStatus === 'ready' || modelStatus === 'loading') return;
    resetModelError();
    set({ modelStatus: 'loading', modelError: null });

    setProgressCallback(({ status, progress }) => {
      if (status === 'progress' || status === 'download') {
        set({ modelStatus: 'loading', modelProgress: progress ?? 0 });
      }
      if (status === 'ready') {
        set({ modelStatus: 'ready', modelProgress: 100, modelError: null });
      }
    });

    try {
      await loadModel();
      set({ modelStatus: 'ready', modelProgress: 100, modelError: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ modelStatus: 'error', modelError: msg });
    }
  },

  async retryModel(vaultPath, paths, password) {
    resetModelError();
    set({ modelStatus: 'idle', modelError: null });
    await get().warmModel();
    if (get().modelStatus === 'ready') {
      set({ index: new Map(), hashes: new Map() });
      await get().indexAll(vaultPath, paths, password);
    }
  },

  async loadIndex(vaultPath, password) {
    _persistVaultPath = vaultPath;
    _persistPassword  = password;

    const indexPath = pathUtils.join(vaultPath, INDEX_FILENAME);
    try {
      const raw  = await fs.readTextFile(indexPath);
      const disk = JSON.parse(raw);
      let data: Record<string, number[] | DiskEntry>;
      if (isEncryptedBlob(disk)) {
        if (!password) { set({ indexStatus: 'idle' }); return; }
        data = await decryptJson(disk, password);
      } else {
        data = disk;
      }
      const idx    = new Map<string, Float32Array>();
      const hashes = new Map<string, string>();
      for (const [p, raw] of Object.entries(data)) {
        const entry = asDiskEntry(raw as number[] | DiskEntry);
        idx.set(p, arrayToVec(entry.vec));
        hashes.set(p, entry.hash);
      }
      set({ index: idx, hashes, indexStatus: 'ready' });
    } catch { set({ indexStatus: 'idle' }); }
  },

  async saveIndex(vaultPath, password) {
    const { index, hashes } = get();
    const data: DiskIndex = {};
    for (const [p, vec] of index) {
      data[p] = { vec: vecToArray(vec), hash: hashes.get(p) ?? '' };
    }
    const toWrite = password ? await encryptJson(data, password) : data;
    await fs.writeTextFile(pathUtils.join(vaultPath, INDEX_FILENAME), JSON.stringify(toWrite));
  },

  async indexFile(path, content) {
    if (!pathUtils.isMarkdown(path)) return;
    const cleaned = cleanContent(content, pathUtils.stem(path));
    if (!cleaned) return;
    try {
      const vec  = await embed(cleaned);
      const hash = await hashContent(cleaned);
      const { index, hashes } = get();
      const nextIdx    = new Map(index);
      const nextHashes = new Map(hashes);
      nextIdx.set(path, vec);
      nextHashes.set(path, hash);
      set({ index: nextIdx, hashes: nextHashes });
    } catch { /* model not ready */ }
  },

  async indexAll(vaultPath, paths, password) {
    _persistVaultPath = vaultPath;
    _persistPassword  = password;

    await get().warmModel();
    if (get().modelStatus !== 'ready') return;

    set({ indexStatus: 'building', indexProgress: 0 });

    const mdPaths  = new Set(paths.filter(pathUtils.isMarkdown));
    const { index, hashes } = get();

    // ── Prune: remove index entries for paths that no longer exist ────────
    const nextIdx    = new Map(index);
    const nextHashes = new Map(hashes);
    for (const [p] of index) {
      if (!mdPaths.has(p)) {
        nextIdx.delete(p);
        nextHashes.delete(p);
      }
    }
    set({ index: nextIdx, hashes: nextHashes });

    // ── Determine which paths need (re-)embedding ─────────────────────────
    const toEmbed: string[] = [];
    const contents: string[] = [];

    for (const p of mdPaths) {
      try {
        const raw     = await fs.readTextFile(p);
        const cleaned = cleanContent(raw, pathUtils.stem(p));
        if (!cleaned) continue;

        const storedHash = nextHashes.get(p) ?? '';
        const newHash    = await hashContent(cleaned);

        if (nextIdx.has(p) && storedHash === newHash) continue; // up-to-date

        toEmbed.push(p);
        contents.push(cleaned);
        // Stash the new hash so we can write it below
        nextHashes.set(p, newHash);
      } catch { /* skip unreadable */ }
    }

    if (toEmbed.length === 0) {
      set({ index: nextIdx, hashes: nextHashes, indexStatus: 'ready', indexProgress: 100 });
      return;
    }

    try {
      const vecs = await embedBatch(contents, (done, total) =>
        set({ indexProgress: Math.round((done / total) * 100) }),
      );
      for (let i = 0; i < toEmbed.length; i++) nextIdx.set(toEmbed[i], vecs[i]);
      set({ index: nextIdx, hashes: nextHashes, indexStatus: 'ready', indexProgress: 100 });
      await get().saveIndex(vaultPath, password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ modelStatus: 'error', modelError: msg, indexStatus: 'idle' });
    }
  },

  async search(query, k = 8) {
    if (get().modelStatus !== 'ready') return [];
    try {
      // Expand short queries — single/two-word queries land in a noisy region
      // of the embedding space; framing them anchors the vector more reliably.
      const qVec = await embed(expandQuery(query));
      // Search uses a lenient threshold (0.2) — recall matters more than precision here.
      return topK(qVec, get().index, k, undefined, 0.2);
    } catch { return []; }
  },

  related(path, k = 5) {
    const vec = get().index.get(path);
    if (!vec) return [];
    // Related notes: slightly more selective than search, less strict than graph edges.
    return topK(vec, get().index, k, path, 0.25);
  },

  renameIndexEntry(oldPath, newPath) {
    const { index, hashes } = get();
    const vec  = index.get(oldPath);
    const hash = hashes.get(oldPath);
    if (!vec) return;
    const nextIdx    = new Map(index);
    const nextHashes = new Map(hashes);
    nextIdx.delete(oldPath);   nextIdx.set(newPath, vec);
    nextHashes.delete(oldPath); nextHashes.set(newPath, hash ?? '');
    set({ index: nextIdx, hashes: nextHashes });
    autoPersist(() => get().index, () => get().hashes);
  },

  removeIndexEntry(path) {
    const { index, hashes } = get();
    if (!index.has(path)) return;
    const nextIdx    = new Map(index);
    const nextHashes = new Map(hashes);
    nextIdx.delete(path);
    nextHashes.delete(path);
    set({ index: nextIdx, hashes: nextHashes });
    autoPersist(() => get().index, () => get().hashes);
  },
}));
