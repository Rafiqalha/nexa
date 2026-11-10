// Shell desktop Pos Komando NEXA. Memuat dashboard dari port admin sensor dan tidak
// melakukan hal lain: tidak membuka DB, tidak membaca .env, tidak menyimpan token
// (operator memasukkan token di layar login; dashboard menyimpannya di sessionStorage).
import { app, BrowserWindow, session } from 'electron';
import { isAllowedNavigation, offlinePage, resolveSensorUrl, windowOptions } from './security';

const RETRY_SECONDS = 5;
/** Mode uji asap: jendela tersembunyi, cetak hasil muat sebagai JSON lalu keluar. */
const smokeTest = process.argv.includes('--smoke-test');
const sensorUrl = resolveSensorUrl(process.env.NEXA_SENSOR_URL);

app.enableSandbox();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow(windowOptions({ devTools: !app.isPackaged, show: !smokeTest }));
  win.removeMenu();
  let retry: NodeJS.Timeout | undefined;

  const load = () => {
    void win.loadURL(sensorUrl.href).catch(() => {
      // Ditangani di did-fail-load.
    });
  };

  /** Mode uji asap: laporkan sekali saja lalu keluar. */
  let reported = false;
  const report = (result: Record<string, unknown>, exitCode: number) => {
    if (reported) return;
    reported = true;
    console.log(JSON.stringify(result));
    app.exit(exitCode);
  };

  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    // -3 = ERR_ABORTED (navigasi digantikan), bukan kegagalan jaringan.
    if (!isMainFrame || code === -3 || url.startsWith('data:')) return;
    if (smokeTest) {
      report({ ok: false, url, code, description }, 1);
      return;
    }
    void win.loadURL(offlinePage(sensorUrl.href, RETRY_SECONDS));
    clearTimeout(retry);
    retry = setTimeout(load, RETRY_SECONDS * 1000);
  });

  win.webContents.on('did-finish-load', async () => {
    if (!smokeTest || reported || win.isDestroyed()) return;
    // Bukti dari sisi halaman: API Node tidak terjangkau oleh dashboard.
    const nodeReachable = await win.webContents
      .executeJavaScript("typeof require !== 'undefined' || typeof process !== 'undefined'")
      .catch(() => null);
    if (reported || win.isDestroyed()) return;
    const url = win.webContents.getURL();
    report(
      {
        ok: url.startsWith(sensorUrl.origin) && nodeReachable === false,
        url,
        title: win.webContents.getTitle(),
        nodeReachableFromPage: nodeReachable,
      },
      0,
    );
  });

  // Navigasi keluar origin sensor ditolak; jendela baru tidak pernah dibuka.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, sensorUrl)) event.preventDefault();
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url, sensorUrl)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => clearTimeout(retry));

  load();
  return win;
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.whenReady().then(() => {
  // Dashboard tidak butuh izin perangkat apa pun (kamera, notifikasi, clipboard baca, dst.).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  if (smokeTest) setTimeout(() => app.exit(2), 20_000).unref();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
