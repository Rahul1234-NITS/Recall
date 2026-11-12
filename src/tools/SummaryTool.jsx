import { useState } from 'react';
import { useTask } from '../hooks/useTask.js';
import { useAutoRun } from '../hooks/useAutoRun.js';
import { ResultBar, ToolFrame, ToolIntro } from '../components/States.jsx';
import { RichText, plain } from '../components/RichText.jsx';
import { Segmented, copyText, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const LENGTHS = [
  { value: 'brief', label: 'Brief' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
];

export function SummaryTool({ space, source, save, autoRun }) {
  const task = useTask();
  const toast = useToast();
  const saved = space.summary;
  const [length, setLength] = useState(saved?.length ?? 'standard');

  async function generate(len = length) {
    setLength(len);
    const data = await task.run('summary', { ...source, options: { length: len } });
    if (data) save((s) => ({ ...(s.titleAuto ? { title: data.title, titleAuto: false } : {}), summary: { length: len, data } }));
  }
  useAutoRun(autoRun && !saved, generate);

  async function copy() {
    const d = saved.data;
    const md = [
      `# ${d.title}`,
      d.tldr && `\n${plain(d.tldr)}`,
      `\n## Key points\n${d.keyPoints.map((p) => `- ${plain(p)}`).join('\n')}`,
      ...d.sections.map((s) => `\n## ${s.heading}\n${s.points.map((p) => `- ${plain(p)}`).join('\n')}`),
      d.keyTerms.length && `\n## Key terms\n${d.keyTerms.map((t) => `- **${t.term}**: ${plain(t.definition)}`).join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n');
    toast((await copyText(md)) ? 'Summary copied' : 'Copy failed. Your browser blocked the clipboard.');
  }

  return (
    <ToolFrame
      task={task}
      hasData={!!saved}
      onRetry={() => generate()}
      loadingLabel="Reading your material and writing the summary."
      intro={
        <ToolIntro
          icon="summary"
          title={source.material ? 'Summarise your material' : `Summarise ${space.topic}`}
          description="Get the main idea in two sentences, the points worth remembering, and a glossary of key terms."
          action="Write summary"
          onStart={() => generate()}
        >
          <Segmented label="Summary length" value={length} onChange={setLength} options={LENGTHS} />
        </ToolIntro>
      }
      render={() => {
        const d = saved.data;
        return (
          <article className="doc doc--summary">
            <ResultBar onRegenerate={() => generate()}>
              <Segmented size="sm" label="Summary length" value={length} onChange={(v) => generate(v)} options={LENGTHS} />
              <button className="btn btn--quiet btn--sm" onClick={copy}>
                <Icon name="copy" size={16} /> Copy
              </button>
            </ResultBar>

            <h2 className="doc__title">{d.title}</h2>
            {d.tldr && <RichText as="p" className="lede" text={d.tldr} />}

            <div className="summary-grid">
              <div>
                <h3>Key points</h3>
                <ul className="points">
                  {d.keyPoints.map((p) => (
                    <li key={p}>
                      <RichText text={p} />
                    </li>
                  ))}
                </ul>
                {d.sections.map((s) => (
                  <section key={s.heading}>
                    <h3>{s.heading}</h3>
                    <ul className="points">
                      {s.points.map((p) => (
                        <li key={p}>
                          <RichText text={p} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              {d.keyTerms.length > 0 && (
                <aside className="glossary" aria-label="Key terms">
                  <h3>Key terms</h3>
                  <dl>
                    {d.keyTerms.map((t) => (
                      <div key={t.term}>
                        <dt>{t.term}</dt>
                        <dd>
                          <RichText text={t.definition} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </aside>
              )}
            </div>
          </article>
        );
      }}
    />
  );
}
