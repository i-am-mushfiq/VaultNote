// ── SM-2 Spaced Repetition Algorithm ─────────────────────────────────────────
// Based on SuperMemo 2 by Piotr Wozniak.
// Quality: 0–2 = wrong answer, 3–5 = correct (5 = perfect recall)

export interface CardState {
  repetitions: number;  // number of successful reviews
  interval:    number;  // days until next review
  easeFactor:  number;  // 1.3 – 2.5, starts at 2.5
  nextReview:  number;  // Unix ms timestamp
  totalReviews: number;
}

export const defaultCardState = (): CardState => ({
  repetitions:  0,
  interval:     1,
  easeFactor:   2.5,
  nextReview:   Date.now(),
  totalReviews: 0,
});

export function sm2(state: CardState, quality: 0|1|2|3|4|5): CardState {
  const { repetitions, interval, easeFactor } = state;

  if (quality < 3) {
    // Wrong answer: reset streak, review again in 1 day
    return {
      ...state,
      repetitions:  0,
      interval:     1,
      nextReview:   Date.now() + 86_400_000,
      totalReviews: state.totalReviews + 1,
    };
  }

  // Correct answer: advance interval
  const newReps     = repetitions + 1;
  const newInterval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * easeFactor);
  const newEF       = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  return {
    repetitions:  newReps,
    interval:     newInterval,
    easeFactor:   newEF,
    nextReview:   Date.now() + newInterval * 86_400_000,
    totalReviews: state.totalReviews + 1,
  };
}

export function isDue(state: CardState): boolean {
  return Date.now() >= state.nextReview;
}

// ── Flashcard parsing ─────────────────────────────────────────────────────────

export interface Flashcard {
  id:       string; // `${notePath}::${index}`
  notePath: string;
  index:    number;
  question: string;
  answer:   string;
}

const QA_RE = /^Q:\s*(.+?)[\r\n]+A:\s*([\s\S]+?)(?=\n\nQ:|\n\nQ |$)/gm;

export function parseFlashcards(notePath: string, content: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const re = new RegExp(QA_RE.source, 'gm');
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(content)) !== null) {
    cards.push({
      id:       `${notePath}::${idx}`,
      notePath,
      index:    idx++,
      question: m[1].trim(),
      answer:   m[2].trim(),
    });
  }
  return cards;
}
