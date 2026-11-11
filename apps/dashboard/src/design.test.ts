// Kepatuhan DESIGN.md: token warna persis, tanpa palet bawaan Tailwind, UI flat, satu aksen.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname);
const REPO = resolve(SRC, '../../..');

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const name of readdirSync(SRC, { recursive: true }) as string[]) {
    const full = join(SRC, name);
    if (/\.(tsx|ts)$/.test(full) && !full.endsWith('.test.ts') && statSync(full).isFile()) {
      out.push(full);
    }
  }
  return out;
}

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white';
const DEFAULT_COLOR_CLASS = new RegExp(
  `\\b(?:[a-z-]+:)*(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|caret|accent)-(?:${PALETTE})(?:-\\d{2,3})?\\b`,
);
const FORBIDDEN_EFFECTS =
  /\b(?:shadow(?:-[a-z0-9]+)?|drop-shadow(?:-[a-z0-9]+)?|bg-gradient-[a-z-]+|bg-linear-[a-z0-9-]+|bg-radial|blur(?:-[a-z0-9]+)?|backdrop-blur(?:-[a-z0-9]+)?|animate-[a-z-]+|rounded-(?:sm|md|lg|xl|2xl|3xl|4xl|full)|glow|badge|pill)\b/;

describe('DESIGN.md: token warna', () => {
  it('tokens.css sama persis dengan DESIGN.md §2.6', () => {
    const design = readFileSync(join(REPO, 'DESIGN.md'), 'utf8');
    const block = design.match(/```css\s*:root \{([\s\S]*?)\}\s*```/)?.[1] ?? '';
    const expected = new Map(
      [...block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [
        m[1],
        m[2]?.toLowerCase(),
      ]),
    );
    expect(expected.size).toBe(13);
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    for (const [name, hex] of expected) {
      expect(tokens).toMatch(new RegExp(`${name}:\\s*${hex}\\b`, 'i'));
    }
  });

  it('token loreng sama dengan DESIGN.md §2.4', () => {
    const design = readFileSync(join(REPO, 'DESIGN.md'), 'utf8');
    const camo = [...design.matchAll(/\|\s*`(--camo-\d)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/g)];
    expect(camo).toHaveLength(5);
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    for (const m of camo) expect(tokens).toMatch(new RegExp(`${m[1]}:\\s*${m[2]}\\b`, 'i'));
  });

  it('palet bawaan, bayangan, blur, animasi, dan radius bawaan Tailwind dimatikan', () => {
    const css = readFileSync(join(SRC, 'styles', 'index.css'), 'utf8');
    for (const reset of [
      '--color-*: initial',
      '--shadow-*: initial',
      '--blur-*: initial',
      '--animate-*: initial',
      '--radius-*: initial',
    ]) {
      expect(css).toContain(reset);
    }
    expect(css).toMatch(/--radius-xs:\s*2px/);
  });

  it('gerak: hanya keyframe nx-* sendiri, dan dimatikan untuk prefers-reduced-motion', () => {
    const css = readFileSync(join(SRC, 'styles', 'index.css'), 'utf8');
    const keyframes = [...css.matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(keyframes.length).toBeGreaterThan(5);
    for (const k of keyframes) expect(k).toMatch(/^nx-/);
    // Tetap flat: keyframe tidak memakai bayangan, blur, atau gradien.
    // (reset `--text-shadow-*: initial` bukan pemakaian; yang dicari properti sungguhan)
    expect(css).not.toMatch(/(?<![-\w])(?:box|text)-shadow\s*:|filter:\s*blur|gradient\(/);
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/animation:\s*none\s*!important/);
    expect(reduced).toMatch(/transition:\s*none\s*!important/);
  });
});

describe('DESIGN.md: komponen', () => {
  const files = sourceFiles();

  it('menemukan file komponen', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))(
    '%s: tanpa warna bawaan Tailwind',
    (_rel, file) => {
      const code = readFileSync(file as string, 'utf8');
      expect(code.match(DEFAULT_COLOR_CLASS)?.[0] ?? null).toBeNull();
    },
  );

  it.each(files.map((f) => [relative(SRC, f), f]))(
    '%s: tanpa shadow/gradien/blur/animasi/badge/radius besar',
    (_rel, file) => {
      const code = readFileSync(file as string, 'utf8');
      expect(code.match(FORBIDDEN_EFFECTS)?.[0] ?? null).toBeNull();
    },
  );

  it.each(files.map((f) => [relative(SRC, f), f]))(
    '%s: tanpa kode warna hex mentah',
    (_rel, file) => {
      const code = readFileSync(file as string, 'utf8');
      expect(code.match(/#[0-9a-fA-F]{6}\b/)?.[0] ?? null).toBeNull();
    },
  );

  it('aksen hanya untuk identitas, status sensor, nav aktif, biaya NEXA, dan tombol primer', () => {
    const allowed = new Set([
      'components/Sidebar.tsx',
      'components/CostMeter.tsx',
      'components/ui/button.tsx',
      'components/LogoMark.tsx',
      'components/LiveDot.tsx',
    ]);
    const users = files
      .filter((f) => /\b(?:text|bg|border)-accent\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).replaceAll('\\', '/'));
    expect(users.filter((u) => !allowed.has(u))).toEqual([]);
  });
});
