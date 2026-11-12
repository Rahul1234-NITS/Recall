import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { filesFromDrop, formatBytes, readBase64, readText, triage } from '../lib/files.js';
import { ApiError, postJson, wait } from '../lib/api.js';
import { parseTask } from '../lib/normalize.js';
import { MAX_MATERIAL, makeSpace, newId } from '../lib/storage.js';

const TOOLS = [
  { icon: 'summary', name: 'Summary', text: 'The main idea, key points and a glossary.' },
  { icon: 'learn', name: 'Learn', text: 'A step-by-step lesson with examples and checks.' },
  { icon: 'notes', name: 'Short notes', text: 'One revision page with formulas and pitfalls.' },
  { icon: 'cards', name: 'Flashcards', text: 'Flip, sort, and repeat the ones you miss.' },
  { icon: 'test', name: 'Test', text: 'MCQs, plus written answers marked by the AI.' },
  { icon: 'ask', name: 'Ask', text: 'Follow-up questions, answered from your notes.' },
];

const TOPIC_MAX = 120;

/** Sends a PDF or image to the AI once and keeps the text it returns. One retry on busy/bad output. */
async function extract(item, signal) {
  const data = await readBase64(item.file);
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    if (attempt > 1) await wait(['overloaded', 'rate_limited'].includes(lastErr?.code) ? 3000 : 600, signal);
    try {
      const res = await postJson('/api/study', { task: 'extract', file: { name: item.name, mimeType: item.mimeType, data } }, { signal });
      const parsed = parseTask('extract', res.text, { finishReason: res.finishReason });
      if (parsed.ok) return parsed.value.text;
      lastErr = new ApiError('invalid_output', parsed.reason, { retryable: true });
    } catch (err) {
      if (err?.code === 'aborted') throw err;
      lastErr = err;
      if (!err?.retryable) break;
    }
    if (Date.now() - started > 40_000) break; // server already tried every model
  }
  throw lastErr;
}

