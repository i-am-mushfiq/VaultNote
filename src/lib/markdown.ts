import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { remarkWikiLinks } from './wikilinks';

// ── Rehype: stamp data-source-line on block elements ─────────────────────────

function addSourceLines() {
  return (tree: any) => {
    const BLOCKS = new Set([
      'p','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','pre','table','hr',
    ]);
    function walk(node: any) {
      if (node.type === 'element' && BLOCKS.has(node.tagName) && node.position?.start?.line) {
        node.properties = node.properties ?? {};
        node.properties.dataSourceLine = String(node.position.start.line);
      }
      node.children?.forEach(walk);
    }
    tree.children?.forEach(walk);
  };
}

// ── Rehype: mark standalone YouTube URLs as embeddable cards ─────────────────

const YT_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function addYouTubeMarkers() {
  return (tree: any) => {
    function walk(node: any) {
      if (
        node.type === 'element' &&
        node.tagName === 'p' &&
        node.children?.length === 1 &&
        node.children[0].type === 'element' &&
        node.children[0].tagName === 'a'
      ) {
        const anchor = node.children[0];
        const href   = anchor.properties?.href ?? '';
        const m      = YT_RE.exec(href);
        if (m) {
          node.tagName = 'div';
          node.properties = { ...node.properties, class: 'yt-card-placeholder', 'data-yt-id': m[1] };
        }
      }
      node.children?.forEach(walk);
    }
    tree.children?.forEach(walk);
  };
}

// ── Sanitize schema ───────────────────────────────────────────────────────────

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style'],
    div:  [...(defaultSchema.attributes?.div  ?? []), 'className', 'dataYtId'],
    a:    [...(defaultSchema.attributes?.a    ?? []), 'dataWikiLink', 'className'],
    td:   [...(defaultSchema.attributes?.td   ?? []), 'align'],
    th:   [...(defaultSchema.attributes?.th   ?? []), 'align'],
    '*':  [...(defaultSchema.attributes?.['*'] ?? []), 'dataSourceLine'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'wiki', '#wiki'],
  },
};

// ── Pipeline ──────────────────────────────────────────────────────────────────

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkWikiLinks)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(addSourceLines)
  .use(addYouTubeMarkers)
  .use(rehypeHighlight, { detect: true, ignoreMissing: true })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export async function renderMarkdown(content: string): Promise<string> {
  const result = await processor.process(content);
  return String(result);
}

export function extractTitle(content: string, fallback = 'Untitled'): string {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/^title:\s*(.+)$/m);
    if (titleMatch) return titleMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  const firstLine = content.split('\n').find((l) => l.trim().length > 0);
  if (firstLine) return firstLine.trim().substring(0, 60);
  return fallback;
}

export function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

export function wordCount(content: string): number {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~\[\]]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
