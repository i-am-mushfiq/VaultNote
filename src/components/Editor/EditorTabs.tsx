import { useRef } from 'react';
import { useTabStore } from '@/stores/tabStore';
import { useUIStore } from '@/stores/uiStore';
import { useEditorStore } from '@/stores/editorStore';
import { X, Pin, PanelLeft } from 'lucide-react';

export default function EditorTabs() {
  const { tabs, activeTabId, activateTab, closeTab, pinTab, unpinTab } = useTabStore();
  const { toggleSidebar, sidebarOpen } = useUIStore();
  const { saveFile, getContent } = useEditorStore();
  const dragSrc = useRef<number | null>(null);

  const handleClose = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const tab = tabs.find((t) => t.id === id);
    if (tab?.isDirty) {
      const ok = confirm(`Save "${tab.title}" before closing?`);
      if (ok) {
        await saveFile(tab.path, getContent(tab.path));
      }
    }
    closeTab(id);
  };

  const handleMiddleClick = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    // Simple toggle pin via context menu
    if (tab.isPinned) unpinTab(id);
    else pinTab(id);
  };

  return (
    <div className="tab-bar" style={{ alignItems: 'stretch' }}>
      {/* Sidebar toggle when closed */}
      {!sidebarOpen && (
        <button
          className="icon-btn"
          style={{ margin: '0 4px', flexShrink: 0 }}
          onClick={toggleSidebar}
          title="Show Sidebar (Ctrl+B)"
        >
          <PanelLeft size={15} />
        </button>
      )}

      {tabs.map((tab, idx) => (
        <div
          key={tab.id}
          className={`tab-item${tab.id === activeTabId ? ' active' : ''}${tab.isPinned ? ' pinned' : ''}`}
          onClick={() => activateTab(tab.id)}
          onMouseDown={(e) => handleMiddleClick(e, tab.id)}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
          draggable
          onDragStart={() => { dragSrc.current = idx; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragSrc.current !== null && dragSrc.current !== idx) {
              useTabStore.getState().reorderTabs(dragSrc.current, idx);
            }
            dragSrc.current = null;
          }}
          title={tab.path}
        >
          {tab.isDirty && <span className="dirty-dot" title="Unsaved changes" />}
          {tab.isPinned && <Pin size={10} style={{ flexShrink: 0, opacity: 0.6 }} />}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 140,
            }}
          >
            {tab.title || 'Untitled'}
          </span>
          {!tab.isPinned && (
            <span
              className="tab-close"
              onClick={(e) => handleClose(e, tab.id)}
              title="Close tab"
            >
              <X size={12} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
