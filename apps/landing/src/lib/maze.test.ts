import { describe, expect, it } from 'vitest';
import { buildMaze, E, N, neighbors, S, W } from './maze';

describe('labirin landing', () => {
  it('deterministik per seed', () => {
    const a = buildMaze('BAYU-7#1', 26, 16);
    const b = buildMaze('BAYU-7#1', 26, 16);
    expect([...a.open]).toEqual([...b.open]);
    expect(a.walk).toEqual(b.walk);
    const c = buildMaze('BAYU-7#2', 26, 16);
    expect([...c.open]).not.toEqual([...a.open]);
  });

  it('labirin sempurna: semua sel terhubung tanpa siklus', () => {
    const m = buildMaze('GARUDA#1', 26, 16);
    const total = m.cols * m.rows;
    let edges = 0;
    for (let c = 0; c < total; c++) {
      const o = m.open[c] ?? 0;
      if (o & E) edges += 1;
      if (o & S) edges += 1;
    }
    // Pohon rentang: tepat n - 1 lorong.
    expect(edges).toBe(total - 1);
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const cur = queue.shift() as number;
      for (const nb of neighbors(m, cur)) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    expect(seen.size).toBe(total);
  });

  it('lorong konsisten dari dua sisi dan tidak menembus tepi', () => {
    const m = buildMaze('KABUT-TIMUR#3', 12, 8);
    for (let c = 0; c < m.cols * m.rows; c++) {
      const o = m.open[c] ?? 0;
      const x = c % m.cols;
      const y = Math.floor(c / m.cols);
      if (o & N) expect(y > 0 && ((m.open[c - m.cols] ?? 0) & S) !== 0).toBe(true);
      if (o & W) expect(x > 0 && ((m.open[c - 1] ?? 0) & E) !== 0).toBe(true);
      if (o & E) expect(x < m.cols - 1).toBe(true);
      if (o & S) expect(y < m.rows - 1).toBe(true);
    }
  });

  it('jejak jelajah selalu melangkah ke sel tetangga yang terhubung', () => {
    const m = buildMaze('NEXA#1', 26, 16);
    expect(m.walk[0]).toBe(0);
    expect(new Set(m.walk).size).toBe(m.cols * m.rows);
    for (let i = 1; i < m.walk.length; i++) {
      const prev = m.walk[i - 1] as number;
      expect(neighbors(m, prev)).toContain(m.walk[i]);
    }
  });
});
