import { create } from 'zustand';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import type { Highlight } from '@/types';

// Sidecar file lives next to the note but starts with '.' so it's hidden
// from the file tree (Rust read_dir skips names starting with '.').
function sidecarPath(filePath: string): string {
  const dir  = pathUtils.dirname(filePath);
  const base = pathUtils.basename(filePath);
  return pathUtils.join(dir, `.${base}.highlights.json`);
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface HighlightStore {
  highlights: Record<string, Highlight[]>; // keyed by absolute file path
  loadHighlights:   (filePath: string) => Promise<void>;
  addHighlight:     (filePath: string, h: Omit<Highlight, 'id' | 'createdAt'>) => Promise<void>;
  removeHighlight:  (filePath: string, id: string) => Promise<void>;
  getHighlights:    (filePath: string) => Highlight[];
}

export const useHighlightStore = create<HighlightStore>((set, get) => ({
  highlights: {},

  loadHighlights: async (filePath) => {
    try {
      const raw  = await fs.readTextFile(sidecarPath(filePath));
      const data = JSON.parse(raw) as Highlight[];
      set((s) => ({ highlights: { ...s.highlights, [filePath]: data } }));
    } catch {
      set((s) => ({ highlights: { ...s.highlights, [filePath]: [] } }));
    }
  },

  addHighlight: async (filePath, h) => {
    const highlight: Highlight = { ...h, id: generateId(), createdAt: new Date().toISOString() };
    const current = get().highlights[filePath] ?? [];
    const updated = [...current, highlight];
    set((s) => ({ highlights: { ...s.highlights, [filePath]: updated } }));
    await fs.writeTextFile(sidecarPath(filePath), JSON.stringify(updated, null, 2));
  },

  removeHighlight: async (filePath, id) => {
    const current = get().highlights[filePath] ?? [];
    const updated = current.filter((h) => h.id !== id);
    set((s) => ({ highlights: { ...s.highlights, [filePath]: updated } }));
    await fs.writeTextFile(sidecarPath(filePath), JSON.stringify(updated, null, 2));
  },

  getHighlights: (filePath) => get().highlights[filePath] ?? [],
}));
