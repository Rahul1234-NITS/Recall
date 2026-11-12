// POST /api/study
// Body: { task, material?, topic?, options?, ...task-specific fields }
// Returns: { text, finishReason, model } — the raw model JSON as text.
// The client parses and validates it (src/lib/normalize.js), so it can salvage partial answers.

import { TASKS } from './_tasks.js';

// Fallback chain: Gemini often answers 503 "high demand" for one model while another still
// has capacity. GEMINI_MODEL can override with a comma list. Unknown names (404) are skipped.
const MODELS = (process.env.GEMINI_MODEL || 'gemini-flash-latest,gemini-flash-lite-latest,gemini-3.5-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
// Timing. Vercel (Fluid compute) allows up to 300s on Hobby; vercel.json sets 180s.
const TOTAL_BUDGET_MS = 170_000;
// An overloaded model sometimes accepts the request and then sends nothing. If not even the
// first streamed chunk arrives in this time, we treat the model as stuck and move on.
const FIRST_CHUNK_MS = 30_000;
const IDLE_MS = 30_000; // gap allowed between chunks once it has started answering
const BUSY_STATUSES = new Set([429, 500, 502, 503, 504]);
// Thinking ("reasoning") tokens count against the output limit, so we keep thinking small.
// Gemini 3 understands thinkingLevel; Gemini 2.5 only thinkingBudget; some models neither.
// We try them in that order per model and remember what worked while the instance is warm.
const THINKING = { level: { thinkingLevel: 'low' }, budget: { thinkingBudget: 512 }, none: null };
const NEXT_THINKING = { level: 'budget', budget: 'none' };
const thinkingMode = new Map();
const MAX_CONTINUATIONS = 2;
const CONTINUE_PROMPT =
  'Your previous reply was cut off. Continue it from exactly the last character you wrote. ' +
  'Output only the remaining text: no repetition, no code fences, no commentary.';

const MAX_MATERIAL = 60_000;
const MAX_TOPIC = 200;
const MAX_FILE_BASE64 = 3_900_000; // ~2.9 MB file; Vercel bodies are capped at 4.5 MB
const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const clampInt = (v, lo, hi, fallback) => Math.min(hi, Math.max(lo, Number.parseInt(v, 10) || fallback));
const cleanStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

let preferred = 0; // last model that worked, while this instance is warm
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(res, status, code, message, retryable = false) {
  return res.status(status).json({ error: { code, message, retryable } });
}

/** Validates the request for one task. Returns { params, parts } or { error }. */
function buildRequest(task, body) {
  const material = cleanStr(body.material, MAX_MATERIAL + 1);
  const topic = cleanStr(body.topic, MAX_TOPIC);
  if (material.length > MAX_MATERIAL) return { error: [413, 'input_too_long', 'This study space has too much text (max 60,000 characters).'] };
  if (task.needsSource !== false && !material && !topic) return { error: [400, 'empty_input', 'Add some notes, a file or a topic first.'] };

  const o = body.options && typeof body.options === 'object' ? body.options : {};
  const params = {
    material,
    topic,
    length: pick(o.length, ['brief', 'standard', 'detailed'], 'standard'),
    level: pick(o.level, ['beginner', 'intermediate', 'advanced'], 'beginner'),
    difficulty: pick(o.difficulty, ['easy', 'medium', 'hard'], 'medium'),
    count: clampInt(o.count, 3, 15, 8),
  };
  const parts = [];

  if (body.task === 'extract') {
    const f = body.file ?? {};
    if (!FILE_TYPES.includes(f.mimeType)) return { error: [415, 'unsupported_file', 'Only PDF, PNG, JPG and WebP files can be read by the AI.'] };
    if (typeof f.data !== 'string' || !f.data) return { error: [400, 'bad_request', 'The file was empty.'] };
    if (f.data.length > MAX_FILE_BASE64) return { error: [413, 'file_too_large', 'File is too large to read (max about 2.9 MB). Split it or paste the text.'] };
    params.fileName = cleanStr(f.name, 120) || 'file';
    parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
  }

  if (body.task === 'subjective') params.count = clampInt(o.count, 2, 8, 5);

  if (body.task === 'grade') {
    const items = Array.isArray(body.items) ? body.items.slice(0, 10) : [];
    params.items = items
      .map((q, i) => ({
        id: cleanStr(q?.id, 20) || `q${i + 1}`,
        question: cleanStr(q?.question, 600),
        marks: clampInt(q?.marks, 1, 20, 5),
        modelAnswer: cleanStr(q?.modelAnswer, 2000),
        keyPoints: Array.isArray(q?.keyPoints) ? q.keyPoints.slice(0, 8).map((k) => cleanStr(k, 200)).filter(Boolean) : [],
        answer: cleanStr(q?.answer, 4000),
      }))
      .filter((q) => q.question);
    if (!params.items.length) return { error: [400, 'bad_request', 'Nothing to grade.'] };
  }

  if (body.task === 'ask') {
    params.question = cleanStr(body.question, 800);
    if (!params.question) return { error: [400, 'empty_input', 'Type a question first.'] };
    params.history = (Array.isArray(body.history) ? body.history.slice(-6) : [])
      .map((t) => ({ q: cleanStr(t?.q, 500), a: cleanStr(t?.a, 1200) }))
      .filter((t) => t.q && t.a);
  }

  parts.push({ text: task.prompt(params) });
  return { parts };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail(res, 500, 'missing_key', 'The server has no GEMINI_API_KEY configured.');

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== 'object') return fail(res, 400, 'bad_request', 'Request body must be JSON.');

  const task = TASKS[body.task];
  if (!task) return fail(res, 400, 'bad_task', 'Unknown task.');

  const built = buildRequest(task, body);
  if (built.error) return fail(res, ...built.error);

  const request = {
    systemInstruction: { parts: [{ text: task.system }] },
    contents: [{ role: 'user', parts: built.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: task.schema,
      temperature: task.temperature,
      maxOutputTokens: 16_000,
    },
  };

  const result = await callWithFallback(apiKey, request);
  if (!result.ok) return fail(res, result.status, result.code, result.message, result.retryable);
  const { text, finishReason, model } = result;

  if (result.blocked || finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
    return fail(res, 422, 'blocked', 'Gemini declined this material because of a safety filter.');
  }
  if (!text.trim()) return fail(res, 502, 'empty_output', 'Gemini returned an empty answer.', true);

  // MAX_TOKENS / TIMEOUT still return 200: the client can usually salvage a cut-off answer.
  return res.status(200).json({ text, finishReason, model });
}

/**
 * Streams one model's answer and collects the text.
 * Returns { ok: true, text, finishReason, blocked } or { ok: false, status, message, stuck }.
 */
async function callModel(model, apiKey, request, deadline) {
  const mode = thinkingMode.get(model) ?? 'level';
  const body = THINKING[mode]
    ? { ...request, generationConfig: { ...request.generationConfig, thinkingConfig: THINKING[mode] } }
    : request;

  const controller = new AbortController();
  let timer;
  const arm = (ms, reason) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(reason), Math.max(1000, Math.min(ms, deadline - Date.now())));
  };
  arm(FIRST_CHUNK_MS, 'stuck');

  let text = '';
  let finishReason = 'UNKNOWN';
  let blocked = false;
  let usage = null;
  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) },
    );

    if (!upstream.ok || !upstream.body) {
      clearTimeout(timer);
      const data = await upstream.json().catch(() => null);
      const message = data?.error?.message ?? '';
      // This model doesn't accept this kind of thinking setting: step down and retry the same model.
      if (upstream.status === 400 && NEXT_THINKING[mode] && /thinking/i.test(message)) {
        thinkingMode.set(model, NEXT_THINKING[mode]);
        return callModel(model, apiKey, request, deadline);
      }
      return { ok: false, status: upstream.status, message };
    }

    const reader = upstream.body.getReader();
    // Don't rely on fetch alone to end a stalled body: cancelling the reader always unblocks read().
    controller.signal.addEventListener('abort', () => reader.cancel().catch(() => {}), { once: true });
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      arm(IDLE_MS, 'idle');
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        let event;
        try {
          event = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        if (event?.promptFeedback?.blockReason) blocked = true;
        if (event?.usageMetadata) usage = event.usageMetadata;
        const cand = event?.candidates?.[0];
        for (const part of cand?.content?.parts ?? []) {
          if (typeof part?.text === 'string' && !part.thought) text += part.text;
        }
        if (cand?.finishReason) finishReason = cand.finishReason;
      }
    }
    if (controller.signal.aborted) throw new Error('aborted');
    clearTimeout(timer);
    return { ok: true, text, finishReason, blocked, usage };
  } catch (err) {
    clearTimeout(timer);
    const reason = controller.signal.reason;
    // Ran out of time mid-answer: hand back what we have; the client salvages complete items.
    if (text && (reason === 'idle' || reason === 'deadline')) return { ok: true, text, finishReason: 'TIMEOUT', blocked, usage };
    if (reason === 'stuck' || reason === 'idle' || reason === 'deadline') return { ok: false, status: 504, stuck: true, message: `no data (${reason})` };
    return { ok: false, status: 0, message: String(err?.message ?? err) };
  }
}

