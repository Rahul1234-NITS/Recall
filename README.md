# Recall

Paste notes (or just a topic), get **flashcards** and a **multiple-choice quiz**. Flip and sort cards into "got it" / "still learning", take the quiz, then **re-test only the questions you missed** until the score sticks.

The model returns structured JSON. The app validates it, salvages what it can, and renders interactive components. There is no chat box anywhere.

> Live demo: _add your Vercel URL here_ · Screen recording: _add link here_

---

## Setup

Requires Node 20+ and a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
cp .env.example .env        # then paste your key into .env
npm install && npm start    # http://localhost:5173
```

`npm start` runs Vite. A small plugin in `vite.config.js` mounts `api/generate.js` as local middleware, so the same serverless function runs locally and on Vercel. You don't need the Vercel CLI.

```bash
npm test        # parser tests (Node's built-in runner, no extra deps)
npm run build   # production build into dist/
```

### Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel. It detects Vite automatically.
2. Under **Settings → Environment Variables**, add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`).
3. Deploy. Files in `/api` become serverless functions. `vercel.json` raises the function timeout to 60s.

---

## How it works

```
Browser                                   Vercel function                Gemini
───────                                   ───────────────                ──────
Composer ─► useGenerateDeck ─► POST /api/generate ─► builds prompt  ─► generateContent
                │                         (key lives here only)          (JSON schema)
                │  ◄──────────── { text, finishReason } ◄──────────────────┘
                ▼
          parseDeck(text)   extract JSON → normalize → warnings
                ▼
          sessions (localStorage) ─► StudyView ─► Flashcards / Quiz
```

| Path | What it does |
| --- | --- |
| `api/generate.js` | Validates input, builds the prompt, calls Gemini with a `responseSchema`, maps upstream failures to readable error codes. |
| `src/lib/parse.js` | **The core.** Turns untrusted model text into a clean deck. Fully unit-tested. |
| `src/lib/api.js` | `fetch` wrapper: timeout, cancel, and every failure becomes an `ApiError` with a `code`. |
| `src/hooks/useGenerateDeck.js` | Request lifecycle: loading / slow / retry / error / success, plus the stale-response guard. |
| `src/hooks/useSessions.js` | Saved sets and learning progress, persisted to localStorage. |
| `src/components/Flashcards.jsx` | Flip cards, known/learning piles, shuffle, keyboard controls. |
| `src/components/Quiz.jsx` | Quiz as a small reducer state machine, including re-test rounds with reshuffled options. |
| `src/lib/failureLab.js` | Fakes bad AI responses on demand for testing and demos. |

### Handling bad AI output

Gemini's JSON mode makes valid output likely, not guaranteed. Every case below is handled, and most can be triggered from the **Failure lab** panel in the UI.

| What goes wrong | What the app does |
| --- | --- |
| Markdown fences or chatty text around the JSON | Stripped before parsing. |
| Trailing commas | Removed and parsed again. |
| Answer cut off (`MAX_TOKENS`) | `closeTruncatedJson` cuts back to the last complete item and closes the brackets. A warning says it was cut off. |
| Not JSON at all | Automatic retry once. If that also fails, an error screen with **Try again** and a "show what the AI sent" toggle. |
| Wrong shape (`{ "response": "..." }`) | Rejected with a clear reason, then retried. |
| Close-but-different keys (`flashcards`, `question/answer`, `answer: "B"`) | Accepted through alias mapping. |
| Some items broken (no answer, 1 option, `answerIndex: 9`, duplicates) | Bad items are dropped, good ones kept, and a banner says how many were skipped. |
| Asked for cards + quiz, only one came back | Shows what exists and warns about the rest. |
| Empty response | Server returns `empty_output` (retryable). |
| Slow | After 8s the message changes and Cancel appears. Hard timeout at 60s client-side and 45s server-side. |
| Rate limit / Gemini 5xx / network down | Retried with backoff, then a specific message. |
| Safety block, bad key, missing model | Not retried (it would fail the same way). Explained plainly. |
| User submits again while a request is running | The old request is aborted **and** its id becomes stale, so even a response that already arrived can't overwrite the new one. |
| Corrupt localStorage | Ignored item by item, so the app still loads. |
| A render bug | An error boundary shows a reload button instead of a white screen. |

### Why the prompt lives on the server

The browser only sends `notes`, `mode`, `count` and `difficulty`. The server builds the prompt, so the endpoint can't be used as an open Gemini proxy with someone's key. Notes are wrapped in `<material>` tags and the system prompt says to treat them as content, not instructions. That's a basic guard against prompt injection, not a complete defence.

### Keyboard

| Where | Keys |
| --- | --- |
| Composer | `Ctrl/⌘ + Enter` to generate |
| Flashcards | `Space` flip · `←` `→` move · `1` still learning · `2` got it · `H` hint |
| Quiz | `1`–`4` choose · `Enter` next |
| Drawer | `Esc` to close |

---

## Known limitations

- No streaming. The whole JSON arrives at once, and partial JSON isn't worth rendering card by card for this UI.
- Sessions are stored only in this browser's localStorage, with no sync across devices.
- Auto-retry happens once. A third attempt rarely helps and costs quota.
- Prompt-injection protection is basic, as described above.
- The quiz always uses multiple choice. No free-text answers, which would need fuzzy grading.
- There is no server-side rate limiting, so a deployed URL can be spammed. The next step would be a per-IP limit (for example Vercel KV).
- I haven't measured quiz quality systematically. Wrong "correct answers" from the model are possible, and the app can't detect them.

## What I'd do next

1. A "regenerate this card" button and a "this answer is wrong" flag that feeds back into a refine prompt.
2. Spaced repetition (SM-2) scheduling instead of a simple known/learning pile.
3. Streaming with a tolerant incremental parser so the first cards appear sooner.
4. Component tests for Quiz and Flashcards with Testing Library.

---

## AI usage

_Edit this so it's accurate before you submit. The assignment says honesty here counts in your favour._

- I used an AI assistant (Claude) to help write a large part of the code and this README, including the initial component structure, the parser and the CSS.
- I read through every file, ran it, and tested the failure cases using the Failure lab.
- Decisions I can explain: _list the ones you understand and agree with, e.g. why parsing happens on the client, the stale-request guard, the quiz reducer._
- Changes I made myself: _list them._

## Time spent

_Fill in honestly, e.g. "about X hours: setup Y, core flow Y, failure handling Y, polish Y"._
