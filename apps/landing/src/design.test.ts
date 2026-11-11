// Kepatuhan DESIGN.md untuk landing: token persis, flat (tanpa bayangan, gradien, blur, glow),
// gerak hanya lewat keyframe nx-* yang berhenti saat prefers-reduced-motion, kanvas tanpa efek
// cahaya, ikon hanya Lucide, istilah profesional, dan label kejujuran tetap ada.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS } from './icons-data';

const SRC = resolve(import.meta.dirname);
const APP = resolve(SRC, '..');
const REPO = resolve(APP, '../..');
const css = readFileSync(join(SRC, 'styles', 'landing.css'), 'utf8');
/** CSS tanpa komentar: yang diperiksa deklarasi sungguhan, bukan catatan. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
const html = readFileSync(join(APP, 'index.html'), 'utf8');

function tsFiles(): string[] {
  const out: string[] = [];
  for (const name of readdirSync(SRC, { recursive: true }) as string[]) {
    const full = join(SRC, name);
    if (full.endsWith('.ts') && !full.endsWith('.test.ts') && statSync(full).isFile()) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => relative(SRC, f).replaceAll('\\', '/');

describe('landing: token DESIGN.md', () => {
  const design = readFileSync(join(REPO, 'DESIGN.md'), 'utf8');

  it('token warna sama persis dengan DESIGN.md §2.6', () => {
    const block = design.match(/```css\s*:root \{([\s\S]*?)\}\s*```/)?.[1] ?? '';
    const expected = [...block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)];
    expect(expected).toHaveLength(13);
    for (const m of expected) expect(css).toMatch(new RegExp(`${m[1]}:\\s*${m[2]}\\b`, 'i'));
  });

  it('token loreng sama dengan DESIGN.md §2.4', () => {
    const camo = [...design.matchAll(/\|\s*`(--camo-\d)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/g)];
    expect(camo).toHaveLength(5);
    for (const m of camo) expect(css).toMatch(new RegExp(`${m[1]}:\\s*${m[2]}\\b`, 'i'));
  });

  it('font Geist (UI) dan JetBrains Mono (data)', () => {
    expect(css).toMatch(/--font-sans:\s*"Geist Variable"/);
    expect(css).toMatch(/--font-mono:\s*"JetBrains Mono Variable"/);
  });
});

describe('landing: flat, tanpa efek cahaya', () => {
  it('CSS tanpa bayangan, gradien, blur, filter, atau glow', () => {
    expect(cssCode).not.toMatch(/(?:box|text)-shadow\s*:/);
    expect(cssCode).not.toMatch(/(?<![-\w])(?:backdrop-)?filter\s*:/);
    expect(cssCode).not.toMatch(/gradient\(/);
    expect(cssCode).not.toMatch(/\b(?:glow|neon)\b/i);
  });

  it('HTML tanpa gaya inline yang berefek', () => {
    expect(html).not.toMatch(/shadow|gradient\(|blur\(|filter:/);
  });

  it.each(tsFiles().map((f) => [rel(f), f]))('%s: tanpa warna mentah atau efek kanvas', (_r, f) => {
    const code = readFileSync(f as string, 'utf8');
    expect(code.match(/#[0-9a-fA-F]{6}\b/)?.[0] ?? null).toBeNull();
    expect(
      code.match(
        /shadowBlur|shadowColor|create(?:Linear|Radial|Conic)Gradient|\.filter\s*=|['"]lighter['"]/,
      )?.[0] ?? null,
    ).toBeNull();
  });
});

describe('landing: gerak', () => {
  it('hanya keyframe nx-* sendiri', () => {
    const keyframes = [...cssCode.matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(keyframes.length).toBeGreaterThan(5);
    for (const k of keyframes) expect(k).toMatch(/^nx-/);
    for (const m of cssCode.matchAll(/animation:\s*([a-z0-9-]+)/g)) {
      expect(m[1]).toMatch(/^(?:nx-|none$)/);
    }
  });

  it('semua gerak CSS berhenti saat prefers-reduced-motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced.length).toBeGreaterThan(0);
    expect(reduced).toMatch(/animation:\s*none\s*!important/);
    expect(reduced).toMatch(/transition:\s*none\s*!important/);
  });

  it('setiap modul beranimasi JS memeriksa reduced-motion', () => {
    // Bilah progres hanya mengikuti posisi gulir pengguna, bukan gerak otomatis.
    const scrollLinked = new Set(['modules/chrome.ts']);
    const animated = tsFiles().filter(
      (f) =>
        !scrollLinked.has(rel(f)) &&
        /requestAnimationFrame|new Loop\(|setInterval|setTimeout/.test(readFileSync(f, 'utf8')),
    );
    expect(animated.length).toBeGreaterThan(4);
    for (const f of animated) {
      expect(readFileSync(f, 'utf8'), rel(f)).toMatch(/reducedMotion\(|mq\.matches/);
    }
  });

  it('tanpa scroll-jacking', () => {
    for (const f of tsFiles()) {
      const code = readFileSync(f, 'utf8');
      expect(code, rel(f)).not.toMatch(/preventDefault\(\)|addEventListener\(\s*['"]wheel['"]/);
    }
    expect(cssCode).not.toMatch(/scroll-behavior:\s*smooth|scroll-snap-type/);
  });
});

describe('landing: konten', () => {
  it('bahasa Indonesia', () => {
    expect(html).toMatch(/<html lang="id">/);
  });

  it('ikon hanya dari set Lucide yang dibundel', () => {
    const used = new Set<string>();
    for (const m of html.matchAll(/data-icon="([a-z0-9-]+)"/g)) used.add(m[1] as string);
    for (const f of tsFiles()) {
      for (const m of readFileSync(f, 'utf8').matchAll(/iconSvg\('([a-z0-9-]+)'/g)) {
        used.add(m[1] as string);
      }
    }
    expect(used.size).toBeGreaterThan(10);
    for (const name of used) expect(Object.keys(ICONS), name).toContain(name);
  });

  it('label kejujuran: ilustrasi dan data simulasi lab', () => {
    expect(html.match(/Ilustrasi/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    const results = html.slice(html.indexOf('id="hasil"'), html.indexOf('id="batas"'));
    expect(results).toContain('Data simulasi lab');
    expect(html).toContain('(estimasi)');
  });

  it('istilah profesional, bukan istilah lama', () => {
    expect(html).not.toMatch(/Pos Komando|\bIntel\b/);
  });

  it('tautan keluar tidak membocorkan referrer', () => {
    for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      expect(m[0]).toMatch(/rel="noreferrer"/);
    }
  });
});
