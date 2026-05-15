import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useFileStore } from '@/stores/fileStore';
import { useEditorStore } from '@/stores/editorStore';
import { useTabStore } from '@/stores/tabStore';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';

interface FileChangeEvent {
  paths: string[];
  kind: string;
}

export function useFileWatcher(vaultPath: string | null) {
  const { refreshNode } = useFileStore();

  useEffect(() => {
    if (!vaultPath) return;

    fs.watchVault(vaultPath).catch(console.error);

    const unlisten = listen<FileChangeEvent>('vault-file-change', (event) => {
      const { paths } = event.payload;
      const affectedDirs = new Set<string>();

      for (const p of paths) {
        affectedDirs.add(pathUtils.dirname(p));

        // Reload content if a currently-open tab's file changed on disk
        const tabs = useTabStore.getState().tabs;
        const tab = tabs.find((t) => t.path === p);
        if (tab && !tab.isDirty) {
          fs.readTextFile(p)
            .then((content) => {
              useEditorStore.getState().setContent(p, content);
              useTabStore.getState().updateSavedContent(tab.id, content);
            })
            .catch(() => {});
        }
      }

      affectedDirs.forEach((dir) => {
        if (dir.startsWith(vaultPath)) {
          refreshNode(dir).catch(() => {});
        }
      });
    });

    return () => {
      unlisten.then((fn) => fn());
      fs.unwatchVault().catch(() => {});
    };
  }, [vaultPath, refreshNode]);
}
