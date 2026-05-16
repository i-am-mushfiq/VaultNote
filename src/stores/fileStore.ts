import { create } from 'zustand';
import type { FileNode } from '@/types';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import { buildIndex } from '@/lib/search';
import { extractTitle } from '@/lib/markdown';
import { useTabStore } from './tabStore';
import { useEditorStore } from './editorStore';
import { useEmbeddingStore } from './embeddingStore';
import { useNoteRegistryStore } from './noteRegistryStore';
import { useLockStore } from './lockStore';
import { isDirectoryLocked, LOCK_FILENAME, VAULT_ARCHIVE_FILENAME, saveVaultArchive } from '@/lib/directoryLock';

interface FileStore {
  rootNodes:  FileNode[];
  flatNodes:  Map<string, FileNode>;
  isLoading:  boolean;
  error:      string | null;
  vaultPath:  string | null;

  loadVault:     (vaultPath: string) => Promise<void>;
  expandDir:     (node: FileNode) => Promise<void>;
  collapseDir:   (path: string) => void;
  toggleDir:     (node: FileNode) => Promise<void>;
  createFile:    (parentPath: string, name: string) => Promise<string>;
  createFolder:  (parentPath: string, name: string) => Promise<string>;
  deleteNode:    (path: string, isDirectory: boolean) => Promise<void>;
  renameNode:    (oldPath: string, newName: string) => Promise<string>;
  moveNode:      (oldPath: string, targetDir: string) => Promise<string>;
  refreshNode:   (parentPath: string) => Promise<void>;
  refreshVault:  (vaultPath: string) => Promise<void>;
}

function makeNode(
  path: string,
  name: string,
  isDirectory: boolean,
  depth: number,
  parentPath: string | null,
  modified?: number,
  size?: number,
): FileNode {
  return {
    id: path,
    path,
    name,
    isDirectory,
    isExpanded: false,
    depth,
    parentPath,
    childrenLoaded: false,
    children: [],
    modified,
    size,
  };
}

