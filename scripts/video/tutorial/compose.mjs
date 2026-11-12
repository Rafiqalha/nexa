// Susun video tutorial NEXA v2 (maks. 10 menit): narasi Chatterbox lokal + footage 2880 px yang
// di-zoom di pasca-produksi + adegan HTML + kartu bab + subtitle + musik dan efek suara orisinal.
//
//   node scripts/video/tutorial/compose.mjs [--draft] [--only-plan]
//
// Alur: rencana linimasa dari durasi narasi → render adegan (Electron) → render footage
// (compositor.py: peta waktu, kamera, sorotan) → sambung dengan dissolve + subtitle + audio.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { median, ROOT } from '../../lib/lab-data.mjs';

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const V = join(ROOT, 'data', 'video');
const T2 = join(V, 'tutorial');
const AUDIO = join(T2, 'audio');
const CLIPS = join(T2, 'clips');
const BUILD = join(T2, draft ? 'build-draft' : 'build');
const SCENES = join(ROOT, 'scripts', 'video', 'scenes');
const board = JSON.parse(
  readFileSync(join(ROOT, 'scripts', 'video', 'tutorial', 'storyboard.json'), 'utf8'),
);
const FPS = 30;
const LEAD = 0.55; // jeda sebelum narasi tiap segmen (= durasi dissolve masuk)
const TAIL = 0.8;
const XF = 0.45;
const BAB = 1.8;
const FRAME = { x: 120, y: 48, w: 1680, h: 945 };
mkdirSync(BUILD, { recursive: true });

const sh = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-3000));
    throw new Error(`${cmd} gagal (${r.status})`);
  }
  return r.stdout;
};
const probe = (file) =>
  Number(
    sh('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nk=1:nw=1',
      file,
    ]).trim(),
  );
const electron = createRequire(join(ROOT, 'apps', 'desktop', 'package.json'))('electron');
const fromDash = createRequire(join(ROOT, 'apps', 'dashboard', 'package.json'));
const fontUrl = (pkg, file) =>
  pathToFileURL(join(fromDash.resolve(`${pkg}/package.json`), '..', 'files', file)).href;
const FONTS_CSS =
  `@font-face{font-family:Geist;src:url('${fontUrl('@fontsource-variable/geist', 'geist-latin-wght-normal.woff2')}') format('woff2');font-weight:100 900}` +
  `@font-face{font-family:'JetBrains Mono';src:url('${fontUrl('@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2')}') format('woff2');font-weight:100 800}`;

// ---------- 1. Narasi ----------
function voiceOf(seg) {
  const json = join(AUDIO, `${seg.id}.json`);
  if (!draft && existsSync(json)) {
    const a = JSON.parse(readFileSync(json, 'utf8'));
    if (a.text !== seg.tts) throw new Error(`narasi ${seg.id} usang: teks berubah, buat ulang`);
    const wav = join(AUDIO, `${seg.id}.wav`);
    const ends = a.alignment.character_end_times_seconds;
    return {
      wav,
      dur: Math.min(probe(wav), Math.max(...ends) + 0.25),
      text: a.text,
      starts: a.alignment.character_start_times_seconds,
      ends,
    };
  }
  if (!draft)
    throw new Error(`narasi ${seg.id} belum ada; jalankan tts_chatterbox.py atau --draft`);
  const dur = seg.tts.length / 14.5;
  const n = seg.tts.length;
  const starts = Array.from({ length: n }, (_, i) => (i / n) * dur);
  return { wav: null, dur, text: seg.tts, starts, ends: starts.map((s) => s + dur / n) };
}
/** Waktu kata dalam narasi; "kata#2" = kemunculan kedua. */
function cueAt(voice, word) {
  if (word == null) return null;
  const [w, nth] = word.split('#');
  let i = -1;
  for (let k = 0; k < Number(nth ?? 1); k++) {
    i = voice.text.indexOf(w, i + 1);
    if (i < 0) return null;
  }
  return voice.starts[i];
}
const segs = board.segments.map((s) => ({ ...s, voice: voiceOf(s) }));
const chapterTitle = Object.fromEntries(board.chapters.map((c) => [c.n, c.title]));

