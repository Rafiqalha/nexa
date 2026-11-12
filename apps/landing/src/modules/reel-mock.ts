// Dashboard NEXA tiruan untuk tur produk (FIG. 02). Tata letak, label, dan ikonnya mengikuti
// dashboard asli (docs/submission/screenshots): bilah atas, sidebar Dashboard/Sesi/Intelijen/
// Aturan, meteran token, linimasa sesi, dan blok aturan dengan tombol Setujui. Ukurannya tetap
// 1280 × 760 px lalu diskalakan kamera. Murni string (diuji reel.test.ts); titik bidik kamera dan
// kursor ditandai data-anchor, elemen yang diubah naskah ditandai data-m.
import { NUM } from './reel-script';

export const STAGE = { w: 1280, h: 760 } as const;

const fmt = (n: number, decimals = 0): string =>
  new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);

const icon = (name: string, size = 16): string =>
  `<span data-icon="${name}" data-size="${size}"></span>`;

const esc = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

interface FeedRow {
  time: string;
  path: string;
  ua: string;
  score: string;
  agent?: boolean;
  bot?: boolean;
}

const FEED: readonly FeedRow[] = [
  { time: '10.46.58', path: '/', ua: 'Mozilla/5.0 (Windows NT 10.0…)', score: '0,00' },
  { time: '10.46.59', path: '/layanan', ua: 'Mozilla/5.0 (Macintosh…)', score: '0,00' },
  { time: '10.47.00', path: '/robots.txt', ua: 'python-httpx/0.27', score: '0,55', bot: true },
  { time: '10.47.00', path: '/kontak', ua: 'Mozilla/5.0 (iPhone…)', score: '0,00' },
  {
    time: '10.47.01',
    path: '/arsip-internal/',
    ua: 'python-httpx/0.27',
    score: '1,00',
    agent: true,
  },
];

/** Sinyal sesi agen: label dan bobot sensor (detect/score.ts, dijaga reel.test.ts). */
export const SIGNALS: ReadonlyArray<readonly [string, number]> = [
  ['UA otomasi', 0.35],
  ['header browser hilang', 0.2],
  ['honeylink /arsip-internal/', 0.7],
];

interface TimelineRow {
  n: number;
  time: string;
  delta: string;
  method: string;
  path: string;
  kind: string;
  detail: string;
  code?: string;
  tokens: number;
  sum: number;
  at?: number;
  alert?: boolean;
}

const TIMELINE = (at: { issued: number; used: number }): readonly TimelineRow[] => [
  {
    n: 26,
    time: '10.47.19',
    delta: '+0,4 dtk',
    method: 'GET',
    path: '/arsip-internal/',
    kind: 'Umpan',
    detail: 'Direktori · kedalaman 1 · HTTP 200',
    tokens: 588,
    sum: 15012,
  },
  {
    n: 27,
    time: '10.47.20',
    delta: '+1,1 dtk',
    method: 'GET',
    path: '/arsip-internal/ops-lat/',
    kind: 'Umpan',
    detail: 'Direktori · kedalaman 2 · HTTP 200',
    tokens: 604,
    sum: 15616,
  },
  {
    n: 28,
    time: '10.47.21',
    delta: '+0,9 dtk',
    method: 'GET',
    path: '/arsip-internal/ops-lat/laporan-operasi-07.md',
    kind: 'Umpan',
    detail: 'Dokumen · kedalaman 3 · HTTP 200',
    tokens: 612,
    sum: 16228,
  },
  {
    n: 29,
    time: '10.47.23',
    delta: '+1,6 dtk',
    method: 'GET',
    path: '/arsip-internal/ops-lat/kunci-integrasi.conf',
    kind: 'Umpan',
    detail: 'Kredensial · kedalaman 4 · HTTP 200',
    tokens: 596,
    sum: 16824,
  },
  {
    n: 30,
    time: '10.47.23',
    delta: '+0 md',
    method: 'GET',
    path: '/arsip-internal/ops-lat/kunci-integrasi.conf',
    kind: 'Canary diberikan',
    detail: '',
    code: 'credential B7pw-K2Q9…7F3A',
    tokens: 0,
    sum: 16824,
    at: at.issued,
  },
  {
    n: 31,
    time: '10.47.27',
    delta: '+4,2 dtk',
    method: 'POST',
    path: '/masuk',
    kind: 'Canary dipakai',
    detail: 'kredensial umpan sesi ini · HTTP 200',
    code: 'credential B7pw-K2Q9…7F3A',
    tokens: 0,
    sum: 16824,
    at: at.used,
    alert: true,
  },
];

