import { describe, expect, it } from 'vitest';
import { loginErrorMessage, normalizeToken } from './token';

describe('normalizeToken', () => {
  const T = 'Ab3-x_9QzLk2mN8pR4sT6uV0wY1zB5cD';

  it('membiarkan token bersih', () => {
    expect(normalizeToken(T)).toBe(T);
  });

  it('membuang spasi, awalan variabel, dan tanda kutip yang ikut tersalin', () => {
    for (const pasted of [
      `  ${T}\n`,
      `DASHBOARD_TOKEN=${T}`,
      `dashboard_token = ${T}`,
      `"${T}"`,
      `'${T}'`,
      `DASHBOARD_TOKEN="${T}"\r\n`,
    ]) {
      expect(normalizeToken(pasted)).toBe(T);
    }
  });

  it('tidak membuang kutip yang tidak berpasangan', () => {
    expect(normalizeToken(`"${T}`)).toBe(`"${T}`);
  });
});

describe('loginErrorMessage', () => {
  it('pesan berbeda untuk token salah, terkunci sementara, dan sensor mati', () => {
    expect(loginErrorMessage(401, 'http://127.0.0.1:8081')).toContain('DASHBOARD_TOKEN');
    expect(loginErrorMessage(429, 'http://127.0.0.1:8081')).toContain('1 menit');
    expect(loginErrorMessage(null, 'http://127.0.0.1:8081')).toContain('tidak terjangkau');
    expect(loginErrorMessage(500, 'http://127.0.0.1:8081')).toContain('HTTP 500');
  });

  it('tidak pernah memuat nilai token', () => {
    expect(loginErrorMessage(401, 'x')).not.toMatch(/Bearer|[A-Za-z0-9_-]{32}/);
  });
});
