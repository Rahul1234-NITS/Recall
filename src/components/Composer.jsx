import { useId, useState } from 'react';

const MAX = 12_000;

const MODES = [
  { id: 'both', label: 'Cards + quiz' },
  { id: 'cards', label: 'Flashcards' },
  { id: 'quiz', label: 'Quiz' },
];

export const EXAMPLES = [
  { label: 'Photosynthesis', text: 'Photosynthesis' },
  { label: 'TCP vs UDP', text: 'Differences between TCP and UDP: connection setup, reliability, ordering, speed, and typical use cases.' },
  {
    label: 'Sample notes',
    text: `Ohm's law: V = I × R. Voltage (volts) is the push, current (amperes) is the flow, resistance (ohms) opposes flow.
Series circuit: same current through every component, total R = R1 + R2 + ...
Parallel circuit: same voltage across each branch, 1/R_total = 1/R1 + 1/R2 + ...
Power: P = V × I = I²R = V²/R, measured in watts.
Kirchhoff's current law: currents entering a node equal currents leaving it.
Kirchhoff's voltage law: the sum of voltages around any closed loop is zero.`,
  },
];

export function Composer({ busy, onSubmit, onCancel }) {
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState('both');
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState('medium');
  const ids = useId();

  const trimmed = notes.trim();
  const tooLong = notes.length > MAX;
  const canSubmit = trimmed.length > 0 && !tooLong;

  function submit(e) {
    e?.preventDefault();
    if (!canSubmit) return;
    onSubmit({ notes: trimmed, mode, count, difficulty });
  }

  return (
    <form className="composer" onSubmit={submit}>
      <label htmlFor={`${ids}-notes`} className="composer__label">
        What are you studying?
      </label>
      <textarea
        id={`${ids}-notes`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        placeholder="Paste lecture notes, a textbook paragraph, or just type a topic like “Krebs cycle”."
        rows={6}
        aria-describedby={`${ids}-count`}
      />
      <div className="composer__meta">
        <div className="chips" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="chip" onClick={() => setNotes(ex.text)}>
              {ex.label}
            </button>
          ))}
        </div>
        <span id={`${ids}-count`} className={tooLong ? 'counter counter--over' : 'counter'}>
          {notes.length.toLocaleString()} / {MAX.toLocaleString()}
        </span>
      </div>

      <div className="composer__options">
        <div className="segmented" role="radiogroup" aria-label="What to make">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              className={mode === m.id ? 'is-on' : ''}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="select">
          <span>Items</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[5, 8, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="select">
          <span>Level</span>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <div className="composer__actions">
          {busy && (
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {busy ? 'Start over' : 'Generate'}
            <kbd className="kbd-hint">Ctrl ↵</kbd>
          </button>
        </div>
      </div>
    </form>
  );
}
