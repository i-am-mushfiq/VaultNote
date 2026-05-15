import { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { setDirectoryLock, verifyDirectoryPassword, removeDirectoryLock } from '@/lib/directoryLock';
import { useLockStore } from '@/stores/lockStore';
import { pathUtils } from '@/lib/pathUtils';

interface Props {
  dirPath: string;
  /** 'set'    → create a new lock (two-field confirm flow)
   *  'verify' → enter password to unlock for this session
   *  'remove' → verify then permanently remove the lock
   */
  mode: 'set' | 'verify' | 'remove';
  onSuccess: () => void;
  onCancel: () => void;
}

export default function LockModal({ dirPath, mode, onSuccess, onCancel }: Props) {
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { markLocked, grantSession, markPermanentlyUnlocked } = useLockStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const dirName = pathUtils.basename(dirPath);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) { setError('Password is required.'); return; }

    if (mode === 'set') {
      if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
      setLoading(true);
      try {
        await setDirectoryLock(dirPath, password);
        markLocked(dirPath);
        grantSession(dirPath);   // immediately unlocked for this session
        onSuccess();
      } catch (err) {
        setError(`Failed to lock directory: ${err}`);
      } finally {
        setLoading(false);
      }
      return;
    }

    // verify or remove — both need correct password first
    setLoading(true);
    try {
      const ok = await verifyDirectoryPassword(dirPath, password);
      if (!ok) { setError('Incorrect password. Try again.'); return; }

      if (mode === 'verify') {
        grantSession(dirPath);
        onSuccess();
      } else {
        // remove
        await removeDirectoryLock(dirPath);
        markPermanentlyUnlocked(dirPath);
        onSuccess();
      }
    } catch (err) {
      setError(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'set'    ? `Lock "${dirName}"` :
    mode === 'verify' ? `Unlock "${dirName}"` :
                        `Remove lock from "${dirName}"`;

  const Icon = mode === 'set' ? Lock : Unlock;
  const submitLabel =
    mode === 'set'    ? 'Lock directory' :
    mode === 'verify' ? 'Unlock' :
                        'Remove lock';

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
              This directory will be password-protected. You'll need the password to access
              it in VaultNote. Files remain on disk — this protects access through the app.
            </p>
          )}
          {mode === 'remove' && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Enter the current password to permanently remove the lock.
            </p>
          )}

          {/* Password field */}
          <div style={{ marginBottom: mode === 'set' ? 12 : 20 }}>
            <label
              style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}
            >
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
              <label
                style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}
              >
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
              style={{
                padding: '7px 16px',
                borderRadius: 7,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
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
