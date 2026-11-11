import { can, type Principal, ROLE_LABELS } from '@nexa/shared';
import { useEffect } from 'react';
import { AuthLayout } from './components/AuthLayout';
import { PageHeader } from './components/PageHeader';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { Button } from './components/ui/button';
import { refreshAuth, signOut, useAuth } from './lib/auth';
import { navItem, PUBLIC_TITLES } from './lib/nav';
import { type AppPage, isPublicPage, useRoute } from './lib/router';
import { applyStreamMessage, setConnection } from './lib/store';
import { connectStream } from './lib/stream';
import { TITLEBAR_HEIGHT, useWindowControlsOverlay } from './lib/windowControls';
import { Akun } from './pages/Akun';
import { Aturan } from './pages/Aturan';
import { Audit } from './pages/Audit';
import { Dashboard } from './pages/Dashboard';
import { Intel } from './pages/Intel';
import { Login } from './pages/Login';
import { Pengaturan } from './pages/Pengaturan';
import { Pengguna } from './pages/Pengguna';
import { ResetSandi } from './pages/ResetSandi';
import { Sesi } from './pages/Sesi';
import { Tagihan } from './pages/Tagihan';
import { Undangan } from './pages/Undangan';

function Forbidden({ page, principal }: { page: AppPage; principal: Principal }) {
  const item = navItem(page);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={item.title} icon={item.icon} />
      <p className="max-w-[72ch] text-[14px] text-fg-2">
        Peran Anda ({ROLE_LABELS[principal.role]}) tidak punya akses ke halaman ini. Minta admin
        organisasi mengubah peran bila Anda membutuhkannya.
      </p>
    </div>
  );
}

function PageView({
  page,
  id,
  mustEnable2fa,
}: {
  page: AppPage;
  id: string | null;
  mustEnable2fa: boolean;
}) {
  switch (page) {
    case 'dashboard':
      return <Dashboard />;
    case 'sesi':
      return <Sesi id={id} />;
    case 'intel':
      return <Intel />;
    case 'aturan':
      return <Aturan />;
    case 'pengguna':
      return <Pengguna />;
    case 'tagihan':
      return <Tagihan />;
    case 'pengaturan':
      return <Pengaturan />;
    case 'audit':
      return <Audit />;
    case 'akun':
      return <Akun mustEnable2fa={mustEnable2fa} />;
  }
}

function Shell({
  principal,
  orgName,
  mustEnable2fa,
}: {
  principal: Principal;
  orgName: string;
  mustEnable2fa: boolean;
}) {
  const route = useRoute();
  // Admin yang wajib 2FA tapi belum mengaktifkannya hanya bisa membuka Akun.
  const page: AppPage = mustEnable2fa || isPublicPage(route.page) ? 'akun' : route.page;
  const item = navItem(page);
  const allowed = !item.permission || can(principal.role, item.permission);
  const section = page === 'sesi' && route.id ? 'Linimasa sesi' : item.title;

  useEffect(() => {
    if (mustEnable2fa) return;
    return connectStream({ onMessage: applyStreamMessage, onState: setConnection });
  }, [mustEnable2fa]);
  useEffect(() => {
    document.title = `NEXA — ${section}`;
  }, [section]);

  return (
    <>
      <TitleBar section={section} showStatus />
      <div className="flex min-h-screen flex-wrap pt-[var(--titlebar-h,0px)]">
        <Sidebar
          active={page}
          principal={principal}
          orgName={orgName}
          onSignOut={() => void signOut()}
        />
        <main className="min-w-0 flex-[999_1_560px] px-5 pt-10 pb-14 sm:px-12">
          {/* key: konten beranimasi masuk setiap kali rute berganti. */}
          <div key={`${page}:${route.id ?? ''}`} className="nx-page">
            {allowed ? (
              <PageView page={page} id={route.id} mustEnable2fa={mustEnable2fa} />
            ) : (
              <Forbidden page={page} principal={principal} />
            )}
          </div>
        </main>
      </div>
    </>
  );
}

export function App() {
  const { status, offline } = useAuth();
  const route = useRoute();
  const overlay = useWindowControlsOverlay();

  useEffect(() => {
    void refreshAuth();
  }, []);

  // Tinggi bilah judul kustom (0 di browser biasa) dipakai tata letak lewat variabel CSS.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--titlebar-h',
      overlay ? `${TITLEBAR_HEIGHT}px` : '0px',
    );
  }, [overlay]);

  const principal = status?.principal ?? null;
  useEffect(() => {
    if (!principal) document.title = 'NEXA — Masuk';
  }, [principal]);

  // Undangan & reset kata sandi bisa dibuka tanpa login.
  if (isPublicPage(route.page) && !principal) {
    return (
      <>
        <TitleBar section={PUBLIC_TITLES[route.page]} showStatus={false} />
        {route.page === 'undangan' ? (
          <Undangan token={route.id} />
        ) : (
          <ResetSandi token={route.id} />
        )}
      </>
    );
  }
  if (!status) {
    return (
      <>
        <TitleBar section="Masuk" showStatus={false} />
        {offline ? (
          <AuthLayout title="Sensor tidak terjangkau">
            <p className="text-[14px] text-fg-2">
              Dashboard tidak bisa menghubungi API sensor di {window.location.origin}.
            </p>
            <Button className="mt-6" variant="secondary" onClick={() => void refreshAuth()}>
              Coba lagi
            </Button>
          </AuthLayout>
        ) : null}
      </>
    );
  }
  if (!principal) {
    return (
      <>
        <TitleBar section={status.needsSetup ? 'Penyiapan awal' : 'Masuk'} showStatus={false} />
        <Login status={status} />
      </>
    );
  }
  return (
    <Shell principal={principal} orgName={status.orgName} mustEnable2fa={status.mustEnable2fa} />
  );
}
