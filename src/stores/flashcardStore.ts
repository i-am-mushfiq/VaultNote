import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type CardState, defaultCardState, sm2, isDue, parseFlashcards, type Flashcard } from '@/lib/sm2';

interface FlashcardStore {
  states:   Record<string, CardState>; // cardId → SM-2 state
  // Active review session
  queue:    Flashcard[];
  current:  number; // index into queue
  mode:     'idle' | 'reviewing';

  // Build a review queue from one or more notes
  startReview: (cards: Flashcard[]) => void;
  // Rate the current card and advance
  rateCard: (quality: 0|1|2|3|4|5) => void;
  // End the review session
  stopReview: () => void;
  // Check how many cards are due across all indexed notes
  getDueCount: () => number;
  // Get the current flashcard
  currentCard: () => Flashcard | null;
}

export const useFlashcardStore = create<FlashcardStore>()(
  persist(
    (set, get) => ({
      states:  {},
      queue:   [],
      current: 0,
      mode:    'idle',

      startReview(cards) {
        const { states } = get();
        // Only include due cards; if none due, include all (for first-time review)
        const due = cards.filter((c) => {
          const s = states[c.id];
          return !s || isDue(s);
        });
        const toReview = due.length > 0 ? due : cards;
        // Shuffle
        const shuffled = [...toReview].sort(() => Math.random() - 0.5);
        set({ queue: shuffled, current: 0, mode: 'reviewing' });
      },

      rateCard(quality) {
        const { queue, current, states } = get();
        const card = queue[current];
        if (!card) return;
        const prev  = states[card.id] ?? defaultCardState();
        const next  = sm2(prev, quality);
        set({
          states:  { ...states, [card.id]: next },
          current: current + 1,
        });
        if (current + 1 >= queue.length) set({ mode: 'idle' });
      },

      stopReview() { set({ mode: 'idle', queue: [], current: 0 }); },

      getDueCount() {
        const { states } = get();
        return Object.values(states).filter(isDue).length;
      },

      currentCard() {
        const { queue, current } = get();
        return queue[current] ?? null;
      },
    }),
    { name: 'vaultnote-flashcards' },
  ),
);
