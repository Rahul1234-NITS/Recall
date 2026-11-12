// One validator per AI task. Each takes parsed JSON (unknown shape) and returns
//   { ok: true, value, warnings }  — clean data the UI can trust
//   { ok: false, reason }          — nothing usable; the caller retries or shows an error
//
// Same philosophy as parse.js: strict about what reaches the screen, but keep
// whatever is good instead of throwing the whole answer away.

import { jsonCandidates, normalizeDeck } from './parse.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function text(v, max = 600) {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return '';
  const t = v.replace(/[ \t]+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function list(v, max = 400, limit = 20) {
  if (typeof v === 'string') v = v.split(/\n+/);
  if (!Array.isArray(v)) return [];
  return v.map((x) => text(x, max).replace(/^[-*•]\s+/, '')).filter(Boolean).slice(0, limit);
}

function unwrap(v) {
  if (!isObj(v)) return v;
  for (const key of ['data', 'result', 'output', 'response']) {
    if (isObj(v[key]) && Object.keys(v).length === 1) return v[key];
  }
  return v;
}

/* ------------------------------------------------------------------ */

function summary(v) {
  const warnings = [];
  const sections = (Array.isArray(v.sections) ? v.sections : [])
    .filter(isObj)
    .map((s) => ({ heading: text(s.heading ?? s.title, 90), points: list(s.points ?? s.bullets) }))
    .filter((s) => s.heading && s.points.length);
  const keyPoints = list(v.keyPoints ?? v.key_points, 400, 12);
  const keyTerms = (Array.isArray(v.keyTerms) ? v.keyTerms : [])
    .filter(isObj)
    .map((t) => ({ term: text(t.term, 60).replace(/\*\*/g, ''), definition: text(t.definition, 300) }))
    .filter((t) => t.term && t.definition)
    .slice(0, 14);
  if (!sections.length && !keyPoints.length) return { ok: false, reason: 'The summary had no key points or sections.' };
  if (Array.isArray(v.sections) && v.sections.length > sections.length) warnings.push(`${v.sections.length - sections.length} empty section(s) removed.`);
  return { ok: true, warnings, value: { title: text(v.title, 80) || 'Summary', tldr: text(v.tldr, 500), keyPoints, sections, keyTerms } };
}

function lesson(v) {
  const warnings = [];
  const raw = Array.isArray(v.sections) ? v.sections : [];
  const sections = raw
    .filter(isObj)
    .map((s) => {
      const cp = isObj(s.checkpoint) ? { question: text(s.checkpoint.question, 300), answer: text(s.checkpoint.answer, 600) } : null;
      return {
        heading: text(s.heading ?? s.title, 90),
        paragraphs: list(s.paragraphs ?? s.content ?? s.body, 1400, 8),
        example: text(s.example, 1200),
        checkpoint: cp?.question && cp?.answer ? cp : null,
      };
    })
    .filter((s) => s.heading && s.paragraphs.length);
  if (!sections.length) return { ok: false, reason: 'The lesson had no readable sections.' };
  if (raw.length > sections.length) warnings.push(`${raw.length - sections.length} incomplete lesson section(s) skipped.`);
  return {
    ok: true,
    warnings,
    value: {
      title: text(v.title, 80) || 'Lesson',
      hook: text(v.hook, 500),
      objectives: list(v.objectives, 200, 6),
      sections,
      takeaways: list(v.takeaways, 300, 8),
      nextTopics: list(v.nextTopics, 80, 5).map((t) => t.replace(/\*\*/g, '')),
    },
  };
}

function notes(v) {
  const sections = (Array.isArray(v.sections) ? v.sections : [])
    .filter(isObj)
    .map((s) => ({ heading: text(s.heading ?? s.title, 90), bullets: list(s.bullets ?? s.points, 300, 12) }))
    .filter((s) => s.heading && s.bullets.length);
  if (!sections.length) return { ok: false, reason: 'The notes had no sections.' };
  const formulas = (Array.isArray(v.formulas) ? v.formulas : [])
    .filter(isObj)
    .map((f) => ({ name: text(f.name, 80), expression: text(f.expression ?? f.formula, 200), note: text(f.note, 200) }))
    .filter((f) => f.expression)
    .slice(0, 15);
  return {
    ok: true,
    warnings: [],
    value: {
      title: text(v.title, 80) || 'Short notes',
      sections,
      formulas,
      mnemonics: list(v.mnemonics, 300, 4),
      pitfalls: list(v.pitfalls ?? v.mistakes, 300, 6),
    },
  };
}

function subjective(v) {
  const raw = Array.isArray(v.questions) ? v.questions : [];
  const questions = raw
    .filter(isObj)
    .map((q, i) => ({
      id: `s${i + 1}`,
      question: text(q.question, 600),
      marks: Math.min(20, Math.max(1, Math.round(Number(q.marks)) || 5)),
      modelAnswer: text(q.modelAnswer ?? q.answer, 2000),
      keyPoints: list(q.keyPoints ?? q.rubric, 200, 8),
    }))
    .filter((q) => q.question && (q.modelAnswer || q.keyPoints.length));
  if (!questions.length) return { ok: false, reason: 'No usable written-answer questions came back.' };
  const warnings = raw.length > questions.length ? [`${raw.length - questions.length} question(s) without an answer key were skipped.`] : [];
  return { ok: true, warnings, value: { title: text(v.title, 80) || 'Written test', questions } };
}

/** Needs the questions that were graded, to match results by id and clamp scores. */
function grade(v, { questions }) {
  const byId = new Map((Array.isArray(v.results) ? v.results : []).filter(isObj).map((r) => [String(r.id), r]));
  const warnings = [];
  const results = {};
  let missing = 0;
  for (const q of questions) {
    const r = byId.get(q.id);
    if (!r) {
      missing++;
      continue;
    }
    const score = Number(r.score);
    results[q.id] = {
      score: Number.isFinite(score) ? Math.round(Math.min(q.marks, Math.max(0, score)) * 2) / 2 : 0,
      feedback: text(r.feedback, 500),
      covered: list(r.covered, 200, 8),
      missed: list(r.missed, 200, 8),
    };
    if (Number.isFinite(score) && (score < 0 || score > q.marks)) warnings.push(`A score outside 0–${q.marks} was corrected.`);
  }
  if (missing === questions.length) return { ok: false, reason: 'The grader returned no results for these questions.' };
  if (missing) warnings.push(`${missing} answer(s) could not be graded. Submit again to grade them.`);
  const total = Object.values(results).reduce((s, r) => s + r.score, 0);
  const max = questions.filter((q) => results[q.id]).reduce((s, q) => s + q.marks, 0);
  return { ok: true, warnings, value: { results, overall: text(v.overall, 600), total, max } };
}

function answer(v) {
  let paragraphs = v.answer;
  if (typeof paragraphs === 'string') paragraphs = paragraphs.split(/\n{2,}/);
  paragraphs = list(paragraphs, 1600, 6);
  if (!paragraphs.length) return { ok: false, reason: 'The answer was empty.' };
  return {
    ok: true,
    warnings: [],
    value: {
      paragraphs,
      points: list(v.points, 300, 6),
      fromMaterial: v.fromMaterial !== false,
      followUps: list(v.followUps, 160, 3).map((t) => t.replace(/\*\*/g, '')),
    },
  };
}

function extract(v) {
  const body = typeof v.text === 'string' ? v.text.trim() : '';
  if (body.length < 20) return { ok: false, reason: 'No readable text was found in this file.' };
  return { ok: true, warnings: [], value: { title: text(v.title, 80), text: body.slice(0, 40_000) } };
}

function deck(mode) {
  return (v) => {
    const r = normalizeDeck(v, { mode });
    return r.ok ? { ok: true, warnings: r.warnings, value: r.deck } : r;
  };
}

export const NORMALIZERS = {
  summary,
  lesson,
  notes,
  subjective,
  grade,
  ask: answer,
  extract,
  cards: deck('cards'),
  quiz: deck('quiz'),
};

/**
 * Text from the model -> validated value. Tries each JSON candidate in the text (see
 * jsonCandidates) and keeps the first that passes this task's validator.
 * `context` is passed to normalizers that need it (grade).
 * Returns { ok, value, warnings, incomplete } — `incomplete` means part of the answer is missing.
 */
export function parseTask(task, rawText, { finishReason, context } = {}) {
  const candidates = jsonCandidates(rawText);
  if (!candidates.length) {
    return { ok: false, reason: rawText?.trim() ? 'The model answer was not valid JSON.' : 'The model returned nothing.' };
  }
  const normalizer = NORMALIZERS[task];
  let reason = 'The model answer had the wrong shape.';
  for (const c of candidates) {
    const value = unwrap(c.value);
    if (!isObj(value) && !(Array.isArray(value) && (task === 'cards' || task === 'quiz'))) continue;
    const result = normalizer(value, context ?? {});
    if (!result.ok) {
      reason = result.reason;
      continue;
    }
    result.incomplete = c.truncated || finishReason === 'MAX_TOKENS' || finishReason === 'TIMEOUT';
    return result;
  }
  return { ok: false, reason };
}
