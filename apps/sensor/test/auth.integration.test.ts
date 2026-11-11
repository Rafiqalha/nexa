// Regresi keamanan akun & administrasi (port admin): penyiapan pemilik, login + kunci akun,
// sesi (idle/logout), CSRF, matriks peran, token API, 2FA, mode produksi, pengaturan,
// tagihan, dan audit. Semua in-process (adminApp.request), jam bisa dimajukan.
import { LAB_LABEL, PRODUCTION_LABEL } from '@nexa/shared';
import { describe, expect, it } from 'vitest';
import { createSensor } from '../src/app';
import { totpAt, totpStep } from '../src/auth/totp';
import { apiTokens, auditLog, users } from '../src/db/schema';
import { silentLogger } from '../src/logger';
import { TEST_TOKEN, testConfig, testDb } from './helpers';

// Nilai uji saja (tidak dipakai di mana pun selain test ini).
const PASSWORD = 'uji-sandi-panjang-01';
const OWNER = { name: 'Pemilik Uji', email: 'pemilik@uji.test' };
const START = Date.UTC(2027, 0, 15, 8, 0, 0);

interface CallInit {
  method?: string;
  body?: unknown;
  cookie?: string | null;
  bearer?: string;
  headers?: Record<string, string>;
}

function makeSensor(over: Record<string, string> = {}) {
  const dbh = testDb();
  let clock = START;
  const config = testConfig('http://127.0.0.1:9', over);
  const sensor = createSensor({
    config,
    logger: silentLogger,
    db: dbh.db,
    now: () => clock,
    streamFlushMs: 50,
    interrogation: null,
  });
  const call = (path: string, init: CallInit = {}) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.cookie) headers.cookie = init.cookie;
    if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    return sensor.adminApp.request(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  };
  return {
    sensor,
    db: dbh.db,
    config,
    call,
    advance: (ms: number) => {
      clock += ms;
    },
    close: () => {
      sensor.shutdown();
      dbh.close();
    },
  };
}

function cookieOf(res: Response): string | null {
  const m = res.headers.get('set-cookie')?.match(/^([^=]+)=([^;]+)/);
  return m ? `${m[1]}=${m[2]}` : null;
}

type T = ReturnType<typeof makeSensor>;

async function setupOwner(t: T, token = TEST_TOKEN): Promise<string> {
  const res = await t.call('/auth/setup', {
    body: { setupToken: token, orgName: 'Unit Uji', ...OWNER, password: PASSWORD },
  });
  expect(res.status).toBe(200);
  const cookie = cookieOf(res);
  expect(cookie).not.toBeNull();
  return cookie as string;
}

async function login(t: T, email: string, password = PASSWORD) {
  return t.call('/auth/login', { body: { email, password } });
}

/** Undang lalu terima undangan; mengembalikan cookie pengguna baru. */
async function invite(t: T, admin: string, email: string, role: string): Promise<string> {
  const res = await t.call('/invites', { cookie: admin, body: { email, role } });
  expect(res.status).toBe(201);
  const { link } = (await res.json()) as { link: { path: string } };
  const token = link.path.split('/').pop() as string;
  const acc = await t.call('/auth/invites/accept', {
    body: { token, name: `Pengguna ${role}`, password: PASSWORD },
  });
  expect(acc.status).toBe(200);
  return cookieOf(acc) as string;
}

