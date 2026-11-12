// Naskah tur produk (FIG. 02): bab, keterangan, perpindahan tampilan, kamera, dan kursor pada
// satu garis waktu global (detik). Polanya mengikuti demo produk berkode (plyxl.com) dan zoom
// otomatis ke titik klik (Screen Studio). Angka berasal dari LAB (median run deepseek-flash di
// docs/metrics.json), jadi ilustrasi tidak melenceng dari data simulasi lab (reel.test.ts).
import { LAB, type ModelResult } from '../content/lab';

function model(name: string): ModelResult {
  const m = LAB.models.find((x) => x.model === name);
  if (!m) throw new Error(`model lab ${name} tidak ada di content/lab.ts`);
  return m;
}

const FLASH = model('deepseek-flash');

export const NUM = {
  /** Halaman umpan yang disajikan sebelum sesi berakhir (median permintaan ditahan). */
  pages: FLASH.heldRequests,
  tokensPerPage: LAB.baitTokensPerPage,
  heldSeconds: FLASH.heldSeconds,
  toApp: FLASH.withNexa,
  toAppWithout: FLASH.withoutNexa,
  timeToTrap: LAB.timeToTrapSeconds,
  intelTokens: FLASH.intelTokens,
  /** LLM_DAILY_TOKEN_BUDGET bawaan sensor (apps/sensor/src/config.ts). */
  dailyBudget: 200_000,
  model: FLASH.model,
} as const;

export interface Chapter {
  label: string;
  start: number;
  end: number;
}

export const CHAPTERS: readonly Chapter[] = [
  { label: 'Deteksi', start: 0, end: 9.5 },
  { label: 'Jebak', start: 9.5, end: 18 },
  { label: 'Canary', start: 18, end: 26.5 },
  { label: 'Intelijen', start: 26.5, end: 35 },
  { label: 'Aturan', start: 35, end: 44.5 },
];

export const DURATION = 44.5;

export const CAPTIONS: ReadonlyArray<{ at: number; text: string }> = [
  { at: 0, text: 'Portal BAYU-7 melayani pengunjung seperti biasa.' },
  { at: 1.9, text: 'Klien otomatis membaca robots.txt. Skornya mulai naik.' },
  { at: 3.7, text: 'Ia mengikuti honeylink tersembunyi. Skor 1,00: agen AI.' },
  { at: 9.5, text: 'Sesinya dibelokkan ke labirin. Aplikasi asli tak lagi melihatnya.' },
  { at: 13.6, text: 'Setiap halaman umpan dibangkitkan dari seed, tanpa LLM.' },
  { at: 18, text: 'Operator membuka linimasa sesi itu.' },
  { at: 20.4, text: 'Agen mengambil kredensial umpan dari berkas konfigurasi…' },
  { at: 22.5, text: '…lalu memakainya. Canary terpicu, bukti tercatat.' },
  { at: 26.5, text: 'Sesi berakhir. Waktunya intelijen pasca-sesi.' },
  { at: 28.9, text: 'Dosir disamarkan dulu: IP, host, dan secret diganti token.' },
  { at: 30.6, text: 'Baru kemudian dirangkum lewat satu pintu ke model.' },
  { at: 35, text: 'Dari sesi itu lahir draf aturan Suricata.' },
  { at: 39.5, text: 'Lolos suricata -T. Menunggu keputusan operator.' },
  { at: 41.5, text: 'Disetujui. Aturan aktif dan keputusannya tercatat.' },
];

export type View = 'dashboard' | 'sesi' | 'intel' | 'aturan';

export const VIEWS: ReadonlyArray<{ at: number; view: View }> = [
  { at: 0, view: 'dashboard' },
  { at: 19.1, view: 'sesi' },
  { at: 28.05, view: 'intel' },
  { at: 36.25, view: 'aturan' },
];

export const CRUMBS: Record<View, string> = {
  dashboard: 'Dashboard',
  sesi: 'Linimasa sesi',
  intel: 'Intelijen',
  aturan: 'Aturan deteksi',
};

/** Detik klik kursor (membuka sesi, Intelijen, Aturan, lalu Setujui). */
export const CLICKS: readonly number[] = [18.95, 27.9, 36.1, 41.4];

