// Saved study sets in localStorage.
// Storage is treated like any other untrusted input: it may be missing, full,
// edited by hand, or written by an older version of the app.

const KEY = 'recall.sessions.v1';
const MAX_SESSIONS = 20;

export function loadSessions() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isValidSession) : [];
  } catch {
    return [];
  }
}

export function saveSessions(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SESSIONS)));
    return true;
  } catch {
    return false; // private mode / quota exceeded. The app keeps working in memory.
  }
}

function isValidSession(s) {
  return (
    s &&
    typeof s.id === 'string' &&
    s.deck &&
    typeof s.deck.title === 'string' &&
    Array.isArray(s.deck.cards) &&
    Array.isArray(s.deck.quiz)
  );
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
