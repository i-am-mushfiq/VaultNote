import { useEffect, useRef } from 'react';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';

export function useAutoSave() {
  const { settings } = useSettingsStore();
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTabRef  = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = useTabStore.subscribe((state) => {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);

      // ── Save-on-switch: if the active tab changed, save the previous dirty tab ──
      if (
        settings.autoSaveOnSwitch &&
        prevTabRef.current !== null &&
        prevTabRef.current !== state.activeTabId
      ) {
        const prevTab = state.tabs.find((t) => t.id === prevTabRef.current);
        if (prevTab?.isDirty) {
          const { getContent, saveFile } = useEditorStore.getState();
          saveFile(prevTab.path, getContent(prevTab.path)).catch(console.error);
        }
      }
      prevTabRef.current = state.activeTabId;

      // ── Regular debounced auto-save for the active tab ────────────────────────
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
  }, [settings.autoSaveInterval, settings.autoSaveOnSwitch]);
}
