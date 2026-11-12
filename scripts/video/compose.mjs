// Susun video demo final: adegan HTML + footage UI nyata + narasi ElevenLabs + subtitle.
//
//   node scripts/video/compose.mjs --landing     rekam footage landing (sinkron dengan narasi)
//   node scripts/video/compose.mjs [--draft]     render adegan, susun, dan ekspor MP4 + SRT
//
// --draft: tanpa audio ElevenLabs (durasi diperkirakan dari jumlah kata), untuk meninjau alur.
// Semua angka di adegan "Hasil lab" dihitung dari docs/metrics.json; footage dari run lab nyata.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { median, ROOT } from '../lib/lab-data.mjs';

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const V = join(ROOT, 'data', 'video');
const AUDIO = join(V, 'audio');
const CLIPS = join(V, 'clips');
const LANDING = join(V, 'clips-landing');
const BUILD = join(V, draft ? 'build-draft' : 'build');
const SCENES = join(ROOT, 'scripts', 'video', 'scenes');
const cfg = JSON.parse(readFileSync(join(ROOT, 'scripts', 'video', 'segments.json'), 'utf8'));
const FPS = 30;
const LEAD = 0.5; // jeda sebelum narasi tiap segmen (= durasi transisi)
const TAIL = 0.75; // jeda setelah narasi
const XF = 0.5; // durasi dissolve antarsegmen
const BAB = 2.1; // kartu bab
const TARGET = 300; // detik
mkdirSync(BUILD, { recursive: true });

const sh = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-2000));
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

// ---------- 1. Narasi dan cue ----------
function voiceOf(seg) {
  const json = join(AUDIO, `${seg.id}.json`);
  if (!draft && existsSync(json)) {
    const a = JSON.parse(readFileSync(json, 'utf8'));
    if (a.text !== seg.tts)
      throw new Error(`audio ${seg.id} usang: teks tts berubah, buat ulang narasinya`);
    const mp3 = join(AUDIO, `${seg.id}.mp3`);
    const ends = a.alignment.character_end_times_seconds;
    // Durasi = akhir kata terakhir + napas pendek; sisa hening/padding MP3 di ujung berkas diabaikan.
    return {
      mp3,
      dur: Math.min(probe(mp3), Math.max(...ends) + 0.2),
      text: a.text,
      starts: a.alignment.character_start_times_seconds,
      ends,
    };
  }
  if (!draft) throw new Error(`audio ${seg.id} belum ada; jalankan tts.mjs atau pakai --draft`);
  const words = seg.tts.split(/\s+/).length;
  const dur = words / 2.25;
  const n = seg.tts.length;
  const starts = Array.from({ length: n }, (_, i) => (i / n) * dur);
  return { mp3: null, dur, text: seg.tts, starts, ends: starts.map((s) => s + dur / n) };
}
const cueAt = (voice, word) => {
  const i = voice.text.indexOf(word);
  return i < 0 ? null : voice.starts[i];
};
const SCENE_CUES = {
  masalah: ['Serangan', 'Agen', 'memindai', 'mencari', 'mencoba', 'biaya', 'Pertahanan', 'Maka'],
  hasil: ['Sebelas', 'Tanpa', 'Dengan', 'Agen membakar', 'Empat belas', 'Interogasi'],
  outro: ['NEXA', 'sementara', 'Semua', 'Dashboard', 'Matur'],
};

const segs = cfg.segments.map((s) => ({ ...s, voice: voiceOf(s) }));
const byId = Object.fromEntries(segs.map((s) => [s.id, s]));

// ---------- 2. Rencana linimasa ----------
const order = [
  's00',
  'bab1',
  's01',
  'bab2',
  's02',
  's03',
  'bab3',
  's04',
  's05',
  's06',
  's07',
  's08',
  'bab4',
  's09',
  'bab5',
  's10',
];
const extra = { s00: 1.2, s05: 2, s10: 2.5 };
const items = order.map((id) => {
  if (id.startsWith('bab')) {
    const n = Number(id.slice(3));
    return { id, kind: 'bab', n, dur: BAB };
  }
  const s = byId[id];
  return { id, kind: s.visual.type, seg: s, dur: LEAD + s.voice.dur + TAIL + (extra[id] ?? 0) };
});
const total = () => items.reduce((a, it) => a + it.dur, 0) - XF * (items.length - 1);
// Isi sisa waktu menuju ±5 menit dengan memperpanjang footage demo (tanpa narasi tambahan). Jedanya
// dibatasi pendek: hening tanpa narasi lebih dari ±4 detik terasa macet. s08 sengaja paling longgar
// agar status "Aktif di Suricata" setelah Setujui sempat terlihat.
const stretch = [
  ['s08', 3],
  ['s05', 2],
  ['s06', 1],
  ['s07', 1],
  ['s04', 1],
];
for (const [id, max] of stretch) {
  const gap = TARGET - total();
  if (gap <= 0.5) break;
  items.find((i) => i.id === id).dur += Math.min(max, gap);
}
let acc = 0;
items.forEach((it, k) => {
  it.frames = Math.round(it.dur * FPS);
  it.dur = it.frames / FPS;
  it.start = k === 0 ? 0 : acc - XF * k;
  acc += it.dur;
});
console.log(
  JSON.stringify({
    total: Number(total().toFixed(2)),
    items: items.map((i) => [i.id, Number(i.dur.toFixed(2))]),
  }),
);

