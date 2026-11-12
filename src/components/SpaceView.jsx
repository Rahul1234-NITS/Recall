import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon.jsx';
import { Drawer } from './ui.jsx';
import { materialOf } from '../lib/storage.js';
import { SummaryTool } from '../tools/SummaryTool.jsx';
import { LessonTool } from '../tools/LessonTool.jsx';
import { NotesTool } from '../tools/NotesTool.jsx';
import { CardsTool } from '../tools/CardsTool.jsx';
import { TestTool } from '../tools/TestTool.jsx';
import { AskTool } from '../tools/AskTool.jsx';

const TABS = [
  { id: 'summary', label: 'Summary', icon: 'summary', has: (s) => !!s.summary },
  { id: 'lesson', label: 'Learn', icon: 'learn', has: (s) => !!s.lesson },
  { id: 'notes', label: 'Short notes', icon: 'notes', has: (s) => !!s.notes },
  { id: 'cards', label: 'Flashcards', icon: 'cards', has: (s) => !!s.cards },
  { id: 'test', label: 'Test', icon: 'test', has: (s) => !!(s.quiz || s.subjective) },
  { id: 'ask', label: 'Ask', icon: 'ask', has: (s) => (s.ask?.turns?.length ?? 0) > 0 },
];

export function SpaceView({ space, update }) {
  const [tab, setTab] = useState(() => space.autoStart ?? (space.summary ? 'summary' : space.lesson ? 'lesson' : space.sources.length ? 'summary' : 'lesson'));
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  // The tool that should start by itself (only right after the space is created).
  const [autoTool] = useState(space.autoStart ?? null);

  const source = useMemo(() => ({ material: materialOf(space), topic: space.topic }), [space.sources, space.topic]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useCallback((patch) => update(space.id, patch), [update, space.id]);

  useEffect(() => {
    if (space.autoStart) update(space.id, { autoStart: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onAsk = useCallback((q) => {
    setPendingQuestion(q);
    setTab('ask');
  }, []);

  const chars = source.material.length;
  const common = { space, source, save };

  return (
    <div className="space">
      <header className="space__head">
        <h1 className="space__title">{space.title}</h1>
        <button className="space__sources" onClick={() => setSourcesOpen(true)}>
          <Icon name={space.sources.length ? 'file' : 'book'} size={16} />
          {space.sources.length
            ? `${space.sources.length} source${space.sources.length > 1 ? 's' : ''}, ${chars.toLocaleString()} characters`
            : 'Topic only, taught from general knowledge'}
        </button>
      </header>

      <nav className="tabs" aria-label="Study tools">
        <div className="tabs__track" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={`tab ${tab === t.id ? 'is-on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={17} />
              <span className="tab__label">{t.label}</span>
              {t.has(space) && <span className="tab__dot" title="Already made" />}
            </button>
          ))}
        </div>
      </nav>

      {/* All panels stay mounted (hidden) so a running request or a half-done test survives a tab switch. */}
      <div className="panels">
        <section role="tabpanel" id="panel-summary" aria-labelledby="tab-summary" hidden={tab !== 'summary'}>
          <SummaryTool {...common} autoRun={autoTool === 'summary'} />
        </section>
        <section role="tabpanel" id="panel-lesson" aria-labelledby="tab-lesson" hidden={tab !== 'lesson'}>
          <LessonTool {...common} autoRun={autoTool === 'lesson'} onAsk={onAsk} />
        </section>
        <section role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== 'notes'}>
          <NotesTool {...common} />
        </section>
        <section role="tabpanel" id="panel-cards" aria-labelledby="tab-cards" hidden={tab !== 'cards'}>
          <CardsTool {...common} active={tab === 'cards'} />
        </section>
        <section role="tabpanel" id="panel-test" aria-labelledby="tab-test" hidden={tab !== 'test'}>
          <TestTool {...common} active={tab === 'test'} />
        </section>
        <section role="tabpanel" id="panel-ask" aria-labelledby="tab-ask" hidden={tab !== 'ask'}>
          <AskTool {...common} active={tab === 'ask'} pending={pendingQuestion} onPendingUsed={() => setPendingQuestion(null)} />
        </section>
      </div>

      <Drawer open={sourcesOpen} onClose={() => setSourcesOpen(false)} title="Sources" wide>
        {space.sources.length === 0 ? (
          <p className="muted">
            This space is just a topic: <b>{space.topic}</b>. Everything is generated from general knowledge.
          </p>
        ) : (
          <ul className="sources">
            {space.sources.map((s) => (
              <li key={s.id}>
                <details>
                  <summary>
                    <Icon name={s.kind === 'paste' ? 'type' : 'file'} size={16} />
                    <span className="sources__name">{s.name}</span>
                    <span className="muted">{s.chars.toLocaleString()} chars</span>
                  </summary>
                  <pre className="sources__preview">{s.text.slice(0, 3000)}{s.text.length > 3000 ? '\n…' : ''}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}
