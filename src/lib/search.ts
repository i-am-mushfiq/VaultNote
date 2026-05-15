import Fuse from 'fuse.js';
import type { SearchIndex, SearchResult } from '@/types';

let fuse: Fuse<SearchIndex> | null = null;
let indexData: SearchIndex[] = [];

export function buildIndex(entries: SearchIndex[]) {
  indexData = entries;
  fuse = new Fuse(entries, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'content', weight: 1 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  });
}

export function updateIndexEntry(entry: SearchIndex) {
  const idx = indexData.findIndex((e) => e.path === entry.path);
  if (idx >= 0) {
    indexData[idx] = entry;
  } else {
    indexData.push(entry);
  }
  buildIndex(indexData);
}

export function removeIndexEntry(path: string) {
  indexData = indexData.filter((e) => e.path !== path);
  buildIndex(indexData);
}

export function search(query: string, limit = 50): SearchResult[] {
  if (!fuse || !query.trim()) return [];

  const results = fuse.search(query, { limit });

  return results.map((r) => {
    const { item } = r;
    const excerpt = getExcerpt(item.content, query);
    return {
      path: item.path,
      title: item.title,
      excerpt,
      lineNumber: findLineNumber(item.content, query),
    };
  });
}

function getExcerpt(content: string, query: string): string {
  const lower = content.toLowerCase();
  const queryLower = query.toLowerCase().trim();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) return content.substring(0, 120) + '...';
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + queryLower.length + 60);
  const excerpt = content.substring(start, end);
  return (start > 0 ? '...' : '') + excerpt + (end < content.length ? '...' : '');
}

function findLineNumber(content: string, query: string): number {
  const lines = content.split('\n');
  const queryLower = query.toLowerCase().trim();
  const idx = lines.findIndex((l) => l.toLowerCase().includes(queryLower));
  return idx >= 0 ? idx + 1 : 1;
}

export function getIndexSize(): number {
  return indexData.length;
}
