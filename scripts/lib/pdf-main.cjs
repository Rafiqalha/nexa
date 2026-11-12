// Proses main Electron untuk scripts/make-slides.mjs (alat dokumentasi): cetak satu file HTML lokal
// ke PDF. Ukuran halaman diambil dari CSS @page. Font dan gambar ditunggu sampai selesai dimuat, lalu
// tata letak tiap .slide diperiksa (teks melewati batas konten atau terpotong kotak) sebelum dicetak.
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const input = process.env.RENDER_INPUT;
const output = process.env.RENDER_OUTPUT;

setTimeout(() => {
  console.error('pdf: batas waktu habis');
  app.exit(2);
}, 120_000).unref();

// Dijalankan di halaman: daftar font yang termuat, gambar yang gagal, dan elemen yang melewati
// area konten (x 96–1824, y sampai garis footer 996) atau terpotong di dalam kotak .node.
const INSPECT = `(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
  const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))];
  const brokenImages = [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src'));
  const issues = [];
  document.querySelectorAll('.slide').forEach((slide, i) => {
    const s = slide.getBoundingClientRect();
    const where = (el) => (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + ' "' + (el.textContent || '').trim().slice(0, 40) + '"';
    for (const el of slide.querySelectorAll('*')) {
      if (el.closest('.foot, .camo, .shot, .crop, .shot-l, svg')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const bottom = r.bottom - s.top;
      const right = r.right - s.left;
      const left = r.left - s.left;
      if (bottom > 994.5 || right > 1824.5 || left < 95.5) {
        issues.push({ slide: i + 1, el: where(el), left: Math.round(left), right: Math.round(right), bottom: Math.round(bottom) });
      }
    }
    for (const el of slide.querySelectorAll('.node')) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
        issues.push({ slide: i + 1, el: where(el), clipped: [el.scrollWidth, el.scrollHeight, el.clientWidth, el.clientHeight] });
      }
    }
  });
  return { slides: document.querySelectorAll('.slide').length, fonts, brokenImages, issues };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
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
  await win.loadURL(pathToFileURL(input).href);
  const report = await win.webContents.executeJavaScript(INSPECT);
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    generateTaggedPDF: true,
  });
  writeFileSync(output, pdf);
  console.log(JSON.stringify({ output, bytes: pdf.length, ...report }));
  app.exit(0);
});
