// Orkestrasi herd immunity: sesi jebakan berakhir -> draf rule (template) -> suricata -T ->
// tampil di dashboard -> operator Setujui/Tolak -> deploy.ts (hanya dengan approval).
import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db/client';
import { canaries, events, type RuleRow, rules, type SessionRow } from '../db/schema';
import { isHoneylinkPath } from '../detect/signals';
import type { Logger } from '../logger';
import { deployRule } from './deploy';
import { draftRules, renderRule, type SessionPattern } from './generate';
import type { SuricataRunner } from './suricata';
import { validateRule } from './validate';

export class RuleDecisionError extends Error {
  constructor(
    readonly code: 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'RuleDecisionError';
  }
}

export interface RulesServiceDeps {
  db: Db;
  bus: Bus;
  logger: Logger;
  runner: SuricataRunner;
  rulesDir: string;
  honeylinkPaths: readonly string[];
  now?: () => number;
}

/** Tanda tangan rule tanpa sid/metadata untuk deduplikasi lintas sesi. */
export function ruleSignature(body: string): string {
  return body
    .replace(/sid:\s*[^;]+;/g, '')
    .replace(/metadata:[^;]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class RulesService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;

  constructor(private readonly deps: RulesServiceDeps) {
    this.now = deps.now ?? Date.now;
    deps.bus.on('session:closed', (row) => {
      if (row.classification === 'legit') return;
      this.enqueue(() => this.draftForSession(row)).catch((err) =>
        deps.logger.error('rule drafting failed', { err, sessionId: row.id }),
      );
    });
  }

  /** Menunggu semua pekerjaan antrean selesai (dipakai test & shutdown). */
  async idle(): Promise<void> {
    await this.queue;
  }

  /** Pola sesi dari DB: honeylink yang diakses + canary yang dipakai. */
  patternFor(session: SessionRow): SessionPattern {
    const { db } = this.deps;
    const paths = db
      .select({ path: events.path })
      .from(events)
      .where(and(eq(events.sessionId, session.id), eq(events.kind, 'honeylink_hit')))
      .all()
      .map((e) => e.path);
    const honeylinks = this.deps.honeylinkPaths.filter((hl) =>
      paths.some((p) => isHoneylinkPath(p, [hl])),
    );
    const triggered = db
      .select()
      .from(canaries)
      .where(
        and(
          isNotNull(canaries.triggeredAt),
          or(eq(canaries.sessionId, session.id), eq(canaries.triggerSessionId, session.id)),
        ),
      )
      .all();
    return {
      sessionId: session.id,
      userAgent: session.userAgent,
      sourceIp: session.sourceIp,
      honeylinkPaths: honeylinks,
      triggeredCanaries: triggered.map((c) => ({ kind: c.kind, token: c.token })),
    };
  }

  /** Membuat draf (status draft) lalu memvalidasinya. Draf duplikat yang belum ditolak dilewati. */
  async draftForSession(session: SessionRow): Promise<RuleRow[]> {
    const { db, bus } = this.deps;
    const existing = new Set(
      db
        .select({ body: rules.body })
        .from(rules)
        .where(ne(rules.status, 'rejected'))
        .all()
        .map((r) => ruleSignature(r.body)),
    );
    const created: RuleRow[] = [];
    for (const draft of draftRules(this.patternFor(session))) {
      const signature = ruleSignature(draft.template);
      if (existing.has(signature)) continue;
      existing.add(signature);
      const row = db
        .insert(rules)
        .values({
          sessionId: session.id,
          kind: draft.kind,
          source: 'template',
          title: draft.title,
          body: draft.template,
          status: 'draft',
          createdAt: this.now(),
        })
        .returning()
        .get();
      const withSid = db
        .update(rules)
        .set({ body: renderRule(draft.template, row.id) })
        .where(eq(rules.id, row.id))
        .returning()
        .get();
      created.push(withSid);
      bus.emit('rule:changed', { ruleId: row.id });
    }
    for (const r of created) await this.validate(r.id);
    if (created.length > 0) {
      this.deps.logger.info('rule drafts created', {
        sessionId: session.id,
        count: created.length,
      });
    }
    return created.map((r) => this.get(r.id) ?? r);
  }

  async validate(ruleId: number): Promise<RuleRow | undefined> {
    const rule = this.get(ruleId);
    if (!rule) return undefined;
    const result = await validateRule(this.deps.runner, rule.body);
    const updated = this.deps.db
      .update(rules)
      .set({
        syntaxValid: result.syntaxValid,
        validationOutput: result.output,
        validatedAt: this.now(),
      })
      .where(eq(rules.id, ruleId))
      .returning()
      .get();
    this.deps.bus.emit('rule:changed', { ruleId });
    return updated;
  }

  get(ruleId: number): RuleRow | undefined {
    return this.deps.db.select().from(rules).where(eq(rules.id, ruleId)).get();
  }

  /** Operator menyetujui: catat approval (siapa & kapan), lalu deploy. */
  async approve(ruleId: number, operator: string): Promise<RuleRow> {
    return this.enqueue(async () => {
      const rule = this.get(ruleId);
      if (!rule) throw new RuleDecisionError('not_found', 'rule tidak ditemukan');
      if (rule.status !== 'draft') {
        throw new RuleDecisionError('conflict', `rule sudah berstatus ${rule.status}`);
      }
      if (rule.syntaxValid !== true) {
        throw new RuleDecisionError('conflict', 'rule belum lolos validasi suricata -T');
      }
      this.deps.db
        .update(rules)
        .set({ status: 'approved', decidedBy: operator, decidedAt: this.now() })
        .where(and(eq(rules.id, ruleId), eq(rules.status, 'draft')))
        .run();
      this.deps.logger.info('rule approved', { ruleId, operator });
      return deployRule(
        {
          db: this.deps.db,
          runner: this.deps.runner,
          rulesDir: this.deps.rulesDir,
          logger: this.deps.logger,
          bus: this.deps.bus,
          now: this.now,
        },
        ruleId,
      );
    });
  }

  /** Operator menolak: rule tidak pernah ditulis ke folder Suricata. */
  async reject(ruleId: number, operator: string): Promise<RuleRow> {
    return this.enqueue(async () => {
      const rule = this.get(ruleId);
      if (!rule) throw new RuleDecisionError('not_found', 'rule tidak ditemukan');
      if (rule.status !== 'draft') {
        throw new RuleDecisionError('conflict', `rule sudah berstatus ${rule.status}`);
      }
      const updated = this.deps.db
        .update(rules)
        .set({ status: 'rejected', decidedBy: operator, decidedAt: this.now() })
        .where(eq(rules.id, ruleId))
        .returning()
        .get();
      this.deps.logger.info('rule rejected', { ruleId, operator });
      this.deps.bus.emit('rule:changed', { ruleId });
      return updated;
    });
  }

  /** Validasi ulang draf yang belum tervalidasi (mis. Suricata baru tersedia). */
  async revalidatePending(): Promise<void> {
    const pending = this.deps.db
      .select({ id: rules.id })
      .from(rules)
      .where(
        and(
          eq(rules.status, 'draft'),
          inArray(rules.kind, ['honeylink', 'user_agent', 'canary', 'source_ip', 'llm']),
        ),
      )
      .all();
    for (const r of pending) {
      const row = this.get(r.id);
      if (row && row.syntaxValid === null) await this.enqueue(() => this.validate(r.id));
    }
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