/** Waktu peristiwa di dalam tampilan. */
export const AT = {
  feed: [0.5, 1.2, 2.0, 2.8, 3.6],
  signals: [2.2, 2.6, 3.9],
  verdict: 4.5,
  trapped: 4.8,
  timeToTrap: 5.0,
  pagesFrom: 10.0,
  pageEvery: 0.22,
  canaryIssued: 20.6,
  canaryUsed: 22.6,
  redact: [29.0, 29.4, 29.8],
  summary: [30.4, 33.6],
  intelTokens: 33.8,
  rulesPending: 35.2,
  ruleType: [36.8, 39.3],
  ruleValid: 39.5,
  approved: 41.55,
  audit: 41.9,
} as const;

/** Kamera: [detik, jangkar, zoom]. Di antara dua kunci kamera bergerak dengan ease-in-out. */
export const CAMERA: ReadonlyArray<readonly [number, string, number]> = [
  [0, 'stage', 1],
  [1.4, 'stage', 1],
  [2.5, 'feed', 1.45],
  [3.3, 'feed', 1.45],
  [4.3, 'score', 1.6],
  [6.8, 'score', 1.6],
  [8.2, 'stage', 1],
  [9.9, 'stage', 1],
  [11.0, 'burn', 1.55],
  [13.2, 'burn', 1.55],
  [14.4, 'sess', 1.45],
  [16.6, 'sess', 1.45],
  [17.8, 'stage', 1],
  [19.3, 'stage', 1],
  [20.4, 'tl', 1.3],
  [22.0, 'tl', 1.3],
  [22.9, 'tl-alert', 1.75],
  [25.3, 'tl-alert', 1.75],
  [26.4, 'stage', 1],
  [28.3, 'stage', 1],
  [29.2, 'dossier', 1.5],
  [30.2, 'dossier', 1.5],
  [31.1, 'summary', 1.45],
  [33.9, 'summary', 1.45],
  [34.9, 'stage', 1],
  [36.6, 'stage', 1],
  [37.6, 'rule', 1.4],
  [40.2, 'rule', 1.4],
  [41.0, 'approve', 1.9],
  [42.6, 'approve', 1.9],
  [43.8, 'stage', 1],
  [44.5, 'stage', 1],
];

/** Kursor: [detik, jangkar, geser x, geser y] dalam px panggung. */
export const CURSOR: ReadonlyArray<readonly [number, string, number, number]> = [
  [0, 'stage', 380, 260],
  [4.6, 'stage', 380, 260],
  [5.8, 'agent-row', 80, 6],
  [13.4, 'agent-row', 80, 6],
  [14.6, 'sess-agent', 40, 6],
  [19.6, 'sess-agent', 40, 6],
  [22.9, 'tl-alert', 140, 10],
  [26.6, 'tl-alert', 140, 10],
  [27.75, 'nav-intel', -6, 2],
  [28.6, 'nav-intel', -6, 2],
  [30.9, 'summary', 170, 110],
  [35.2, 'summary', 170, 110],
  [35.95, 'nav-aturan', -6, 2],
  [36.8, 'nav-aturan', -6, 2],
  [41.15, 'approve', 6, 6],
  [42.0, 'approve', 6, 6],
  [43.6, 'stage', 380, 260],
  [44.5, 'stage', 380, 260],
];

export const SUMMARY =
  'Klien otomatis [IP-1] menelusuri /arsip-internal/ secara rekursif, mengambil berkas konfigurasi dari [HOST-1], lalu mencoba kredensial umpan [SECRET-1] di /masuk. Pola: enumerasi direktori, pengambilan kredensial, uji login.';

export const RULE =
  'alert http any any -> any any (msg:"NEXA canary credential use"; flow:to_server; http.method; content:"POST"; http.request_body; content:"B7pw-K2Q9-7F3A"; metadata:nexa_kind canary; sid:9100082; rev:1;)';

/** Bab yang sedang diputar pada detik T. */
export function chapterAt(t: number): number {
  const i = CHAPTERS.findIndex((c) => t >= c.start && t < c.end);
  return i < 0 ? CHAPTERS.length - 1 : i;
}

/** Halaman umpan yang sudah disajikan pada detik T. */
export function pagesAt(t: number): number {
  if (t < AT.pagesFrom) return 0;
  return Math.min(NUM.pages, Math.floor((t - AT.pagesFrom) / AT.pageEvery) + 1);
}
