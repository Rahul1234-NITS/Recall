import { useEffect, useRef, useState } from 'react';
import { useTask } from '../hooks/useTask.js';
import { ToolError } from '../components/States.jsx';
import { RichText, plain } from '../components/RichText.jsx';
import { Icon } from '../components/Icon.jsx';
import { newId } from '../lib/storage.js';

const STARTERS = [
  'Explain the hardest part in simple words',
  'Give me a real-life example',
  'What is most likely to come in the exam?',
  'Which two ideas here do students confuse most?',
];

/**
 * Follow-up questions about the material. Each answer is structured (paragraphs,
 * takeaways, suggested next questions), not free chat text.
 */
export function AskTool({ space, source, save, pending, onPendingUsed, active }) {
  const task = useTask();
  const turns = space.ask?.turns ?? [];
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(null); // question in flight, shown while loading
  const endRef = useRef(null);
  const inputRef = useRef(null);

  async function ask(question) {
    const q = question.trim();
    if (!q || task.busy) return;
    setDraft('');
    setAsking(q);
    const history = turns.slice(-6).map((t) => ({ q: t.q, a: plain(t.a.paragraphs.join(' ')).slice(0, 1200) }));
    const a = await task.run('ask', { ...source, question: q, history });
    setAsking(null);
    if (a) save((s) => ({ ask: { turns: [...(s.ask?.turns ?? []), { id: newId(), q, a, at: Date.now() }] } }));
    else setDraft(q); // keep the question so it can be re-sent
  }

  // A "Learn next" chip from the lesson sends a question here.
  useEffect(() => {
    if (pending && active) {
      onPendingUsed();
      ask(pending);
    }
  }, [pending, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, asking, active]);

  const last = turns[turns.length - 1];

  return (
    <div className="ask">
      {turns.length === 0 && !asking ? (
        <div className="ask__empty">
          <h2 className="intro__title">Ask anything about this</h2>
          <p className="intro__text">
            Answers use your material first and say clearly when they go beyond it. Each answer suggests what to ask next.
          </p>
          <div className="chips">
            {STARTERS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="thread">
          {turns.length > 0 && (
            <div className="thread__tools">
              <button className="btn btn--quiet btn--sm" onClick={() => save({ ask: { turns: [] } })}>
                <Icon name="trash" size={16} /> Clear conversation
              </button>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} className="turn">
              <p className="turn__q">{t.q}</p>
              <div className="turn__a">
                {t.a.paragraphs.map((p) => (
                  <RichText key={p} as="p" text={p} />
                ))}
                {t.a.points.length > 0 && (
                  <ul className="points">
                    {t.a.points.map((p) => (
                      <li key={p}>
                        <RichText text={p} />
                      </li>
                    ))}
                  </ul>
                )}
                {!t.a.fromMaterial && (
                  <p className="turn__note">
                    <Icon name="book" size={15} /> Your material doesn't cover this, so this answer uses general knowledge.
                  </p>
                )}
              </div>
            </div>
          ))}
          {asking && (
            <div className="turn">
              <p className="turn__q">{asking}</p>
              <div className="turn__a turn__a--loading" aria-live="polite">
                <span className="spinner" /> {task.attempt > 1 ? 'Asking again, the first answer was unusable…' : task.verySlow ? 'Gemini is busy, trying backup models…' : task.slow ? 'Still thinking…' : 'Thinking…'}
                <button className="btn btn--quiet btn--sm" onClick={() => { task.cancel(); setAsking(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {task.status === 'error' && (
            <ToolError error={task.error} onRetry={() => ask(draft)} onBack={task.cancel} backLabel="Dismiss" />
          )}
          {!asking && last?.a.followUps.length > 0 && (
            <div className="chips chips--follow" aria-label="Suggested follow-up questions">
              {last.a.followUps.map((f) => (
                <button key={f} className="chip" onClick={() => ask(f)}>
                  {f}
                </button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        className="ask__composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          maxLength={800}
          placeholder="Ask a follow-up question…"
          aria-label="Your question"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
        />
        <button className="btn btn--primary btn--icon" disabled={!draft.trim() || task.busy} aria-label="Send question">
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
