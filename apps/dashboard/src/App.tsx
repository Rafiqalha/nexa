import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { probe } from './lib/api';
import { signOut, useAuth } from './lib/auth';
import { useRoute } from './lib/router';
import { applyStreamMessage, setConnection } from './lib/store';
import { connectStream } from './lib/stream';
import { Aturan } from './pages/Aturan';
import { Intel } from './pages/Intel';
import { Kontak } from './pages/Kontak';
import { Login } from './pages/Login';
import { PosKomando } from './pages/PosKomando';

function Shell({ operator }: { operator: string }) {
  const route = useRoute();

  useEffect(() => connectStream({ onMessage: applyStreamMessage, onState: setConnection }), []);

  return (
    <div className="flex min-h-screen flex-wrap">
      <Sidebar active={route.page} operator={operator} onSignOut={signOut} />
      <main className="min-w-0 flex-[999_1_560px] px-5 pt-10 pb-14 sm:px-12">
        {route.page === 'pos' ? <PosKomando /> : null}
        {route.page === 'kontak' ? <Kontak id={route.id} /> : null}
        {route.page === 'intel' ? <Intel /> : null}
        {route.page === 'aturan' ? <Aturan /> : null}
      </main>
    </div>
  );
}

export function App() {
  const auth = useAuth();
  const [proxyAuth, setProxyAuth] = useState<boolean | null>(null);

  // Mode dev opsional: proxy Vite menyisipkan token (DASHBOARD_DEV_AUTOAUTH=1).
  useEffect(() => {
    if (auth.token) return;
    void probe({}).then(setProxyAuth);
  }, [auth.token]);

  if (auth.token) return <Shell operator={auth.operator} />;
  if (proxyAuth === null) return null;
  return <Login proxyAuth={proxyAuth} />;
}
