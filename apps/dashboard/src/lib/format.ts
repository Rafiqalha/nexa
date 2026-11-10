// Format angka & waktu (locale id-ID, zona WIB). Semua angka tampil dengan font mono tabular.

const intFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const idrSmall = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const timeFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const clockFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
});

export function formatInt(n: number): string {
  return intFmt.format(n);
}

/** Rupiah: dua desimal untuk nilai kecil agar biaya mikro tetap terbaca jujur. */
export function formatIdr(n: number): string {
  if (n === 0) return 'Rp 0';
  return n < 1_000 ? `Rp ${idrSmall.format(n)}` : `Rp ${intFmt.format(Math.round(n))}`;
}

export function formatScore(n: number): string {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt ${s % 60} dtk`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}

export function formatTimeWib(ts: number): string {
  return timeFmt.format(ts);
}

export function formatClockWib(ts: number): string {
  return `${clockFmt.format(ts)} WIB`;
}

export function formatDateTimeWib(ts: number): string {
  return `${dateFmt.format(ts)} ${timeFmt.format(ts)} WIB`;
}

/** Selisih waktu relatif terhadap langkah sebelumnya, mis. "+4,2 dtk". */
export function formatDelta(ms: number): string {
  if (ms < 1_000) return `+${Math.max(0, Math.round(ms))} md`;
  return `+${(ms / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk`;
}
