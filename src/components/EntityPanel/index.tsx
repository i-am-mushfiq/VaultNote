import { useMemo } from 'react';
import { extractEntities, type EntityKind } from '@/lib/entities';
import { Tag } from 'lucide-react';

interface Props { content: string; }

const KIND_LABELS: Record<EntityKind, string> = {
  hashtag: '#Tags', mention: '@Mentions', tech: 'Tech', date: 'Dates', url: 'URLs', concept: 'Concepts',
};
const KIND_ORDER: EntityKind[] = ['hashtag', 'mention', 'tech', 'concept', 'date', 'url'];

export default function EntityPanel({ content }: Props) {
  const entities = useMemo(() => extractEntities(content), [content]);
  const byKind = useMemo(() => {
    const groups: Partial<Record<EntityKind, typeof entities>> = {};
    for (const e of entities) {
      if (!groups[e.kind]) groups[e.kind] = [];
      groups[e.kind]!.push(e);
    }
    return groups;
  }, [entities]);

  if (entities.length === 0) return (
    <div className="entity-panel-empty">
      <Tag size={16} style={{ opacity: 0.4 }} />
      <span>No entities detected</span>
    </div>
  );

  return (
    <div className="entity-panel">
      {KIND_ORDER.filter((k) => byKind[k]?.length).map((kind) => (
        <div key={kind} className="entity-group">
          <div className="entity-group-title">{KIND_LABELS[kind]}</div>
          <div className="entity-tags">
            {byKind[kind]!.map((e) => (
              <span key={e.text} className={`entity-tag entity-tag-${kind}`} title={`×${e.count}`}>
                {e.text}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
