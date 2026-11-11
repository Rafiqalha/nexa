// Endpoint keputusan operator. Approval tercatat (siapa & kapan) SEBELUM deploy.ts dipanggil.
// Hanya peran dengan izin `rules:decide` (Admin, Operator); nama pencatat diambil dari akun.
import { DecisionInputSchema, RuleSchema } from '@nexa/shared';
import { inArray } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { AuditLog } from '../audit/log';
import { requirePermission } from '../auth/middleware';
import type { Db } from '../db/client';
import { rules } from '../db/schema';
import { buildRulesFile, RULES_FILE } from '../rules/deploy';
import { RuleDecisionError, type RulesService } from '../rules/service';
import { type AdminContext, type AdminEnv, actorOf, readJson } from './http';
import { ruleToApi } from './queries';

export function registerRuleRoutes(
  api: Hono<AdminEnv>,
  service: RulesService,
  deps: { db: Db; audit: AuditLog; ip: (c: AdminContext) => string },
): void {
  const decide = (action: 'approve' | 'reject') =>
    api.post(`/rules/:id/${action}`, requirePermission('rules:decide'), async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'not_found' }, 404);
      const body = await readJson(c, DecisionInputSchema);
      if (!body.ok) return body.res;
      const principal = c.get('principal');
      // Pengguna yang masuk: nama dari akun (tidak bisa dipalsukan lewat body).
      const decidedBy =
        principal.kind === 'service' ? (body.data.operator ?? principal.name) : principal.name;
      try {
        const row =
          action === 'approve'
            ? await service.approve(id, decidedBy)
            : await service.reject(id, decidedBy);
        deps.audit.record(
          { id: principal.userId, name: decidedBy },
          action === 'approve' ? 'rule.approved' : 'rule.rejected',
          `rule #${id}`,
          deps.ip(c),
          { status: row.status },
        );
        return c.json(RuleSchema.parse(ruleToApi(row)));
      } catch (err) {
        if (err instanceof RuleDecisionError) {
          return c.json(
            { error: err.code, message: err.message },
            err.code === 'not_found' ? 404 : 409,
          );
        }
        throw err;
      }
    });
  decide('approve');
  decide('reject');

  // Ekspor aturan yang SUDAH disetujui (nexa.rules) untuk Suricata/WAF di jaringan sendiri.
  api.get('/rules/export', requirePermission('rules:export'), (c) => {
    const approved = deps.db
      .select()
      .from(rules)
      .where(inArray(rules.status, ['approved', 'deployed']))
      .all()
      .filter((r) => r.syntaxValid === true && r.decidedBy && r.decidedAt);
    deps.audit.record(actorOf(c.get('principal')), 'rule.exported', RULES_FILE, deps.ip(c), {
      count: approved.length,
    });
    return c.body(buildRulesFile(approved, Date.now()), 200, {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${RULES_FILE}"`,
    });
  });
}
