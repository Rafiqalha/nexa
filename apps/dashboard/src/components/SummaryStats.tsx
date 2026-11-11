import type { Summary } from '@nexa/shared';
import { Crosshair, Layers, type LucideIcon, ShieldAlert, Timer } from 'lucide-react';
import { formatDuration, formatInt } from '../lib/format';
import { staggerStyle, useChangeCount, useCountUp } from '../lib/motion';

function Stat({
  label,
  icon: Icon,
  value,
  format,
  meta,
  index,
}: {
  label: string;
  icon: LucideIcon;
  value: number;
  format: (n: number) => string;
  meta: string;
  index: number;
}) {
  const shown = useCountUp(value);
  const changes = useChangeCount(value);
  return (
    <div
      className="nx-row group min-w-0 border-l border-line-subtle pl-4 transition-colors duration-300 hover:border-line-strong"
      style={staggerStyle(index)}
    >
      <p className="label-caps flex items-center gap-2">
        <Icon
          aria-hidden="true"
          strokeWidth={1.75}
          className="size-4 transition-transform duration-300 group-hover:scale-110"
        />
        {label}
      </p>
      <p className="mt-3 font-mono text-[28px] leading-none font-normal text-fg">
        <span key={changes} className={changes > 0 ? 'nx-tick' : undefined}>
          {format(shown)}
        </span>
      </p>
      <p className="meta mt-2">{meta}</p>
    </div>
  );
}

const int = (n: number) => formatInt(Math.round(n));

/** Ringkasan 4 angka: menghitung naik saat tampil dan berdetak saat berubah. */
export function SummaryStats({ summary }: { summary: Summary }) {
  return (
    <section
      aria-label="Ringkasan"
      className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-8"
    >
      <Stat
        index={0}
        icon={Crosshair}
        label="Sesi terjebak"
        value={summary.trappedSessions}
        format={int}
        meta="total sejak sensor dipasang"
      />
      <Stat
        index={1}
        icon={Timer}
        label="Rata-rata tertahan"
        value={summary.avgHoldSeconds}
        format={(n) => formatDuration(Math.round(n))}
        meta="sejak terjebak s.d. langkah terakhir"
      />
      <Stat
        index={2}
        icon={Layers}
        label="Kedalaman maksimum"
        value={summary.maxDepth}
        format={int}
        meta="tingkat labirin yang dicapai"
      />
      <Stat
        index={3}
        icon={ShieldAlert}
        label="Aturan menunggu"
        value={summary.rulesPending}
        format={int}
        meta={
          summary.rulesValidating > 0
            ? `draf tervalidasi perlu persetujuan · ${formatInt(summary.rulesValidating)} masih divalidasi suricata -T`
            : 'draf tervalidasi perlu persetujuan operator'
        }
      />
    </section>
  );
}
