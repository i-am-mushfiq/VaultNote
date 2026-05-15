import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useEmbeddingStore } from '@/stores/embeddingStore';
import { useUIStore } from '@/stores/uiStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { pathUtils } from '@/lib/pathUtils';
import { Search, FileText, Sparkles, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

type SearchMode = 'text' | 'semantic';

export default function SearchModal() {
  const { query, results, isSearching, selectedIndex, setQuery, clearSearch, selectNext, selectPrev, getSelected } =
    useSearchStore();
  const { search: semanticSearch, modelStatus, modelError, indexStatus } = useEmbeddingStore();
  const { closeSearch } = useUIStore();
  const { openTab } = useTabStore();
  const { loadFile } = useEditorStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<SearchMode>('text');
  const [semQuery, setSemQuery] = useState('');
  const [semResults, setSemResults] = useState<{ path: string; score: number }[]>([]);
  const [semLoading, setSemLoading] = useState(false);
  const semTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { warmModel } = useEmbeddingStore();

  // Focus input on open, clear on close
  useEffect(() => {
    inputRef.current?.focus();
    return () => { clearSearch(); setSemResults([]); };
  }, []);

  // Re-focus when switching tabs
  useEffect(() => { inputRef.current?.focus(); }, [mode]);

  // Debounced semantic search
  const runSemantic = useCallback((q: string) => {
    if (semTimer.current) clearTimeout(semTimer.current);
    if (!q.trim()) { setSemResults([]); return; }
    semTimer.current = setTimeout(async () => {
      setSemLoading(true);
      try {
        const res = await semanticSearch(q.trim(), 10);
        setSemResults(res);
      } catch { setSemResults([]); }
      finally { setSemLoading(false); }
    }, 400);
  }, [semanticSearch]);

  const handleSemQueryChange = (q: string) => {
    setSemQuery(q);
    runSemantic(q);
  };

  const openResult = async (path: string) => {
    closeSearch();
    clearSearch();
    const content = await loadFile(path);
    openTab(path, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === 'text') {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectNext(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectPrev(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = getSelected();
        if (selected) openResult(selected.path);
      }
    }
    if (e.key === 'Escape') { closeSearch(); clearSearch(); }
    // Tab key switches modes
    if (e.key === 'Tab') {
      e.preventDefault();
      setMode((m) => m === 'text' ? 'semantic' : 'text');
    }
  };

  const modelReady   = modelStatus === 'ready';
  const modelLoading = modelStatus === 'loading' || indexStatus === 'building';
  const modelFailed  = modelStatus === 'error';

  return (
    <div className="overlay-backdrop" onClick={() => { closeSearch(); clearSearch(); }}>
      <div className="modal-box fade-in" onClick={(e) => e.stopPropagation()}>

        {/* ── Mode tabs ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
        }}>
          {(['text', 'semantic'] as SearchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '9px 0',
                background: 'none',
                border: 'none',
                borderBottom: mode === m ? '2px solid var(--accent)' : '2px solid transparent',
                color: mode === m ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: mode === m ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'color 0.15s',
              }}
            >
              {m === 'text'
                ? <><Search size={13} /> Text</>
                : <><Sparkles size={13} /> Semantic</>}
            </button>
          ))}
        </div>

        {/* ── Search input ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          {mode === 'text'
            ? <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            : <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
          <input
            ref={inputRef}
            className="modal-input"
            style={{ border: 'none', padding: '14px 12px' }}
            placeholder={mode === 'text' ? 'Search notes…' : 'Describe what you\'re looking for…'}
            value={mode === 'text' ? query : semQuery}
            onChange={(e) => mode === 'text' ? setQuery(e.target.value) : handleSemQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {(mode === 'text' ? isSearching : semLoading) && (
            <Loader2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
          )}
        </div>

        {/* ── Semantic model status bar ─────────────────────────────────── */}
        {mode === 'semantic' && (
          <div style={{
            padding: '6px 16px',
            fontSize: 11,
            color: modelReady ? 'var(--success)' : modelFailed ? 'var(--danger)' : 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {modelLoading && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
            {modelFailed  && <AlertTriangle size={11} />}
            {modelReady
              ? '✓ Embedding model ready — results ranked by meaning, not keywords'
              : modelLoading
                ? 'Loading embedding model… (downloads once, ~22 MB)'
                : modelFailed
                  ? <>Model failed: {modelError} <button onClick={() => warmModel()} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}><RefreshCw size={10} /> Retry</button></>
                  : 'Embedding model not loaded — open a note to trigger indexing'}
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        <div className="modal-results">
          {mode === 'text' ? (
            <>
              {results.length === 0 && query.trim() && !isSearching && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No results for "{query}"
                </div>
              )}
              {results.length === 0 && !query.trim() && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Type to search across all notes
                </div>
              )}
              {results.map((result, idx) => (
                <div
                  key={result.path}
                  className={`modal-result-item${idx === selectedIndex ? ' selected' : ''}`}
                  onClick={() => openResult(result.path)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <FileText size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary)' }}>
                      {result.title}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                      {pathUtils.basename(pathUtils.dirname(result.path))}
                    </span>
                  </div>
                  {result.excerpt && (
                    <div style={{
                      fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
                      paddingLeft: 21, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {result.excerpt}
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              {!semQuery.trim() && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Describe what you're looking for in plain English
                  <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
                    e.g. "notes about deployment", "my therapy session thoughts", "book summaries"
                  </div>
                </div>
              )}
              {semQuery.trim() && !semLoading && semResults.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {!modelReady
                    ? 'Waiting for embedding model to load…'
                    : 'No similar notes found. Try different phrasing.'}
                </div>
              )}
              {semResults.map((result) => (
                <div
                  key={result.path}
                  className="modal-result-item"
                  onClick={() => openResult(result.path)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary)' }}>
                      {pathUtils.stem(result.path)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                      {pathUtils.basename(pathUtils.dirname(result.path))}
                    </span>
                    {/* Similarity bar */}
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: result.score > 0.6 ? 'var(--success)' : result.score > 0.45 ? 'var(--accent)' : 'var(--text-muted)',
                      flexShrink: 0, minWidth: 34, textAlign: 'right',
                    }}>
                      {Math.round(result.score * 100)}%
                    </span>
                  </div>
                  {/* Thin score bar */}
                  <div style={{ marginTop: 5, paddingLeft: 21 }}>
                    <div style={{
                      height: 2, borderRadius: 1,
                      background: 'var(--border)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${result.score * 100}%`,
                        background: result.score > 0.6 ? 'var(--success)' : 'var(--accent)',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)',
          alignItems: 'center',
        }}>
          {mode === 'text' ? (
            <><span>↑↓ Navigate</span><span>↵ Open</span></>
          ) : (
            <span>↵ or click to open</span>
          )}
          <span>Tab Switch mode</span>
          <span>Esc Close</span>
          {mode === 'text' && results.length > 0 && (
            <span style={{ marginLeft: 'auto' }}>{results.length} results</span>
          )}
          {mode === 'semantic' && semResults.length > 0 && (
            <span style={{ marginLeft: 'auto' }}>{semResults.length} results</span>
          )}
        </div>
      </div>
    </div>
  );
}
