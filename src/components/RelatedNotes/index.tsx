import { useEffect, useState } from 'react';
import { useEmbeddingStore } from '@/stores/embeddingStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useGraphStore } from '@/stores/graphStore';
import { pathUtils } from '@/lib/pathUtils';
import { GitBranch, Sparkles, X, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

interface Props { filePath: string; onClose: () => void; }

export default function RelatedNotes({ filePath, onClose }: Props) {
  const { related, modelStatus, modelError, warmModel } = useEmbeddingStore();
  const { getBacklinks } = useGraphStore();
  const { openTab } = useTabStore();
  const { loadFile } = useEditorStore();

  const [semantic, setSemantic] = useState<{ path: string; score: number }[]>([]);
  const backlinks = getBacklinks(filePath);

  useEffect(() => {
    if (modelStatus === 'ready') setSemantic(related(filePath, 6));
    else setSemantic([]);
  }, [filePath, modelStatus, related]);

  const open = async (path: string) => {
    const content = await loadFile(path);
    openTab(path, content);
  };

  const renderSemanticStatus = () => {
    if (modelStatus === 'ready') {
      if (semantic.length === 0) return <div className="related-empty">No similar notes found</div>;
      return null;
    }
    if (modelStatus === 'loading') return (
      <div className="related-empty" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        Loading embedding model…
      </div>
    );
    if (modelStatus === 'error') return (
      <div style={{ padding: '6px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>
          <AlertTriangle size={11} /> Model failed to load
        </div>
        {modelError && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, wordBreak: 'break-word', lineHeight: 1.4 }}>
            {modelError}
          </div>
        )}
        <button
          onClick={() => warmModel()}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <RefreshCw size={11} /> Retry
        </button>
      </div>
    );
    // 'idle' — model hasn't started loading yet
    return (
      <div className="related-empty" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        Waiting for indexing to start…
      </div>
    );
  };

  return (
    <div className="related-panel">
      <div className="related-panel-header">
        <span>Related Notes</span>
        <button className="icon-btn" onClick={onClose}><X size={13} /></button>
      </div>

      {/* Semantic similar */}
      <div className="related-section">
        <div className="related-section-title"><Sparkles size={11} /> Semantically Similar</div>
        {renderSemanticStatus()}
        {modelStatus === 'ready' && semantic.map((r) => (
          <button key={r.path} className="related-item" onClick={() => open(r.path)}>
            <span className="related-name">{pathUtils.stem(r.path)}</span>
            <span className="related-score">{Math.round(r.score * 100)}%</span>
          </button>
        ))}
      </div>

      {/* Backlinks */}
      <div className="related-section">
        <div className="related-section-title"><GitBranch size={11} /> Backlinks ({backlinks.length})</div>
        {backlinks.length === 0 && <div className="related-empty">No backlinks</div>}
        {backlinks.map((p) => (
          <button key={p} className="related-item" onClick={() => open(p)}>
            <span className="related-name">{pathUtils.stem(p)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
