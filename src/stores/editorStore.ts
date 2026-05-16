import { create } from 'zustand';
import { fs } from '@/lib/fs';
import { useTabStore } from './tabStore';
import { useLockStore } from './lockStore';
import { updateIndexEntry } from '@/lib/search';
import { extractTitle } from '@/lib/markdown';
import { pathUtils } from '@/lib/pathUtils';
import {
  LOCK_FILENAME,
  isEncryptedContent,
  encryptContent,
  decryptContent,
  saveVaultArchive,
} from '@/lib/directoryLock';

interface EditorStore {
  contents: Map<string, string>; // path → plaintext only — ciphertext is never stored here
  loadingPaths: Set<string>;

  loadFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
  setContent: (path: string, content: string) => void;
  getContent: (path: string) => string;
  renameContentPath: (oldPath: string, newPath: string) => void;
  removeContent: (path: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Walk up the directory tree from `filePath` and return the first ancestor
 * that is in the `lockedPaths` set, or undefined if none.
 */
function findLockedAncestor(
  filePath: string,
  lockedPaths: Set<string>,
): string | undefined {
  let dir = pathUtils.dirname(filePath);
  const seen = new Set<string>();
  while (!seen.has(dir)) {
    seen.add(dir);
    if (lockedPaths.has(dir)) return dir;
    const parent = pathUtils.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return undefined;
}

/**
 * Find a session-unlocked locked ancestor (i.e. an archived directory whose
 * contents are in the virtual FS) for the given file path.
 */
function findSessionUnlockedAncestor(filePath: string): string | undefined {
  const { lockedPaths, sessionUnlocked } = useLockStore.getState();
  let dir = pathUtils.dirname(filePath);
  const seen = new Set<string>();
  while (!seen.has(dir)) {
    seen.add(dir);
    if (lockedPaths.has(dir) && sessionUnlocked.has(dir)) return dir;
    const parent = pathUtils.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Lazy disk-based lock detection: walk the ancestor tree and return the first
 * directory that contains a `.vaultnote-lock.json` file, registering it in
 * lockStore along the way.
 */
async function detectAndRegisterLockAncestor(filePath: string): Promise<string | undefined> {
  let dir = pathUtils.dirname(filePath);
  const seen = new Set<string>();
  while (!seen.has(dir)) {
    seen.add(dir);
    try {
      const hasLock = await fs.exists(pathUtils.join(dir, LOCK_FILENAME));
      if (hasLock) {
        useLockStore.getState().markLocked(dir);
        return dir;
      }
    } catch { /* permission errors etc. */ }
    const parent = pathUtils.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorStore>((set, get) => ({
  contents: new Map(),
  loadingPaths: new Set(),

  loadFile: async (path) => {
    // 1. Return cached plaintext immediately — the cache never holds ciphertext.
    const existing = get().contents.get(path);
    if (existing !== undefined) return existing;

    // 2. Check virtual filesystem (archived locked directory).
    //    Virtual content is already-decrypted plaintext in memory.
    const lockStore = useLockStore.getState();
    if (lockStore.hasVirtualContent(path)) {
      const content = lockStore.getVirtualContent(path)!;
      set((s) => {
        const nc = new Map(s.contents);
        nc.set(path, content);
        return { contents: nc };
      });
      const tabStore = useTabStore.getState();
      tabStore.updateSavedContent(tabStore.getTabByPath(path)?.id ?? '', content);
      return content;
    }

    // 3. Read from disk.
    set((s) => ({ loadingPaths: new Set([...s.loadingPaths, path]) }));

    const clearLoading = () =>
      set((s) => {
        const nl = new Set(s.loadingPaths);
        nl.delete(path);
        return { loadingPaths: nl };
      });

    try {
      let content = await fs.readTextFile(path);

      // ── Decrypt if the file is encrypted (legacy per-file encryption) ──────
      if (isEncryptedContent(content)) {
        const { lockedPaths, sessionUnlocked, sessionPasswords } =
          useLockStore.getState();

        // 1. Try store-known locked ancestors first (fast path).
        let ancestor = findLockedAncestor(path, lockedPaths);

        // 2. If not found (e.g. app restarted, lockStore was reset), scan disk.
        if (!ancestor) {
          ancestor = await detectAndRegisterLockAncestor(path);
        }

        if (ancestor && sessionUnlocked.has(ancestor)) {
          // Session is active — decrypt transparently.
          const password = sessionPasswords.get(ancestor);
          if (password) {
            content = await decryptContent(content, password);
          }
        } else {
          // Encrypted but no active session — return empty WITHOUT caching.
          clearLoading();
          return '';
        }
      }

      // Cache plaintext and mark tab clean.
      set((s) => {
        const nc = new Map(s.contents);
        nc.set(path, content);
        const nl = new Set(s.loadingPaths);
        nl.delete(path);
        return { contents: nc, loadingPaths: nl };
      });

      const tabStore = useTabStore.getState();
      tabStore.updateSavedContent(
        tabStore.getTabByPath(path)?.id ?? '',
        content,
      );
      return content;
    } catch {
      clearLoading();
      return '';
    }
  },

  saveFile: async (path, content) => {
    // content is always the plaintext the editor holds.

    // ── Virtual FS path: file lives in an archived locked directory ────────
    const lockStore = useLockStore.getState();
    const virtualAncestor = findSessionUnlockedAncestor(path);

    if (virtualAncestor || lockStore.hasVirtualContent(path)) {
      const ancestor = virtualAncestor ?? findSessionUnlockedAncestor(path);
      if (ancestor) {
        const password = lockStore.getSessionPassword(ancestor)!;
        // Update this file in the virtual FS
        lockStore.updateVirtualContent(path, content);
        // Re-encrypt the entire archive with the updated content
        const paths = lockStore.getVirtualPathsForDir(ancestor);
        const allContents: Record<string, string> = {};
        for (const p of paths) {
          allContents[p] = lockStore.getVirtualContent(p)!;
        }
        await saveVaultArchive(ancestor, password, allContents);
      }

      // Update memory cache (plaintext only)
      set((s) => {
        const nc = new Map(s.contents);
        nc.set(path, content);
        return { contents: nc };
      });

      const tabStore = useTabStore.getState();
      const tab = tabStore.getTabByPath(path);
      if (tab) tabStore.updateSavedContent(tab.id, content);

      updateIndexEntry({
        path,
        title: extractTitle(content, pathUtils.stem(path)),
        content,
      });
      return;
    }

    // ── Disk path: regular file (possibly with per-file encryption) ────────
    let fileContent = content;
    const { lockedPaths, sessionPasswords } = lockStore;
    const ancestor = findLockedAncestor(path, lockedPaths);
    if (ancestor) {
      const password = sessionPasswords.get(ancestor);
      if (password) {
        // Fresh random IV per save — standard AES-GCM best practice.
        fileContent = await encryptContent(content, password);
      }
    }

    await fs.writeTextFile(path, fileContent);

    // Always store plaintext in memory — encryption is a write-path concern only.
    set((s) => {
      const nc = new Map(s.contents);
      nc.set(path, content);
      return { contents: nc };
    });

    const tabStore = useTabStore.getState();
    const tab = tabStore.getTabByPath(path);
    if (tab) tabStore.updateSavedContent(tab.id, content);

    // Index plaintext so search and graph still work while the session is open.
    updateIndexEntry({
      path,
      title: extractTitle(content, pathUtils.stem(path)),
      content,
    });
  },

  setContent: (path, content) => {
    set((s) => {
      const nc = new Map(s.contents);
      nc.set(path, content);
      return { contents: nc };
    });
    const tabStore = useTabStore.getState();
    const tab = tabStore.getTabByPath(path);
    if (tab && tab.savedContent !== content) {
      tabStore.markDirty(tab.id, true);
    } else if (tab) {
      tabStore.markDirty(tab.id, false);
    }
  },

  getContent: (path) => get().contents.get(path) ?? '',

  renameContentPath(oldPath, newPath) {
    set((s) => {
      const existing = s.contents.get(oldPath);
      if (existing === undefined) return {};
      const nc = new Map(s.contents);
      nc.delete(oldPath);
      nc.set(newPath, existing);
      return { contents: nc };
    });
  },

  removeContent(path) {
    set((s) => {
      if (!s.contents.has(path)) return {};
      const nc = new Map(s.contents);
      nc.delete(path);
      return { contents: nc };
    });
  },
}));
