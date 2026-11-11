// Pembatas laju jendela tetap (in-memory, per kunci). Cukup untuk satu instans sensor.

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** true bila kunci sudah melewati batas di jendela berjalan (tanpa menambah hitungan). */
  blocked(key: string): boolean {
    const h = this.hits.get(key);
    return h !== undefined && this.now() - h.since < this.windowMs && h.count >= this.max;
  }

  /** Catat satu percobaan (mis. gagal). */
  hit(key: string): void {
    const t = this.now();
    const h = this.hits.get(key);
    const entry = h && t - h.since < this.windowMs ? h : { count: 0, since: t };
    entry.count += 1;
    this.hits.set(key, entry);
    if (this.hits.size > 10_000) this.prune(t);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (t - v.since >= this.windowMs) this.hits.delete(k);
  }
}