// ---------- 3. Footage landing (direkam setelah narasi agar sinkron) ----------
if (args.includes('--landing')) {
  const at = (id, word, plus = 0) => LEAD + (cueAt(byId[id].voice, word) ?? 0) + plus;
  const s03 = byId.s03;
  const stepCues = s03.visual.cues.map((w) => at('s03', w));
  const URL = process.env.LANDING_URL ?? 'http://localhost:5180/';
  const scenario = {
    view: { width: 1440, height: 810 },
    steps: [
      { do: 'load', url: URL, wait: 1500 },
      // Robot maskot diistirahatkan agar gerak dan balon katanya tidak mengalihkan perhatian.
      { do: 'storage', key: 'nexa-robot', value: 'istirahat' },
      { do: 'load', url: URL, wait: 3500 },
      {
        do: 'record',
        clip: 'landing-arena',
        duration: items.find((i) => i.id === 's02').dur + 1,
        cursorStart: [1180, 660],
        // Hero dulu ("Itulah NEXA"), lalu turun ke FIG. 01 Arena saat narasi masuk ke reverse proxy.
        actions: [
          {
            t: Math.max(0.5, at('s02', 'NEXA berdiri') - 0.2),
            scrollTo: { q: 'css:.arena', offset: 105 },
            ms: 1400,
          },
          { t: at('s02', 'Pengunjung sah') - 1.0, click: 'Kirim pengunjung', ms: 800 },
          { t: at('s02', 'Pengunjung sah') + 1.0, click: 'Kirim pengunjung', ms: 350 },
          { t: at('s02', 'Tetapi') - 0.8, click: 'Lepas agen', ms: 800 },
          { t: at('s02', 'dibelokkan') + 0.3, click: 'Lepas agen', ms: 350 },
        ],
      },
      // Judul seksi "Satu sesi penyerang…" ikut terlihat selama kalimat pembuka.
      {
        do: 'js',
        name: 'ke cara kerja',
        code: "window.scrollTo(0, document.querySelector('#story-title').getBoundingClientRect().top + scrollY - 80); true",
      },
      { do: 'sleep', ms: 1800 },
      {
        do: 'record',
        clip: 'landing-story',
        duration: items.find((i) => i.id === 's03').dur + 1,
        cursorStart: [1400, 790],
        // offset 104 = top sticky panel FIG. 03–08, jadi teks langkah sejajar dengan panelnya.
        actions: stepCues.map((t, k) => ({
          t: Math.max(0.2, t - 0.8),
          scrollTo: { q: `css:#langkah-${k + 1}`, offset: 104 },
          ms: 1000,
        })),
      },
    ],
  };
  const file = join(V, 'scenario-landing.json');
  writeFileSync(file, `${JSON.stringify(scenario, null, 2)}\n`);
  sh(process.execPath, [join(ROOT, 'scripts', 'video', 'record.mjs'), file, '--out', LANDING], {
    stdio: 'inherit',
  });
  process.exit(0);
}

// ---------- 4. Data adegan ----------
// Sama dengan docs/metrics.md: median run deepseek-flash (median genap = rerata dua nilai tengah),
// waktu sampai terjebak dan hitungan deteksi/interogasi dari seluruh run.
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
const sceneCues = (seg, names) =>
  Object.fromEntries(
    names
      .map((w) => [w, cueAt(seg.voice, w)])
      .filter(([, v]) => v !== null)
      .map(([w, v]) => [w, LEAD + v]),
  );

