import { create } from 'zustand';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import { extractWikiLinks, normaliseName } from '@/lib/wikilinks';
import { cosineSim } from '@/lib/embeddings';

export interface GraphEdge {
  from:   string;           // absolute file path
  to:     string;           // absolute file path (resolved)
  kind:   'wiki' | 'semantic';
  score?: number;           // cosine similarity — only set for semantic edges
}

interface GraphStore {
  // nameToPath: normalised note name → absolute path
  nameToPath: Map<string, string>;
  // outgoing wiki-links per file path
  edges: GraphEdge[];
  // backlinks: target path → source paths
  backlinks: Map<string, string[]>;
  // Track which files have been indexed
  indexed: Set<string>;

  // Call when vault loads / file tree is ready
  buildNameIndex: (paths: string[]) => void;
  // Index wiki-links for a single file (called on file open/save)
  indexFile: (path: string, content: string) => void;
  // Bulk background indexing
  indexAll: (paths: string[]) => Promise<void>;
  // Resolve a wiki-link name to an absolute path
  resolve: (name: string) => string | null;
  // Get backlinks for a given file path
  getBacklinks: (path: string) => string[];
  // Compute semantic edges from an embedding index and merge into edges.
  // Uses a low base threshold (0.3) so the graph slider has full range to explore;
  // visual filtering is done at render time in GraphView.
  addSemanticEdges: (embeddingIndex: Map<string, Float32Array>, threshold?: number, maxPerNode?: number) => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  nameToPath: new Map(),
  edges:      [],
  backlinks:  new Map(),
  indexed:    new Set(),

  buildNameIndex(paths: string[]) {
    const map = new Map<string, string>();
    for (const p of paths) {
      if (!pathUtils.isMarkdown(p)) continue;
      const name = normaliseName(pathUtils.stem(p));
      map.set(name, p);
    }
    set({ nameToPath: map });
  },

  indexFile(path: string, content: string) {
    const { nameToPath, edges: prevEdges, indexed } = get();
    if (!pathUtils.isMarkdown(path)) return;

    // Remove old edges from this file
    const otherEdges = prevEdges.filter((e) => e.from !== path);

    // Extract new wiki-links
    const links  = extractWikiLinks(content);
    const newEdges: GraphEdge[] = links
      .map((l) => {
        const target = nameToPath.get(normaliseName(l.target));
        return target ? { from: path, to: target, kind: 'wiki' as const } : null;
      })
      .filter(Boolean) as GraphEdge[];

    const allEdges = [...otherEdges, ...newEdges];

    // Rebuild backlinks
    const bl = new Map<string, string[]>();
    for (const e of allEdges) {
      if (e.kind !== 'wiki') continue;
      const list = bl.get(e.to) ?? [];
      if (!list.includes(e.from)) list.push(e.from);
      bl.set(e.to, list);
    }

    set({ edges: allEdges, backlinks: bl, indexed: new Set([...indexed, path]) });
  },

  async indexAll(paths: string[]) {
    const mdPaths = paths.filter(pathUtils.isMarkdown);
    for (let i = 0; i < mdPaths.length; i++) {
      const p = mdPaths[i];
      if (get().indexed.has(p)) continue;
      try {
        const content = await fs.readTextFile(p);
        get().indexFile(p, content);
      } catch { /* skip unreadable */ }
      // yield every 10 files
      if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
    }
  },

  resolve(name: string) {
    return get().nameToPath.get(normaliseName(name)) ?? null;
  },

  getBacklinks(path: string) {
    return get().backlinks.get(path) ?? [];
  },

  addSemanticEdges(embeddingIndex, threshold = 0.3, maxPerNode = 5) {
    const { edges: prevEdges } = get();

    // Drop existing semantic edges so we don't accumulate duplicates on re-runs
    const wikiOnly = prevEdges.filter((e) => e.kind === 'wiki');

    const paths = Array.from(embeddingIndex.keys());
    if (paths.length < 2) { set({ edges: wikiOnly }); return; }

    // For each note, find its top-N most-similar neighbours above threshold.
    // Pairs are deduplicated (canonical key = smaller path first).
    // Score is stored so GraphView can filter and colour-code at render time.
    const seen = new Set<string>();
    const newEdges: GraphEdge[] = [];

    for (const pathA of paths) {
      const vecA = embeddingIndex.get(pathA)!;
      const scores: { path: string; score: number }[] = [];

      for (const pathB of paths) {
        if (pathB === pathA) continue;
        const score = cosineSim(vecA, embeddingIndex.get(pathB)!);
        if (score >= threshold) scores.push({ path: pathB, score });
      }

      scores.sort((a, b) => b.score - a.score);
      const top = scores.slice(0, maxPerNode);

      for (const { path: pathB, score } of top) {
        const key = pathA < pathB ? `${pathA}|||${pathB}` : `${pathB}|||${pathA}`;
        if (seen.has(key)) continue;
        seen.add(key);
        newEdges.push({ from: pathA, to: pathB, kind: 'semantic', score });
      }
    }

    set({ edges: [...wikiOnly, ...newEdges] });
  },
}));
