import { describe, expect, it } from 'vitest';
import {
  ARMS,
  CANARY_TOKEN_PATTERN,
  generateJson,
  generatePage,
  generateRobots,
  isApiPath,
  pageKey,
  pathDepth,
} from './generator';

const SEED = 'a1b2c3d4e5f60718';
const PATHS = ['/arsip-internal', '/arsip-internal/laporan-operasi-1a2b', '/x/y/z?hal=3', '/'];

describe('generator labirin: determinisme per seed', () => {
  for (const arm of ARMS) {
    it(`arm ${arm}: seed + path sama -> halaman identik`, () => {
      for (const path of PATHS) {
        const a = generatePage({ seed: SEED, path, arm });
        const b = generatePage({ seed: SEED, path, arm });
        expect(b).toEqual(a);
        expect(b.body).toBe(a.body);
      }
    });

    it(`arm ${arm}: seed berbeda -> konten berbeda`, () => {
      const a = generatePage({ seed: SEED, path: '/arsip-internal/a', arm });
      const b = generatePage({ seed: 'ffffffffffffffff', path: '/arsip-internal/a', arm });
      expect(b.body).not.toBe(a.body);
    });

    it(`arm ${arm}: tidak ada placeholder tersisa & ada tautan lanjutan`, () => {
      const p = generatePage({ seed: SEED, path: '/arsip-internal/a/b', arm });
      expect(p.body).not.toMatch(/\{\{\w+\}\}|\{(system|segment|host|ref|date|user|owner)\}/);
      expect(p.links.length).toBeGreaterThanOrEqual(3);
      // Setiap halaman punya tautan ke kedalaman berikutnya.
      expect(p.links.some((l) => pathDepth(l) > p.depth)).toBe(true);
      expect(p.body.length).toBeGreaterThan(800);
      expect(p.contentType).toMatch(/text\/markdown/);
      // Footer mengiklankan MCP umpan (mcp/decoy.ts).
      expect(p.body).toContain('`/arsip-internal/mcp`');
    });
  }

  it('urutan pemanggilan tidak memengaruhi hasil (tidak ada state global)', () => {
    const first = generatePage({ seed: SEED, path: '/arsip-internal/q', arm: 'api_docs' });
    generatePage({ seed: 'lain', path: '/lain', arm: 'credentials' });
    generateJson({ seed: SEED, path: '/arsip-internal/api/v2/x' });
    const again = generatePage({ seed: SEED, path: '/arsip-internal/q', arm: 'api_docs' });
    expect(again.body).toBe(first.body);
  });

  it('JSON API deterministik, valid, dan berpaginasi', () => {
    const a = generateJson({ seed: SEED, path: '/arsip-internal/api/v2/personel?hal=2' });
    const b = generateJson({ seed: SEED, path: '/arsip-internal/api/v2/personel?hal=2' });
    expect(b.body).toBe(a.body);
    const parsed = JSON.parse(a.body) as {
      meta: { halaman: number };
      tautan: { berikutnya: string };
    };
    expect(parsed.meta.halaman).toBe(2);
    expect(parsed.tautan.berikutnya).toBe('/arsip-internal/api/v2/personel?hal=3');
    expect(a.contentType).toMatch(/application\/json/);
  });

  it('robots.txt umpan berisi Disallow ke dalam labirin', () => {
    const r = generateRobots({ seed: SEED, root: '/arsip-internal' });
    expect(r.body).toMatch(/^User-agent: \*/);
    expect(r.body).toContain('Disallow: /arsip-internal/');
  });
});

describe('generator labirin: canary & konten fiktif', () => {
  it('kredensial & api key memakai token canary berformat tetap, unik per seed', () => {
    const cred = generatePage({ seed: SEED, path: '/arsip-internal/k', arm: 'credentials' });
    expect(cred.canaries.map((c) => c.kind).sort()).toEqual(['credential', 'document']);
    for (const c of cred.canaries) {
      expect(c.token).toMatch(new RegExp(`^(${CANARY_TOKEN_PATTERN.source})$`));
      expect(cred.body).toContain(c.token);
    }
    const api = generatePage({ seed: SEED, path: '/arsip-internal/k', arm: 'api_docs' });
    expect(api.canaries).toHaveLength(1);
    const other = generatePage({ seed: 'seed-lain', path: '/arsip-internal/k', arm: 'api_docs' });
    expect(other.canaries[0]?.token).not.toBe(api.canaries[0]?.token);
  });

  it('IP hanya dari TEST-NET dan domain .test', () => {
    for (const arm of ARMS) {
      const p = generatePage({ seed: SEED, path: '/arsip-internal/net', arm });
      const ips = p.body.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
      for (const ip of ips) expect(ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
      const hosts = p.body.match(/\b[a-z0-9-]+\.[a-z0-9.-]+\.(test|internal|com|id|mil)\b/g) ?? [];
      for (const h of hosts) expect(h.endsWith('.test')).toBe(true);
    }
  });
});

describe('utilitas path', () => {
  it('pageKey menormalkan slash & hanya mempertahankan ?hal numerik', () => {
    expect(pageKey('/a//b/')).toBe('/a/b');
    expect(pageKey('/a?x=1&hal=4')).toBe('/a?hal=4');
    expect(pageKey('/a?hal=1')).toBe('/a');
    expect(pageKey('/a?hal=abc')).toBe('/a');
  });

  it('pathDepth & isApiPath', () => {
    expect(pathDepth('/')).toBe(0);
    expect(pathDepth('/arsip-internal/a/b?hal=2')).toBe(3);
    expect(isApiPath('/arsip-internal/api/v2/x')).toBe(true);
    expect(isApiPath('/arsip-internal/apiary')).toBe(false);
  });
});