// Panel terminal penyerang: permintaan nyata dari sesi serangan (timestamp sensor).
function terminalData(item) {
  const meta = JSON.parse(readFileSync(join(CLIPS, 'record-meta.json'), 'utf8'));
  const sess = JSON.parse(readFileSync(join(CLIPS, 'attack-session.json'), 'utf8'));
  const clipStart = meta.clips['dashboard-live'].start;
  const spawnAt = meta.marks.attack;
  const inPoint = item.inPoint;
  const clock = (ms) =>
    new Date(ms)
      .toLocaleTimeString('id-ID', { hour12: false, timeZone: 'Asia/Jakarta' })
      .replaceAll('.', ':');
  const http = sess.events.filter((e) =>
    ['request', 'bait_served', 'honeylink_hit', 'interrogation_reply'].includes(e.kind),
  );
  const seenReq = new Set();
  const lines = [];
  for (const e of http) {
    const k = `${e.at ?? e.ts}|${e.method}|${e.path}`;
    if (seenReq.has(k)) continue;
    seenReq.add(k);
    const ts = e.at ?? e.ts;
    lines.push({
      t: (ts - clipStart) / 1000 - inPoint,
      clock: clock(ts),
      method: e.method ?? 'GET',
      path: e.path ?? '/',
      status: e.status ?? 200,
    });
  }
  return {
    title: 'agen penyerang · DeepSeek (lab)',
    command: 'pnpm lab:attack',
    note: '# agen AI dengan tool HTTP, 15 langkah',
    startAt: (spawnAt - clipStart) / 1000 - inPoint,
    lines,
  };
}

// ---------- 5. Render adegan & overlay ----------
const jobs = [];
const chapterTitle = Object.fromEntries(cfg.chapters.map((c) => [c.n, c.title]));
for (const it of items) {
  const out = join(BUILD, `${it.id}-scene.mp4`);
  if (it.kind === 'bab') {
    jobs.push({
      html: join(SCENES, 'bab.html'),
      out,
      dur: it.dur,
      data: { n: it.n, title: chapterTitle[it.n], chapters: cfg.chapters },
    });
    it.src = out;
  } else if (it.kind === 'scene') {
    const name = it.seg.visual.name;
    const data = { cues: sceneCues(it.seg, SCENE_CUES[name] ?? []) };
    if (name === 'hasil') data.metrics = metrics();
    jobs.push({ html: join(SCENES, `${name}.html`), out, dur: it.dur, data });
    it.src = out;
  }
}
// Footage tampil berbingkai: pita atas (bab + konteks layar), UI utuh di tengah, pita bawah untuk
// subtitle, jadi subtitle tidak pernah menutupi bagian UI yang sedang dibicarakan.
const FRAME = { x: 120, y: 48, w: 1680, h: 945 };
const CONTEXT = {
  'landing-arena': 'nexa-deception.vercel.app · FIG. 01 Arena (ilustrasi)',
  'landing-story': 'nexa-deception.vercel.app · Cara kerja',
  portal: 'Portal BAYU-7 lewat NEXA · tampilan pengunjung biasa',
  'dashboard-live': 'Dashboard NEXA · serangan berjalan · Data simulasi lab',
  timeline: 'Dashboard NEXA · Linimasa sesi · Data simulasi lab',
  intel: 'Dashboard NEXA · Intelijen · Data simulasi lab',
  rules: 'Dashboard NEXA · Aturan · Data simulasi lab',
};
for (const it of items) {
  if (it.kind !== 'footage') continue;
  it.band = join(BUILD, `band-${it.id}.png`);
  jobs.push({
    html: join(SCENES, 'band.html'),
    out: it.band,
    dur: 0,
    transparent: true,
    data: {
      n: it.seg.chapter,
      title: chapterTitle[it.seg.chapter],
      label: CONTEXT[it.seg.visual.name] ?? '',
    },
  });
}

// In-point footage: momen kunci jatuh tepat pada kata yang diucapkan.
const meta = existsSync(join(CLIPS, 'record-meta.json'))
  ? JSON.parse(readFileSync(join(CLIPS, 'record-meta.json'), 'utf8'))
  : null;
