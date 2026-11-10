// Utilitas token login (murni, tanpa sessionStorage) agar mudah dites.

/**
 * Rapikan token yang ditempel operator: buang spasi, awalan `DASHBOARD_TOKEN=` dan tanda
 * kutip pembungkus yang ikut tersalin dari file .env. Token asli tidak memuat karakter itu.
 */
export function normalizeToken(input: string): string {
  let t = input.trim().replace(/^DASHBOARD_TOKEN\s*=\s*/i, '');
  const quoted = /^(['"])(.*)\1$/.exec(t);
  if (quoted) t = quoted[2] ?? '';
  return t.trim();
}

/** Pesan login per status HTTP pemeriksaan token (null = sensor tidak terjangkau). */
export function loginErrorMessage(status: number | null, origin: string): string {
  if (status === null) return `Sensor tidak terjangkau di ${origin}.`;
  if (status === 429) return 'Terlalu banyak token salah. Tunggu 1 menit, lalu coba lagi.';
  if (status === 401 || status === 403) {
    return 'Token ditolak oleh sensor. Tempel nilai DASHBOARD_TOKEN dari .env sensor (tanpa nama variabel dan tanda kutip).';
  }
  return `Sensor menjawab HTTP ${status}. Periksa log sensor.`;
}
