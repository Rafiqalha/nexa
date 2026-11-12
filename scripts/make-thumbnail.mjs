// Thumbnail submission 1200 × 630 (≤ 500 KB), juga dipakai sebagai gambar og landing.
//
//   node scripts/make-thumbnail.mjs
//
// Dirender dari HTML oleh Electron (font brand Geist + JetBrains Mono, logo Simpul), UI flat
// sesuai DESIGN.md: tanpa gradien, bayangan, atau glow. Angka dari docs/metrics.json (data
// simulasi lab); potongan UI dari docs/submission/screenshots/1-dashboard.jpg (ambil ulang dengan
// scripts/capture-screenshots.mjs bila dashboard berubah).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/lab-data.mjs';

const OUT = join(ROOT, 'docs', 'submission', 'thumbnail.png');
const OG = join(ROOT, 'apps', 'landing', 'public', 'og.png');
const SHOT = join(ROOT, 'docs', 'submission', 'screenshots', '1-dashboard.jpg');
const MAX_BYTES = 500_000;

const fromDashboard = createRequire(join(ROOT, 'apps', 'dashboard', 'package.json'));
const font = (pkg, file) =>
  pathToFileURL(join(fromDashboard.resolve(`${pkg}/package.json`), '..', 'files', file)).href;
const GEIST = font('@fontsource-variable/geist', 'geist-latin-wght-normal.woff2');
const MONO = font('@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2');

/** Sama dengan logika lama (median atas, model deepseek-flash). */
function metrics() {
  const data = JSON.parse(readFileSync(join(ROOT, 'docs', 'metrics.json'), 'utf8'));
  const flash = (runs) => runs.filter((r) => r.model === 'deepseek-flash');
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const nexa = flash(data.nexaRuns);
  const base = flash(data.baselineRuns);
  const h = data.human;
  return {
    detected: `${data.nexaRuns.filter((r) => r.detected).length}/${data.nexaRuns.length}`,
    upstream: `${med(nexa.map((r) => r.upstreamRequests))}/${med(nexa.map((r) => r.requests))}`,
    baselineReq: med(base.map((r) => r.requests)),
    human: `${h.normal.flagged + h.fast.flagged}/${h.normal.total + h.fast.total}`,
  };
}

const MARK =
  '<svg viewBox="6 6 52 52" width="30" height="30" aria-hidden="true"><path d="M13 53.375V10.625L51 53.375V10.625Z" fill="none" stroke="#E8E6DC" stroke-width="8" stroke-linejoin="bevel"/></svg>';

function html(m) {
  // Potongan dashboard: mulai kolom konten (x 228 CSS px), skala 0,66 agar tembus tepi bawah.
  const s = 0.66;
  return `<!doctype html><html lang="id"><meta charset="utf-8"><style>
@font-face{font-family:Geist;src:url('${GEIST}') format('woff2');font-weight:100 900}
@font-face{font-family:'JetBrains Mono';src:url('${MONO}') format('woff2');font-weight:100 800}
*{box-sizing:border-box}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0C0F0D}
body{position:relative;font-family:Geist,sans-serif;color:#E8E6DC;-webkit-font-smoothing:antialiased}
.left{position:absolute;left:64px;top:58px;bottom:42px;width:540px;display:flex;flex-direction:column;justify-content:space-between}
.lockup{display:flex;align-items:center;gap:12px}
.lockup b{font-weight:600;font-size:21px;letter-spacing:.16em}
h1{margin:0;font-weight:600;font-size:42px;line-height:1.08;letter-spacing:-.02em}
.sub{margin:18px 0 0;max-width:490px;font-size:17px;line-height:1.5;color:#B9BDB0}
.metrics{margin-top:40px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;border-top:1px solid #232A24;padding-top:22px}
.metrics b{display:block;font-family:'JetBrains Mono',monospace;font-weight:500;font-size:32px;line-height:1;font-variant-numeric:tabular-nums}
.metrics span{display:block;margin-top:10px;font-size:13px;line-height:1.4;color:#8E9686}
.foot{margin:0;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#8E9686}
.shot{position:absolute;left:640px;top:64px;width:600px;height:600px;overflow:hidden;border-top:1px solid #343D35;border-left:1px solid #343D35;border-top-left-radius:2px}
.shot img{position:absolute;left:${-228 * s}px;top:0;width:${1440 * s}px;height:${900 * s}px}
</style><body>
<div class="left">
  <div class="lockup">${MARK}<b>NEXA</b></div>
  <div>
    <h1>Deception defensif<br>untuk agen AI penyerang</h1>
    <p class="sub">Deteksi di reverse proxy, labirin umpan prosedural, canary, dan draf rule Suricata yang menunggu persetujuan operator.</p>
    <div class="metrics">
      <div><b>${m.detected}</b><span>agen AI terdeteksi dan dijebak</span></div>
      <div><b>${m.upstream}</b><span>permintaan agen sampai ke aplikasi asli (tanpa NEXA: ${m.baselineReq})</span></div>
      <div><b>${m.human}</b><span>pengunjung manusia (simulasi) ditandai</span></div>
    </div>
  </div>
  <p class="foot">Kartika Cyber Hackathon 2026 · Penangkalan · Data simulasi lab</p>
</div>
<div class="shot"><img src="${pathToFileURL(SHOT).href}" alt=""></div>
</body></html>`;
}

const dir = mkdtempSync(join(tmpdir(), 'nexa-thumb-'));
try {
  const page = join(dir, 'thumbnail.html');
  writeFileSync(page, html(metrics()));
  const electron = createRequire(join(ROOT, 'apps', 'desktop', 'package.json'))('electron');
  const r = spawnSync(electron, [join(ROOT, 'scripts', 'lib', 'render-main.cjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      RENDER_INPUT: page,
      RENDER_OUTPUT: OUT,
      RENDER_WIDTH: '1200',
      RENDER_HEIGHT: '630',
    },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const size = statSync(OUT).size;
if (size > MAX_BYTES) {
  console.error(`thumbnail ${size} byte > ${MAX_BYTES} byte`);
  process.exit(1);
}
copyFileSync(OUT, OG);
console.log(`docs/submission/thumbnail.png (+ apps/landing/public/og.png): 1200x630, ${size} byte`);
