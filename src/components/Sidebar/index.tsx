import { useState, useRef } from 'react';
import { useVaultStore } from '@/stores/vaultStore';
import { useFileStore } from '@/stores/fileStore';
import { useUIStore } from '@/stores/uiStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import FileTreeNode from './FileTreeNode';
import {
  FolderOpen,
  FilePlus,
  FolderPlus,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react';

export default function Sidebar() {
  const { currentVault, closeVault } = useVaultStore();
  const { rootNodes, isLoading, createFile, createFolder, refreshVault } = useFileStore();
  const { toggleSidebar } = useUIStore();
  const { openTab } = useTabStore();
  const { loadFile } = useEditorStore();
  const [filter, setFilter] = useState('');

  const handleNewFile = async () => {
    if (!currentVault) return;
    const name = prompt('File name:');
    if (!name?.trim()) return;
    try {
      const path = await createFile(currentVault.path, name.trim());
      const content = await loadFile(path);
      openTab(path, content);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewFolder = async () => {
    if (!currentVault) return;
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    try {
      await createFolder(currentVault.path, name.trim());
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileClick = async (path: string) => {
    try {
      const content = await loadFile(path);
      openTab(path, content);
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = filter.trim()
    ? flattenNodes(rootNodes).filter((n) =>
        n.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : null;

  return (
    <>
      {/* Header */}
      <div className="sidebar-header">
        <span className="sidebar-title" title={currentVault?.path}>
          {currentVault?.name ?? 'Vault'}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="icon-btn"
            title="New File (Ctrl+N)"
            onClick={handleNewFile}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="icon-btn"
            title="New Folder"
            onClick={handleNewFolder}
          >
            <FolderPlus size={14} />
          </button>
          <button
            className="icon-btn"
            title="Refresh"
            onClick={() => currentVault && refreshVault(currentVault.path)}
          >
            <RefreshCw size={13} />
          </button>
          <button
            className="icon-btn"
            title="Collapse Sidebar (Ctrl+B)"
            onClick={toggleSidebar}
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter files…"
          style={{
            width: '100%',
            background: 'var(--bg-active)',
            border: '1px solid var(--border)',
            borderRadius: '5px',
            padding: '4px 8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
          onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
        />
      </div>

      {/* Tree */}
      <div className="file-tree">
        {isLoading && (
          <div
            className="text-xs px-4 py-3"
            style={{ color: 'var(--text-muted)' }}
          >
            Loading vault…
          </div>
        )}

        {!isLoading && filtered !== null
          ? filtered.map((node) => (
              <FileTreeNode
                key={node.path}
                node={{ ...node, depth: 0 }}
                onFileClick={handleFileClick}
              />
            ))
          : rootNodes.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                onFileClick={handleFileClick}
              />
            ))}

        {!isLoading && rootNodes.length === 0 && (
          <div className="empty-state" style={{ padding: '32px 16px' }}>
            <FolderOpen size={28} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Vault is empty
            </span>
          </div>
        )}
      </div>

      {/* Vault name / close */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
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

import type { FileNode } from '@/types';

function flattenNodes(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  const walk = (ns: FileNode[]) => {
    for (const n of ns) {
      result.push(n);
      if (n.isDirectory && n.isExpanded && n.children.length) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return result;
}
