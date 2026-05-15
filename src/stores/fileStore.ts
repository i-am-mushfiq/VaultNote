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
      const nodes = entries.map((e) =>
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
    const { flatNodes } = get();

    const updatedNode = { ...node, isExpanded: true };

    if (!node.childrenLoaded) {
      try {
        const entries = await fs.readDir(node.path);
        const children = entries.map((e) =>
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
    await fs.removePath(path, isDirectory);

    const { flatNodes } = get();
    const node = flatNodes.get(path);

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
    const { flatNodes, vaultPath, rootNodes } = get();
    const isRoot   = parentPath === vaultPath;
    const parentNode = flatNodes.get(parentPath);

    try {
      const entries   = await fs.readDir(parentPath);
      const depth     = isRoot ? 0 : (parentNode ? parentNode.depth + 1 : 0);
      const freshKids = entries.map((e) =>
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
