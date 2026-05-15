import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align'],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeHighlight, { detect: true, ignoreMissing: true })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export async function renderMarkdown(content: string): Promise<string> {
  const result = await processor.process(content);
  return String(result);
}

export function extractTitle(content: string, fallback = 'Untitled'): string {
  // Try YAML frontmatter title first
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/^title:\s*(.+)$/m);
    if (titleMatch) return titleMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  // Then first H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  // Then first non-empty line
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
