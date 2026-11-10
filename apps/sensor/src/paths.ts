import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** Mencari root monorepo (folder berisi pnpm-workspace.yaml); fallback ke cwd. */
export function findRepoRoot(start: string = import.meta.dirname): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/** Path relatif di env diselesaikan terhadap root repo agar sama dari mana pun proses dijalankan. */
export function resolveFromRoot(path: string, root: string): string {
  if (path === ':memory:' || isAbsolute(path)) return path;
  return resolve(root, path);
}

/** Memuat .env di root repo bila ada (khusus dev; di Docker env datang dari compose). */
export function loadRootEnv(root: string): void {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}
