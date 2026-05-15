import { useState, useRef, useEffect } from 'react';
import type { FileNode } from '@/types';
import { useFileStore } from '@/stores/fileStore';
import { useTabStore } from '@/stores/tabStore';
import { useUIStore } from '@/stores/uiStore';
import { useLockStore } from '@/stores/lockStore';
import { isDirectoryLocked, LOCK_FILENAME } from '@/lib/directoryLock';
import LockModal from '@/components/LockModal';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Lock } from 'lucide-react';

interface Props {
  node: FileNode;
  onFileClick: (path: string) => void;
}

export default function FileTreeNode({ node, onFileClick }: Props) {
  const { toggleDir, flatNodes, expandDir } = useFileStore();
  const { activeTabId, tabs } = useTabStore();
  const { showContextMenu, renameTarget, setRenameTarget } = useUIStore();
  const { renameNode } = useFileStore();
  const lockStore = useLockStore();

  const [renameValue, setRenameValue]   = useState('');
  const [lockModal, setLockModal]       = useState<'verify' | 'remove' | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const activeTab   = tabs.find((t) => t.id === activeTabId);
  const isActive    = !node.isDirectory && activeTab?.path === node.path;
  const isRenaming  = renameTarget === node.path;
  const liveNode    = flatNodes.get(node.path) ?? node;

  // Skip the lock-metadata file in rendering
  if (node.name === LOCK_FILENAME) return null;

  const isLocked   = node.isDirectory && lockStore.isLocked(node.path);
  const isUnlocked = node.isDirectory && lockStore.isSessionUnlocked(node.path);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(node.name.replace(/\.md$/, ''));
      setTimeout(() => renameRef.current?.select(), 50);
    }
  }, [isRenaming, node.name]);

  // ── Click handler ───────────────────────────────────────────────────────────

  const handleClick = async () => {
    if (node.isDirectory) {
      // Lazily detect lock on first click
      if (!lockStore.isLocked(node.path) && !lockStore.isSessionUnlocked(node.path)) {
        const locked = await isDirectoryLocked(node.path);
        if (locked) {
          lockStore.markLocked(node.path);
          setLockModal('verify');
          return;
        }
      }
      // Locked and not yet unlocked for session
      if (isLocked && !isUnlocked) {
        setLockModal('verify');
        return;
      }
      await toggleDir(liveNode);
    } else {
      onFileClick(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, node.path, node.isDirectory);
  };

  const handleRenameKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newName = renameValue.trim();
      if (newName && newName !== node.name.replace(/\.md$/, '')) {
        try { await renameNode(node.path, newName); } catch (err) { console.error(err); }
      }
      setRenameTarget(null);
    } else if (e.key === 'Escape') {
      setRenameTarget(null);
    }
  };

  // After successful unlock → expand the directory
  const handleUnlockSuccess = async () => {
    setLockModal(null);
    await expandDir(liveNode);
  };

  const indent = node.depth * 16;

  // ── Icon selection ──────────────────────────────────────────────────────────

  const FolderIcon = () => {
    if (isLocked && !isUnlocked) {
      return <Lock size={13} style={{ color: 'var(--accent)', opacity: 0.8 }} />;
    }
    return liveNode.isExpanded
      ? <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
      : <Folder    size={14} style={{ color: 'var(--text-secondary)' }} />;
  };

  return (
    <>
      <div
        className={`file-node${isActive ? ' active' : ''}`}
        style={{ paddingLeft: 8 + indent }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={node.path}
      >
        {/* Chevron */}
        <span className="file-node-icon" style={{ width: 14 }}>
          {node.isDirectory && (
            isLocked && !isUnlocked
              ? null
              : liveNode.isExpanded
                ? <ChevronDown  size={13} style={{ color: 'var(--text-muted)' }} />
                : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          )}
        </span>

        {/* File / folder icon */}
        <span className="file-node-icon">
          {node.isDirectory
            ? <FolderIcon />
            : <FileText size={13} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
          }
        </span>

        {/* Label or rename input */}
        {isRenaming ? (
          <input
            ref={renameRef}
            className="rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => setRenameTarget(null)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="file-node-label" style={{ fontSize: 13 }}>
            {node.name}
          </span>
        )}

        {/* Dirty dot */}
        {!node.isDirectory && useTabStore.getState().getTabByPath(node.path)?.isDirty && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: 'var(--accent)', marginLeft: 4 }}
          />
        )}
      </div>

      {/* Children (only when expanded and session-unlocked if locked) */}
      {node.isDirectory && liveNode.isExpanded && liveNode.childrenLoaded &&
        (!isLocked || isUnlocked) &&
        liveNode.children.map((child) => (
          <FileTreeNode key={child.path} node={child} onFileClick={onFileClick} />
        ))
      }

      {/* Lock modals */}
      {lockModal === 'verify' && (
        <LockModal
          dirPath={node.path}
          mode="verify"
          onSuccess={handleUnlockSuccess}
          onCancel={() => setLockModal(null)}
        />
      )}
      {lockModal === 'remove' && (
        <LockModal
          dirPath={node.path}
          mode="remove"
          onSuccess={() => setLockModal(null)}
          onCancel={() => setLockModal(null)}
        />
      )}
    </>
  );
}
