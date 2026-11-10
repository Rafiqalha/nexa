// Analisis import statis untuk test regresi keamanan (AGENTS.md §10).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const SRC = resolve(import.meta.dirname, '../src');

export function importsOf(file: string): string[] {
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

export function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

/** Semua file lokal yang terjangkau dari entry + paket bare yang di-import. */
export function closure(entries: string[]): { files: Set<string>; bare: Set<string> } {
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
