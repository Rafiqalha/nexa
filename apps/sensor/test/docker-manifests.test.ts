// Regresi build Docker: setiap image yang memasang dependensi dengan --frozen-lockfile wajib
// menyalin manifest SEMUA paket workspace. Bila ada yang terlewat, pnpm menilai lockfile
// tidak cocok dengan workspace dan build image gagal.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../..');
const WORKSPACE_DIRS = ['apps', 'packages', 'lab'];

const workspacePackages = WORKSPACE_DIRS.flatMap((dir) =>
  readdirSync(join(REPO, dir), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(REPO, dir, d.name, 'package.json')))
    .map((d) => `${dir}/${d.name}`),
);

const DOCKERFILES = [
  'apps/sensor/Dockerfile',
  'lab/target-app/Dockerfile',
  'lab/attacker-agent/Dockerfile',
];

describe('Dockerfile: manifest workspace lengkap untuk --frozen-lockfile', () => {
  it('daftar workspace sama dengan pnpm-workspace.yaml', () => {
    const ws = readFileSync(join(REPO, 'pnpm-workspace.yaml'), 'utf8');
    for (const dir of WORKSPACE_DIRS) expect(ws).toContain(`- ${dir}/*`);
    expect(workspacePackages).toContain('apps/dashboard');
    expect(workspacePackages).toContain('apps/desktop');
  });

  it.each(DOCKERFILES)('%s menyalin manifest semua paket workspace', (file) => {
    const text = readFileSync(join(REPO, file), 'utf8');
    expect(text).toMatch(/--frozen-lockfile/);
    const missing = workspacePackages.filter(
      (pkg) => !new RegExp(`^COPY ${pkg}/package\\.json ${pkg}/\\s*$`, 'm').test(text),
    );
    expect(missing, `${file} tidak menyalin manifest`).toEqual([]);
  });
});