function nav(view: string, iconName: string, label: string): string {
  return `<span class="m-nav__item" data-nav="${view}" data-anchor="nav-${view}">${icon(iconName)}${label}</span>`;
}

function kpi(iconName: string, label: string, value: string): string {
  return `<div class="m-kpis__cell"><p class="m-label">${icon(iconName, 14)}${label}</p><p class="m-kpi">${value}</p></div>`;
}

function head(iconName: string, title: string, sub: string, live = false): string {
  return `<div class="m-head">${icon(iconName, 26)}<div><p class="m-h">${title}</p><p class="m-sub">${live ? '<i class="m-dot"></i>' : ''}${sub}</p></div></div>`;
}

function feedRow(r: FeedRow, i: number): string {
  const cls = r.agent ? ' m-row--agent' : r.bot ? ' m-row--bot' : '';
  const anchor = r.agent ? ' data-anchor="agent-row"' : '';
  const verdict = r.agent
    ? '<span class="m-ver" data-m="agent-verdict">menilai…</span>'
    : '<span class="m-ver">diteruskan</span>';
  return `<div class="m-row${cls}" data-feed="${i}"${anchor}><span class="m-t">${r.time}</span><span class="m-meth">GET</span><span class="m-path">${esc(r.path)}</span><span class="m-ua">${esc(r.ua)}</span><span class="m-score">${r.score}</span>${verdict}</div>`;
}

function signalRow([label, weight]: readonly [string, number], i: number): string {
  return `<div class="m-sig" data-signal="${i}"><span>${esc(label)}</span><b>+${fmt(weight, 2)}</b></div>`;
}

function tlRow(r: TimelineRow, i: number): string {
  const cls = r.alert ? ' m-tl__row--alert' : '';
  const anchor = r.alert ? ' data-anchor="tl-alert"' : '';
  const kind = r.alert
    ? `<em class="m-trap">${r.kind}</em>`
    : r.kind === 'Umpan'
      ? `<em>${r.kind}</em>`
      : `<em class="m-strong">${r.kind}</em>`;
  const detail = r.detail ? ` · ${esc(r.detail)}` : '';
  const code = r.code ? `<code>${esc(r.code)}</code>` : '';
  return `<div class="m-tl__row${cls}" data-tl="${i}" data-at="${r.at ?? 0}"${anchor}><span class="m-tl__n"><b>${r.n}</b> ${r.time}<small>${r.delta}</small></span><span class="m-tl__main"><span class="m-tl__req">${r.method} <b>${esc(r.path)}</b></span><small>${kind}${detail}</small>${code}</span><span class="m-tl__tok"><b>${fmt(r.tokens)}</b><small>Σ ${fmt(r.sum)}</small></span></div>`;
}

function redact(i: number, real: string, token: string): string {
  return `<span class="m-redact" data-redact="${i}"><span class="m-redact__real">${esc(real)}</span><span class="m-redact__tok">${esc(token)}</span></span>`;
}

