// Perekam footage video demo (proses main Electron). Menjalankan skenario JSON: buka URL,
// login akun uji di sensor lab loopback, lalu merekam klip dengan kursor dan riak klik yang
// terlihat. Viewport 1280 × 720 CSS px pada skala 1,5 = 1920 × 1080. Frame diambil lewat
// screencast DevTools dan ditulis ke ffmpeg dengan laju tetap 30 fps (frame terakhir diulang
// bila halaman diam). Alat dokumentasi; tidak menyentuh aplikasi desktop.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const scenario = JSON.parse(readFileSync(process.env.REC_SCENARIO, 'utf8'));
const outDir = process.env.REC_OUT;
const root = process.env.REC_ROOT;
const FPS = 30;
// Viewport CSS × skala = lebar tangkapan (bawaan 1440 × 810 → 1920 × 1080). `view.capture`
// yang lebih besar (mis. 2880) memberi ruang zoom di pasca-produksi tanpa teks jadi buram.
const v = scenario.view ?? { width: 1440, height: 810 };
const CAPTURE_W = v.capture ?? 1920;
const CAPTURE_H = Math.round((CAPTURE_W * v.height) / v.width);
const VIEW = {
  width: v.width,
  height: v.height,
  deviceScaleFactor: CAPTURE_W / v.width,
  mobile: false,
};
// Screencast mengikuti skala piksel layar asli, bukan skala emulasi: paksa di Chromium.
app.commandLine.appendSwitch('force-device-scale-factor', String(VIEW.deviceScaleFactor));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (o) => console.log(JSON.stringify(o));
const meta = {
  clips: {},
  marks: {},
  anchors: {},
  capture: { width: CAPTURE_W, height: CAPTURE_H },
};

/** Kotak elemen (piksel tangkapan) untuk kamera dan sorotan di pasca-produksi. */
const RECTS_JS = (queries, scale) => `(() => {
  const find = (q) => {
    if (q.startsWith('css:')) return document.querySelector(q.slice(4));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if ((n.nodeValue || '').trim().startsWith(q) && el && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  };
  const out = {};
  for (const q of ${JSON.stringify(queries)}) {
    const [sel, up] = q.split('^');
    let el = find(sel);
    for (let i = 0; el && i < Number(up || 0); i++) el = el.parentElement;
    if (!el) continue;
    const r = el.getBoundingClientRect();
    out[q] = [r.left, r.top, r.width, r.height].map((x) => Math.round(x * ${scale}));
  }
  const p = window.__nx ? window.__nx.pos() : null;
  return { rects: out, cursor: p ? p.map((x) => Math.round(x * ${scale})) : null };
})()`;

setTimeout(
  () => {
    console.error('recorder: batas waktu habis');
    app.exit(2);
  },
  Number(process.env.REC_TIMEOUT_MS ?? 900_000),
).unref();

/** Disuntikkan ke halaman: kursor panah + riak klik, digerakkan dengan easing. */
const CURSOR_JS = `(() => {
  if (window.__nx) return;
  const c = document.createElement('div');
  c.id = '__nx_cursor';
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2.5 L4 19.5 L8.6 15.2 L11.6 21.6 L14.6 20.2 L11.7 13.9 L18 13.9 Z" fill="#E8E6DC" stroke="#0C0F0D" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-100px,-100px)', willChange: 'transform' });
  document.documentElement.appendChild(c);
  const st = document.createElement('style');
  st.textContent = '@keyframes __nxr{from{transform:translate(-50%,-50%) scale(.2);opacity:.9}to{transform:translate(-50%,-50%) scale(1);opacity:0}}' +
    '.__nxr{position:fixed;width:46px;height:46px;border:2px solid #A3B18A;border-radius:50%;pointer-events:none;z-index:2147483646;animation:__nxr .55s ease-out forwards}' +
    'html{scrollbar-width:none!important}::-webkit-scrollbar{display:none}*{caret-color:transparent}';
  document.head.appendChild(st);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const pos = { x: -100, y: -100 };
  const set = (x, y) => { pos.x = x; pos.y = y; c.style.transform = 'translate(' + (x - 3) + 'px,' + (y - 2) + 'px)'; };
  const tween = (from, to, ms, apply) => new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / ms); apply(from + (to - from) * ease(k)); k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  });
  const find = (q) => {
    if (q.startsWith('css:')) return document.querySelector(q.slice(4));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if ((n.nodeValue || '').trim().startsWith(q) && el && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  };
  window.__nx = {
    show(x, y) { set(x, y); },
    async move(x, y, ms = 700) { const fx = pos.x, fy = pos.y; await tween(0, 1, ms, (k) => set(fx + (x - fx) * k, fy + (y - fy) * k)); },
    center(q) { const el = find(q); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
    async moveTo(q, ms) { const p = this.center(q); if (p) await this.move(p[0], p[1], ms); return Boolean(p); },
    pos() { return [pos.x, pos.y]; },
    ripple() { const r = document.createElement('div'); r.className = '__nxr'; r.style.left = pos.x + 'px'; r.style.top = pos.y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); },
    async click(q, ms = 600) {
      const el = find(q); if (!el) return false;
      await this.moveTo(q, ms); this.ripple();
      try { sessionStorage.setItem('__nxpos', JSON.stringify([pos.x, pos.y])); } catch {}
      await new Promise((r) => setTimeout(r, 160));
      (el.closest('a,button,label,[role=button]') || el).click(); return true;
    },
    async scrollTo(target, ms = 1200) {
      let y = typeof target === 'number' ? target : null;
      if (y === null) { const el = find(target.q); if (!el) return false; y = el.getBoundingClientRect().top + window.scrollY - (target.offset ?? 80); }
      const from = window.scrollY; await tween(from, Math.max(0, y), ms, (v) => window.scrollTo(0, v)); return true;
    },
    async scrollBy(dy, ms = 1200) { const from = window.scrollY; await tween(from, from + dy, ms, (v) => window.scrollTo(0, v)); },
  };
})();`;

