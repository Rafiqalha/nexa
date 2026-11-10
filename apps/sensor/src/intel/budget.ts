// Budget token LLM harian (tabel llm_budget). Mencegah Denial of Wallet pada diri sendiri.
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { llmBudget } from '../db/schema';

export class BudgetExceededError extends Error {
  constructor(
    readonly needed: number,
    readonly remaining: number,
  ) {
    super(`budget LLM harian habis (butuh ±${needed} token, sisa ${remaining})`);
    this.name = 'BudgetExceededError';
  }
}

const wibFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });

/** Tanggal (YYYY-MM-DD) zona WIB: budget di-reset tengah malam WIB. */
export function wibDate(ts: number): string {
  return wibFmt.format(ts);
}

export interface BudgetStatus {
  date: string;
  tokensUsed: number;
  limit: number;
}

export class DailyBudget {
  constructor(
    private readonly db: Db,
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  status(): BudgetStatus {
    const date = wibDate(this.now());
    const row = this.db.select().from(llmBudget).where(eq(llmBudget.date, date)).get();
    return { date, tokensUsed: row?.tokensUsed ?? 0, limit: this.limit };
  }

  canSpend(estimate: number): boolean {
    const s = this.status();
    return s.tokensUsed + estimate <= s.limit;
  }

  /** Melempar BudgetExceededError SEBELUM model dipanggil bila estimasi melewati sisa budget. */
  reserve(estimate: number): void {
    const s = this.status();
    if (s.tokensUsed + estimate > s.limit) {
      throw new BudgetExceededError(estimate, Math.max(0, s.limit - s.tokensUsed));
    }
  }

  /** Mencatat token aktual setelah panggilan selesai. */
  commit(tokens: number): BudgetStatus {
    const date = wibDate(this.now());
    const used = Math.max(0, Math.round(tokens));
    this.db
      .insert(llmBudget)
      .values({ date, tokensUsed: used, limit: this.limit })
      .onConflictDoUpdate({
        target: llmBudget.date,
        set: { tokensUsed: sql`${llmBudget.tokensUsed} + ${used}`, limit: this.limit },
      })
      .run();
    return this.status();
  }
}