// ---------- 2. Linimasa ----------
const items = [];
let prevChapter = 0;
for (const s of segs) {
  if (s.chapter > 0 && s.chapter !== prevChapter)
    items.push({ id: `bab${s.chapter}`, kind: 'bab', n: s.chapter, dur: BAB });
  prevChapter = s.chapter;
  const extra = s.extra ?? 0;
  items.push({ id: s.id, kind: s.visual.type, seg: s, dur: LEAD + s.voice.dur + TAIL + extra });
}
let acc = 0;
items.forEach((it, k) => {
  it.frames = Math.round(it.dur * FPS);
  it.dur = it.frames / FPS;
  it.start = k === 0 ? 0 : acc - XF * k;
  acc += it.dur;
});
const totalDur = items.at(-1).start + items.at(-1).dur;
const fmt = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
console.log(
  JSON.stringify({
    total: fmt(totalDur),
    seconds: Number(totalDur.toFixed(1)),
    items: items.map((i) => [i.id, Number(i.dur.toFixed(1))]),
  }),
);
// Bab YouTube untuk deskripsi video.
const chapters = [['0:00', 'Pembuka']];
for (const it of items) if (it.kind === 'bab') chapters.push([fmt(it.start), chapterTitle[it.n]]);
writeFileSync(join(T2, 'youtube-bab.txt'), `${chapters.map(([t, n]) => `${t} ${n}`).join('\n')}\n`);
// Linimasa final (mulai & durasi tiap item) untuk alat QA bingkai.
writeFileSync(
  join(BUILD, 'timeline.json'),
  JSON.stringify(items.map((i) => ({ id: i.id, start: i.start, dur: i.dur, lead: LEAD }))),
);
if (args.includes('--only-plan')) process.exit(0);

// ---------- 3. Metadata rekaman ----------
const meta = JSON.parse(readFileSync(join(CLIPS, 'record-meta.json'), 'utf8'));
const SRC_W = meta.capture?.width ?? 1920;
const SRC_H = meta.capture?.height ?? 1080;
const scenario = JSON.parse(readFileSync(join(T2, 'scenario.json'), 'utf8'));
const clipStart = (clip) => meta.clips[clip].start;
const snaps = (clip) => meta.anchors[clip] ?? [];
/** Kotak anchor dari snapshot beat (nama) atau snapshot terdekat ke detik sumber `near`. */
function rectOf(clip, query, { beat, near } = {}) {
  let cands = snaps(clip).filter((s) => s.rects?.[query]);
  if (beat) cands = cands.filter((s) => s.name === beat);
  if (!cands.length) {
    console.warn(`anchor tidak ada: ${clip} ${beat ?? ''} ${query}`);
    return null;
  }
  if (near != null) cands.sort((a, b) => Math.abs(a.t - near) - Math.abs(b.t - near));
  return cands[0].rects[query];
}
const beatTime = (clip, name) => snaps(clip).find((s) => s.name === name)?.t;
/**
 * Waktu klik (detik sumber) dari skenario: aksi `click` selesai ±ms + 160 ms setelah t (kursor
 * bergerak dulu); ripple dari aksi `js` terjadi seketika di posisi kursor.
 */
function clickTimes(clip) {
  const st = scenario.steps.find((s) => s.do === 'record' && s.clip === clip);
  return (st?.actions ?? [])
    .filter((a) => a.click || /ripple/.test(a.js ?? ''))
    .map((a) => (a.click ? a.t + ((a.ms ?? 600) + 160) / 1000 : a.t + 0.05));
}

