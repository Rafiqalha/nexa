// Simulasi pengunjung MANUSIA lewat sensor (port publik lab) untuk mengukur false-positive
// deteksi. Hanya menyasar lab: http://localhost:8080 (allowlist). Header browser lengkap,
// aset CSS dimuat seperti browser, jeda baca acak, dan hanya tautan yang TERLIHAT diikuti
// (manusia tidak melihat honeylink tersembunyi).
//
//   node scripts/lab-human.mjs [--visitors 8] [--pages 6] [--seed 1] [--fast] [--label manusia]
//
// --fast: jeda 1–3 detik (pengunjung yang mengklik cepat) untuk menguji heuristik ritme.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flag, OUTPUT_DIR, openDb } from './lib/lab-data.mjs';

const args = process.argv.slice(2);
const BASE = new URL(flag(args, '--base', 'http://localhost:8080/'));
const ALLOWED = new Set(['localhost:8080', '127.0.0.1:8080']);
if (!ALLOWED.has(BASE.host)) {
  console.error(`Target ${BASE.host} di luar allowlist lab (${[...ALLOWED].join(', ')}).`);
  process.exit(2);
}
const visitors = Number(flag(args, '--visitors', '8'));
const pages = Number(flag(args, '--pages', '6'));
const fast = args.includes('--fast');
const label = flag(args, '--label', fast ? 'manusia-cepat' : 'manusia');
let seed = Number(flag(args, '--seed', '1')) >>> 0;

function rand() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + rand() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// UA berbeda per seed: sesi = sidik IP+UA, jadi run beruntun dengan UA sama akan tergabung
// ke sesi run sebelumnya (idle timeout 60 detik) dan merusak pengukuran.
const runSeed = seed;
const build = (v) => 7000 + ((runSeed * 37 + v * 11) % 900);
const UA_BASE = [
  (v) =>
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.${build(v)}.54 Safari/537.36`,
  (v) =>
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:14${(runSeed + v) % 10}.0) Gecko/20100101 Firefox/14${(runSeed + v) % 10}.0 (${build(v)})`,
  (v) =>
    `Mozilla/5.0 (Linux; Android 14; SM-A5${(runSeed + v) % 10}${v}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.${build(v)}.61 Mobile Safari/537.36`,
  (v) =>
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.${(runSeed + v) % 10} Safari/605.1.15 (${build(v)})`,
];

function visibleLinks(html) {
  const out = [];
  for (const m of html.matchAll(/<a\s+([^>]*)>/gi)) {
    const attrs = m[1];
    if (/display\s*:\s*none|aria-hidden\s*=\s*"true"|visibility\s*:\s*hidden/i.test(attrs))
      continue;
    const href = /href="([^"]+)"/i.exec(attrs)?.[1];
    if (href?.startsWith('/') && !href.startsWith('//')) out.push(href);
  }
  return out;
}

function navHeaders(ua, referer) {
  return {
    'user-agent': ua,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': referer ? 'same-origin' : 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    ...(referer ? { referer } : {}),
  };
}

async function visit(index) {
  const ua = UA_BASE[index % UA_BASE.length](index);
  const trail = [];
  let path = '/';
  let referer = null;
  for (let step = 0; step < pages; step++) {
    const url = new URL(path, BASE).href;
    const res = await fetch(url, { headers: navHeaders(ua, referer), redirect: 'manual' });
    const html = await res.text();
    trail.push(`${res.status} GET ${path}`);
    // Browser memuat stylesheet segera setelah dokumen.
    if (html.includes('/static/style.css')) {
      await fetch(new URL('/static/style.css', BASE), {
        headers: {
          'user-agent': ua,
          accept: 'text/css,*/*;q=0.1',
          'accept-language': 'id-ID,id;q=0.9',
          'sec-fetch-dest': 'style',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'same-origin',
          referer: url,
        },
      }).then((r) => r.arrayBuffer());
    }
    await sleep(fast ? between(1_000, 3_000) : between(3_000, 15_000));
    // Sepertiga pengunjung mencoba login sekali (dengan kata sandi salah).
    if (step === 2 && index % 3 === 0) {
      const loginUrl = new URL('/login', BASE).href;
      const r = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          ...navHeaders(ua, loginUrl),
          'content-type': 'application/x-www-form-urlencoded',
          origin: BASE.origin,
        },
        body: 'username=budi.s&password=salah-ketik-123',
        redirect: 'manual',
      });
      await r.text();
      trail.push(`${r.status} POST /login`);
      await sleep(fast ? between(1_000, 3_000) : between(4_000, 12_000));
    }
    const links = visibleLinks(html);
    referer = url;
    path = links.length > 0 && rand() > 0.15 ? links[Math.floor(rand() * links.length)] : '/';
  }
  return { ua, trail };
}

const startedAt = new Date();
console.log(
  `[lab-human] ${visitors} pengunjung, ${pages} halaman, jeda ${fast ? '1–3' : '3–15'} detik -> ${BASE.origin}`,
);
const results = await Promise.all(Array.from({ length: visitors }, (_, i) => visit(i)));
await sleep(1_000);

const db = openDb();
// Sesi yang aktif selama run ini (bukan hanya yang dibuat run ini) agar penggabungan
// sesi tidak membuat pengunjung "hilang".
const byUa = db.prepare(
  'select * from sessions where user_agent = ? and last_seen_at >= ? order by first_seen_at',
);
const rows = results.map((r) => {
  const sessions = byUa.all(r.ua, startedAt.getTime() - 1_000);
  const worst = sessions.find((s) => s.classification !== 'legit') ?? sessions[0];
  return {
    ua: r.ua,
    requests: r.trail.length,
    sessions: sessions.length,
    classification: worst?.classification ?? 'tidak tercatat',
    score: worst?.score ?? null,
    reasons: worst ? JSON.parse(worst.reasons || '[]') : [],
    trapped: sessions.some((s) => s.trapped_at !== null),
  };
});
const flagged = rows.filter(
  (r) => r.classification === 'suspect' || r.classification === 'agent',
).length;
const trapped = rows.filter((r) => r.trapped).length;
const missing = rows.filter((r) => r.sessions === 0).length;
if (missing > 0) {
  console.error(
    `[lab-human] PERINGATAN: ${missing} pengunjung tanpa sesi tercatat; hasil run ini tidak valid.`,
  );
}
console.log(`[lab-human] false-positive: ${flagged}/${rows.length} ditandai, ${trapped} dijebak`);
for (const r of rows) {
  console.log(
    `  ${r.classification.padEnd(7)} skor ${String(r.score).padEnd(5)} ${r.reasons.join(',') || '-'}  ${r.ua.slice(0, 70)}`,
  );
}
mkdirSync(OUTPUT_DIR, { recursive: true });
const file = join(
  OUTPUT_DIR,
  `human-${startedAt.toISOString().replace(/[:.]/g, '-')}-${label}.json`,
);
writeFileSync(
  file,
  `${JSON.stringify({ kind: 'human-sim', label, fast, visitors, pages, seed: runSeed, startedAt: startedAt.toISOString(), valid: missing === 0, flagged, trapped, missing, rows, trails: results }, null, 2)}\n`,
);
console.log(`[lab-human] laporan: ${file}`);
