// Slide "Penjelasan Karya" untuk submission Kartika Cyber Hackathon 2026: PDF 16:9, 1920 × 1080 px.
//
//   node scripts/make-slides.mjs
//
// Sumber: docs/submission/slides/slides.html + slides.css. Skrip ini:
// 1. memeriksa setiap angka bertanda data-m terhadap docs/metrics.json (data simulasi lab, median
//    dengan cara yang sama seperti scripts/lab-metrics.mjs) dan berhenti bila ada yang tidak cocok;
// 2. memasang ikon Lucide asli (data-icon, dari lucide-react milik dashboard), logo Simpul
//    (data-mark), pita loreng prosedural (data-camo), font Geist + JetBrains Mono, dan lebar batang
//    grafik (data-bar ÷ data-of);
// 3. mencetak HTML ke docs/submission/slides.pdf lewat Electron (Chromium), seperti
//    scripts/make-thumbnail.mjs, sambil memeriksa teks yang keluar dari area konten.
// UI flat sesuai DESIGN.md: tanpa gradien, bayangan, glow, blur, badge, atau kartu.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { median, ROOT } from './lib/lab-data.mjs';

const DIR = join(ROOT, 'docs', 'submission', 'slides');
const OUT = join(ROOT, 'docs', 'submission', 'slides.pdf');
const MAX_BYTES = 10_000_000;

const fail = (msg) => {
  console.error(`make-slides: ${msg}`);
  process.exit(1);
};

// ---------- 1. Angka dari docs/metrics.json ----------
const fmt = (x, digits = 0) => Number(x).toLocaleString('id-ID', { maximumFractionDigits: digits });

function metrics() {
  const d = JSON.parse(readFileSync(join(ROOT, 'docs', 'metrics.json'), 'utf8'));
  if (d.label !== 'Data simulasi lab') fail('docs/metrics.json tidak berlabel "Data simulasi lab"');
  const med = (runs, key, digits = 0) => fmt(median(runs.map((r) => r[key])), digits);
  const all = d.nexaRuns;
  const count = (f) => `${all.filter(f).length}/${all.length}`;
  const signals = ['honeylink', 'automation_ua', 'missing_browser_headers', 'fast_timing'];
  const h = d.human;
  const m = {
    runs: String(all.length),
    detected: count((r) => r.detected),
    allSignals: count((r) => signals.every((s) => r.reasons?.includes(s))),
    timeToTrap: med(all, 'timeToTrapS', 1),
    toDraft: med(all, 'detectionToDraftS', 1),
    endToDraft: med(all, 'sessionEndToDraftS', 1),
    drafts: med(all, 'rulesDrafted'),
    human: `${h.normal.flagged + h.fast.flagged}/${h.normal.total + h.fast.total}`,
    humanNormal: `${h.normal.flagged}/${h.normal.total}`,
    humanFast: `${h.fast.flagged}/${h.fast.total}`,
    humanTrapped: String(h.normal.trapped + h.fast.trapped),
    hijack: count((r) => r.interrogation?.hijack),
    disclosed: count((r) => r.interrogation?.disclosed),
    leak: count((r) => r.interrogation?.leakFull),
  };
  for (const [key, model] of [
    ['f', 'deepseek-flash'],
    ['p', 'deepseek-v4-pro'],
  ]) {
    const n = all.filter((r) => r.model === model);
    const b = d.baselineRuns.filter((r) => r.model === model);
    Object.assign(m, {
      [`${key}.runs`]: String(n.length),
      [`${key}.runsBase`]: String(b.length),
      [`${key}.requests`]: med(n, 'requests'),
      [`${key}.requestsBase`]: med(b, 'requests'),
      [`${key}.upstream`]: med(n, 'upstreamRequests'),
      [`${key}.labyrinth`]: med(n, 'labyrinthRequests'),
      [`${key}.held`]: med(n, 'heldS'),
      [`${key}.tokens`]: med(n, 'attackerTokens'),
      [`${key}.tokensBase`]: med(b, 'attackerTokens'),
      [`${key}.nexaTokens`]: med(n, 'nexaTokens'),
      [`${key}.canaryIssued`]: med(n, 'canariesIssued'),
      [`${key}.canaryUsed`]: med(n, 'canariesUsed'),
      [`${key}.mcp`]: med(n, 'mcpCalls'),
    });
  }
  return m;
}

// Kalimat batasan yang dikutip slide 9 harus tetap ada di docs/metrics.md.
const METRICS_MD_PHRASES = ['15 langkah dan 250 ribu token per run'];

// ---------- 2. Aset: ikon Lucide, logo Simpul, loreng, font ----------
const fromDashboard = createRequire(join(ROOT, 'apps', 'dashboard', 'package.json'));
const LUCIDE = join(dirname(fromDashboard.resolve('lucide-react')), '..', 'esm', 'icons');
const fontCss = (pkg) =>
  pathToFileURL(join(fromDashboard.resolve(`${pkg}/package.json`), '..', 'index.css')).href;