/** Dijalankan di halaman: buat akun pemilik uji bila sensor lab loopback belum punya akun. */
async function setupDemoAccount({ password, saved }) {
  const json = { accept: 'application/json' };
  const s = await fetch('/api/auth/status', { headers: json }).then((r) => r.json());
  if (s.mode !== 'lab') return { ok: false, why: 'sensor bukan mode lab' };
  if (s.principal) return { ok: true, why: 'sudah masuk' };
  if (s.needsSetup) {
    const r = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { ...json, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Operator Lab', email: 'operator@lab.test', password }),
    });
    return { ok: r.ok, why: `setup HTTP ${r.status}`, created: r.ok };
  }
  // Akun uji sudah ada (rekaman ulang sebagian): masuk dengan kredensial lab yang disimpan lokal.
  if (!saved) return { ok: false, why: 'sensor sudah punya akun; pakai salinan DB baru' };
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { ...json, 'content-type': 'application/json' },
    body: JSON.stringify({ email: saved.email, password: saved.password }),
  });
  return { ok: r.ok, why: `login HTTP ${r.status}` };
}

app.whenReady().then(async () => {
  mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: VIEW.width,
    height: VIEW.height,
    useContentSize: true,
    show: true,
    opacity: 0,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#0c0f0d',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      partition: 'nexa-video',
    },
  });
  win.setIgnoreMouseEvents(true);
  win.removeMenu();
  const wc = win.webContents;
  const load = (url) => Promise.race([win.loadURL(url).catch(() => undefined), sleep(10_000)]);
  const js = (code) => wc.executeJavaScript(code);
  const run = (fn, arg) => js(`(${fn.toString()})(${JSON.stringify(arg)})`);

  await load('about:blank');
  const dbg = wc.debugger;
  dbg.attach('1.3');
  const cdp = (m, p = {}) => dbg.sendCommand(m, p);
  await cdp('Emulation.setDeviceMetricsOverride', VIEW);

  let latest = null;
  dbg.on('message', (_e, method, params) => {
    if (method !== 'Page.screencastFrame') return;
    latest = Buffer.from(params.data, 'base64');
    cdp('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => undefined);
  });

  const children = [];
  async function record(step) {
    const file = join(outDir, `${step.clip}.mp4`);
    const ff = spawn('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-c:v',
      'mjpeg',
      '-framerate',
      String(FPS),
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      file,
    ]);
    ff.stderr.on('data', (d) => process.stderr.write(d));
    await js(CURSOR_JS);
    if (step.cursorStart)
      await js(`window.__nx.show(${step.cursorStart[0]}, ${step.cursorStart[1]})`);
    // Navigasi halaman penuh (klik tautan) menghapus kursor: suntik ulang di posisi terakhir.
    const reinject = () =>
      js(
        `${CURSOR_JS}; (() => { try { const p = JSON.parse(sessionStorage.getItem('__nxpos') || 'null'); if (p) window.__nx.show(p[0], p[1]); } catch {} })()`,
      ).catch(() => undefined);
    wc.on('dom-ready', reinject);
    latest = null;
    await cdp('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: CAPTURE_W,
      maxHeight: CAPTURE_H,
      everyNthFrame: 1,
    });
    while (!latest) await sleep(10);
    const t0 = Date.now();
    meta.clips[step.clip] = { start: t0, file };
    let written = 0;
    const writer = setInterval(() => {
      const due = Math.floor(((Date.now() - t0) / 1000) * FPS);
      while (written < due && latest) {
        ff.stdin.write(latest);
        written++;
      }
    }, 8);
    // Aksi berjadwal (detik sejak klip mulai), dijalankan berurutan.
    for (const a of step.actions ?? []) {
      const wait = a.t * 1000 - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      if (a.mark) meta.marks[a.mark] = Date.now();
      if (a.move) await js(`window.__nx.move(${a.move[0]}, ${a.move[1]}, ${a.ms ?? 700})`);
      if (a.moveTo) await js(`window.__nx.moveTo(${JSON.stringify(a.moveTo)}, ${a.ms ?? 700})`);
      if (a.click)
        log({
          clip: step.clip,
          click: a.click,
          ok: await js(`window.__nx.click(${JSON.stringify(a.click)}, ${a.ms ?? 600})`),
        });
      if (a.scrollTo !== undefined)
        await js(`window.__nx.scrollTo(${JSON.stringify(a.scrollTo)}, ${a.ms ?? 1200})`);
      if (a.scrollBy) await js(`window.__nx.scrollBy(${a.scrollBy}, ${a.ms ?? 1200})`);
      if (a.hash) await js(`location.hash = ${JSON.stringify(a.hash)}`);
      if (a.js) await js(a.js);
      // Catat posisi elemen yang akan disorot/di-zoom, setelah aksi selesai (halaman sudah diam).
      if (a.anchors) {
        if (a.settle) await sleep(a.settle);
        const snap = await js(RECTS_JS(a.anchors, VIEW.deviceScaleFactor)).catch(() => null);
        meta.anchors[step.clip] ??= [];
        meta.anchors[step.clip].push({
          t: Number(((Date.now() - t0) / 1000).toFixed(3)),
          name: a.name ?? null,
          ...snap,
        });
      }
      if (a.spawn) {
        const child = spawn(process.env.REC_NODE ?? 'node', a.spawn, {
          cwd: root,
          env: process.env,
        });
        let out = '';
        child.stdout.on('data', (d) => {
          out += d;
        });
        child.on('exit', (code) => {
          meta.marks[`${a.name ?? 'spawn'}:exit`] = Date.now();
          writeFileSync(join(outDir, `${a.name ?? 'spawn'}.log`), out);
          log({ spawn: a.name, code });
        });
        children.push(child);
      }
    }
    const end = step.duration * 1000 - (Date.now() - t0);
    if (end > 0) await sleep(end);
    clearInterval(writer);
    wc.off('dom-ready', reinject);
    await cdp('Page.stopScreencast');
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    meta.clips[step.clip].frames = written;
    log({ clip: step.clip, seconds: step.duration, frames: written });
  }

  for (const step of scenario.steps) {
    if (step.do === 'load') {
      await load(step.url);
      await sleep(step.wait ?? 2_000);
    } else if (step.do === 'login') {
      // Kredensial uji lab (akun lokal buatan perekam), disimpan di data/ yang diabaikan git dan
      // tidak pernah dicetak; dipakai lagi untuk rekaman ulang sebagian tanpa DB baru.
      const credFile = join(outDir, '.lab-login.json');
      const saved = existsSync(credFile) ? JSON.parse(readFileSync(credFile, 'utf8')) : null;
      const password = randomBytes(24).toString('base64url');
      const res = await run(setupDemoAccount, { password, saved });
      if (res.created)
        writeFileSync(credFile, JSON.stringify({ email: 'operator@lab.test', password }), {
          mode: 0o600,
        });
      log({ login: { ok: res.ok, why: res.why } });
      if (!res.ok) app.exit(3);
    } else if (step.do === 'js') {
      log({ js: step.name, result: await js(step.code) });
    } else if (step.do === 'dump') {
      const data = await js(step.code);
      writeFileSync(join(outDir, step.file), `${JSON.stringify(data, null, 2)}\n`);
      log({ dump: step.file, ok: Boolean(data) });
    } else if (step.do === 'background') {
      // Halaman tanpa warna latar (mis. portal HTML polos) tampil putih seperti di browser biasa.
      await cdp(
        'Emulation.setDefaultBackgroundColorOverride',
        step.color ? { color: { r: step.color[0], g: step.color[1], b: step.color[2], a: 1 } } : {},
      );
    } else if (step.do === 'zoom') {
      wc.setZoomFactor(step.factor);
    } else if (step.do === 'storage') {
      await js(`localStorage.setItem(${JSON.stringify(step.key)}, ${JSON.stringify(step.value)})`);
    } else if (step.do === 'sleep') {
      await sleep(step.ms);
    } else if (step.do === 'waitFor') {
      const until = Date.now() + (step.timeout ?? 180_000);
      let ok = false;
      while (Date.now() < until && !ok) {
        ok = Boolean(await js(step.code).catch(() => false));
        if (!ok) await sleep(step.every ?? 3_000);
      }
      log({ waitFor: step.name, ok });
      if (!ok && step.required) app.exit(4);
    } else if (step.do === 'record') {
      await record(step);
    }
  }
  writeFileSync(join(outDir, 'record-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  for (const c of children) if (c.exitCode === null) await new Promise((r) => c.on('exit', r));
  dbg.detach();
  app.exit(0);
});
