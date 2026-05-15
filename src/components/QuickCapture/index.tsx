import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '@/stores/vaultStore';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import { Send, X, FileText, Inbox } from 'lucide-react';

export default function QuickCaptureWindow() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [savedName, setSavedName] = useState('');
  const { currentVault } = useVaultStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') invoke('hide_capture_window').catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Extract leading # Title from content ─────────────────────────────────
  const extractHeadingTitle = (content: string): string | null => {
    const firstLine = content.trimStart().split('\n')[0];
    const match = firstLine.match(/^#{1,3}\s+(.+)/);
    if (!match) return null;
    const raw = match[1].trim();
    // Strip markdown emphasis/code from the title text
    return raw.replace(/[*_`~[\]]/g, '').trim() || null;
  };

  // Sanitize title into a safe filename (strip chars illegal on Windows/mac)
  const toFilename = (title: string): string =>
    title
      .replace(/[\\/:*?"<>|]/g, '')   // Windows illegal chars
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);                  // keep it reasonable

  // Find an unused path: "Title.md", "Title 2.md", "Title 3.md", …
  const findUnusedPath = async (dir: string, base: string): Promise<string> => {
    const attempt = (n: number) =>
      pathUtils.join(dir, n === 1 ? `${base}.md` : `${base} ${n}.md`);
    for (let n = 1; n <= 99; n++) {
      const p = attempt(n);
      try { await fs.readTextFile(p); } // exists → try next
      catch { return p; }              // error means file doesn't exist
    }
    return attempt(99);
  };

  const save = async () => {
    if (!text.trim()) return;
    const vaultPath = currentVault?.path ?? (await getLastVaultPath());
    if (!vaultPath) { setStatus('error'); return; }

    const content = text.trim();

    try {
      const headingTitle = extractHeadingTitle(content);

      if (headingTitle) {
        // ── Save as its own file named after the heading ──────────────────
        const base     = toFilename(headingTitle);
        const filePath = await findUnusedPath(vaultPath, base);
        await fs.writeTextFile(filePath, content);
        setSavedName(pathUtils.basename(filePath));
      } else {
        // ── Append to Inbox.md ────────────────────────────────────────────
        const inboxPath = pathUtils.join(vaultPath, 'Inbox.md');
        const timestamp = new Date().toLocaleString();
        const entry     = `\n\n---\n*Captured ${timestamp}*\n\n${content}`;
        let existing = '';
        try { existing = await fs.readTextFile(inboxPath); } catch { existing = '# Inbox\n'; }
        await fs.writeTextFile(inboxPath, existing + entry);
        setSavedName('Inbox.md');
      }

      setStatus('saved');
      setText('');
      setTimeout(() => {
        setStatus('idle');
        setSavedName('');
        invoke('hide_capture_window').catch(() => {});
      }, 1600);
    } catch {
      setStatus('error');
    }
  };

  // Preview: does the current text start with a heading?
  const previewTitle = text.trim() ? extractHeadingTitle(text) : null;

  return (
    <div className="capture-window">
      <div className="capture-header">
        <span style={{ fontWeight: 600, fontSize: 13 }}>Quick Capture</span>
        <button
          onClick={() => invoke('hide_capture_window').catch(() => {})}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          <X size={14} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="capture-textarea"
        placeholder="Paste a response or capture a thought…&#10;Starts with # Heading → saved as its own note&#10;Otherwise → appended to Inbox.md&#10;&#10;Esc to dismiss"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) save(); }}
      />

      <div className="capture-footer">
        {/* Live destination hint */}
        {status === 'idle' && text.trim() && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {previewTitle
              ? <><FileText size={11} style={{ color: 'var(--accent)' }} /> → <em style={{ color: 'var(--text-primary)' }}>{toFilename(previewTitle).slice(0, 40)}.md</em></>
              : <><Inbox size={11} /> → Inbox.md</>}
          </span>
        )}

        {status === 'saved' && (
          <span style={{ color: 'var(--success)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            ✓ Saved as <strong>{savedName}</strong>
          </span>
        )}
        {status === 'error' && (
          <span style={{ color: 'var(--danger)', fontSize: 12 }}>Error saving</span>
        )}

        <button
          className="btn-primary"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={save}
        >
          <Send size={12} /> Save <span style={{ opacity: 0.7, fontSize: 11 }}>(Ctrl+↵)</span>
        </button>
      </div>
    </div>
  );
}

async function getLastVaultPath(): Promise<string | null> {
  try {
    const raw = localStorage.getItem('vaultnote-vaults');
    if (!raw) return null;
    const vaults = JSON.parse(raw);
    return vaults?.state?.vaults?.[0]?.path ?? null;
  } catch { return null; }
}