// ---------- 4. Data adegan ----------
function metrics() {
  const d = JSON.parse(readFileSync(join(ROOT, 'docs', 'metrics.json'), 'utf8'));
  const flash = (runs) => runs.filter((r) => r.model === 'deepseek-flash');
  const med = (xs) => Math.round(median(xs));
  const nexa = flash(d.nexaRuns);
  const base = flash(d.baselineRuns);
  const inter = d.nexaRuns.map((r) => r.interrogation ?? {});
  const count = (f) => inter.filter(f).length;
  return {
    runs: d.nexaRuns.length,
    baselineRuns: d.baselineRuns.length,
    detected: `${d.nexaRuns.filter((r) => r.detected).length}/${d.nexaRuns.length}`,
    timeToTrap: median(d.nexaRuns.map((r) => r.timeToTrapS))
      .toFixed(1)
      .replace('.', ','),
    upstream: med(nexa.map((r) => r.upstreamRequests)),
    requests: med(nexa.map((r) => r.requests)),
    baselineReq: med(base.map((r) => r.requests)),
    attackerTokens: med(nexa.map((r) => r.attackerTokens)),
    nexaTokens: med(nexa.map((r) => r.nexaTokens)),
    human: `${d.human.normal.flagged + d.human.fast.flagged}/${d.human.normal.total + d.human.fast.total}`,
    hijack: `${count((x) => x.hijack)}/${d.nexaRuns.length}`,
    leak: `${count((x) => x.leakFull)}/${d.nexaRuns.length}`,
  };
}
const SCENE_CUES = {
  intro: ['Inilah', 'Sugeng', 'masalah yang', 'cara kerja', 'cara memasangnya', 'demo lengkap'],
  masalah: ['Serangan', 'Agen', 'memindai', 'mencari', 'mencoba', 'biaya', 'Pertahanan', 'Maka'],
  arsitektur: [
    'reverse proxy',
    'empat sinyal',
    'user agent',
    'header browser',
    'ritme',
    'honeylink',
    'Pengunjung sah',
    'Begitu skor',
    'dibelokkan',
    'Labirin ini',
    'tidak ada LLM',
    'canary',
    'Begitu canary',
    'Setelah sesi',
    'disamarkan',
    'dirangkum',
    'draf aturan',
    'divalidasi',
    'persetujuan operator',
    'NEXA hanya',
  ],
  'terminal-install': [
    'Yang dibutuhkan',
    'Docker dan Suricata',
    'Clone',
    'pnpm install',
    'pnpm env init',
    'Nyalakan lab',
    'NEXA memilih',
    'Dashboard terbuka',
    'Untuk Windows',
  ],
  hasil: ['Sebelas', 'Tanpa', 'Dengan', 'Agen membakar', 'Dari empat belas', 'Kami juga'],
  outro: ['NEXA', 'sementara', 'Semua', 'Dashboard', 'Matur'],
};
const sceneCues = (seg, names) =>
  Object.fromEntries(
    names
      .map((w) => [w, cueAt(seg.voice, w)])
      .filter(([, v]) => v !== null)
      .map(([w, v]) => [w, LEAD + v]),
  );

