import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useVaultStore } from '@/stores/vaultStore';
import { useFileStore } from '@/stores/fileStore';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import { FolderOpen, FolderPlus, Clock, ChevronRight, Trash2 } from 'lucide-react';

export default function VaultPicker() {
  const { recentVaults, openVault, removeRecentVault } = useVaultStore();
  const { loadVault } = useFileStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenVault = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Open Vault' });
      if (!selected || typeof selected !== 'string') return;
      await loadVaultAt(selected);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCreateVault = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Choose Location for New Vault' });
      if (!selected || typeof selected !== 'string') return;

      const name = prompt('Vault name:');
      if (!name?.trim()) return;

      const vaultPath = pathUtils.join(selected, name.trim());
      await fs.createDir(vaultPath);

      // Create starter structure
      await fs.createDir(pathUtils.join(vaultPath, 'Journal'));
      await fs.createDir(pathUtils.join(vaultPath, 'Notes'));
      await fs.createDir(pathUtils.join(vaultPath, 'Inbox'));
      await fs.writeTextFile(
        pathUtils.join(vaultPath, 'Welcome.md'),
        `# Welcome to ${name.trim()}\n\nYour personal markdown vault is ready.\n\n## Getting Started\n\n- Press **Ctrl+N** to create a new note\n- Press **Ctrl+P** to search\n- Press **Ctrl+Shift+P** to open the command palette\n- Press **Ctrl+D** to open today's daily note\n`,
      );

      await loadVaultAt(vaultPath);
    } catch (e) {
      setError(String(e));
    }
  };

  const loadVaultAt = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const exists = await fs.exists(path);
      if (!exists) {
        setError(`Path no longer exists: ${path}`);
        return;
      }
      openVault(path);
      await loadVault(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vault-picker">
      <div className="vault-picker-card fade-in">
        {/* Logo / Title */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
            style={{ background: 'var(--accent)' }}
          >
            V
          </div>
          <div>
            <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              VaultNote
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Local-first markdown notetaker
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={handleOpenVault}
            disabled={loading}
            className="flex-1 flex items-center gap-2 justify-center px-4 py-3 rounded-lg font-medium text-sm transition-all"
            style={{
              background: 'var(--accent)',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <FolderOpen size={16} />
            Open Vault
          </button>
          <button
            onClick={handleCreateVault}
            disabled={loading}
            className="flex-1 flex items-center gap-2 justify-center px-4 py-3 rounded-lg font-medium text-sm transition-all"
            style={{
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <FolderPlus size={16} />
            New Vault
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="text-sm px-3 py-2 rounded-lg mb-4"
            style={{ background: 'rgba(224,92,92,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
          >
            {error}
          </div>
        )}

        {/* Recent Vaults */}
        {recentVaults.length > 0 && (
          <div>
            <div
              className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              <Clock size={11} />
              Recent Vaults
            </div>
            <div className="flex flex-col gap-1">
              {recentVaults.map((vault) => (
                <div
                  key={vault.path}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                  style={{ background: 'var(--bg-hover)' }}
                  onClick={() => loadVaultAt(vault.path)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'var(--bg-active)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'var(--bg-hover)')
                  }
                >
                  <FolderOpen size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-medium text-sm truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {vault.name}
                    </div>
                    <div
                      className="text-xs truncate mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {vault.path}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentVault(vault.path);
                      }}
                      className="icon-btn"
                      title="Remove from recent"
                    >
                      <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                    </button>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div
            className="text-center text-sm mt-4"
            style={{ color: 'var(--text-muted)' }}
          >
            Loading vault…
          </div>
        )}
      </div>
    </div>
  );
}
