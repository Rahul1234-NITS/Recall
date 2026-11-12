import { useEffect, useRef } from 'react';

/**
 * Global keyboard shortcuts, ignored while the user is typing in a field.
 * `map` is { 'ArrowLeft': fn, ' ': fn, '1': fn, ... }. Always uses the latest map.
 */
export function useKeys(map, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return undefined;
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const fn = ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
