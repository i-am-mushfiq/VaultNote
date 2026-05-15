import { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, Eye, EyeOff, Shield } from 'lucide-react';
import { useVaultPasswordStore } from '@/stores/vaultPasswordStore';
import { useVaultStore } from '@/stores/vaultStore';
import { useEmbeddingStore } from '@/stores/embeddingStore';

interface Props {
  onClose: () => void;
}

export default function VaultLock({ onClose }: Props) {
  const { lockFile, isUnlocked, createLock, unlock, removeLock } = useVaultPasswordStore();
  const { currentVault } = useVaultStore();
  const { loadIndex } = useEmbeddingStore();

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const isSetup = !lockFile;            // no lock file → setup mode
  const isLocked = lockFile && !isUnlocked; // has lock, not yet unlocked

  const vaultPath = currentVault?.path ?? '';

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await createLock(vaultPath, password);
      await loadIndex(vaultPath, password);
      onClose();
    } catch (err) {
      setError(`Failed to create lock: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) { setError('Password is required.'); return; }
    setLoading(true);
    try {
      const ok = await unlock(password);
      if (!ok) { setError('Incorrect password. Try again.'); return; }
      await loadIndex(vaultPath, password);
      onClose();
    } catch (err) {
      setError(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLock = async () => {
    if (!password) { setError('Enter your current password to remove the lock.'); return; }
    setLoading(true);
    try {
      const ok = await unlock(password);
      if (!ok) { setError('Incorrect password.'); return; }
      await removeLock(vaultPath);
      onClose();
    } catch (err) {
      setError(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
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
          <Shield size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {isSetup ? 'Protect AI Data with a Password' : 'Vault Intelligence Lock'}
          </span>
        </div>

        {/* Body */}
        <form
          onSubmit={isSetup ? handleSetup : handleUnlock}
          style={{ padding: '16px 20px 20px' }}
        >
          {isSetup && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Encrypt your AI embeddings index with a password. The password is only stored in memory
              and never written to disk.
            </p>
          )}

          {/* Password field */}
          <div style={{ marginBottom: isSetup ? 12 : 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              {isSetup ? 'New password' : 'Password'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Enter password…"
                className="modal-input"
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
                onKeyDown={(e) => e.key === 'Escape' && onClose()}
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

          {/* Confirm field (setup mode only) */}
          {isSetup && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Confirm password
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                placeholder="Repeat password…"
                className="modal-input"
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
                fontSize: 13,
                color: 'var(--danger)',
                marginBottom: 16,
                padding: '8px 12px',
                background: 'rgba(224,92,92,0.1)',
                borderRadius: 6,
                border: '1px solid rgba(224,92,92,0.25)',
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Remove lock option (unlock mode only) */}
            {!isSetup && (
              <button
                type="button"
                onClick={handleRemoveLock}
                disabled={loading}
                style={{
                  marginRight: 'auto',
                  padding: '7px 12px',
                  borderRadius: 7,
                  background: 'none',
                  border: 'none',
                  color: 'var(--danger)',
                  fontSize: 12,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                Remove lock
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
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
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 18px',
                borderRadius: 7,
                background: 'var(--accent)',
                border: 'none',
                color: 'white',
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {isSetup ? <Lock size={13} /> : <Unlock size={13} />}
              {loading ? 'Please wait…' : isSetup ? 'Create Lock' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
