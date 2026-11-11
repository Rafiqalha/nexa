import { createHash, timingSafeEqual } from 'node:crypto';

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
