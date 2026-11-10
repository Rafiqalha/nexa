import { createHash, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

const WINDOW_MS = 60_000;
const MAX_FAILURES = 20;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Perbandingan waktu-konstan (panjang token tidak bocor lewat timing). */
export function tokenMatches(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

export function bearerOf(header: string | undefined): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m?.[1] ?? null;
}

/**
 * Middleware auth API dashboard: wajib `Authorization: Bearer <DASHBOARD_TOKEN>`.
 * Gagal berulang dari satu klien dibatasi (429) untuk mempersulit tebak token.
 */
export function requireToken(
  expected: string,
  clientKey: (c: Parameters<MiddlewareHandler>[0]) => string,
): MiddlewareHandler {
  const failures = new Map<string, { count: number; since: number }>();
  return async (c, next) => {
    const key = clientKey(c);
    const now = Date.now();
    const f = failures.get(key);
    if (f && now - f.since < WINDOW_MS && f.count >= MAX_FAILURES) {
      return c.json({ error: 'too_many_attempts' }, 429);
    }
    const token = bearerOf(c.req.header('authorization'));
    if (!token || !tokenMatches(token, expected)) {
      const entry = f && now - f.since < WINDOW_MS ? f : { count: 0, since: now };
      entry.count += 1;
      failures.set(key, entry);
      return c.json({ error: 'unauthorized' }, 401);
    }
    failures.delete(key);
    await next();
  };
}
