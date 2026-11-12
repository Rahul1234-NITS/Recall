import { useState } from 'react';
import { describeError, FATAL_CODES } from '../lib/api.js';
import { Icon } from './Icon.jsx';

/** First screen of a tool: what it does, its options, and the button that starts it. */
export function ToolIntro({ icon, title, children, description, action, onStart, disabled }) {
  return (
    <section className="intro">
      <div className="intro__icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </div>
      <h2 className="intro__title">{title}</h2>
      <p className="intro__text">{description}</p>
      {children && <div className="intro__options">{children}</div>}
      <button className="btn btn--primary btn--lg" onClick={onStart} disabled={disabled}>
        {action}
      </button>
    </section>
  );
}

export function ToolLoading({ task, label, onCancel }) {
  let message = label;
  if (task.attempt > 1) message = `The first answer was unusable, so we're asking again (try ${task.attempt} of ${task.maxAttempts})`;
  else if (task.verySlow) message = 'Gemini is busy right now, so Recall is trying backup models. This can take up to 2–3 minutes.';
  else if (task.slow) message = `${label} This can take up to a minute for long material.`;

  return (
    <section className="loading" aria-busy="true">
      <div className="loading__bar">
        <span className="spinner" aria-hidden="true" />
        <p aria-live="polite">{message}</p>
        <button className="btn btn--quiet btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="skeleton" aria-hidden="true">
        <span style={{ width: '42%', height: 26 }} />
        <span />
        <span />
        <span style={{ width: '78%' }} />
        <span style={{ width: '30%', height: 20, marginTop: 18 }} />
        <span />
        <span style={{ width: '64%' }} />
      </div>
    </section>
  );
}

export function ToolError({ error, onRetry, onBack, backLabel = 'Go back' }) {
  const [open, setOpen] = useState(false);
  const canRetry = !FATAL_CODES.includes(error?.code);
  return (
    <section className="error" role="alert">
      <div className="error__icon" aria-hidden="true">
        <Icon name="alert" size={20} />
      </div>
      <div className="error__body">
        <h2>{describeError(error)}</h2>
        <p>{error?.message}</p>
        {error?.code === 'invalid_output' && <p className="muted">We already asked twice. Trying again usually works.</p>}
        <div className="row">
          {canRetry && (
            <button className="btn btn--primary" onClick={onRetry}>
              <Icon name="refresh" /> Try again
            </button>
          )}
          <button className="btn btn--quiet" onClick={onBack}>
            {backLabel}
          </button>
        </div>
        {error?.raw != null && (
          <div className="error__raw">
            <button className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'Hide' : 'Show'} what the AI sent
            </button>
            {open && <pre>{String(error.raw).slice(0, 2500) || '(empty)'}</pre>}
          </div>
        )}
      </div>
    </section>
  );
}

export function Warnings({ items, onClose }) {
  if (!items?.length) return null;
  return (
    <div className="warnings" role="status">
      <Icon name="alert" />
      <div>
        <strong>The AI's answer needed some cleanup</strong>
        <ul>
          {items.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <button className="icon-btn icon-btn--bare" onClick={onClose} aria-label="Dismiss">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

/** Row of actions above a generated result. */
export function ResultBar({ children, onRegenerate, regenerateLabel = 'Regenerate' }) {
  return (
    <div className="resultbar">
      <div className="resultbar__left">{children}</div>
      {onRegenerate && (
        <button className="btn btn--quiet btn--sm" onClick={onRegenerate}>
          <Icon name="refresh" size={16} /> {regenerateLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Shared frame for every tool: loading / error / intro / result.
 * `render()` is only called when there is data.
 */
export function ToolFrame({ task, hasData, intro, loadingLabel, onRetry, render }) {
  if (task.busy) return <ToolLoading task={task} label={loadingLabel} onCancel={task.cancel} />;
  if (task.status === 'error') {
    return <ToolError error={task.error} onRetry={onRetry} onBack={task.cancel} backLabel={hasData ? 'Back to previous result' : 'Go back'} />;
  }
  if (!hasData) return intro;
  return (
    <>
      <Warnings items={task.warnings} onClose={task.dismissWarnings} />
      {render()}
    </>
  );
}
