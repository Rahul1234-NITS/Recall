import { useMemo, useState } from 'react';
import { useKeys } from '../hooks/useKeys.js';

/**
 * Flip-cards with a "known / still learning" pile.
 * `known` lives in the saved session so progress survives a reload.
 */
export function Flashcards({ cards, known, onKnownChange, active }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'learning'
  const [order, setOrder] = useState(() => cards.map((c) => c.id));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const knownSet = useMemo(() => new Set(known), [known]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const visible = useMemo(
    () => order.filter((id) => byId.has(id) && (filter === 'all' || !knownSet.has(id))),
    [order, byId, filter, knownSet],
  );

  const index = Math.min(pos, Math.max(visible.length - 1, 0));
  const card = byId.get(visible[index]);

  function go(delta) {
    if (!visible.length) return;
    setPos((index + delta + visible.length) % visible.length);
    setFlipped(false);
    setShowHint(false);
  }

  function mark(isKnown) {
    if (!card) return;
    const next = new Set(knownSet);
    if (isKnown) next.add(card.id);
    else next.delete(card.id);
    onKnownChange([...next]);
    setFlipped(false);
    setShowHint(false);
    // In "still learning" view the card leaves the list, so the same index is already the next card.
    if (!(filter === 'learning' && isKnown)) setPos(visible.length ? (index + 1) % visible.length : 0);
  }

  function shuffle() {
    const a = [...order];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    setOrder(a);
    setPos(0);
    setFlipped(false);
  }

  useKeys(
    {
      ' ': () => setFlipped((f) => !f),
      Enter: () => setFlipped((f) => !f),
      ArrowRight: () => go(1),
      ArrowLeft: () => go(-1),
      1: () => mark(false),
      2: () => mark(true),
      h: () => setShowHint(true),
    },
    active,
  );

  const knownCount = cards.filter((c) => knownSet.has(c.id)).length;
  const pct = cards.length ? Math.round((knownCount / cards.length) * 100) : 0;

  return (
    <div className="cards">
      <div className="toolbar">
        <div className="segmented segmented--small" role="radiogroup" aria-label="Which cards">
          <button role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => { setFilter('all'); setPos(0); setFlipped(false); }}>
            All {cards.length}
          </button>
          <button role="radio" aria-checked={filter === 'learning'} className={filter === 'learning' ? 'is-on' : ''} onClick={() => { setFilter('learning'); setPos(0); setFlipped(false); }}>
            Still learning {cards.length - knownCount}
          </button>
        </div>
        <button className="btn btn--ghost btn--small" onClick={shuffle}>
          Shuffle
        </button>
      </div>

      <div className="progress" aria-label={`${knownCount} of ${cards.length} cards known`}>
        <div className="progress__bar" style={{ width: `${pct}%` }} />
        <span>{knownCount}/{cards.length} known</span>
      </div>

      {!card ? (
        <div className="done-pile">
          <p className="done-pile__big">Every card is marked as known.</p>
          <div className="row">
            <button className="btn btn--primary" onClick={() => setFilter('all')}>
              Review all
            </button>
            <button className="btn btn--ghost" onClick={() => onKnownChange([])}>
              Reset progress
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className={`flip ${flipped ? 'is-flipped' : ''}`}
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? `Answer: ${card.back}. Click to see question.` : `Question: ${card.front}. Click to reveal answer.`}
            key={card.id}
          >
            <span className="flip__inner">
              <span className="flip__face flip__front">
                <span className="flip__tag">Question</span>
                <span className="flip__text">{card.front}</span>
                {card.hint && showHint && <span className="flip__hint">Hint: {card.hint}</span>}
              </span>
              <span className="flip__face flip__back">
                <span className="flip__tag">Answer</span>
                <span className="flip__text">{card.back}</span>
              </span>
            </span>
          </button>

          <div className="card-nav">
            <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous card">
              ←
            </button>
            <span className="card-nav__pos">
              {index + 1} / {visible.length}
            </span>
            <button className="icon-btn" onClick={() => go(1)} aria-label="Next card">
              →
            </button>
          </div>

          {card.hint && !showHint && !flipped && (
            <button className="linkish hint-btn" onClick={() => setShowHint(true)}>
              Show hint <kbd>H</kbd>
            </button>
          )}

          <div className="mark-row">
            <button className="btn btn--soft-red" onClick={() => mark(false)}>
              Still learning <kbd>1</kbd>
            </button>
            <button className="btn btn--soft-green" onClick={() => mark(true)}>
              Got it <kbd>2</kbd>
            </button>
          </div>
        </>
      )}
      <p className="shortcuts muted">Space to flip · ← → to move · 1 / 2 to mark</p>
    </div>
  );
}
