import { useState, useEffect, useRef, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useVaultStore } from '@/stores/vaultStore';
import { useFileStore } from '@/stores/fileStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDailyNotePath, getDailyNoteTemplate, NOTE_TEMPLATES } from '@/lib/dailyNote';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import type { CommandItem } from '@/types';
import {
  FileText, FolderOpen, Search, Settings, Sun, Moon, Eye, EyeOff,
  PanelLeft, BookOpen, Hash, RefreshCw, X,
} from 'lucide-react';

export default function CommandPalette() {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ui = useUIStore();
  const { currentVault, closeVault } = useVaultStore();
  const { createFile, refreshVault } = useFileStore();
  const { openTab } = useTabStore();
  const { loadFile, saveFile, getContent } = useEditorStore();
  const { settings, updateSettings } = useSettingsStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      {
        id: 'new-file',
        label: 'New File',
        description: 'Create a new markdown note',
        shortcut: 'Ctrl+N',
        icon: 'FileText',
        category: 'file',
        action: async () => {
          ui.closeCommandPalette();
          if (!currentVault) return;
          const name = prompt('File name:');
          if (!name?.trim()) return;
          const path = await createFile(currentVault.path, name.trim());
          const content = await loadFile(path);
          openTab(path, content);
        },
      },
      {
        id: 'daily-note',
        label: 'Open Daily Note',
        description: "Open or create today's journal entry",
        shortcut: 'Ctrl+D',
        icon: 'BookOpen',
        category: 'file',
        action: async () => {
          ui.closeCommandPalette();
          if (!currentVault) return;
          const path = getDailyNotePath(currentVault.path);
          const exists = await fs.exists(path);
          if (!exists) await fs.writeTextFile(path, getDailyNoteTemplate());
          const content = await loadFile(path);
          openTab(path, content);
        },
      },
      {
        id: 'search',
        label: 'Search Notes',
        shortcut: 'Ctrl+P',
        icon: 'Search',
        category: 'navigation',
        action: () => { ui.closeCommandPalette(); ui.openSearch(); },
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        shortcut: 'Ctrl+B',
        icon: 'PanelLeft',
        category: 'view',
        action: () => { ui.closeCommandPalette(); ui.toggleSidebar(); },
      },
      {
        id: 'toggle-preview',
        label: settings.showPreview ? 'Hide Preview' : 'Show Preview',
        icon: settings.showPreview ? 'EyeOff' : 'Eye',
        category: 'view',
        action: () => { ui.closeCommandPalette(); updateSettings({ showPreview: !settings.showPreview }); },
      },
      {
        id: 'theme-dark',
        label: 'Switch to Dark Theme',
        icon: 'Moon',
        category: 'view',
        action: () => { ui.closeCommandPalette(); updateSettings({ theme: 'dark' }); },
      },
      {
        id: 'theme-light',
        label: 'Switch to Light Theme',
        icon: 'Sun',
        category: 'view',
        action: () => { ui.closeCommandPalette(); updateSettings({ theme: 'light' }); },
      },
      {
        id: 'settings',
        label: 'Open Settings',
        shortcut: 'Ctrl+,',
        icon: 'Settings',
        category: 'vault',
        action: () => { ui.closeCommandPalette(); ui.openSettings(); },
      },
      {
        id: 'refresh',
        label: 'Refresh Vault',
        icon: 'RefreshCw',
        category: 'vault',
        action: () => {
          ui.closeCommandPalette();
          if (currentVault) refreshVault(currentVault.path);
        },
      },
      {
        id: 'close-vault',
        label: 'Close Vault',
        icon: 'X',
        category: 'vault',
        action: () => { ui.closeCommandPalette(); closeVault(); },
      },
      ...Object.entries(NOTE_TEMPLATES).map(([key, tpl]) => ({
        id: `template-${key}`,
        label: `Insert Template: ${tpl.label}`,
        icon: 'Hash',
        category: 'file' as const,
        action: async () => {
          ui.closeCommandPalette();
          if (!currentVault) return;
          const name = prompt(`File name for ${tpl.label}:`);
          if (!name?.trim()) return;
          const path = await createFile(currentVault.path, name.trim());
          await saveFile(path, tpl.content);
          const content = await loadFile(path);
          openTab(path, content);
        },
      })),
    ];
    return base;
  }, [settings, currentVault]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ICONS: Record<string, React.ComponentType<any>> = {
    FileText, FolderOpen, Search, Settings, Sun, Moon, Eye, EyeOff,
    PanelLeft, BookOpen, Hash, RefreshCw, X,
  };

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[selectedIndex]?.action(); }
    else if (e.key === 'Escape') { ui.closeCommandPalette(); }
  };

  useEffect(() => { setSelectedIndex(0); }, [query]);

  return (
    <div className="overlay-backdrop" onClick={ui.closeCommandPalette}>
      <div className="modal-box fade-in" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>⌘</span>
          <input
            ref={inputRef}
            className="modal-input"
            style={{ border: 'none', padding: '14px 4px' }}
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="modal-results">
          {filtered.map((cmd, idx) => {
            const Icon = cmd.icon ? ICONS[cmd.icon] : null;
            return (
              <div
                key={cmd.id}
                className={`modal-result-item${idx === selectedIndex ? ' selected' : ''}`}
                onClick={cmd.action}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {Icon && <Icon size={14} />}
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{cmd.label}</span>
                  {cmd.description && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cmd.description}</span>
                  )}
                  {cmd.shortcut && (
                    <kbd
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--bg-active)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No commands match "{query}"
            </div>
          )}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
          <span>↑↓ Navigate</span><span>↵ Run</span><span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