function dashboard(): string {
  return `<section class="m-view" data-view="dashboard">
${head('layout-dashboard', 'Dashboard', 'Sensor aktif · 10.47 WIB · Data simulasi lab', true)}
<div class="m-meter">
  <div class="m-meter__cell" data-anchor="burn"><p class="m-label">${icon('flame', 14)}Token dibakar penyerang</p><p class="m-big"><span data-m="burn">0</span><small>token</small></p><p class="m-note">estimasi · ±${fmt(NUM.tokensPerPage)} token per halaman umpan</p></div>
  <div class="m-meter__cell" data-anchor="nexa"><p class="m-label">${icon('cpu', 14)}Token dipakai NEXA</p><p class="m-big m-big--accent"><span data-m="nexa">0</span><small>token</small></p><p class="m-note">labirin prosedural tanpa LLM · intelijen pasca-sesi</p></div>
</div>
<div class="m-kpis">
  ${kpi('crosshair', 'Sesi terjebak', '<span data-m="k-trapped">0</span>')}
  ${kpi('timer', 'Rata-rata tertahan', '<span data-m="k-held">0</span> dtk')}
  ${kpi('layers', 'Kedalaman maksimum', '<span data-m="k-depth">0</span>')}
  ${kpi('shield', 'Aturan menunggu', '<span data-m="k-rules">0</span>')}
</div>
<div class="m-lower">
  <div class="m-pane is-on" data-m="lower-a">
    <div class="m-panel" data-anchor="feed">
      <p class="m-title">${icon('radar')}Permintaan masuk</p>
      <div class="m-feed">${FEED.map(feedRow).join('')}</div>
    </div>
    <div class="m-panel" data-anchor="score">
      <p class="m-title">Skor sesi · python-httpx/0.27</p>
      ${SIGNALS.map(signalRow).join('')}
      <div class="m-gauge"><span class="m-gauge__fill" data-m="gauge"></span><i class="m-gauge__mark m-gauge__mark--s"></i><i class="m-gauge__mark m-gauge__mark--a"></i></div>
      <div class="m-gauge__legend"><span>0</span><span class="m-gauge__s">dicurigai 0,60</span><span class="m-gauge__a">agen 0,85</span></div>
      <p class="m-total">Skor <b data-m="score">0,00</b><span class="m-cap" data-m="cap">1,25 dibatasi ke 1,00</span></p>
      <p class="m-verdict" data-m="verdict">AGEN AI · dibelokkan ke labirin</p>
      <p class="m-note m-fade" data-m="ttt">terjebak ${fmt(NUM.timeToTrap, 1)} dtk setelah permintaan pertama (median lab)</p>
    </div>
  </div>
  <div class="m-pane" data-m="lower-b">
    <div class="m-panel" data-anchor="sess">
      <p class="m-title">${icon('radar')}Sesi aktif</p>
      <div class="m-table">
        <div class="m-tr m-th"><span>Sumber</span><span>Status</span><span>Skor</span><span>Kedalaman</span><span>Token est.</span><span>Tertahan</span><span>Terakhir</span></div>
        <div class="m-tr" data-anchor="sess-agent"><span><b>203.0.113.47</b><small>Agen AI</small></span><span class="m-trap">Terjebak</span><span>1,00</span><span data-m="s-depth">1</span><span data-m="s-tokens">0</span><span><span data-m="s-held">0</span> dtk</span><span data-m="s-last">10.47.01</span></div>
        <div class="m-tr"><span><b>198.51.100.23</b><small>Manusia</small></span><span>Diteruskan</span><span>0,00</span><span>–</span><span>–</span><span>–</span><span>10.46.58</span></div>
      </div>
      <p class="m-note">Permintaan agen yang sampai ke aplikasi asli: <b>${NUM.toApp}</b> (tanpa NEXA ${NUM.toAppWithout}) · median lab</p>
    </div>
    <div class="m-panel" data-anchor="decoys">
      <p class="m-title">${icon('layers')}Halaman umpan disajikan</p>
      <ol class="m-decoys" data-m="decoys"></ol>
    </div>
  </div>
</div>
</section>`;
}

function sesi(at: { issued: number; used: number }): string {
  return `<section class="m-view" data-view="sesi">
${head('radar', 'Linimasa sesi', '203.0.113.47 · Agen AI · Terjebak · python-httpx/0.27 · Data simulasi lab')}
<div class="m-tl" data-anchor="tl">${TIMELINE(at).map(tlRow).join('')}</div>
</section>`;
}

