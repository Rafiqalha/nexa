// Regresi keamanan shell desktop (AGENTS.md §2.6, CLAUDE.md §6): renderer ter-sandbox,
// tanpa Node, tanpa akses DB, tanpa secret di kode/bundel.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BG,
  defaultSensorUrl,
  isAllowedNavigation,
  LIVE_SENSOR_URL,
  LOCAL_SENSOR_URL,
  offlinePage,
  resolveSensorUrl,
  sensorUrlInput,
  TEXT_2,
  TITLEBAR_HEIGHT,
  windowOptions,
} from './security';

const APP = resolve(import.meta.dirname, '../..');

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((n) => join(dir, n))
    .filter((f) => statSync(f).isFile() && !f.endsWith('.test.ts'));
}

describe('desktop: opsi jendela', () => {
  const prefs = windowOptions({ devTools: false, show: true }).webPreferences ?? {};

  it('renderer ter-sandbox, contextIsolation, tanpa Node', () => {
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.nodeIntegrationInWorker).toBe(false);
    expect(prefs.nodeIntegrationInSubFrames).toBe(false);
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.allowRunningInsecureContent).toBe(false);
    expect(prefs.webviewTag).toBe(false);
  });

  it('tanpa preload (tidak ada jembatan ke proses main)', () => {
    expect(prefs.preload).toBeUndefined();
  });

  it('bilah judul kustom: bawaan Windows disembunyikan, tombol sistem jadi overlay berwarna token', () => {
    const opts = windowOptions({ devTools: false, show: true });
    expect(opts.titleBarStyle).toBe('hidden');
    expect(opts.titleBarOverlay).toEqual({
      color: BG,
      symbolColor: TEXT_2,
      height: TITLEBAR_HEIGHT,
    });
    expect(opts.title).toBe('NEXA — Dashboard');
  });
});

describe('desktop: URL sensor & navigasi', () => {
  it('terpasang: NEXA live (https); dari repo: lab lokal', () => {
    expect(defaultSensorUrl(true)).toBe(LIVE_SENSOR_URL);
    expect(new URL(LIVE_SENSOR_URL).protocol).toBe('https:');
    expect(defaultSensorUrl(false)).toBe(LOCAL_SENSOR_URL);
    expect(resolveSensorUrl(undefined, defaultSensorUrl(true)).href).toBe(LIVE_SENSOR_URL);
    // Argumen/ENV tetap menang atas default (mis. sensor lab di mesin lain).
    expect(resolveSensorUrl('http://127.0.0.1:8081/', LIVE_SENSOR_URL).href).toBe(LOCAL_SENSOR_URL);
  });

  it('tanpa input: port admin lokal; hanya http(s) tanpa kredensial', () => {
    expect(resolveSensorUrl(undefined).href).toBe(LOCAL_SENSOR_URL);
    expect(resolveSensorUrl('  ').href).toBe(LOCAL_SENSOR_URL);
    expect(resolveSensorUrl('http://localhost:5173').origin).toBe('http://localhost:5173');
    for (const bad of ['file:///C:/x', 'javascript:alert(1)', 'http://u:p@127.0.0.1:8081/']) {
      expect(() => resolveSensorUrl(bad)).toThrow();
    }
  });

  it('URL sensor dari argumen --sensor-url lebih dulu, lalu NEXA_SENSOR_URL', () => {
    const env = { NEXA_SENSOR_URL: 'http://10.0.0.5:8081/' };
    expect(sensorUrlInput(['app.exe', '--sensor-url=http://192.0.2.10:8081/'], env)).toBe(
      'http://192.0.2.10:8081/',
    );
    expect(sensorUrlInput(['app.exe', '--sensor-url', 'http://192.0.2.11:8081/'], env)).toBe(
      'http://192.0.2.11:8081/',
    );
    expect(sensorUrlInput(['app.exe'], env)).toBe('http://10.0.0.5:8081/');
    expect(sensorUrlInput(['app.exe'], {})).toBeUndefined();
  });

  it('navigasi hanya di origin sensor', () => {
    const base = new URL('http://127.0.0.1:8081/');
    expect(isAllowedNavigation('http://127.0.0.1:8081/#/kontak', base)).toBe(true);
    expect(isAllowedNavigation('http://127.0.0.1:8080/arsip-internal/', base)).toBe(false);
    expect(isAllowedNavigation('https://evil.example/', base)).toBe(false);
    expect(isAllowedNavigation('bukan url', base)).toBe(false);
  });

  it('halaman offline statis, tanpa skrip, URL di-escape', () => {
    const page = decodeURIComponent(offlinePage('http://x/<script>alert(1)</script>', 5));
    expect(page).not.toContain('<script>');
    expect(page).toContain('&lt;script&gt;');
    expect(page).toContain("default-src 'none'");
    // Bilah judul disembunyikan, jadi halaman offline punya area seret sendiri.
    expect(page).toContain('app-region:drag');
  });

  it('tinggi bilah judul sama dengan dashboard', () => {
    const dashboard = readFileSync(
      join(APP, '..', 'dashboard', 'src', 'lib', 'windowControls.ts'),
      'utf8',
    );
    expect(dashboard).toContain(`TITLEBAR_HEIGHT = ${TITLEBAR_HEIGHT};`);
  });
});

describe('desktop: tanpa DB dan tanpa secret', () => {
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const sources = [...filesUnder(join(APP, 'src')), join(APP, 'electron.vite.config.ts')];
  const bundle = filesUnder(join(APP, 'out'));
  const SECRET_NAMES =
    /DEEPSEEK_API_KEY|ATTACKER_LLM_API_KEY|DASHBOARD_TOKEN|SURICATA_CONTROL_TOKEN|LLM_API_KEY/;

  it('tidak bergantung pada modul DB (better-sqlite3/drizzle) atau sensor', () => {
    expect(deps.filter((d) => /sqlite|drizzle|^sensor$|openai/.test(d))).toEqual([]);
    for (const f of [...sources, ...bundle]) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/better-sqlite3|drizzle-orm|apps\/sensor/);
    }
  });

  it('kode dan bundel tidak menyebut nama secret maupun membaca .env', () => {
    for (const f of [...sources, ...bundle]) {
      const text = readFileSync(f, 'utf8');
      expect(text).not.toMatch(SECRET_NAMES);
      expect(text).not.toMatch(/dotenv|loadEnvFile|\.env['"]/);
    }
  });
});
