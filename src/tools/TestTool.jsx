import { useEffect, useMemo, useState } from 'react';
import { useTask } from '../hooks/useTask.js';
import { ResultBar, ToolFrame, ToolIntro } from '../components/States.jsx';
import { RichText } from '../components/RichText.jsx';
import { Segmented } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { Quiz } from '../components/Quiz.jsx';
import { COUNTS, DIFFICULTY } from './CardsTool.jsx';

const MODES = [
  { value: 'objective', label: 'Objective (MCQ)' },
  { value: 'subjective', label: 'Subjective (written)' },
];

export function TestTool(props) {
  const [mode, setMode] = useState(props.space.subjective && !props.space.quiz ? 'subjective' : 'objective');
  return (
    <div className="test">
      <div className="test__switch">
        <Segmented label="Test type" value={mode} onChange={setMode} options={MODES} />
      </div>
      {/* Both stay mounted so switching doesn't lose answers in progress. */}
      <div hidden={mode !== 'objective'}>
        <Objective {...props} active={props.active && mode === 'objective'} />
      </div>
      <div hidden={mode !== 'subjective'}>
        <Subjective {...props} />
      </div>
    </div>
  );
}

/* ------------------------------ objective ------------------------------ */

function Objective({ space, source, save, active }) {
  const task = useTask();
  const saved = space.quiz;
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');

  async function generate() {
    const data = await task.run('quiz', { ...source, options: { count, difficulty } });
    if (data) save({ quiz: { data, bestScore: null, at: Date.now() } });
  }

  return (
    <ToolFrame
      task={task}
      hasData={!!saved}
      onRetry={generate}
      loadingLabel="Writing multiple-choice questions."
      intro={
        <ToolIntro
          icon="test"
          title="Objective test"
          description="Multiple-choice questions with an explanation after each answer. When you finish, re-test only the ones you got wrong, with the options shuffled."
          action="Start objective test"
          onStart={generate}
        >
          <label className="field">
            <span>Questions</span>
            <Segmented size="sm" label="Number of questions" value={count} onChange={setCount} options={COUNTS} />
          </label>
          <label className="field">
            <span>Difficulty</span>
            <Segmented size="sm" label="Difficulty" value={difficulty} onChange={setDifficulty} options={DIFFICULTY} />
          </label>
        </ToolIntro>
      }
      render={() => (
        <div className="doc">
          <ResultBar onRegenerate={generate} regenerateLabel="New questions">
            {saved.bestScore != null && <span className="muted">Best score so far: {saved.bestScore}%</span>}
          </ResultBar>
          <Quiz
            key={saved.at ?? 'quiz'}
            questions={saved.data.quiz}
            active={active}
            onRoundFinished={(correct, total) => {
              const score = Math.round((correct / total) * 100);
              save((s) => ({ quiz: { ...s.quiz, bestScore: Math.max(s.quiz.bestScore ?? 0, score) } }));
            }}
          />
        </div>
      )}
    />
  );
}

/* ------------------------------ subjective ------------------------------ */