function intel(): string {
  return `<section class="m-view" data-view="intel">
${head('brain-circuit', 'Intelijen', 'Ringkasan pasca-sesi · sesi 7f3a · Data simulasi lab')}
<div class="m-intel">
  <div class="m-panel" data-anchor="dossier">
    <p class="m-title">${icon('eye-off')}Dosir sesi · disamarkan sebelum keluar</p>
    <pre class="m-code">{
  "sourceIp": "${redact(0, '203.0.113.47', '[IP-1]')}",
  "host": "${redact(1, 'portal.bayu7.latihan.test', '[HOST-1]')}",
  "pages": ${NUM.pages},
  "canaryUsed": "${redact(2, 'B7pw-K2Q9-7F3A', '[SECRET-1]')}"
}</pre>
    <p class="m-note">intel/redact.ts → intel/llm.ts · satu pintu ke model</p>
  </div>
  <div class="m-panel" data-anchor="summary">
    <p class="m-title">${icon('brain-circuit')}Ringkasan model · ${NUM.model}</p>
    <p class="m-summary"><span data-m="summary"></span><span class="m-caret" data-m="summary-caret"></span></p>
    <dl class="m-dl">
      <div class="m-dl__row"><dt>Token NEXA sesi ini</dt><dd data-m="intel-tokens">–</dd></div>
      <div class="m-dl__row"><dt>Budget harian</dt><dd>${fmt(NUM.dailyBudget)} token</dd></div>
      <div class="m-dl__row"><dt>Selama agen tertahan</dt><dd>0 token · labirin tanpa LLM</dd></div>
    </dl>
  </div>
</div>
</section>`;
}

function aturan(): string {
  const buttons = `<span class="m-btn m-btn--primary">${icon('check', 14)}Setujui</span><span class="m-btn">${icon('x', 14)}Tolak</span>`;
  return `<section class="m-view" data-view="aturan">
${head('shield-check', 'Aturan deteksi', 'Sensor aktif · 10.48 WIB · Data simulasi lab', true)}
<p class="m-h2">Menunggu persetujuan</p>
<div class="m-rule" data-anchor="rule">
  <p class="m-rule__title">[Usulan LLM] Pemakaian kredensial canary</p>
  <p class="m-rule__code"><span data-m="rule"></span><span class="m-caret" data-m="rule-caret"></span></p>
  <div class="m-rule__foot">
    <span class="m-rule__meta">sesi 7f3a · <span data-m="rule-valid">memvalidasi…</span> · <span class="m-wait" data-m="rule-status">Menunggu persetujuan</span></span>
    <span class="m-btns"><span class="m-btn m-btn--primary" data-anchor="approve" data-m="approve">${icon('check', 14)}Setujui</span><span class="m-btn">${icon('x', 14)}Tolak</span></span>
  </div>
  <p class="m-audit" data-m="audit">10.48.02 · Operator Lab menyetujui sid:9100082 · record persetujuan tersimpan</p>
</div>
<div class="m-rule m-rule--dim">
  <p class="m-rule__title">[Usulan LLM] Akses honeylink /arsip-internal/</p>
  <p class="m-rule__code">${esc('alert http any any -> any any (msg:"NEXA honeylink access"; flow:to_server; http.uri; content:"/arsip-internal/"; metadata:nexa_kind llm; sid:9100081; rev:1;)')}</p>
  <div class="m-rule__foot"><span class="m-rule__meta">sesi 7f3a · Sintaks valid (suricata -T) · <span class="m-wait">Menunggu persetujuan</span></span><span class="m-btns">${buttons}</span></div>
</div>
</section>`;
}

/** HTML panggung lengkap. Teks aturan yang "diketik" diisi renderer dari RULE. */
export function mockHtml(at: { issued: number; used: number }): string {
  return `<div class="m-app">
<div class="m-top"><span class="m-crumb"><span class="m-logo">N</span><b>NEXA</b><span class="m-sep">/</span><span data-m="crumb">Dashboard</span></span><span class="m-live"><i class="m-dot"></i>Sensor aktif · 10.47 WIB</span></div>
<div class="m-side">
  <div class="m-brand"><span class="m-logo m-logo--lg">N</span><span><b>NEXA</b><small>Deception defensif</small></span></div>
  <div class="m-nav">${nav('dashboard', 'layout-dashboard', 'Dashboard')}${nav('sesi', 'radar', 'Sesi')}${nav('intel', 'brain-circuit', 'Intelijen')}${nav('aturan', 'shield-check', 'Aturan')}</div>
  <div class="m-user">${icon('user')}<span><small>Operator</small>Operator Lab</span>${icon('log-out')}</div>
</div>
<div class="m-main">${dashboard()}${sesi(at)}${intel()}${aturan()}</div>
</div>
<span class="m-ring" data-m="ring"></span>
<span class="m-cursor" data-m="cursor">${icon('mouse-pointer-2', 24)}</span>`;
}
