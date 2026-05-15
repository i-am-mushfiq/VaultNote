import {
  useEffect, useRef, useState, useCallback,
  forwardRef, useImperativeHandle,
} from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { renderMarkdown } from '@/lib/markdown';
import { pathUtils } from '@/lib/pathUtils';
import type { Highlight } from '@/types';

export interface PreviewHandle {
  scrollToLine: (lineNum: number) => void;
}

// ── Colour palette offered in the highlight toolbar ───────────────────────────
const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green',  value: '#bbf7d0' },
  { label: 'Blue',   value: '#bfdbfe' },
  { label: 'Pink',   value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
];

// ── DOM helper: find the first text-node occurrence of `text` inside `root` ──
function applyHighlightToDOM(root: HTMLElement, h: Highlight) {
  // Prefer an element on the exact source line; fall back to entire root.
  const anchor =
    root.querySelector<HTMLElement>(`[data-source-line="${h.sourceLine}"]`) ?? root;

  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    // Skip text already inside an existing mark
    if ((node.parentElement as HTMLElement)?.tagName === 'MARK') continue;
    const idx = node.textContent?.indexOf(h.text) ?? -1;
    if (idx === -1) continue;

    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + h.text.length);

    const mark = document.createElement('mark');
    mark.style.background    = h.color;
    mark.style.borderRadius  = '2px';
    mark.style.cursor        = 'pointer';
    mark.dataset.highlightId = h.id;
    if (h.note) mark.title = h.note;

    try {
      range.surroundContents(mark);
    } catch {
      // Range crossed element boundaries — skip
    }
    break;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  content:    string;
  filePath?:  string;      // current open file — used to resolve relative img URLs
  className?: string;
  // Scroll sync: preview → editor
  onScrollToLine?: (line: number) => void;
  // Click-to-edit: clicked element's source line
  onLineClick?: (line: number) => void;
  // Wiki-link clicks
  onWikiLinkClick?: (name: string) => void;
  // Highlights
  highlights?:       Highlight[];
  onHighlightCreate?: (h: Omit<Highlight, 'id' | 'createdAt'>) => void;
  onHighlightDelete?: (id: string) => void;
}

