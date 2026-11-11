// Kebijakan keamanan shell desktop (murni, tanpa import runtime Electron agar bisa dites).
// Shell ini HANYA memuat dashboard dari port admin sensor: tanpa akses DB, tanpa secret,
// tanpa preload, renderer ter-sandbox dengan contextIsolation.
import type { BrowserWindowConstructorOptions } from 'electron';

/** Dashboard NEXA live (produksi): aplikasi terpasang langsung ke layar masuk/daftar. */
export const LIVE_SENSOR_URL = 'https://nexa-console.up.railway.app/';
/** Port admin sensor lab di mesin operator (dipakai saat dijalankan dari repo). */
export const LOCAL_SENSOR_URL = 'http://127.0.0.1:8081/';

/** Aplikasi terpasang (installer) membuka NEXA live; dari repo (`pnpm desktop`) ke lab lokal. */
export function defaultSensorUrl(isPackaged: boolean): string {
  return isPackaged ? LIVE_SENSOR_URL : LOCAL_SENSOR_URL;
}

/** Warna dari DESIGN.md (--bg, --text, --text-2, --text-muted, --line); UI flat. */
export const BG = '#0c0f0d';
const TEXT = '#e8e6dc';
export const TEXT_2 = '#b9bdb0';
const MUTED = '#8e9686';
const LINE = '#232a24';

/** Tinggi bilah judul kustom; harus sama dengan TITLEBAR_HEIGHT di apps/dashboard. */
export const TITLEBAR_HEIGHT = 40;

/**
 * Sumber URL sensor: argumen `--sensor-url=<url>` (atau `--sensor-url <url>`) lebih dulu,
 * lalu variabel lingkungan NEXA_SENSOR_URL. Bukan secret; login tetap lewat dashboard.
 */
export function sensorUrlInput(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--sensor-url=')) return arg.slice('--sensor-url='.length);
    if (arg === '--sensor-url') return argv[i + 1];
  }
  return env.NEXA_SENSOR_URL;
}

/** URL dashboard sensor: http(s) saja, tanpa kredensial di URL. */
export function resolveSensorUrl(raw: string | undefined, fallback = LOCAL_SENSOR_URL): URL {
  const url = new URL(raw?.trim() || fallback);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXA_SENSOR_URL harus http atau https');
  }
  if (url.username || url.password) {
    throw new Error('NEXA_SENSOR_URL tidak boleh memuat kredensial');
  }
  return url;
}

/** Navigasi hanya di origin sensor (dashboard memakai hash router). */
export function isAllowedNavigation(target: string, sensor: URL): boolean {
  try {
    return new URL(target).origin === sensor.origin;
  } catch {
    return false;
  }
}

export function windowOptions(opts: {
  devTools: boolean;
  show: boolean;
}): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 390,
    minHeight: 600,
    show: opts.show,
    title: 'NEXA — Dashboard',
    backgroundColor: BG,
    autoHideMenuBar: true,
    // Bilah judul bawaan Windows disembunyikan; tombol jendela sistem tetap ada sebagai
    // overlay berwarna NEXA, dan dashboard menggambar bilah judulnya sendiri
    // (Window Controls Overlay, tanpa preload/IPC).
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BG, symbolColor: TEXT_2, height: TITLEBAR_HEIGHT },
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: opts.devTools,
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}

/** Halaman statis saat sensor tidak terjangkau (tanpa skrip). */
export function offlinePage(sensorUrl: string, retrySeconds: number): string {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>NEXA — Dashboard</title>
<style>
body{margin:0;background:${BG};color:${TEXT};font:15px/1.6 Geist,system-ui,sans-serif}
.bar{position:fixed;top:0;left:0;right:0;height:${TITLEBAR_HEIGHT}px;display:flex;align-items:center;padding:0 16px;border-bottom:1px solid ${LINE};-webkit-app-region:drag;app-region:drag;font:600 12px/1 Geist,system-ui,sans-serif;letter-spacing:.18em;color:${TEXT}}
main{max-width:640px;margin:15vh auto 0;padding:0 24px}
p.meta{font:12px/1.4 "JetBrains Mono",ui-monospace,monospace;color:${MUTED};letter-spacing:.06em;text-transform:uppercase}
h1{font-size:24px;font-weight:600;margin:12px 0 16px;padding-bottom:16px;border-bottom:1px solid ${LINE}}
code{font-family:"JetBrains Mono",ui-monospace,monospace;color:${TEXT}}
p{color:${MUTED}}
</style></head><body><div class="bar">NEXA</div><main>
<p class="meta">NEXA · Dashboard</p>
<h1>Sensor tidak terjangkau</h1>
<p>Dashboard dimuat dari port admin sensor di <code>${escapeHtml(sensorUrl)}</code>.</p>
<p>Jalankan sensor (<code>pnpm dev</code> atau <code>pnpm lab:up</code>). Jendela ini mencoba lagi otomatis setiap ${retrySeconds} detik.</p>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
