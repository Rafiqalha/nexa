// Rute auth publik (status, penyiapan, daftar, login, 2FA, undangan, reset, logout) dan rute
// akun pribadi (profil, kata sandi, 2FA, sesi, token API).
import {
  AcceptInviteInputSchema,
  ApiTokenCreatedSchema,
  ApiTokenCreateInputSchema,
  ApiTokenListSchema,
  AuthStatusSchema,
  ChangePasswordInputSchema,
  dataLabel,
  InviteInfoSchema,
  LoginInputSchema,
  LoginResultSchema,
  LoginSessionListSchema,
  OkSchema,
  PrincipalSchema,
  ProfileUpdateInputSchema,
  RegisterInputSchema,
  ResetPasswordInputSchema,
  SetupInputSchema,
  TotpDisableInputSchema,
  TotpEnableInputSchema,
  TotpLoginInputSchema,
  TotpSetupSchema,
} from '@nexa/shared';
import type { Hono } from 'hono';
import {
  type AuthHttpDeps,
  clearSessionCookie,
  requestContext,
  requestIp,
  requirePermission,
  requireUserSession,
  resolvePrincipal,
  setSessionCookie,
} from '../auth/middleware';
import { RateLimiter } from '../auth/rate-limit';
import { AuthError } from '../auth/service';
import { type AdminEnv, actorOf, authErrorResponse, readJson } from './http';

export interface AuthRouteDeps extends AuthHttpDeps {
  orgName: () => string;
  /** Jam untuk pembatas laju (bawaan Date.now; test memajukannya). */
  now?: () => number;
}

const TOO_MANY = {
  error: 'too_many_attempts',
  message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
};

