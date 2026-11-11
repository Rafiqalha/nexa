// Utilitas gerak: angka yang "menghitung naik", deteksi perubahan untuk animasi singkat.
// Semua menghormati prefers-reduced-motion (langsung ke nilai akhir, tanpa animasi).
import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

/**
 * Nilai yang beranimasi menuju `target`: dari 0 saat pertama tampil, lalu dari nilai yang
 * sedang ditampilkan saat target berubah (misalnya biaya penyerang naik lewat SSE).
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const shown = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const v = from + (target - from) * easeOutCubic(p);
      shown.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

/** Penghitung yang naik setiap kali `value` berubah (bukan saat pertama tampil). */
export function useChangeCount(value: unknown): number {
  const [count, setCount] = useState(0);
  const first = useRef(true);
  const prev = useRef(value);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!Object.is(prev.current, value)) {
      prev.current = value;
      setCount((c) => c + 1);
    }
  }, [value]);
  return count;
}

/** Gaya inline untuk indeks animasi bertahap (`.nx-row`). */
export function staggerStyle(index: number): React.CSSProperties {
  return { '--i': index } as React.CSSProperties;
}