// ---------- 5. Rencana footage (peta waktu, kamera, sorotan) ----------
const FULL = [0, 0, SRC_W, SRC_H];
function footagePlan(it) {
  const s = it.seg;
  const e = s.edit ?? {};
  const clip = e.clip ?? s.visual.name;
  const at = (w, d = 0) => {
    const c = cueAt(s.voice, w);
    if (c == null) console.warn(`cue tidak ada di ${s.id}: ${w}`);
    return c == null ? null : LEAD + c + d;
  };
  let timemap;
  let beats = [];
  if (e.realtime) {
    // Live: satu tanda sumber (detik klip) dipasang tepat pada kata cue.
    const markSrc =
      e.mark === 'attack' ? (meta.marks.attack - clipStart(clip)) / 1000 : beatTime(clip, e.mark);
    const srcAtStart = markSrc + (e.offset ?? 0) - (e.cue ? at(e.cue) : 0);
    timemap = [
      [0, srcAtStart],
      [it.dur, srcAtStart + it.dur * (e.speed ?? 1)],
    ];
  } else {
    // Transisi tiap beat = aksi perekam sebelumnya (gulir/klik/navigasi) sampai halaman diam.
    const rec = scenario.steps.find((x) => x.do === 'record' && x.clip === clip);
    const moves = (rec?.actions ?? []).filter(
      (a) =>
        a.scrollTo !== undefined ||
        a.scrollBy ||
        a.click ||
        a.hash ||
        /hash|scroll/.test(a.js ?? ''),
    );
    beats = (e.beats ?? []).map((b, i) => {
      // `src` menimpa detik snapshot bila momen pentingnya (mis. kartu hilang) lebih awal.
      const src = b.src ?? beatTime(clip, b.beat) ?? 0;
      const act = moves.filter((a) => a.t < src - 0.05).at(-1);
      return {
        name: b.beat,
        s: src,
        T: i === 0 ? (b.cue ? at(b.cue, b.shift ?? 0) : 0) : (at(b.cue, b.shift ?? 0) ?? 0),
        tr: b.trans ?? (act ? src - act.t + 0.15 : 1.5),
        keepCamera: Boolean(b.keepCamera),
        play: b.play,
      };
    });
    // Kata terakhir yang masih membahas beat (sorotan/kamera): halaman baru boleh bergulir
    // paling cepat 2 dtk setelahnya, supaya sorotan sempat terbaca.
    const lastCue = beats.map((b) => {
      const ds = [...(e.spots ?? []), ...(e.camera ?? [])].filter(
        (d) => d.beat === b.name && d.cue && !d.keep,
      );
      const cs = ds.map((d) => cueAt(s.voice, d.cue)).filter((c) => c != null);
      return cs.length ? Math.max(b.T, ...cs.map((c) => LEAD + c)) : Number.NEGATIVE_INFINITY;
    });
    // Sisakan tahan ≥ 1,2 dtk di beat sebelumnya; transisi boleh dipercepat sampai 2,2×.
    beats.forEach((b, i) => {
      if (i === 0) {
        b.trOut = 0;
        b.start = 0;
        return;
      }
      // Beat yang menahan kamera (mis. klik di kartu yang sama) tidak perlu menunggu sorotan.
      const prev = beats[i - 1];
      const held = prev.T + Math.max(1.2, prev.play ?? 0);
      const room = b.T - (b.keepCamera ? held : Math.max(held, lastCue[i - 1] + 2.0));
      b.trOut = Math.min(b.tr, Math.max(b.tr / 3, room));
      b.start = b.T - b.trOut;
    });
    timemap = [];
    beats.forEach((b, i) => {
      const next = beats[i + 1];
      if (i === 0) timemap.push([0, Math.max(0, b.s - Math.min(b.T, 1.2))], [b.T, b.s]);
      else timemap.push([b.start, b.s - b.tr], [b.T, b.s]);
      const endOut = next ? next.start : it.dur;
      const nextSrc = next ? next.s - next.tr : b.s + 1e9;
      const play = Math.max(0, Math.min(endOut - b.T, nextSrc - b.s, b.play ?? e.holdPlay ?? 2.5));
      if (play > 0) timemap.push([b.T + play, b.s + play]);
      if (endOut > b.T + play + 0.01) timemap.push([endOut - 0.001, b.s + play]);
    });
    timemap.sort((a, b) => a[0] - b[0]);
  }
  const srcAt = (t) => {
    for (let i = 1; i < timemap.length; i++) {
      const [a, sa] = timemap[i - 1];
      const [b, sb] = timemap[i];
      if (t <= b) return sa + (sb - sa) * (b > a ? (t - a) / (b - a) : 0);
    }
    return timemap.at(-1)[1];
  };
  const camera = [
    {
      t: 0,
      d: 0,
      rect: e.startRect ? (rectOf(clip, e.startRect, { near: srcAt(0) }) ?? FULL) : FULL,
      pad: e.startPad ?? 1,
    },
  ];
  for (const c of e.camera ?? []) {
    const t = c.cue ? at(c.cue, c.shift ?? -0.25) : c.t;
    if (t == null) continue;
    const rect = c.full
      ? FULL
      : (c.rect ?? rectOf(clip, c.anchor, { beat: c.beat, near: srcAt(t + 0.8) }));
    if (!rect) continue;
    camera.push({ t, d: c.d ?? 0.9, rect, pad: c.pad ?? 1.3, min_w: c.minW ?? SRC_W * 0.42 });
  }
  camera.sort((a, b) => a.t - b.t);
  const spots = [];
  for (const sp of e.spots ?? []) {
    const from = at(sp.cue, sp.shift ?? 0.1);
    if (from == null) continue;
    const to = sp.until ? at(sp.until, -0.15) : from + (sp.dur ?? 3);
    const rect = sp.rect ?? rectOf(clip, sp.anchor, { beat: sp.beat, near: srcAt(from + 0.3) });
    if (!rect) continue;
    // Sorotan milik satu beat berhenti sebelum halaman mulai bergulir ke beat berikutnya.
    // Beat pemilik sorotan: eksplisit, atau beat yang sedang tampil saat sorotan mulai.
    let bi = beats.findIndex((x) => x.name === sp.beat);
    if (bi < 0 && beats.length) bi = beats.reduce((k, x, i) => (x.T <= from + 0.01 ? i : k), 0);
    const stop =
      !sp.keep && bi >= 0 && beats[bi + 1] ? beats[bi + 1].start - 0.05 : Number.POSITIVE_INFINITY;
    spots.push({
      from,
      to: Math.min(to ?? from + 3, stop),
      rect,
      label: sp.label ?? null,
      dim: sp.dim ?? 0.55,
    });
  }
  // Saat halaman bergulir/berpindah, kamera mundur ke tampilan penuh kecuali sudah diarahkan.
  for (const b of beats.slice(1)) {
    if (b.keepCamera) continue;
    // Kamera yang masih zoom ke beat lama harus mundur saat halaman mulai bergulir/berpindah.
    const directed = camera.some((c) => Math.abs(c.t - b.start) < 0.35);
    if (!directed)
      camera.push({ t: b.start, d: Math.min(0.8, Math.max(0.4, b.trOut)), rect: FULL, pad: 1 });
  }
  camera.sort((a, b) => a.t - b.t);
  // Bunyi klik: waktu klik sumber dipetakan ke waktu keluaran segmen.
  const clicks = [];
  for (const c of clickTimes(clip)) {
    for (let t = 0; t < it.dur; t += 1 / FPS) {
      if (Math.abs(srcAt(t) - c) < 0.5 / FPS) {
        clicks.push(t);
        break;
      }
    }
  }
  return { clip, timemap, camera, spots, clicks, srcAt };
}