async function icon(name, cls) {
  let mod;
  try {
    mod = await import(pathToFileURL(join(LUCIDE, `${name}.mjs`)).href);
  } catch {
    fail(`ikon Lucide "${name}" tidak ada di lucide-react`);
  }
  const body = mod.__iconData.node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  const classes = ['ic', cls].filter(Boolean).join(' ');
  return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const MARK =
  '<svg class="mark" viewBox="6 6 52 52" aria-hidden="true"><path d="M13 53.375V10.625L51 53.375V10.625Z" fill="none" stroke="#E8E6DC" stroke-width="8" stroke-linejoin="bevel"/></svg>';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loreng digital seperti components/Loreng.tsx dashboard (Voronoi Chebyshev), versi pita statis. */
function camo(seed, cols = 160, rows = 4, cell = 12) {
  const rnd = mulberry32(seed);
  const blobs = Array.from({ length: Math.round((cols * rows) / 20) }, () => ({
    x: rnd() * cols,
    y: rnd() * rows,
    tone: 1 + Math.floor(rnd() * 5),
  }));
  let rects = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let best = blobs[0];
      let bestD = Number.POSITIVE_INFINITY;
      for (const b of blobs) {
        const dist = Math.max(Math.abs(b.x - x), Math.abs(b.y - y) * 1.6);
        if (dist < bestD) {
          bestD = dist;
          best = b;
        }
      }
      rects += `<rect class="c${best.tone}" x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
    }
  }
  return `<svg viewBox="0 0 ${cols * cell} ${rows * cell}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// ---------- 3. Rakit HTML ----------
async function build() {
  // Komentar dibuang lebih dulu: isinya menyebut atribut data-* dan tag <section class="slide">.
  let html = readFileSync(join(DIR, 'slides.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const css = readFileSync(join(DIR, 'slides.css'), 'utf8');

  const m = metrics();
  const md = readFileSync(join(ROOT, 'docs', 'metrics.md'), 'utf8').replaceAll('**', '');
  for (const phrase of METRICS_MD_PHRASES) {
    if (!md.includes(phrase)) fail(`docs/metrics.md tidak lagi memuat "${phrase}"`);
  }

  const wrong = [];
  let checked = 0;
  for (const [, , key, text] of html.matchAll(
    /<(\w+)[^>]*?\sdata-m="([^"]+)"[^>]*>([^<]*)<\/\1>/g,
  )) {
    if (!(key in m)) fail(`kunci metrik tidak dikenal: data-m="${key}"`);
    if (text.trim() !== m[key])
      wrong.push(`${key}: slide "${text.trim()}", metrics.json "${m[key]}"`);
    checked++;
  }
  if (wrong.length) fail(`angka tidak cocok dengan docs/metrics.json:\n  ${wrong.join('\n  ')}`);

  const num = (key) => {
    if (!(key in m)) fail(`kunci metrik tidak dikenal: ${key}`);
    return Number(m[key].replaceAll('.', '').replace(',', '.'));
  };
  html = html.replace(/data-bar="([^"]+)" data-of="([^"]+)"/g, (_, a, b) => {
    const pct = (100 * num(a)) / num(b);
    return `style="width: ${pct.toFixed(3)}%"`;
  });

  const slides = (html.match(/<section class="slide/g) ?? []).length;
  const total = css.match(/--total:\s*"(\d+)"/)?.[1];
  if (String(slides) !== total) fail(`--total di slides.css "${total}", jumlah slide ${slides}`);

  const icons = new Map();
  for (const [, name, cls] of html.matchAll(/<i data-icon="([^"]+)"(?: class="([^"]*)")?><\/i>/g)) {
    const k = `${name}|${cls ?? ''}`;
    if (!icons.has(k)) icons.set(k, await icon(name, cls));
  }
  html = html.replace(/<i data-icon="([^"]+)"(?: class="([^"]*)")?><\/i>/g, (_, name, cls) =>
    icons.get(`${name}|${cls ?? ''}`),
  );
  html = html.replaceAll('<i data-mark></i>', MARK);
  html = html.replace(
    /<div class="camo" data-camo="(\d+)"><\/div>/g,
    (_, seed) => `<div class="camo">${camo(Number(seed))}</div>`,
  );

  const head = [
    `<base href="${pathToFileURL(DIR).href}/" />`,
    `<link rel="stylesheet" href="${fontCss('@fontsource-variable/geist')}" />`,
    `<link rel="stylesheet" href="${fontCss('@fontsource-variable/jetbrains-mono')}" />`,
  ].join('\n    ');
  html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    ${head}`);
  if (/data-(m|icon|mark|camo|bar)\b/.test(html.replace(/\sdata-m="[^"]+"/g, ''))) {
    fail('masih ada atribut data-* yang belum diproses');
  }
  return { html, slides, checked, icons: icons.size };
}

// ---------- 4. Cetak PDF ----------
const { html, slides, checked, icons } = await build();
const dir = mkdtempSync(join(tmpdir(), 'nexa-slides-'));
let report;
try {
  const page = join(dir, 'slides.html');
  writeFileSync(page, html);
  const electron = createRequire(join(ROOT, 'apps', 'desktop', 'package.json'))('electron');
  const r = spawnSync(electron, [join(ROOT, 'scripts', 'lib', 'pdf-main.cjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, RENDER_INPUT: page, RENDER_OUTPUT: OUT },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  const line = r.stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith('{'));
  report = JSON.parse(line ?? '{}');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const problems = [];
for (const family of ['Geist Variable', 'JetBrains Mono Variable']) {
  if (!report.fonts?.includes(family)) problems.push(`font ${family} tidak termuat`);
}
if (report.slides !== slides) problems.push(`halaman ${report.slides}, slide ${slides}`);
for (const src of report.brokenImages ?? []) problems.push(`gambar gagal dimuat: ${src}`);
for (const i of report.issues ?? [])
  problems.push(`slide ${i.slide}: ${i.el} ${JSON.stringify(i)}`);
const size = statSync(OUT).size;
if (size > MAX_BYTES) problems.push(`PDF ${size} byte > ${MAX_BYTES} byte`);

console.log(
  `docs/submission/slides.pdf: ${slides} halaman 1920x1080, ${(size / 1e6).toFixed(2)} MB · ${checked} angka cocok dengan docs/metrics.json · ${icons} ikon Lucide`,
);
if (problems.length) fail(`periksa tata letak:\n  ${problems.join('\n  ')}`);
