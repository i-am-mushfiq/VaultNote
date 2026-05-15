import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings } from '@/types';

interface SettingsStore {
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  editorFontSize: 14,
  editorLineHeight: 1.7,
  editorWidth: 'readable',
  editorFontFamily: 'mono',
  showPreview: true,
  showEditor: true,
  previewSide: 'right',
  autoSaveInterval: 1000,
  sidebarWidth: 260,
  wordWrap: true,
  spellCheck: false,
  editorPreviewSplit: 0.5,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    { name: 'vaultnote-settings' },
  ),
);
