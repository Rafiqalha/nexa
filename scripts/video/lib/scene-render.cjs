// Renderer adegan video demo (proses main Electron). Tiap adegan adalah HTML 1920 × 1080 yang
// mengekspor window.__frame(t): keadaan tampilan dihitung murni dari detik t, jadi hasilnya
// deterministik dan tidak bergantung kecepatan mesin. Frame ditangkap lewat DevTools lalu
// dikodekan ffmpeg pada 30 fps. Mode PNG tunggal (dur 0) dipakai untuk overlay bertransparansi.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const jobs = JSON.parse(readFileSync(process.env.SCENE_JOBS, 'utf8'));
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

setTimeout(() => {
  console.error('scene-render: batas waktu habis');
  app.exit(2);
}, 1_800_000).unref();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 960,
    height: 540,
    show: true,
    opacity: 0,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      partition: 'nexa-scene',
    },
  });
  win.setIgnoreMouseEvents(true);
  const wc = win.webContents;
  await win.loadURL('about:blank');
  const dbg = wc.debugger;
  dbg.attach('1.3');
  const cdp = (m, p = {}) => dbg.sendCommand(m, p);

  for (const job of jobs) {
    const w = job.width ?? 1920;
    const h = job.height ?? 1080;
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp('Emulation.setDefaultBackgroundColorOverride', {
      color: job.transparent ? { r: 0, g: 0, b: 0, a: 0 } : { r: 12, g: 15, b: 13, a: 1 },
    });
    await Promise.race([win.loadURL(pathToFileURL(job.html).href), sleep(10_000)]);
    await wc.executeJavaScript(
      `(() => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(process.env.SCENE_FONTS ?? '')}; document.head.appendChild(st); })();` +
        `window.__data = ${JSON.stringify(job.data ?? {})}; window.__dur = ${job.dur ?? 0};` +
        `(window.__init ? Promise.resolve(window.__init()) : Promise.resolve()).then(() => document.fonts.ready).then(() => true)`,
    );
    // Pastikan kedua font brand benar-benar termuat sebelum frame pertama.
    await wc.executeJavaScript(
      "Promise.all([document.fonts.load('600 40px Geist'), document.fonts.load('400 40px \"JetBrains Mono\"')]).then(() => true)",
    );
    if (!job.dur) {
      // Mode gambar tunggal: overlay transparan, atau cuplikan adegan pada detik `at` untuk QA.
      await wc.executeJavaScript(`window.__frame && window.__frame(${Number(job.at ?? 0)}); true`);
      await sleep(150);
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(job.out, Buffer.from(shot.data, 'base64'));
      console.log(JSON.stringify({ png: job.out }));
      continue;
    }
    const frames = Math.round(job.dur * FPS);
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
      '-frames:v',
      String(frames),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '14',
      '-pix_fmt',
      'yuv420p',
      job.out,
    ]);
    ff.stderr.on('data', (d) => process.stderr.write(d));
    for (let i = 0; i < frames; i++) {
      await wc.executeJavaScript(`window.__frame(${(i / FPS).toFixed(5)}); true`);
      const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
      if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) {
        await new Promise((r) => ff.stdin.once('drain', r));
      }
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log(JSON.stringify({ scene: job.out, seconds: job.dur, frames }));
  }
  dbg.detach();
  app.exit(0);
});
