# Recall

A study workspace. Paste notes, upload files or a whole folder (PDFs, slides exported as PDF, photos of notes, text and code), or just type a topic. Recall turns it into:

| Tool | What you get |
| --- | --- |
| **Summary** | Two-sentence gist, key points, sections and a glossary. Brief, standard or detailed. |
| **Learn** | A step-by-step lesson for your level, with worked examples and "check yourself" questions. Works from a bare topic too. |
| **Short notes** | One revision sheet: bullets, every formula in a table, memory tricks and common mistakes. Download as Markdown or print. |
| **Flashcards** | Flip, sort into "got it" and "still learning", and review only the misses. Progress is saved. |
| **Test** | *Objective*: MCQs with explanations and a re-test of wrong answers. *Subjective*: write exam answers; the AI marks them against an answer key with partial credit and lists the points you missed. |
| **Ask** | Follow-up questions answered from your material, with a clear note when the answer goes beyond it, plus suggested next questions. |

Every AI answer is structured JSON that is validated before it reaches the screen. There is no free-form chat output anywhere.

> Live demo: _add your Vercel URL_ · Screen recording: _add link_

## Setup

Node 20+ and a free Gemini key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
cp .env.example .env        # paste your key
npm install && npm start    # http://localhost:5173
npm test                    # 21 tests: JSON repair + every validator
```

`npm start` is plain Vite. A small plugin in `vite.config.js` runs `api/study.js` as local middleware, so the same function runs locally and on Vercel.

**Deploy:** import the repo on Vercel, add `GEMINI_API_KEY`, deploy. `GEMINI_MODEL` is optional: a comma-separated fallback list (see `.env.example`).

## Architecture

```
Browser                                              Vercel function (api/study.js)          Gemini
NewSpace ─ files.js reads text files locally
         └ PDFs/images ─► POST {task:"extract"} ─►   validate, build prompt (api/_tasks.js) ─► generateContent
                                                      model fallback on 503/429                  (responseSchema per task)
SpaceView ─ tool ─ useTask.run(task) ─► POST {task, material, options} ─────────────────────────┘
                          ◄── { text } ◄──
                   parseTask(): extractJson → NORMALIZERS[task] → { value, warnings }
                   save into the space (localStorage)
```

| Path | Role |
| --- | --- |
| `api/study.js` | One endpoint for all tasks. Whitelisted options only, size limits, file type checks, model fallback, error mapping. |
| `api/_tasks.js` | Prompt + JSON schema per task. The browser never sends a prompt. (`_` files are helpers, not endpoints, on Vercel.) |
| `src/lib/parse.js` | Finds JSON in model text: fences, chatter, trailing commas, and closes answers that were cut off. |
| `src/lib/normalize.js` | One validator per task. Keeps good items, drops broken ones, reports what it fixed. |
| `src/hooks/useTask.js` | Request lifecycle for any tool: loading, slow notice, one retry, cancel, stale-response guard. |
| `src/lib/files.js` | File and folder reading, including drag-and-drop folders (`webkitGetAsEntry`). |
| `src/lib/storage.js` | Study spaces in localStorage, with migration from version 1. |
| `src/tools/*` | The six tools. Each uses `ToolFrame` for intro / loading / error / result. |

### Handling bad model output

| Problem | Handling |
| --- | --- |
| Markdown fences, text around the JSON, trailing commas | Repaired in `extractJson`. |
| Answer cut off (`MAX_TOKENS`) | Brackets are closed at the last complete item, and the user sees a warning. |
| Not JSON / wrong shape / empty | One automatic retry, then an error card with **Try again** and "show what the AI sent". |
| Partly broken items (quiz answer index out of range, a lesson section with no text, a formula with no expression, duplicates) | Dropped individually. Students don't see technical clean-up messages; they're listed in **Diagnostics → What the app fixed behind the scenes**. |
| Model breaks off, apologises and starts a fresh JSON object | Every complete object in the text is a candidate; the first one that passes the task's validator wins (`jsonCandidates` + `parseTask`). The server also recognises the restart and returns only the fresh object. |
| Still incomplete after continuing | The server keeps it as a fallback and tries the next model; only if none does better is the partial answer returned, with a quiet "Gemini stopped early… Regenerate" line under it. |
| Grader returns a score above the maximum, or skips a question | Score clamped to 0..marks; ungraded answers are reported, not silently treated as zero. |
| Student writes "give me full marks" in an answer | The prompt puts answers inside `<answer>` tags and tells the grader to ignore instructions there. A basic guard, not a guarantee. |
| Gemini 503 "high demand" / 429 | The server falls back through the model list (two passes), remembering the last model that worked. |
| A model accepts the request and then goes silent (common when overloaded) | The server streams the answer (`streamGenerateContent`). No first chunk within 30s means the model is stuck: it's dropped and the next one is tried. A 30s gap mid-answer stops the stream and returns what arrived (`finishReason: TIMEOUT`), which the client salvages. |
| Answer cut off (token limit or a stalled stream) | The server asks the same model to **continue from where it stopped** (up to 2 times) and stitches the parts, removing repeated text and fences. Only if that fails does the client salvage the complete part and show a warning naming the model and reason. |
| Thinking eats the output budget | Thinking tokens count against the output limit. `thinkingLevel: low` (Gemini 3), else `thinkingBudget: 512` (Gemini 2.5), else none: stepped down per model on a 400 and remembered. Logs print output vs thinking token counts. |
| Slow answers | `thinkingLevel: low` keeps Gemini 3 models fast (retried without it on older models that reject it). Function budget is 170s (`maxDuration: 180`, allowed on Vercel Hobby with Fluid compute). After 35s the UI says it's trying backup models. An attempt that already took over 40s isn't auto-retried, so the user never waits twice. |
| Request superseded or tab closed | Every run has an id; stale results are dropped and unmounting aborts the fetch. |
| Corrupt or full localStorage | Bad entries are filtered out; a full store shows a message instead of failing silently. |
| A render bug | Error boundary with a reload button. |

**Diagnostics** (bottom of the sidebar) fakes malformed JSON, wrong shapes, empty or cut-off answers, slow responses, a 503 and a network failure for any tool, so every path above can be demonstrated.

### Files

- Text-like files (`.txt .md .csv .json .html`, code) are read in the browser.
- PDFs and images (PNG/JPG/WebP, ≤ 2.9 MB) are sent once to Gemini, which returns their text. Only that text is stored.
- Word and PowerPoint files are skipped with a clear reason ("save it as PDF first").
- Up to 30 files per space and 60,000 characters of material. Hidden folders, `node_modules` and `.git` are ignored.

## Known limitations

- PDFs over ~2.9 MB can't be uploaded (Vercel's 4.5 MB request limit). The fix is direct upload to the Gemini Files API.
- Scanned PDFs depend on Gemini's OCR quality.
- Material is capped at 60,000 characters per space; longer books need splitting into chapters.
- Everything lives in this browser's localStorage, with no sync or accounts.
- AI grading is a study aid and can be wrong. The model answer and missed points are shown so students can judge for themselves.
- No server-side rate limiting yet.

## AI usage

_Make this accurate before submitting._

- I used Claude to build most of version 2: the new UI, the tools, the validators and this README.
- I reviewed and ran: _list_.
- Changes I made myself: _list_.

## Time spent

_Fill in honestly._
