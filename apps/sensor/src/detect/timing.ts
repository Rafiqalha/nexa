// Analisis waktu antar-request dokumen. Manusia lambat membaca; agen cepat & teratur.

export interface TimingStats {
  /** Jumlah interval yang dianalisis. */
  samples: number;
  medianIntervalMs: number | null;
  /** Koefisien variasi (stdev / mean). Rendah = ritme sangat teratur. */
  cv: number | null;
}

export function analyzeTiming(timestamps: readonly number[]): TimingStats {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    if (cur !== undefined && prev !== undefined) intervals.push(cur - prev);
  }
  if (intervals.length === 0) return { samples: 0, medianIntervalMs: null, cv: null };

  const byValue = [...intervals].sort((a, b) => a - b);
  const mid = Math.floor(byValue.length / 2);
  const median =
    byValue.length % 2 === 0
      ? ((byValue[mid - 1] ?? 0) + (byValue[mid] ?? 0)) / 2
      : (byValue[mid] ?? 0);

  const mean = intervals.reduce((s, x) => s + x, 0) / intervals.length;
  const variance = intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / intervals.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  return { samples: intervals.length, medianIntervalMs: median, cv };
}
