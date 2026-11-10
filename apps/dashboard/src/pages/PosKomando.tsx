import { ContactsTable } from '../components/ContactsTable';
import { CostMeter } from '../components/CostMeter';
import { PageHeader } from '../components/PageHeader';
import { RulesPanel } from '../components/RulesPanel';
import { SummaryStats } from '../components/SummaryStats';
import { useAppState } from '../lib/store';

/** Pos Komando (DESIGN.md §7.1): header, meteran biaya, ringkasan, kontak + aturan. */
export function PosKomando() {
  const { overview } = useAppState();
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Pos Komando" />
      {overview ? (
        <>
          <CostMeter cost={overview.cost} />
          <SummaryStats summary={overview.summary} />
          <div className="flex flex-wrap gap-x-14 gap-y-12">
            <section aria-labelledby="kontak-title" className="min-w-0 flex-[3_1_560px]">
              <h2 id="kontak-title" className="mb-4 text-[16px] font-medium">
                Kontak aktif
              </h2>
              <ContactsTable
                sessions={overview.contacts}
                empty="Belum ada kontak mencurigakan. Jalankan pnpm lab:attack untuk data simulasi lab."
              />
            </section>
            <section aria-labelledby="aturan-title" className="min-w-0 flex-[2_1_320px]">
              <h2 id="aturan-title" className="mb-4 text-[16px] font-medium">
                Aturan menunggu persetujuan
              </h2>
              <RulesPanel rules={overview.pendingRules} />
            </section>
          </div>
        </>
      ) : (
        <p className="text-muted">Memuat data sensor…</p>
      )}
    </div>
  );
}
