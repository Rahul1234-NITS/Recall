import { useCallback, useEffect, useState } from 'react';
import { loadSessions, newId, saveSessions } from '../lib/storage.js';

/**
 * A session = one generated deck + the learner's progress on it.
 * progress: { known: string[] (card ids), bestScore: number|null, attempts: number }
 */
export function useSessions() {
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(() => sessions[0]?.id ?? null);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const add = useCallback(({ deck, request }) => {
    const session = {
      id: newId(),
      createdAt: Date.now(),
      source: request.notes.slice(0, 160),
      request: { mode: request.mode, count: request.count, difficulty: request.difficulty },
      deck,
      progress: { known: [], bestScore: null, attempts: 0 },
    };
    setSessions((list) => [session, ...list]);
    setActiveId(session.id);
    return session.id;
  }, []);

  const updateProgress = useCallback((id, patch) => {
    setSessions((list) =>
      list.map((s) => (s.id === id ? { ...s, progress: { ...s.progress, ...(typeof patch === 'function' ? patch(s.progress) : patch) } } : s)),
    );
  }, []);

  const remove = useCallback((id) => {
    setSessions((list) => {
      const next = list.filter((s) => s.id !== id);
      setActiveId((current) => (current === id ? next[0]?.id ?? null : current));
      return next;
    });
  }, []);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  return { sessions, active, activeId, setActiveId, add, updateProgress, remove };
}
