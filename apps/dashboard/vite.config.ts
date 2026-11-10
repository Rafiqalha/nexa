import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../..');

/** Hanya ADMIN_PORT (& token untuk proxy dev opsional) yang dibaca; tidak pernah masuk bundle. */
function readRootEnv(): Record<string, string> {
  const path = resolve(repoRoot, '.env');
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(ADMIN_PORT|DASHBOARD_TOKEN)\s*=(.*)$/);
    if (m?.[1]) out[m[1]] = (m[2] ?? '').trim();
  }
  return out;
}

export default defineConfig(() => {
  const env = readRootEnv();
  const adminPort = env.ADMIN_PORT || '8081';
  // Opsional, khusus dev lokal: proxy Vite (proses Node) menyisipkan token ke request /api.
  // Token tetap di sisi server dev; browser & bundle tidak pernah memegangnya.
  const autoAuth = process.env.DASHBOARD_DEV_AUTOAUTH === '1' && Boolean(env.DASHBOARD_TOKEN);
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${adminPort}`,
          changeOrigin: true,
          ...(autoAuth ? { headers: { authorization: `Bearer ${env.DASHBOARD_TOKEN}` } } : {}),
        },
      },
    },
    build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
  };
});
