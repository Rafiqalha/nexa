import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

describe('logger', () => {
  it('menulis JSON dan menyamarkan kunci yang tampak seperti secret', () => {
    const lines: string[] = [];
    const log = createLogger('info', { svc: 'test' }, (l) => lines.push(l));
    log.info('hello', {
      apiKey: 'sk-123',
      nested: { authorization: 'Bearer abc', path: '/x' },
      DASHBOARD_TOKEN: 'tok',
      password: 'p',
      tokens: 520,
      apiToken: 'rahasia',
    });
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0] ?? '{}');
    expect(rec.msg).toBe('hello');
    expect(rec.svc).toBe('test');
    expect(rec.apiKey).toBe('[REDACTED]');
    expect(rec.nested.authorization).toBe('[REDACTED]');
    expect(rec.nested.path).toBe('/x');
    expect(rec.DASHBOARD_TOKEN).toBe('[REDACTED]');
    expect(rec.password).toBe('[REDACTED]');
    expect(rec.tokens).toBe(520);
    expect(rec.apiToken).toBe('[REDACTED]');
    expect(lines[0]).not.toContain('sk-123');
  });

  it('menghormati level log', () => {
    const lines: string[] = [];
    const log = createLogger('warn', {}, (l) => lines.push(l));
    log.info('skip');
    log.warn('keep');
    expect(lines).toHaveLength(1);
  });
});
