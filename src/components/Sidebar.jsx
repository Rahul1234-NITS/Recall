import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { timeAgo } from './ui.jsx';

export function Brand() {
  return (
    <span className="brand">
      <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3" y="5" width="22" height="16" rx="3" fill="var(--sheet)" stroke="var(--ink)" strokeWidth="2" transform="rotate(-6 14 13)" />
        <rect x="8" y="11" width="21" height="16" rx="3" fill="var(--ink)" />
        <path d="M12 20h11" stroke="var(--hl)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      Recall
    </span>
  );
}

export function Sidebar({ spaces, activeId, onOpen, onNew, onDelete, theme, onToggleTheme, onDiagnostics, labOn, open, onClose }) {
  const [confirming, setConfirming] = useState(null);

  return (
    <>
      <div className={`scrim scrim--nav ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Study spaces">
        <div className="sidebar__top">
          <Brand />
          <button className="icon-btn icon-btn--bare sidebar__close" onClick={onClose} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>

        <button className={`newbtn ${activeId === null ? 'is-on' : ''}`} onClick={onNew}>
          <Icon name="plus" /> New study space
        </button>

        <h2 className="sidebar__label">Your spaces</h2>
        {spaces.length === 0 ? (
          <p className="sidebar__empty">Spaces you create appear here, saved in this browser.</p>
        ) : (
          <ul className="spaces">
            {spaces.map((s) => (
              <li key={s.id} className={s.id === activeId ? 'is-on' : ''}>
                {confirming === s.id ? (
                  <div className="spaces__confirm">
                    <span>Delete this space?</span>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => {
                        onDelete(s.id);
                        setConfirming(null);
                      }}
                    >
                      Delete
                    </button>
                    <button className="btn btn--quiet btn--sm" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="spaces__item" onClick={() => onOpen(s.id)} aria-current={s.id === activeId ? 'page' : undefined}>
                      <span className="spaces__title">{s.title}</span>
                      <span className="spaces__meta">
                        {s.sources.length ? `${s.sources.length} source${s.sources.length > 1 ? 's' : ''}` : 'Topic'}, {timeAgo(s.updatedAt)}
                      </span>
                    </button>
                    <button className="icon-btn icon-btn--bare spaces__del" onClick={() => setConfirming(s.id)} aria-label={`Delete ${s.title}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="sidebar__foot">
          <button className="footbtn" onClick={onToggleTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="footbtn" onClick={onDiagnostics}>
            <Icon name="wrench" /> Diagnostics {labOn && <span className="footbtn__flag">on</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
