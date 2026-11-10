import type { Cost } from '@nexa/shared';
import { formatIdr, formatInt } from '../lib/format';

/**
 * Meteran biaya (DESIGN.md §7.1 #2): dua kolom dipisah garis vertikal.
 * Angka penyerang adalah ESTIMASI batas bawah (hanya konten yang disajikan labirin).
 */
export function CostMeter({ cost }: { cost: Cost }) {
  return (
    <section aria-labelledby="meter-title" className="border-y border-line">
      <h2 id="meter-title" className="sr-only">
        Meteran biaya
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="py-8 sm:pr-10">
          <p className="label-caps">Biaya dibakar penyerang</p>
          <p className="hero-number mt-4 text-fg">{formatIdr(cost.attackerIdr)}</p>
          <p className="meta mt-3">
            {formatInt(cost.attackerTokens)} token · estimasi batas bawah · {cost.attackerModel} ·{' '}
            {formatIdr(cost.attackerPriceIdrPerMTok)}/1 jt token
          </p>
        </div>
        <div className="border-t border-line py-8 sm:border-t-0 sm:border-l sm:pl-10">
          <p className="label-caps">Biaya NEXA</p>
          <p className="hero-number mt-4 text-accent">{formatIdr(cost.nexaIdr)}</p>
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
