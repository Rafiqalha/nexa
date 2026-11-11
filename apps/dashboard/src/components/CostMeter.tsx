import type { Cost } from '@nexa/shared';
import { Cpu, Flame } from 'lucide-react';
import { formatInt } from '../lib/format';
import { useChangeCount, useCountUp } from '../lib/motion';
import { cn } from '../lib/utils';

/**
 * Ukuran angka hero: maksimum 56px (DESIGN.md §3.1), mengecil mengikuti lebar kolom
 * (container query) dan panjang angka agar angka + satuan selalu satu baris tanpa meluap.
 * Lebar satu digit JetBrains Mono = 0,6em; 64px = jarak + satuan "token".
 */
function heroFontSize(chars: number): string {
  return `clamp(24px, calc((100cqw - 64px) / ${(chars * 0.6).toFixed(2)}), 56px)`;
}

/** Jumlah token (angka hero) yang menghitung naik, dengan hentakan kecil setiap kali bertambah. */
function LiveTokens({
  value,
  chars,
  className,
}: {
  value: number;
  /** Panjang angka terpanjang di meteran: kedua kolom memakai ukuran yang sama. */
  chars: number;
  className: string;
}) {
  const shown = useCountUp(value);
  const changes = useChangeCount(value);
  return (
    <p
      className={cn('flex items-baseline gap-x-3 whitespace-nowrap', className)}
      style={{ fontSize: heroFontSize(chars) }}
    >
      <span key={changes} className={changes > 0 ? 'nx-tick' : undefined}>
        {formatInt(Math.round(shown))}
      </span>
      <span className="font-sans text-[16px] font-normal tracking-normal text-muted">token</span>
    </p>
  );
}

/**
 * Meteran token: dua kolom dipisah garis vertikal. Token penyerang adalah ESTIMASI batas
 * bawah (karakter yang disajikan labirin ÷ rasio karakter-per-token); token NEXA adalah
 * pemakaian LLM intel pasca-sesi yang tercatat di budget harian sensor.
 */
export function CostMeter({ cost }: { cost: Cost }) {
  const charsPerToken = cost.charsPerToken.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const chars = Math.max(formatInt(cost.attackerTokens).length, formatInt(cost.nexaTokens).length);
  return (
    <section aria-labelledby="meter-title" className="border-y border-line">
      <h2 id="meter-title" className="sr-only">
        Meteran token
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="@container min-w-0 py-8 sm:pr-10">
          <p className="label-caps flex items-center gap-2">
            <Flame aria-hidden="true" strokeWidth={1.75} className="size-4" />
            Token dibakar penyerang
          </p>
          <LiveTokens
            value={cost.attackerTokens}
            chars={chars}
            className="hero-number mt-4 text-fg"
          />
          <p className="meta mt-3">
            estimasi batas bawah · 1 token ≈ {charsPerToken} karakter umpan
          </p>
        </div>
        <div className="@container min-w-0 border-t border-line py-8 sm:border-t-0 sm:border-l sm:pl-10">
          <p className="label-caps flex items-center gap-2">
            <Cpu aria-hidden="true" strokeWidth={1.75} className="size-4" />
            Token dipakai NEXA
          </p>
          <LiveTokens
            value={cost.nexaTokens}
            chars={chars}
            className="hero-number mt-4 text-accent"
          />
          <p className="meta mt-3">
            LLM intel pasca-sesi · labirin prosedural tanpa LLM ·{' '}
            {cost.nexaModel === 'local' ? 'model lokal' : cost.nexaModel}
          </p>
        </div>
      </div>
      <p className="meta border-t border-line-subtle py-3">
        Token penyerang dihitung dari konten yang disajikan labirin saja (prompt sistem, riwayat
        yang dikirim ulang, dan output agen tidak dihitung), jadi angka ini batas bawah. Token NEXA
        tercatat dari pemakaian LLM intel pasca-sesi.
      </p>
    </section>
  );
}
