import { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import {
  setDirectoryLock,
  verifyDirectoryPassword,
  removeDirectoryLock,
  createVaultArchive,
  openVaultArchive,
  extractVaultArchive,
  migrateToArchiveIfNeeded,
} from '@/lib/directoryLock';
import { useLockStore } from '@/stores/lockStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useFileStore } from '@/stores/fileStore';
import { pathUtils } from '@/lib/pathUtils';

interface Props {
  dirPath: string;
  /** 'set'    → create a new lock + encrypt all existing files
   *  'verify' → enter password to unlock for this session
   *  'remove' → verify then decrypt all files + permanently remove the lock
   */
  mode: 'set' | 'verify' | 'remove';
  onSuccess: () => void;
  onCancel: () => void;
}

export default function LockModal({ dirPath, mode, onSuccess, onCancel }: Props) {
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const { markLocked, grantSession, markPermanentlyUnlocked } = useLockStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const dirName = pathUtils.basename(dirPath);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) { setError('Password is required.'); return; }

    // ── Set lock ─────────────────────────────────────────────────────────────
    if (mode === 'set') {
      if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }

      setLoading(true);
      try {
        // 1. Write the lock manifest (PBKDF2 hash/salt for future verification)
        await setDirectoryLock(dirPath, password);

        // 2. Pack ALL .md files into one encrypted archive, then delete originals.
        //    After this step, no file names or structure are visible on disk.
        setProgress('Archiving & encrypting…');
        await createVaultArchive(dirPath, password);
        setProgress(null);

        // 3. Close all open tabs from this directory and evict their plaintext.
        useTabStore.getState().closeTabsUnderPath(dirPath);
        const sep = dirPath + '\\';
        useEditorStore.getState().contents.forEach((_, p) => {
          if (p.startsWith(sep)) useEditorStore.getState().removeContent(p);
        });

        // 4. Clear any virtual contents left from a prior session.
        useLockStore.getState().clearVirtualContentsForDir(dirPath);

        // 5. Collapse the directory in the file tree so it appears sealed.
        useFileStore.getState().collapseDir(dirPath);

        // 6. Mark as locked — no session granted. User must re-authenticate.
        markLocked(dirPath);

        onSuccess();
      } catch (err) {
        setError(`Failed to lock directory: ${err}`);
        setProgress(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Verify or remove — both need the correct password first ──────────────
    setLoading(true);
    try {
      const ok = await verifyDirectoryPassword(dirPath, password);
      if (!ok) { setError('Incorrect password. Try again.'); return; }

      if (mode === 'verify') {
        // Migrate from old per-file format if this directory was locked before
        // the archive format was introduced. One-time, transparent upgrade.
        setProgress('Checking format…');
        const migrated = await migrateToArchiveIfNeeded(dirPath, password);
        if (migrated) setProgress('Migrated to archive format…');

        // Decrypt the archive into memory — populate virtual FS.
        setProgress('Decrypting archive…');
        const contents = await openVaultArchive(dirPath, password);
        setProgress(null);

        grantSession(dirPath, password);
        useLockStore.getState().setVirtualContents(contents);
        onSuccess();
      } else {
        // remove: migrate old format if needed, then extract archive to files
        setProgress('Checking format…');
        await migrateToArchiveIfNeeded(dirPath, password);
        setProgress('Restoring files…');
        await extractVaultArchive(dirPath, password);
        setProgress(null);

        await removeDirectoryLock(dirPath);
        useLockStore.getState().clearVirtualContentsForDir(dirPath);
        markPermanentlyUnlocked(dirPath);

        // Refresh the tree so the real restored files appear.
        useFileStore.getState().refreshNode(dirPath);
        onSuccess();
      }
    } catch (err) {
      setError(`Error: ${err}`);
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'set'    ? `Encrypt & Lock "${dirName}"` :
    mode === 'verify' ? `Unlock "${dirName}"` :
                        `Remove Lock from "${dirName}"`;

  const Icon = mode === 'set' ? Lock : mode === 'verify' ? Unlock : ShieldCheck;

  const submitLabel =
    mode === 'set'    ? 'Encrypt & Lock' :
    mode === 'verify' ? 'Unlock' :
                        'Decrypt & Remove Lock';

  return (
    <div className="overlay-backdrop" onClick={onCancel}>
      <div
        className="modal-box fade-in"
        style={{ maxWidth: 400 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '18px 20px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Icon size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {title}
          </span>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px 20px' }}>
          {mode === 'set' && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              All <code>.md</code> files in this directory will be{' '}
              <strong>AES-256 encrypted on disk</strong>. Only VaultNote (with the
              correct password) can read them. If you lose the password, the notes
              cannot be recovered.
            </p>
          )}
          {mode === 'remove' && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Enter the current password to decrypt all files and permanently remove
              the lock. Files will be restored to plaintext on disk.
            </p>
          )}

          {/* Password field */}
          <div style={{ marginBottom: mode === 'set' ? 12 : 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              {mode === 'set' ? 'New password' : 'Password'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Enter password…"
                style={{
                  width: '100%',
                  background: 'var(--bg-active)',
                  border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '9px 36px 9px 12px',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
                onKeyDown={(e) => e.key === 'Escape' && onCancel()}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 0,
                  display: 'flex',
                }}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Confirm field (set mode only) */}
          {mode === 'set' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Confirm password
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                placeholder="Repeat password…"
                style={{
                  width: '100%',
                  background: 'var(--bg-active)',
                  border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          )}

          {/* Progress indicator */}
          {progress && (
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)',
              marginBottom: 16, padding: '8px 12px',
              background: 'var(--bg-elevated)', borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              {progress}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 13,
                color: 'var(--danger)',
                marginBottom: 16,
                padding: '8px 12px',
                background: 'rgba(224,92,92,0.1)',
                borderRadius: 6,
                border: '1px solid rgba(224,92,92,0.25)',
              }}
            >
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                padding: '7px 16px',
                borderRadius: 7,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '7px 18px',
                borderRadius: 7,
                background: mode === 'remove' ? 'var(--danger)' : 'var(--accent)',
                border: 'none',
                color: 'white',
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Please wait…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
