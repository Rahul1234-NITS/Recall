// Diagnostics: fake a misbehaving AI on purpose, so every error path can be shown
// on demand instead of waiting for Gemini to fail. Off by default, browser-only.
// Works for every tool because the scenarios corrupt the response, not the content.

import { ApiError, wait } from './api.js';

export const SCENARIOS = [
  { id: 'off', label: 'Off (real AI)' },
  { id: 'malformed', label: 'Malformed JSON' },
  { id: 'wrong-shape', label: 'Wrong JSON shape' },
  { id: 'empty', label: 'Empty answer' },
  { id: 'truncated', label: 'Answer cut off' },
  { id: 'slow', label: 'Very slow (12s)' },
  { id: 'overloaded', label: 'Gemini overloaded (503)' },
  { id: 'offline', label: 'Network down' },
];

/**
 * Runs `real()` (the actual API call) or a corrupted version of it.
 * Only the first attempt is affected unless `everyAttempt`, so the auto-retry can be seen working.
 */
export async function withScenario(scenario, { attempt, everyAttempt, signal }, real) {
  if (scenario === 'off' || (attempt > 1 && !everyAttempt)) return real();

  switch (scenario) {
    case 'slow':
      await wait(12_000, signal);
      return real();
    case 'truncated': {
      const data = await real();
      const text = String(data?.text ?? '');
      return { ...data, text: text.slice(0, Math.floor(text.length * 0.6)), finishReason: 'MAX_TOKENS' };
    }
    case 'overloaded':
      await wait(600, signal);
      throw new ApiError('overloaded', 'Gemini is overloaded right now (simulated). Wait about 30 seconds and try again.', { retryable: true, status: 503 });
    case 'offline':
      await wait(300, signal);
      throw new ApiError('network', 'Could not reach the server. Check your connection.', { retryable: true });
    default:
      await wait(700, signal);
      return {
        malformed: { text: 'Sure! Here you go:\n{"title": "Notes", sections: [{heading: Intro, "bullets": ["a"]}', finishReason: 'STOP' },
        'wrong-shape': { text: JSON.stringify({ response: 'Here is a summary of your notes.', confidence: 0.9 }), finishReason: 'STOP' },
        empty: { text: '   ', finishReason: 'STOP' },
      }[scenario] ?? real();
  }
}
