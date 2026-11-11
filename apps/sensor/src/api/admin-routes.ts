// Rute administrasi (khusus peran dengan izin terkait): pengguna & undangan, pengaturan,
// audit, dan tagihan. Semua perubahan dicatat di audit log oleh service masing-masing.
import {
  AuditListSchema,
  BillingOverviewSchema,
  ChangePlanInputSchema,
  InviteCreatedSchema,
  InviteCreateInputSchema,
  InvoiceSchema,
  MarkPaidInputSchema,
  OkSchema,
  OneTimeLinkSchema,
  type SensorInfo,
  SettingsResponseSchema,
  SettingsUpdateInputSchema,
  SubscriptionSchema,
  UserListSchema,
  UserSchema,
  UserUpdateInputSchema,
} from '@nexa/shared';
import type { Hono } from 'hono';
import type { AuditLog } from '../audit/log';
import { type AuthHttpDeps, requestIp, requirePermission } from '../auth/middleware';
import { BillingError, type BillingService } from '../billing/service';
import { SettingsError, type SettingsService } from '../settings/service';
import { type AdminContext, type AdminEnv, actorOf, authErrorResponse, readJson } from './http';

export interface AdminRouteDeps extends AuthHttpDeps {
  settings: SettingsService;
  billing: BillingService;
  audit: AuditLog;
  sensorInfo: () => SensorInfo;
}

const BILLING_STATUS = {
  not_found: 404,
  invalid: 400,
  conflict: 409,
  seats_exceeded: 409,
} as const;

export function registerAdminRoutes(api: Hono<AdminEnv>, deps: AdminRouteDeps): void {
  const { auth, settings, billing, audit } = deps;

  // --- Pengguna & undangan ---
  api.get('/users', requirePermission('users:manage'), (c) =>
    c.json(
      UserListSchema.parse({
        users: auth.listUsers(),
        invites: auth.listInvites(),
        seats: auth.seats(),
      }),
    ),
  );

  api.patch('/users/:id', requirePermission('users:manage'), async (c) => {
    const body = await readJson(c, UserUpdateInputSchema);
    if (!body.ok) return body.res;
    try {
      const u = auth.updateUser(
        c.req.param('id'),
        body.data,
        actorOf(c.get('principal')),
        requestIp(c, deps),
      );
      return c.json(UserSchema.parse(u));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/users/:id/reset-link', requirePermission('users:manage'), (c) => {
    try {
      const link = auth.createResetLink(
        c.req.param('id'),
        actorOf(c.get('principal')),
        requestIp(c, deps),
      );
      return c.json(OneTimeLinkSchema.parse(link), 201);
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/users/:id/reset-2fa', requirePermission('users:manage'), (c) => {
    try {
      const u = auth.resetTotpFor(
        c.req.param('id'),
        actorOf(c.get('principal')),
        requestIp(c, deps),
      );
      return c.json(UserSchema.parse(u));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/invites', requirePermission('users:manage'), async (c) => {
    const body = await readJson(c, InviteCreateInputSchema);
    if (!body.ok) return body.res;
    try {
      const r = auth.createInvite(
        body.data.email,
        body.data.role,
        actorOf(c.get('principal')),
        requestIp(c, deps),
      );
      return c.json(
        InviteCreatedSchema.parse({
          invite: r.invite,
          link: { path: r.path, expiresAt: r.expiresAt },
        }),
        201,
      );
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.delete('/invites/:id', requirePermission('users:manage'), (c) => {
    try {
      auth.revokeInvite(c.req.param('id'), actorOf(c.get('principal')), requestIp(c, deps));
      return c.json(OkSchema.parse({ ok: true }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  // --- Pengaturan ---
  const settingsResponse = () =>
    SettingsResponseSchema.parse({
      settings: settings.get(),
      sensor: deps.sensorInfo(),
      effectiveDailyTokenBudget: settings.effectiveDailyTokenBudget(),
      planDailyTokenLimit: billing.currentPlan().limits.intelTokensPerDay,
    });

  api.get('/settings', requirePermission('settings:manage'), (c) => c.json(settingsResponse()));

  api.patch('/settings', requirePermission('settings:manage'), async (c) => {
    const body = await readJson(c, SettingsUpdateInputSchema);
    if (!body.ok) return body.res;
    try {
      settings.update(body.data, actorOf(c.get('principal')), requestIp(c, deps));
      return c.json(settingsResponse());
    } catch (err) {
      if (err instanceof SettingsError)
        return c.json({ error: 'bad_request', message: err.message }, 400);
      throw err;
    }
  });

  // --- Audit ---
  api.get('/audit', requirePermission('audit:read'), (c) => {
    const cursor = Number(c.req.query('cursor') ?? '');
    const action = c.req.query('action')?.trim() || null;
    return c.json(
      AuditListSchema.parse(
        audit.list({
          cursor: Number.isInteger(cursor) && cursor > 0 ? cursor : null,
          action: action && /^[a-z0-9_.]{1,40}$/.test(action) ? action : null,
          limit: 50,
        }),
      ),
    );
  });

  // --- Tagihan ---
  const billingError = (c: AdminContext, err: unknown) => {
    if (err instanceof BillingError) {
      return c.json({ error: err.code, message: err.message }, BILLING_STATUS[err.code]);
    }
    throw err;
  };

  api.get('/billing', requirePermission('billing:manage'), (c) =>
    c.json(BillingOverviewSchema.parse(billing.overview())),
  );

  api.post('/billing/plan', requirePermission('billing:manage'), async (c) => {
    const body = await readJson(c, ChangePlanInputSchema);
    if (!body.ok) return body.res;
    try {
      const sub = billing.changePlan(
        body.data.planId,
        actorOf(c.get('principal')),
        requestIp(c, deps),
      );
      // Batas paket (budget intel) berubah: terapkan ulang pengaturan berjalan.
      settings.apply();
      return c.json(SubscriptionSchema.parse(sub));
    } catch (err) {
      return billingError(c, err);
    }
  });

  api.post('/billing/invoices/:id/pay', requirePermission('billing:manage'), async (c) => {
    const body = await readJson(c, MarkPaidInputSchema);
    if (!body.ok) return body.res;
    try {
      const inv = billing.markPaid(
        c.req.param('id'),
        body.data.paymentRef,
        actorOf(c.get('principal')),
        requestIp(c, deps),
      );
      return c.json(InvoiceSchema.parse(inv));
    } catch (err) {
      return billingError(c, err);
    }
  });
}