/** Dipasang SEBELUM middleware authenticate: rute ini bisa diakses tanpa sesi. */
export function registerPublicAuthRoutes(api: Hono<AdminEnv>, deps: AuthRouteDeps): void {
  const { auth } = deps;
  // Kegagalan login/2FA per IP (selain kunci per akun di AuthService).
  const clock = deps.now ?? Date.now;
  const loginFailures = new RateLimiter(20, 10 * 60_000, clock);
  const setupFailures = new RateLimiter(10, 15 * 60_000, clock);
  const linkLookups = new RateLimiter(60, 10 * 60_000, clock);
  // Setiap percobaan daftar dihitung (berhasil atau tidak) agar akun tidak dibuat massal;
  // cukup longgar untuk banyak orang di balik satu IP (mis. Wi-Fi acara).
  const registrations = new RateLimiter(30, 60 * 60_000, clock);

  api.get('/auth/status', (c) => {
    const r = resolvePrincipal(c, deps);
    const principal = r && !('error' in r) ? r.principal : null;
    return c.json(
      AuthStatusSchema.parse({
        mode: deps.mode,
        label: dataLabel(deps.mode),
        orgName: deps.orgName(),
        needsSetup: auth.needsSetup(),
        setupTokenRequired: auth.setupTokenRequired(),
        registrationOpen: auth.registrationOpen(),
        principal,
        mustEnable2fa: principal ? auth.mustEnable2fa(principal) : false,
      }),
    );
  });

  api.post('/auth/setup', async (c) => {
    const ip = requestIp(c, deps);
    if (setupFailures.blocked(ip)) return c.json(TOO_MANY, 429);
    const body = await readJson(c, SetupInputSchema);
    if (!body.ok) return body.res;
    try {
      const { token, user } = await auth.setup(body.data, requestContext(c, deps));
      setSessionCookie(c, deps, token);
      return c.json(LoginResultSchema.parse({ status: 'ok', principal: auth.principalOf(user) }));
    } catch (err) {
      if (err instanceof AuthError && err.code === 'invalid_token') setupFailures.hit(ip);
      return authErrorResponse(c, err);
    }
  });

  api.post('/auth/register', async (c) => {
    const ip = requestIp(c, deps);
    if (registrations.blocked(ip)) return c.json(TOO_MANY, 429);
    registrations.hit(ip);
    const body = await readJson(c, RegisterInputSchema);
    if (!body.ok) return body.res;
    try {
      const { token, user } = await auth.register(body.data, requestContext(c, deps));
      setSessionCookie(c, deps, token);
      return c.json(LoginResultSchema.parse({ status: 'ok', principal: auth.principalOf(user) }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/auth/login', async (c) => {
    const ip = requestIp(c, deps);
    if (loginFailures.blocked(ip)) return c.json(TOO_MANY, 429);
    const body = await readJson(c, LoginInputSchema);
    if (!body.ok) return body.res;
    try {
      const r = await auth.login(body.data.email, body.data.password, requestContext(c, deps));
      loginFailures.reset(ip);
      if (r.status === 'totp_required') {
        return c.json(LoginResultSchema.parse({ status: 'totp_required', challenge: r.challenge }));
      }
      setSessionCookie(c, deps, r.token);
      return c.json(LoginResultSchema.parse({ status: 'ok', principal: auth.principalOf(r.user) }));
    } catch (err) {
      if (err instanceof AuthError && err.code === 'invalid_credentials') loginFailures.hit(ip);
      return authErrorResponse(c, err);
    }
  });

  api.post('/auth/login/totp', async (c) => {
    const ip = requestIp(c, deps);
    if (loginFailures.blocked(ip)) return c.json(TOO_MANY, 429);
    const body = await readJson(c, TotpLoginInputSchema);
    if (!body.ok) return body.res;
    try {
      const r = auth.loginTotp(body.data.challenge, body.data.code, requestContext(c, deps));
      setSessionCookie(c, deps, r.token);
      return c.json(LoginResultSchema.parse({ status: 'ok', principal: auth.principalOf(r.user) }));
    } catch (err) {
      if (err instanceof AuthError && err.code === 'invalid_code') loginFailures.hit(ip);
      return authErrorResponse(c, err);
    }
  });

  api.get('/auth/invites/:token', (c) => {
    const ip = requestIp(c, deps);
    if (linkLookups.blocked(ip)) return c.json(TOO_MANY, 429);
    linkLookups.hit(ip);
    const info = auth.inviteInfo(c.req.param('token'), deps.orgName());
    return info
      ? c.json(InviteInfoSchema.parse(info))
      : c.json({ error: 'not_found', message: 'Undangan tidak valid atau kedaluwarsa.' }, 404);
  });

  api.post('/auth/invites/accept', async (c) => {
    const ip = requestIp(c, deps);
    if (linkLookups.blocked(ip)) return c.json(TOO_MANY, 429);
    linkLookups.hit(ip);
    const body = await readJson(c, AcceptInviteInputSchema);
    if (!body.ok) return body.res;
    try {
      const r = await auth.acceptInvite(
        body.data.token,
        body.data.name,
        body.data.password,
        requestContext(c, deps),
      );
      setSessionCookie(c, deps, r.token);
      return c.json(LoginResultSchema.parse({ status: 'ok', principal: auth.principalOf(r.user) }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/auth/reset', async (c) => {
    const ip = requestIp(c, deps);
    if (linkLookups.blocked(ip)) return c.json(TOO_MANY, 429);
    linkLookups.hit(ip);
    const body = await readJson(c, ResetPasswordInputSchema);
    if (!body.ok) return body.res;
    try {
      await auth.resetPassword(body.data.token, body.data.password, requestContext(c, deps));
      return c.json(OkSchema.parse({ ok: true }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  // Idempoten: tanpa sesi pun tetap sukses dan cookie dibersihkan.
  api.post('/auth/logout', (c) => {
    const r = resolvePrincipal(c, deps);
    if (r && !('error' in r) && r.sessionId) {
      auth.logout(r.sessionId, actorOf(r.principal), requestIp(c, deps));
    }
    clearSessionCookie(c, deps);
    return c.json(OkSchema.parse({ ok: true }));
  });
}

/** Dipasang SETELAH authenticate. */
export function registerAccountRoutes(api: Hono<AdminEnv>, deps: AuthRouteDeps): void {
  const { auth } = deps;

  api.get('/auth/me', (c) => c.json(PrincipalSchema.parse(c.get('principal'))));

  api.use('/account/*', requireUserSession);

  api.patch('/account/profile', async (c) => {
    const body = await readJson(c, ProfileUpdateInputSchema);
    if (!body.ok) return body.res;
    try {
      const u = auth.updateProfile(
        c.get('principal').userId ?? '',
        body.data.name,
        requestIp(c, deps),
      );
      return c.json(PrincipalSchema.parse(auth.principalOf(u)));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/account/password', async (c) => {
    const body = await readJson(c, ChangePasswordInputSchema);
    if (!body.ok) return body.res;
    try {
      await auth.changePassword(
        c.get('principal').userId ?? '',
        body.data.currentPassword,
        body.data.newPassword,
        c.get('loginSessionId'),
        requestIp(c, deps),
      );
      return c.json(OkSchema.parse({ ok: true }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/account/totp/setup', (c) => {
    try {
      return c.json(TotpSetupSchema.parse(auth.beginTotp(c.get('principal').userId ?? '')));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/account/totp/enable', async (c) => {
    const body = await readJson(c, TotpEnableInputSchema);
    if (!body.ok) return body.res;
    try {
      auth.enableTotp(c.get('principal').userId ?? '', body.data.code, requestIp(c, deps));
      return c.json(OkSchema.parse({ ok: true }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/account/totp/disable', async (c) => {
    const body = await readJson(c, TotpDisableInputSchema);
    if (!body.ok) return body.res;
    try {
      await auth.disableTotp(
        c.get('principal').userId ?? '',
        body.data.password,
        body.data.code,
        requestIp(c, deps),
      );
      return c.json(OkSchema.parse({ ok: true }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.get('/account/sessions', (c) =>
    c.json(
      LoginSessionListSchema.parse({
        sessions: auth.listSessions(c.get('principal').userId ?? '', c.get('loginSessionId')),
      }),
    ),
  );

  api.delete('/account/sessions/:id', (c) => {
    try {
      const p = c.get('principal');
      auth.revokeSession(p.userId ?? '', c.req.param('id'), actorOf(p), requestIp(c, deps));
      return c.json(OkSchema.parse({ ok: true }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.post('/account/sessions/revoke-others', (c) => {
    const p = c.get('principal');
    auth.revokeOtherSessions(
      p.userId ?? '',
      c.get('loginSessionId'),
      actorOf(p),
      requestIp(c, deps),
    );
    return c.json(OkSchema.parse({ ok: true }));
  });

  api.get('/account/tokens', requirePermission('tokens:manage'), (c) =>
    c.json(
      ApiTokenListSchema.parse({ tokens: auth.listApiTokens(c.get('principal').userId ?? '') }),
    ),
  );

  api.post('/account/tokens', requirePermission('tokens:manage'), async (c) => {
    const body = await readJson(c, ApiTokenCreateInputSchema);
    if (!body.ok) return body.res;
    try {
      const created = auth.createApiToken(
        c.get('principal').userId ?? '',
        body.data,
        requestIp(c, deps),
      );
      return c.json(ApiTokenCreatedSchema.parse(created), 201);
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });

  api.delete('/account/tokens/:id', requirePermission('tokens:manage'), (c) => {
    try {
      auth.revokeApiToken(c.get('principal').userId ?? '', c.req.param('id'), requestIp(c, deps));
      return c.json(OkSchema.parse({ ok: true }));
    } catch (err) {
      return authErrorResponse(c, err);
    }
  });
}
