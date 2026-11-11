// Regresi keamanan auth port admin: token bearer salah berulang dikunci sementara (429),
// tetapi request TANPA kredensial (dashboard memeriksa status) tidak ikut dihitung.
import { describe, expect, it } from 'vitest';
import { TEST_TOKEN, testConfig, testDb } from '../../test/helpers';
import { createSensor } from '../app';
import { silentLogger } from '../logger';
import { bearerOf, tokenMatches } from './auth';

function admin() {
  const dbh = testDb();
  const sensor = createSensor({
    config: testConfig('http://127.0.0.1:9'),
    logger: silentLogger,
    db: dbh.db,
    interrogation: null,
  });
  const call = async (auth?: string) =>
    (
      await sensor.adminApp.request(
        '/api/overview',
        auth ? { headers: { authorization: auth } } : {},
      )
    ).status;
  return {
    call,
    close: () => {
      sensor.shutdown();
      dbh.close();
    },
  };
}

describe('authenticate: token layanan', () => {
  it('token benar diterima, salah atau kosong ditolak', async () => {
    const a = admin();
    expect(await a.call(`Bearer ${TEST_TOKEN}`)).toBe(200);
    expect(await a.call('Bearer salah')).toBe(401);
    expect(await a.call()).toBe(401);
    expect(await a.call(TEST_TOKEN)).toBe(401);
    a.close();
  });

  it('20 token salah dalam semenit -> 429, bahkan untuk token benar', async () => {
    const a = admin();
    for (let i = 0; i < 20; i++) expect(await a.call(`Bearer tebakan-${i}`)).toBe(401);
    expect(await a.call('Bearer tebakan-lagi')).toBe(429);
    expect(await a.call(`Bearer ${TEST_TOKEN}`)).toBe(429);
    a.close();
  });

  it('request tanpa kredensial tidak menghabiskan jatah percobaan', async () => {
    const a = admin();
    for (let i = 0; i < 50; i++) expect(await a.call()).toBe(401);
    expect(await a.call(`Bearer ${TEST_TOKEN}`)).toBe(200);
    a.close();
  });

  it('helper', () => {
    expect(bearerOf(`Bearer ${TEST_TOKEN}`)).toBe(TEST_TOKEN);
    expect(bearerOf('Basic abc')).toBeNull();
    expect(tokenMatches(TEST_TOKEN, TEST_TOKEN)).toBe(true);
    expect(tokenMatches(`${TEST_TOKEN}x`, TEST_TOKEN)).toBe(false);
  });
});
