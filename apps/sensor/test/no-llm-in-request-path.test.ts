// Regresi keamanan (AGENTS.md §2.2, §10): jalur request penyerang tidak boleh
// meng-import intel/llm.ts (atau SDK model) secara langsung maupun transitif.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../src');

/** Modul yang berjalan saat menangani request penyerang. */
const REQUEST_PATH_ENTRIES = ['public/handler.ts'];
const REQUEST_PATH_DIRS = ['detect', 'labyrinth', 'proxy', 'canary', 'interrogate'];
const REQUEST_PATH_FILES = ['mcp/decoy.ts'];

const FORBIDDEN_BARE = ['openai', '@anthropic-ai/sdk', 'ollama'];

function importsOf(file: string): string[] {
  const code = readFileSync(file, 'utf8');
  const specs = new Set<string>();
  const re =
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.add(spec);
  }
  return [...specs];
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function closure(entries: string[]): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of importsOf(file)) {
      const local = resolveLocal(file, spec);
      if (local) stack.push(local);
      else if (!spec.startsWith('.')) bare.add(spec);
    }
  }
  return { files, bare };
}

function tsFilesIn(dir: string): string[] {
  const abs = join(SRC, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs, { recursive: true }) as string[]) {
    const full = join(abs, name);
    if (full.endsWith('.ts') && !full.endsWith('.test.ts') && statSync(full).isFile())
      out.push(full);
  }
  return out;
}

describe('regresi: tidak ada LLM di jalur request penyerang', () => {
  const entries = [
    ...REQUEST_PATH_ENTRIES.map((f) => join(SRC, f)),
    ...REQUEST_PATH_DIRS.flatMap(tsFilesIn),
    ...REQUEST_PATH_FILES.map((f) => join(SRC, f)).filter((f) => existsSync(f)),
  ];
  const { files, bare } = closure(entries);
  const rel = [...files].map((f) => relative(SRC, f).replaceAll('\\', '/'));

  it('entry jalur request ditemukan', () => {
    expect(rel).toContain('public/handler.ts');
    expect(rel.some((f) => f.startsWith('labyrinth/'))).toBe(true);
  });

  it('tidak meng-import intel/llm.ts (langsung maupun transitif)', () => {
    expect(rel.filter((f) => f === 'intel/llm.ts')).toEqual([]);
  });

  it('tidak meng-import modul intel/ apa pun', () => {
    expect(rel.filter((f) => f.startsWith('intel/'))).toEqual([]);
  });

  it('tidak meng-import SDK model', () => {
    expect(
      [...bare].filter((b) => FORBIDDEN_BARE.some((f) => b === f || b.startsWith(`${f}/`))),
    ).toEqual([]);
  });

  it('detektor import benar-benar menangkap pelanggaran (kontrol positif)', () => {
    const imports = importsOf(join(SRC, 'public/handler.ts'));
    expect(imports).toContain('../proxy/forward');
  });
});
