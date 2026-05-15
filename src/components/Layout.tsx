import { useRef, useState, useCallback, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVaultStore } from '@/stores/vaultStore';
import { useFileStore } from '@/stores/fileStore';
import { useFileWatcher } from '@/hooks/useFileWatcher';
import Sidebar from '@/components/Sidebar';
import EditorArea from '@/components/Editor';
import SearchModal from '@/components/Search/SearchModal';
import CommandPalette from '@/components/CommandPalette';
import SettingsModal from '@/components/Settings';
import ContextMenuOverlay from '@/components/Sidebar/ContextMenu';

export default function Layout() {
  const { sidebarOpen, searchOpen, commandPaletteOpen, settingsOpen } = useUIStore();
  const { settings, updateSettings } = useSettingsStore();
  const { currentVault } = useVaultStore();
  const { loadVault } = useFileStore();

  const [sidebarWidth, setSidebarWidth] = useState(settings.sidebarWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useFileWatcher(currentVault?.path ?? null);

  // Load vault on mount
  useEffect(() => {
    if (currentVault) {
      loadVault(currentVault.path).catch(console.error);
    }
  }, [currentVault?.path]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.max(160, Math.min(480, startWidth.current + delta));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      updateSettings({ sidebarWidth });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [sidebarWidth, updateSettings]);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          <div className="sidebar" style={{ width: sidebarWidth }}>
            <Sidebar />
          </div>
          <div
            className="resize-handle"
            onMouseDown={onMouseDown}
            title="Drag to resize"
          />
        </>
      )}

      {/* Editor area */}
      <EditorArea />

      {/* Overlays */}
      {searchOpen && <SearchModal />}
      {commandPaletteOpen && <CommandPalette />}
      {settingsOpen && <SettingsModal />}
      <ContextMenuOverlay />
    </div>
  );
}
