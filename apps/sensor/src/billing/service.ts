// Tagihan: paket (config/plans.json), langganan satu organisasi, pemakaian per periode
// (bulan kalender WIB), invoice, dan pembayaran MANUAL (admin mencatat pelunasan).
// Tidak ada payment gateway dan tidak ada koneksi keluar dari modul ini.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  type BillingOverview,
  type Invoice,
  type Plan,
  PlansFileSchema,
  type Subscription,
  type Usage,
} from '@nexa/shared';
import { and, between, count, desc, eq, gte, inArray, like, lt, sql, sum } from 'drizzle-orm';
import type { Actor, AuditLog } from '../audit/log';
import type { Db } from '../db/client';
import {
  events,
  type InvoiceRow,
  invoices,
  llmBudget,
  rules,
  sessions,
  subscription,
} from '../db/schema';
import { wibDate } from '../intel/budget';

export const DEFAULT_PLANS_PATH = new URL('../../config/plans.json', import.meta.url);

export function loadPlans(path: string | URL = DEFAULT_PLANS_PATH): Plan[] {
  return PlansFileSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).plans;
}

const WIB_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const DUE_DAYS = 14;

/** Periode tagihan = bulan kalender WIB yang memuat `ts`. */
export function billingPeriod(ts: number): { start: number; end: number } {
  const d = new Date(ts + WIB_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return {
    start: Date.UTC(y, m, 1) - WIB_OFFSET_MS,
    end: Date.UTC(y, m + 1, 1) - WIB_OFFSET_MS,
  };
}

const dayFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const fmtDay = (ts: number) => dayFmt.format(ts);

export class BillingError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid' | 'conflict' | 'seats_exceeded',
    message: string,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export interface BillingDeps {
  db: Db;
  audit: AuditLog;
  plans: Plan[];
  /** Jumlah pengguna aktif (kursi terpakai). */
  seatsUsed: () => number;
  orgName: () => string;
  now?: () => number;
}

export class BillingService {
  private readonly now: () => number;

  constructor(private readonly deps: BillingDeps) {
    this.now = deps.now ?? Date.now;
    if (deps.plans.length === 0) throw new Error('paket tagihan kosong');
  }

  plans(): Plan[] {
    return this.deps.plans;
  }

  plan(id: string): Plan | undefined {
    return this.deps.plans.find((p) => p.id === id);
  }

  /** Paket default: paket gratis pertama (mis. Lab). */
  private defaultPlan(): Plan {
    return this.deps.plans.find((p) => p.priceIdr === 0) ?? (this.deps.plans[0] as Plan);
  }

  currentPlan(): Plan {
    const row = this.sync();
    return this.plan(row.planId) ?? this.defaultPlan();
  }

  /**
   * Pastikan baris langganan ada dan periode berjalan sudah diproses: turun paket terjadwal
   * diterapkan dan invoice bulan baru diterbitkan untuk paket berbayar. Idempoten.
   */
  sync(): typeof subscription.$inferSelect {
    const t = this.now();
    const period = billingPeriod(t);
    const db = this.deps.db;
    let row = db.select().from(subscription).where(eq(subscription.id, 1)).get();
    if (!row) {
      row = db
        .insert(subscription)
        .values({
          id: 1,
          planId: this.defaultPlan().id,
          currentPeriodStart: period.start,
          updatedAt: t,
        })
        .returning()
        .get();
    }
    if (row.currentPeriodStart !== period.start) {
      const planId =
        row.scheduledPlanId && this.plan(row.scheduledPlanId) ? row.scheduledPlanId : row.planId;
      row = db
        .update(subscription)
        .set({ planId, scheduledPlanId: null, currentPeriodStart: period.start, updatedAt: t })
        .where(eq(subscription.id, 1))
        .returning()
        .get();
      const plan = this.plan(planId);
      if (plan && (plan.priceIdr ?? 0) > 0) {
        const exists = db
          .select({ n: count() })
          .from(invoices)
          .where(and(eq(invoices.periodStart, period.start), eq(invoices.planId, plan.id)))
          .get();
        if ((exists?.n ?? 0) === 0) {
          this.issue(plan, period, [
            {
              description: `Paket ${plan.name}, ${fmtDay(period.start)} – ${fmtDay(period.end - 1)}`,
              amountIdr: plan.priceIdr ?? 0,
            },
          ]);
        }
      }
    }
    return row;
  }

  private issue(
    plan: Plan,
    period: { start: number; end: number },
    lines: { description: string; amountIdr: number }[],
  ): InvoiceRow {
    const t = this.now();
    const ym = wibDate(t).slice(0, 7).replace('-', '');
    const seq =
      (this.deps.db
        .select({ n: count() })
        .from(invoices)
        .where(like(invoices.number, `INV-${ym}-%`))
        .get()?.n ?? 0) + 1;
    return this.deps.db
      .insert(invoices)
      .values({
        id: randomUUID(),
        number: `INV-${ym}-${String(seq).padStart(4, '0')}`,
        planId: plan.id,
        planName: plan.name,
        periodStart: period.start,
        periodEnd: period.end,
        amountIdr: lines.reduce((s, l) => s + l.amountIdr, 0),
        status: 'open',
        issuedAt: t,
        dueAt: t + DUE_DAYS * DAY_MS,
        lines,
      })
      .returning()
      .get();
  }

  usage(): Usage {
    const db = this.deps.db;
    const { start, end } = billingPeriod(this.now());
    const trapped =
      db
        .select({ n: count() })
        .from(sessions)
        .where(and(gte(sessions.trappedAt, start), lt(sessions.trappedAt, end)))
        .get()?.n ?? 0;
    const attacker = Number(
      db
        .select({ t: sum(events.estTokens) })
        .from(events)
        .where(and(gte(events.ts, start), lt(events.ts, end)))
        .get()?.t ?? 0,
    );
    const nexa = Number(
      db
        .select({ t: sum(llmBudget.tokensUsed) })
        .from(llmBudget)
        .where(between(llmBudget.date, wibDate(start), wibDate(end - 1)))
        .get()?.t ?? 0,
    );
    const approved =
      db
        .select({ n: count() })
        .from(rules)
        .where(
          and(
            inArray(rules.status, ['approved', 'deployed']),
            gte(rules.decidedAt, start),
            lt(rules.decidedAt, end),
          ),
        )
        .get()?.n ?? 0;
    return {
      periodStart: start,
      periodEnd: end,
      trappedSessions: trapped,
      attackerTokens: attacker,
      nexaTokens: nexa,
      rulesApproved: approved,
      seatsUsed: this.deps.seatsUsed(),
    };
  }

  private invoiceToApi(r: InvoiceRow): Invoice {
    return {
      id: r.id,
      number: r.number,
      planId: r.planId,
      planName: r.planName,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      amountIdr: r.amountIdr,
      status: r.status,
      issuedAt: r.issuedAt,
      dueAt: r.dueAt,
      paidAt: r.paidAt,
      paidByName: r.paidByName,
      paymentRef: r.paymentRef,
      lines: r.lines,
      overdue: r.status === 'open' && r.dueAt < this.now(),
    };
  }

  invoices(limit = 24): Invoice[] {
    return this.deps.db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.issuedAt))
      .limit(limit)
      .all()
      .map((r) => this.invoiceToApi(r));
  }

  subscription(): Subscription {
    const row = this.sync();
    const period = billingPeriod(this.now());
    const overdue =
      this.deps.db
        .select({ n: count() })
        .from(invoices)
        .where(and(eq(invoices.status, 'open'), lt(invoices.dueAt, this.now())))
        .get()?.n ?? 0;
    return {
      planId: row.planId,
      status: overdue > 0 ? 'past_due' : 'active',
      periodStart: period.start,
      periodEnd: period.end,
      scheduledPlanId: row.scheduledPlanId,
    };
  }

  overview(): BillingOverview {
    return {
      orgName: this.deps.orgName(),
      plans: this.plans(),
      subscription: this.subscription(),
      usage: this.usage(),
      invoices: this.invoices(),
      paymentMethod: 'manual',
    };
  }

  /**
   * Naik paket: langsung berlaku, invoice selisih harga prorata sisa hari periode.
   * Turun paket: dijadwalkan ke periode berikutnya (tanpa refund). Memilih paket yang
   * sedang aktif membatalkan turun paket yang terjadwal.
   */
  changePlan(planId: string, actor: Actor, ip = ''): Subscription {
    const target = this.plan(planId);
    if (!target) throw new BillingError('not_found', 'paket tidak ditemukan');
    if (target.priceIdr === null) {
      throw new BillingError(
        'invalid',
        `Paket ${target.name} memakai kontrak khusus; hubungi tim NEXA.`,
      );
    }
    const row = this.sync();
    const current = this.plan(row.planId) ?? this.defaultPlan();
    const db = this.deps.db;
    const t = this.now();
    if (target.id === current.id) {
      if (!row.scheduledPlanId) throw new BillingError('conflict', 'paket ini sudah aktif');
      db.update(subscription)
        .set({ scheduledPlanId: null, updatedAt: t })
        .where(eq(subscription.id, 1))
        .run();
      this.deps.audit.record(actor, 'billing.downgrade_canceled', current.id, ip);
      return this.subscription();
    }
    const seatLimit = target.limits.seats;
    if (seatLimit !== null && this.deps.seatsUsed() > seatLimit) {
      throw new BillingError(
        'seats_exceeded',
        `Paket ${target.name} hanya untuk ${seatLimit} pengguna aktif; nonaktifkan pengguna dulu.`,
      );
    }
    const currentPrice = current.priceIdr ?? 0;
    const targetPrice = target.priceIdr;
    if (targetPrice > currentPrice) {
      const period = billingPeriod(t);
      const remaining = Math.max(0, (period.end - t) / (period.end - period.start));
      const amount = Math.round((targetPrice - currentPrice) * remaining);
      db.update(subscription)
        .set({ planId: target.id, scheduledPlanId: null, updatedAt: t })
        .where(eq(subscription.id, 1))
        .run();
      if (amount > 0) {
        this.issue(target, period, [
          {
            description: `Naik paket ${current.name} → ${target.name}, prorata ${fmtDay(t)} – ${fmtDay(period.end - 1)}`,
            amountIdr: amount,
          },
        ]);
      }
      this.deps.audit.record(actor, 'billing.upgrade', `${current.id} → ${target.id}`, ip, {
        prorataIdr: amount,
      });
    } else {
      db.update(subscription)
        .set({ scheduledPlanId: target.id, updatedAt: t })
        .where(eq(subscription.id, 1))
        .run();
      this.deps.audit.record(
        actor,
        'billing.downgrade_scheduled',
        `${current.id} → ${target.id}`,
        ip,
      );
    }
    return this.subscription();
  }

  /** Catat pelunasan manual (transfer diterima). Hanya invoice berstatus open. */
  markPaid(invoiceId: string, paymentRef: string, actor: Actor, ip = ''): Invoice {
    const db = this.deps.db;
    const row = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
    if (!row) throw new BillingError('not_found', 'invoice tidak ditemukan');
    if (row.status !== 'open')
      throw new BillingError('conflict', 'invoice tidak berstatus terbuka');
    const updated = db
      .update(invoices)
      .set({
        status: 'paid',
        paidAt: this.now(),
        paidBy: actor.id,
        paidByName: actor.name,
        paymentRef,
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'open')))
      .returning()
      .get();
    this.deps.audit.record(actor, 'billing.invoice_paid', row.number, ip, {
      amountIdr: row.amountIdr,
      paymentRef,
    });
    return this.invoiceToApi(updated);
  }

  /** Total invoice berstatus open (untuk ringkasan). */
  outstandingIdr(): number {
    return Number(
      this.deps.db
        .select({ t: sql<number>`coalesce(sum(${invoices.amountIdr}), 0)` })
        .from(invoices)
        .where(eq(invoices.status, 'open'))
        .get()?.t ?? 0,
    );
  }
}
