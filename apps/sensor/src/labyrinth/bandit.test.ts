import { describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '../db/client';
import { EpsilonGreedy, loadArmStats, saveArmStats } from './bandit';
import { ARMS } from './generator';
import { Rng } from './prng';

/** Lingkungan simulasi: tiap arm punya rata-rata waktu bertahan (ms) + noise. */
const TRUE_MEAN_HOLD: Record<string, number> = {
  directory_index: 6_000,
  api_docs: 14_000,
  credentials: 31_000,
  incident_report: 9_000,
  network_inventory: 12_000,
};

function simulate(rounds: number, epsilon: number, seed: string) {
  const rng = new Rng(seed);
  const bandit = new EpsilonGreedy(ARMS, { epsilon, random: () => rng.float() });
  const counts = new Map<string, number>();
  for (let i = 0; i < rounds; i++) {
    const arm = bandit.select();
    counts.set(arm, (counts.get(arm) ?? 0) + 1);
    const mean = TRUE_MEAN_HOLD[arm] ?? 0;
    const noise = (rng.float() - 0.5) * mean; // ±50%
    bandit.update(arm, Math.max(0, mean + noise));
  }
  return { bandit, counts };
}

describe('EpsilonGreedy', () => {
  it('memilih arm terbaik setelah N simulasi', () => {
    for (const seed of ['s1', 's2', 's3']) {
      const { bandit, counts } = simulate(2_000, 0.1, seed);
      expect(bandit.best()).toBe('credentials');
      // Arm terbaik paling sering ditarik (eksploitasi), > 70% dari total.
      expect((counts.get('credentials') ?? 0) / 2_000).toBeGreaterThan(0.7);
    }
  });

  it('mencoba setiap arm minimal sekali sebelum eksploitasi', () => {
    const bandit = new EpsilonGreedy(ARMS, { epsilon: 0, random: () => 0.99 });
    const seen = new Set<string>();
    for (let i = 0; i < ARMS.length; i++) {
      const arm = bandit.select();
      seen.add(arm);
      bandit.update(arm, 1_000);
    }
    expect(seen.size).toBe(ARMS.length);
  });

  it('epsilon = 0 selalu eksploitasi setelah semua arm dicoba', () => {
    const bandit = new EpsilonGreedy(['a', 'b'], { epsilon: 0 });
    bandit.update('a', 100);
    bandit.update('b', 900);
    for (let i = 0; i < 20; i++) expect(bandit.select()).toBe('b');
  });

  it('menghitung rata-rata reward dan menolak arm tak dikenal / epsilon tak valid', () => {
    const bandit = new EpsilonGreedy(['a'], { epsilon: 0.1 });
    bandit.update('a', 1_000);
    const s = bandit.update('a', 3_000);
    expect(s).toEqual({ armId: 'a', pulls: 2, totalHoldMs: 4_000, meanReward: 2_000 });
    expect(() => bandit.update('x', 1)).toThrow();
    expect(() => new EpsilonGreedy(['a'], { epsilon: 2 })).toThrow();
  });

  it('state tersimpan & dimuat ulang dari tabel bandit_arms', () => {
    const handle = openDb(':memory:');
    runMigrations(handle.db);
    const bandit = new EpsilonGreedy(ARMS, { epsilon: 0.1 });
    saveArmStats(handle.db, bandit.update('api_docs', 5_000));
    saveArmStats(handle.db, bandit.update('api_docs', 7_000));
    const loaded = loadArmStats(handle.db);
    expect(loaded).toEqual([
      { armId: 'api_docs', pulls: 2, totalHoldMs: 12_000, meanReward: 6_000 },
    ]);
    const restored = new EpsilonGreedy(ARMS, { epsilon: 0 }, loaded);
    expect(restored.snapshot().find((a) => a.armId === 'api_docs')?.pulls).toBe(2);
    handle.close();
  });
});
