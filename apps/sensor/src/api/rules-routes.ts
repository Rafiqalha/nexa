// Endpoint keputusan operator. Approval tercatat (siapa & kapan) SEBELUM deploy.ts dipanggil.
import type { HttpBindings } from '@hono/node-server';
import { DecisionInputSchema, RuleSchema } from '@nexa/shared';
import type { Hono } from 'hono';
import { RuleDecisionError, type RulesService } from '../rules/service';
import { ruleToApi } from './queries';

export function registerRuleRoutes(
  api: Hono<{ Bindings: HttpBindings }>,
  service: RulesService,
): void {
  const decide = (action: 'approve' | 'reject') =>
    api.post(`/rules/:id/${action}`, async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'not_found' }, 404);
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'bad_request', message: 'body JSON tidak valid' }, 400);
      }
      const parsed = DecisionInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'input tidak valid' },
          400,
        );
      }
      try {
        const row =
          action === 'approve'
            ? await service.approve(id, parsed.data.operator)
            : await service.reject(id, parsed.data.operator);
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
}
