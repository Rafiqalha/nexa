// Skenario rekaman video tutorial v2: satu run lab nyata, ditangkap 2880 × 1620 (viewport
// 1440 × 810 pada skala 2) supaya zoom di pasca-produksi tetap tajam. Setiap "beat" mencatat
// kotak elemen (anchors) untuk kamera dan sorotan; durasi tahan tidak terikat narasi karena
// compositor memetakan ulang waktu (tahan/putar) mengikuti kata yang diucapkan.
//
//   node scripts/video/tutorial/scenario.mjs > data/video/tutorial/scenario.json
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/lab-data.mjs';

const live = JSON.parse(readFileSync(join(ROOT, 'scripts', 'video', 'scenario-live.json'), 'utf8'));
const waitFor = live.steps.find((s) => s.do === 'waitFor');
const dumpSession = live.steps.find((s) => s.do === 'dump' && s.file === 'attack-session.json');
const dumpRules = live.steps.find((s) => s.do === 'dump' && s.file === 'rules-after.json');

const climb = (q, levels = [0, 1, 2, 3]) => levels.map((n) => (n ? `${q}^${n}` : q));
const beat = (t, name, anchors, extra = {}) => ({ t, name, anchors, settle: 500, ...extra });
const LIVE_Q = [
  ...climb('Token dibakar penyerang'),
  ...climb('Terjebak'),
  ...climb('Sesi terjebak'),
  'css:section[aria-labelledby="sesi-title"]',
  'css:section[aria-labelledby="aturan-title"]',
];

