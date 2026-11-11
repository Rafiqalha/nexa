// Utilitas token yang ditempel pengguna (murni, mudah dites).

/**
 * Rapikan token yang ditempel: buang spasi, awalan `SETUP_TOKEN=` / `DASHBOARD_TOKEN=` dan
 * tanda kutip pembungkus yang ikut tersalin dari file .env atau panel variabel Railway.
 */
export function normalizeToken(input: string): string {
  let t = input.trim().replace(/^(SETUP_TOKEN|DASHBOARD_TOKEN)\s*=\s*/i, '');
  const quoted = /^(['"])(.*)\1$/.exec(t);
  if (quoted) t = quoted[2] ?? '';
  return t.trim();
}

/** Tautan sekali pakai lengkap (origin dashboard + path hash dari server). */
export function absoluteLink(path: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
