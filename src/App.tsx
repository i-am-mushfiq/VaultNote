import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVaultStore } from '@/stores/vaultStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAutoSave } from '@/hooks/useAutoSave';
import VaultPicker from '@/components/VaultPicker';
import Layout from '@/components/Layout';

export default function App() {
  const { settings } = useSettingsStore();
  const { currentVault } = useVaultStore();

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: 'dark' | 'light') => {
      root.setAttribute('data-theme', theme);
    };

    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(settings.theme);
    }
  }, [settings.theme]);

  // Apply CSS variables for typography
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`);
    root.style.setProperty('--editor-line-height', String(settings.editorLineHeight));
  }, [settings.editorFontSize, settings.editorLineHeight]);

  useKeyboardShortcuts();
  useAutoSave();

  return currentVault ? <Layout /> : <VaultPicker />;
}
