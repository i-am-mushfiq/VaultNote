import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useVaultStore } from '@/stores/vaultStore';
import { useFileStore } from '@/stores/fileStore';
import { getDailyNotePath, getDailyNoteTemplate } from '@/lib/dailyNote';

export function useKeyboardShortcuts() {
  const ui = useUIStore();
  const { openVault, currentVault } = useVaultStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (ctrl && !shift && e.key === 'p') {
        e.preventDefault();
        ui.openSearch();
        return;
      }
      if (ctrl && shift && e.key === 'P') {
        e.preventDefault();
        ui.openCommandPalette();
        return;
      }
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        ui.toggleSidebar();
        return;
      }
      if (ctrl && e.key === 's') {
        e.preventDefault();
        const activeTab = useTabStore.getState().getActiveTab();
        if (activeTab) {
          const content = useEditorStore.getState().getContent(activeTab.path);
          useEditorStore.getState().saveFile(activeTab.path, content).catch(console.error);
        }
        return;
      }
      if (ctrl && e.key === 'n') {
        e.preventDefault();
        ui.openCommandPalette();
        return;
      }
      if (ctrl && e.key === 'd') {
        e.preventDefault();
        if (!currentVault) return;
        const dailyPath = getDailyNotePath(currentVault.path);
        const template = getDailyNoteTemplate();
        useFileStore
          .getState()
          .createFile(useVaultStore.getState().currentVault!.path, '')
          .catch(() => {});
        // Open or create daily note
        openDailyNote(dailyPath, template);
        return;
      }
      if (ctrl && e.key === 'w') {
        e.preventDefault();
        const activeTab = useTabStore.getState().getActiveTab();
        if (activeTab && !activeTab.isPinned) {
          useTabStore.getState().closeTab(activeTab.id);
        }
        return;
      }
      if (ctrl && shift && e.key === 'T') {
        e.preventDefault();
        useTabStore.getState().restoreLastClosed();
        return;
      }
      if (ctrl && e.key === ',') {
        e.preventDefault();
        ui.openSettings();
        return;
      }
      // Tab switching: Ctrl+1..9
      if (ctrl && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        const tabs = useTabStore.getState().tabs;
        if (tabs[idx]) useTabStore.getState().activateTab(tabs[idx].id);
        return;
      }
      // Escape closes overlays
      if (e.key === 'Escape') {
        if (ui.commandPaletteOpen) { ui.closeCommandPalette(); return; }
        if (ui.searchOpen) { ui.closeSearch(); return; }
        if (ui.settingsOpen) { ui.closeSettings(); return; }
        if (ui.contextMenu) { ui.hideContextMenu(); return; }
      }
    },
    [ui, currentVault],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

async function openDailyNote(path: string, template: string) {
  const { fs } = await import('@/lib/fs');
  const { useTabStore: tabStore } = await import('@/stores/tabStore');
  const { useEditorStore: editorStore } = await import('@/stores/editorStore');

  const exists = await fs.exists(path);
  if (!exists) {
    await fs.writeTextFile(path, template);
  }
  const content = await fs.readTextFile(path);
  editorStore.getState().setContent(path, content);
  tabStore.getState().openTab(path, content);
}
