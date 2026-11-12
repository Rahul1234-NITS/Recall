// Network layer. Everything that can go wrong between the browser and our
// /api function becomes an ApiError with a `code` the UI knows how to describe.

export class ApiError extends Error {
  constructor(code, message, { retryable = false, status, raw } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.raw = raw; // model output we couldn't use, shown in "details"
  }
}

// A bit longer than the server's own budget (170s), so the server's clearer error arrives first.
const CLIENT_TIMEOUT_MS = 190_000;

/**
 * POST JSON with a hard timeout. `signal` is the caller's cancel signal
 * (a newer request, or the Cancel button). We keep the two causes apart
 * so a user cancel is never reported as an error.
 */
export async function postJson(url, payload, { signal, timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const onCancel = () => timeout.abort();
  signal?.addEventListener('abort', onCancel, { once: true });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });

    const body = await res.text();
    let data = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      // A proxy/HTML error page rather than our API. Fall through.
    }

    if (!res.ok) {
      const e = data?.error;
      throw new ApiError(e?.code || `http_${res.status}`, e?.message || `Server error (${res.status}).`, {
        retryable: e?.retryable ?? res.status >= 500,
        status: res.status,
      });
    }
    if (!data) throw new ApiError('bad_response', 'The server sent something that was not JSON.', { retryable: true });
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (signal?.aborted) throw new ApiError('aborted', 'Cancelled.');
    if (timeout.signal.aborted) {
      throw new ApiError('timeout', 'No answer after 3 minutes. Gemini may be overloaded; try again in a minute.', { retryable: true });
    }
    throw new ApiError('network', 'Could not reach the server. Check your connection.', { retryable: true });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}

/** Resolves after `ms`, or rejects early if `signal` aborts. */
export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError('aborted', 'Cancelled.'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new ApiError('aborted', 'Cancelled.'));
      },
      { once: true },
    );
  });
}

export function describeError(error) {
  const map = {
    timeout: 'That took too long',
    upstream_timeout: 'That took too long',
    network: 'You seem to be offline',
    rate_limited: 'Too many requests',
    overloaded: 'Gemini is busy right now',
    invalid_output: "The AI's answer didn't make sense",
    empty_output: 'The AI sent back nothing',
    blocked: 'The AI declined this material',
    empty_input: 'Nothing to work with yet',
    input_too_long: 'Too much text',
    unsupported_file: "This file type can't be read",
    file_too_large: 'File too large',
    upstream_rejected: 'Gemini rejected the request',
    missing_key: 'Server not configured',
    bad_key: 'Server not configured',
    model_not_found: 'Server not configured',
  };
  return map[error?.code] || 'Something went wrong';
}

/** Errors where pressing "Try again" can't help. */
export const FATAL_CODES = ['empty_input', 'input_too_long', 'unsupported_file', 'file_too_large', 'missing_key', 'bad_key', 'model_not_found', 'blocked'];
