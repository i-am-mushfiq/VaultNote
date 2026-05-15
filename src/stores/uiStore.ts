import { create } from 'zustand';

interface UIStore {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  searchOpen: boolean;
  settingsOpen: boolean;
  contextMenu: { x: number; y: number; targetPath: string; isDirectory: boolean } | null;
  renameTarget: string | null;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  showContextMenu: (x: number, y: number, targetPath: string, isDirectory: boolean) => void;
  hideContextMenu: () => void;
  setRenameTarget: (path: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  commandPaletteOpen: false,
  searchOpen: false,
  settingsOpen: false,
  contextMenu: null,
  renameTarget: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openCommandPalette: () => set({ commandPaletteOpen: true, searchOpen: false }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  openSearch: () => set({ searchOpen: true, commandPaletteOpen: false }),
  closeSearch: () => set({ searchOpen: false }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  showContextMenu: (x, y, targetPath, isDirectory) =>
    set({ contextMenu: { x, y, targetPath, isDirectory } }),
  hideContextMenu: () => set({ contextMenu: null }),
  setRenameTarget: (path) => set({ renameTarget: path }),
}));