for (const it of items) {
  if (it.kind !== 'footage') continue;
  const name = it.seg.visual.name;
  let inPoint = 0.4;
  if (name === 'dashboard-live' && meta) {
    const spawn = (meta.marks.attack - meta.clips['dashboard-live'].start) / 1000;
    inPoint = spawn - (LEAD + (cueAt(it.seg.voice, 'lepaskan') ?? 0.6));
  }
  if (name === 'rules' && meta) {
    const click = (meta.marks.approve - meta.clips.rules.start) / 1000 + 1.36;
    inPoint = click - (LEAD + (cueAt(it.seg.voice, 'Setujui') ?? 4) + 0.15);
  }
  if (name.startsWith('landing-')) inPoint = 0;
  it.inPoint = inPoint;
  it.clip = join(name.startsWith('landing-') ? LANDING : CLIPS, `${name}.mp4`);
  if (it.seg.visual.pip === 'terminal') {
    const out = join(BUILD, `${it.id}-pip.mp4`);
    jobs.push({
      html: join(SCENES, 'terminal.html'),
      out,
      dur: it.dur,
      width: 760,
      height: 452,
      data: terminalData(it),
    });
    it.pip = out;
  }
}
writeFileSync(join(BUILD, 'jobs.json'), JSON.stringify(jobs));
console.log(`render ${jobs.length} adegan/overlay…`);
sh(electron, [join(ROOT, 'scripts', 'video', 'lib', 'scene-render.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, SCENE_JOBS: join(BUILD, 'jobs.json'), SCENE_FONTS: FONTS_CSS },
});

// ---------- 6. Segmen ternormalisasi ----------
for (const [k, it] of items.entries()) {
  const out = join(BUILD, `seg-${String(k).padStart(2, '0')}.mp4`);
  const inputs = [];
  const filters = [];
  if (it.kind === 'footage') {
    const len = probe(it.clip);
    const pre = Math.max(0, -it.inPoint);
    const ss = Math.max(0, it.inPoint);
    const post = Math.max(0, ss + it.dur - pre - len + 0.1);
    inputs.push('-ss', ss.toFixed(3), '-i', it.clip);
    const { x, y, w, h } = FRAME;
    filters.push(
      `[0:v]fps=${FPS},setpts=PTS-STARTPTS,tpad=start_duration=${pre.toFixed(3)}:start_mode=clone:stop_duration=${post.toFixed(3)}:stop_mode=clone,` +
        `scale=${w}:${h}:flags=lanczos,pad=1920:1080:${x}:${y}:color=0x0c0f0d,` +
        `drawbox=x=${x - 1}:y=${y - 1}:w=${w + 2}:h=${h + 2}:color=0x343d35:t=1[b0]`,
    );
  } else {
    inputs.push('-i', it.src);
    filters.push(`[0:v]fps=${FPS},setpts=PTS-STARTPTS[b0]`);
  }
  let last = 'b0';
  let n = 1;
  if (it.band) {
    inputs.push('-i', it.band);
    filters.push(`[${last}][${n}:v]overlay=0:0[b${n}]`);
    last = `b${n}`;
    n++;
  }
  if (it.pip) {
    // Panel terminal di pojok kanan bawah bingkai, tidak menutupi kolom Status/Token di tabel sesi.
    inputs.push('-i', it.pip);
    const pw = 654;
    const px = FRAME.x + FRAME.w - pw - 20;
    const py = FRAME.y + FRAME.h - Math.round((pw * 452) / 760) - 20;
    filters.push(
      `[${n}:v]setpts=PTS-STARTPTS,scale=${pw}:-2:flags=lanczos[p]`,
      `[${last}][p]overlay=x=${px}:y=${py}[b${n}]`,
    );
    last = `b${n}`;
    n++;
  }
  sh('ffmpeg', [
    '-y',
    '-v',
    'error',
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    `[${last}]`,
    '-frames:v',
    String(it.frames),
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-an',
    out,
  ]);
  it.file = out;
}

// ---------- 7. Subtitle (ASS + SRT) ----------
// Kalimat dipisah hanya pada tanda baca yang diikuti spasi, jadi "robots.txt" atau "1,8" tetap utuh.
function sentences(text) {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
// Subtitle satu baris (<= 60 karakter) agar muat di pita bawah. Titik potong dipilih dengan DP:
// panjang baris mendekati rata-rata, lebih suka berhenti di koma/titik dua, dan sesedikit mungkin
// baris, jadi tidak ada potongan pendek yang berkedip ("Dalam 5 menit,").
const MAXC = 60;
function chunks(sentence) {
  if (sentence.length <= MAXC) return [sentence];
  const words = sentence.split(' ');
  const target = sentence.length / Math.ceil(sentence.length / MAXC);
  const lineCost = (i, j) => {
    const text = words.slice(i, j).join(' ');
    if (text.length > MAXC) return Number.POSITIVE_INFINITY;
    const clause = /[,:;.?!]$/.test(text) ? 0 : 150;
    return (text.length - target) ** 2 + clause + 400;
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
  if (ttsS.length !== subS.length)
    throw new Error(`${it.id}: jumlah kalimat tts (${ttsS.length}) ≠ sub (${subS.length})`);
  let pos = 0;
  ttsS.forEach((ts, i) => {
    const at = v.text.indexOf(ts, pos);
    pos = at + ts.length;
    const a = it.start + LEAD + v.starts[Math.max(0, at)];
    const b = it.start + LEAD + v.ends[Math.min(v.ends.length - 1, at + ts.length - 1)];
    const parts = chunks(subS[i] ?? ts);
    const totalLen = parts.reduce((x, p) => x + p.length, 0);
    let t = a;
    for (const p of parts) {
      const d = ((b - a) * p.length) / totalLen;
      cues.push({ a: t, b: t + d, text: p });
      t += d;
    }
  });
}
const tAss = (x) => {
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = (x % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
};
const tSrt = (x) => {
  const ms = Math.round(x * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
};
const ass = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 1920',
  'PlayResY: 1080',
  'WrapStyle: 2',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  // Satu baris di pita bawah (y ~1000–1064), kotak warna --bg agar tetap terbaca di atas adegan.
  'Style: Sub,Geist SemiBold,38,&H00DCE6E8,&H00DCE6E8,&H100D0F0C,&H100D0F0C,0,0,0,0,100,100,0,0,3,10,0,2,160,160,20,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ...cues.map((c) => `Dialogue: 0,${tAss(c.a)},${tAss(c.b)},Sub,,0,0,0,,${c.text}`),
].join('\n');
writeFileSync(join(BUILD, 'subtitle.ass'), `${ass}\n`);
const srt = cues.map((c, i) => `${i + 1}\n${tSrt(c.a)} --> ${tSrt(c.b)}\n${c.text}\n`).join('\n');
const OUTNAME = draft ? 'nexa-demo-draft' : 'nexa-demo';
writeFileSync(join(V, `${OUTNAME}.srt`), srt);

// ---------- 8. Sambung + subtitle + narasi ----------
const fontsDir = join(V, 'fonts');
const inArgs = [];
for (const it of items) inArgs.push('-i', it.file);
const vf = [];
let prev = '0:v';
items.forEach((it, k) => {
  if (k === 0) return;
  const label = `x${k}`;
  vf.push(
    `[${prev}][${k}:v]xfade=transition=fade:duration=${XF}:offset=${it.start.toFixed(3)}[${label}]`,
  );
  prev = label;
});
// ffmpeg dijalankan dari BUILD agar path subtitle/font tidak perlu di-escape (huruf drive, spasi).
vf.push(`[${prev}]subtitles=filename=subtitle.ass:fontsdir=fonts[vout]`);
if (!existsSync(join(fontsDir, 'Geist-SemiBold.ttf')))
  throw new Error(`font subtitle belum ada di ${fontsDir}`);
mkdirSync(join(BUILD, 'fonts'), { recursive: true });
copyFileSync(join(fontsDir, 'Geist-SemiBold.ttf'), join(BUILD, 'fonts', 'Geist-SemiBold.ttf'));
const audioItems = items.filter((it) => it.seg?.voice.mp3);
const aBase = items.length;
for (const it of audioItems) inArgs.push('-i', it.seg.voice.mp3);
const af = audioItems.map((it, i) => {
  const ms = Math.round((it.start + LEAD) * 1000);
  return `[${aBase + i}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`;
});
const totalDur = items.at(-1).start + items.at(-1).dur;
if (audioItems.length) {
  af.push(
    `${audioItems.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioItems.length}:normalize=0:duration=longest,apad=whole_dur=${totalDur.toFixed(3)},pan=stereo|c0=c0|c1=c0,asplit=2[narr][key]`,
  );
  // Latar musik orisinal (scripts/video/music.py), diredam otomatis saat narasi berbicara.
  const bed = join(AUDIO, 'bed.wav');
  sh('python', [
    join(ROOT, 'scripts', 'video', 'music.py'),
    '--seconds',
    (totalDur + 1).toFixed(2),
    '--out',
    bed,
  ]);
  inArgs.push('-i', bed);
  const T = totalDur.toFixed(3);
  af.push(
    `[${aBase + audioItems.length}:a]atrim=0:${T},volume=-15dB,afade=t=in:st=0:d=2.5,afade=t=out:st=${(totalDur - 4).toFixed(3)}:d=4[bed]`,
    '[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=600[ducked]',
    '[narr][ducked]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]',
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
    ...(audioItems.length ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : []),
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
    totalDur.toFixed(3),
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: 'inherit', cwd: BUILD },
);
console.log(
  JSON.stringify({ out, seconds: Number(probe(out).toFixed(2)), srt: join(V, `${OUTNAME}.srt`) }),
);
