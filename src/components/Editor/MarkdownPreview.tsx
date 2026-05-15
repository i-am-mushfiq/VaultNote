import { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from '@/lib/markdown';

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownPreview({ content, className = '' }: Props) {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    renderMarkdown(content).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [content]);

  // Make checkboxes non-interactive in preview (they're just for display)
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      (el as HTMLInputElement).disabled = true;
    });
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
