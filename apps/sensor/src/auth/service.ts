// Akun pengguna, sesi login, undangan, reset kata sandi, 2FA (TOTP), dan token API.
// Prinsip: kata sandi/token/rahasia 2FA tidak pernah disimpan atau dicatat dalam bentuk
// asli; token hanya disimpan sebagai sha256, kata sandi sebagai scrypt, rahasia TOTP
// terenkripsi. Pesan galat login generik agar tidak membocorkan email yang terdaftar.
import { randomUUID } from 'node:crypto';
import type {
  ApiToken,
  Invite,
  InviteInfo,
  LoginSession,
  Principal,
  Role,
  SetupInput,
  TokenScope,
  User,
  UserUpdateInput,
} from '@nexa/shared';
import { and, count, desc, eq, gt, isNull, like, ne } from 'drizzle-orm';
import type { Actor, AuditLog } from '../audit/log';
import type { Db } from '../db/client';
import {
  type ApiTokenRow,
  apiTokens,
  loginSessions,
  type OneTimeTokenRow,
  oneTimeTokens,
  type UserRow,
  users,
} from '../db/schema';
import { randomToken, type SecretBox, safeEqual, sha256Hex } from './crypto';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'locked'
  | 'disabled'
  | 'setup_done'
  | 'setup_unavailable'
  | 'invalid_token'
  | 'invalid_code'
  | 'conflict'
  | 'not_found'
  | 'forbidden'
  | 'seats_exceeded'
  | 'invalid';

export const AUTH_ERROR_STATUS: Readonly<Record<AuthErrorCode, 400 | 401 | 403 | 404 | 409 | 429>> =
  {
    invalid_credentials: 401,
    locked: 429,
    disabled: 403,
    setup_done: 409,
    setup_unavailable: 403,
    invalid_token: 400,
    invalid_code: 401,
    conflict: 409,
    not_found: 404,
    forbidden: 403,
    seats_exceeded: 409,
    invalid: 400,
  };

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface RequestContext {
  ip: string;
  userAgent: string;
}

export interface SecurityPolicy {
  sessionTtlHours: number;
  idleTimeoutMinutes: number;
  require2faForAdmins: boolean;
}

export interface AuthDeps {
  db: Db;
  audit: AuditLog;
  box: SecretBox;
  /** SETUP_TOKEN untuk membuat akun pemilik pertama; null = penyiapan lewat UI tidak tersedia. */
  setupToken: string | null;
  /** DASHBOARD_TOKEN (token layanan lab/skrip); null = nonaktif. */
  serviceToken: string | null;
  issuer: string;
  security: () => SecurityPolicy;
  /** Batas kursi paket (pengguna aktif + undangan tertunda); null = tanpa batas. */
  seatLimit: () => number | null;
  /** Dipanggil saat penyiapan: simpan nama organisasi. */
  onSetup: (orgName: string, actor: Actor) => void;
  now?: () => number;
}

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;
const CHALLENGE_MS = 5 * 60_000;
const INVITE_MS = 72 * 3_600_000;
const RESET_MS = 24 * 3_600_000;
const TOUCH_MS = 60_000;
const DAY_MS = 86_400_000;
const MAX_TOKENS_PER_USER = 10;
export const API_TOKEN_PREFIX = 'nxa_';

const INVALID_LOGIN = 'Email atau kata sandi salah.';

export function actorOfUser(u: UserRow): Actor {
  return { id: u.id, name: u.name };
}

