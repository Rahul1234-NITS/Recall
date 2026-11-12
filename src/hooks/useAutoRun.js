import { useEffect, useRef } from 'react';

/** Runs `fn` once on mount when `when` is true (used to start the first tool of a new space). */
export function useAutoRun(when, fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (when) ref.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
