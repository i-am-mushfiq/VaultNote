import { useState, useEffect } from 'react';
import { useFlashcardStore } from '@/stores/flashcardStore';
import { parseFlashcards } from '@/lib/sm2';
import { X } from 'lucide-react';

interface Props {
  filePath: string;
  content:  string;
  onClose:  () => void;
}

export default function FlashcardMode({ filePath, content, onClose }: Props) {
  const { queue, current, mode, startReview, rateCard, stopReview, currentCard } = useFlashcardStore();
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const cards = parseFlashcards(filePath, content);
    if (cards.length > 0) startReview(cards);
    return () => stopReview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  useEffect(() => { setFlipped(false); }, [current]);

  const card = currentCard();
  const done = mode === 'idle' || !card;
  const progress = queue.length > 0 ? (current / queue.length) * 100 : 100;

  const rate = (q: 0|1|2|3|4|5) => { rateCard(q); setFlipped(false); };

  return (
    <div className="flashcard-overlay">
      <div className="flashcard-header">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Flashcard Review</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {done ? queue.length : current} / {queue.length}
          </span>
          <button className="icon-btn" onClick={() => { stopReview(); onClose(); }}><X size={14} /></button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
      </div>

      <div className="flashcard-body">
        {done ? (
          <div className="flashcard-done">
            <div style={{ fontSize: 40 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 16 }}>Review Complete!</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>{queue.length} cards reviewed</div>
            <button className="btn-primary" style={{ marginTop: 24 }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="flashcard-card" onClick={() => !flipped && setFlipped(true)}>
            <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
              <div className="flashcard-front">
                <div className="flashcard-label">Question</div>
                <div className="flashcard-text">{card!.question}</div>
                {!flipped && (
                  <div className="flashcard-hint">Click to reveal answer</div>
                )}
              </div>
              {flipped && (
                <div className="flashcard-back">
                  <div className="flashcard-label">Answer</div>
                  <div className="flashcard-text">{card!.answer}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {flipped && !done && (
          <div className="flashcard-ratings">
            <button className="fc-btn fc-again"  onClick={() => rate(1)}>Again</button>
            <button className="fc-btn fc-hard"   onClick={() => rate(2)}>Hard</button>
            <button className="fc-btn fc-good"   onClick={() => rate(4)}>Good</button>
            <button className="fc-btn fc-easy"   onClick={() => rate(5)}>Easy</button>
          </div>
        )}
      </div>
    </div>
  );
}
