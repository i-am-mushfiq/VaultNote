import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useFileStore } from '@/stores/fileStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useLockStore } from '@/stores/lockStore';
import { pathUtils } from '@/lib/pathUtils';
import LockModal from '@/components/LockModal';
import { FilePlus, FolderPlus, Pencil, Trash2, Copy, Lock, Unlock, KeyRound } from 'lucide-react';

export default function ContextMenuOverlay() {
  const { contextMenu, hideContextMenu, setRenameTarget } = useUIStore();
  const { createFile, createFolder, deleteNode } = useFileStore();
  const { openTab, closeTabByPath } = useTabStore();
  const { loadFile } = useEditorStore();
  const lockStore = useLockStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const [lockModal, setLockModal] = useState<'set' | 'verify' | 'remove' | null>(null);
  // Saved separately so modals survive the context menu being closed
  const [modalTarget, setModalTarget] = useState({ path: '', isDirectory: false });

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
