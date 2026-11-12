// Reading files and whole folders from the user's computer, entirely in the browser.
//
// Text files are read here. PDFs and images can't be read as text in the browser
// without a big library, so they are sent to the AI once ("extract") and the
// resulting text is stored instead of the file.

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm', 'xml', 'tex', 'rst', 'log',
  'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'sql', 'm', 'v', 'vhd', 'sv',
]);
const AI_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|dist|build|__pycache__|\.venv)(\/|$)/;

export const LIMITS = { files: 30, textBytes: 2_000_000, aiBytes: 2_900_000 };

const ext = (name) => name.split('.').pop()?.toLowerCase() ?? '';

/** Sort a FileList / array of { file, path } into accepted and skipped, with a reason for each skip. */
export function triage(entries) {
  const accepted = [];
  const skipped = [];
  for (const { file, path } of entries) {
    const p = path || file.webkitRelativePath || file.name;
    const e = ext(file.name);
    if (file.name.startsWith('.') || SKIP_DIRS.test(p)) continue; // hidden/system: skip silently
    if (accepted.length >= LIMITS.files) {
      skipped.push({ path: p, reason: `only the first ${LIMITS.files} files are used` });
    } else if (TEXT_EXT.has(e)) {
      if (file.size > LIMITS.textBytes) skipped.push({ path: p, reason: 'text file over 2 MB' });
      else accepted.push({ file, path: p, kind: 'text' });
    } else if (AI_TYPES[e]) {
      if (file.size > LIMITS.aiBytes) skipped.push({ path: p, reason: 'over 2.9 MB, split it or paste the text' });
      else accepted.push({ file, path: p, kind: 'ai', mimeType: AI_TYPES[e] });
    } else if (e === 'docx' || e === 'doc' || e === 'pptx' || e === 'ppt') {
      skipped.push({ path: p, reason: 'Word/PowerPoint: save it as PDF first' });
    } else {
      skipped.push({ path: p, reason: 'unsupported file type' });
    }
  }
  return { accepted, skipped };
}

export async function readText(file) {
  const raw = await file.text();
  if (/\.html?$/i.test(file.name)) {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, nav, footer').forEach((n) => n.remove());
    return (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return raw.replace(/\r\n/g, '\n').trim();
}

export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Files from a drop event, including everything inside dropped folders.
 * Uses the (widely supported) webkitGetAsEntry API; falls back to plain files.
 */
export async function filesFromDrop(dataTransfer) {
  const items = [...(dataTransfer.items ?? [])];
  const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dataTransfer.files ?? [])].map((file) => ({ file, path: file.name }));

  const out = [];
  async function walk(entry, prefix) {
    if (out.length > 200) return;
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, path: prefix + file.name });
    } else if (entry.isDirectory) {
      if (SKIP_DIRS.test(`${prefix}${entry.name}/`)) return;
      const reader = entry.createReader();
      // readEntries returns batches; keep reading until empty.
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  }
  for (const entry of entries) await walk(entry, '');
  return out;
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
