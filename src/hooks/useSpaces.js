import { useCallback, useEffect, useState } from 'react';
import { loadSpaces, saveSpaces } from '../lib/storage.js';

/**
 * All study spaces + which one is open. Every change is written to localStorage.
 * `storageFull` turns true if the browser refuses to save (quota), so the UI can say so.
 */
export function useSpaces() {
  const [spaces, setSpaces] = useState(loadSpaces);
  const [activeId, setActiveId] = useState(() => spaces[0]?.id ?? null);
  const [storageFull, setStorageFull] = useState(false);

  useEffect(() => {
    setStorageFull(!saveSpaces(spaces));
  }, [spaces]);

  const add = useCallback((space) => {
    setSpaces((list) => [space, ...list]);
    setActiveId(space.id);
  }, []);

  /** patch: object of fields, or (space) => fields */
  const update = useCallback((id, patch) => {
    setSpaces((list) =>
      list.map((s) => (s.id === id ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch), updatedAt: Date.now() } : s)),
    );
  }, []);

  const remove = useCallback((id) => {
    setSpaces((list) => list.filter((s) => s.id !== id));
    setActiveId((current) => (current === id ? null : current));
  }, []);

  const active = spaces.find((s) => s.id === activeId) ?? null;
  return { spaces, active, activeId, open: setActiveId, add, update, remove, storageFull };
}
