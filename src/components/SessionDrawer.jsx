import { useEffect, useRef } from 'react';

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

export function SessionDrawer({ open, sessions, activeId, onPick, onDelete, onClose }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    panel.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-hidden={!open} aria-label="Saved sets" tabIndex={-1} ref={panel} inert={!open}>
        <header className="drawer__head">
          <h2>Saved sets</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {sessions.length === 0 ? (
          <p className="muted drawer__empty">Nothing saved yet. Every set you generate is kept here on this device.</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => {
              const known = s.progress.known.length;
              return (
                <li key={s.id} className={s.id === activeId ? 'is-active' : ''}>
                  <button className="session-list__main" onClick={() => onPick(s.id)}>
                    <strong>{s.deck.title}</strong>
                    <span className="muted">
                      {timeAgo(s.createdAt)}
                      {s.deck.cards.length > 0 && ` · ${known}/${s.deck.cards.length} known`}
                      {s.progress.bestScore != null && ` · quiz ${s.progress.bestScore}%`}
                    </span>
                  </button>
                  <button className="icon-btn" onClick={() => onDelete(s.id)} aria-label={`Delete ${s.deck.title}`}>
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </>
  );
}
