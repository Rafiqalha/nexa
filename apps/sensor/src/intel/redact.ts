// Redaksi WAJIB sebelum data apa pun keluar ke penyedia model (AGENTS.md §2.3, FR-14).
// Menyamarkan IP, hostname, path internal, email, dan secret/token dengan penanda
// konsisten ([IP-1], [HOST-2], ...) agar pola tetap terbaca tanpa membocorkan nilai asli.
import { CANARY_TOKEN_PATTERN } from '../labyrinth/generator';

/** Teks yang SUDAH melewati redaksi. Hanya `Redactor.redact` yang bisa membuatnya. */
export type RedactedText = string & { readonly __brand: 'redacted' };

type Category = 'SECRET' | 'EMAIL' | 'HOST' | 'IP' | 'PATH';

const SECRET_PATTERNS: readonly RegExp[] = [
  new RegExp(CANARY_TOKEN_PATTERN.source, 'g'),
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\b(?:api[_-]?key|token|password|passwd|secret|sandi)\s*[=:]\s*[^\s,;"'}]+/gi,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_HOST = /\b(https?:\/\/)([^/\s:'"]+)/gi;
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const IPV6 =
  /(?<![\w:])(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}(?![\w:])|(?<![\w:])::1(?![\w:])|\bfe80::[0-9a-f:]+/gi;
const FQDN =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:internal|local|lan|corp|test|intra|home|localdomain|mil|id|com|net|org|io|dev|cloud)\b/gi;
const UNIX_PATH =
  /(?<![\w\]])\/(?:home|root|etc|var|srv|opt|usr|tmp|mnt|data|app|rules|proc)(?:\/[\w.@-]+)+/g;
const WIN_PATH = /\b[A-Za-z]:\\(?:[^\\\s"'<>|]+\\)*[^\\\s"'<>|]*/g;

export class Redactor {
  private readonly maps = new Map<Category, Map<string, string>>();
  private readonly extraHosts: RegExp | null;

  /** extraHosts: nama host satu-label internal (mis. "target-app", "sensor", "localhost"). */
  constructor(extraHosts: readonly string[] = ['localhost', 'target-app', 'sensor', 'suricata']) {
    const names = extraHosts
      .map((h) => h.trim().toLowerCase())
      .filter((h) => /^[a-z0-9.-]+$/.test(h))
      .map((h) => h.replace(/\./g, '\\.'));
    this.extraHosts = names.length > 0 ? new RegExp(`\\b(?:${names.join('|')})\\b`, 'gi') : null;
  }

  private token(cat: Category, value: string): string {
    let map = this.maps.get(cat);
    if (!map) {
      map = new Map();
      this.maps.set(cat, map);
    }
    const key = cat === 'HOST' || cat === 'EMAIL' ? value.toLowerCase() : value;
    let t = map.get(key);
    if (!t) {
      t = `[${cat}-${map.size + 1}]`;
      map.set(key, t);
    }
    return t;
  }

  redact(input: string): RedactedText {
    let s = input;
    for (const re of SECRET_PATTERNS) s = s.replace(re, (m) => this.token('SECRET', m));
    s = s.replace(EMAIL, (m) => this.token('EMAIL', m));
    s = s.replace(
      URL_HOST,
      (_m, scheme: string, host: string) => `${scheme}${this.token('HOST', host)}`,
    );
    s = s.replace(WIN_PATH, (m) => this.token('PATH', m));
    s = s.replace(UNIX_PATH, (m) => this.token('PATH', m));
    s = s.replace(IPV4, (m) => this.token('IP', m));
    s = s.replace(IPV6, (m) => this.token('IP', m));
    s = s.replace(FQDN, (m) => this.token('HOST', m));
    if (this.extraHosts) s = s.replace(this.extraHosts, (m) => this.token('HOST', m));
    return s as RedactedText;
  }

  /** Jumlah nilai unik yang disamarkan per kategori (untuk audit, tanpa nilai aslinya). */
  stats(): Record<string, number> {
    return Object.fromEntries([...this.maps].map(([cat, m]) => [cat, m.size]));
  }
}
