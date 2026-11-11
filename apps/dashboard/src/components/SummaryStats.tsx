import type { Summary } from '@nexa/shared';
import { formatDuration, formatInt } from '../lib/format';

function Stat({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="min-w-0">
      <p className="label-caps">{label}</p>
      <p className="mt-3 font-mono text-[28px] leading-none font-normal text-fg">{value}</p>
      <p className="meta mt-2">{meta}</p>
    </div>
  );
}

/** Ringkasan 4 angka (DESIGN.md §7.1 #3). Tanpa ikon, tanpa sparkline. */
export function SummaryStats({ summary }: { summary: Summary }) {
  return (
    <section
      aria-label="Ringkasan"
      className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-8"
    >
      <Stat
        label="Sesi terjebak"
        value={formatInt(summary.trappedSessions)}
        meta="total sejak sensor dipasang"
      />
      <Stat
        label="Rata-rata tertahan"
        value={formatDuration(summary.avgHoldSeconds)}
        meta="sejak terjebak s.d. langkah terakhir"
      />
      <Stat
        label="Kedalaman maksimum"
        value={formatInt(summary.maxDepth)}
        meta="tingkat labirin yang dicapai"
      />
      <Stat
        label="Aturan menunggu"
        value={formatInt(summary.rulesPending)}
        meta={
          summary.rulesValidating > 0
            ? `draf tervalidasi perlu persetujuan · ${formatInt(summary.rulesValidating)} masih divalidasi suricata -T`
            : 'draf tervalidasi perlu persetujuan operator'
        }
      />
    </section>
  );
}
