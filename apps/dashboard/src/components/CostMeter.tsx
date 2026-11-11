import type { Cost } from '@nexa/shared';
import { Cpu, Flame } from 'lucide-react';
import { formatIdr, formatInt } from '../lib/format';
import { useChangeCount, useCountUp } from '../lib/motion';

/** Angka hero yang menghitung naik, dengan hentakan kecil setiap kali nilainya berubah. */
function LiveNumber({ value, className }: { value: number; className: string }) {
  const shown = useCountUp(value);
  const changes = useChangeCount(value);
  return (
    <p className={className}>
      <span key={changes} className={changes > 0 ? 'nx-tick' : undefined}>
        {formatIdr(shown)}
      </span>
    </p>
  );
}

/**
 * Meteran biaya: dua kolom dipisah garis vertikal. Angka penyerang adalah ESTIMASI batas
 * bawah (hanya konten yang disajikan labirin).
 */
export function CostMeter({ cost }: { cost: Cost }) {
  return (
    <section aria-labelledby="meter-title" className="border-y border-line">
      <h2 id="meter-title" className="sr-only">
        Meteran biaya
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="py-8 sm:pr-10">
          <p className="label-caps flex items-center gap-2">
            <Flame aria-hidden="true" strokeWidth={1.75} className="size-4" />
            Biaya dibakar penyerang
          </p>
          <LiveNumber value={cost.attackerIdr} className="hero-number mt-4 text-fg" />
          <p className="meta mt-3">
            {formatInt(cost.attackerTokens)} token · estimasi batas bawah · {cost.attackerModel} ·{' '}
            {formatIdr(cost.attackerPriceIdrPerMTok)}/1 jt token
          </p>
        </div>
        <div className="border-t border-line py-8 sm:border-t-0 sm:border-l sm:pl-10">
          <p className="label-caps flex items-center gap-2">
            <Cpu aria-hidden="true" strokeWidth={1.75} className="size-4" />
            Biaya NEXA
          </p>
          <LiveNumber value={cost.nexaIdr} className="hero-number mt-4 text-accent" />
          <p className="meta mt-3">
            {formatInt(cost.nexaTokens)} token LLM · labirin prosedural tanpa LLM ·{' '}
            {cost.nexaModel === 'local' ? 'model lokal' : cost.nexaModel}
          </p>
        </div>
      </div>
      <p className="meta border-t border-line-subtle py-3">{cost.pricingNote}</p>
    </section>
  );
}