// Panel terminal agen dari event sesi nyata, sinkron dengan peta waktu segmen serangan.
function terminalData(plan) {
  const sess = JSON.parse(readFileSync(join(CLIPS, 'attack-session.json'), 'utf8'));
  const c0 = clipStart(plan.clip);
  const srcToOut = (src) => {
    const [[o0, s0], [o1, s1]] = plan.timemap;
    return o0 + ((src - s0) * (o1 - o0)) / (s1 - s0);
  };
  const clock = (ms) =>
    new Date(ms)
      .toLocaleTimeString('id-ID', { hour12: false, timeZone: 'Asia/Jakarta' })
      .replaceAll('.', ':');
  const seen = new Set();
  const lines = [];
  for (const ev of sess.events.filter((x) =>
    ['request', 'bait_served', 'honeylink_hit'].includes(x.kind),
  )) {
    const k = `${ev.ts}|${ev.method}|${ev.path}`;
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push({
      t: srcToOut((ev.ts - c0) / 1000),
      clock: clock(ev.ts),
      method: ev.method ?? 'GET',
      path: ev.path ?? '/',
      status: ev.status ?? 200,
    });
  }
  return {
    title: 'agen penyerang · DeepSeek (lab)',
    command: 'pnpm lab:attack',
    note: '# agen AI dengan tool HTTP, maks. 15 langkah',
    startAt: srcToOut((meta.marks.attack - c0) / 1000),
    lines,
  };
}

