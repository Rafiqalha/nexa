// Regresi keamanan (AGENTS.md §2.2, §10): jalur request penyerang tidak boleh
// meng-import intel/llm.ts (atau SDK model) secara langsung maupun transitif.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closure, importsOf, SRC } from './import-graph';

/** Modul yang berjalan saat menangani request penyerang. */
const REQUEST_PATH_ENTRIES = ['public/handler.ts'];
const REQUEST_PATH_DIRS = ['detect', 'labyrinth', 'proxy', 'canary', 'interrogate'];
const REQUEST_PATH_FILES = ['mcp/decoy.ts'];

const FORBIDDEN_BARE = ['openai', '@anthropic-ai/sdk', 'ollama'];

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
    // MCP umpan berada di jalur request (dipanggil dari labirin) dan ikut diperiksa.
    expect(rel).toContain('mcp/decoy.ts');
  });

  it('MCP intel (port admin) tidak ikut jalur request', () => {
    expect(rel).not.toContain('mcp/intel.ts');
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

describe('regresi: satu pintu ke model (AGENTS.md §2.4)', () => {
  const all = [...readdirSync(SRC, { recursive: true }).map((n) => join(SRC, String(n)))].filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && statSync(f).isFile(),
  );

  it('SDK model hanya di-import oleh intel/llm.ts', () => {
    const importers = all
      .filter((f) =>
        importsOf(f).some((spec) =>
          FORBIDDEN_BARE.some((b) => spec === b || spec.startsWith(`${b}/`)),
        ),
      )
      .map((f) => relative(SRC, f).replaceAll('\\', '/'));
    expect(importers).toEqual(['intel/llm.ts']);
  });

  it('hanya intel/queue.ts (pasca-sesi) yang memakai intel/llm.ts', () => {
    const users = all
      .filter((f) => !f.endsWith(join('intel', 'llm.ts')))
      .filter((f) =>
        importsOf(f).some((spec) => /(^|\/)llm$/.test(spec) || spec.endsWith('/intel/llm')),
      )
      .map((f) => relative(SRC, f).replaceAll('\\', '/'))
      .filter((f) => f !== 'app.ts');
    expect(users).toEqual(['intel/queue.ts', 'intel/summarize.ts']);
  });
});
