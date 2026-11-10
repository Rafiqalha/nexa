import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const SECRET_TOKEN = 'rahasia-dashboard-token-123456';

const validEnv = {
  UPSTREAM_URL: 'http://target-app:3000',
  DASHBOARD_TOKEN: SECRET_TOKEN,
};

function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  throw new Error('loadConfig seharusnya gagal');
}

describe('loadConfig', () => {
  it('menerapkan default untuk env opsional', () => {
    const c = loadConfig(validEnv, { baseDir: '/srv/nexa' });
    expect(c.sensor.port).toBe(8080);
    expect(c.admin.port).toBe(8081);
    expect(c.admin.host).toBe('127.0.0.1');
    expect(c.detect.suspectThreshold).toBe(0.6);
    expect(c.detect.honeylinkPaths).toEqual(['/arsip-internal/']);
    expect(c.labyrinth.charsPerToken).toBe(4);
    expect(c.llm.dailyTokenBudget).toBe(200_000);
    expect(c.sensor.upstreamUrl.host).toBe('target-app:3000');
  });

  it('menganggap nilai kosong sama dengan tidak di-set', () => {
    const c = loadConfig({ ...validEnv, SENSOR_PORT: '', SUSPECT_SCORE_THRESHOLD: '  ' });
    expect(c.sensor.port).toBe(8080);
    expect(c.detect.suspectThreshold).toBe(0.6);
  });

  it('gagal bila UPSTREAM_URL tidak ada', () => {
    const problems = problemsOf({ DASHBOARD_TOKEN: SECRET_TOKEN });
    expect(problems.join('\n')).toMatch(/UPSTREAM_URL: wajib di-set/);
  });

  it('gagal bila DASHBOARD_TOKEN kosong atau terlalu pendek', () => {
    expect(problemsOf({ UPSTREAM_URL: 'http://x:1' }).join('\n')).toMatch(/DASHBOARD_TOKEN/);
    expect(problemsOf({ ...validEnv, DASHBOARD_TOKEN: 'pendek' }).join('\n')).toMatch(
      /DASHBOARD_TOKEN: minimal 16 karakter/,
    );
  });

  it('gagal bila URL/port/ambang tidak valid', () => {
    const problems = problemsOf({
      ...validEnv,
      UPSTREAM_URL: 'ftp://target-app',
      SENSOR_PORT: '99999',
      SUSPECT_SCORE_THRESHOLD: '1.5',
    });
    const text = problems.join('\n');
    expect(text).toMatch(/UPSTREAM_URL/);
    expect(text).toMatch(/SENSOR_PORT/);
    expect(text).toMatch(/SUSPECT_SCORE_THRESHOLD/);
  });

  it('gagal bila ambang agent lebih kecil dari ambang suspect', () => {
    const problems = problemsOf({
      ...validEnv,
      SUSPECT_SCORE_THRESHOLD: '0.8',
      AGENT_SCORE_THRESHOLD: '0.5',
    });
    expect(problems.join('\n')).toMatch(/AGENT_SCORE_THRESHOLD/);
  });

  it('gagal bila honeylink tidak diawali "/"', () => {
    const problems = problemsOf({ ...validEnv, HONEYLINK_PATHS: '/ok/,salah' });
    expect(problems.join('\n')).toMatch(/HONEYLINK_PATHS/);
  });

  it('tidak pernah menampilkan nilai secret di pesan error', () => {
    const apiKey = 'sk-sangat-rahasia-000111';
    try {
      loadConfig({
        DASHBOARD_TOKEN: SECRET_TOKEN,
        DEEPSEEK_API_KEY: apiKey,
        UPSTREAM_URL: 'bukan-url',
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as Error).message;
      expect(msg).not.toContain(SECRET_TOKEN);
      expect(msg).not.toContain(apiKey);
    }
  });

  it('menyelesaikan path relatif terhadap baseDir', () => {
    const c = loadConfig({ ...validEnv, DATABASE_PATH: './data/x.db' }, { baseDir: '/srv/nexa' });
    expect(c.db.path.replaceAll('\\', '/')).toMatch(/\/srv\/nexa\/data\/x\.db$/);
    const mem = loadConfig({ ...validEnv, DATABASE_PATH: ':memory:' });
    expect(mem.db.path).toBe(':memory:');
  });
});
