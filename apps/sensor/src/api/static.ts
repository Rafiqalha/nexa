// Penyaji statis kecil untuk build dashboard (port admin). Menolak path traversal
// dan memberi header keamanan (CSP ketat, tanpa sumber eksternal).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

/** Mengembalikan Response file statis, atau null bila tidak ada. SPA fallback ke index.html. */
export function serveDashboardFile(distDir: string, urlPath: string): Response | null {
  const root = resolve(distDir);
  if (!existsSync(join(root, 'index.html'))) return null;
  let rel = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  if (rel.endsWith('/')) rel += 'index.html';
  const target = resolve(root, normalize(`.${rel.startsWith('/') ? rel : `/${rel}`}`));
  if (target !== root && !target.startsWith(root + sep)) return null;

  const file = existsSync(target) && statSync(target).isFile() ? target : join(root, 'index.html');
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const immutable = file.includes(`${sep}assets${sep}`);
  return new Response(readFileSync(file), {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...SECURITY_HEADERS,
    },
  });
}
