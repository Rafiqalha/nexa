import { Radar, ShieldCheck } from 'lucide-react';
import { ContactsTable } from '../components/ContactsTable';
import { CostMeter } from '../components/CostMeter';
import { PageHeader } from '../components/PageHeader';
import { RulesPanel } from '../components/RulesPanel';
import { SummaryStats } from '../components/SummaryStats';
import { useAuth, useCan } from '../lib/auth';
import { navItem } from '../lib/nav';
import { REGISTER_HASH } from '../lib/router';
import { useAppState } from '../lib/store';

/**
 * Dashboard baru (belum ada sesi terjebak): jelaskan dari mana data akan datang, sesuai mode.
 * Produksi: trafik nyata ke situs yang dilindungi. Lab: agen uji `pnpm lab:attack`.
 */
function GettingStarted({ publicSiteUrl }: { publicSiteUrl: string | null }) {
  const status = useAuth().status;
  const canManageUsers = useCan('users:manage');
  const production = status?.mode === 'production';
  return (
    <section aria-labelledby="mulai-title" className="max-w-[72ch]">
      <h2 id="mulai-title" className="mb-3 flex items-center gap-2 text-[16px] font-medium text-fg">
        <Radar aria-hidden="true" strokeWidth={1.75} className="size-[18px] text-muted" />
        Sensor aktif, belum ada sesi terjebak
      </h2>
      {production ? (
        <p className="text-[14px] text-fg-2">
          Setiap akses ke situs yang dilindungi melewati NEXA. Begitu agen AI penyerang terdeteksi,
          sesinya muncul di sini secara langsung beserta estimasi token yang dibakarnya.
          {publicSiteUrl ? (
            <>
              {' '}
              Situs yang dilindungi:{' '}
              <a
                className="font-mono text-fg underline underline-offset-4"
                href={publicSiteUrl}
                target="_blank"
                rel="noreferrer"
              >
                {publicSiteUrl.replace(/^https?:\/\//, '')}
              </a>
              .
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-[14px] text-fg-2">
          Jalankan <code className="font-mono text-fg">pnpm lab:attack</code> untuk data simulasi
          lab.
        </p>
      )}
      {canManageUsers ? (
        <p className="meta mt-3">
          {status?.registrationOpen
            ? `Tim bisa mendaftar sendiri di ${window.location.origin}/${REGISTER_HASH} sebagai Pemantau, atau diundang dengan peran lain di menu Pengguna.`
            : 'Pendaftaran mandiri ditutup; undang tim di menu Pengguna.'}
        </p>
      ) : null}
    </section>
  );
}

/** Dashboard: meteran biaya, ringkasan, sesi aktif, dan aturan yang menunggu persetujuan. */
export function Dashboard() {
  const { overview } = useAppState();
  const production = useAuth().status?.mode === 'production';
  const nav = navItem('dashboard');
  const fresh =
    overview !== null &&
    overview.summary.trappedSessions === 0 &&
    overview.contacts.length === 0 &&
    overview.pendingRules.length === 0;
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={nav.title} icon={nav.icon} />
      {overview ? (
        <>
          {fresh ? <GettingStarted publicSiteUrl={overview.sensor.publicSiteUrl} /> : null}
          <CostMeter cost={overview.cost} />
          <SummaryStats summary={overview.summary} />
          <div className="flex flex-wrap items-start gap-x-14 gap-y-12">
            <section aria-labelledby="sesi-title" className="min-w-0 flex-[3_1_560px]">
              <h2
                id="sesi-title"
                className="mb-4 flex items-center gap-2 text-[16px] font-medium text-fg"
              >
                <Radar aria-hidden="true" strokeWidth={1.75} className="size-[18px] text-muted" />
                Sesi aktif
              </h2>
              <ContactsTable
                sessions={overview.contacts}
                empty={
                  production
                    ? 'Belum ada sesi mencurigakan.'
                    : 'Belum ada sesi mencurigakan. Jalankan pnpm lab:attack untuk data simulasi lab.'
                }
              />
            </section>
            {/* Panel kanan tetap terlihat saat daftar sesi digulir (layar lebar). */}
            <section
              aria-labelledby="aturan-title"
              className="min-w-0 flex-[2_1_320px] lg:sticky lg:top-[calc(var(--titlebar-h,0px)+24px)] lg:max-h-[calc(100vh-var(--titlebar-h,0px)-48px)] lg:overflow-y-auto"
            >
              <h2
                id="aturan-title"
                className="mb-4 flex items-center gap-2 text-[16px] font-medium text-fg"
              >
                <ShieldCheck
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-[18px] text-muted"
                />
                Aturan menunggu persetujuan
              </h2>
              <RulesPanel rules={overview.pendingRules} />
            </section>
          </div>
        </>
      ) : (
        <p className="meta">Memuat data sensor…</p>
      )}
    </div>
  );
}