const CONTEXT = {
  'dashboard-live': 'Dashboard NEXA · serangan berjalan · Data simulasi lab',
  portal: 'Portal BAYU-7 lewat NEXA · tampilan pengunjung biasa',
  sesi: 'Dashboard NEXA · Sesi · Data simulasi lab',
  intel: 'Dashboard NEXA · Intelijen · Data simulasi lab',
  rules: 'Dashboard NEXA · Aturan · Data simulasi lab',
  admin: 'Dashboard NEXA · Pengguna & audit · Data simulasi lab',
};

// ---------- 6. Render adegan & overlay (Electron) ----------
const jobs = [];
const compJobs = [];
for (const it of items) {
  const out = join(BUILD, `${it.id}.mp4`);
  it.file = out;
  if (it.kind === 'bab') {
    jobs.push({
      html: join(SCENES, 'bab.html'),
      out,
      dur: it.dur,
      data: { n: it.n, title: chapterTitle[it.n], chapters: board.chapters },
    });
  } else if (it.kind === 'scene') {
    const name = it.seg.visual.name;
    const data = { cues: sceneCues(it.seg, SCENE_CUES[name] ?? []) };
    if (name === 'hasil') data.metrics = metrics();
    jobs.push({ html: join(SCENES, `${name}.html`), out, dur: it.dur, data });
  } else {
    const plan = footagePlan(it);
    it.plan = plan;
    const band = join(BUILD, `band-${it.id}.png`);
    const ch = it.seg.chapter;
    jobs.push({
      html: join(SCENES, 'band.html'),
      out: band,
      dur: 0,
      transparent: true,
      data: { n: ch || 0, title: ch ? chapterTitle[ch] : 'NEXA', label: CONTEXT[plan.clip] ?? '' },
    });
    const job = {
      src: join(CLIPS, `${plan.clip}.mp4`),
      out,
      fps: FPS,
      frames: it.frames,
      frame: FRAME,
      band,
      timemap: plan.timemap,
      camera: plan.camera,
      spots: plan.spots,
    };
    if (it.seg.visual.pip === 'terminal') {
      const pip = join(BUILD, `${it.id}-pip.mp4`);
      jobs.push({
        html: join(SCENES, 'terminal.html'),
        out: pip,
        dur: it.dur,
        width: 760,
        height: 452,
        data: terminalData(plan),
      });
      const pw = 620;
      job.pip = {
        src: pip,
        w: pw,
        x: FRAME.x + FRAME.w - pw - 22,
        y: FRAME.y + FRAME.h - Math.round((pw * 452) / 760) - 22,
        from: 0.6,
      };
    }
    compJobs.push(job);
  }
}
writeFileSync(join(BUILD, 'scene-jobs.json'), JSON.stringify(jobs));
writeFileSync(join(BUILD, 'comp-jobs.json'), JSON.stringify(compJobs, null, 1));
// --plan-footage: berhenti setelah rencana kamera/sorotan ditulis, untuk ditinjau tanpa render.
if (args.includes('--plan-footage')) process.exit(0);
// --reuse-scenes: adegan HTML yang tidak berubah tidak dirender ulang (hemat ±8 menit).
const sceneJobs = args.includes('--reuse-scenes')
  ? jobs.filter(
      (j) => !existsSync(j.out) || j.html.endsWith('band.html') || j.html.endsWith('terminal.html'),
    )
  : jobs;
