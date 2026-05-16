import { create } from 'zustand';

interface LockStore {
  // Paths confirmed as having a lock file (discovered lazily on first click)
  lockedPaths: Set<string>;
  // Paths unlocked for this session (correct password entered)
  sessionUnlocked: Set<string>;
  // Per-directory session password — kept even after revokeSession so that
  // any tabs still open can continue to save encrypted content.
  sessionPasswords: Map<string, string>;

  // ── Virtual filesystem ────────────────────────────────────────────────────
  // When an archived locked directory is unlocked, its contents are decrypted
  // into this in-memory map (absPath → plaintext). No plaintext ever touches
  // disk until the lock is permanently removed.
  virtualContents: Map<string, string>;

  // ── Locked-path operations ────────────────────────────────────────────────
  markLocked:              (path: string) => void;
  markPermanentlyUnlocked: (path: string) => void;
  grantSession:            (path: string, password: string) => void;
  revokeSession:           (path: string) => void;
  isLocked:                (path: string) => boolean;
  isSessionUnlocked:       (path: string) => boolean;
  getSessionPassword:      (path: string) => string | undefined;

  // ── Virtual FS operations ─────────────────────────────────────────────────
  /** Bulk-insert contents from an opened archive. */
  setVirtualContents:         (contents: Record<string, string>) => void;
  /** Update a single file's content (after a save). */
  updateVirtualContent:       (filePath: string, content: string) => void;
  /** Remove a single virtual file entry. */
  removeVirtualContent:       (filePath: string) => void;
  /** Remove all virtual entries whose path starts with dirPath\. */
  clearVirtualContentsForDir: (dirPath: string) => void;
  /** Get content for a single file (undefined if not in virtual FS). */
  getVirtualContent:          (filePath: string) => string | undefined;
  /** True if the file exists in the virtual FS. */
  hasVirtualContent:          (filePath: string) => boolean;
  /** All absolute paths currently in the virtual FS. */
  getAllVirtualPaths:          () => string[];
  /** All paths in the virtual FS that live under dirPath. */
  getVirtualPathsForDir:      (dirPath: string) => string[];
}

export const useLockStore = create<LockStore>((set, get) => ({
  lockedPaths:      new Set(),
  sessionUnlocked:  new Set(),
  sessionPasswords: new Map(),
  virtualContents:  new Map(),

  // ── Locked-path operations ────────────────────────────────────────────────

  markLocked: (path) =>
    set((s) => ({ lockedPaths: new Set([...s.lockedPaths, path]) })),

  markPermanentlyUnlocked: (path) =>
    set((s) => {
      const locked    = new Set(s.lockedPaths);
      const session   = new Set(s.sessionUnlocked);
      const passwords = new Map(s.sessionPasswords);
      locked.delete(path);
      session.delete(path);
      passwords.delete(path);
      return { lockedPaths: locked, sessionUnlocked: session, sessionPasswords: passwords };
    }),

  // grantSession requires the verified password so saves can re-encrypt correctly.
  grantSession: (path, password) =>
    set((s) => {
      const passwords = new Map(s.sessionPasswords);
      passwords.set(path, password);
      return {
        sessionUnlocked:  new Set([...s.sessionUnlocked, path]),
        sessionPasswords: passwords,
      };
    }),

  // revokeSession removes the "visible" session but keeps the password so that
  // any already-open tabs can still flush edits into the archive before closing.
  revokeSession: (path) =>
    set((s) => {
      const next = new Set(s.sessionUnlocked);
      next.delete(path);
      return { sessionUnlocked: next };
    }),

  isLocked:          (path) => get().lockedPaths.has(path),
  isSessionUnlocked: (path) => get().sessionUnlocked.has(path),
  getSessionPassword:(path) => get().sessionPasswords.get(path),

  // ── Virtual FS operations ─────────────────────────────────────────────────

  setVirtualContents: (contents) =>
    set((s) => {
      const vc = new Map(s.virtualContents);
      for (const [path, content] of Object.entries(contents)) {
        vc.set(path, content);
      }
      return { virtualContents: vc };
    }),

  updateVirtualContent: (filePath, content) =>
    set((s) => {
      const vc = new Map(s.virtualContents);
      vc.set(filePath, content);
      return { virtualContents: vc };
    }),

  removeVirtualContent: (filePath) =>
    set((s) => {
      if (!s.virtualContents.has(filePath)) return {};
      const vc = new Map(s.virtualContents);
      vc.delete(filePath);
      return { virtualContents: vc };
    }),

  clearVirtualContentsForDir: (dirPath) =>
    set((s) => {
      const prefix = dirPath.endsWith('\\') ? dirPath : dirPath + '\\';
      const vc = new Map(s.virtualContents);
      for (const path of vc.keys()) {
        if (path.startsWith(prefix)) vc.delete(path);
      }
      return { virtualContents: vc };
    }),

  getVirtualContent:  (filePath) => get().virtualContents.get(filePath),
  hasVirtualContent:  (filePath) => get().virtualContents.has(filePath),
  getAllVirtualPaths:  ()         => Array.from(get().virtualContents.keys()),

  getVirtualPathsForDir: (dirPath) => {
    const prefix = dirPath.endsWith('\\') ? dirPath : dirPath + '\\';
    return Array.from(get().virtualContents.keys()).filter((p) => p.startsWith(prefix));
  },
}));
