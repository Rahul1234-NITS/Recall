// Turning model text into a deck we can trust.
//
// Two steps, kept separate on purpose:
//   1. extractJson(text)          text  -> unknown JSON value (or a reason it failed)
//   2. normalizeDeck(value, opts) value -> a clean Deck, plus warnings for anything dropped
//
// Philosophy: be strict about what reaches the UI, but salvage what we can.
// One bad quiz question should not throw away nine good ones.

const LIMITS = { title: 80, front: 300, back: 600, hint: 200, question: 400, option: 200, explanation: 600, items: 30 };

/* ------------------------------------------------------------------ */
/* 1. Text -> JSON                                                     */
/* ------------------------------------------------------------------ */

export function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, reason: 'The model returned nothing.' };
  }

  let s = text.trim();

  // ```json ... ``` fences (models add these even when told not to)
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const attempts = [];
  attempts.push(s);

  // Prose around the JSON: "Sure! Here it is: {...} Hope this helps"
  const first = s.search(/[[{]/);
  if (first > 0) s = s.slice(first);
  const lastClose = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastClose !== -1) attempts.push(s.slice(0, lastClose + 1));

  // Trailing commas: {"a": 1,} / [1, 2,]
  attempts.push(...attempts.map(stripTrailingCommas));

  for (const candidate of attempts) {
    try {
      return { ok: true, value: JSON.parse(candidate), repaired: candidate !== text.trim() };
    } catch {
      // try the next one
    }
  }

  // Last resort: the answer was cut off mid-way. Close what was opened.
  const closed = closeTruncatedJson(s);
  if (closed) {
    try {
      return { ok: true, value: JSON.parse(closed), repaired: true, truncated: true };
    } catch {
      // fall through
    }
  }

  return { ok: false, reason: 'The model answer was not valid JSON.' };
}

/**
 * Every plausible JSON value in the text, best first:
 *   1. the normal extraction (whole answer, fences/prose removed)
 *   2. every complete {...} object found anywhere, longest first. This catches answers where the
 *      model broke off, apologised, and started a fresh object ("…StudyI apologize… { … }").
 *   3. the first object with its brackets closed, if the answer was cut off.
 * The caller tries them in order and keeps the first one that passes validation, so a small
 * inner object (one flashcard) can never win over the real answer.
 */
export function jsonCandidates(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const out = [];
  const main = extractJson(text);
  if (main.ok && !main.truncated) out.push({ value: main.value, truncated: false });

  const objects = [];
  let starts = 0;
  for (let i = 0; i < text.length && starts < 80; i++) {
    if (text[i] !== '{') continue;
    starts++;
    const end = matchingBrace(text, i);
    if (end !== -1) objects.push(text.slice(i, end + 1));
  }
  objects.sort((a, b) => b.length - a.length);
  for (const o of objects) {
    for (const src of [o, stripTrailingCommas(o)]) {
      try {
        out.push({ value: JSON.parse(src), truncated: false });
        break;
      } catch {
        // not valid on its own
      }
    }
  }

  if (main.ok && main.truncated) out.push({ value: main.value, truncated: true });
  return out;
}

/** Index of the "}" that closes the "{" at `start`, ignoring braces inside strings; -1 if never closed. */
function matchingBrace(s, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

function stripTrailingCommas(s) {
  return s.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Repairs JSON that stops part-way, e.g. `{"cards":[{"front":"A","back":"B"},{"front":"C`.
 * We remember every comma seen outside a string (everything before it is complete),
 * cut back to the last one, then close the brackets still open at that point.
 * Returns null if there is nothing sensible to keep.
 */
export function closeTruncatedJson(input) {
  const s = input.trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return null;

  const stack = [];
  let inString = false;
  let escaped = false;
  let lastCut = null; // { index, stack }

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 0) return s.slice(0, i + 1); // actually complete
      lastCut = { index: i + 1, stack: [...stack] };
    } else if (ch === ',') {
      lastCut = { index: i, stack: [...stack] };
    }
  }

  if (!lastCut) return null;
  return s.slice(0, lastCut.index) + lastCut.stack.reverse().join('');
}

/* ------------------------------------------------------------------ */
/* 2. JSON -> Deck                                                     */
/* ------------------------------------------------------------------ */

/**
 * @param {unknown} value parsed JSON
 * @param {{ mode: 'cards'|'quiz'|'both' }} opts what the user asked for
 * @returns {{ ok: true, deck: object, warnings: string[] } | { ok: false, reason: string }}
 */
export function normalizeDeck(value, { mode = 'both' } = {}) {
  const warnings = [];
  const root = coerceRoot(value, warnings);
  if (!root) return { ok: false, reason: 'The model answer had the wrong shape (expected an object with cards or quiz).' };

  const wantCards = mode !== 'quiz';
  const wantQuiz = mode !== 'cards';

  const cards = wantCards ? normalizeCards(pick(root, ['cards', 'flashcards', 'flashCards']), warnings) : [];
  const quiz = wantQuiz ? normalizeQuiz(pick(root, ['quiz', 'questions', 'mcqs']), warnings) : [];

  if (wantCards && wantQuiz && !cards.length && !quiz.length) {
    return { ok: false, reason: 'The model answer contained no usable flashcards or questions.' };
  }
  if (mode === 'cards' && !cards.length) return { ok: false, reason: 'The model answer contained no usable flashcards.' };
  if (mode === 'quiz' && !quiz.length) return { ok: false, reason: 'The model answer contained no usable quiz questions.' };
  if (mode === 'both' && !cards.length) warnings.push('No usable flashcards came back, so only the quiz is shown.');
  if (mode === 'both' && !quiz.length) warnings.push('No usable quiz questions came back, so only flashcards are shown.');

  const title = cleanText(root.title ?? root.topic ?? root.name, LIMITS.title) || 'Untitled set';

  return { ok: true, deck: { title, cards, quiz }, warnings };
}

