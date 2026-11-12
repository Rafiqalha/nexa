// Proses main Electron untuk scripts/make-thumbnail.mjs (alat dokumentasi): render satu file
// HTML lokal ke PNG berukuran tepat. Ukuran diatur lewat DevTools Protocol, jadi hasilnya tidak
// bergantung pada layar; font lokal ditunggu sampai selesai dimuat sebelum ditangkap.
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const input = process.env.RENDER_INPUT;
const output = process.env.RENDER_OUTPUT;
const width = Number(process.env.RENDER_WIDTH ?? '1200');
const height = Number(process.env.RENDER_HEIGHT ?? '630');
const scale = Number(process.env.RENDER_SCALE ?? '1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

setTimeout(() => {
  console.error('render: batas waktu habis');
  app.exit(2);
}, 60_000).unref();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
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
      partition: 'nexa-render',
    },
  });
  win.setIgnoreMouseEvents(true);
  win.removeMenu();
  await win.loadURL(pathToFileURL(input).href);
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });
  const fonts = await win.webContents.executeJavaScript(
    'document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))',
  );
  await sleep(400);
  const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png' });
  writeFileSync(output, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ output, width, height, scale, fonts }));
  dbg.detach();
  app.exit(0);
});
