// Regresi keamanan (AGENTS.md §2.5, §10): MCP intel tidak bisa menulis, menyetujui,
// atau men-deploy apa pun. Diperiksa statis lewat graf import + operasi tulis DB.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closure, SRC } from './import-graph';

describe('regresi: MCP intel baca-saja', () => {
  const { files } = closure([join(SRC, 'mcp/intel.ts')]);
  const rel = [...files].map((f) => relative(SRC, f).replaceAll('\\', '/'));

  it('graf import mencakup modul query (kontrol positif)', () => {
    expect(rel).toContain('api/queries.ts');
  });

  it('tidak menjangkau modul deploy, approval, runner Suricata, atau LLM', () => {
    for (const forbidden of [
      'rules/deploy.ts',
      'rules/service.ts',
      'rules/suricata.ts',
      'intel/llm.ts',
      'intel/queue.ts',
    ]) {
      expect(rel).not.toContain(forbidden);
    }
  });

  it('kode yang dijalankan tool (mcp/, api/) tidak memakai operasi tulis DB', () => {
    const writers = rel
      .filter((f) => f.startsWith('mcp/') || f.startsWith('api/'))
      .filter((f) => /\.(insert|update|delete)\(|\.run\(/.test(readFileSync(join(SRC, f), 'utf8')));
    expect(writers).toEqual([]);
  });
});