describe('penyiapan pemilik', () => {
  it('tanpa SETUP_TOKEN: pendaftar pertama langsung jadi pemilik (nol penyiapan)', async () => {
    const t = makeSensor();
    const status = await (await t.call('/auth/status')).json();
    expect(status).toMatchObject({
      needsSetup: true,
      setupTokenRequired: false,
      registrationOpen: false,
      principal: null,
      label: LAB_LABEL,
    });
    // DASHBOARD_TOKEN (token layanan) tidak lagi menjadi token penyiapan diam-diam.
    expect(t.config.auth.setupToken).toBeNull();

    const ok = await t.call('/auth/setup', { body: { ...OWNER, password: PASSWORD } });
    expect(ok.status).toBe(200);
    const cookie = cookieOf(ok) as string;
    const me = await (await t.call('/auth/me', { cookie })).json();
    expect(me).toMatchObject({ role: 'admin', isOwner: true, email: OWNER.email });
    // Nama organisasi opsional: tetap nilai bawaan sampai diubah di Pengaturan.
    const after = await (await t.call('/auth/status', { cookie })).json();
    expect(after).toMatchObject({ needsSetup: false, orgName: t.config.orgName });

    const again = await t.call('/auth/setup', {
      body: { name: 'Lain', email: 'lain@uji.test', password: PASSWORD },
    });
    expect(again.status).toBe(409);
    expect(t.db.select().from(users).all()).toHaveLength(1);
    t.close();
  });

  it('dengan SETUP_TOKEN: wajib token, hanya sekali, cookie HttpOnly + SameSite=Strict', async () => {
    const t = makeSensor({ SETUP_TOKEN: TEST_TOKEN });
    const status = await (await t.call('/auth/status')).json();
    expect(status).toMatchObject({
      needsSetup: true,
      setupTokenRequired: true,
      principal: null,
      label: LAB_LABEL,
    });

    const missing = await t.call('/auth/setup', { body: { ...OWNER, password: PASSWORD } });
    expect(missing.status).toBe(400);
    const wrong = await t.call('/auth/setup', {
      body: { setupToken: 'token-salah-0123456789', orgName: 'Unit', ...OWNER, password: PASSWORD },
    });
    expect(wrong.status).toBe(400);

    const ok = await t.call('/auth/setup', {
      body: { setupToken: TEST_TOKEN, orgName: 'Unit Uji', ...OWNER, password: PASSWORD },
    });
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^nexa_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\//);
    const cookie = cookieOf(ok) as string;

    const again = await t.call('/auth/setup', {
      body: {
        setupToken: TEST_TOKEN,
        orgName: 'Unit',
        name: 'Lain',
        email: 'lain@uji.test',
        password: PASSWORD,
      },
    });
    expect(again.status).toBe(409);

    const me = await (await t.call('/auth/me', { cookie })).json();
    expect(me).toMatchObject({ kind: 'user', role: 'admin', isOwner: true, email: OWNER.email });
    expect((await t.call('/overview', { cookie })).status).toBe(200);

    // Kata sandi tidak pernah disimpan apa adanya.
    const row = t.db.select().from(users).get();
    expect(row?.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(row?.passwordHash).not.toContain(PASSWORD);
    t.close();
  });
});

describe('pendaftaran mandiri', () => {
  const register = (t: T, email: string, name = 'Tamu Uji') =>
    t.call('/auth/register', { body: { name, email, password: PASSWORD } });

  it('langsung masuk sebagai Pemantau baca-saja; tidak memakai kursi paket', async () => {
    const t = makeSensor();
    const admin = await setupOwner(t);
    expect(await (await t.call('/auth/status')).json()).toMatchObject({
      needsSetup: false,
      registrationOpen: true,
    });

    const res = await register(t, 'tamu@uji.test');
    expect(res.status).toBe(200);
    const cookie = cookieOf(res) as string;
    expect(cookie).toMatch(/^nexa_session=/);
    expect(await (await t.call('/auth/me', { cookie })).json()).toMatchObject({
      kind: 'user',
      role: 'viewer',
      isOwner: false,
      email: 'tamu@uji.test',
    });
    // Langsung ke Dashboard (baca), tapi tanpa akses admin, keputusan aturan, atau token API.
    expect((await t.call('/overview', { cookie })).status).toBe(200);
    expect((await t.call('/users', { cookie })).status).toBe(403);
    expect((await t.call('/rules/999/approve', { cookie, body: {} })).status).toBe(403);
    expect(
      (
        await t.call('/settings', {
          cookie,
          method: 'PATCH',
          body: { registration: { enabled: false } },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.call('/account/tokens', {
          cookie,
          body: { name: 'uji', scope: 'read', expiresInDays: 30 },
        })
      ).status,
    ).toBe(403);

    expect((await register(t, 'TAMU@uji.test', 'Ganda')).status).toBe(409);

    // Paket Lab = 3 kursi, tapi Pemantau gratis: banyak pendaftar tetap diterima.
    for (const n of [2, 3, 4, 5]) expect((await register(t, `tamu${n}@uji.test`)).status).toBe(200);
    const list = (await (await t.call('/users', { cookie: admin })).json()) as {
      users: { role: string }[];
      seats: { used: number; limit: number | null };
    };
    expect(list.users.filter((u) => u.role === 'viewer')).toHaveLength(5);
    expect(list.seats).toEqual({ used: 1, limit: 3 });

    const audit = (await (await t.call('/audit', { cookie: admin })).json()) as {
      entries: { action: string; target: string | null }[];
    };
    expect(audit.entries.filter((e) => e.action === 'user.registered')).toHaveLength(5);
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
    t.close();
  });

  it('ditolak sebelum ada pemilik dan saat admin menutupnya', async () => {
    const t = makeSensor();
    const early = await register(t, 'cepat@uji.test');
    expect(early.status).toBe(409);
    expect(((await early.json()) as { error: string }).error).toBe('setup_required');

    const admin = await setupOwner(t);
    const closed = await t.call('/settings', {
      cookie: admin,
      method: 'PATCH',
      body: { registration: { enabled: false } },
    });
    expect(closed.status).toBe(200);
    expect(await (await t.call('/auth/status')).json()).toMatchObject({ registrationOpen: false });
    const res = await register(t, 'tamu@uji.test');
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('registration_closed');
    expect(t.db.select().from(users).all()).toHaveLength(1);
    t.close();
  });

  it('menaikkan Pemantau ke peran berkursi butuh kursi kosong', async () => {
    const t = makeSensor();
    const admin = await setupOwner(t);
    for (const n of [1, 2, 3]) await register(t, `tamu${n}@uji.test`);
    const list = (await (await t.call('/users', { cookie: admin })).json()) as {
      users: { id: string; email: string }[];
    };
    const id = (n: number) => list.users.find((u) => u.email === `tamu${n}@uji.test`)?.id;
    const promote = (n: number, role: string) =>
      t.call(`/users/${id(n)}`, { cookie: admin, method: 'PATCH', body: { role } });
    // Paket Lab = 3 kursi: pemilik + 2 peran berkursi.
    expect((await promote(1, 'analyst')).status).toBe(200);
    expect((await promote(2, 'operator')).status).toBe(200);
    const full = await promote(3, 'analyst');
    expect(full.status).toBe(409);
    expect(((await full.json()) as { error: string }).error).toBe('seats_exceeded');
    // Menurunkan kembali ke Pemantau membebaskan kursi.
    expect((await promote(2, 'viewer')).status).toBe(200);
    expect((await promote(3, 'analyst')).status).toBe(200);
    t.close();
  });

  it('percobaan daftar dibatasi per IP (30 per jam)', async () => {
    const t = makeSensor();
    await setupOwner(t);
    for (let i = 0; i < 30; i++) {
      // Body tidak valid tetap dihitung: pendaftaran massal tidak bisa lewat jalur galat.
      expect((await t.call('/auth/register', { body: { email: 'x' } })).status).toBe(400);
    }
    expect((await register(t, 'tamu@uji.test')).status).toBe(429);
    t.advance(60 * 60_000 + 1);
    expect((await register(t, 'tamu@uji.test')).status).toBe(200);
    t.close();
  });
});

describe('login', () => {
  it('pesan generik untuk email tak dikenal & sandi salah; dikunci 15 menit setelah 5 gagal', async () => {
    const t = makeSensor();
    await setupOwner(t);
    const unknown = await login(t, 'tidak-ada@uji.test');
    const wrong = await login(t, OWNER.email, 'sandi-salah-sekali');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    const msg = async (r: Response) => ((await r.json()) as { message: string }).message;
    expect(await msg(unknown)).toBe(await msg(wrong));

    for (let i = 0; i < 4; i++)
      expect((await login(t, OWNER.email, `salah-${i}-xxxxxx`)).status).toBe(401);
    // Akun terkunci: bahkan sandi benar ditolak.
    expect((await login(t, OWNER.email)).status).toBe(429);
    t.advance(16 * 60_000);
    expect((await login(t, OWNER.email)).status).toBe(200);
    t.close();
  });

  it('sesi berakhir saat idle dan saat logout', async () => {
    const t = makeSensor();
    const cookie = await setupOwner(t);
    t.advance(61 * 60_000);
    expect((await t.call('/overview', { cookie })).status).toBe(401);

    const fresh = cookieOf(await login(t, OWNER.email)) as string;
    expect((await t.call('/overview', { cookie: fresh })).status).toBe(200);
    expect((await t.call('/auth/logout', { cookie: fresh, method: 'POST' })).status).toBe(200);
    expect((await t.call('/overview', { cookie: fresh })).status).toBe(401);
    t.close();
  });
});

describe('CSRF: penjaga Origin', () => {
  it('Origin asing ditolak; dashboard dev loopback (lab) diterima', async () => {
    const t = makeSensor();
    const cookie = await setupOwner(t);
    const evil = await t.call('/auth/logout', {
      cookie,
      method: 'POST',
      headers: { origin: 'https://penyerang.example' },
    });
    expect(evil.status).toBe(403);
    const crossSite = await t.call('/settings', {
      cookie,
      method: 'PATCH',
      body: { org: { name: 'Diubah Lewat CSRF' } },
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(crossSite.status).toBe(403);
    expect((await t.call('/overview', { cookie })).status).toBe(200);
    const dev = await t.call('/auth/logout', {
      cookie,
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(dev.status).toBe(200);
    t.close();
  });
});

describe('peran & kursi paket', () => {
  it('matriks izin ditegakkan server; kursi paket Lab dibatasi', async () => {
    const t = makeSensor();
    const admin = await setupOwner(t);
    const viewer = await invite(t, admin, 'pemantau@uji.test', 'viewer');
    const operator = await invite(t, admin, 'operator@uji.test', 'operator');
    const analyst = await invite(t, admin, 'analis@uji.test', 'analyst');

    // Paket Lab = 3 kursi: pemilik + operator + analis. Pemantau tidak memakai kursi, jadi
    // undangan peran berkursi berikutnya ditolak, sedangkan undangan Pemantau tetap boleh.
    const full = await t.call('/invites', {
      cookie: admin,
      body: { email: 'operator2@uji.test', role: 'operator' },
    });
    expect(full.status).toBe(409);
    const freeViewer = await t.call('/invites', {
      cookie: admin,
      body: { email: 'pemantau2@uji.test', role: 'viewer' },
    });
    expect(freeViewer.status).toBe(201);
    expect((await t.call('/billing/plan', { cookie: admin, body: { planId: 'pro' } })).status).toBe(
      200,
    );
    const more = await t.call('/invites', {
      cookie: admin,
      body: { email: 'operator2@uji.test', role: 'operator' },
    });
    expect(more.status).toBe(201);

    for (const path of ['/overview', '/sessions', '/rules', '/intel']) {
      expect((await t.call(path, { cookie: viewer })).status, path).toBe(200);
    }
    const adminOnly = ['/users', '/settings', '/billing', '/audit'];
    for (const cookie of [viewer, operator, analyst]) {
      for (const path of adminOnly) expect((await t.call(path, { cookie })).status, path).toBe(403);
    }
    for (const path of adminOnly)
      expect((await t.call(path, { cookie: admin })).status, path).toBe(200);

    const approve = (cookie: string) => t.call('/rules/999/approve', { cookie, body: {} });
    expect((await approve(viewer)).status).toBe(403);
    expect((await approve(analyst)).status).toBe(403);
    expect((await approve(operator)).status).toBe(404); // izin lolos, rule tidak ada
    expect((await approve(admin)).status).toBe(404);

    expect((await t.call('/rules/export', { cookie: viewer })).status).toBe(403);
    const exp = await t.call('/rules/export', { cookie: analyst });
    expect(exp.status).toBe(200);
    expect(await exp.text()).toMatch(/^# NEXA/);

    // Viewer tidak boleh membuat token API; non-admin tidak boleh mengubah peran.
    const tok = await t.call('/account/tokens', {
      cookie: viewer,
      body: { name: 'uji', scope: 'read', expiresInDays: 30 },
    });
    expect(tok.status).toBe(403);
    const list = (await (await t.call('/users', { cookie: admin })).json()) as {
      users: { id: string; email: string; isOwner: boolean }[];
    };
    expect(JSON.stringify(list)).not.toMatch(/scrypt\$|password/i);
    const ownerId = list.users.find((u) => u.isOwner)?.id as string;
    const viewerId = list.users.find((u) => u.email === 'pemantau@uji.test')?.id as string;
    expect(
      (
        await t.call(`/users/${viewerId}`, {
          cookie: operator,
          method: 'PATCH',
          body: { role: 'admin' },
        })
      ).status,
    ).toBe(403);

    // Pemilik tidak bisa diturunkan; admin tidak bisa menonaktifkan diri sendiri.
    expect(
      (
        await t.call(`/users/${ownerId}`, {
          cookie: admin,
          method: 'PATCH',
          body: { role: 'viewer' },
        })
      ).status,
    ).toBe(403);
    // Nonaktifkan pengguna: sesinya langsung tidak berlaku.
    expect(
      (
        await t.call(`/users/${viewerId}`, {
          cookie: admin,
          method: 'PATCH',
          body: { status: 'disabled' },
        })
      ).status,
    ).toBe(200);
    expect((await t.call('/overview', { cookie: viewer })).status).toBe(401);
    t.close();
  });
});

describe('token API', () => {
  it('disimpan sebagai hash; baca-saja tidak bisa mengubah; dicabut = ditolak', async () => {
    const t = makeSensor();
    const admin = await setupOwner(t);
    const operator = await invite(t, admin, 'operator@uji.test', 'operator');
    const mk = async (scope: string) => {
      const res = await t.call('/account/tokens', {
        cookie: operator,
        body: { name: `token ${scope}`, scope, expiresInDays: 30 },
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { token: { id: string }; secret: string };
    };
    const read = await mk('read');
    const write = await mk('write');
    expect(read.secret.startsWith('nxa_')).toBe(true);
    const rows = t.db.select().from(apiTokens).all();
    expect(rows.every((r) => r.tokenHash !== read.secret && r.tokenHash !== write.secret)).toBe(
      true,
    );
    const listed = await (await t.call('/account/tokens', { cookie: operator })).text();
    expect(listed).not.toContain(read.secret);

    expect((await t.call('/overview', { bearer: read.secret })).status).toBe(200);
    expect((await t.call('/rules/999/approve', { bearer: read.secret, body: {} })).status).toBe(
      403,
    );
    expect((await t.call('/rules/999/approve', { bearer: write.secret, body: {} })).status).toBe(
      404,
    );
    // Token API tidak bisa dipakai untuk mengelola akun (membuat token baru, dst.).
    expect((await t.call('/account/tokens', { bearer: write.secret })).status).toBe(403);

    expect(
      (await t.call(`/account/tokens/${read.token.id}`, { cookie: operator, method: 'DELETE' }))
        .status,
    ).toBe(200);
    expect((await t.call('/overview', { bearer: read.secret })).status).toBe(401);
    t.advance(31 * 86_400_000);
    expect((await t.call('/overview', { bearer: write.secret })).status).toBe(401);
    t.close();
  });
});

describe('2FA (TOTP)', () => {
  it('login butuh kode; kode yang sama tidak bisa dipakai ulang; rahasia terenkripsi', async () => {
    const t = makeSensor();
    const admin = await setupOwner(t);
    const setup = (await (
      await t.call('/account/totp/setup', { cookie: admin, method: 'POST' })
    ).json()) as {
      secret: string;
      otpauthUri: string;
    };
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const stored = t.db.select().from(users).get();
    expect(stored?.totpSecretEnc).not.toContain(setup.secret);

    const now0 = START;
    const enable = await t.call('/account/totp/enable', {
      cookie: admin,
      body: { code: totpAt(setup.secret, totpStep(now0)) },
    });
    expect(enable.status).toBe(200);

    t.advance(30_000);
    const first = (await (await login(t, OWNER.email)).json()) as {
      status: string;
      challenge: string;
    };
    expect(first.status).toBe('totp_required');
    const wrong = await t.call('/auth/login/totp', {
      body: { challenge: first.challenge, code: '000000' },
    });
    expect(wrong.status).toBe(401);
    const code = totpAt(setup.secret, totpStep(START + 30_000));
    const ok = await t.call('/auth/login/totp', { body: { challenge: first.challenge, code } });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).not.toBeNull();

    const second = (await (await login(t, OWNER.email)).json()) as { challenge: string };
    const replay = await t.call('/auth/login/totp', {
      body: { challenge: second.challenge, code },
    });
    expect(replay.status).toBe(401);

    // Tantangan kedaluwarsa setelah 5 menit.
    t.advance(6 * 60_000);
    const late = await t.call('/auth/login/totp', {
      body: {
        challenge: second.challenge,
        code: totpAt(setup.secret, totpStep(START + 30_000 + 6 * 60_000)),
      },
    });
    expect(late.status).toBe(400);
    t.close();
  });
});

describe('mode produksi', () => {
  it('cookie __Host- + Secure, HSTS, label trafik nyata, origin ketat', async () => {
    const t = makeSensor({
      NEXA_MODE: 'production',
      AUTH_SECRET: 'rahasia-auth-uji-0123456789-abcdefghij',
      SETUP_TOKEN: 'token-penyiapan-uji-0123',
      DASHBOARD_ORIGIN: 'https://nexa.uji.test',
    });
    const status = await t.call('/auth/status');
    expect(((await status.json()) as { label: string }).label).toBe(PRODUCTION_LABEL);
    const res = await t.call('/auth/setup', {
      body: {
        setupToken: 'token-penyiapan-uji-0123',
        orgName: 'Unit Uji',
        ...OWNER,
        password: PASSWORD,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/^__Host-nexa_session=.*Secure/i);
    const cookie = cookieOf(res) as string;
    const overview = await t.call('/overview', { cookie });
    expect(((await overview.json()) as { label: string }).label).toBe(PRODUCTION_LABEL);
    expect(overview.headers.get('strict-transport-security')).toMatch(/max-age=31536000/);
    expect(overview.headers.get('cache-control')).toBe('no-store');

    const loopback = await t.call('/auth/logout', {
      cookie,
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(loopback.status).toBe(403);
    const own = await t.call('/auth/logout', {
      cookie,
      method: 'POST',
      headers: { origin: 'https://nexa.uji.test' },
    });
    expect(own.status).toBe(200);
    t.close();
  });
});

describe('pengaturan', () => {
  it('diterapkan langsung, tervalidasi, dibatasi paket, tanpa secret', async () => {
    const t = makeSensor();
    const admin = await setupOwner(t);
    const res = await t.call('/settings', {
      cookie: admin,
      method: 'PATCH',
      body: {
        detection: { suspectThreshold: 0.7, agentThreshold: 0.9 },
        intel: { dailyTokenBudget: 999_999 },
      },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(t.config.detect.suspectThreshold).toBe(0.7);
    expect(t.config.detect.agentThreshold).toBe(0.9);
    // Paket Lab membatasi intel 50 ribu token/hari walau pengaturan lebih besar.
    expect(t.sensor.budget.status().limit).toBe(50_000);
    expect(body).not.toContain(TEST_TOKEN);
    expect(body).not.toContain(t.config.auth.secret);

    const bad = await t.call('/settings', {
      cookie: admin,
      method: 'PATCH',
      body: { detection: { suspectThreshold: 0.9, agentThreshold: 0.5 } },
    });
    expect(bad.status).toBe(400);
    t.close();
  });
});

describe('tagihan', () => {
  it('naik paket prorata, pelunasan manual, turun paket terjadwal, invoice bulanan', async () => {
    const t = makeSensor();
    let admin = await setupOwner(t);
    // Sesi login berakhir saat jam dimajukan berhari-hari: masuk lagi.
    const relogin = async () => {
      admin = cookieOf(await login(t, OWNER.email)) as string;
    };
    type Billing = {
      subscription: { planId: string; scheduledPlanId: string | null; status: string };
      invoices: { id: string; amountIdr: number; status: string; paidByName: string | null }[];
    };
    const get = async () => (await (await t.call('/billing', { cookie: admin })).json()) as Billing;
    expect((await get()).subscription.planId).toBe('lab');

    expect((await t.call('/billing/plan', { cookie: admin, body: { planId: 'pro' } })).status).toBe(
      200,
    );
    let b = await get();
    expect(b.subscription.planId).toBe('pro');
    const prorata = b.invoices[0];
    expect(prorata?.status).toBe('open');
    // 15 Jan 15:00 WIB: sisa ±16,4 dari 31 hari.
    expect(prorata?.amountIdr).toBeGreaterThan(2_400_000);
    expect(prorata?.amountIdr).toBeLessThan(2_700_000);

    const pay = await t.call(`/billing/invoices/${prorata?.id}/pay`, {
      cookie: admin,
      body: { paymentRef: 'TRF-0001' },
    });
    expect(pay.status).toBe(200);
    expect(((await pay.json()) as { paidByName: string }).paidByName).toBe(OWNER.name);
    expect(
      (
        await t.call(`/billing/invoices/${prorata?.id}/pay`, {
          cookie: admin,
          body: { paymentRef: 'TRF-0002' },
        })
      ).status,
    ).toBe(409);
    expect(
      (await t.call('/billing/plan', { cookie: admin, body: { planId: 'enterprise' } })).status,
    ).toBe(400);

    // Bulan berikutnya: invoice penuh paket Pro.
    t.advance(20 * 86_400_000);
    await relogin();
    b = await get();
    expect(b.invoices.some((i) => i.amountIdr === 4_900_000 && i.status === 'open')).toBe(true);

    // Turun paket berlaku di periode berikutnya.
    expect((await t.call('/billing/plan', { cookie: admin, body: { planId: 'lab' } })).status).toBe(
      200,
    );
    b = await get();
    expect(b.subscription).toMatchObject({ planId: 'pro', scheduledPlanId: 'lab' });
    t.advance(31 * 86_400_000);
    await relogin();
    b = await get();
    expect(b.subscription).toMatchObject({ planId: 'lab', scheduledPlanId: null });
    // Invoice Pro bulan lalu belum dibayar dan lewat jatuh tempo -> past_due.
    expect(b.subscription.status).toBe('past_due');
    t.close();
  });
});

describe('audit', () => {
  it('mencatat aksi penting dengan aktor; tanpa kata sandi/token di meta', async () => {
    const t = makeSensor();
    const admin = await setupOwner(t);
    await invite(t, admin, 'operator@uji.test', 'operator');
    await t.call('/settings', {
      cookie: admin,
      method: 'PATCH',
      body: { org: { name: 'Unit Uji Baru' } },
    });
    await login(t, OWNER.email, 'sandi-salah-sekali');
    const res = await t.call('/audit', { cookie: admin });
    const { entries } = (await res.json()) as { entries: { action: string; actorName: string }[] };
    const actions = entries.map((e) => e.action);
    for (const a of [
      'auth.setup',
      'user.invited',
      'user.invite_accepted',
      'settings.update',
      'auth.login_failed',
    ]) {
      expect(actions, a).toContain(a);
    }
    const raw = JSON.stringify(t.db.select().from(auditLog).all());
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain('sandi-salah-sekali');
    expect(raw).not.toContain(TEST_TOKEN);
    t.close();
  });
});
