import { describe, expect, it } from 'vitest';
import {
  isAutomationUserAgent,
  isDocumentRequest,
  isHoneylinkPath,
  lacksBrowserHeaders,
} from './signals';
import { analyzeTiming } from './timing';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('isAutomationUserAgent', () => {
  it.each([
    '',
    'node',
    'undici',
    'python-httpx/0.28.1',
    'python-requests/2.32.3',
    'curl/8.9.1',
    'Go-http-client/1.1',
    'Mozilla/5.0 (compatible; GPTBot/1.2)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)',
    'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0.0.0',
  ])('menandai %j sebagai otomasi', (ua) => {
    expect(isAutomationUserAgent(ua)).toBe(true);
  });

  it('tidak menandai browser biasa', () => {
    expect(isAutomationUserAgent(CHROME)).toBe(false);
  });
});

describe('lacksBrowserHeaders', () => {
  it('browser mengirim Accept-Language/Sec-Fetch-Mode', () => {
    expect(lacksBrowserHeaders({ 'accept-language': 'id-ID', 'sec-fetch-mode': 'navigate' })).toBe(
      false,
    );
  });
  it('library HTTP tidak', () => {
    expect(lacksBrowserHeaders({ accept: '*/*' })).toBe(true);
  });
});

describe('isDocumentRequest', () => {
  it('aset statis bukan dokumen', () => {
    expect(isDocumentRequest('/static/style.css', {})).toBe(false);
    expect(isDocumentRequest('/logo.png?v=2', {})).toBe(false);
    expect(isDocumentRequest('/x', { 'sec-fetch-dest': 'image' })).toBe(false);
  });
  it('halaman & API adalah dokumen', () => {
    expect(isDocumentRequest('/', {})).toBe(true);
    expect(isDocumentRequest('/api/status', {})).toBe(true);
    expect(isDocumentRequest('/dokumen', { 'sec-fetch-dest': 'document' })).toBe(true);
  });
});

describe('isHoneylinkPath', () => {
  const hl = ['/arsip-internal/'];
  it('cocok untuk path honeylink dan turunannya', () => {
    expect(isHoneylinkPath('/arsip-internal/', hl)).toBe(true);
    expect(isHoneylinkPath('/arsip-internal', hl)).toBe(true);
    expect(isHoneylinkPath('/arsip-internal/laporan.md?x=1', hl)).toBe(true);
    expect(isHoneylinkPath('/ARSIP-INTERNAL/', hl)).toBe(true);
  });
  it('tidak cocok untuk path lain yang mirip', () => {
    expect(isHoneylinkPath('/arsip-internal-publik', hl)).toBe(false);
    expect(isHoneylinkPath('/', hl)).toBe(false);
    expect(isHoneylinkPath('/dokumen', hl)).toBe(false);
  });
});

describe('analyzeTiming', () => {
  it('menghitung median interval dan koefisien variasi', () => {
    const t = analyzeTiming([0, 1000, 2000, 3000]);
    expect(t.samples).toBe(3);
    expect(t.medianIntervalMs).toBe(1000);
    expect(t.cv).toBe(0);
  });
  it('kosong bila kurang dari dua timestamp', () => {
    expect(analyzeTiming([5]).samples).toBe(0);
    expect(analyzeTiming([]).medianIntervalMs).toBeNull();
  });
  it('urutan input tidak berpengaruh', () => {
    expect(analyzeTiming([3000, 0, 1000]).medianIntervalMs).toBe(1500);
  });
});
