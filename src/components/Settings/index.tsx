import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import { X } from 'lucide-react';

export default function SettingsModal() {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { closeSettings } = useUIStore();

  const row = (label: string, control: React.ReactNode, description?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      {control}
    </div>
  );

  const select = (
    value: string,
    options: Array<{ value: string; label: string }>,
    onChange: (v: string) => void,
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--bg-active)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 13,
        color: 'var(--text-primary)',
        cursor: 'pointer',
        minWidth: 120,
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const toggle = (value: boolean, onChange: (v: boolean) => void) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: value ? 'var(--accent)' : 'var(--bg-active)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.15s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.15s',
        }}
      />
    </button>
  );

  const slider = (value: number, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 100, accentColor: 'var(--accent)' }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 32, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="overlay-backdrop" onClick={closeSettings}>
      <div
        className="modal-box fade-in"
        style={{ maxWidth: 520, maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Settings</span>
          <button className="icon-btn" onClick={closeSettings}><X size={15} /></button>
        </div>

        {/* Sections */}
        <div style={{ overflow: 'auto', flex: 1, padding: '8px 20px' }}>
          {/* Appearance */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '12px 0 4px' }}>
            Appearance
          </div>
          {row('Theme', select(settings.theme, [
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ], (v) => updateSettings({ theme: v as 'dark' | 'light' | 'system' })))}

          {/* Editor */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '12px 0 4px' }}>
            Editor
          </div>
          {row('Font Family', select(settings.editorFontFamily, [
            { value: 'mono', label: 'Monospace' },
            { value: 'sans', label: 'Sans-serif' },
          ], (v) => updateSettings({ editorFontFamily: v as 'mono' | 'sans' })))}
          {row('Font Size', slider(settings.editorFontSize, 10, 24, 1, (v) => updateSettings({ editorFontSize: v })))}
          {row('Line Height', slider(settings.editorLineHeight, 1.2, 2.5, 0.1, (v) => updateSettings({ editorLineHeight: v })))}
          {row('Editor Width', select(settings.editorWidth, [
            { value: 'full', label: 'Full width' },
            { value: 'readable', label: 'Readable (800px)' },
            { value: 'narrow', label: 'Narrow (600px)' },
          ], (v) => updateSettings({ editorWidth: v as 'full' | 'readable' | 'narrow' })))}
          {row('Word Wrap', toggle(settings.wordWrap, (v) => updateSettings({ wordWrap: v })))}

          {/* Preview */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '12px 0 4px' }}>
            Preview
          </div>
          {row('Show Preview', toggle(settings.showPreview, (v) => updateSettings({ showPreview: v })))}
          {row('Preview Side', select(settings.previewSide, [
            { value: 'right', label: 'Right' },
            { value: 'bottom', label: 'Bottom' },
          ], (v) => updateSettings({ previewSide: v as 'right' | 'bottom' })))}

          {/* Saving */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '12px 0 4px' }}>
            Saving
          </div>
          {row(
            'Auto-save delay (ms)',
            slider(settings.autoSaveInterval, 500, 5000, 500, (v) => updateSettings({ autoSaveInterval: v })),
            'Time after last keystroke before auto-saving',
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={resetSettings}
            style={{ fontSize: 12, color: 'var(--danger)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            Reset to defaults
          </button>
          <button
            onClick={closeSettings}
            style={{
              padding: '6px 20px',
              borderRadius: 6,
              background: 'var(--accent)',
              color: 'white',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
