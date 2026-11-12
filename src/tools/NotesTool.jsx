import { useTask } from '../hooks/useTask.js';
import { useAutoRun } from '../hooks/useAutoRun.js';
import { ResultBar, ToolFrame, ToolIntro } from '../components/States.jsx';
import { RichText, plain } from '../components/RichText.jsx';
import { copyText, downloadText, slug, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

function toMarkdown(d) {
  const out = [`# ${d.title}`];
  for (const s of d.sections) out.push(`\n## ${s.heading}`, ...s.bullets.map((b) => `- ${b}`));
  if (d.formulas.length) out.push('\n## Formulas', ...d.formulas.map((f) => `- **${f.name || 'Formula'}**: \`${f.expression}\`${f.note ? ` (${f.note})` : ''}`));
  if (d.mnemonics.length) out.push('\n## Memory tricks', ...d.mnemonics.map((m) => `- ${m}`));
  if (d.pitfalls.length) out.push('\n## Watch out for', ...d.pitfalls.map((p) => `- ${p}`));
  return out.join('\n') + '\n';
}

export function NotesTool({ space, source, save, autoRun }) {
  const task = useTask();
  const toast = useToast();
  const saved = space.notes;

  async function generate() {
    const data = await task.run('notes', { ...source });
    if (data) save({ notes: { data } });
  }
  useAutoRun(autoRun && !saved, generate);

  return (
    <ToolFrame
      task={task}
      hasData={!!saved}
      onRetry={generate}
      loadingLabel="Condensing everything into revision notes."
      intro={
        <ToolIntro
          icon="notes"
          title="Make short notes"
          description="One page of revision notes: the essentials as quick bullets, every formula in one place, memory tricks and the mistakes examiners look for. Download or print them."
          action="Make short notes"
          onStart={generate}
        />
      }
      render={() => {
        const d = saved.data;
        return (
          <article className="doc doc--notes">
            <ResultBar onRegenerate={generate}>
              <button className="btn btn--quiet btn--sm" onClick={() => { downloadText(`${slug(d.title)}-notes.md`, toMarkdown(d)); toast('Notes downloaded'); }}>
                <Icon name="download" size={16} /> Download
              </button>
              <button className="btn btn--quiet btn--sm" onClick={() => window.print()}>
                <Icon name="print" size={16} /> Print
              </button>
              <button className="btn btn--quiet btn--sm" onClick={async () => toast((await copyText(plain(toMarkdown(d)))) ? 'Notes copied' : 'Copy failed')}>
                <Icon name="copy" size={16} /> Copy
              </button>
            </ResultBar>

            <div className="sheet">
              <h2 className="sheet__title">{d.title}</h2>
              <div className="sheet__cols">
                {d.sections.map((s) => (
                  <section key={s.heading} className="sheet__block">
                    <h3>{s.heading}</h3>
                    <ul>
                      {s.bullets.map((b) => (
                        <li key={b}>
                          <RichText text={b} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              {d.formulas.length > 0 && (
                <section className="formulas">
                  <h3>Formulas</h3>
                  <table>
                    <tbody>
                      {d.formulas.map((f) => (
                        <tr key={f.expression}>
                          <th scope="row">{f.name}</th>
                          <td>
                            <code className="formula">{f.expression}</code>
                            {f.note && <span className="formula__note">{f.note}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <div className="sheet__extras">
                {d.mnemonics.length > 0 && (
                  <section className="callout callout--tip">
                    <h3>
                      <Icon name="bulb" size={16} /> Memory tricks
                    </h3>
                    <ul>
                      {d.mnemonics.map((m) => (
                        <li key={m}>
                          <RichText text={m} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {d.pitfalls.length > 0 && (
                  <section className="callout callout--warn">
                    <h3>
                      <Icon name="alert" size={16} /> Watch out for
                    </h3>
                    <ul>
                      {d.pitfalls.map((p) => (
                        <li key={p}>
                          <RichText text={p} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          </article>
        );
      }}
    />
  );
}