export function NewSpace({ onCreate, hasSpaces }) {
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const controller = useRef(new AbortController());
  const dragDepth = useRef(0);

  useEffect(() => () => controller.current.abort(), []);

  const patch = (id, fields) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...fields } : i)));

  async function process(item) {
    try {
      if (item.kind === 'text') {
        const body = await readText(item.file);
        patch(item.id, body.trim() ? { status: 'ready', text: body } : { status: 'error', error: 'The file is empty.' });
      } else {
        patch(item.id, { status: 'extracting', error: null });
        const body = await extract(item, controller.current.signal);
        patch(item.id, { status: 'ready', text: body });
      }
    } catch (err) {
      if (err?.code === 'aborted') return;
      patch(item.id, { status: 'error', error: err?.message || 'Could not read this file.' });
    }
  }

  async function addFiles(entries) {
    const { accepted, skipped: skip } = triage(entries);
    setSkipped((s) => [...s, ...skip].slice(-20));
    const fresh = accepted
      .filter((a) => !items.some((i) => i.path === a.path && i.size === a.file.size))
      .map((a) => ({ id: newId(), name: a.file.name, path: a.path, size: a.file.size, kind: a.kind, mimeType: a.mimeType, file: a.file, status: a.kind === 'text' ? 'reading' : 'queued' }));
    if (!fresh.length) return;
    setItems((list) => [...list, ...fresh]);

    // Text files are instant. AI extraction runs two at a time to stay friendly with rate limits.
    fresh.filter((f) => f.kind === 'text').forEach(process);
    const queue = fresh.filter((f) => f.kind === 'ai');
    const worker = async () => {
      while (queue.length) await process(queue.shift());
    };
    await Promise.all([worker(), worker()]);
  }

  const ready = items.filter((i) => i.status === 'ready');
  const working = items.some((i) => i.status === 'reading' || i.status === 'extracting' || i.status === 'queued');
  const trimmed = text.trim();
  const isTopic = !items.length && trimmed.length > 0 && trimmed.length <= TOPIC_MAX && !trimmed.includes('\n');
  const totalChars = (isTopic ? 0 : trimmed.length) + ready.reduce((s, i) => s + i.text.length, 0);
  const canStart = !working && (trimmed.length > 0 || ready.length > 0);

  function start() {
    if (!canStart) return;
    if (isTopic) {
      onCreate({ ...makeSpace({ sources: [], topic: trimmed }), autoStart: 'lesson' });
      return;
    }
    let budget = MAX_MATERIAL;
    const sources = [];
    const add = (name, kind, body) => {
      if (budget <= 0) return;
      const t = body.slice(0, budget);
      budget -= t.length + name.length + 6;
      sources.push({ id: newId(), name, kind, text: t, chars: t.length });
    };
    if (trimmed) add('Pasted notes', 'paste', trimmed);
    for (const i of ready) add(i.path, 'file', i.text);
    onCreate({ ...makeSpace({ sources, topic: '' }), autoStart: 'summary' });
  }

  const dropProps = {
    onDragEnter: (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      dragDepth.current++;
      setDragging(true);
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDragOver: (e) => e.preventDefault(),
    onDrop: async (e) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(await filesFromDrop(e.dataTransfer));
    },
  };

  return (
    <div className="new" {...dropProps}>
      <header className="new__head">
        <h1>What are we studying today?</h1>
        <p>Paste your notes, upload files or a whole folder, or just type a topic. Recall turns it into a summary, a lesson, short notes, flashcards and tests.</p>
      </header>

      <div className={`composer ${dragging ? 'is-dragging' : ''}`}>
        <label htmlFor="material" className="sr-only">
          Notes or topic
        </label>
        <textarea
          id="material"
          className="composer__text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && start()}
          placeholder={'Paste lecture notes here…\n\nor type a topic, like “Fourier series” or “Krebs cycle”'}
          rows={8}
        />

        {items.length > 0 && (
          <ul className="files" aria-label="Uploaded files">
            {items.map((i) => (
              <li key={i.id} className={`file file--${i.status}`}>
                <Icon name={i.kind === 'ai' ? (i.mimeType === 'application/pdf' ? 'file' : 'image') : 'type'} />
                <div className="file__main">
                  <span className="file__name" title={i.path}>
                    {i.path}
                  </span>
                  <span className="file__meta">
                    {i.status === 'reading' && 'Reading…'}
                    {i.status === 'queued' && 'Waiting…'}
                    {i.status === 'extracting' && (
                      <>
                        <span className="spinner spinner--xs" /> AI is reading this file…
                      </>
                    )}
                    {i.status === 'ready' && `${formatBytes(i.size)}, ${i.text.length.toLocaleString()} characters`}
                    {i.status === 'error' && i.error}
                  </span>
                </div>
                {i.status === 'error' && i.kind === 'ai' && (
                  <button className="btn btn--quiet btn--sm" onClick={() => process(i)}>
                    Retry
                  </button>
                )}
                <button className="icon-btn icon-btn--bare" onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.name}`}>
                  <Icon name="x" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="composer__bar">
          <button className="btn btn--quiet" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" /> Add files
          </button>
          <button className="btn btn--quiet" onClick={() => folderInput.current?.click()}>
            <Icon name="folder" /> Add folder
          </button>
          <span className="composer__hint">
            {isTopic
              ? 'Short text with no files is treated as a topic. We’ll teach it from scratch.'
              : totalChars > MAX_MATERIAL
                ? `Only the first ${MAX_MATERIAL.toLocaleString()} of ${totalChars.toLocaleString()} characters will be used.`
                : 'PDF, images, text, Markdown and code files. Drop them anywhere here.'}
          </span>
          <button className="btn btn--primary btn--lg composer__go" onClick={start} disabled={!canStart}>
            {working ? 'Reading files…' : isTopic ? 'Start learning' : 'Start studying'}
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.markdown,.csv,.json,.html,.htm,.tex,.py,.js,.ts,.java,.c,.cpp"
          onChange={(e) => {
            addFiles([...e.target.files].map((file) => ({ file, path: file.name })));
            e.target.value = '';
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          multiple
          webkitdirectory=""
          onChange={(e) => {
            addFiles([...e.target.files].map((file) => ({ file, path: file.webkitRelativePath || file.name })));
            e.target.value = '';
          }}
        />
        {dragging && (
          <div className="dropzone" aria-hidden="true">
            <Icon name="folder" size={28} />
            <p>Drop files or folders to add them</p>
          </div>
        )}
      </div>

      {skipped.length > 0 && (
        <details className="skipped">
          <summary>
            {skipped.length} file{skipped.length > 1 ? 's' : ''} skipped
          </summary>
          <ul>
            {skipped.map((s) => (
              <li key={s.path + s.reason}>
                <b>{s.path}</b>: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="toolkit" aria-label="What you can do with it">
        {TOOLS.map((t) => (
          <div key={t.name} className="toolkit__item">
            <Icon name={t.icon} />
            <div>
              <h2>{t.name}</h2>
              <p>{t.text}</p>
            </div>
          </div>
        ))}
      </section>
      {!hasSpaces && <p className="new__foot">Everything you make is saved in this browser. Nothing is uploaded except to generate study material.</p>}
    </div>
  );
}