const SUBJ_COUNTS = [3, 5, 8].map((n) => ({ value: n, label: String(n) }));
const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function Subjective({ space, source, save }) {
  const make = useTask();
  const grader = useTask();
  const saved = space.subjective;
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  // Answers live in local state while typing and are saved on blur/submit, not on every keystroke.
  const [answers, setAnswers] = useState(saved?.answers ?? {});
  useEffect(() => setAnswers(saved?.answers ?? {}), [saved?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    const data = await make.run('subjective', { ...source, options: { count, difficulty } });
    if (data) save({ subjective: { data, answers: {}, grade: null, at: Date.now() } });
  }

  const persist = (next = answers) => save((s) => ({ subjective: { ...s.subjective, answers: next } }));

  async function submit() {
    persist();
    const questions = saved.data.questions;
    const items = questions.map((q) => ({ ...q, answer: answers[q.id] ?? '' }));
    const grade = await grader.run('grade', { items, material: source.material.slice(0, 20_000), topic: source.topic }, { context: { questions } });
    if (grade) save((s) => ({ subjective: { ...s.subjective, answers, grade } }));
  }

  function retake() {
    setAnswers({});
    save((s) => ({ subjective: { ...s.subjective, answers: {}, grade: null } }));
  }

  const totalMarks = useMemo(() => saved?.data.questions.reduce((s, q) => s + q.marks, 0) ?? 0, [saved?.data]);
  const answered = saved ? saved.data.questions.filter((q) => (answers[q.id] ?? '').trim()).length : 0;

  return (
    <ToolFrame
      task={make}
      hasData={!!saved}
      onRetry={generate}
      loadingLabel="Writing exam-style questions and an answer key."
      intro={
        <ToolIntro
          icon="notes"
          title="Subjective test"
          description="Write your answers like in an exam. The AI marks each one against an answer key, gives partial credit and tells you exactly which points you missed."
          action="Start written test"
          onStart={generate}
        >
          <label className="field">
            <span>Questions</span>
            <Segmented size="sm" label="Number of questions" value={count} onChange={setCount} options={SUBJ_COUNTS} />
          </label>
          <label className="field">
            <span>Difficulty</span>
            <Segmented size="sm" label="Difficulty" value={difficulty} onChange={setDifficulty} options={DIFFICULTY} />
          </label>
        </ToolIntro>
      }
      render={() => {
        const { questions } = saved.data;
        const grade = saved.grade;
        return (
          <div className="doc doc--paper">
            <ResultBar onRegenerate={generate} regenerateLabel="New questions">
              <span className="muted">
                {questions.length} questions, {totalMarks} marks
              </span>
            </ResultBar>

            {grade && <GradeSummary grade={grade} onRetake={retake} />}

            <ol className="paper">
              {questions.map((q, i) => {
                const r = grade?.results[q.id];
                const value = answers[q.id] ?? '';
                return (
                  <li key={q.id} className="paper__q">
                    <div className="paper__head">
                      <span className="paper__num">Q{i + 1}</span>
                      <RichText as="p" className="paper__text" text={q.question} />
                      <span className="paper__marks">
                        {r ? `${r.score}/${q.marks}` : `${q.marks} mark${q.marks > 1 ? 's' : ''}`}
                      </span>
                    </div>

                    {grade ? (
                      <GradedAnswer q={q} r={r} answer={value} />
                    ) : (
                      <>
                        <textarea
                          className="answer"
                          value={value}
                          rows={q.marks >= 8 ? 9 : q.marks >= 5 ? 6 : 3}
                          placeholder="Write your answer…"
                          aria-label={`Answer to question ${i + 1}`}
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                          onBlur={() => persist()}
                          disabled={grader.busy}
                        />
                        <p className="answer__meta">{words(value)} words</p>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>

            {!grade && (
              <div className="paper__submit">
                {grader.status === 'error' && (
                  <p className="inline-error" role="alert">
                    <Icon name="alert" size={16} /> {grader.error?.message} <button className="link" onClick={submit}>Try again</button>
                  </p>
                )}
                {grader.busy ? (
                  <p className="grading" aria-live="polite">
                    <span className="spinner" /> {grader.attempt > 1 ? 'Grading again, the first attempt was unusable…' : 'Marking your answers…'}
                    <button className="btn btn--quiet btn--sm" onClick={grader.cancel}>Cancel</button>
                  </p>
                ) : (
                  <>
                    <span className="muted">
                      {answered} of {questions.length} answered
                    </span>
                    <button className="btn btn--primary btn--lg" onClick={submit} disabled={!answered}>
                      Submit for marking
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

function GradeSummary({ grade, onRetake }) {
  const pct = grade.max ? Math.round((grade.total / grade.max) * 100) : 0;
  return (
    <section className="grade" aria-label="Your result">
      <div className="score-ring" style={{ '--pct': pct }}>
        <span>{pct}%</span>
      </div>
      <div className="grade__body">
        <h3>
          {grade.total} out of {grade.max} marks
        </h3>
        {grade.overall && <RichText as="p" text={grade.overall} />}
        <button className="btn btn--quiet btn--sm" onClick={onRetake}>
          <Icon name="refresh" size={16} /> Retake with the same questions
        </button>
      </div>
    </section>
  );
}

function GradedAnswer({ q, r, answer }) {
  const [showModel, setShowModel] = useState(false);
  return (
    <div className="graded">
      <blockquote className={`graded__answer ${answer.trim() ? '' : 'is-empty'}`}>{answer.trim() || 'No answer written.'}</blockquote>
      {r ? (
        <>
          <div className="graded__bar" aria-hidden="true">
            <span style={{ width: `${(r.score / q.marks) * 100}%` }} />
          </div>
          {r.feedback && <RichText as="p" className="graded__feedback" text={r.feedback} />}
          <div className="graded__lists">
            {r.covered.length > 0 && (
              <ul className="ticks ticks--ok" aria-label="Points you covered">
                {r.covered.map((c) => (
                  <li key={c}>
                    <Icon name="check" size={16} /> {c}
                  </li>
                ))}
              </ul>
            )}
            {r.missed.length > 0 && (
              <ul className="ticks ticks--miss" aria-label="Points you missed">
                {r.missed.map((m) => (
                  <li key={m}>
                    <Icon name="x" size={16} /> {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p className="muted">This answer wasn't graded. Retake to try again.</p>
      )}
      <button className="link" onClick={() => setShowModel((v) => !v)} aria-expanded={showModel}>
        {showModel ? 'Hide' : 'Show'} model answer
      </button>
      {showModel && <RichText as="p" className="model-answer" text={q.modelAnswer || q.keyPoints.join('; ')} />}
    </div>
  );
}
