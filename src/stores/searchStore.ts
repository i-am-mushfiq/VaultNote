import { create } from 'zustand';
import type { SearchResult } from '@/types';
import { search } from '@/lib/search';

interface SearchStore {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  selectedIndex: number;

  setQuery: (q: string) => void;
  runSearch: (q: string) => void;
  clearSearch: () => void;
  selectNext: () => void;
  selectPrev: () => void;
  getSelected: () => SearchResult | undefined;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  selectedIndex: 0,

  setQuery: (q) => {
    set({ query: q, selectedIndex: 0 });
    get().runSearch(q);
  },

  runSearch: (q) => {
    if (!q.trim()) {
      set({ results: [], isSearching: false });
      return;
    }
    set({ isSearching: true });
    // Defer to next tick to avoid blocking UI
    setTimeout(() => {
      const results = search(q, 100);
      set({ results, isSearching: false, selectedIndex: 0 });
    }, 0);
  },

  clearSearch: () => set({ query: '', results: [], isSearching: false, selectedIndex: 0 }),

  selectNext: () =>
    set((s) => ({ selectedIndex: Math.min(s.selectedIndex + 1, s.results.length - 1) })),

  selectPrev: () =>
    set((s) => ({ selectedIndex: Math.max(s.selectedIndex - 1, 0) })),

  getSelected: () => {
    const { results, selectedIndex } = get();
    return results[selectedIndex];
  },
}));
