import { useState } from 'react';
import { Flashcards } from './Flashcards.jsx';
import { Quiz } from './Quiz.jsx';

export function StudyView({ session, onProgress }) {
  const { deck, progress } = session;
  const hasCards = deck.cards.length > 0;
  const hasQuiz = deck.quiz.length > 0;
  const [tab, setTab] = useState(hasCards ? 'cards' : 'quiz');

  return (
    <section className="panel study">
      <header className="study__head">
        <div>
          <h2>{deck.title}</h2>
          <p className="muted">
            {[hasCards && `${deck.cards.length} cards`, hasQuiz && `${deck.quiz.length} questions`, session.request?.difficulty]
              .filter(Boolean)
              .join(' · ')}
            {progress.bestScore != null && ` · best quiz score ${progress.bestScore}%`}
          </p>
        </div>
        {hasCards && hasQuiz && (
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'cards'} className={tab === 'cards' ? 'is-on' : ''} onClick={() => setTab('cards')}>
              Flashcards
            </button>
            <button role="tab" aria-selected={tab === 'quiz'} className={tab === 'quiz' ? 'is-on' : ''} onClick={() => setTab('quiz')}>
              Quiz
            </button>
          </div>
        )}
      </header>

      {/* Both stay mounted so switching tabs doesn't lose your place mid-quiz. */}
      {hasCards && (
        <div hidden={tab !== 'cards'}>
          <Flashcards
            cards={deck.cards}
            known={progress.known}
            active={tab === 'cards'}
            onKnownChange={(known) => onProgress({ known })}
          />
        </div>
      )}
      {hasQuiz && (
        <div hidden={tab !== 'quiz'}>
          <Quiz
            questions={deck.quiz}
            active={tab === 'quiz'}
            onRoundFinished={(correct, total) => {
              const score = Math.round((correct / total) * 100);
              onProgress((p) => ({ attempts: p.attempts + 1, bestScore: Math.max(p.bestScore ?? 0, score) }));
            }}
          />
        </div>
      )}
    </section>
  );
}
