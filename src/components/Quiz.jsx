import { useReducer } from 'react';
import { useKeys } from '../hooks/useKeys.js';

/*
 * Quiz flow as a small state machine:
 *
 *   answering --pick--> revealed --next--> answering ... --last next--> finished
 *   finished --retest--> answering (only the questions you missed, options reshuffled)
 */

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startRound(questions, ids, round, shuffleOptions) {
  return {
    phase: 'answering',
    round,
    ids,
    pos: 0,
    picked: null,
    results: {}, // id -> true/false
    // display order of options per question, so a re-test isn't solved by position memory
    optionOrder: Object.fromEntries(
      questions.filter((q) => ids.includes(q.id)).map((q) => {
        const idx = q.options.map((_, i) => i);
        return [q.id, shuffleOptions ? shuffled(idx) : idx];
      }),
    ),
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'pick': {
      if (state.phase !== 'answering') return state;
      const q = action.question;
      return {
        ...state,
        phase: 'revealed',
        picked: action.option,
        results: { ...state.results, [q.id]: action.option === q.answerIndex },
      };
    }
    case 'next':
      if (state.phase !== 'revealed') return state;
      if (state.pos + 1 >= state.ids.length) return { ...state, phase: 'finished' };
      return { ...state, phase: 'answering', pos: state.pos + 1, picked: null };
    case 'retest':
      return startRound(action.questions, action.ids, state.round + 1, true);
    case 'restart':
      return startRound(action.questions, action.questions.map((q) => q.id), 1, false);
    default:
      return state;
  }
}

export function Quiz({ questions, onRoundFinished, active }) {
  const [state, dispatch] = useReducer(reducer, null, () =>
    startRound(questions, questions.map((q) => q.id), 1, false),
  );

  const byId = new Map(questions.map((q) => [q.id, q]));
  const q = byId.get(state.ids[state.pos]);
  const order = q ? state.optionOrder[q.id] : [];

  const correctCount = Object.values(state.results).filter(Boolean).length;
  const wrongIds = state.ids.filter((id) => state.results[id] === false);

  function pick(displayIndex) {
    if (!q || state.phase !== 'answering') return;
    const original = order[displayIndex];
    if (original === undefined) return;
    dispatch({ type: 'pick', question: q, option: original });
  }

  function next() {
    if (state.phase !== 'revealed') return;
    const finishing = state.pos + 1 >= state.ids.length;
    dispatch({ type: 'next' });
    if (finishing && state.round === 1) onRoundFinished?.(correctCount, state.ids.length);
  }

  useKeys(
    {
      1: () => pick(0),
      2: () => pick(1),
      3: () => pick(2),
      4: () => pick(3),
      5: () => pick(4),
      6: () => pick(5),
      Enter: () => next(),
      ArrowRight: () => next(),
    },
    active && state.phase !== 'finished',
  );

  if (state.phase === 'finished') {
    const total = state.ids.length;
    const pct = Math.round((correctCount / total) * 100);
    return (
      <div className="quiz-done">
        <div className="score-ring" style={{ '--pct': pct }} aria-label={`Score ${pct} percent`}>
          <span>{pct}%</span>
        </div>
        <h3>
          {state.round > 1 ? `Re-test round ${state.round - 1}: ` : ''}
          {correctCount} of {total} correct
        </h3>
        {wrongIds.length ? (
          <>
            <p className="muted">You missed:</p>
            <ul className="missed">
              {wrongIds.map((id) => (
                <li key={id}>
                  <span>{byId.get(id)?.question}</span>
                  <b>{byId.get(id)?.options[byId.get(id).answerIndex]}</b>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">{state.round > 1 ? 'You fixed every one you missed.' : 'Perfect round.'}</p>
        )}
        <div className="row">
          {wrongIds.length > 0 && (
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'retest', questions, ids: shuffled(wrongIds) })}>
              Re-test {wrongIds.length} wrong
            </button>
          )}
          <button className="btn btn--quiet" onClick={() => dispatch({ type: 'restart', questions })}>
            Restart full quiz
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;
  const revealed = state.phase === 'revealed';
  const gotIt = revealed && state.picked === q.answerIndex;

  return (
    <div className="quiz">
      <div className="quiz__head">
        <span className="pill">{state.round > 1 ? `Re-test · round ${state.round - 1}` : 'Quiz'}</span>
        <span className="muted">
          Question {state.pos + 1} of {state.ids.length}
        </span>
      </div>
      <div className="quiz__dots" aria-hidden="true">
        {state.ids.map((id, i) => (
          <span key={id} className={state.results[id] === true ? 'ok' : state.results[id] === false ? 'bad' : i === state.pos ? 'now' : ''} />
        ))}
      </div>

      <h3 className="quiz__q">{q.question}</h3>

      <ol className="options">
        {order.map((original, displayIndex) => {
          let cls = 'option';
          if (revealed && original === q.answerIndex) cls += ' is-correct';
          else if (revealed && original === state.picked) cls += ' is-wrong';
          return (
            <li key={original}>
              <button className={cls} onClick={() => pick(displayIndex)} disabled={revealed} aria-keyshortcuts={String(displayIndex + 1)}>
                <kbd>{displayIndex + 1}</kbd>
                <span>{q.options[original]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {revealed && (
        <div className={`feedback ${gotIt ? 'feedback--ok' : 'feedback--bad'}`} aria-live="polite">
          <strong>{gotIt ? 'Correct.' : `Not quite. The answer is “${q.options[q.answerIndex]}”.`}</strong>
          {q.explanation && <p>{q.explanation}</p>}
          <button className="btn btn--primary" onClick={next} autoFocus>
            {state.pos + 1 >= state.ids.length ? 'See results' : 'Next'} <kbd>↵</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