export const useFileStore = create<FileStore>((set, get) => ({
  rootNodes:  [],
  flatNodes:  new Map(),
  isLoading:  false,
  error:      null,
  vaultPath:  null,

  loadVault: async (vaultPath) => {
    set({ isLoading: true, error: null, rootNodes: [], flatNodes: new Map(), vaultPath });
    try {
      const entries = await fs.readDir(vaultPath);
      const nodes = entries
        .filter((e) => e.name !== LOCK_FILENAME && e.name !== VAULT_ARCHIVE_FILENAME)
        .map((e) =>
          makeNode(e.path, e.name, e.is_directory, 0, vaultPath, e.modified, e.size),
        );
      const flatNodes = new Map<string, FileNode>();
      nodes.forEach((n) => flatNodes.set(n.path, n));
      set({ rootNodes: nodes, flatNodes, isLoading: false });

      // Build search index in background
      buildSearchIndex(vaultPath);
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  expandDir: async (node) => {
    if (!node.isDirectory) return;

    const lockStore = useLockStore.getState();

    // ── Check if this node (or an ancestor) is a session-unlocked locked dir ──
    // Virtual subdirectories inside an archived locked directory must be
    // synthesised from the in-memory virtualContents map — they no longer exist
    // on disk.
    const virtualAncestor = findVirtualAncestor(node.path);
    if (virtualAncestor) {
      // Build virtual children for this path from the virtual FS.
      const children = buildVirtualChildren(node);
      const { flatNodes } = get();
      const updatedNode = { ...node, isExpanded: true, children, childrenLoaded: true };
      const newFlat = new Map(flatNodes);
      newFlat.set(node.path, updatedNode);
      children.forEach((c) => newFlat.set(c.path, c));
      set({ flatNodes: newFlat });
      syncRootNodes(get, set);
      return;
    }

    // ── Lock gate ────────────────────────────────────────────────────────────
    // Authoritative check: never load or expose children for a directory that
    // is locked and has no active session. This prevents all metadata leakage.
    if (!lockStore.isSessionUnlocked(node.path)) {
      const locked = await isDirectoryLocked(node.path);
      if (locked) {
        lockStore.markLocked(node.path);
        return; // FileTreeNode will see isLocked and show the modal
      }
    }

    const { flatNodes } = get();
    const updatedNode = { ...node, isExpanded: true };

    if (!node.childrenLoaded) {
      try {
        const entries = await fs.readDir(node.path);
        const children = entries
          .filter((e) => e.name !== LOCK_FILENAME && e.name !== VAULT_ARCHIVE_FILENAME)
          .map((e) =>
            makeNode(e.path, e.name, e.is_directory, node.depth + 1, node.path, e.modified, e.size),
          );
        updatedNode.children = children;
        updatedNode.childrenLoaded = true;

        const newFlat = new Map(flatNodes);
        newFlat.set(node.path, updatedNode);
        children.forEach((c) => newFlat.set(c.path, c));
        set({ flatNodes: newFlat });
      } catch {
        return;
      }
    } else {
      const newFlat = new Map(flatNodes);
      newFlat.set(node.path, updatedNode);
      set({ flatNodes: newFlat });
    }

    // Sync back to rootNodes
    syncRootNodes(get, set);
  },

  collapseDir: (path) => {
    const { flatNodes } = get();
    const node = flatNodes.get(path);
    if (!node) return;
    const newFlat = new Map(flatNodes);
    newFlat.set(path, { ...node, isExpanded: false });
    set({ flatNodes: newFlat });
    syncRootNodes(get, set);
  },

  toggleDir: async (node) => {
    if (node.isExpanded) {
      get().collapseDir(node.path);
    } else {
      await get().expandDir(node);
    }
  },

  createFile: async (parentPath, name) => {
    const filename = name.endsWith('.md') ? name : `${name}.md`;
    const filePath = pathUtils.join(parentPath, filename);

    // ── Virtual directory: add to in-memory archive, never touch disk ────────
    const ancestor = findVirtualAncestor(parentPath);
    if (ancestor) {
      const lockStore = useLockStore.getState();
      const password  = lockStore.getSessionPassword(ancestor);
      if (password) {
        // Register the new empty file in the virtual FS
        lockStore.updateVirtualContent(filePath, '');
        // Persist the updated archive to disk (re-encrypted)
        const allPaths    = lockStore.getVirtualPathsForDir(ancestor);
        const allContents: Record<string, string> = {};
        for (const p of allPaths) {
          allContents[p] = lockStore.getVirtualContent(p) ?? '';
        }
        await saveVaultArchive(ancestor, password, allContents);
        // Refresh the virtual tree so the new node appears immediately
        await get().refreshNode(parentPath);
        return filePath;
      }
    }

    // ── Regular disk file ────────────────────────────────────────────────────
    await fs.writeTextFile(filePath, '');
    await get().refreshNode(parentPath);
    return filePath;
  },

  createFolder: async (parentPath, name) => {
    const folderPath = pathUtils.join(parentPath, name);
    await fs.createDir(folderPath);
    await get().refreshNode(parentPath);
    return folderPath;
  },

  deleteNode: async (path, isDirectory) => {
    const { flatNodes } = get();
    const node = flatNodes.get(path);

    // ── Virtual node: remove from in-memory archive, never touch disk ────────
    const deletedDirPath = isDirectory ? path : pathUtils.dirname(path);
    const ancestor = findVirtualAncestor(deletedDirPath);
    if (ancestor) {
      const lockStore = useLockStore.getState();
      const password  = lockStore.getSessionPassword(ancestor);
      if (password) {
        if (isDirectory) {
          lockStore.clearVirtualContentsForDir(path);
        } else {
          lockStore.removeVirtualContent(path);
        }
        // Re-encrypt archive with the file/dir removed
        const allPaths    = lockStore.getVirtualPathsForDir(ancestor);
        const allContents: Record<string, string> = {};
        for (const p of allPaths) {
          allContents[p] = lockStore.getVirtualContent(p) ?? '';
        }
        await saveVaultArchive(ancestor, password, allContents);
      }

      const newFlat = new Map(flatNodes);
      newFlat.delete(path);
      set({ flatNodes: newFlat });

      useEditorStore.getState().removeContent(path);
      useEmbeddingStore.getState().removeIndexEntry(path);
      useNoteRegistryStore.getState().deregister(path);

      if (node?.parentPath) {
        await get().refreshNode(node.parentPath);
      }
      return;
    }

    // ── Regular disk node ────────────────────────────────────────────────────
    await fs.removePath(path, isDirectory);

    // Clean stale entry from flatNodes before refresh
    const newFlat = new Map(flatNodes);
    newFlat.delete(path);
    set({ flatNodes: newFlat });

    // Cascade: clean editor cache and embedding index
    useEditorStore.getState().removeContent(path);
    useEmbeddingStore.getState().removeIndexEntry(path);
    useNoteRegistryStore.getState().deregister(path);

    if (node?.parentPath) {
      await get().refreshNode(node.parentPath);
    }
  },

  renameNode: async (oldPath, newName) => {
    const dir = pathUtils.dirname(oldPath);
    const ext = pathUtils.isMarkdown(oldPath) && !newName.includes('.') ? '.md' : '';
    const newPath = pathUtils.join(dir, newName + ext);
    await fs.renamePath(oldPath, newPath);

    const { flatNodes } = get();
    const node = flatNodes.get(oldPath);
    const parentPath = node?.parentPath ?? dir;

    // Remove the stale entry so refreshNode doesn't resurrect it
    const newFlat = new Map(flatNodes);
    newFlat.delete(oldPath);
    set({ flatNodes: newFlat });

    // Refresh parent directory to pick up the renamed entry
    await get().refreshNode(parentPath);

    // Cascade renames across stores
    useTabStore.getState().renameTabPath(oldPath, newPath);
    useEditorStore.getState().renameContentPath(oldPath, newPath);
    useEmbeddingStore.getState().renameIndexEntry(oldPath, newPath);
    useNoteRegistryStore.getState().movePath(oldPath, newPath);

    return newPath;
  },

  moveNode: async (oldPath, targetDir) => {
    const name    = pathUtils.basename(oldPath);
    const newPath = pathUtils.join(targetDir, name);
    await fs.renamePath(oldPath, newPath);   // renamePath works for cross-dir moves too

    const { flatNodes } = get();
    const node = flatNodes.get(oldPath);
    const oldParentPath = node?.parentPath ?? pathUtils.dirname(oldPath);

    // Remove stale entry
    const newFlat = new Map(flatNodes);
    newFlat.delete(oldPath);
    set({ flatNodes: newFlat });

    // Refresh both the old parent and the target directory
    await get().refreshNode(oldParentPath);
    await get().refreshNode(targetDir);

    // Cascade renames across stores
    useTabStore.getState().renameTabPath(oldPath, newPath);
    useEditorStore.getState().renameContentPath(oldPath, newPath);
    useEmbeddingStore.getState().renameIndexEntry(oldPath, newPath);
    useNoteRegistryStore.getState().movePath(oldPath, newPath);

    return newPath;
  },

  // ── refreshNode ─────────────────────────────────────────────────────────────
  // Handles both root-level and nested directories.
  // Removes stale children from flatNodes so renamed/deleted entries disappear.
  refreshNode: async (parentPath) => {
    // ── Virtual directory: rebuild from in-memory map, never touch disk ───────
    // Any directory that is (or sits inside) a session-unlocked archived dir
    // has no meaningful physical contents — reconstruct the tree from
    // lockStore.virtualContents instead.
    if (findVirtualAncestor(parentPath)) {
      const { flatNodes } = get();
      const parentNode = flatNodes.get(parentPath);
      if (parentNode) {
        const children  = buildVirtualChildren(parentNode);
        const newFlat   = new Map(flatNodes);
        newFlat.set(parentPath, {
          ...parentNode,
          children,
          childrenLoaded: true,
          isExpanded:     true,
        });
        children.forEach((c) => newFlat.set(c.path, c));
        set({ flatNodes: newFlat });
        syncRootNodes(get, set);
      }
      return;
    }

    const { flatNodes, vaultPath, rootNodes } = get();
    const isRoot   = parentPath === vaultPath;
    const parentNode = flatNodes.get(parentPath);

    try {
      const entries   = await fs.readDir(parentPath);
      const depth     = isRoot ? 0 : (parentNode ? parentNode.depth + 1 : 0);
      const freshKids = entries
        .filter((e) => e.name !== LOCK_FILENAME && e.name !== VAULT_ARCHIVE_FILENAME)
        .map((e) =>
          makeNode(e.path, e.name, e.is_directory, depth, parentPath, e.modified, e.size),
        );

      const newFlat        = new Map(flatNodes);
      const newKidPaths    = new Set(freshKids.map((c) => c.path));

      // Determine the old set of direct children to diff against
      const oldKids = isRoot ? rootNodes : (parentNode?.children ?? []);
      for (const oldKid of oldKids) {
        if (!newKidPaths.has(oldKid.path)) {
          newFlat.delete(oldKid.path); // remove stale entry
        }
      }

      // Merge: preserve expanded/loaded state for nodes that still exist
      const mergedKids = freshKids.map((c) => {
        const existing = newFlat.get(c.path);
        return existing
          ? { ...existing, name: c.name, modified: c.modified, size: c.size }
          : c;
      });

      if (isRoot) {
        // Update root nodes directly — parentNode doesn't exist in flatNodes for the vault root
        mergedKids.forEach((c) => newFlat.set(c.path, c));
        set({ flatNodes: newFlat, rootNodes: mergedKids });
      } else if (parentNode) {
        newFlat.set(parentPath, {
          ...parentNode,
          children:       mergedKids,
          childrenLoaded: true,
          isExpanded:     true,
        });
        mergedKids.forEach((c) => newFlat.set(c.path, c));
        set({ flatNodes: newFlat });
        syncRootNodes(get, set);
      }
    } catch {
      // ignore read errors (e.g. permission denied)
    }
  },

  refreshVault: async (vaultPath) => {
    await get().loadVault(vaultPath);
  },
}));

function syncRootNodes(
  get: () => FileStore,
  set: (partial: Partial<FileStore>) => void,
) {
  const { flatNodes, rootNodes } = get();
  const updateChildren = (nodes: FileNode[]): FileNode[] =>
    nodes.map((n) => {
      const updated = flatNodes.get(n.path) ?? n;
      return {
        ...updated,
        children:
          updated.isExpanded && updated.childrenLoaded
            ? updateChildren(updated.children)
            : updated.children,
      };
    });
  set({ rootNodes: updateChildren(rootNodes) });
}

// ── Virtual tree helpers ──────────────────────────────────────────────────────

/**
 * Returns the closest ancestor (or self) of `dirPath` that is both locked and
 * session-unlocked (i.e. an archived directory whose contents are in memory).
 * Returns undefined if no such ancestor exists.
 */
function findVirtualAncestor(dirPath: string): string | undefined {
  const { isLocked, isSessionUnlocked } = useLockStore.getState();
  // Check self first (for the top-level locked dir itself)
  if (isLocked(dirPath) && isSessionUnlocked(dirPath)) return dirPath;
  // Walk up the tree
  let dir = pathUtils.dirname(dirPath);
  const seen = new Set<string>();
  while (!seen.has(dir)) {
    seen.add(dir);
    if (isLocked(dir) && isSessionUnlocked(dir)) return dir;
    const parent = pathUtils.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Synthesise immediate children of `node` from the virtualContents map.
 * Files that sit directly in node.path become file nodes; any deeper paths
 * create virtual directory nodes.
 */
function buildVirtualChildren(node: FileNode): FileNode[] {
  const lockStore = useLockStore.getState();
  const prefix    = node.path.endsWith('\\') ? node.path : node.path + '\\';
  const allPaths  = lockStore.getVirtualPathsForDir(node.path);

  // Collect direct children: files and first-level sub-dir names
  const directFiles = new Set<string>();
  const directDirs  = new Set<string>();

  for (const absPath of allPaths) {
    if (!absPath.startsWith(prefix)) continue;
    const rest = absPath.slice(prefix.length);
    const sep  = rest.indexOf('\\');
    if (sep === -1) {
      // Direct file child
      directFiles.add(absPath);
    } else {
      // Sub-directory — record first path component
      directDirs.add(prefix + rest.slice(0, sep));
    }
  }

  const children: FileNode[] = [];

  // Virtual directories first (sorted for stable order)
  for (const dirPath of [...directDirs].sort()) {
    children.push(
      makeNode(dirPath, pathUtils.basename(dirPath), true, node.depth + 1, node.path),
    );
  }

  // Virtual files (sorted)
  for (const filePath of [...directFiles].sort()) {
    children.push(
      makeNode(filePath, pathUtils.basename(filePath), false, node.depth + 1, node.path),
    );
  }

  return children;
}

async function buildSearchIndex(vaultPath: string) {
  const collect = async (
    dirPath: string,
  ): Promise<Array<{ path: string; title: string; content: string }>> => {
    try {
      const entries = await fs.readDir(dirPath);
      const results: Array<{ path: string; title: string; content: string }> = [];
      for (const entry of entries) {
        if (entry.is_directory) {
          results.push(...(await collect(entry.path)));
        } else if (pathUtils.isMarkdown(entry.name)) {
          try {
            const content = await fs.readTextFile(entry.path);
            results.push({
              path:    entry.path,
              title:   extractTitle(content, pathUtils.stem(entry.name)),
              content,
            });
          } catch {
            // skip unreadable files
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  };

  const entries = await collect(vaultPath);
  buildIndex(entries);
}
