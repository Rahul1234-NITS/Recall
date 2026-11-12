// Study spaces in localStorage.
// Storage is untrusted input too: it may be missing, full, hand-edited or from an older version.

const KEY = 'recall.spaces.v2';
const OLD_KEY = 'recall.sessions.v1';
const MAX_SPACES = 25;
export const MAX_MATERIAL = 60_000;

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const isSpace = (s) => s && typeof s.id === 'string' && typeof s.title === 'string' && Array.isArray(s.sources);

export function loadSpaces() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter(isSpace).map(withDefaults) : [];
    }
    return migrateV1();
  } catch {
    return [];
  }
}

/** Returns false when the browser refused (quota full, private mode). */
export function saveSpaces(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SPACES)));
    return true;
  } catch {
    return false;
  }
}

function withDefaults(s) {
  return {
    topic: '',
    summary: null,
    lesson: null,
    notes: null,
    cards: null,
    quiz: null,
    subjective: null,
    ask: { turns: [] },
    ...s,
  };
}

/** Version 1 saved flashcard/quiz "sessions". Turn each into a space so nothing is lost. */
function migrateV1() {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? '[]');
    if (!Array.isArray(old) || !old.length) return [];
    return old
      .filter((s) => s?.deck && typeof s.deck.title === 'string')
      .map((s) =>
        withDefaults({
          id: s.id ?? newId(),
          createdAt: s.createdAt ?? Date.now(),
          updatedAt: s.createdAt ?? Date.now(),
          title: s.deck.title,
          topic: (s.source ?? s.deck.title).slice(0, 200),
          sources: [],
          cards: s.deck.cards?.length ? { data: { title: s.deck.title, cards: s.deck.cards }, known: s.progress?.known ?? [] } : null,
          quiz: s.deck.quiz?.length ? { data: { title: s.deck.title, quiz: s.deck.quiz }, bestScore: s.progress?.bestScore ?? null } : null,
        }),
      );
  } catch {
    return [];
  }
}

/**
 * What the AI gets: all sources joined, each labelled with its name.
 * Capped at MAX_MATERIAL; the cap is enforced when the space is created.
 */
export function materialOf(space) {
  return space.sources
    .map((s) => (space.sources.length > 1 ? `## ${s.name}\n${s.text}` : s.text))
    .join('\n\n')
    .slice(0, MAX_MATERIAL);
}

export function makeSpace({ sources, topic }) {
  const firstLine = sources[0]?.text.split('\n').find((l) => l.trim())?.trim() ?? '';
  const firstFile = sources.find((s) => s.kind === 'file');
  // A placeholder until the first summary or lesson arrives; then the AI's title replaces it (titleAuto).
  const title = topic || (firstFile ? stripExt(firstFile.name.split('/').pop()) : '') || firstLine.slice(0, 60) || 'Untitled';
  const now = Date.now();
  return withDefaults({ id: newId(), createdAt: now, updatedAt: now, title, titleAuto: !topic, topic, sources });
}

const stripExt = (name) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