export class AuthService {
  private readonly now: () => number;

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? Date.now;
  }

  // --- Kueri dasar -----------------------------------------------------------------

  private byEmail(email: string): UserRow | undefined {
    return this.deps.db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  private byId(id: string): UserRow | undefined {
    return this.deps.db.select().from(users).where(eq(users.id, id)).get();
  }

  userCount(): number {
    return this.deps.db.select({ n: count() }).from(users).get()?.n ?? 0;
  }

  activeUserCount(): number {
    return (
      this.deps.db.select({ n: count() }).from(users).where(eq(users.status, 'active')).get()?.n ??
      0
    );
  }

  private pendingInviteCount(): number {
    return (
      this.deps.db
        .select({ n: count() })
        .from(oneTimeTokens)
        .where(
          and(
            eq(oneTimeTokens.kind, 'invite'),
            isNull(oneTimeTokens.usedAt),
            isNull(oneTimeTokens.revokedAt),
            gt(oneTimeTokens.expiresAt, this.now()),
          ),
        )
        .get()?.n ?? 0
    );
  }

  needsSetup(): boolean {
    return this.userCount() === 0;
  }

  setupAvailable(): boolean {
    return this.deps.setupToken !== null && this.needsSetup();
  }

  userToApi(u: UserRow): User {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isOwner: u.isOwner,
      status: u.status,
      totpEnabled: u.totpEnabled,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  }

  principalOf(
    u: UserRow,
    kind: 'user' | 'api_token' = 'user',
    scope: TokenScope = 'write',
  ): Principal {
    return {
      kind,
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isOwner: u.isOwner,
      totpEnabled: u.totpEnabled,
      scope,
    };
  }

  servicePrincipal(): Principal {
    return {
      kind: 'service',
      userId: null,
      name: 'Token layanan',
      email: null,
      role: 'admin',
      isOwner: false,
      totpEnabled: false,
      scope: 'write',
    };
  }

  isServiceToken(bearer: string): boolean {
    return this.deps.serviceToken !== null && safeEqual(bearer, this.deps.serviceToken);
  }

  /** Admin yang wajib 2FA (kebijakan organisasi) tapi belum mengaktifkannya. */
  mustEnable2fa(p: Principal): boolean {
    return (
      p.kind === 'user' &&
      p.role === 'admin' &&
      !p.totpEnabled &&
      this.deps.security().require2faForAdmins
    );
  }

  private seatsLeft(): number | null {
    const limit = this.deps.seatLimit();
    return limit === null ? null : limit - this.activeUserCount() - this.pendingInviteCount();
  }

  // --- Penyiapan pemilik -------------------------------------------------------------

  async setup(input: SetupInput, ctx: RequestContext): Promise<{ token: string; user: UserRow }> {
    if (this.userCount() > 0) {
      throw new AuthError('setup_done', 'Penyiapan sudah selesai; masuk dengan akun yang ada.');
    }
    const expected = this.deps.setupToken;
    if (expected === null) {
      throw new AuthError('setup_unavailable', 'SETUP_TOKEN belum di-set di environment sensor.');
    }
    if (!safeEqual(input.setupToken, expected)) {
      this.deps.audit.record(
        { id: null, name: input.email },
        'auth.setup_failed',
        input.email,
        ctx.ip,
      );
      throw new AuthError('invalid_token', 'Token penyiapan salah.');
    }
    const hash = await hashPassword(input.password);
    // Cek ulang setelah await: dua permintaan setup serentak hanya satu yang berhasil.
    if (this.userCount() > 0) {
      throw new AuthError('setup_done', 'Penyiapan sudah selesai; masuk dengan akun yang ada.');
    }
    const t = this.now();
    const user = this.deps.db
      .insert(users)
      .values({
        id: randomUUID(),
        email: input.email,
        name: input.name,
        role: 'admin',
        isOwner: true,
        status: 'active',
        passwordHash: hash,
        createdAt: t,
        updatedAt: t,
      })
      .returning()
      .get();
    this.deps.onSetup(input.orgName, actorOfUser(user));
    this.deps.audit.record(actorOfUser(user), 'auth.setup', user.email, ctx.ip);
    return { token: this.createSession(user, ctx), user };
  }

  // --- Login --------------------------------------------------------------------------

  async login(
    email: string,
    password: string,
    ctx: RequestContext,
  ): Promise<
    { status: 'ok'; token: string; user: UserRow } | { status: 'totp_required'; challenge: string }
  > {
    const user = this.byEmail(email);
    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      this.deps.audit.record({ id: null, name: email }, 'auth.login_failed', email, ctx.ip, {
        reason: 'unknown_email',
      });
      throw new AuthError('invalid_credentials', INVALID_LOGIN);
    }
    this.assertNotLocked(user, ctx);
    if (!(await verifyPassword(password, user.passwordHash))) {
      this.registerFailure(user, ctx, 'password');
      throw new AuthError('invalid_credentials', INVALID_LOGIN);
    }
    if (user.status !== 'active') {
      this.deps.audit.record(actorOfUser(user), 'auth.login_blocked', user.email, ctx.ip, {
        reason: 'disabled',
      });
      throw new AuthError('disabled', 'Akun dinonaktifkan. Hubungi admin organisasi.');
    }
    this.clearFailures(user);
    if (user.totpEnabled) {
      const challenge = this.deps.box.sign(
        `${user.id}.${this.now() + CHALLENGE_MS}.${randomToken(9)}`,
      );
      return { status: 'totp_required', challenge };
    }
    return { status: 'ok', token: this.createSession(user, ctx), user };
  }

  loginTotp(
    challenge: string,
    code: string,
    ctx: RequestContext,
  ): { token: string; user: UserRow } {
    const payload = this.deps.box.verify(challenge);
    const [userId, exp] = payload?.split('.') ?? [];
    if (!userId || !exp || Number(exp) < this.now()) {
      throw new AuthError('invalid_token', 'Waktu verifikasi habis; masuk ulang.');
    }
    const user = this.byId(userId);
    if (user?.status !== 'active' || !user.totpEnabled) {
      throw new AuthError('invalid_token', 'Waktu verifikasi habis; masuk ulang.');
    }
    this.assertNotLocked(user, ctx);
    const step = this.checkTotp(user, code);
    if (step === null) {
      this.registerFailure(user, ctx, 'totp');
      throw new AuthError('invalid_code', 'Kode 2FA salah atau sudah dipakai.');
    }
    this.deps.db
      .update(users)
      .set({ totpLastStep: step, failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, user.id))
      .run();
    return { token: this.createSession(user, ctx), user };
  }

  private checkTotp(user: UserRow, code: string): number | null {
    const secret = user.totpSecretEnc ? this.deps.box.decrypt(user.totpSecretEnc) : null;
    return secret ? verifyTotp(secret, code, this.now(), user.totpLastStep) : null;
  }

  private assertNotLocked(user: UserRow, ctx: RequestContext): void {
    if (user.lockedUntil && user.lockedUntil > this.now()) {
      this.deps.audit.record(actorOfUser(user), 'auth.login_blocked', user.email, ctx.ip, {
        reason: 'locked',
      });
      throw new AuthError('locked', 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.');
    }
  }

  private registerFailure(user: UserRow, ctx: RequestContext, reason: string): void {
    const failed = user.failedLogins + 1;
    const lock = failed >= LOCK_AFTER;
    this.deps.db
      .update(users)
      .set(lock ? { failedLogins: 0, lockedUntil: this.now() + LOCK_MS } : { failedLogins: failed })
      .where(eq(users.id, user.id))
      .run();
    this.deps.audit.record(actorOfUser(user), 'auth.login_failed', user.email, ctx.ip, { reason });
    if (lock) this.deps.audit.record(actorOfUser(user), 'auth.locked', user.email, ctx.ip);
  }

  private clearFailures(user: UserRow): void {
    if (user.failedLogins > 0 || user.lockedUntil) {
      this.deps.db
        .update(users)
        .set({ failedLogins: 0, lockedUntil: null })
        .where(eq(users.id, user.id))
        .run();
    }
  }

  // --- Sesi login -----------------------------------------------------------------

  sessionTtlSeconds(): number {
    return this.deps.security().sessionTtlHours * 3_600;
  }

  createSession(user: UserRow, ctx: RequestContext): string {
    const token = randomToken(32);
    const t = this.now();
    const db = this.deps.db;
    db.insert(loginSessions)
      .values({
        id: sha256Hex(token),
        userId: user.id,
        createdAt: t,
        lastSeenAt: t,
        expiresAt: t + this.sessionTtlSeconds() * 1_000,
        ip: ctx.ip.slice(0, 64),
        userAgent: ctx.userAgent.slice(0, 256),
      })
      .run();
    db.update(users).set({ lastLoginAt: t }).where(eq(users.id, user.id)).run();
    this.deps.audit.record(actorOfUser(user), 'auth.login', user.email, ctx.ip);
    return token;
  }

  /** Validasi cookie sesi: umur maksimum + batas idle + akun masih aktif. */
  resolveSession(token: string): { user: UserRow; sessionId: string } | null {
    if (token.length < 20 || token.length > 128) return null;
    const id = sha256Hex(token);
    const db = this.deps.db;
    const row = db.select().from(loginSessions).where(eq(loginSessions.id, id)).get();
    if (!row) return null;
    const t = this.now();
    const idleMs = this.deps.security().idleTimeoutMinutes * 60_000;
    const user = this.byId(row.userId);
    if (row.expiresAt <= t || t - row.lastSeenAt > idleMs || !user || user.status !== 'active') {
      db.delete(loginSessions).where(eq(loginSessions.id, id)).run();
      return null;
    }
    if (t - row.lastSeenAt > TOUCH_MS) {
      db.update(loginSessions).set({ lastSeenAt: t }).where(eq(loginSessions.id, id)).run();
    }
    return { user, sessionId: id };
  }

  logout(sessionId: string, actor: Actor, ip: string): void {
    this.deps.db.delete(loginSessions).where(eq(loginSessions.id, sessionId)).run();
    this.deps.audit.record(actor, 'auth.logout', '', ip);
  }

  listSessions(userId: string, currentId: string | null): LoginSession[] {
    return this.deps.db
      .select()
      .from(loginSessions)
      .where(and(eq(loginSessions.userId, userId), gt(loginSessions.expiresAt, this.now())))
      .orderBy(desc(loginSessions.lastSeenAt))
      .all()
      .map((r) => ({
        id: r.id.slice(0, 16),
        current: r.id === currentId,
        createdAt: r.createdAt,
        lastSeenAt: r.lastSeenAt,
        expiresAt: r.expiresAt,
        ip: r.ip,
        userAgent: r.userAgent,
      }));
  }

  revokeSession(userId: string, shortId: string, actor: Actor, ip: string): void {
    if (!/^[0-9a-f]{16}$/.test(shortId)) throw new AuthError('not_found', 'sesi tidak ditemukan');
    const res = this.deps.db
      .delete(loginSessions)
      .where(and(eq(loginSessions.userId, userId), like(loginSessions.id, `${shortId}%`)))
      .run();
    if (res.changes === 0) throw new AuthError('not_found', 'sesi tidak ditemukan');
    this.deps.audit.record(actor, 'account.session_revoked', shortId, ip);
  }

  revokeOtherSessions(userId: string, currentId: string | null, actor: Actor, ip: string): number {
    const res = this.deps.db
      .delete(loginSessions)
      .where(
        currentId
          ? and(eq(loginSessions.userId, userId), ne(loginSessions.id, currentId))
          : eq(loginSessions.userId, userId),
      )
      .run();
    this.deps.audit.record(actor, 'account.sessions_revoked', '', ip, { count: res.changes });
    return res.changes;
  }

  // --- Undangan & reset kata sandi -----------------------------------------------------

  private validOneTime(token: string, kind: OneTimeTokenRow['kind']): OneTimeTokenRow | undefined {
    if (token.length < 20 || token.length > 128) return undefined;
    return this.deps.db
      .select()
      .from(oneTimeTokens)
      .where(
        and(
          eq(oneTimeTokens.id, sha256Hex(token)),
          eq(oneTimeTokens.kind, kind),
          isNull(oneTimeTokens.usedAt),
          isNull(oneTimeTokens.revokedAt),
          gt(oneTimeTokens.expiresAt, this.now()),
        ),
      )
      .get();
  }

  private inviteToApi(r: OneTimeTokenRow): Invite {
    return {
      id: r.publicId,
      email: r.email,
      role: r.role ?? 'viewer',
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      createdByName: r.createdByName,
    };
  }

  createInvite(
    email: string,
    role: Role,
    actor: Actor,
    ip: string,
  ): { invite: Invite; path: string; expiresAt: number } {
    if (this.byEmail(email)) throw new AuthError('conflict', 'Email sudah terdaftar.');
    const db = this.deps.db;
    const t = this.now();
    // Undangan lama untuk email yang sama dicabut agar hanya satu tautan yang berlaku.
    db.update(oneTimeTokens)
      .set({ revokedAt: t })
      .where(
        and(
          eq(oneTimeTokens.kind, 'invite'),
          eq(oneTimeTokens.email, email),
          isNull(oneTimeTokens.usedAt),
          isNull(oneTimeTokens.revokedAt),
        ),
      )
      .run();
    const left = this.seatsLeft();
    if (left !== null && left <= 0) {
      throw new AuthError(
        'seats_exceeded',
        'Kursi paket sudah penuh. Naikkan paket di Tagihan atau nonaktifkan pengguna.',
      );
    }
    const token = randomToken(32);
    const row = db
      .insert(oneTimeTokens)
      .values({
        id: sha256Hex(token),
        publicId: randomToken(9),
        kind: 'invite',
        email,
        role,
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt: t,
        expiresAt: t + INVITE_MS,
      })
      .returning()
      .get();
    this.deps.audit.record(actor, 'user.invited', email, ip, { role });
    return { invite: this.inviteToApi(row), path: `#/undangan/${token}`, expiresAt: row.expiresAt };
  }

  listInvites(): Invite[] {
    return this.deps.db
      .select()
      .from(oneTimeTokens)
      .where(
        and(
          eq(oneTimeTokens.kind, 'invite'),
          isNull(oneTimeTokens.usedAt),
          isNull(oneTimeTokens.revokedAt),
          gt(oneTimeTokens.expiresAt, this.now()),
        ),
      )
      .orderBy(desc(oneTimeTokens.createdAt))
      .all()
      .map((r) => this.inviteToApi(r));
  }

  revokeInvite(publicId: string, actor: Actor, ip: string): void {
    const res = this.deps.db
      .update(oneTimeTokens)
      .set({ revokedAt: this.now() })
      .where(
        and(
          eq(oneTimeTokens.publicId, publicId),
          eq(oneTimeTokens.kind, 'invite'),
          isNull(oneTimeTokens.usedAt),
          isNull(oneTimeTokens.revokedAt),
        ),
      )
      .returning()
      .get();
    if (!res) throw new AuthError('not_found', 'undangan tidak ditemukan');
    this.deps.audit.record(actor, 'user.invite_revoked', res.email, ip);
  }

  inviteInfo(token: string, orgName: string): InviteInfo | null {
    const row = this.validOneTime(token, 'invite');
    return row
      ? { email: row.email, role: row.role ?? 'viewer', orgName, expiresAt: row.expiresAt }
      : null;
  }

  async acceptInvite(
    token: string,
    name: string,
    password: string,
    ctx: RequestContext,
  ): Promise<{ token: string; user: UserRow }> {
    const invite = this.validOneTime(token, 'invite');
    if (!invite) throw new AuthError('invalid_token', 'Undangan tidak valid atau kedaluwarsa.');
    const hash = await hashPassword(password);
    // Validasi ulang setelah await (undangan bisa dipakai/dicabut bersamaan).
    const fresh = this.validOneTime(token, 'invite');
    if (!fresh) throw new AuthError('invalid_token', 'Undangan tidak valid atau kedaluwarsa.');
    if (this.byEmail(fresh.email)) throw new AuthError('conflict', 'Email sudah terdaftar.');
    const limit = this.deps.seatLimit();
    if (limit !== null && this.activeUserCount() >= limit) {
      throw new AuthError('seats_exceeded', 'Kursi paket sudah penuh; hubungi admin organisasi.');
    }
    const t = this.now();
    const db = this.deps.db;
    db.update(oneTimeTokens).set({ usedAt: t }).where(eq(oneTimeTokens.id, fresh.id)).run();
    const user = db
      .insert(users)
      .values({
        id: randomUUID(),
        email: fresh.email,
        name,
        role: fresh.role ?? 'viewer',
        isOwner: false,
        status: 'active',
        passwordHash: hash,
        createdAt: t,
        updatedAt: t,
      })
      .returning()
      .get();
    this.deps.audit.record(actorOfUser(user), 'user.invite_accepted', user.email, ctx.ip, {
      role: user.role,
    });
    return { token: this.createSession(user, ctx), user };
  }

  createResetLink(userId: string, actor: Actor, ip: string): { path: string; expiresAt: number } {
    const user = this.byId(userId);
    if (!user) throw new AuthError('not_found', 'pengguna tidak ditemukan');
    const db = this.deps.db;
    const t = this.now();
    db.update(oneTimeTokens)
      .set({ revokedAt: t })
      .where(
        and(
          eq(oneTimeTokens.kind, 'password_reset'),
          eq(oneTimeTokens.userId, userId),
          isNull(oneTimeTokens.usedAt),
          isNull(oneTimeTokens.revokedAt),
        ),
      )
      .run();
    const token = randomToken(32);
    db.insert(oneTimeTokens)
      .values({
        id: sha256Hex(token),
        publicId: randomToken(9),
        kind: 'password_reset',
        email: user.email,
        userId,
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt: t,
        expiresAt: t + RESET_MS,
      })
      .run();
    this.deps.audit.record(actor, 'user.reset_link', user.email, ip);
    return { path: `#/reset/${token}`, expiresAt: t + RESET_MS };
  }

  async resetPassword(token: string, password: string, ctx: RequestContext): Promise<void> {
    if (!this.validOneTime(token, 'password_reset')) {
      throw new AuthError('invalid_token', 'Tautan reset tidak valid atau kedaluwarsa.');
    }
    const hash = await hashPassword(password);
    const row = this.validOneTime(token, 'password_reset');
    const user = row?.userId ? this.byId(row.userId) : undefined;
    if (!row || !user)
      throw new AuthError('invalid_token', 'Tautan reset tidak valid atau kedaluwarsa.');
    const t = this.now();
    const db = this.deps.db;
    db.update(oneTimeTokens).set({ usedAt: t }).where(eq(oneTimeTokens.id, row.id)).run();
    db.update(users)
      .set({ passwordHash: hash, failedLogins: 0, lockedUntil: null, updatedAt: t })
      .where(eq(users.id, user.id))
      .run();
    db.delete(loginSessions).where(eq(loginSessions.userId, user.id)).run();
    this.deps.audit.record(actorOfUser(user), 'auth.password_reset', user.email, ctx.ip);
  }

  // --- Akun sendiri ---------------------------------------------------------------------

  requireUser(userId: string | null): UserRow {
    const user = userId ? this.byId(userId) : undefined;
    if (!user) throw new AuthError('forbidden', 'Hanya untuk akun pengguna.');
    return user;
  }

  updateProfile(userId: string, name: string, ip: string): UserRow {
    const user = this.requireUser(userId);
    const updated = this.deps.db
      .update(users)
      .set({ name, updatedAt: this.now() })
      .where(eq(users.id, userId))
      .returning()
      .get();
    this.deps.audit.record(actorOfUser(updated), 'account.profile_updated', user.email, ip);
    return updated;
  }

  async changePassword(
    userId: string,
    current: string,
    next: string,
    currentSessionId: string | null,
    ip: string,
  ): Promise<void> {
    const user = this.requireUser(userId);
    if (!(await verifyPassword(current, user.passwordHash))) {
      throw new AuthError('invalid_credentials', 'Kata sandi saat ini salah.');
    }
    const hash = await hashPassword(next);
    this.deps.db
      .update(users)
      .set({ passwordHash: hash, updatedAt: this.now() })
      .where(eq(users.id, userId))
      .run();
    // Sesi lain (perangkat lain) dikeluarkan; sesi yang sedang dipakai tetap.
    this.deps.db
      .delete(loginSessions)
      .where(
        currentSessionId
          ? and(eq(loginSessions.userId, userId), ne(loginSessions.id, currentSessionId))
          : eq(loginSessions.userId, userId),
      )
      .run();
    this.deps.audit.record(actorOfUser(user), 'account.password_changed', user.email, ip);
  }

  beginTotp(userId: string): { secret: string; otpauthUri: string } {
    const user = this.requireUser(userId);
    if (user.totpEnabled) throw new AuthError('conflict', '2FA sudah aktif.');
    const secret = generateTotpSecret();
    this.deps.db
      .update(users)
      .set({ totpSecretEnc: this.deps.box.encrypt(secret), totpLastStep: null })
      .where(eq(users.id, userId))
      .run();
    return { secret, otpauthUri: otpauthUri(secret, user.email, this.deps.issuer) };
  }

  enableTotp(userId: string, code: string, ip: string): void {
    const user = this.requireUser(userId);
    if (user.totpEnabled) throw new AuthError('conflict', '2FA sudah aktif.');
    const step = this.checkTotp(user, code);
    if (step === null)
      throw new AuthError('invalid_code', 'Kode 2FA salah. Periksa jam ponsel lalu coba lagi.');
    this.deps.db
      .update(users)
      .set({ totpEnabled: true, totpLastStep: step, updatedAt: this.now() })
      .where(eq(users.id, userId))
      .run();
    this.deps.audit.record(actorOfUser(user), 'account.2fa_enabled', user.email, ip);
  }

  async disableTotp(userId: string, password: string, code: string, ip: string): Promise<void> {
    const user = this.requireUser(userId);
    if (!user.totpEnabled) throw new AuthError('conflict', '2FA belum aktif.');
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AuthError('invalid_credentials', 'Kata sandi salah.');
    }
    if (this.checkTotp(user, code) === null) throw new AuthError('invalid_code', 'Kode 2FA salah.');
    this.deps.db
      .update(users)
      .set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null, updatedAt: this.now() })
      .where(eq(users.id, userId))
      .run();
    this.deps.audit.record(actorOfUser(user), 'account.2fa_disabled', user.email, ip);
  }

  // --- Token API ------------------------------------------------------------------------

  private tokenToApi(r: ApiTokenRow): ApiToken {
    return {
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scope: r.scope,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      expiresAt: r.expiresAt,
    };
  }

  listApiTokens(userId: string): ApiToken[] {
    return this.deps.db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .orderBy(desc(apiTokens.createdAt))
      .all()
      .map((r) => this.tokenToApi(r));
  }

  createApiToken(
    userId: string,
    input: { name: string; scope: TokenScope; expiresInDays: number | null },
    ip: string,
  ): { token: ApiToken; secret: string } {
    const user = this.requireUser(userId);
    const t = this.now();
    const active = this.listApiTokens(userId).filter(
      (x) => x.expiresAt === null || x.expiresAt > t,
    );
    if (active.length >= MAX_TOKENS_PER_USER) {
      throw new AuthError('invalid', `Maksimal ${MAX_TOKENS_PER_USER} token aktif per pengguna.`);
    }
    const secret = `${API_TOKEN_PREFIX}${randomToken(24)}`;
    const row = this.deps.db
      .insert(apiTokens)
      .values({
        id: randomToken(9),
        userId,
        name: input.name,
        tokenHash: sha256Hex(secret),
        prefix: secret.slice(0, 12),
        scope: input.scope,
        createdAt: t,
        expiresAt: input.expiresInDays === null ? null : t + input.expiresInDays * DAY_MS,
      })
      .returning()
      .get();
    this.deps.audit.record(actorOfUser(user), 'account.token_created', input.name, ip, {
      scope: input.scope,
      expiresInDays: input.expiresInDays,
    });
    return { token: this.tokenToApi(row), secret };
  }

  revokeApiToken(userId: string, tokenId: string, ip: string): void {
    const user = this.requireUser(userId);
    const res = this.deps.db
      .update(apiTokens)
      .set({ revokedAt: this.now() })
      .where(
        and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)),
      )
      .returning()
      .get();
    if (!res) throw new AuthError('not_found', 'token tidak ditemukan');
    this.deps.audit.record(actorOfUser(user), 'account.token_revoked', res.name, ip);
  }

  resolveApiToken(secret: string): Principal | null {
    if (!secret.startsWith(API_TOKEN_PREFIX) || secret.length > 128) return null;
    const db = this.deps.db;
    const row = db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, sha256Hex(secret)))
      .get();
    const t = this.now();
    if (!row || row.revokedAt !== null || (row.expiresAt !== null && row.expiresAt <= t))
      return null;
    const user = this.byId(row.userId);
    if (user?.status !== 'active') return null;
    if (row.lastUsedAt === null || t - row.lastUsedAt > TOUCH_MS) {
      db.update(apiTokens).set({ lastUsedAt: t }).where(eq(apiTokens.id, row.id)).run();
    }
    return {
      ...this.principalOf(user, 'api_token', row.scope),
      name: `${user.name} · ${row.name}`,
    };
  }

  // --- Administrasi pengguna ----------------------------------------------------------

  listUsers(): User[] {
    return this.deps.db
      .select()
      .from(users)
      .orderBy(desc(users.isOwner), users.createdAt)
      .all()
      .map((u) => this.userToApi(u));
  }

  seats(): { used: number; limit: number | null } {
    return { used: this.activeUserCount(), limit: this.deps.seatLimit() };
  }

  private otherActiveAdmins(exceptId: string): number {
    return (
      this.deps.db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), ne(users.id, exceptId)))
        .get()?.n ?? 0
    );
  }

  updateUser(targetId: string, input: UserUpdateInput, actor: Actor, ip: string): User {
    const target = this.byId(targetId);
    if (!target) throw new AuthError('not_found', 'pengguna tidak ditemukan');
    const roleChange = input.role !== undefined && input.role !== target.role;
    const disabling = input.status === 'disabled' && target.status === 'active';
    const enabling = input.status === 'active' && target.status === 'disabled';
    if (target.isOwner && (roleChange || disabling)) {
      throw new AuthError(
        'forbidden',
        'Pemilik organisasi tidak bisa diturunkan atau dinonaktifkan.',
      );
    }
    if (actor.id === target.id && (roleChange || disabling)) {
      throw new AuthError(
        'forbidden',
        'Tidak bisa mengubah peran atau menonaktifkan akun sendiri.',
      );
    }
    if (target.role === 'admin' && (disabling || (roleChange && input.role !== 'admin'))) {
      if (this.otherActiveAdmins(target.id) === 0) {
        throw new AuthError('forbidden', 'Minimal harus ada satu admin aktif.');
      }
    }
    if (enabling) {
      const limit = this.deps.seatLimit();
      if (limit !== null && this.activeUserCount() >= limit) {
        throw new AuthError('seats_exceeded', 'Kursi paket sudah penuh.');
      }
    }
    if (!roleChange && !disabling && !enabling) return this.userToApi(target);
    const db = this.deps.db;
    const updated = db
      .update(users)
      .set({
        ...(roleChange ? { role: input.role } : {}),
        ...(disabling ? { status: 'disabled' as const } : {}),
        ...(enabling ? { status: 'active' as const } : {}),
        updatedAt: this.now(),
      })
      .where(eq(users.id, targetId))
      .returning()
      .get();
    if (disabling) db.delete(loginSessions).where(eq(loginSessions.userId, targetId)).run();
    if (roleChange) {
      this.deps.audit.record(actor, 'user.role_changed', target.email, ip, {
        from: target.role,
        to: input.role,
      });
    }
    if (disabling) this.deps.audit.record(actor, 'user.disabled', target.email, ip);
    if (enabling) this.deps.audit.record(actor, 'user.enabled', target.email, ip);
    return this.userToApi(updated);
  }

  resetTotpFor(targetId: string, actor: Actor, ip: string): User {
    const target = this.byId(targetId);
    if (!target) throw new AuthError('not_found', 'pengguna tidak ditemukan');
    const updated = this.deps.db
      .update(users)
      .set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null, updatedAt: this.now() })
      .where(eq(users.id, targetId))
      .returning()
      .get();
    this.deps.audit.record(actor, 'user.2fa_reset', target.email, ip);
    return this.userToApi(updated);
  }
}
