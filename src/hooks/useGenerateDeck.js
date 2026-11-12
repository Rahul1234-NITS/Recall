import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError, postJson, wait } from '../lib/api.js';
import { parseDeck } from '../lib/parse.js';
import { fakeResponse } from '../lib/failureLab.js';

const MAX_ATTEMPTS = 2;
const SLOW_AFTER_MS = 8_000;

const initial = { status: 'idle', attempt: 0, slow: false, error: null, result: null, lastRequest: null };

function reducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...state, status: 'loading', attempt: 1, slow: false, error: null, lastRequest: action.request };
    case 'retry':
      return { ...state, attempt: action.attempt, slow: false };
    case 'slow':
      return { ...state, slow: true };
    case 'success':
      return { ...state, status: 'success', result: action.result, error: null };
    case 'error':
      return { ...state, status: 'error', error: action.error };
    case 'dismiss':
    case 'cancel':
      // Go back to whatever was on screen before (a previous deck, or nothing).
      return { ...state, status: state.result ? 'success' : 'idle', slow: false };
    default:
      return state;
  }
}

/**
 * Owns one "generate a study set" request at a time.
 *
 * Stale responses: every call gets an id. Starting a new call aborts the old
 * fetch AND bumps the id, so even a response that already arrived (and is
 * being parsed) can't dispatch over the newer one. Aborting alone is not
 * enough because the old promise may already have resolved.
 */
export function useGenerateDeck({ scenario = 'off', everyAttempt = false } = {}) {
  const [state, dispatch] = useReducer(reducer, initial);
  const currentId = useRef(0);
  const controller = useRef(null);

  // Read the lab settings through a ref so `generate` keeps a stable identity.
  const lab = useRef({ scenario, everyAttempt });
  lab.current = { scenario, everyAttempt };

  useEffect(() => () => controller.current?.abort(), []);

  const generate = useCallback(async (request) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++currentId.current;
    const isCurrent = () => id === currentId.current;

    dispatch({ type: 'start', request });
    const slowTimer = setTimeout(() => isCurrent() && dispatch({ type: 'slow' }), SLOW_AFTER_MS);

    let lastError = null;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          if (!isCurrent()) return;
          dispatch({ type: 'retry', attempt });
          // Back off a little longer when the server told us to slow down.
          await wait(lastError?.code === 'rate_limited' ? 2500 : 600, ctrl.signal);
        }

        try {
          const data =
            (await fakeResponse(lab.current.scenario, { attempt, everyAttempt: lab.current.everyAttempt, signal: ctrl.signal })) ??
            (await postJson('/api/generate', request, { signal: ctrl.signal }));

          const parsed = parseDeck(data?.text, { mode: request.mode, finishReason: data?.finishReason });
          if (!isCurrent()) return;

          if (parsed.ok) {
            dispatch({ type: 'success', result: { deck: parsed.deck, warnings: parsed.warnings, request } });
            return;
          }
          // Bad output is usually random, so a second try often works.
          lastError = new ApiError('invalid_output', parsed.reason, { retryable: true, raw: data?.text });
        } catch (err) {
          if (err?.code === 'aborted') return;
          lastError = err instanceof ApiError ? err : new ApiError('unknown', String(err?.message || err));
          if (!lastError.retryable) break;
        }
      }
      if (isCurrent()) dispatch({ type: 'error', error: lastError });
    } catch (err) {
      // Only reachable via an aborted backoff wait.
      if (err?.code !== 'aborted' && isCurrent()) dispatch({ type: 'error', error: err });
    } finally {
      clearTimeout(slowTimer);
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    currentId.current++;
    dispatch({ type: 'cancel' });
  }, []);

  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), []);

  const retry = useCallback(() => {
    if (state.lastRequest) generate(state.lastRequest);
  }, [generate, state.lastRequest]);

  return { ...state, generate, cancel, retry, dismiss, maxAttempts: MAX_ATTEMPTS };
}