const MarkdownPreview = forwardRef<PreviewHandle, Props>(function MarkdownPreview(
  {
    content,
    filePath,
    className = '',
    onScrollToLine,
    onLineClick,
    onWikiLinkClick,
    highlights,
    onHighlightCreate,
    onHighlightDelete,
  }: Props,
  ref,
) {
  const [html, setHtml] = useState('');
  const scrollRef   = useRef<HTMLDivElement>(null);  // scroll container
  const contentRef  = useRef<HTMLDivElement>(null);  // inner content (DOM ops)
  const syncLock    = useRef(false);                 // prevent re-entrant scroll

  // Track floating toolbar position for text selection
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);
  const selectionRef = useRef<{ text: string; sourceLine: number } | null>(null);

  // ── Render markdown ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    renderMarkdown(content).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [content]);

  // ── Fix relative image src → tauri file URLs ───────────────────────────────

  useEffect(() => {
    if (!contentRef.current || !filePath) return;
    const dir = pathUtils.dirname(filePath);
    contentRef.current.querySelectorAll<HTMLImageElement>('img[src]').forEach(async (img) => {
      const src = img.getAttribute('src') ?? '';
      if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('tauri://')) return;
      const abs = pathUtils.normalize(
        src.startsWith('/') ? src : pathUtils.join(dir, src),
      );
      // Also skip already-converted tauri asset URLs
      if (abs) img.src = await convertFileSrc(abs);
    });
  }, [html, filePath]);

  // ── Disable preview checkboxes ─────────────────────────────────────────────

  useEffect(() => {
    contentRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((el) => { el.disabled = true; });
  }, [html]);

  // ── YouTube card embeds ─────────────────────────────────────────────────────

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.yt-card-placeholder').forEach(async (el) => {
      const id = el.dataset.ytId;
      if (!id || el.dataset.loaded) return;
      el.dataset.loaded = '1';
      el.innerHTML = `<div class="yt-loading">Loading video…</div>`;
      try {
        const res  = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
        const meta = await res.json() as { title?: string; author_name?: string };
        el.innerHTML = `
          <a class="yt-card" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">
            <img class="yt-thumb" src="https://img.youtube.com/vi/${id}/mqdefault.jpg" alt="${meta.title ?? ''}" />
            <div class="yt-info">
              <div class="yt-title">${meta.title ?? 'YouTube Video'}</div>
              <div class="yt-channel">${meta.author_name ?? ''}</div>
            </div>
          </a>`;
      } catch {
        el.innerHTML = `<a class="yt-card-fallback" href="https://www.youtube.com/watch?v=${id}" target="_blank">▶ YouTube: ${id}</a>`;
      }
    });
  }, [html]);

  // ── Apply / refresh highlights ─────────────────────────────────────────────

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    // Strip existing mark wrappers (restore plain text)
    root.querySelectorAll<HTMLElement>('mark[data-highlight-id]').forEach((mark) => {
      const text = document.createTextNode(mark.textContent ?? '');
      mark.parentNode?.replaceChild(text, mark);
      text.parentNode?.normalize();
    });
    if (!highlights?.length) return;
    for (const h of highlights) applyHighlightToDOM(root, h);
  }, [html, highlights]);

  // ── Highlight toolbar: track text selection ────────────────────────────────

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !contentRef.current?.contains(sel.anchorNode)) {
        setToolbar(null);
        selectionRef.current = null;
        return;
      }
      const text = sel.toString().trim();
      if (!text) return;

      const range    = sel.getRangeAt(0);
      const rect     = range.getBoundingClientRect();
      const scrollEl = scrollRef.current;
      if (!rect.width || !scrollEl) return;

      // Find nearest data-source-line ancestor
      const anchor = (range.commonAncestorContainer as HTMLElement).closest
        ? (range.commonAncestorContainer as HTMLElement).closest<HTMLElement>('[data-source-line]')
        : (range.startContainer.parentElement?.closest<HTMLElement>('[data-source-line]') ?? null);
      const sourceLine = anchor ? parseInt(anchor.dataset.sourceLine!, 10) : 0;

      selectionRef.current = { text, sourceLine };

      // Position toolbar above the selection, relative to the scroll container
      const containerRect = scrollEl.getBoundingClientRect();
      setToolbar({
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top  - containerRect.top  + scrollEl.scrollTop - 44,
      });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const handleHighlightColor = useCallback((color: string) => {
    const sel = selectionRef.current;
    if (!sel || !onHighlightCreate) return;
    onHighlightCreate({ color, text: sel.text, sourceLine: sel.sourceLine });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, [onHighlightCreate]);

  const handleDeleteHighlight = useCallback((e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-highlight-id]');
    if (mark?.dataset.highlightId && onHighlightDelete) {
      onHighlightDelete(mark.dataset.highlightId);
    }
  }, [onHighlightDelete]);

  // ── Scroll sync (preview → editor) ────────────────────────────────────────

  const handleScroll = useCallback(() => {
    if (!onScrollToLine || !contentRef.current || !scrollRef.current || syncLock.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    const elements  = Array.from(
      contentRef.current.querySelectorAll<HTMLElement>('[data-source-line]'),
    );
    let active: HTMLElement | null = null;
    for (const el of elements) {
      if (el.offsetTop <= scrollTop + 24) active = el;
      else break;
    }
    if (active?.dataset.sourceLine) {
      onScrollToLine(parseInt(active.dataset.sourceLine, 10));
    }
  }, [onScrollToLine]);

  // Expose scrollToLine to parent via forwarded ref
  useImperativeHandle(ref, () => ({
    scrollToLine(lineNum: number) {
      const el = contentRef.current?.querySelector<HTMLElement>(`[data-source-line="${lineNum}"]`);
      if (!el || !scrollRef.current) return;
      syncLock.current = true;
      scrollRef.current.scrollTop = el.offsetTop - 24;
      setTimeout(() => { syncLock.current = false; }, 100);
    },
  }), []);

  // ── Click-to-edit (click in preview → jump to editor line) ────────────────

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Wiki-link click takes priority
    const wikiEl = (e.target as HTMLElement).closest<HTMLElement>('[data-wiki-link]');
    if (wikiEl?.dataset.wikiLink) {
      e.preventDefault();
      onWikiLinkClick?.(wikiEl.dataset.wikiLink);
      return;
    }

    if (!onLineClick) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-source-line]');
    if (el?.dataset.sourceLine) {
      onLineClick(parseInt(el.dataset.sourceLine, 10));
    }
  }, [onLineClick, onWikiLinkClick]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={scrollRef}
      className="preview-scroll-container"
      onScroll={handleScroll}
    >
      {/* Floating highlight-colour toolbar */}
      {toolbar && (
        <div
          className="highlight-toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          onMouseDown={(e) => e.preventDefault()} // keep selection alive
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              className="highlight-swatch"
              style={{ background: c.value }}
              title={c.label}
              onClick={() => handleHighlightColor(c.value)}
            />
          ))}
        </div>
      )}

      <div
        ref={contentRef}
        className={`markdown-preview ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
        onDoubleClick={handleDeleteHighlight}
      />
    </div>
  );
});

export default MarkdownPreview;
