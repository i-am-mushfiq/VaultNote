import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tab } from '@/types';
import { pathUtils } from '@/lib/pathUtils';

function deriveTitle(content: string, path: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim().substring(0, 60);
  return pathUtils.stem(path) || pathUtils.basename(path);
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  recentlyClosed: Tab[];

  openTab: (path: string, content?: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  markDirty: (id: string, dirty: boolean) => void;
  updateSavedContent: (id: string, content: string) => void;
  updateScrollPosition: (id: string, pos: number) => void;
  restoreLastClosed: () => Tab | undefined;
  getActiveTab: () => Tab | undefined;
  getTabByPath: (path: string) => Tab | undefined;
  updateTabTitle: (path: string, content: string) => void;
  closeTabByPath: (path: string) => void;
}

let tabCounter = 0;

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      recentlyClosed: [],

      openTab: (path, content = '') => {
        const { tabs } = get();
        const existing = tabs.find((t) => t.path === path);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        const id = `tab-${++tabCounter}-${Date.now()}`;
        const tab: Tab = {
          id,
          path,
          title: pathUtils.stem(path) || pathUtils.basename(path),
          isPinned: false,
          isDirty: false,
          scrollPosition: 0,
          savedContent: content,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
      },

      closeTab: (id) => {
        const { tabs, activeTabId, recentlyClosed } = get();
        const tab = tabs.find((t) => t.id === id);
        if (!tab) return;
        const newTabs = tabs.filter((t) => t.id !== id);
        let newActiveId = activeTabId;
        if (activeTabId === id) {
          const idx = tabs.findIndex((t) => t.id === id);
          const next = newTabs[idx] ?? newTabs[idx - 1] ?? null;
          newActiveId = next?.id ?? null;
        }
        set({
          tabs: newTabs,
          activeTabId: newActiveId,
          recentlyClosed: [tab, ...recentlyClosed].slice(0, 10),
        });
      },

      activateTab: (id) => set({ activeTabId: id }),

      pinTab: (id) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, isPinned: true } : t)) })),

      unpinTab: (id) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, isPinned: false } : t)) })),

      reorderTabs: (fromIndex, toIndex) => {
        const { tabs } = get();
        const newTabs = [...tabs];
        const [moved] = newTabs.splice(fromIndex, 1);
        newTabs.splice(toIndex, 0, moved);
        set({ tabs: newTabs });
      },

      markDirty: (id, dirty) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, isDirty: dirty } : t)) })),

      updateSavedContent: (id, content) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, savedContent: content, isDirty: false } : t,
          ),
        })),

      updateScrollPosition: (id, pos) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, scrollPosition: pos } : t)),
        })),

      restoreLastClosed: () => {
        const { recentlyClosed } = get();
        if (!recentlyClosed.length) return undefined;
        const [last, ...rest] = recentlyClosed;
        set({ recentlyClosed: rest });
        get().openTab(last.path, last.savedContent);
        return last;
      },

      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId);
      },

      getTabByPath: (path) => get().tabs.find((t) => t.path === path),

      updateTabTitle: (path, content) => {
        // Title is derived from the first H1 or filename; done lazily by editorStore
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.path === path
              ? { ...t, title: deriveTitle(content, path) }
              : t,
          ),
        }));
      },

      closeTabByPath: (path) => {
        const { tabs } = get();
        const tab = tabs.find((t) => t.path === path);
        if (tab) get().closeTab(tab.id);
      },
    }),
    {
      name: 'vaultnote-tabs',
      partialize: (s) => ({
        tabs: s.tabs.map((t) => ({ ...t, isDirty: false })),
        activeTabId: s.activeTabId,
        recentlyClosed: [],
      }),
    },
  ),
);
