// PRNG kecil & deterministik (ditulis sendiri sesuai AGENTS.md §3).
// Seed string -> hash 32-bit (cyrb53 dilipat) -> mulberry32.

export function hashString(input: string): number {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 ^ h1) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed: string | number) {
    this.next = mulberry32(typeof seed === 'number' ? seed : hashString(seed));
  }

  float(): number {
    return this.next();
  }

  /** Bilangan bulat dalam [min, max] inklusif. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() dari array kosong');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** n elemen unik (urutan acak). */
  sample<T>(items: readonly T[], n: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < n && pool.length > 0) {
      const i = Math.floor(this.next() * pool.length);
      out.push(pool.splice(i, 1)[0] as T);
    }
    return out;
  }

  hex(len: number): string {
    let s = '';
    while (s.length < len) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }
}