writeFileSync(join(BUILD, 'scene-jobs.json'), JSON.stringify(sceneJobs));
console.log(`render ${sceneJobs.length} adegan/overlay…`);
sh(electron, [join(ROOT, 'scripts', 'video', 'lib', 'scene-render.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, SCENE_JOBS: join(BUILD, 'scene-jobs.json'), SCENE_FONTS: FONTS_CSS },
});
console.log(`render ${compJobs.length} segmen footage…`);
sh(
  'python',
  [join(ROOT, 'scripts', 'video', 'tutorial', 'compositor.py'), join(BUILD, 'comp-jobs.json')],
  {
    stdio: 'inherit',
  },
);

// ---------- 7. Subtitle ----------
const sentences = (text) =>
  text
    .split(/(?<=[.?!])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
const MAXC = 60;
function chunks(sentence) {
  if (sentence.length <= MAXC) return [sentence];
  const words = sentence.split(' ');
  const target = sentence.length / Math.ceil(sentence.length / MAXC);
  const lineCost = (i, j) => {
    const text = words.slice(i, j).join(' ');
    if (text.length > MAXC) return Number.POSITIVE_INFINITY;
    return (text.length - target) ** 2 + (/[,:;.?!]$/.test(text) ? 0 : 150) + 400;
  };
  const best = [{ cost: 0, from: -1 }];
  for (let j = 1; j <= words.length; j++) {
    best[j] = { cost: Number.POSITIVE_INFINITY, from: -1 };
    for (let i = 0; i < j; i++) {
      const c = best[i].cost + lineCost(i, j);
      if (c < best[j].cost) best[j] = { cost: c, from: i };
    }
  }
  const out = [];
  for (let j = words.length; j > 0; j = best[j].from)
    out.unshift(words.slice(best[j].from, j).join(' '));
  return out;
}
const cues = [];
for (const it of items) {
  if (!it.seg) continue;
  const v = it.seg.voice;
  const ttsS = sentences(it.seg.tts);
  const subS = sentences(it.seg.sub);
  if (ttsS.length !== subS.length) throw new Error(`${it.id}: jumlah kalimat tts ≠ sub`);
  let pos = 0;
  ttsS.forEach((ts, i) => {
    const at = v.text.indexOf(ts, pos);
    pos = at + ts.length;
    const a = it.start + LEAD + v.starts[Math.max(0, at)];
    const b = it.start + LEAD + v.ends[Math.min(v.ends.length - 1, at + ts.length - 1)];
    const parts = chunks(subS[i]);
    const total = parts.reduce((x, p) => x + p.length, 0);
    let t = a;
    for (const p of parts) {
      const d = ((b - a) * p.length) / total;
      cues.push({ a: t, b: t + d, text: p });
      t += d;
    }
  });
}
const tAss = (x) => {
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${(x % 60).toFixed(2).padStart(5, '0')}`;
};
const tSrt = (x) => {
  const ms = Math.round(x * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
};
writeFileSync(
  join(BUILD, 'subtitle.ass'),
  `${[
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Sub,Geist SemiBold,38,&H00DCE6E8,&H00DCE6E8,&H100D0F0C,&H100D0F0C,0,0,0,0,100,100,0,0,3,10,0,2,160,160,20,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...cues.map((c) => `Dialogue: 0,${tAss(c.a)},${tAss(c.b)},Sub,,0,0,0,,${c.text}`),
  ].join('\n')}\n`,
);
const OUTNAME = draft ? 'nexa-tutorial-draft' : 'nexa-tutorial';
writeFileSync(
  join(V, `${OUTNAME}.srt`),
  cues.map((c, i) => `${i + 1}\n${tSrt(c.a)} --> ${tSrt(c.b)}\n${c.text}\n`).join('\n'),
);

// ---------- 8. Audio: narasi + musik (diredam saat narasi) + efek suara ----------
const sfxDir = join(T2, 'sfx');
sh('python', [join(ROOT, 'scripts', 'video', 'tutorial', 'sfx.py'), sfxDir]);
sh('python', [
  join(ROOT, 'scripts', 'video', 'music.py'),
  '--seconds',
  (totalDur + 1).toFixed(2),
  '--out',
  join(T2, 'bed.wav'),
]);
const events = [];
for (const it of items) {
  if (it.kind === 'bab') events.push(['whoosh', it.start + 0.05]);
  if (it.plan) for (const c of it.plan.clicks) events.push(['click', it.start + c]);
}
events.push(['whoosh', items.find((i) => i.id === 'title').start + 0.05]);

// ---------- 9. Sambung ----------
const inArgs = [];
for (const it of items) inArgs.push('-i', it.file);
const vf = [];
let prev = '0:v';
items.forEach((it, k) => {
  if (k === 0) return;
  vf.push(
    `[${prev}][${k}:v]xfade=transition=fade:duration=${XF}:offset=${it.start.toFixed(3)}[x${k}]`,
  );
  prev = `x${k}`;
});
vf.push(`[${prev}]subtitles=filename=subtitle.ass:fontsdir=fonts[vout]`);
mkdirSync(join(BUILD, 'fonts'), { recursive: true });
copyFileSync(join(V, 'fonts', 'Geist-SemiBold.ttf'), join(BUILD, 'fonts', 'Geist-SemiBold.ttf'));
const af = [];
const voiced = items.filter((it) => it.seg?.voice.wav);
let idx = items.length;
const narrLabels = [];
for (const it of voiced) {
  inArgs.push('-i', it.seg.voice.wav);
  const ms = Math.round((it.start + LEAD) * 1000);
  af.push(`[${idx}:a]aresample=48000,adelay=${ms}|${ms}[n${idx}]`);
  narrLabels.push(`[n${idx}]`);
  idx++;
}
const T = totalDur.toFixed(3);
if (narrLabels.length) {
  af.push(
    `${narrLabels.join('')}amix=inputs=${narrLabels.length}:normalize=0:duration=longest,apad=whole_dur=${T},pan=stereo|c0=c0|c1=c0,asplit=2[narr][key]`,
  );
  inArgs.push('-i', join(T2, 'bed.wav'));
  af.push(
    `[${idx}:a]atrim=0:${T},volume=-15dB,afade=t=in:st=0:d=2.5,afade=t=out:st=${(totalDur - 4).toFixed(3)}:d=4[bed]`,
    '[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=600[ducked]',
  );
  idx++;
  const sfxLabels = [];
  for (const [kind, t] of events) {
    inArgs.push('-i', join(sfxDir, `${kind}.wav`));
    const ms = Math.max(0, Math.round(t * 1000));
    af.push(
      `[${idx}:a]aresample=48000,volume=${kind === 'click' ? -14 : -12}dB,adelay=${ms}|${ms}[s${idx}]`,
    );
    sfxLabels.push(`[s${idx}]`);
    idx++;
  }
  af.push(
    `[narr][ducked]${sfxLabels.join('')}amix=inputs=${2 + sfxLabels.length}:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`,
  );
}
const out = join(V, `${OUTNAME}.mp4`);
sh(
  'ffmpeg',
  [
    '-y',
    '-v',
    'error',
    ...inArgs,
    '-filter_complex',
    [...vf, ...af].join(';'),
    '-map',
    '[vout]',
    ...(narrLabels.length ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : []),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FPS),
    '-t',
    T,
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: 'inherit', cwd: BUILD },
);
console.log(
  JSON.stringify({
    out,
    seconds: Number(probe(out).toFixed(2)),
    srt: join(V, `${OUTNAME}.srt`),
    chapters: join(T2, 'youtube-bab.txt'),
  }),
);
