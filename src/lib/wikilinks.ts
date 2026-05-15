// ── WikiLink utilities ────────────────────────────────────────────────────────
// Handles [[Note Name]] and [[Note Name|Display Text]] syntax.

export const WIKI_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

export interface WikiLink {
  target: string;   // raw link target (note name, no extension)
  display: string;  // text shown to user
  index: number;    // char position in source
}

/** Extract all [[links]] from raw markdown text. */
export function extractWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];
  const re = new RegExp(WIKI_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    links.push({
      target:  m[1].trim(),
      display: (m[2]?.trim()) ?? m[1].trim(),
      index:   m.index,
    });
  }
  return links;
}

/** Normalise a note name for lookup (lowercase, no extension, trim). */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\.md$/i, '').trim();
}

/**
 * Remark plugin: transform [[wiki links]] into link nodes so remark-rehype
 * produces <a data-wiki-link="target"> elements in the HTML output.
 */
export function remarkWikiLinks() {
  return (tree: any) => {
    function processText(value: string): any[] {
      const re = new RegExp(WIKI_RE.source, 'g');
      const nodes: any[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(value)) !== null) {
        if (m.index > last) nodes.push({ type: 'text', value: value.slice(last, m.index) });
        const target  = m[1].trim();
        const display = m[2]?.trim() ?? target;
        nodes.push({
          type: 'link',
          url: '#wiki',
          data: {
            hProperties: {
              'data-wiki-link': target,
              class: 'wiki-link',
            },
          },
          children: [{ type: 'text', value: display }],
        });
        last = m.index + m[0].length;
      }
      if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
      return nodes.length > 0 ? nodes : [{ type: 'text', value }];
    }

    function walk(children: any[]): any[] {
      const out: any[] = [];
      for (const child of children) {
        if (child.type === 'text') {
          out.push(...processText(child.value));
        } else {
          if (child.children) child.children = walk(child.children);
          out.push(child);
        }
      }
      return out;
    }

    if (tree.children) tree.children = walk(tree.children);
  };
}