/**
 * Tries each model in turn. Busy (429/5xx), stuck (no data) and missing (404) models are skipped;
 * if every model fails, waits 2s and does one more pass while time remains.
 */
async function callWithFallback(apiKey, request) {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const order = [...MODELS.slice(preferred), ...MODELS.slice(0, preferred)];
  const missing = new Set();
  const tried = [];
  let onlyStuck = true;
  let partial = null; // best incomplete answer, returned only if nothing better arrives

  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(2000);
    for (const model of order) {
      if (missing.has(model)) continue;
      if (deadline - Date.now() < 15_000) break; // not enough time left for a real answer

      const started = Date.now();
      const r = await callModel(model, apiKey, request, deadline);
      if (r.ok) {
        preferred = MODELS.indexOf(model);
        const u = r.usage ?? {};
        console.log(
          `[gemini] ${model} ok in ${((Date.now() - started) / 1000).toFixed(1)}s, finish=${r.finishReason}, ${r.text.length} chars, ` +
            `tokens out=${u.candidatesTokenCount ?? '?'} thinking=${u.thoughtsTokenCount ?? 0} (thinking mode: ${thinkingMode.get(model) ?? 'level'})` +
            (tried.length ? ` after ${tried.join('; ')}` : ''),
        );
        if (r.blocked) return { ok: true, model, ...r };
        const full = await finishCutAnswer(model, apiKey, request, r, deadline);
        if (full.complete) return { ok: true, model, ...full };
        // Still incomplete after continuing. Keep it as a last resort and give another model a go.
        if (!partial || full.text.length > partial.text.length) partial = { model, ...full };
        missing.add(model); // don't ask this model again in the second pass
        tried.push(`${model}: incomplete answer`);
        onlyStuck = false;
        if (deadline - Date.now() > 45_000) continue;
        break;
      }

      console.error(`[gemini] ${model} ${r.status || 'network'} ${r.message}`.trim());
      tried.push(`${model}: ${r.stuck ? 'no response' : r.status || 'unreachable'}`);
      if (!r.stuck) onlyStuck = false;
      if (r.status === 404) {
        missing.add(model);
        continue;
      }
      if (r.stuck || r.status === 0 || BUSY_STATUSES.has(r.status)) continue;
      if (r.status === 401 || r.status === 403) return { ok: false, status: 500, code: 'bad_key', message: 'The server API key was rejected.' };
      if (r.status === 400) return { ok: false, status: 400, code: 'upstream_rejected', message: 'Gemini could not process this input (unsupported or corrupt file?).' };
      return { ok: false, status: 502, code: 'upstream_rejected', message: 'Gemini rejected the request.' };
    }
  }

  if (partial) {
    console.warn(`[gemini] returning an incomplete answer from ${partial.model}; ${tried.join('; ')}`);
    return { ok: true, ...partial };
  }
  if (missing.size === MODELS.length) {
    return { ok: false, status: 500, code: 'model_not_found', message: `None of the configured models exist: ${MODELS.join(', ')}. Set GEMINI_MODEL.` };
  }
  return {
    ok: false,
    status: onlyStuck ? 504 : 503,
    code: 'overloaded',
    message: `Gemini is overloaded right now: every model was busy or didn't respond (${tried.length} tries). Wait a minute and try again.`,
    retryable: true,
  };
}

