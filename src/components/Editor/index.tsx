import { useEffect, useState, useCallback, useRef } from 'react';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHighlightStore } from '@/stores/highlightStore';
import { useGraphStore } from '@/stores/graphStore';
import { wordCount } from '@/lib/markdown';
import { pathUtils } from '@/lib/pathUtils';
import EditorTabs from './EditorTabs';
import CodeMirrorEditor, { type EditorHandle } from './CodeMirrorEditor';
import MarkdownPreview, { type PreviewHandle } from './MarkdownPreview';
import EmptyEditor from './EmptyEditor';
import CanvasView from '@/components/Canvas';
import RelatedNotes from '@/components/RelatedNotes';
import EntityPanel from '@/components/EntityPanel';
import FlashcardMode from '@/components/FlashcardMode';
import GraphView from '@/components/GraphView';
import { Eye, EyeOff, Code, CodeXml, LayoutPanelLeft, Save, Sparkles, Tag, Brain, Network } from 'lucide-react';

export default function EditorArea() {
  const { tabs, activeTabId, updateScrollPosition } = useTabStore();
  const { loadFile, setContent, saveFile, getContent } = useEditorStore();
  const { settings, updateSettings } = useSettingsStore();
  const highlightStore = useHighlightStore();
  const graphStore = useGraphStore();
  const { openTab } = useTabStore();

  const activeTab      = tabs.find((t) => t.id === activeTabId);
  const [localContent, setLocalContent] = useState('');
  const [isSaving, setIsSaving]         = useState(false);

  const [showRelated, setShowRelated]     = useState(false);
  const [showEntities, setShowEntities]   = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showGraph, setShowGraph]         = useState(false);

  const isCanvas = Boolean(activeTab && pathUtils.extname(activeTab.path).toLowerCase() === '.canvas');

  // ── Refs ──────────────────────────────────────────────────────────────────

  const editorRef  = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);

  // Anti-loop flag: which pane last triggered a sync
  const syncSource = useRef<'editor' | 'preview' | null>(null);
  const syncTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Split drag state ──────────────────────────────────────────────────────

  const splitRatio   = settings.editorPreviewSplit;
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging   = useRef(false);
  const dragStart    = useRef(0);

  const startDrag = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current  = settings.previewSide === 'right' ? e.clientX : e.clientY;
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
      updateSettings({ editorPreviewSplit: Math.max(0.2, Math.min(0.8, pos / total)) });
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
    if (!activeTab || isCanvas) { setLocalContent(''); return; }
    const existing = getContent(activeTab.path);
    if (existing) {
      setLocalContent(existing);
      graphStore.indexFile(activeTab.path, existing);
    } else {
      loadFile(activeTab.path).then((c) => {
        setLocalContent(c);
        graphStore.indexFile(activeTab.path, c);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.path]);

  // Sync external content changes
  useEffect(() => {
    if (!activeTab || isCanvas) return;
    const stored = getContent(activeTab.path);
    if (stored !== undefined && stored !== localContent) {
      setLocalContent(stored);
    }
  });

  // Load highlights whenever active file changes
  useEffect(() => {
    if (!activeTab || isCanvas) return;
    highlightStore.loadHighlights(activeTab.path);
  }, [activeTab?.path]);

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

  // ── Scroll sync ───────────────────────────────────────────────────────────

  // Preview scrolled → jump editor to that line
  const handlePreviewScrollToLine = useCallback((line: number) => {
    if (syncSource.current === 'editor') return;
    syncSource.current = 'preview';
    editorRef.current?.scrollToLine(line);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { syncSource.current = null; }, 150);
  }, []);

  // Editor visible line changed → scroll preview to matching element
  const handleEditorVisibleLine = useCallback((lineNum: number) => {
    if (syncSource.current === 'preview') return;
    syncSource.current = 'editor';
    previewRef.current?.scrollToLine(lineNum);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { syncSource.current = null; }, 150);
  }, []);

  // ── Click-to-edit ─────────────────────────────────────────────────────────

  const handleLineClick = useCallback((lineNum: number) => {
    editorRef.current?.scrollToLine(lineNum);
  }, []);

  // ── Wiki-link navigation ──────────────────────────────────────────────────

  const handleWikiLinkClick = useCallback(async (name: string) => {
    const resolved = graphStore.resolve(name);
    if (!resolved) return;
    const content = await loadFile(resolved);
    openTab(resolved, content);
  }, [graphStore, loadFile, openTab]);

  // ── Highlights ────────────────────────────────────────────────────────────

  const highlights = activeTab ? highlightStore.getHighlights(activeTab.path) : [];

  const handleHighlightCreate = useCallback(
    (h: Parameters<typeof highlightStore.addHighlight>[1]) => {
      if (!activeTab) return;
      highlightStore.addHighlight(activeTab.path, h);
    },
    [activeTab?.path],
  );

  const handleHighlightDelete = useCallback(
    (id: string) => {
      if (!activeTab) return;
      highlightStore.removeHighlight(activeTab.path, id);
    },
    [activeTab?.path],
  );

  // ── Layout ────────────────────────────────────────────────────────────────

  const showPreview = settings.showPreview && !isCanvas;
  const showEditor  = settings.showEditor  && !isCanvas;
  const isRow       = settings.previewSide === 'right';
  const words       = localContent ? wordCount(localContent) : 0;

  // When both panes are visible, editor takes the split ratio.
  // When only one pane is visible, it fills the space.
  const editorFlex  = (showPreview && showEditor) ? `0 0 calc(${splitRatio * 100}% - 2px)` : '1 1 auto';
  const previewFlex = '1 1 auto';

  return (
    <div className="editor-area">
      <EditorTabs />

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
            {/* ── Canvas view ─────────────────────────────────────────────── */}
            {isCanvas ? (
              <CanvasView path={activeTab.path} />
            ) : (
              <>
                {/* ── Editor pane ───────────────────────────────────────── */}
                {showEditor && (
                  <div
                    className={`editor-content-wrap editor-width-${settings.editorWidth}`}
                    style={{ flex: editorFlex, overflow: 'hidden', minWidth: 0, minHeight: 0 }}
                  >
                    <CodeMirrorEditor
                      ref={editorRef}
                      key={activeTab.path}
                      value={localContent}
                      path={activeTab.path}
                      onChange={handleChange}
                      onScrollChange={(pos) => updateScrollPosition(activeTab.id, pos)}
                      onVisibleLineChange={handleEditorVisibleLine}
                      initialScrollPosition={activeTab.scrollPosition}
                    />
                  </div>
                )}

                {/* ── Split handle ────────────────────────────────────────── */}
                {showPreview && showEditor && (
                  <div
                    className="split-handle"
                    data-dir={isRow ? 'col' : 'row'}
                    onMouseDown={startDrag}
                    title="Drag to resize"
                  />
                )}

                {/* ── Preview pane ─────────────────────────────────────────── */}
                {showPreview && (
                  <div
                    style={{ flex: previewFlex, overflow: 'hidden', minWidth: 0, minHeight: 0, display: 'flex' }}
                  >
                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                      <MarkdownPreview
                        ref={previewRef}
                        content={localContent}
                        filePath={activeTab.path}
                        onScrollToLine={handlePreviewScrollToLine}
                        onLineClick={handleLineClick}
                        onWikiLinkClick={handleWikiLinkClick}
                        highlights={highlights}
                        onHighlightCreate={handleHighlightCreate}
                        onHighlightDelete={handleHighlightDelete}
                      />
                    </div>
                    {showRelated && (
                      <RelatedNotes filePath={activeTab.path} onClose={() => setShowRelated(false)} />
                    )}
                    {showEntities && (
                      <div className="related-panel">
                        <div className="related-panel-header">
                          <span>Entities</span>
                          <button className="icon-btn" onClick={() => setShowEntities(false)}><Tag size={13} /></button>
                        </div>
                        <EntityPanel content={localContent} />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <EmptyEditor />
        )}
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      {!isCanvas && (
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
            {activeTab && (
              <>
                <button
                  onClick={() => setShowRelated((v) => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: showRelated ? 'rgba(255,255,255,0.2)' : 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11, borderRadius: 4, padding: '1px 6px' }}
                  title="Related Notes"
                >
                  <Sparkles size={12} />
                </button>
                <button
                  onClick={() => setShowEntities((v) => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: showEntities ? 'rgba(255,255,255,0.2)' : 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11, borderRadius: 4, padding: '1px 6px' }}
                  title="Entity Panel"
                >
                  <Tag size={12} />
                </button>
                <button
                  onClick={() => setShowFlashcards(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11, borderRadius: 4, padding: '1px 6px' }}
                  title="Flashcard Review"
                >
                  <Brain size={12} />
                </button>
                <button
                  onClick={() => setShowGraph(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11, borderRadius: 4, padding: '1px 6px' }}
                  title="Knowledge Graph"
                >
                  <Network size={12} />
                </button>
              </>
            )}
            <button
              onClick={() => updateSettings({ showEditor: !settings.showEditor })}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: showEditor ? 'transparent' : 'rgba(255,255,255,0.15)', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11, borderRadius: 4, padding: '1px 6px' }}
              title={`${showEditor ? 'Hide' : 'Show'} editor (Ctrl+Shift+E)`}
            >
              {showEditor ? <Code size={12} /> : <CodeXml size={12} />}
              Editor
            </button>
            <button
              onClick={() => updateSettings({ showPreview: !settings.showPreview })}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: showPreview ? 'transparent' : 'rgba(255,255,255,0.15)', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11, borderRadius: 4, padding: '1px 6px' }}
              title={`${showPreview ? 'Hide' : 'Show'} preview (Ctrl+Shift+V)`}
            >
              {showPreview ? <Eye size={12} /> : <EyeOff size={12} />}
              Preview
            </button>
            <button
              onClick={() => updateSettings({ previewSide: isRow ? 'bottom' : 'right' })}
              style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11 }}
              title="Flip layout side"
            >
              <LayoutPanelLeft size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Overlays ────────────────────────────────────────────────────── */}
      {showFlashcards && activeTab && (
        <FlashcardMode
          filePath={activeTab.path}
          content={localContent}
          onClose={() => setShowFlashcards(false)}
        />
      )}
      {showGraph && (
        <GraphView onClose={() => setShowGraph(false)} />
      )}
    </div>
  );
}
