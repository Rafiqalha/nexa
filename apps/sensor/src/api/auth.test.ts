// Regresi keamanan auth dashboard: token salah berulang dikunci sementara (429), tetapi
// request TANPA token (layar login memeriksa mode proxy dev) tidak ikut dihitung.
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { bearerOf, requireToken, tokenMatches } from './auth';

const TOKEN = 'Ab3-x_9QzLk2mN8pR4sT6uV0wY1zB5cD';

function app() {
  const a = new Hono();
  a.use(
    '*',
    requireToken(TOKEN, () => '127.0.0.1'),
  );
  a.get('/x', (c) => c.text('ok'));
  return a;
}

async function call(a: Hono, auth?: string): Promise<number> {
  const res = await a.request('/x', auth ? { headers: { authorization: auth } } : {});
  return res.status;
}

describe('requireToken', () => {
  it('token benar diterima, salah atau kosong ditolak', async () => {
    const a = app();
    expect(await call(a, `Bearer ${TOKEN}`)).toBe(200);
    expect(await call(a, 'Bearer salah')).toBe(401);
    expect(await call(a)).toBe(401);
    expect(await call(a, TOKEN)).toBe(401);
  });

  it('20 token salah dalam semenit -> 429, bahkan untuk token benar', async () => {
    const a = app();
    for (let i = 0; i < 20; i++) expect(await call(a, `Bearer tebakan-${i}`)).toBe(401);
    expect(await call(a, 'Bearer tebakan-lagi')).toBe(429);
    expect(await call(a, `Bearer ${TOKEN}`)).toBe(429);
  });

  it('request tanpa token tidak menghabiskan jatah percobaan operator', async () => {
    const a = app();
    for (let i = 0; i < 50; i++) expect(await call(a)).toBe(401);
    expect(await call(a, `Bearer ${TOKEN}`)).toBe(200);
  });

  it('helper', () => {
    expect(bearerOf(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(bearerOf('Basic abc')).toBeNull();
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false);
  });
});
