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

const CLIENT_TIMEOUT_MS = 60_000;

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
      throw new ApiError('timeout', 'No answer after 60 seconds.', { retryable: true });
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
    invalid_output: "The AI's answer didn't make sense",
    empty_output: 'The AI sent back nothing',
    blocked: 'The AI declined this input',
    empty_input: 'Nothing to study yet',
    input_too_long: 'Those notes are too long',
    missing_key: 'Server not configured',
    bad_key: 'Server not configured',
    model_not_found: 'Server not configured',
  };
  return map[error?.code] || 'Something went wrong';
}
