// "Failure lab": a dev/demo switch that replaces the real model call with a
// known-bad response, so every error path can be shown on demand instead of
// waiting for Gemini to misbehave. Off by default. Only affects the browser.

import { ApiError, wait } from './api.js';

export const SCENARIOS = [
  { id: 'off', label: 'Off (real AI)' },
  { id: 'malformed', label: 'Malformed JSON' },
  { id: 'wrong-shape', label: 'Wrong shape' },
  { id: 'empty', label: 'Empty answer' },
  { id: 'partial', label: 'Half the items broken' },
  { id: 'truncated', label: 'Cut off mid-answer' },
  { id: 'slow', label: 'Very slow (12s)' },
  { id: 'server-error', label: 'Server 503' },
  { id: 'rate-limit', label: 'Rate limited' },
];

const sampleQuiz = [
  { question: 'Which gas do plants absorb for photosynthesis?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'], answerIndex: 1, explanation: 'CO₂ is fixed into sugars in the Calvin cycle.' },
  { question: 'Where does photosynthesis mainly happen?', options: ['Mitochondria', 'Nucleus', 'Chloroplast', 'Ribosome'], answerIndex: 2 },
];
const sampleCards = [
  { front: 'Chlorophyll', back: 'Green pigment that absorbs red and blue light.' },
  { front: 'Stomata', back: 'Leaf pores that let CO₂ in and water vapour out.' },
];

/**
 * Returns a fake API response for the scenario, or null to use the real API.
 * `attempt` lets the lab fail only the first try, which shows the auto-retry
 * recovering. With `everyAttempt` it keeps failing so the final error is visible.
 */
export async function fakeResponse(scenario, { attempt, everyAttempt, signal }) {
  if (scenario === 'off') return null;
  if (attempt > 1 && !everyAttempt) return null;

  if (scenario === 'slow') {
    await wait(12_000, signal);
    return null; // then do the real call
  }

  await wait(700, signal);
  switch (scenario) {
    case 'malformed':
      return { text: 'Here are your cards!\n{"title": "Photosynthesis", "cards": [{front: Chlorophyll, back: "green"}]', finishReason: 'STOP' };
    case 'wrong-shape':
      return { text: JSON.stringify({ response: 'Photosynthesis is how plants make food.', confidence: 0.9 }), finishReason: 'STOP' };
    case 'empty':
      return { text: '   ', finishReason: 'STOP' };
    case 'partial':
      return {
        text: JSON.stringify({
          title: 'Photosynthesis (partly broken)',
          cards: [...sampleCards, { front: '', back: 'orphan back' }, { front: 'No back' }, 42],
          quiz: [...sampleQuiz, { question: 'Broken?', options: ['Only one'], answerIndex: 0 }, { question: 'Out of range', options: ['a', 'b', 'c', 'd'], answerIndex: 9 }],
        }),
        finishReason: 'STOP',
      };
    case 'truncated': {
      const full = JSON.stringify({ title: 'Photosynthesis (cut off)', cards: sampleCards, quiz: sampleQuiz });
      return { text: full.slice(0, Math.floor(full.length * 0.8)), finishReason: 'MAX_TOKENS' };
    }
    case 'server-error':
      throw new ApiError('upstream_error', 'Gemini had a temporary error.', { retryable: true, status: 503 });
    case 'rate-limit':
      throw new ApiError('rate_limited', 'Gemini rate limit hit. Wait a few seconds and retry.', { retryable: true, status: 429 });
    default:
      return null;
  }
}
