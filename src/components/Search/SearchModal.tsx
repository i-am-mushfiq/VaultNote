import { useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { pathUtils } from '@/lib/pathUtils';
import { Search, FileText } from 'lucide-react';

export default function SearchModal() {
  const { query, results, isSearching, selectedIndex, setQuery, clearSearch, selectNext, selectPrev, getSelected } =
    useSearchStore();
  const { closeSearch } = useUIStore();
  const { openTab } = useTabStore();
  const { loadFile } = useEditorStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearSearch();
  }, []);

  const openResult = async (path: string) => {
    closeSearch();
    clearSearch();
    const content = await loadFile(path);
    openTab(path, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectNext(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectPrev(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = getSelected();
      if (selected) openResult(selected.path);
    }
    else if (e.key === 'Escape') { closeSearch(); clearSearch(); }
  };

  return (
    <div className="overlay-backdrop" onClick={() => { closeSearch(); clearSearch(); }}>
      <div className="modal-box fade-in" onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="modal-input"
            style={{ border: 'none', padding: '14px 12px' }}
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isSearching && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
              Searching…
            </span>
          )}
        </div>

        {/* Results */}
        <div className="modal-results">
          {results.length === 0 && query.trim() && !isSearching && (
            <div
              style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
            >
              No results for "{query}"
            </div>
          )}
          {results.length === 0 && !query.trim() && (
            <div
              style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
            >
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
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    paddingLeft: 21,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {result.excerpt}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 12,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
          {results.length > 0 && (
            <span style={{ marginLeft: 'auto' }}>{results.length} results</span>
          )}
        </div>
      </div>
    </div>
  );
}
