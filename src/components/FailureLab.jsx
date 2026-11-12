import { SCENARIOS } from '../lib/failureLab.js';

export function FailureLab({ scenario, setScenario, everyAttempt, setEveryAttempt }) {
  const on = scenario !== 'off';
  return (
    <details className={`lab ${on ? 'lab--on' : ''}`}>
      <summary>
        Failure lab {on && <span className="pill pill--warn">{SCENARIOS.find((s) => s.id === scenario)?.label}</span>}
      </summary>
      <p className="muted">
        Fake a bad AI response to see how the app copes. By default only the first attempt fails, so you can watch the
        automatic retry recover.
      </p>
      <div className="lab__grid">
        {SCENARIOS.map((s) => (
          <label key={s.id} className={`lab__opt ${scenario === s.id ? 'is-on' : ''}`}>
            <input type="radio" name="scenario" value={s.id} checked={scenario === s.id} onChange={() => setScenario(s.id)} />
            {s.label}
          </label>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={everyAttempt} onChange={(e) => setEveryAttempt(e.target.checked)} />
        Fail every attempt (show the final error screen)
      </label>
    </details>
  );
}
