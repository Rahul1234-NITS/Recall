import { useState } from 'react';
import { describeError } from '../lib/api.js';

export function LoadingState({ attempt, maxAttempts, slow, onCancel }) {
  let message = 'Reading your notes and writing questions…';
  if (attempt > 1) message = `The first answer was unusable. Asking again (try ${attempt} of ${maxAttempts})…`;
  else if (slow) message = 'Still working. Long notes can take up to a minute.';

  return (
    <section className="panel loading" aria-busy="true" aria-live="polite">
      <p className="loading__text">
        <span className="spinner" aria-hidden="true" />
        {message}
      </p>
      <div className="skeleton-card" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {(slow || attempt > 1) && (
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </section>
  );
}

export function ErrorState({ error, canRetry, onRetry, onDismiss, hasPrevious }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel error" role="alert">
      <div className="error__icon" aria-hidden="true">
        !
      </div>
      <h2>{describeError(error)}</h2>
      <p>{error?.message}</p>
      {error?.code === 'invalid_output' && <p className="muted">We tried twice. Retrying usually works, or try shorter or clearer notes.</p>}
      <div className="row">
        {canRetry && (
          <button className="btn btn--primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <button className="btn btn--ghost" onClick={onDismiss}>
          {hasPrevious ? 'Back to my set' : 'Dismiss'}
        </button>
      </div>
      {error?.raw && (
        <div className="error__details">
          <button className="linkish" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide' : 'Show'} what the AI actually sent
          </button>
          {open && <pre>{String(error.raw).slice(0, 2000) || '(empty)'}</pre>}
        </div>
      )}
    </section>
  );
}

export function EmptyState() {
  return (
    <section className="panel empty">
      <div className="empty__art" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>Turn notes into practice</h2>
      <p>Paste notes or name a topic above. You'll get flip-cards to drill and a quiz that re-tests whatever you got wrong.</p>
      <ul className="steps">
        <li>
          <b>1</b> Paste or type
        </li>
        <li>
          <b>2</b> Flip &amp; mark cards
        </li>
        <li>
          <b>3</b> Quiz until it sticks
        </li>
      </ul>
    </section>
  );
}

export function Warnings({ items, onClose }) {
  if (!items?.length) return null;
  return (
    <div className="warnings" role="status">
      <div>
        <strong>Heads up: the AI's answer needed some cleanup.</strong>
        <ul>
          {items.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <button className="icon-btn" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
