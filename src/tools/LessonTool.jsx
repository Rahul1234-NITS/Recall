import { useState } from 'react';
import { useTask } from '../hooks/useTask.js';
import { useAutoRun } from '../hooks/useAutoRun.js';
import { ResultBar, ToolFrame, ToolIntro } from '../components/States.jsx';
import { RichText } from '../components/RichText.jsx';
import { Segmented } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const LEVELS = [
  { value: 'beginner', label: 'New to this' },
  { value: 'intermediate', label: 'Know the basics' },
  { value: 'advanced', label: 'Going deep' },
];

function Checkpoint({ cp }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="checkpoint">
      <p className="checkpoint__label">
        <Icon name="test" size={16} /> Check yourself
      </p>
      <RichText as="p" className="checkpoint__q" text={cp.question} />
      {open ? (
        <RichText as="p" className="checkpoint__a" text={cp.answer} />
      ) : (
        <button className="btn btn--quiet btn--sm" onClick={() => setOpen(true)}>
          Show answer
        </button>
      )}
    </div>
  );
}

export function LessonTool({ space, source, save, autoRun, onAsk }) {
  const task = useTask();
  const saved = space.lesson;
  const [level, setLevel] = useState(saved?.level ?? 'beginner');

  async function generate(lv = level) {
    setLevel(lv);
    const data = await task.run('lesson', { ...source, options: { level: lv } });
    if (data) save((s) => ({ ...(s.titleAuto ? { title: data.title, titleAuto: false } : {}), lesson: { level: lv, data } }));
  }
  useAutoRun(autoRun && !saved, generate);

  return (
    <ToolFrame
      task={task}
      hasData={!!saved}
      onRetry={() => generate()}
      loadingLabel="Planning a lesson that builds up step by step."
      intro={
        <ToolIntro
          icon="learn"
          title={space.topic && !source.material ? `Learn ${space.topic}` : 'Learn this properly'}
          description="A short lesson that explains the ideas in order, with examples and quick questions to check you've understood."
          action="Teach me"
          onStart={() => generate()}
        >
          <Segmented label="Your level" value={level} onChange={setLevel} options={LEVELS} />
        </ToolIntro>
      }
      render={() => {
        const d = saved.data;
        return (
          <article className="doc doc--lesson">
            <ResultBar onRegenerate={() => generate()}>
              <Segmented size="sm" label="Your level" value={level} onChange={(v) => generate(v)} options={LEVELS} />
            </ResultBar>

            <h2 className="doc__title">{d.title}</h2>
            {d.hook && <RichText as="p" className="lede" text={d.hook} />}

            {d.objectives.length > 0 && (
              <div className="objectives">
                <p className="objectives__label">By the end, you'll be able to</p>
                <ul>
                  {d.objectives.map((o) => (
                    <li key={o}>
                      <Icon name="check" size={16} />
                      <RichText text={o} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="lesson">
              {d.sections.map((s, i) => (
                <li key={s.heading} className="lesson__step">
                  <h3>
                    <span className="lesson__num">{i + 1}</span>
                    {s.heading}
                  </h3>
                  {s.paragraphs.map((p) => (
                    <RichText key={p} as="p" text={p} />
                  ))}
                  {s.example && (
                    <div className="example">
                      <p className="example__label">
                        <Icon name="bulb" size={16} /> Example
                      </p>
                      <RichText as="p" text={s.example} />
                    </div>
                  )}
                  {s.checkpoint && <Checkpoint cp={s.checkpoint} />}
                </li>
              ))}
            </ol>

            {d.takeaways.length > 0 && (
              <section className="takeaways">
                <h3>Remember this</h3>
                <ul className="points">
                  {d.takeaways.map((t) => (
                    <li key={t}>
                      <RichText text={t} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {d.nextTopics.length > 0 && (
              <section className="next">
                <h3>Learn next</h3>
                <div className="chips">
                  {d.nextTopics.map((t) => (
                    <button key={t} className="chip" onClick={() => onAsk(`Teach me about ${t}, building on this lesson.`)}>
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </article>
        );
      }}
    />
  );
}
