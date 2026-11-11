// Middleware auth port admin: identitas (cookie sesi / token API / token layanan),
// izin per peran, cakupan token baca-saja, kewajiban 2FA, dan penjaga Origin (CSRF).
import type { NexaMode, Permission, Principal } from '@nexa/shared';
import { can } from '@nexa/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { bearerOf } from '../api/auth';
import { type AdminEnv, SAFE_METHODS } from '../api/http';
import { clientIp } from '../public/handler';
import { RateLimiter } from './rate-limit';
import { API_TOKEN_PREFIX, type AuthService } from './service';

export interface AuthHttpDeps {
  auth: AuthService;
  mode: NexaMode;
  trustProxy: boolean;
  /** Origin publik dashboard (DASHBOARD_ORIGIN), mis. https://nexa.example.org. */
  publicOrigin: string | null;
}

export function sessionCookieName(mode: NexaMode): string {
  // __Host-: wajib Secure, Path=/, tanpa Domain -> tidak bisa ditimpa subdomain lain.
  return mode === 'production' ? '__Host-nexa_session' : 'nexa_session';
}

export function requestIp(c: Context, deps: Pick<AuthHttpDeps, 'trustProxy'>): string {
  return clientIp(c as Parameters<typeof clientIp>[0], deps.trustProxy);
}

export function requestContext(c: Context, deps: Pick<AuthHttpDeps, 'trustProxy'>) {
  return { ip: requestIp(c, deps), userAgent: c.req.header('user-agent') ?? '' };
}

function isHttps(c: Context, deps: AuthHttpDeps): boolean {
  if (deps.mode === 'production') return true;
  const proto = deps.trustProxy ? c.req.header('x-forwarded-proto') : undefined;
  return (proto ?? new URL(c.req.url).protocol.replace(':', '')) === 'https';
}

export function setSessionCookie(c: Context, deps: AuthHttpDeps, token: string): void {
  setCookie(c, sessionCookieName(deps.mode), token, {
    httpOnly: true,
    secure: isHttps(c, deps),
    sameSite: 'Strict',
    path: '/',
    maxAge: deps.auth.sessionTtlSeconds(),
  });
}

export function clearSessionCookie(c: Context, deps: AuthHttpDeps): void {
  deleteCookie(c, sessionCookieName(deps.mode), {
    path: '/',
    secure: isHttps(c, deps),
    httpOnly: true,
    sameSite: 'Strict',
  });
}

export type Resolution =
  | { principal: Principal; sessionId: string | null }
  | { error: 'invalid_bearer' }
  | null;

/** Identitas pemanggil. Bearer didahulukan; cookie sesi hanya bila tidak ada bearer. */
export function resolvePrincipal(c: Context, deps: AuthHttpDeps): Resolution {
  const bearer = bearerOf(c.req.header('authorization'));
  if (bearer) {
    if (bearer.startsWith(API_TOKEN_PREFIX)) {
      const p = deps.auth.resolveApiToken(bearer);
      return p ? { principal: p, sessionId: null } : { error: 'invalid_bearer' };
    }
    if (deps.auth.isServiceToken(bearer)) {
      return { principal: deps.auth.servicePrincipal(), sessionId: null };
    }
    return { error: 'invalid_bearer' };
  }
  const cookie = getCookie(c, sessionCookieName(deps.mode));
  if (cookie) {
    const s = deps.auth.resolveSession(cookie);
    if (s) return { principal: deps.auth.principalOf(s.user), sessionId: s.sessionId };
  }
  return null;
}

/** Rute yang tetap boleh dipakai admin yang wajib 2FA tapi belum mengaktifkannya. */
const MFA_SETUP_PATHS = /^\/api\/(account\/|auth\/)/;

export function authenticate(deps: AuthHttpDeps): MiddlewareHandler<AdminEnv> {
  // Token salah berulang dari satu klien dikunci sementara. Request TANPA kredensial
  // (dashboard memeriksa status) tidak dihitung agar tidak mengunci pengguna sah.
  const failures = new RateLimiter(20, 60_000);
  return async (c, next) => {
    const ip = requestIp(c, deps);
    if (failures.blocked(ip)) {
      return c.json(
        { error: 'too_many_attempts', message: 'Terlalu banyak percobaan. Tunggu 1 menit.' },
        429,
      );
    }
    const r = resolvePrincipal(c, deps);
    if (r === null)
      return c.json({ error: 'unauthorized', message: 'Sesi berakhir; masuk lagi.' }, 401);
    if ('error' in r) {
      failures.hit(ip);
      return c.json({ error: 'unauthorized', message: 'Token tidak valid.' }, 401);
    }
    const p = r.principal;
    if (p.kind === 'api_token' && p.scope === 'read' && !SAFE_METHODS.has(c.req.method)) {
      return c.json({ error: 'forbidden', message: 'Token API ini baca-saja.' }, 403);
    }
    if (deps.auth.mustEnable2fa(p) && !MFA_SETUP_PATHS.test(c.req.path)) {
      return c.json(
        { error: 'mfa_required', message: 'Kebijakan organisasi mewajibkan 2FA untuk admin.' },
        403,
      );
    }
    c.set('principal', p);
    c.set('loginSessionId', r.sessionId);
    await next();
  };
}

export function requirePermission(permission: Permission): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    if (!can(c.get('principal').role, permission)) {
      return c.json(
        { error: 'forbidden', message: 'Peran Anda tidak punya izin untuk aksi ini.' },
        403,
      );
    }
    await next();
  };
}

/** Rute akun pribadi: hanya pengguna yang masuk dengan sesi (bukan token API/layanan). */
export const requireUserSession: MiddlewareHandler<AdminEnv> = async (c, next) => {
  if (c.get('principal').kind !== 'user') {
    return c.json({ error: 'forbidden', message: 'Hanya untuk akun pengguna yang masuk.' }, 403);
  }
  await next();
};

const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

/**
 * Penjaga CSRF: request yang mengubah data dengan header Origin (selalu dikirim browser
 * untuk POST/PATCH/DELETE) harus berasal dari origin dashboard sendiri. Klien non-browser
 * (skrip, klien MCP) tidak mengirim Origin dan tetap diautentikasi seperti biasa.
 */
export function originGuard(deps: AuthHttpDeps): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      const site = c.req.header('sec-fetch-site');
      if (origin !== undefined ? !originAllowed(c, deps, origin) : site === 'cross-site') {
        return c.json({ error: 'forbidden', message: 'Origin permintaan tidak diizinkan.' }, 403);
      }
    }
    await next();
  };
}

export function originAllowed(c: Context, deps: AuthHttpDeps, origin: string): boolean {
  if (deps.publicOrigin && origin === deps.publicOrigin) return true;
  // Mode lab: dashboard dev (Vite) di loopback memanggil API lewat proxy.
  if (deps.mode === 'lab' && LOOPBACK_ORIGIN.test(origin)) return true;
  const host =
    (deps.trustProxy ? c.req.header('x-forwarded-host') : undefined) ?? c.req.header('host');
  if (!host) return false;
  const proto = isHttps(c, deps) ? 'https' : 'http';
  return origin === `${proto}://${host}`;
}
