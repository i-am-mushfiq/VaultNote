import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useFileStore } from '@/stores/fileStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useLockStore } from '@/stores/lockStore';
import { pathUtils } from '@/lib/pathUtils';
import LockModal from '@/components/LockModal';
import { FilePlus, FolderPlus, Pencil, Trash2, Copy, Lock, Unlock, KeyRound, FolderInput, X } from 'lucide-react';

export default function ContextMenuOverlay() {
  const { contextMenu, hideContextMenu, setRenameTarget } = useUIStore();
  const { createFile, createFolder, deleteNode, moveNode, flatNodes } = useFileStore();
  const { openTab, closeTabByPath } = useTabStore();
  const { loadFile } = useEditorStore();
  const lockStore = useLockStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const [lockModal, setLockModal] = useState<'set' | 'verify' | 'remove' | null>(null);
  // Saved separately so modals survive the context menu being closed
  const [modalTarget, setModalTarget] = useState({ path: '', isDirectory: false });

  // Move modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveSrcPath, setMoveSrcPath] = useState('');
  const [moveFilter, setMoveFilter] = useState('');

  // Global mousedown closes the menu (only active while menu is open)
  useEffect(() => {
    if (!contextMenu) return;
    const handle = () => hideContextMenu();
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [contextMenu, hideContextMenu]);

  // Clamp menu to viewport
  useEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const r  = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r.right  > vw) menuRef.current.style.left = `${vw - r.width  - 8}px`;
    if (r.bottom > vh) menuRef.current.style.top  = `${vh - r.height - 8}px`;
  }, [contextMenu]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const openLockModal = (mode: 'set' | 'verify' | 'remove') => {
    // Capture target path NOW, before hideContextMenu nulls it
    if (contextMenu) {
      setModalTarget({ path: contextMenu.targetPath, isDirectory: contextMenu.isDirectory });
    }
    hideContextMenu();
    setLockModal(mode);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const withTarget = (fn: (path: string, isDir: boolean) => void) => {
    if (!contextMenu) return;
    fn(contextMenu.targetPath, contextMenu.isDirectory);
  };

  const handleNewFile = () => withTarget(async (targetPath, isDirectory) => {
    hideContextMenu();
    const base = isDirectory ? targetPath : pathUtils.dirname(targetPath);
    const name = prompt('File name:');
    if (!name?.trim()) return;
    try {
      const path    = await createFile(base, name.trim());
      const content = await loadFile(path);
      openTab(path, content);
    } catch (e) { console.error(e); }
  });

  const handleNewFolder = () => withTarget(async (targetPath, isDirectory) => {
    hideContextMenu();
    const base = isDirectory ? targetPath : pathUtils.dirname(targetPath);
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    try { await createFolder(base, name.trim()); } catch (e) { console.error(e); }
  });

  const handleRename = () => withTarget((targetPath) => {
    hideContextMenu();
    setRenameTarget(targetPath);
  });

  const handleDelete = () => withTarget(async (targetPath, isDirectory) => {
    hideContextMenu();
    const label = isDirectory ? 'folder and all its contents' : 'file';
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
    try {
      if (!isDirectory) closeTabByPath(targetPath);
      await deleteNode(targetPath, isDirectory);
    } catch (e) { console.error(e); }
  });

  const handleCopyPath = () => withTarget((targetPath) => {
    hideContextMenu();
    navigator.clipboard.writeText(targetPath).catch(console.error);
  });

  const handleRevokeSession = () => withTarget((targetPath) => {
    hideContextMenu();
    lockStore.revokeSession(targetPath);
  });

  const handleMoveClick = () => withTarget((targetPath) => {
    setMoveSrcPath(targetPath);
    setMoveFilter('');
    hideContextMenu();
    setShowMoveModal(true);
  });

  const handleMoveConfirm = async (targetDir: string) => {
    setShowMoveModal(false);
    try {
      await moveNode(moveSrcPath, targetDir);
    } catch (e) { console.error(e); }
  };

  // ── Derive available directories for the move modal ───────────────────────
  const allDirs = Array.from(flatNodes.values())
    .filter((n) => {
      if (!n.isDirectory) return false;
      if (n.path === moveSrcPath) return false;                          // can't move into itself
      if (n.path === pathUtils.dirname(moveSrcPath)) return false;       // already there
      if (pathUtils.relative(moveSrcPath, n.path) !== n.path) return false; // can't move into descendant
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const filteredDirs = moveFilter.trim()
    ? allDirs.filter((n) => n.path.toLowerCase().includes(moveFilter.toLowerCase()))
    : allDirs;

  // ── Render ────────────────────────────────────────────────────────────────

  // Derive lock state for the currently-open menu (not the saved modal target)
  const menuIsLocked          = contextMenu?.isDirectory && lockStore.isLocked(contextMenu.targetPath);
  const menuIsSessionUnlocked = contextMenu?.isDirectory && lockStore.isSessionUnlocked(contextMenu.targetPath);

  return (
    <>
      {/* ── Context menu popup ─────────────────────────────────────────── */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="context-menu fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contextMenu.isDirectory && (
            <>
              <div className="context-menu-item" onClick={handleNewFile}>
                <FilePlus size={13} /> New File
              </div>
              <div className="context-menu-item" onClick={handleNewFolder}>
                <FolderPlus size={13} /> New Folder
              </div>
              <div className="context-menu-separator" />
            </>
          )}

          <div className="context-menu-item" onClick={handleRename}>
            <Pencil size={13} /> Rename
          </div>
          <div className="context-menu-item" onClick={handleMoveClick}>
            <FolderInput size={13} /> Move to…
          </div>
          <div className="context-menu-item" onClick={handleCopyPath}>
            <Copy size={13} /> Copy Path
          </div>

          {contextMenu.isDirectory && (
            <>
              <div className="context-menu-separator" />
              {!menuIsLocked && (
                <div className="context-menu-item" onClick={() => openLockModal('set')}>
                  <Lock size={13} /> Lock Directory…
                </div>
              )}
              {menuIsLocked && !menuIsSessionUnlocked && (
                <div className="context-menu-item" onClick={() => openLockModal('verify')}>
                  <Unlock size={13} /> Unlock for Session…
                </div>
              )}
              {menuIsLocked && menuIsSessionUnlocked && (
                <>
                  <div className="context-menu-item" onClick={handleRevokeSession}>
                    <Lock size={13} /> Re-lock (this session)
                  </div>
                  <div className="context-menu-item" onClick={() => openLockModal('remove')}>
                    <KeyRound size={13} /> Remove Password…
                  </div>
                </>
              )}
            </>
          )}

          <div className="context-menu-separator" />
          <div className="context-menu-item danger" onClick={handleDelete}>
            <Trash2 size={13} /> Delete
          </div>
        </div>
      )}

      {/* ── Move to… modal ─────────────────────────────────────────────── */}
      {showMoveModal && (
        <div
          className="overlay-backdrop"
          onMouseDown={() => setShowMoveModal(false)}
        >
          <div
            className="modal-box fade-in"
            style={{ maxWidth: 400 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Move "{pathUtils.basename(moveSrcPath)}" to…
              </span>
              <button
                onClick={() => setShowMoveModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Filter input */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus
                value={moveFilter}
                onChange={(e) => setMoveFilter(e.target.value)}
                placeholder="Filter folders…"
                style={{
                  width: '100%', background: 'var(--bg-active)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '5px 8px', fontSize: 12,
                  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                }}
                onKeyDown={(e) => e.key === 'Escape' && setShowMoveModal(false)}
              />
            </div>

            {/* Directory list */}
            <div style={{ maxHeight: 280, overflowY: 'auto' }} className="modal-results">
              {filteredDirs.length === 0 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  {allDirs.length === 0 ? 'No other folders in vault' : 'No matching folders'}
                </div>
              )}
              {filteredDirs.map((dir) => (
                <div
                  key={dir.path}
                  className="modal-result-item"
                  onClick={() => handleMoveConfirm(dir.path)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <FolderInput size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dir.path}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Lock modals — rendered independently of contextMenu state ───── */}
      {lockModal === 'set' && (
        <LockModal
          dirPath={modalTarget.path}
          mode="set"
          onSuccess={() => setLockModal(null)}
          onCancel={() => setLockModal(null)}
        />
      )}
      {lockModal === 'verify' && (
        <LockModal
          dirPath={modalTarget.path}
          mode="verify"
          onSuccess={() => setLockModal(null)}
          onCancel={() => setLockModal(null)}
        />
      )}
      {lockModal === 'remove' && (
        <LockModal
          dirPath={modalTarget.path}
          mode="remove"
          onSuccess={() => setLockModal(null)}
          onCancel={() => setLockModal(null)}
        />
      )}
    </>
  );
}
