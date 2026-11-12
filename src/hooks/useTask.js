import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, postJson, wait } from '../lib/api.js';
import { parseTask } from '../lib/normalize.js';
import { withScenario } from '../lib/failureLab.js';

const MAX_ATTEMPTS = 2;
const SLOW_AFTER_MS = 9_000;
const VERY_SLOW_AFTER_MS = 35_000;
// If an attempt already took this long, the server has been through its whole model fallback;
// retrying automatically would just double the wait, so let the user decide instead.
const NO_AUTO_RETRY_AFTER_MS = 40_000;

/** Diagnostics settings, provided once at the top of the app. */
export const LabContext = createContext({ scenario: 'off', everyAttempt: false, report: () => {} });

/**
 * One AI request at a time for one tool.
 *
 *   const t = useTask();
 *   const value = await t.run('summary', { material, options });   // null if cancelled/failed/stale
 *
 * - retries once on retryable errors and on unusable output
 * - every run gets an id; a newer run (or unmount) makes older ones stale, so a late
 *   response can never overwrite newer state, even if it already arrived and is being parsed
 */
export function useTask() {
  const [state, setState] = useState({ status: 'idle', attempt: 0, slow: false, verySlow: false, error: null, warnings: [] });
  const lab = useContext(LabContext);
  const labRef = useRef(lab);
  labRef.current = lab;
  const runId = useRef(0);
  const controller = useRef(null);
  const last = useRef(null);

  useEffect(
    () => () => {
      controller.current?.abort();
      runId.current++;
    },
    [],
  );

  const run = useCallback(async (task, body = {}, { context } = {}) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++runId.current;
    const current = () => id === runId.current;
    last.current = { task, body, context };

    setState({ status: 'loading', attempt: 1, slow: false, verySlow: false, error: null, warnings: [], incomplete: false });
    const slowTimer = setTimeout(() => current() && setState((s) => ({ ...s, slow: true })), SLOW_AFTER_MS);
    const verySlowTimer = setTimeout(() => current() && setState((s) => ({ ...s, verySlow: true })), VERY_SLOW_AFTER_MS);

    let lastError = null;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          setState((s) => ({ ...s, attempt, slow: false }));
          await wait(['rate_limited', 'overloaded'].includes(lastError?.code) ? 3000 : 600, ctrl.signal);
        }
        const attemptStart = Date.now();
        try {
          const { scenario, everyAttempt } = labRef.current;
          const data = await withScenario(scenario, { attempt, everyAttempt, signal: ctrl.signal }, () =>
            postJson('/api/study', { task, ...body }, { signal: ctrl.signal }),
          );
          const parsed = parseTask(task, data?.text, { finishReason: data?.finishReason, context, model: data?.model });
          if (!current()) return null;
          if (parsed.ok) {
            setState({ status: 'success', attempt, slow: false, error: null, warnings: parsed.warnings, incomplete: !!parsed.incomplete });
            // Technical clean-ups go to the Diagnostics log, not in front of the student.
            if (parsed.warnings.length || parsed.incomplete || attempt > 1) {
              labRef.current.report?.({ task, model: data?.model, attempt, incomplete: !!parsed.incomplete, warnings: parsed.warnings });
            }
            return parsed.value;
          }
          lastError = new ApiError('invalid_output', parsed.reason, { retryable: true, raw: data?.text });
          labRef.current.report?.({ task, model: data?.model, attempt, failed: parsed.reason });
        } catch (err) {
          if (err?.code === 'aborted') return null;
          lastError = err instanceof ApiError ? err : new ApiError('unknown', String(err?.message || err));
          if (!lastError.retryable) break;
        }
        if (Date.now() - attemptStart > NO_AUTO_RETRY_AFTER_MS) break;
      }
      if (current()) setState({ status: 'error', attempt: MAX_ATTEMPTS, slow: false, error: lastError, warnings: [] });
      return null;
    } catch (err) {
      if (err?.code !== 'aborted' && current()) setState({ status: 'error', attempt: 1, slow: false, error: err, warnings: [] });
      return null;
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(verySlowTimer);
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    runId.current++;
    setState({ status: 'idle', attempt: 0, slow: false, verySlow: false, error: null, warnings: [] });
  }, []);

  const dismissWarnings = useCallback(() => setState((s) => ({ ...s, warnings: [] })), []);

  /** Re-runs the last request. Returns the same promise shape as run(). */
  const retry = useCallback(() => {
    const l = last.current;
    return l ? run(l.task, l.body, { context: l.context }) : Promise.resolve(null);
  }, [run]);

  return { ...state, run, cancel, retry, dismissWarnings, maxAttempts: MAX_ATTEMPTS, busy: state.status === 'loading' };
}
