// Regresi F-06 (docs/hardening-followup.md): target lab tidak boleh listen di semua antarmuka
// secara bawaan, agar mode proses lokal tidak bisa dipanggil langsung dari host lain tanpa
// sensor. Deployment container menetapkan HOST sendiri di jaringan yang terisolasi.
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import type { ServerType } from '@hono/node-server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOST, listenOptions, startTargetServer } from './listen';

const REPO = resolve(import.meta.dirname, '../../..');

describe('bind target lab (F-06)', () => {
  it('tanpa HOST, bind bawaan adalah loopback', () => {
    expect(DEFAULT_HOST).toBe('127.0.0.1');
    expect(listenOptions({})).toEqual({ hostname: '127.0.0.1', port: 3000 });
  });

  it('HOST kosong tidak membuka semua antarmuka', () => {
    expect(listenOptions({ HOST: '' }).hostname).toBe('127.0.0.1');
    expect(listenOptions({ HOST: '   ' }).hostname).toBe('127.0.0.1');
  });

  it('HOST eksplisit dari deployment tetap dipakai (compose, Railway)', () => {
    expect(listenOptions({ HOST: '0.0.0.0', PORT: '3000' })).toEqual({
      hostname: '0.0.0.0',
      port: 3000,
    });
    expect(listenOptions({ HOST: '::' }).hostname).toBe('::');
  });

  it('server tanpa HOST benar-benar listen di 127.0.0.1', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let server: ServerType | undefined;
    try {
      const info = await new Promise<AddressInfo>((done) => {
        server = startTargetServer({ PORT: '0' }, done);
      });
      expect(info.address).toBe('127.0.0.1');
      expect(info.family).toBe('IPv4');
      const res = await fetch(`http://127.0.0.1:${info.port}/api/status`);
      expect(res.status).toBe(200);
      await res.text();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('"address":"127.0.0.1"'));
    } finally {
      log.mockRestore();
      await new Promise<void>((done) => {
        if (!server) return done();
        server.close(() => done());
        if ('closeAllConnections' in server) server.closeAllConnections();
      });
    }
  });
});

/** Isi satu service di docker-compose.yml (service berindentasi dua spasi), tanpa parser YAML. */
function serviceBlock(compose: string, name: string): string {
  const lines = compose.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `service ${name} ada di docker-compose.yml`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

describe('lab Docker Compose tetap menjangkau target (F-06)', () => {
  const compose = readFileSync(join(REPO, 'deploy/docker-compose.yml'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const target = serviceBlock(compose, 'target-app');

  it('target-app menetapkan HOST=0.0.0.0 secara eksplisit', () => {
    expect(target).toMatch(/^\s+HOST:\s*["']?0\.0\.0\.0["']?\s*$/m);
  });

  it('target-app hanya di jaringan internal lab, tanpa port publish', () => {
    expect(target).not.toMatch(/^\s+ports:/m);
    expect(target).toMatch(/^\s+networks:\s*\[lab\]\s*$/m);
    expect(compose).toMatch(/^networks:\n {2}lab:\n {4}internal: true$/m);
  });

  it('sensor menjangkau target lewat nama service di jaringan lab', () => {
    expect(serviceBlock(compose, 'sensor')).toMatch(
      /^\s+UPSTREAM_URL:\s*http:\/\/target-app:3000$/m,
    );
  });
});
