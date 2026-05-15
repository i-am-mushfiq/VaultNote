import { useState, useRef, useEffect, useCallback } from 'react';
import { useVaultStore } from '@/stores/vaultStore';
import { useFileStore } from '@/stores/fileStore';
import { useUIStore } from '@/stores/uiStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useGraphStore } from '@/stores/graphStore';
import { useEmbeddingStore } from '@/stores/embeddingStore';
import { useVaultPasswordStore } from '@/stores/vaultPasswordStore';
import { useNoteRegistryStore } from '@/stores/noteRegistryStore';
import { pathUtils } from '@/lib/pathUtils';
import FileTreeNode from './FileTreeNode';
import GraphView from '@/components/GraphView';
import VaultLock from '@/components/VaultLock';
import {
  FolderOpen,
  FilePlus,
  FolderPlus,
  RefreshCw,
  ChevronLeft,
  Network,
  Shield,
  Lock,
  Sparkles,
  FileText,
} from 'lucide-react';

import type { FileNode } from '@/types';

export default function Sidebar() {
  const { currentVault, closeVault } = useVaultStore();
  const { rootNodes, isLoading, createFile, createFolder, refreshVault } = useFileStore();
  const { toggleSidebar } = useUIStore();
  const { openTab } = useTabStore();
  const { loadFile } = useEditorStore();
  const graphStore = useGraphStore();
  const embeddingStore = useEmbeddingStore();
  const vaultPasswordStore = useVaultPasswordStore();

  const [filter, setFilter] = useState('');
  const [showGraph, setShowGraph] = useState(false);
  const [showVaultLock, setShowVaultLock] = useState(false);

  // Semantic search state
  const [semResults, setSemResults] = useState<{ path: string; score: number }[]>([]);
  const [semLoading, setSemLoading] = useState(false);
  const semTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Intelligence wiring: index vault on load ──────────────────────────────
  useEffect(() => {
    if (!currentVault || isLoading || rootNodes.length === 0) return;
    const allPaths = flattenAllPaths(rootNodes);
    const mdPaths  = allPaths.filter(pathUtils.isMarkdown);

    vaultPasswordStore.loadLock(currentVault.path);
    useNoteRegistryStore.getState().loadRegistry(currentVault.path);
    graphStore.buildNameIndex(mdPaths);
    graphStore.indexAll(mdPaths);

    const password = vaultPasswordStore.password ?? undefined;

    // Start model download eagerly — don't wait for file indexing to begin
    embeddingStore.warmModel();

    embeddingStore.loadIndex(currentVault.path, password).then(() => {
      embeddingStore.indexAll(currentVault.path, mdPaths, password).then(() => {
        // Once embeddings are ready, enrich the knowledge graph with semantic edges.
        // Read live state — the closure-captured embeddingStore.index is a stale snapshot.
        const liveIndex = useEmbeddingStore.getState().index;
        if (liveIndex.size > 1) graphStore.addSemanticEdges(liveIndex);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVault?.path, isLoading, rootNodes.length]);

  // ── Semantic search: debounced on filter change ───────────────────────────
  const runSemantic = useCallback((q: string) => {
    if (semTimer.current) clearTimeout(semTimer.current);
    if (!q.trim()) { setSemResults([]); return; }
    semTimer.current = setTimeout(async () => {
      if (embeddingStore.modelStatus !== 'ready') { setSemResults([]); return; }
      setSemLoading(true);
      try {
        const res = await embeddingStore.search(q.trim(), 8);
        setSemResults(res);
      } catch { setSemResults([]); }
      finally { setSemLoading(false); }
    }, 350);
  }, [embeddingStore]);

  const handleFilterChange = (q: string) => {
    setFilter(q);
    runSemantic(q);
  };

  // ── File actions ──────────────────────────────────────────────────────────
  const handleNewFile = async () => {
    if (!currentVault) return;
    const name = prompt('File name:');
    if (!name?.trim()) return;
    try {
      const path = await createFile(currentVault.path, name.trim());
      const content = await loadFile(path);
      openTab(path, content);
    } catch (e) { console.error(e); }
  };

  const handleNewFolder = async () => {
    if (!currentVault) return;
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    try { await createFolder(currentVault.path, name.trim()); }
    catch (e) { console.error(e); }
  };

  const handleFileClick = async (path: string) => {
    try {
      const content = await loadFile(path);
      openTab(path, content);
    } catch (e) { console.error(e); }
  };

  // ── Name filter (always instant) ──────────────────────────────────────────
  const nameFiltered = filter.trim()
    ? flattenNodes(rootNodes).filter((n) =>
        n.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : null;

  const modelReady = embeddingStore.modelStatus === 'ready';
  const hasQuery   = filter.trim().length > 0;

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sidebar-header">
        <span className="sidebar-title" title={currentVault?.path}>
          {currentVault?.name ?? 'Vault'}
          {vaultPasswordStore.isLocked && (
            <span className="vault-lock-badge" style={{ marginLeft: 6 }}>
              <Lock size={8} />
              {vaultPasswordStore.isUnlocked ? 'open' : 'locked'}
            </span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          <button className="icon-btn" title="Knowledge Graph"          onClick={() => setShowGraph(true)}><Network size={14} /></button>
          <button className="icon-btn" title="Vault Intelligence Lock"  onClick={() => setShowVaultLock(true)}><Shield size={14} /></button>
          <button className="icon-btn" title="New File (Ctrl+N)"        onClick={handleNewFile}><FilePlus size={14} /></button>
          <button className="icon-btn" title="New Folder"               onClick={handleNewFolder}><FolderPlus size={14} /></button>
          <button className="icon-btn" title="Refresh"                  onClick={() => currentVault && refreshVault(currentVault.path)}><RefreshCw size={13} /></button>
          <button className="icon-btn" title="Collapse Sidebar (Ctrl+B)" onClick={toggleSidebar}><ChevronLeft size={14} /></button>
        </div>
      </div>

      {/* Overlays */}
      {showGraph     && <GraphView onClose={() => setShowGraph(false)} />}
      {showVaultLock && <VaultLock onClose={() => setShowVaultLock(false)} />}

      {/* ── Search / filter input ────────────────────────────────────────── */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ position: 'relative' }}>
          <input
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value)}
            placeholder={modelReady ? 'Filter or search…' : 'Filter files…'}
            style={{
              width: '100%',
              background: 'var(--bg-active)',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              padding: '4px 28px 4px 8px',
              fontSize: '12px',
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => e.key === 'Escape' && handleFilterChange('')}
          />
          {/* Sparkle badge when model is ready, shown at right of input */}
          {modelReady && (
            <Sparkles
              size={11}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                color: hasQuery && semResults.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* ── File tree OR search results ───────────────────────────────────── */}
      <div className="file-tree">
        {isLoading && (
          <div className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>
            Loading vault…
          </div>
        )}

        {!isLoading && !hasQuery && rootNodes.map((node) => (
          <FileTreeNode key={node.path} node={node} onFileClick={handleFileClick} />
        ))}

        {!isLoading && hasQuery && (
          <>
            {/* Name matches */}
            {nameFiltered && nameFiltered.length > 0 && (
              <div>
                <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Name matches
                </div>
                {nameFiltered.map((node) => (
                  <FileTreeNode
                    key={node.path}
                    node={{ ...node, depth: 0 }}
                    onFileClick={handleFileClick}
                  />
                ))}
              </div>
            )}

            {/* Semantic results */}
            {modelReady && (
              <div>
                <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={9} /> Semantic
                  {semLoading && <span style={{ opacity: 0.6, fontWeight: 400 }}> searching…</span>}
                </div>
                {!semLoading && semResults.length === 0 && (
                  <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--text-muted)' }}>
                    No similar notes
                  </div>
                )}
                {semResults.map((r) => (
                  <button
                    key={r.path}
                    onClick={() => handleFileClick(r.path)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                      padding: '5px 12px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    className="sidebar-sem-result"
                  >
                    <FileText size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pathUtils.stem(r.path)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, flexShrink: 0,
                      color: r.score > 0.6 ? 'var(--success)' : r.score > 0.45 ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                      {Math.round(r.score * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* No results at all */}
            {nameFiltered?.length === 0 && semResults.length === 0 && !semLoading && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No files match "{filter}"
              </div>
            )}
          </>
        )}

        {!isLoading && !hasQuery && rootNodes.length === 0 && (
          <div className="empty-state" style={{ padding: '32px 16px' }}>
            <FolderOpen size={28} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Vault is empty</span>
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {currentVault?.path}
        </span>
        <button
          className="text-xs px-2 py-0.5 rounded"
          style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
          onClick={closeVault}
          title="Close vault"
        >
          ✕
        </button>
      </div>
    </>
  );
}

function flattenNodes(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  const walk = (ns: FileNode[]) => {
    for (const n of ns) {
      result.push(n);
      if (n.isDirectory && n.isExpanded && n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

function flattenAllPaths(nodes: FileNode[]): string[] {
  const result: string[] = [];
  const walk = (ns: FileNode[]) => {
    for (const n of ns) {
      if (!n.isDirectory) result.push(n.path);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return result;
}
