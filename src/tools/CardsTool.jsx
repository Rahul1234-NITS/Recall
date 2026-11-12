import { useState } from 'react';
import { useTask } from '../hooks/useTask.js';
import { ResultBar, ToolFrame, ToolIntro } from '../components/States.jsx';
import { Segmented } from '../components/ui.jsx';
import { Flashcards } from '../components/Flashcards.jsx';

export const COUNTS = [5, 8, 10, 15].map((n) => ({ value: n, label: String(n) }));
export const DIFFICULTY = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export function CardsTool({ space, source, save, active }) {
  const task = useTask();
  const saved = space.cards;
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');

  async function generate() {
    const data = await task.run('cards', { ...source, options: { count, difficulty } });
    if (data) save({ cards: { data, known: [], at: Date.now() } });
  }

  return (
    <ToolFrame
      task={task}
      hasData={!!saved}
      onRetry={generate}
      loadingLabel="Writing flashcards."
      intro={
        <ToolIntro
          icon="cards"
          title="Drill with flashcards"
          description="Flip each card, then sort it into “got it” or “still learning”. Your progress is saved, so you can come back to only the cards you missed."
          action="Make flashcards"
          onStart={generate}
        >
          <label className="field">
            <span>Cards</span>
            <Segmented size="sm" label="Number of cards" value={count} onChange={setCount} options={COUNTS} />
          </label>
          <label className="field">
            <span>Difficulty</span>
            <Segmented size="sm" label="Difficulty" value={difficulty} onChange={setDifficulty} options={DIFFICULTY} />
          </label>
        </ToolIntro>
      }
      render={() => (
        <div className="doc">
          <ResultBar onRegenerate={generate} regenerateLabel="New cards" />
          <Flashcards
            key={saved.at ?? 'cards'}
            cards={saved.data.cards}
            known={saved.known}
            active={active}
            onKnownChange={(known) => save((s) => ({ cards: { ...s.cards, known } }))}
          />
        </div>
      )}
    />
  );
}
