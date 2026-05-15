import { create } from 'zustand';
import { fs } from '@/lib/fs';
import { useTabStore } from './tabStore';
import { updateIndexEntry } from '@/lib/search';
import { extractTitle } from '@/lib/markdown';
import { pathUtils } from '@/lib/pathUtils';

interface EditorStore {
  contents: Map<string, string>; // path → current editor content
  loadingPaths: Set<string>;

  loadFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
  setContent: (path: string, content: string) => void;
  getContent: (path: string) => string;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  contents: new Map(),
  loadingPaths: new Set(),

  loadFile: async (path) => {
    const existing = get().contents.get(path);
    if (existing !== undefined) return existing;

    set((s) => ({ loadingPaths: new Set([...s.loadingPaths, path]) }));
    try {
      const content = await fs.readTextFile(path);
      set((s) => {
        const newContents = new Map(s.contents);
        newContents.set(path, content);
        const newLoading = new Set(s.loadingPaths);
        newLoading.delete(path);
        return { contents: newContents, loadingPaths: newLoading };
      });
      const tabStore = useTabStore.getState();
      tabStore.updateSavedContent(
        tabStore.getTabByPath(path)?.id ?? '',
        content,
      );
      return content;
    } catch {
      set((s) => {
        const newLoading = new Set(s.loadingPaths);
        newLoading.delete(path);
        return { loadingPaths: newLoading };
      });
      return '';
    }
  },

  saveFile: async (path, content) => {
    await fs.writeTextFile(path, content);
    set((s) => {
      const newContents = new Map(s.contents);
      newContents.set(path, content);
      return { contents: newContents };
    });
    const tabStore = useTabStore.getState();
    const tab = tabStore.getTabByPath(path);
    if (tab) {
      tabStore.updateSavedContent(tab.id, content);
    }
    // Update search index
    updateIndexEntry({
      path,
      title: extractTitle(content, pathUtils.stem(path)),
      content,
    });
  },

  setContent: (path, content) => {
    set((s) => {
      const newContents = new Map(s.contents);
      newContents.set(path, content);
      return { contents: newContents };
    });
    // Mark tab dirty
    const tabStore = useTabStore.getState();
    const tab = tabStore.getTabByPath(path);
    if (tab && tab.savedContent !== content) {
      tabStore.markDirty(tab.id, true);
    } else if (tab) {
      tabStore.markDirty(tab.id, false);
    }
  },

  getContent: (path) => get().contents.get(path) ?? '',
}));