const scenario = {
  view: { width: 1440, height: 810, capture: 2880 },
  steps: [
    { do: 'load', url: 'http://localhost:8081/', wait: 2500 },
    { do: 'login' },
    // Portal BAYU-7 sebagai pengunjung biasa (HTML polos → latar putih seperti browser).
    { do: 'background', color: [255, 255, 255] },
    { do: 'zoom', factor: 1.25 },
    { do: 'load', url: 'http://localhost:8080/', wait: 3000 },
    {
      do: 'record',
      clip: 'portal',
      duration: 16,
      cursorStart: [1100, 620],
      actions: [
        beat(0.6, 'beranda', ['css:h1', 'css:nav', 'css:main', 'css:body']),
        { t: 2.4, click: 'Pengumuman', ms: 900 },
        beat(3.6, 'pengumuman', ['css:h1', 'css:nav', 'css:main']),
        { t: 7.0, click: 'Dokumen', ms: 900 },
        beat(8.2, 'dokumen', ['css:h1', 'css:nav', 'css:main']),
        { t: 11.6, click: 'Beranda', ms: 900 },
        beat(12.8, 'beranda-2', ['css:h1', 'css:nav', 'css:main']),
      ],
    },
    { do: 'background', color: null },
    { do: 'zoom', factor: 1 },
    { do: 'load', url: 'http://localhost:8081/#/', wait: 4500 },
    {
      do: 'record',
      clip: 'dashboard-live',
      duration: 80,
      cursorStart: [1250, 720],
      actions: [
        beat(1.0, 'live', LIVE_Q),
        {
          t: 2.5,
          mark: 'attack',
          name: 'attack',
          spawn: ['scripts/lab.mjs', 'attack', '--', '--label', 'video-tutorial'],
        },
        ...Array.from({ length: 30 }, (_, i) => beat(4 + i * 2.5, 'live', LIVE_Q, { settle: 0 })),
      ].flatMap((a) => (a.t === 9 ? [a, { t: 9.2, moveTo: 'Terjebak', ms: 1100 }] : [a])),
    },
    { ...waitFor },
    { ...dumpSession },
    // Sesi: daftar → detail → canary → linimasa.
    { do: 'js', name: 'buka sesi', code: "window.scrollTo(0, 0); location.hash = '#/sesi'; true" },
    { do: 'sleep', ms: 3500 },
    {
      do: 'record',
      clip: 'sesi',
      duration: 38,
      cursorStart: [1250, 700],
      actions: [
        beat(0.6, 'list', ['css:main', 'css:table', 'css:tbody tr', 'css:main h1']),
        { t: 2.8, moveTo: 'css:tbody tr', ms: 900 },
        { t: 4.2, js: "window.__nx.ripple(); location.hash = '#/sesi/' + window.__sid; true" },
        beat(
          5.6,
          'detail',
          [
            'css:main h1',
            'css:dl',
            ...climb('Sinyal deteksi'),
            ...climb('User agent'),
            ...climb('Klasifikasi'),
            ...climb('Canary dipakai'),
          ],
          { settle: 900 },
        ),
        { t: 9.5, moveTo: 'Sinyal deteksi', ms: 1000 },
        { t: 13, scrollTo: { q: 'Canary dipakai —', offset: 96 }, ms: 1500 },
        beat(15, 'canary', [...climb('Canary dipakai —'), 'css:main']),
        { t: 20, scrollTo: { q: 'Linimasa di dalam labirin', offset: 96 }, ms: 1500 },
        beat(22, 'linimasa', [
          ...climb('Linimasa di dalam labirin'),
          ...climb('/robots.txt'),
          ...climb('/arsip-internal/'),
        ]),
        // Server MCP umpan: gulir sampai baris POST /arsip-internal/mcp pertama terlihat.
        { t: 27, scrollTo: { q: '/arsip-internal/mcp', offset: 330 }, ms: 2200 },
        beat(29.8, 'mcp', [...climb('/arsip-internal/mcp'), 'css:main']),
        { t: 32, moveTo: '/arsip-internal/mcp', ms: 1000 },
      ],
    },
    // Intelijen.
    {
      do: 'js',
      name: 'buka intel',
      code: "window.scrollTo(0, 0); location.hash = '#/intel'; true",
    },
    { do: 'sleep', ms: 3500 },
    {
      do: 'record',
      clip: 'intel',
      duration: 24,
      cursorStart: [1250, 700],
      actions: [
        beat(0.6, 'top', [
          ...climb('Budget LLM hari ini'),
          ...climb('Dugaan model / framework'),
          ...climb('Keyakinan'),
          'css:article',
          'css:article ul',
        ]),
        { t: 3.5, moveTo: 'Dugaan model / framework', ms: 1000 },
        { t: 7.5, moveTo: 'Keyakinan', ms: 900 },
        { t: 11, moveTo: 'Budget LLM hari ini', ms: 1100 },
        { t: 15, scrollBy: 300, ms: 1800 },
        beat(17.2, 'pola', ['css:article', 'css:article ul', 'css:article p']),
      ],
    },
    // Aturan: tinjau → Setujui → riwayat → ekspor.
    {
      do: 'js',
      name: 'buka aturan',
      code: "window.scrollTo(0, 0); location.hash = '#/aturan'; true",
    },
    { do: 'sleep', ms: 3500 },
    {
      do: 'record',
      clip: 'rules',
      duration: 34,
      cursorStart: [1250, 700],
      actions: [
        beat(0.6, 'top', [
          ...climb('Menunggu persetujuan'),
          'css:article',
          ...climb('Setujui'),
          ...climb('Sintaks valid'),
          ...climb('Ekspor nexa.rules'),
        ]),
        { t: 3.5, moveTo: 'Sintaks valid', ms: 1100 },
        { t: 8, mark: 'approve', click: 'Setujui', ms: 1000 },
        beat(10.5, 'approved', ['css:article', ...climb('Menunggu persetujuan')], { settle: 800 }),
        { t: 14, scrollTo: { q: 'Riwayat keputusan', offset: 96 }, ms: 1600 },
        beat(16, 'riwayat', [
          ...climb('Riwayat keputusan'),
          ...climb('Aktif di Suricata'),
          ...climb('Operator Lab'),
        ]),
        { t: 19, moveTo: 'Aktif di Suricata', ms: 1100 },
        { t: 24, scrollTo: 0, ms: 1600 },
        beat(26, 'ekspor', [...climb('Ekspor nexa.rules')]),
        { t: 27.5, moveTo: 'Ekspor nexa.rules', ms: 1000 },
      ],
    },
    { ...dumpRules },
    // Tim: peran pengguna dan log audit.
    {
      do: 'js',
      name: 'buka pengguna',
      code: "window.scrollTo(0, 0); location.hash = '#/pengguna'; true",
    },
    { do: 'sleep', ms: 3500 },
    {
      do: 'record',
      clip: 'admin',
      duration: 20,
      cursorStart: [1250, 700],
      actions: [
        beat(0.6, 'pengguna', [
          'css:main',
          'css:main h1',
          'css:table',
          ...climb('Pemantau'),
          ...climb('Analis'),
        ]),
        { t: 3.5, moveTo: 'Pemantau', ms: 1000 },
        { t: 8, js: "window.__nx.ripple(); location.hash = '#/audit'; true" },
        beat(10, 'audit', ['css:main', 'css:main h1', 'css:table', 'css:tbody tr'], {
          settle: 1200,
        }),
        { t: 12.5, moveTo: 'css:tbody tr', ms: 1000 },
      ],
    },
  ],
};
process.stdout.write(`${JSON.stringify(scenario, null, 2)}\n`);