function coerceRoot(value, warnings) {
  if (Array.isArray(value)) {
    // A bare array. Work out whether it's cards or questions.
    if (value.some((v) => v && typeof v === 'object' && ('options' in v || 'choices' in v))) {
      warnings.push('The model returned a bare list; treated it as quiz questions.');
      return { quiz: value };
    }
    warnings.push('The model returned a bare list; treated it as flashcards.');
    return { cards: value };
  }
  if (!value || typeof value !== 'object') return null;

  // Sometimes the payload is wrapped: { "data": {...} } / { "result": {...} }
  for (const key of ['data', 'result', 'deck', 'output']) {
    const inner = value[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner) && !('cards' in value) && !('quiz' in value)) {
      return inner;
    }
  }
  return value;
}

function pick(obj, keys) {
  for (const k of keys) if (Array.isArray(obj[k])) return obj[k];
  return [];
}

function cleanText(v, max) {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function normalizeCards(raw, warnings) {
  const seen = new Set();
  const out = [];
  let dropped = 0;
  let dupes = 0;

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      dropped++;
      continue;
    }
    const front = cleanText(item.front ?? item.question ?? item.term ?? item.q, LIMITS.front);
    const back = cleanText(item.back ?? item.answer ?? item.definition ?? item.a, LIMITS.back);
    if (!front || !back) {
      dropped++;
      continue;
    }
    const key = front.toLowerCase();
    if (seen.has(key)) {
      dupes++;
      continue;
    }
    seen.add(key);
    const hint = cleanText(item.hint, LIMITS.hint);
    out.push({ id: `c${out.length + 1}`, front, back, ...(hint ? { hint } : {}) });
    if (out.length >= LIMITS.items) break;
  }

  if (dropped) warnings.push(`${dropped} flashcard${plural(dropped)} skipped (missing front or back).`);
  if (dupes) warnings.push(`${dupes} duplicate flashcard${plural(dupes)} removed.`);
  return out;
}

function normalizeQuiz(raw, warnings) {
  const out = [];
  let dropped = 0;

  for (const item of raw) {
    const q = normalizeQuestion(item);
    if (!q) {
      dropped++;
      continue;
    }
    out.push({ id: `q${out.length + 1}`, ...q });
    if (out.length >= LIMITS.items) break;
  }

  if (dropped) warnings.push(`${dropped} quiz question${plural(dropped)} skipped (bad options or no valid answer).`);
  return out;
}

function normalizeQuestion(item) {
  if (!item || typeof item !== 'object') return null;
  const question = cleanText(item.question ?? item.prompt ?? item.q, LIMITS.question);
  if (!question) return null;

  const rawOptions = Array.isArray(item.options) ? item.options : Array.isArray(item.choices) ? item.choices : [];
  const options = [];
  const indexMap = []; // original index -> new index (null if removed)
  for (const opt of rawOptions) {
    const text = cleanText(opt, LIMITS.option);
    const dupe = options.some((o) => o.toLowerCase() === text.toLowerCase());
    indexMap.push(text && !dupe ? options.length : null);
    if (text && !dupe) options.push(text);
  }
  if (options.length < 2 || options.length > 6) return null;

  // Find the correct answer. Prefer the index, but accept a few common alternatives:
  // "answer": "Paris", "answer": "B", 1-based indexes, numeric strings.
  let answerIndex = null;
  const idx = toInt(item.answerIndex ?? item.correctIndex ?? item.correct);
  if (idx !== null && idx >= 0 && idx < indexMap.length) answerIndex = indexMap[idx];

  if (answerIndex === null && typeof item.answer === 'string') {
    const a = item.answer.trim();
    const byText = options.findIndex((o) => o.toLowerCase() === a.toLowerCase());
    if (byText !== -1) answerIndex = byText;
    else if (/^[A-F]$/i.test(a)) {
      const letter = a.toUpperCase().charCodeAt(0) - 65;
      if (letter < indexMap.length) answerIndex = indexMap[letter];
    }
  }
  if (answerIndex === null || answerIndex === undefined) return null;

  const explanation = cleanText(item.explanation ?? item.why, LIMITS.explanation);
  return { question, options, answerIndex, ...(explanation ? { explanation } : {}) };
}

function toInt(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

function plural(n) {
  return n === 1 ? '' : 's';
}

/* ------------------------------------------------------------------ */
/* Convenience: both steps                                             */
/* ------------------------------------------------------------------ */

export function parseDeck(text, { mode, finishReason } = {}) {
  const extracted = extractJson(text);
  if (!extracted.ok) return { ok: false, reason: extracted.reason };

  const result = normalizeDeck(extracted.value, { mode });
  if (!result.ok) return result;

  if (extracted.truncated || finishReason === 'MAX_TOKENS') {
    result.warnings.unshift('The answer was cut off before it finished. Showing everything that was complete.');
  }
  return result;
}
