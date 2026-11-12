import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar, Brand } from './components/Sidebar.jsx';
import { NewSpace } from './components/NewSpace.jsx';
import { SpaceView } from './components/SpaceView.jsx';
import { Diagnostics } from './components/Diagnostics.jsx';
import { Icon } from './components/Icon.jsx';
import { useToast } from './components/ui.jsx';
import { LabContext } from './hooks/useTask.js';
import { useSpaces } from './hooks/useSpaces.js';
import { useTheme } from './hooks/useTheme.js';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const spaces = useSpaces();
  const toast = useToast();
  const [navOpen, setNavOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [lab, setLab] = useState({ scenario: 'off', everyAttempt: false });
  const [fixLog, setFixLog] = useState([]);
  const report = useCallback((entry) => setFixLog((l) => [{ ...entry, at: Date.now() }, ...l].slice(0, 30)), []);
  const labValue = useMemo(() => ({ ...lab, report }), [lab, report]);

  useEffect(() => {
    if (spaces.storageFull) toast('Browser storage is full. Delete old spaces or your latest changes won’t be saved.', 'error');
  }, [spaces.storageFull, toast]);

  const closeNav = useCallback(() => setNavOpen(false), []);
  const closeDiag = useCallback(() => setDiagOpen(false), []);
  const active = spaces.active;

  return (
    <LabContext.Provider value={labValue}>
      <div className="app">
        <Sidebar
          spaces={spaces.spaces}
          activeId={spaces.activeId}
          onOpen={(id) => {
            spaces.open(id);
            closeNav();
          }}
          onNew={() => {
            spaces.open(null);
            closeNav();
          }}
          onDelete={spaces.remove}
          theme={theme}
          onToggleTheme={toggleTheme}
          onDiagnostics={() => {
            setDiagOpen(true);
            closeNav();
          }}
          labOn={lab.scenario !== 'off'}
          open={navOpen}
          onClose={closeNav}
        />

        <div className="main">
          <header className="mobilebar">
            <button className="icon-btn icon-btn--bare" onClick={() => setNavOpen(true)} aria-label="Open menu">
              <Icon name="menu" />
            </button>
            <Brand />
            <button className="icon-btn icon-btn--bare" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </header>

          {lab.scenario !== 'off' && (
            <button className="labflag" onClick={() => setDiagOpen(true)}>
              <Icon name="wrench" size={15} /> Diagnostics is faking “{lab.scenario}” responses. Change it
            </button>
          )}

          <main className="content">
            {active ? (
              <SpaceView key={active.id} space={active} update={spaces.update} />
            ) : (
              <NewSpace onCreate={spaces.add} hasSpaces={spaces.spaces.length > 0} />
            )}
          </main>
        </div>

        <Diagnostics open={diagOpen} onClose={closeDiag} lab={lab} setLab={setLab} log={fixLog} onClearLog={() => setFixLog([])} />
      </div>
    </LabContext.Provider>
  );
}