/** True when the text contains one complete, parseable JSON object. */
function isCompleteJson(text) {
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b < a) return false;
  try {
    JSON.parse(s.slice(a, b + 1));
    return true;
  } catch {
    return false;
  }
}

/** Index of the "}" closing the "{" at `start` (string-aware), or -1. */
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

/**
 * The usable JSON in a model answer, or null. Either the whole answer is one object, or the model
 * broke off and started a fresh object on a new line (often after "I apologize…"); then that
 * fresh object is the answer, as long as it is a substantial part of the text.
 */
function finalJson(text) {
  if (isCompleteJson(text)) return text;
  for (const m of text.matchAll(/(^|\n)[ \t]*(?:```(?:json)?\s*)?\{/g)) {
    const start = m.index + m[0].length - 1;
    const end = matchingBrace(text, start);
    if (end === -1) continue;
    const obj = text.slice(start, end + 1);
    if (obj.length < text.length * 0.4) continue;
    try {
      JSON.parse(obj);
      return obj;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Appends a continuation, dropping fences and any text the model repeated from the end of the first part. */
function joinContinuation(first, more) {
  let next = more.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  // The model sometimes starts over instead of continuing. Recognise that by the same opening
  // (e.g. {"title":) and use the fresh copy if it is complete.
  const squash = (t) => t.replace(/\s+/g, '');
  const opening = squash(first).slice(0, 12);
  if (opening.length >= 8 && squash(next).startsWith(opening) && isCompleteJson(next)) return next;
  for (let k = Math.min(400, first.length, next.length); k >= 12; k--) {
    if (first.endsWith(next.slice(0, k))) {
      next = next.slice(k);
      break;
    }
  }
  return first + next;
}

/**
 * If the answer stopped early (token limit, stalled stream, or just incomplete JSON), ask the same
 * model to continue from where it stopped, up to MAX_CONTINUATIONS times, and stitch the parts.
 * Continuations are plain text (no schema): with a schema the model would start a new object.
 */
async function finishCutAnswer(model, apiKey, request, first, deadline) {
  let { text, finishReason } = first;
  for (let i = 0; i < MAX_CONTINUATIONS && text.trim() && !finalJson(text); i++) {
    if (deadline - Date.now() < 20_000) break;
    const { responseMimeType: _m, responseSchema: _s, ...generationConfig } = request.generationConfig;
    const more = await callModel(
      model,
      apiKey,
      {
        systemInstruction: request.systemInstruction,
        contents: [...request.contents, { role: 'model', parts: [{ text }] }, { role: 'user', parts: [{ text: CONTINUE_PROMPT }] }],
        generationConfig,
      },
      deadline,
    );
    if (!more.ok || !more.text.trim()) {
      console.warn(`[gemini] ${model} continuation ${i + 1} failed: ${more.status ?? ''} ${more.message ?? ''}`);
      break;
    }
    text = joinContinuation(text, more.text);
    finishReason = more.finishReason;
    console.log(`[gemini] ${model} continuation ${i + 1}: +${more.text.length} chars, finish=${more.finishReason}, complete=${!!finalJson(text)}`);
    if (more.finishReason === 'TIMEOUT') break; // it stalled again; don't keep waiting on the same model
  }
  const json = finalJson(text);
  if (json) return { ...first, text: json, finishReason: 'STOP', complete: true };
  return { ...first, text, finishReason, complete: false };
}
