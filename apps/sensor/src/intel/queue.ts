// Antrean intel PASCA-SESI (AGENTS.md §2.2): sesi jebakan berakhir -> dosir -> redaksi ->
// cek budget -> llm.ts -> simpan intel + draf rule tambahan. Tidak pernah di jalur request.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, ne, notExists } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db/client';
import { type IntelRow, intel, sessions } from '../db/schema';
import type { Logger } from '../logger';
import type { RulesService } from '../rules/service';
import { BudgetExceededError, type DailyBudget } from './budget';
import { buildDossier, capturedPromptOf, redactDossier } from './dossier';
import { estimateRequestTokens, type LlmClient } from './llm';
import { heuristicIntel, SYSTEM_PROMPT, summarizeWithLlm } from './summarize';

export interface IntelQueueDeps {
  db: Db;
  bus: Bus;
  logger: Logger;
  llm: LlmClient;
  budget: DailyBudget;
  rules?: RulesService;
  /** Host internal tambahan yang wajib disamarkan (mis. host upstream). */
  internalHosts?: readonly string[];
  now?: () => number;
}

export class IntelQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;

  constructor(private readonly deps: IntelQueueDeps) {
    this.now = deps.now ?? Date.now;
    deps.bus.on('session:closed', (row) => {
      if (row.classification === 'legit') return;
      this.enqueue(row.id).catch((err) =>
        deps.logger.error('intel job failed', { err, sessionId: row.id }),
      );
    });
  }

  async idle(): Promise<void> {
    await this.chain;
  }

  /**
   * Mengantre sesi jebakan lama yang belum punya intel atau yang intel LLM-nya gagal
   * (dibatasi agar hemat budget; dipanggil saat sensor start).
   */
  backfill(limit = 5): number {
    const { db } = this.deps;
    const missing = db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.status, 'exited'),
          ne(sessions.classification, 'legit'),
          notExists(
            db
              .select({ id: intel.id })
              .from(intel)
              .where(and(eq(intel.sessionId, sessions.id), ne(intel.status, 'error'))),
          ),
        ),
      )
      .orderBy(desc(sessions.lastSeenAt))
      .limit(limit)
      .all();
    for (const m of missing) {
      this.enqueue(m.id).catch((err) => this.deps.logger.error('intel backfill failed', { err }));
    }
    return missing.length;
  }

  enqueue(sessionId: string): Promise<IntelRow | undefined> {
    const job = this.chain.then(() => this.process(sessionId));
    this.chain = job.catch(() => undefined);
    return job;
  }

  /** Simpan/ganti baris intel sesi (satu baris per sesi). */
  private upsert(sessionId: string, values: Partial<IntelRow>): IntelRow {
    const { db } = this.deps;
    const now = this.now();
    const existing = db.select().from(intel).where(eq(intel.sessionId, sessionId)).get();
    const row = existing
      ? db
          .update(intel)
          .set({ ...values, updatedAt: now })
          .where(eq(intel.id, existing.id))
          .returning()
          .get()
      : db
          .insert(intel)
          .values({ id: randomUUID(), sessionId, createdAt: now, updatedAt: now, ...values })
          .returning()
          .get();
    this.deps.bus.emit('intel:changed', { sessionId });
    return row;
  }

  async process(sessionId: string): Promise<IntelRow | undefined> {
    const { db, llm, budget, logger } = this.deps;
    const dossier = buildDossier(db, sessionId);
    if (!dossier) return undefined;
    const heuristic = heuristicIntel(dossier);
    const fallback = {
      source: 'heuristic' as const,
      summary: heuristic.summary,
      suspectedModel: heuristic.suspectedModel,
      confidence: heuristic.confidence,
      patterns: heuristic.patterns,
    };
    const existing = db.select().from(intel).where(eq(intel.sessionId, sessionId)).get();
    // Tangkapan interogasi (eksperimental): dari event interrogation_reply sesi ini;
    // tangkapan lama tidak boleh tertimpa kosong.
    const captured = capturedPromptOf(db, sessionId) ?? existing?.capturedPrompt ?? null;
    const keep = captured ? { capturedPrompt: captured } : {};

    if (!llm.enabled) {
      return this.upsert(sessionId, {
        ...fallback,
        ...keep,
        status: 'done',
        error: 'LLM tidak dikonfigurasi',
      });
    }
    const { text, stats } = redactDossier(dossier, this.deps.internalHosts);
    const estimate = estimateRequestTokens({ system: SYSTEM_PROMPT, user: text, maxTokens: 900 });
    if (!budget.canSpend(estimate)) {
      logger.warn('intel skipped: daily LLM budget exhausted', { sessionId, estimate });
      return this.upsert(sessionId, {
        ...fallback,
        ...keep,
        status: 'skipped_budget',
        error: 'budget LLM harian habis',
      });
    }
    this.upsert(sessionId, { ...fallback, ...keep, status: 'queued' });
    try {
      const { output, tokens, model } = await summarizeWithLlm(llm, text);
      const row = this.upsert(sessionId, {
        ...keep,
        source: 'llm',
        status: 'done',
        summary: output.ringkasan,
        suspectedModel: output.dugaan_framework
          ? `${output.dugaan_model} · ${output.dugaan_framework}`
          : output.dugaan_model,
        confidence: output.keyakinan,
        patterns: output.pola,
        tokensUsed: tokens,
        error: null,
      });
      logger.info('intel summarized', {
        sessionId,
        model,
        tokens,
        redacted: Object.entries(stats)
          .map(([k, v]) => `${k.toLowerCase()}:${v}`)
          .join(','),
      });
      for (const r of output.rule_tambahan) {
        await this.deps.rules?.addLlmDraft(sessionId, r.judul, r.rule);
      }
      return row;
    } catch (err) {
      const budgetHit = err instanceof BudgetExceededError;
      logger.warn('intel llm failed, using heuristic', { sessionId, err });
      return this.upsert(sessionId, {
        ...fallback,
        ...keep,
        status: budgetHit ? 'skipped_budget' : 'error',
        error: budgetHit ? 'budget LLM harian habis' : (err as Error).message.slice(0, 300),
      });
    }
  }
}
