import { Radar, ShieldCheck } from 'lucide-react';
import { ContactsTable } from '../components/ContactsTable';
import { CostMeter } from '../components/CostMeter';
import { PageHeader } from '../components/PageHeader';
import { RulesPanel } from '../components/RulesPanel';
import { SummaryStats } from '../components/SummaryStats';
import { navItem } from '../lib/nav';
import { useAppState } from '../lib/store';

/** Dashboard: meteran biaya, ringkasan, sesi aktif, dan aturan yang menunggu persetujuan. */
export function Dashboard() {
  const { overview } = useAppState();
  const nav = navItem('dashboard');
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={nav.title} icon={nav.icon} />
      {overview ? (
        <>
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
                empty="Belum ada sesi mencurigakan. Jalankan pnpm lab:attack untuk data simulasi lab."
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
