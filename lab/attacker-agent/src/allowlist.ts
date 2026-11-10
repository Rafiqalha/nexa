// Allowlist target lab (AGENTS.md §2.7). Setiap URL divalidasi SEBELUM request dikirim.
// Entri: "host" (port bebas) atau "host:port". Pencocokan host persis (tanpa wildcard).

export interface AllowEntry {
  host: string;
  port: number | null;
}

export class TargetNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetNotAllowedError';
  }
}

export function parseAllowlist(raw: string | undefined): AllowEntry[] {
  const entries = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      const m = item.match(/^([a-z0-9.-]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?$/);
      if (!m?.[1]) throw new Error(`entri LAB_TARGET_ALLOWLIST tidak valid: "${item}"`);
      return { host: m[1], port: m[2] ? Number(m[2]) : null };
    });
  if (entries.length === 0) throw new Error('LAB_TARGET_ALLOWLIST kosong: agen menolak berjalan');
  return entries;
}

/** Melempar TargetNotAllowedError bila URL di luar allowlist; mengembalikan URL ter-parse. */
export function assertAllowed(rawUrl: string, allow: readonly AllowEntry[]): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TargetNotAllowedError(`URL tidak valid: ${rawUrl.slice(0, 200)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetNotAllowedError(`skema ${url.protocol} tidak diizinkan`);
  }
  if (url.username || url.password) {
    throw new TargetNotAllowedError('URL dengan kredensial tertanam tidak diizinkan');
  }
  const host = url.hostname.toLowerCase();
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  const ok = allow.some((e) => e.host === host && (e.port === null || e.port === port));
  if (!ok) {
    throw new TargetNotAllowedError(`target ${host}:${port} di luar LAB_TARGET_ALLOWLIST`);
  }
  return url;
}
