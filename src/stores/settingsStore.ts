import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings } from '@/types';

interface SettingsStore {
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  // Appearance
  theme: 'dark',
  accentColor: '#7c6af0',

  // Editor
  editorFontSize: 14,
  editorLineHeight: 1.7,
  editorWidth: 'readable',
  editorFontFamily: 'mono',
  wordWrap: true,
  spellCheck: false,
  showLineNumbers: true,
  highlightActiveLine: true,
  tabSize: 2,

  // Layout / preview
  showEditor: true,
  showPreview: true,
  previewSide: 'right',
  editorPreviewSplit: 0.5,
  sidebarWidth: 260,

  // Saving
  autoSaveInterval: 1000,
  autoSaveOnSwitch: true,

  // Intelligence
  enableSemanticSearch: true,
  semanticThreshold: 0.3,
  semanticMaxEdges: 5,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'vaultnote-settings',
      // Deep-merge settings so new fields get their defaults even when an
      // older persisted object (without those keys) is loaded from localStorage.
      merge: (persisted: any, current) => ({
        ...current,
        settings: { ...current.settings, ...(persisted?.settings ?? {}) },
      }),
    },
  ),
);
