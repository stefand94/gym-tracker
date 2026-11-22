import { useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { IconBody, IconChart, IconHistory, IconHome } from './components/Icons';
import { Body } from './screens/Body';
import { HistoryDetail, HistoryList } from './screens/History';
import { Home } from './screens/Home';
import { Progress } from './screens/Progress';
import { RoutineEditor } from './screens/RoutineEditor';
import { Settings } from './screens/Settings';
import { WorkoutScreen } from './screens/WorkoutScreen';
import { useStore } from './state/store';
import { useSync } from './state/useSync';
import { APP_VERSION } from './version';

function Nav() {
  const { state } = useStore();
  const tabs = [
    { to: state.active ? '/workout' : '/', label: state.active ? 'Workout' : 'Home', icon: <IconHome />, live: !!state.active, end: true },
    { to: '/body', label: 'Body', icon: <IconBody /> },
    { to: '/progress', label: 'Progress', icon: <IconChart /> },
    { to: '/history', label: 'History', icon: <IconHistory /> },
  ];
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {tabs.map((t) => (
          <NavLink key={t.label} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className={t.live ? 'live-dot' : ''}>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function App() {
  const sync = useSync();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      {/* Frosted strip behind the status bar, so content doesn't scroll under the clock. The version sits on top of it,
          not inside it: iOS blurs a child of a backdrop-filtered element along with what's behind it. */}
      <div className="status-strip" aria-hidden />
      <span className="app-version">v{APP_VERSION}</span>
      <main className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workout" element={<WorkoutScreen />} />
          <Route path="/body" element={<Body />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/progress/:id" element={<Progress />} />
          <Route path="/history" element={<HistoryList />} />
          <Route path="/history/:id" element={<HistoryDetail />} />
          <Route path="/settings" element={<Settings syncNow={sync} />} />
          <Route path="/routines/new" element={<RoutineEditor key="new" />} />
          <Route path="/routines/:id" element={<RoutineEditor />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Nav />
    </>
  );
}
