// Kebijakan keamanan shell desktop (murni, tanpa import runtime Electron agar bisa dites).
// Shell ini HANYA memuat dashboard dari port admin sensor: tanpa akses DB, tanpa secret,
// tanpa preload, renderer ter-sandbox dengan contextIsolation.
import type { BrowserWindowConstructorOptions } from 'electron';

/** Port admin sensor (dashboard + API) pada mesin operator. */
export const DEFAULT_SENSOR_URL = 'http://127.0.0.1:8081/';

/** Warna dari DESIGN.md (--bg, --text, --text-muted, --line); UI flat. */
const BG = '#0c0f0d';
const TEXT = '#e8e6dc';
const MUTED = '#8e9686';
const LINE = '#232a24';

/** URL dashboard sensor dari NEXA_SENSOR_URL: http(s) saja, tanpa kredensial di URL. */
export function resolveSensorUrl(raw: string | undefined): URL {
  const url = new URL(raw?.trim() || DEFAULT_SENSOR_URL);
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
    title: 'NEXA — Pos Komando',
    backgroundColor: BG,
    autoHideMenuBar: true,
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
<title>NEXA — Pos Komando</title>
<style>
body{margin:0;background:${BG};color:${TEXT};font:15px/1.6 Geist,system-ui,sans-serif}
main{max-width:640px;margin:15vh auto 0;padding:0 24px}
p.meta{font:12px/1.4 "JetBrains Mono",ui-monospace,monospace;color:${MUTED};letter-spacing:.06em;text-transform:uppercase}
h1{font-size:24px;font-weight:600;margin:12px 0 16px;padding-bottom:16px;border-bottom:1px solid ${LINE}}
code{font-family:"JetBrains Mono",ui-monospace,monospace;color:${TEXT}}
p{color:${MUTED}}
</style></head><body><main>
<p class="meta">NEXA · Pos Komando</p>
<h1>Sensor tidak terjangkau</h1>
<p>Dashboard dimuat dari port admin sensor di <code>${escapeHtml(sensorUrl)}</code>.</p>
<p>Jalankan sensor (<code>pnpm dev</code> atau <code>pnpm lab:up</code>). Jendela ini mencoba lagi otomatis setiap ${retrySeconds} detik.</p>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
