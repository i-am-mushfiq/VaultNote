import {
  useEffect, useRef, useState, useCallback, useLayoutEffect,
} from 'react';
import { fs } from '@/lib/fs';
import { renderMarkdown } from '@/lib/markdown';
import type { CanvasFile, CanvasNode } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const CARD_W   = 320;
const CARD_H   = 200;

const CARD_COLORS = [
  'var(--accent)',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
];

// ── CanvasCard ────────────────────────────────────────────────────────────────

interface CardProps {
  node:       CanvasNode;
  selected:   boolean;
  editing:    boolean;
  onSelect:   (id: string) => void;
  onMove:     (id: string, dx: number, dy: number) => void;
  onResize:   (id: string, dw: number, dh: number) => void;
  onEdit:     (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  onColorChange:   (id: string, color: string) => void;
  onDelete:   (id: string) => void;
  zoom:       number;
}

function CanvasCard({
  node, selected, editing,
  onSelect, onMove, onResize, onEdit,
  onContentChange, onColorChange, onDelete, zoom,
}: CardProps) {
  const [html, setHtml] = useState('');
  const dragStart  = useRef<{ mx: number; my: number } | null>(null);
  const resizeStart = useRef<{ mx: number; my: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    renderMarkdown(node.content || '*Empty card — double-click to edit*').then((h) => {
      if (!cancelled) setHtml(h);
    });
    return () => { cancelled = true; };
  }, [node.content, editing]);

  useLayoutEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  // Card drag (move)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(node.id);
    if (editing) return;
    dragStart.current = { mx: e.clientX, my: e.clientY };
    const handleMove = (ev: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = (ev.clientX - dragStart.current.mx) / zoom;
      const dy = (ev.clientY - dragStart.current.my) / zoom;
      dragStart.current = { mx: ev.clientX, my: ev.clientY };
      onMove(node.id, dx, dy);
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', onUp);
  };

