import { useEffect, useRef } from 'react';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';

export function useAutoSave() {
  const { settings } = useSettingsStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useTabStore.subscribe((state) => {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!activeTab?.isDirty) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const { getContent, saveFile } = useEditorStore.getState();
        const content = getContent(activeTab.path);
        try {
          await saveFile(activeTab.path, content);
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
      }, settings.autoSaveInterval);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [settings.autoSaveInterval]);
}
