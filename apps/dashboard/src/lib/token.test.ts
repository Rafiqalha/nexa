import { describe, expect, it } from 'vitest';
import { absoluteLink, normalizeToken } from './token';

describe('normalizeToken', () => {
  const T = 'Ab3-x_9QzLk2mN8pR4sT6uV0wY1zB5cD';

  it('membiarkan token bersih', () => {
    expect(normalizeToken(T)).toBe(T);
  });

  it('membuang spasi, awalan variabel, dan tanda kutip yang ikut tersalin', () => {
    for (const pasted of [
      `  ${T}\n`,
      `DASHBOARD_TOKEN=${T}`,
      `SETUP_TOKEN=${T}`,
      `setup_token = ${T}`,
      `"${T}"`,
      `'${T}'`,
      `SETUP_TOKEN="${T}"\r\n`,
    ]) {
      expect(normalizeToken(pasted)).toBe(T);
    }
  });

  it('tidak membuang kutip yang tidak berpasangan', () => {
    expect(normalizeToken(`"${T}`)).toBe(`"${T}`);
  });
});

describe('absoluteLink', () => {
  it('menggabungkan origin dashboard dan path hash undangan', () => {
    expect(absoluteLink('#/undangan/abc', 'https://nexa.example.org')).toBe(
      'https://nexa.example.org/#/undangan/abc',
    );
    expect(absoluteLink('#/reset/x', 'http://127.0.0.1:8081/')).toBe(
      'http://127.0.0.1:8081/#/reset/x',
    );
  });
});
