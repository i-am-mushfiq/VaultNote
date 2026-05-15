import { useEffect, useState, useCallback, useRef } from 'react';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { wordCount } from '@/lib/markdown';
import { pathUtils } from '@/lib/pathUtils';
import EditorTabs from './EditorTabs';
import CodeMirrorEditor from './CodeMirrorEditor';
import MarkdownPreview from './MarkdownPreview';
import EmptyEditor from './EmptyEditor';
import { Eye, EyeOff, LayoutPanelLeft, Save } from 'lucide-react';

export default function EditorArea() {
  const { tabs, activeTabId, updateScrollPosition } = useTabStore();
  const { loadFile, setContent, saveFile, getContent }  = useEditorStore();
  const { settings, updateSettings } = useSettingsStore();

  const activeTab     = tabs.find((t) => t.id === activeTabId);
  const [localContent, setLocalContent] = useState('');
  const [isSaving, setIsSaving]         = useState(false);

  // ── Split drag state ──────────────────────────────────────────────────────

  const splitRatio     = settings.editorPreviewSplit;           // fraction for editor pane
  const containerRef   = useRef<HTMLDivElement>(null);
  const isDragging     = useRef(false);
  const dragStart      = useRef(0);
  const ratioAtStart   = useRef(splitRatio);

  const startDrag = useCallback((e: React.MouseEvent) => {
    isDragging.current   = true;
    dragStart.current    = settings.previewSide === 'right' ? e.clientX : e.clientY;
    ratioAtStart.current = settings.editorPreviewSplit;
    document.body.style.cursor     = settings.previewSide === 'right' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [settings.previewSide, settings.editorPreviewSplit]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect  = containerRef.current.getBoundingClientRect();
      const isRow = settings.previewSide === 'right';
      const total = isRow ? rect.width : rect.height;
      const pos   = isRow ? e.clientX - rect.left : e.clientY - rect.top;
      const ratio = Math.max(0.2, Math.min(0.8, pos / total));
      updateSettings({ editorPreviewSplit: ratio });
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current             = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [settings.previewSide, updateSettings]);

  // ── File loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeTab) { setLocalContent(''); return; }
    const existing = getContent(activeTab.path);
    if (existing) {
      setLocalContent(existing);
    } else {
      loadFile(activeTab.path).then(setLocalContent);
    }
  }, [activeTab?.path]);

  // Sync external content changes (file reloaded from disk)
  useEffect(() => {
    if (!activeTab) return;
    const stored = getContent(activeTab.path);
    if (stored !== undefined && stored !== localContent) {
      setLocalContent(stored);
    }
  });

  const handleChange = useCallback(
    (value: string) => {
      if (!activeTab) return;
      setLocalContent(value);
      setContent(activeTab.path, value);
    },
    [activeTab?.path, setContent],
  );

  const handleSave = async () => {
    if (!activeTab || !activeTab.isDirty) return;
    setIsSaving(true);
    try { await saveFile(activeTab.path, localContent); }
    finally { setIsSaving(false); }
  };

  const showPreview  = settings.showPreview;
  const isRow        = settings.previewSide === 'right';
  const words        = localContent ? wordCount(localContent) : 0;

  // Pixel sizes for editor and preview panes
  const editorFlex   = showPreview ? `0 0 calc(${splitRatio * 100}% - 2px)` : '1 1 auto';
  const previewFlex  = `1 1 auto`;

  return (
    <div className="editor-area">
      <EditorTabs />

      {/* Pane container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          flexDirection: isRow ? 'row' : 'column',
        }}
      >
        {activeTab ? (
          <>
            {/* ── Editor pane ────────────────────────────────────────────── */}
            <div
              className={`editor-content-wrap editor-width-${settings.editorWidth}`}
              style={{ flex: editorFlex, overflow: 'hidden', minWidth: 0, minHeight: 0 }}
            >
              <CodeMirrorEditor
                key={activeTab.path}
                value={localContent}
                path={activeTab.path}
                onChange={handleChange}
                onScrollChange={(pos) => updateScrollPosition(activeTab.id, pos)}
                initialScrollPosition={activeTab.scrollPosition}
              />
            </div>

            {/* ── Split handle ────────────────────────────────────────────── */}
            {showPreview && (
              <div
                className="split-handle"
                data-dir={isRow ? 'col' : 'row'}
                onMouseDown={startDrag}
                title="Drag to resize"
              />
            )}

            {/* ── Preview pane ────────────────────────────────────────────── */}
            {showPreview && (
              <div
                className="preview-pane"
                style={{ flex: previewFlex, overflow: 'auto', minWidth: 0, minHeight: 0 }}
              >
                <MarkdownPreview content={localContent} />
              </div>
            )}
          </>
        ) : (
          <EmptyEditor />
        )}
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="status-bar">
        <span style={{ fontWeight: 600, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeTab
            ? pathUtils.basename(pathUtils.dirname(activeTab.path)) + '/' + pathUtils.basename(activeTab.path)
            : 'VaultNote'}
        </span>
        {activeTab && (
          <>
            <span style={{ opacity: 0.7 }}>{words} words</span>
            {activeTab.isDirty && (
              <button
                onClick={handleSave}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  borderRadius: 4, padding: '1px 8px', fontSize: 11,
                  color: 'white', cursor: 'pointer',
                }}
                title="Save (Ctrl+S)"
              >
                <Save size={10} />
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            )}
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => updateSettings({ showPreview: !settings.showPreview })}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11 }}
            title="Toggle preview"
          >
            {showPreview ? <Eye size={12} /> : <EyeOff size={12} />}
            Preview
          </button>
          <button
            onClick={() => updateSettings({ previewSide: isRow ? 'bottom' : 'right' })}
            style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11 }}
            title="Flip preview side"
          >
            <LayoutPanelLeft size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
