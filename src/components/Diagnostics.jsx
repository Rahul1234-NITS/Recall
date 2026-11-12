import { SCENARIOS } from '../lib/failureLab.js';
import { Drawer } from './ui.jsx';

/** The "failure lab": make the AI misbehave on purpose to see how the app copes. */
export function Diagnostics({ open, onClose, lab, setLab }) {
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
    </Drawer>
  );
}
