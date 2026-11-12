// Proses main Electron untuk scripts/capture-screenshots.mjs (alat dokumentasi, bukan bagian
// aplikasi desktop). Viewport, skala piksel, dan preferensi gerak diatur lewat DevTools Protocol,
// jadi hasilnya tidak bergantung pada ukuran layar: 1440 × 900 CSS px pada skala 2 menjadi
// 2880 × 1800 px. Autentikasi memakai salah satu dari:
// - proxy dev (DASHBOARD_DEV_AUTOAUTH=1), yang menyisipkan token di sisi server dev;
// - akun uji (CAPTURE_DEMO_LOGIN=1), hanya untuk sensor mode lab di loopback yang belum punya akun.
//   Sandinya acak per jalan, tidak dicetak, dan tidak disimpan.
const { app, BrowserWindow, nativeImage } = require('electron');
const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const base = process.env.CAPTURE_BASE ?? 'http://localhost:5173/';
const outDir = process.env.CAPTURE_OUT;
const routes = JSON.parse(process.env.CAPTURE_ROUTES ?? '[]');
const scale = Number(process.env.CAPTURE_SCALE ?? '2');
const explore = process.env.CAPTURE_EXPLORE === '1';
const demoLogin = process.env.CAPTURE_DEMO_LOGIN === '1';
const VIEW = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** loadURL dengan batas waktu: promise-nya bisa tidak pernah selesai pada SPA ber-SSE. */
const load = (win, url) => Promise.race([win.loadURL(url).catch(() => undefined), sleep(8_000)]);

// Pengaman: jangan pernah menggantung lebih dari 3 menit.
setTimeout(() => {
  console.error('capture: batas waktu habis');
  app.exit(2);
}, 180_000).unref();

/** Dijalankan di halaman: buat akun pemilik uji di sensor lab yang belum disiapkan. */
async function setupDemoAccount(password) {
  const json = { accept: 'application/json' };
  const s = await fetch('/api/auth/status', { headers: json }).then((r) => r.json());
  if (s.mode !== 'lab') return { ok: false, why: 'sensor bukan mode lab' };
  if (s.principal) return { ok: true, why: 'sudah masuk' };
  if (!s.needsSetup) return { ok: false, why: 'sensor sudah punya akun; pakai salinan DB baru' };
  const r = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { ...json, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Operator Lab', email: 'operator@lab.test', password }),
  });
  return { ok: r.ok, why: `setup HTTP ${r.status}` };
}

/** Dijalankan di halaman: klik opsional, lalu gulir ke elemen/teks/posisi yang diminta. */
async function compose(r) {
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  /** Elemen induk dari node teks pertama yang diawali t (teks bisa bersanding dengan <input>). */
  const byText = (t) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if ((n.nodeValue || '').trim().startsWith(t)) return n.parentElement;
    }
    return null;
  };
  let clicked = null;
  if (r.click) {
    const el = byText(r.click);
    const target = el?.closest('label, button, a') ?? el;
    target?.click();
    clicked = Boolean(target);
    await wait(1_500);
  }
  window.scrollTo(0, 0);
  let found = null;
  const target = r.scrollTo ? byText(r.scrollTo) : null;
  if (target) {
    const top = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - (r.offset ?? 32)));
    found = true;
  } else if (r.scrollTo) found = false;
  if (r.scrollY) window.scrollTo(0, r.scrollY);
  await wait(400);
  return {
    y: Math.round(window.scrollY),
    found,
    clicked,
    height: document.documentElement.scrollHeight,
  };
}

app.whenReady().then(async () => {
  const host = new URL(base).hostname;
  if (demoLogin && !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    console.error('capture: --demo-login hanya untuk sensor di loopback');
    app.exit(2);
    return;
  }
  // Jendela "tampil" tetapi transparan penuh, tanpa taskbar/fokus: Chromium tetap merender.
  const win = new BrowserWindow({
    width: 1200,
    height: 750,
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
      // Sesi di memori: cookie akun uji tidak tersimpan di disk setelah alat selesai.
      partition: 'nexa-capture',
    },
  });
  win.removeMenu();
  // Kursor fisik pengguna tidak boleh memicu :hover di jendela tak terlihat ini.
  win.setIgnoreMouseEvents(true);
  const step = (msg) => console.error(`capture: ${msg}`);
  const run = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(arg)})`);

  await load(win, base);
  step('halaman awal dimuat');
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  const cdp = (method, params = {}) =>
    Promise.race([
      dbg.sendCommand(method, params),
      sleep(20_000).then(() => {
        throw new Error(`${method}: tidak ada balasan`);
      }),
    ]);
  await cdp('Emulation.setDeviceMetricsOverride', {
    ...VIEW,
    deviceScaleFactor: scale,
    mobile: false,
  });
  // Loreng, garis pindai, dan transisi dibekukan agar tiap tangkapan konsisten.
  await cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  step(`viewport ${VIEW.width}x${VIEW.height} skala ${scale}`);
  if (demoLogin) {
    const res = await run(setupDemoAccount, randomBytes(24).toString('base64url'));
    console.log(JSON.stringify({ demoLogin: res }));
    if (!res.ok) {
      app.exit(3);
      return;
    }
  }
  await load(win, `${base}?tangkap=1`);
  await sleep(2_500);
  await win.webContents.insertCSS(
    // scrollbar-width pada elemen (mis. panel aturan) mengalahkan ::-webkit-scrollbar, jadi keduanya.
    '*{scrollbar-width:none!important;caret-color:transparent}::-webkit-scrollbar{display:none}',
  );

  for (const r of routes) {
    // Navigasi hash di dalam SPA (loadURL bisa menggantung karena stream SSE tetap terbuka).
    await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(r.hash)};`);
    await sleep(r.waitMs ?? 3_000);
    const placed = await run(compose, r);
    // Kursor sintetis di pojok kanan atas yang kosong: tidak ada baris/tombol yang tersorot.
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: VIEW.width - 2, y: 2 });
    await sleep(600);
    let shot;
    if (explore) {
      const m = await cdp('Page.getLayoutMetrics');
      const h = Math.ceil(m.cssContentSize.height);
      shot = await cdp('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 80,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: VIEW.width, height: h, scale: 1 / scale },
      });
    } else {
      shot = await cdp('Page.captureScreenshot', { format: 'png' });
    }
    const img = nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64'));
    const file = join(outDir, explore ? r.file.replace(/\.jpg$/, '-penuh.jpg') : r.file);
    writeFileSync(file, explore ? Buffer.from(shot.data, 'base64') : img.toJPEG(92));
    const { width, height } = img.getSize();
    console.log(JSON.stringify({ file: r.file, width, height, ...placed }));
  }
  dbg.detach();
  app.exit(0);
});
