import { useCallback, useEffect, useRef, useState } from 'react';
import { Composer } from './components/Composer.jsx';
import { StudyView } from './components/StudyView.jsx';
import { SessionDrawer } from './components/SessionDrawer.jsx';
import { FailureLab } from './components/FailureLab.jsx';
import { EmptyState, ErrorState, LoadingState, Warnings } from './components/States.jsx';
import { useGenerateDeck } from './hooks/useGenerateDeck.js';
import { useSessions } from './hooks/useSessions.js';
import { useTheme } from './hooks/useTheme.js';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scenario, setScenario] = useState('off');
  const [everyAttempt, setEveryAttempt] = useState(false);
  const [warnings, setWarnings] = useState([]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const sessions = useSessions();
  const gen = useGenerateDeck({ scenario, everyAttempt });

  // A successful generation becomes a saved session. `result` is a fresh object
  // per success, so this runs exactly once per generated deck.
  const handled = useRef(null);
  const { add } = sessions;
  useEffect(() => {
    if (gen.status === 'success' && gen.result && handled.current !== gen.result) {
      handled.current = gen.result;
      add(gen.result);
      setWarnings(gen.result.warnings);
    }
  }, [gen.status, gen.result, add]);

  const outputRef = useRef(null);
  const onSubmit = useCallback(
    (request) => {
      setWarnings([]);
      gen.generate(request);
      // On phones the result is below the form; bring it into view.
      if (window.matchMedia('(max-width: 860px)').matches) {
        requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    },
    [gen.generate], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const busy = gen.status === 'loading';
  const active = sessions.active;

  let body;
  if (busy) {
    body = <LoadingState attempt={gen.attempt} maxAttempts={gen.maxAttempts} slow={gen.slow} onCancel={gen.cancel} />;
  } else if (gen.status === 'error') {
    body = (
      <ErrorState
        error={gen.error}
        canRetry={Boolean(gen.lastRequest) && !['empty_input', 'input_too_long', 'missing_key', 'bad_key', 'model_not_found'].includes(gen.error?.code)}
        onRetry={gen.retry}
        onDismiss={gen.dismiss}
        hasPrevious={Boolean(active)}
      />
    );
  } else if (active) {
    body = (
      <>
        <Warnings items={warnings} onClose={() => setWarnings([])} />
        <StudyView key={active.id} session={active} onProgress={(patch) => sessions.updateProgress(active.id, patch)} />
      </>
    );
  } else {
    body = <EmptyState />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => e.preventDefault()}>
          <span className="brand__mark" aria-hidden="true">R</span>
          Recall
        </a>
        <nav className="topbar__actions">
          <button className="btn btn--ghost btn--small" onClick={() => setDrawerOpen(true)}>
            Saved <span className="count">{sessions.sessions.length}</span>
          </button>
          <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </nav>
      </header>

      <main className="layout">
        <div className="layout__input">
          <Composer busy={busy} onSubmit={onSubmit} onCancel={gen.cancel} />
          <FailureLab scenario={scenario} setScenario={setScenario} everyAttempt={everyAttempt} setEveryAttempt={setEveryAttempt} />
        </div>
        <div className="layout__output" ref={outputRef}>
          {body}
        </div>
      </main>

      <SessionDrawer
        open={drawerOpen}
        sessions={sessions.sessions}
        activeId={sessions.activeId}
        onPick={(id) => {
          sessions.setActiveId(id);
          setWarnings([]);
          if (gen.status === 'error') gen.dismiss();
          closeDrawer();
        }}
        onDelete={sessions.remove}
        onClose={closeDrawer}
      />
    </div>
  );
}
