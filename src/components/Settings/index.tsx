import { useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import { X, Palette, Type, Eye, Save, Sparkles } from 'lucide-react';

type Section = 'appearance' | 'editor' | 'preview' | 'saving' | 'intelligence';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance',   label: 'Appearance',   icon: <Palette size={13} /> },
  { id: 'editor',       label: 'Editor',        icon: <Type size={13} /> },
  { id: 'preview',      label: 'Preview',       icon: <Eye size={13} /> },
  { id: 'saving',       label: 'Saving',        icon: <Save size={13} /> },
  { id: 'intelligence', label: 'Intelligence',  icon: <Sparkles size={13} /> },
];

const ACCENT_PRESETS = [
  { color: '#7c6af0', label: 'Purple' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#06b6d4', label: 'Cyan' },
  { color: '#10b981', label: 'Emerald' },
  { color: '#f59e0b', label: 'Amber' },
  { color: '#ef4444', label: 'Red' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#a78bfa', label: 'Violet' },
];

export default function SettingsModal() {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { closeSettings } = useUIStore();
  const [activeSection, setActiveSection] = useState<Section>('appearance');

  // ── Control primitives ───────────────────────────────────────────────────

  const row = (label: string, control: React.ReactNode, description?: string) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );

  const select = (
    value: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void,
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--bg-active)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '4px 10px', fontSize: 13,
        color: 'var(--text-primary)', cursor: 'pointer', minWidth: 140,
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const toggle = (value: boolean, onChange: (v: boolean) => void) => (
    <button
      onClick={() => onChange(!value)}
      aria-pressed={value}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? 'var(--accent)' : 'var(--bg-active)',
        border: '1px solid var(--border)', cursor: 'pointer',
        position: 'relative', transition: 'background 0.15s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 20 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: 'white', transition: 'left 0.15s',
      }} />
    </button>
  );

  const slider = (
    value: number, min: number, max: number, step: number,
    onChange: (v: number) => void,
    format?: (v: number) => string,
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 110, accentColor: 'var(--accent)' }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>
        {format ? format(value) : value}
      </span>
    </div>
  );

  // ── Sections ─────────────────────────────────────────────────────────────

  const renderAppearance = () => (
    <>
      {row('Theme', select(settings.theme,
        [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }],
        (v) => updateSettings({ theme: v as 'dark' | 'light' | 'system' }),
      ), 'Follow OS or force a specific colour scheme')}

      {row('Accent colour',
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Preset swatches */}
          <div style={{ display: 'flex', gap: 4 }}>
            {ACCENT_PRESETS.map(({ color, label }) => (
              <button
                key={color}
                title={label}
                onClick={() => updateSettings({ accentColor: color })}
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: color, border: 'none', cursor: 'pointer',
                  outline: settings.accentColor === color
                    ? `2px solid ${color}` : '2px solid transparent',
                  outlineOffset: 2,
                  transition: 'outline 0.1s',
                }}
              />
            ))}
          </div>
          {/* Custom colour picker */}
          <label
            title="Custom colour"
            style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--bg-active)',
              border: '1.5px dashed var(--border)',
              cursor: 'pointer', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'var(--text-muted)',
            }}
          >
            +
            <input
              type="color"
              value={settings.accentColor}
              onChange={(e) => updateSettings({ accentColor: e.target.value })}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
          </label>
        </div>,
        'Applies to buttons, active nodes, links, and toggles',
      )}

      {row('Sidebar width',
        slider(settings.sidebarWidth, 180, 480, 10,
          (v) => updateSettings({ sidebarWidth: v }),
          (v) => `${v}px`,
        ),
        'Width of the file tree panel',
      )}
    </>
  );

  const renderEditor = () => (
    <>
      {row('Font family', select(settings.editorFontFamily,
        [
          { value: 'mono',  label: 'Monospace' },
          { value: 'sans',  label: 'Sans-serif' },
          { value: 'serif', label: 'Serif' },
        ],
        (v) => updateSettings({ editorFontFamily: v as 'mono' | 'sans' | 'serif' }),
      ))}

      {row('Font size',
        slider(settings.editorFontSize, 10, 24, 1,
          (v) => updateSettings({ editorFontSize: v }),
          (v) => `${v}px`,
        ),
      )}

      {row('Line height',
        slider(settings.editorLineHeight, 1.2, 2.5, 0.1,
          (v) => updateSettings({ editorLineHeight: parseFloat(v.toFixed(1)) }),
          (v) => v.toFixed(1),
        ),
      )}

      {row('Editor width', select(settings.editorWidth,
        [
          { value: 'full',     label: 'Full width' },
          { value: 'readable', label: 'Readable  (800 px)' },
          { value: 'narrow',   label: 'Narrow  (600 px)' },
        ],
        (v) => updateSettings({ editorWidth: v as 'full' | 'readable' | 'narrow' }),
      ))}

      {row('Tab size', select(String(settings.tabSize),
        [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }],
        (v) => updateSettings({ tabSize: Number(v) as 2 | 4 }),
      ), 'Width of a tab character / indent step')}

      {row('Word wrap',
        toggle(settings.wordWrap, (v) => updateSettings({ wordWrap: v })),
        'Wrap long lines instead of scrolling horizontally',
      )}

      {row('Line numbers',
        toggle(settings.showLineNumbers, (v) => updateSettings({ showLineNumbers: v })),
      )}

      {row('Highlight active line',
        toggle(settings.highlightActiveLine, (v) => updateSettings({ highlightActiveLine: v })),
      )}

      {row('Spell check',
        toggle(settings.spellCheck, (v) => updateSettings({ spellCheck: v })),
        'Browser native spell check (underlines misspellings)',
      )}
    </>
  );

  const renderPreview = () => (
    <>
      {row('Show editor',
        toggle(settings.showEditor, (v) => updateSettings({ showEditor: v })),
        'Hide to use preview-only reading mode',
      )}

      {row('Show preview',
        toggle(settings.showPreview, (v) => updateSettings({ showPreview: v })),
        'Hide to use editor-only writing mode',
      )}

      {row('Preview position', select(settings.previewSide,
        [{ value: 'right', label: 'Right of editor' }, { value: 'bottom', label: 'Below editor' }],
        (v) => updateSettings({ previewSide: v as 'right' | 'bottom' }),
      ))}

      {row('Editor / preview split',
        slider(settings.editorPreviewSplit, 0.2, 0.8, 0.05,
          (v) => updateSettings({ editorPreviewSplit: parseFloat(v.toFixed(2)) }),
          (v) => `${Math.round(v * 100)} %`,
        ),
        'Fraction of space given to the editor (drag the divider to set live)',
      )}
    </>
  );

  const renderSaving = () => (
    <>
      {row('Auto-save delay',
        slider(settings.autoSaveInterval, 500, 5000, 500,
          (v) => updateSettings({ autoSaveInterval: v }),
          (v) => v >= 1000 ? `${v / 1000} s` : `${v} ms`,
        ),
        'Idle time after last keystroke before the file is saved',
      )}

      {row('Save on tab switch',
        toggle(settings.autoSaveOnSwitch, (v) => updateSettings({ autoSaveOnSwitch: v })),
        'Immediately save a dirty tab when you switch away from it',
      )}
    </>
  );

  const renderIntelligence = () => (
    <>
      {row('Enable AI features',
        toggle(settings.enableSemanticSearch, (v) => updateSettings({ enableSemanticSearch: v })),
        'Downloads all-MiniLM-L6-v2 (22 MB, cached) and indexes your vault locally',
      )}

      <div style={{
        opacity: settings.enableSemanticSearch ? 1 : 0.4,
        pointerEvents: settings.enableSemanticSearch ? 'auto' : 'none',
        transition: 'opacity 0.2s',
      }}>
        {row('Default graph threshold',
          slider(settings.semanticThreshold, 0.1, 0.9, 0.05,
            (v) => updateSettings({ semanticThreshold: parseFloat(v.toFixed(2)) }),
            (v) => v.toFixed(2),
          ),
          'Minimum cosine similarity to draw a semantic edge — used when the vault first loads',
        )}

        {row('Max connections per note',
          slider(settings.semanticMaxEdges, 1, 15, 1,
            (v) => updateSettings({ semanticMaxEdges: v }),
          ),
          'Top-N similar notes each note can connect to in the graph',
        )}
      </div>

      <div style={{
        marginTop: 16, padding: '10px 12px', borderRadius: 6,
        background: 'var(--bg-elevated)', fontSize: 11,
        color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        ✦ The AI model runs entirely on-device via ONNX WebAssembly. No data ever leaves your machine.
        The embedding index is saved to <code style={{ color: 'var(--text-secondary)' }}>.vaultnote-embeddings.json</code> in your vault.
        Encrypt it with the <strong>Vault Intelligence Lock</strong> (Shield icon in the sidebar).
      </div>
    </>
  );

  const sectionContent: Record<Section, React.ReactNode> = {
    appearance:   renderAppearance(),
    editor:       renderEditor(),
    preview:      renderPreview(),
    saving:       renderSaving(),
    intelligence: renderIntelligence(),
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="overlay-backdrop" onClick={closeSettings}>
      <div
        className="modal-box fade-in"
        style={{
          maxWidth: 640, width: '95vw', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Settings</span>
          <button className="icon-btn" onClick={closeSettings}><X size={15} /></button>
        </div>

        {/* ── Body: nav + content ───────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left nav */}
          <div style={{
            width: 148, flexShrink: 0,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            padding: '8px 0',
            overflowY: 'auto',
          }}>
            {SECTIONS.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', background: activeSection === id ? 'var(--bg-active)' : 'none',
                  border: 'none', borderLeft: activeSection === id ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer', textAlign: 'left',
                  color: activeSection === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: activeSection === id ? 600 : 400,
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Content pane */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 16px' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.09em', color: 'var(--text-muted)',
              padding: '14px 0 6px',
            }}>
              {SECTIONS.find(s => s.id === activeSection)?.label}
            </div>
            {sectionContent[activeSection]}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0, background: 'var(--bg-elevated)',
        }}>
          <button
            onClick={resetSettings}
            style={{ fontSize: 12, color: 'var(--danger)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            Reset to defaults
          </button>
          <button
            onClick={closeSettings}
            style={{
              padding: '6px 22px', borderRadius: 6,
              background: 'var(--accent)', color: 'white',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
