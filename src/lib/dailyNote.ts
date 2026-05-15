import { format } from 'date-fns';
import { pathUtils } from './pathUtils';

export function getDailyNotePath(vaultPath: string, date = new Date()): string {
  const year = format(date, 'yyyy');
  const filename = format(date, 'yyyy-MM-dd') + '.md';
  return pathUtils.join(vaultPath, 'Journal', year, filename);
}

export function getDailyNoteTemplate(date = new Date()): string {
  const formatted = format(date, 'EEEE, MMMM do yyyy');
  return `# ${formatted}\n\n## Today\n\n\n\n## Notes\n\n\n\n## Tasks\n\n- [ ] \n`;
}

export const NOTE_TEMPLATES: Record<string, { label: string; content: string }> = {
  daily: {
    label: 'Daily Note',
    content: getDailyNoteTemplate(),
  },
  meeting: {
    label: 'Meeting Notes',
    content: `# Meeting: \n\n**Date:** ${format(new Date(), 'yyyy-MM-dd')}  \n**Attendees:**  \n**Goal:**  \n\n## Agenda\n\n1. \n\n## Notes\n\n\n\n## Action Items\n\n- [ ] \n`,
  },
  research: {
    label: 'Research Note',
    content: `# \n\n## Summary\n\n\n\n## Key Points\n\n- \n\n## Sources\n\n- \n\n## Questions\n\n- \n`,
  },
  reflection: {
    label: 'Reflection',
    content: `# Reflection — ${format(new Date(), 'yyyy-MM-dd')}\n\n## What went well\n\n\n\n## What could be better\n\n\n\n## Learnings\n\n\n\n## Next steps\n\n\n`,
  },
  idea: {
    label: 'Idea Dump',
    content: `# \n\n## The Idea\n\n\n\n## Why it matters\n\n\n\n## Next steps\n\n- [ ] \n`,
  },
};
