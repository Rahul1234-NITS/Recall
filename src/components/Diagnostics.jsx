import { SCENARIOS } from '../lib/failureLab.js';
import { Drawer } from './ui.jsx';

/** The "failure lab": make the AI misbehave on purpose to see how the app copes. */
export function Diagnostics({ open, onClose, lab, setLab, log = [], onClearLog }) {
  return (
    <Drawer open={open} onClose={onClose} title="Diagnostics">
      <p className="muted">
        Fake a bad AI response for the next request in any tool. By default only the first attempt fails, so you can watch the automatic retry recover.
      </p>
      <fieldset className="lab">
        <legend className="sr-only">Simulated problem</legend>
        {SCENARIOS.map((s) => (
          <label key={s.id} className={`lab__opt ${lab.scenario === s.id ? 'is-on' : ''}`}>
            <input type="radio" name="scenario" checked={lab.scenario === s.id} onChange={() => setLab((l) => ({ ...l, scenario: s.id }))} />
            {s.label}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={lab.everyAttempt} onChange={(e) => setLab((l) => ({ ...l, everyAttempt: e.target.checked }))} />
        Fail every attempt, to see the final error screen
      </label>

      <section className="fixlog">
        <div className="fixlog__head">
          <h3>What the app fixed behind the scenes</h3>
          {log.length > 0 && (
            <button className="link" onClick={onClearLog}>
              Clear
            </button>
          )}
        </div>
        {log.length === 0 ? (
          <p className="muted">Nothing yet. When an AI answer needs repairing or a retry, it's listed here instead of being shown to the student.</p>
        ) : (
          <ul>
            {log.map((e) => (
              <li key={e.at + e.task} className={e.failed ? 'is-bad' : ''}>
                <p className="fixlog__meta">
                  <b>{e.task}</b> {e.model && <>({e.model})</>}, attempt {e.attempt}, {new Date(e.at).toLocaleTimeString()}
                </p>
                {e.failed && <p>Unusable answer: {e.failed} Retried automatically.</p>}
                {e.incomplete && <p>Answer was cut off; showed the complete part.</p>}
                {e.warnings?.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                {!e.failed && !e.incomplete && !e.warnings?.length && <p>Recovered after a retry.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Drawer>
  );
}