  // Resize handle drag
  const handleResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    resizeStart.current = { mx: e.clientX, my: e.clientY };
    const onMove = (ev: MouseEvent) => {
      if (!resizeStart.current) return;
      const dw = (ev.clientX - resizeStart.current.mx) / zoom;
      const dh = (ev.clientY - resizeStart.current.my) / zoom;
      resizeStart.current = { mx: ev.clientX, my: ev.clientY };
      onResize(node.id, dw, dh);
    };
    const onUp = () => {
      resizeStart.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const accentColor = node.color ?? 'var(--accent)';

  return (
    <div
      className={`canvas-card${selected ? ' selected' : ''}`}
      style={{
        left:   node.x,
        top:    node.y,
        width:  node.width,
        height: node.height,
        borderTopColor: accentColor,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(node.id); }}
    >
      {/* Header bar */}
      <div className="canvas-card-header" style={{ background: accentColor + '22' }}>
        <div className="canvas-card-colors">
          {CARD_COLORS.map((c) => (
            <span
              key={c}
              className="canvas-color-dot"
              style={{ background: c, outline: node.color === c ? '2px solid white' : 'none' }}
              onMouseDown={(e) => { e.stopPropagation(); onColorChange(node.id, c); }}
            />
          ))}
        </div>
        <button
          className="canvas-card-delete"
          onMouseDown={(e) => { e.stopPropagation(); onDelete(node.id); }}
          title="Delete card"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="canvas-card-body">
        {editing ? (
          <textarea
            ref={textareaRef}
            className="canvas-card-editor"
            value={node.content}
            onChange={(e) => onContentChange(node.id, e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Write markdown here…"
          />
        ) : (
          <div
            className="markdown-preview canvas-card-preview"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      {/* Resize handle */}
      {selected && !editing && (
        <div className="canvas-resize-handle" onMouseDown={handleResizeDown} />
      )}
    </div>
  );
}

// ── CanvasView ────────────────────────────────────────────────────────────────

interface Props {
  path: string;
}

export default function CanvasView({ path }: Props) {
  const [nodes,      setNodes]      = useState<CanvasNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const isPanning   = useRef(false);
  const panStart    = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fs.readTextFile(path)
      .then((raw) => {
        try {
          const data: CanvasFile = JSON.parse(raw);
          setNodes(data.nodes ?? []);
        } catch {
          setNodes([]);
        }
      })
      .catch(() => setNodes([]));
  }, [path]);

  // ── Save (debounced 800 ms) ───────────────────────────────────────────────

  const save = useCallback((current: CanvasNode[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const data: CanvasFile = { version: 1, nodes: current };
      fs.writeTextFile(path, JSON.stringify(data, null, 2)).catch(console.error);
    }, 800);
  }, [path]);

  const updateNodes = useCallback((updater: (prev: CanvasNode[]) => CanvasNode[]) => {
    setNodes((prev) => {
      const next = updater(prev);
      save(next);
      return next;
    });
  }, [save]);

  // ── Keyboard: Escape (stop editing / deselect) + Delete ──────────────────

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !editingId) {
        updateNodes((prev) => prev.filter((n) => n.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selectedId, editingId, updateNodes]);

  // ── Pan ───────────────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.target !== containerRef.current) return;
    // Click on canvas bg: deselect + stop editing
    setSelectedId(null);
    setEditingId(null);
    isPanning.current = true;
    panStart.current  = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      setPan({
        x: panStart.current.px + e.clientX - panStart.current.mx,
        y: panStart.current.py + e.clientY - panStart.current.my,
      });
    };
    const onUp = () => { isPanning.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * delta)));
  };

  // ── Double-click on canvas → new card ────────────────────────────────────

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && e.target !== e.currentTarget) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom - CARD_W / 2;
    const y = (e.clientY - rect.top  - pan.y) / zoom - CARD_H / 2;
    const node: CanvasNode = { id: uid(), x, y, width: CARD_W, height: CARD_H, content: '' };
    updateNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
    setEditingId(node.id);
  };

  // ── Card operations ───────────────────────────────────────────────────────

  const handleMove = useCallback((id: string, dx: number, dy: number) => {
    updateNodes((prev) =>
      prev.map((n) => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n),
    );
  }, [updateNodes]);

  const handleResize = useCallback((id: string, dw: number, dh: number) => {
    updateNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, width: Math.max(180, n.width + dw), height: Math.max(120, n.height + dh) }
          : n,
      ),
    );
  }, [updateNodes]);

  const handleContentChange = useCallback((id: string, content: string) => {
    updateNodes((prev) => prev.map((n) => n.id === id ? { ...n, content } : n));
  }, [updateNodes]);

  const handleColorChange = useCallback((id: string, color: string) => {
    updateNodes((prev) => prev.map((n) => n.id === id ? { ...n, color } : n));
  }, [updateNodes]);

  const handleDelete = useCallback((id: string) => {
    updateNodes((prev) => prev.filter((n) => n.id !== id));
    setSelectedId(null);
    setEditingId(null);
  }, [updateNodes]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      style={{ cursor: isPanning.current ? 'grabbing' : 'default' }}
    >
      {/* Dot-grid background that moves with pan */}
      <svg
        className="canvas-grid"
        style={{ backgroundPosition: `${pan.x % (20 * zoom)}px ${pan.y % (20 * zoom)}px` }}
      />

      {/* World transform */}
      <div
        className="canvas-world"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {nodes.map((node) => (
          <CanvasCard
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            editing={editingId === node.id}
            onSelect={setSelectedId}
            onMove={handleMove}
            onResize={handleResize}
            onEdit={setEditingId}
            onContentChange={handleContentChange}
            onColorChange={handleColorChange}
            onDelete={handleDelete}
            zoom={zoom}
          />
        ))}
      </div>

      {/* HUD */}
      <div className="canvas-hud">
        <span className="canvas-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="canvas-hud-btn" onClick={() => setZoom(1)} title="Reset zoom">
          Reset
        </button>
        <button
          className="canvas-hud-btn"
          onClick={() => {
            const node: CanvasNode = {
              id: uid(), x: (400 - pan.x) / zoom, y: (200 - pan.y) / zoom,
              width: CARD_W, height: CARD_H, content: '',
            };
            updateNodes((prev) => [...prev, node]);
            setSelectedId(node.id);
            setEditingId(node.id);
          }}
          title="New card"
        >
          + Card
        </button>
      </div>
    </div>
  );
}
