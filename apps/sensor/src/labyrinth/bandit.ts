// Epsilon-greedy bandit pemilih jenis umpan (ditulis sendiri, AGENTS.md §3).
// Reward = waktu agen bertahan (ms) setelah disajikan umpan jenis tertentu.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { banditArms } from '../db/schema';

export interface ArmStats {
  armId: string;
  pulls: number;
  totalHoldMs: number;
  meanReward: number;
}

export interface BanditOptions {
  epsilon: number;
  random?: () => number;
}

export class EpsilonGreedy {
  private readonly stats = new Map<string, ArmStats>();
  private readonly epsilon: number;
  private readonly random: () => number;

  constructor(
    readonly arms: readonly string[],
    opts: BanditOptions,
    initial: readonly ArmStats[] = [],
  ) {
    if (arms.length === 0) throw new Error('bandit butuh minimal satu arm');
    if (opts.epsilon < 0 || opts.epsilon > 1) throw new Error('epsilon harus di [0, 1]');
    this.epsilon = opts.epsilon;
    this.random = opts.random ?? Math.random;
    for (const armId of arms)
      this.stats.set(armId, { armId, pulls: 0, totalHoldMs: 0, meanReward: 0 });
    for (const s of initial) if (this.stats.has(s.armId)) this.stats.set(s.armId, { ...s });
  }

  /** Eksplorasi dengan peluang epsilon; selain itu eksploitasi arm dengan reward rata-rata tertinggi. */
  select(): string {
    const untried = this.arms.filter((a) => (this.stats.get(a)?.pulls ?? 0) === 0);
    if (untried.length > 0) return this.pickUniform(untried);
    if (this.random() < this.epsilon) return this.pickUniform(this.arms);
    return this.best();
  }

  /** Mencatat reward (ms bertahan) untuk satu penarikan arm. */
  update(armId: string, holdMs: number): ArmStats {
    const s = this.stats.get(armId);
    if (!s) throw new Error(`arm tidak dikenal: ${armId}`);
    const reward = Math.max(0, Math.round(holdMs));
    s.pulls += 1;
    s.totalHoldMs += reward;
    s.meanReward = s.totalHoldMs / s.pulls;
    return { ...s };
  }

  /** Arm dengan reward rata-rata tertinggi (seri: urutan deklarasi). */
  best(): string {
    let bestArm = this.arms[0] as string;
    let bestMean = Number.NEGATIVE_INFINITY;
    for (const armId of this.arms) {
      const s = this.stats.get(armId);
      if (s && s.pulls > 0 && s.meanReward > bestMean) {
        bestMean = s.meanReward;
        bestArm = armId;
      }
    }
    return bestArm;
  }

  snapshot(): ArmStats[] {
    return this.arms.map((a) => ({ ...(this.stats.get(a) as ArmStats) }));
  }

  private pickUniform(items: readonly string[]): string {
    return items[Math.floor(this.random() * items.length)] as string;
  }
}

// --- Persistensi ke tabel bandit_arms (I/O di tepi) ---

export function loadArmStats(db: Db): ArmStats[] {
  return db.select().from(banditArms).all();
}

export function saveArmStats(db: Db, s: ArmStats): void {
  const values = {
    armId: s.armId,
    pulls: s.pulls,
    totalHoldMs: s.totalHoldMs,
    meanReward: s.meanReward,
  };
  const updated = db
    .update(banditArms)
    .set(values)
    .where(eq(banditArms.armId, s.armId))
    .returning()
    .all();
  if (updated.length === 0) db.insert(banditArms).values(values).run();
}
