import { useUIStore } from '@/stores/uiStore';
import { useVaultStore } from '@/stores/vaultStore';
import { FileText, Search, BookOpen } from 'lucide-react';

export default function EmptyEditor() {
  const { openSearch, openCommandPalette, toggleSidebar, sidebarOpen } = useUIStore();
  const { currentVault } = useVaultStore();

  return (
    <div className="empty-state">
      <BookOpen size={40} style={{ color: 'var(--text-muted)', marginBottom: 4 }} />
      <div className="empty-state-title">
        {currentVault ? currentVault.name : 'No vault open'}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
        Open a file from the sidebar or use a shortcut to get started.
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {[
          { label: 'Search files', shortcut: 'Ctrl+P', icon: Search, action: openSearch },
          { label: 'New note', shortcut: 'Ctrl+N', icon: FileText, action: openCommandPalette },
          { label: 'Toggle sidebar', shortcut: 'Ctrl+B', icon: BookOpen, action: toggleSidebar },
        ].map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <item.icon size={13} />
            <span>{item.label}</span>
            <kbd
              style={{
                fontSize: 11,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--bg-active)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              {item.shortcut}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
