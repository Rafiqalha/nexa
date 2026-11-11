import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { probe } from './lib/api';
import { signOut, useAuth } from './lib/auth';
import { navItem } from './lib/nav';
import { useRoute } from './lib/router';
import { applyStreamMessage, setConnection } from './lib/store';
import { connectStream } from './lib/stream';
import { TITLEBAR_HEIGHT, useWindowControlsOverlay } from './lib/windowControls';
import { Aturan } from './pages/Aturan';
import { Dashboard } from './pages/Dashboard';
import { Intel } from './pages/Intel';
import { Login } from './pages/Login';
import { Sesi } from './pages/Sesi';

function Shell({ operator }: { operator: string }) {
  const route = useRoute();
  const section = route.page === 'sesi' && route.id ? 'Linimasa sesi' : navItem(route.page).title;

  useEffect(() => connectStream({ onMessage: applyStreamMessage, onState: setConnection }), []);
  useEffect(() => {
    document.title = `NEXA — ${section}`;
  }, [section]);

  return (
    <>
      <TitleBar section={section} showStatus />
      <div className="flex min-h-screen flex-wrap pt-[var(--titlebar-h,0px)]">
        <Sidebar active={route.page} operator={operator} onSignOut={signOut} />
        <main className="min-w-0 flex-[999_1_560px] px-5 pt-10 pb-14 sm:px-12">
          {/* key: konten beranimasi masuk setiap kali rute berganti. */}
          <div key={`${route.page}:${route.id ?? ''}`} className="nx-page">
            {route.page === 'dashboard' ? <Dashboard /> : null}
            {route.page === 'sesi' ? <Sesi id={route.id} /> : null}
            {route.page === 'intel' ? <Intel /> : null}
            {route.page === 'aturan' ? <Aturan /> : null}
          </div>
        </main>
      </div>
    </>
  );
}

export function App() {
  const auth = useAuth();
  const [proxyAuth, setProxyAuth] = useState<boolean | null>(null);
  const overlay = useWindowControlsOverlay();

  // Tinggi bilah judul kustom (0 di browser biasa) dipakai tata letak lewat variabel CSS.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--titlebar-h',
      overlay ? `${TITLEBAR_HEIGHT}px` : '0px',
    );
  }, [overlay]);

  // Mode dev opsional: proxy Vite menyisipkan token (DASHBOARD_DEV_AUTOAUTH=1).
  useEffect(() => {
    if (auth.token) return;
    document.title = 'NEXA — Masuk';
    void probe({}).then(setProxyAuth);
  }, [auth.token]);

  if (auth.token) return <Shell operator={auth.operator} />;
  if (proxyAuth === null) return <TitleBar section="Masuk" showStatus={false} />;
  return (
    <>
      <TitleBar section="Masuk" showStatus={false} />
      <Login proxyAuth={proxyAuth} />
    </>
  );
}
