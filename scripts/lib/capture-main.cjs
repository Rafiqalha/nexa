// Proses main Electron untuk scripts/capture-screenshots.mjs (alat dokumentasi, bukan bagian
// aplikasi desktop). Memuat dashboard DEV SERVER yang menyisipkan token di sisi proxy
// (DASHBOARD_DEV_AUTOAUTH=1), sehingga alat ini tidak pernah memegang token dashboard.
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const base = process.env.CAPTURE_BASE ?? 'http://localhost:5173/';
const outDir = process.env.CAPTURE_OUT;
const routes = JSON.parse(process.env.CAPTURE_ROUTES ?? '[]');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** loadURL dengan batas waktu: promise-nya bisa tidak pernah selesai pada SPA ber-SSE. */
const load = (win, url) => Promise.race([win.loadURL(url).catch(() => undefined), sleep(8_000)]);

// Pengaman: jangan pernah menggantung lebih dari 2 menit.
setTimeout(() => {
  console.error('capture: batas waktu habis');
  app.exit(2);
}, 120_000).unref();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    autoHideMenuBar: true,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#0c0f0d',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.webContents.setZoomFactor(1);
  await load(win, base);
  // Mode proxy dev: penanda '__proxy__', token asli tidak pernah ada di browser.
  await win.webContents.executeJavaScript(
    "sessionStorage.setItem('nexa.token','__proxy__');sessionStorage.setItem('nexa.operator','Operator Lab');",
  );
  // Muat penuh sekali lagi agar aplikasi membaca sesi dari sessionStorage.
  await load(win, `${base}?tangkap=1`);
  await sleep(2_000);
  for (const r of routes) {
    // Navigasi hash di dalam SPA (loadURL bisa menggantung karena stream SSE tetap terbuka).
    await win.webContents.executeJavaScript(
      `location.hash = ${JSON.stringify(r.hash)}; window.scrollTo(0, 0);`,
    );
    await sleep(r.waitMs ?? 3_000);
    let scrolled = null;
    if (r.scrollText) {
      scrolled = await win.webContents.executeJavaScript(
        `(() => { const t = ${JSON.stringify(r.scrollText)};
          const el = [...document.querySelectorAll('body *')].find((n) => n.children.length === 0 && (n.textContent || '').includes(t));
          if (!el) return false;
          el.scrollIntoView({ block: 'center' });
          return true; })()`,
      );
      await sleep(800);
    }
    const img = await win.webContents.capturePage();
    const size = img.getSize();
    const out = size.width > 1440 ? img.resize({ width: 1440, quality: 'best' }) : img;
    writeFileSync(join(outDir, r.file), out.toJPEG(86));
    console.log(
      JSON.stringify({
        file: r.file,
        width: out.getSize().width,
        height: out.getSize().height,
        scrolled,
      }),
    );
  }
  app.exit(0);
});
