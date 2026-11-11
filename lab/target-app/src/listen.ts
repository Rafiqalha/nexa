import type { AddressInfo } from 'node:net';
import { type ServerType, serve } from '@hono/node-server';
import { createTargetApp } from './app';

/**
 * Bind bawaan target lab adalah loopback (F-06, docs/hardening-followup.md). Pada mode proses
 * lokal (`pnpm lab:local`, `pnpm lab:up` tanpa Docker) target hanya menerima koneksi dari mesin
 * yang sama, yaitu dari sensor, dan tidak bisa dipanggil langsung dari host lain di jaringan.
 *
 * Deployment yang mengisolasi target di jaringan sendiri menetapkan HOST secara eksplisit:
 * Docker Compose `HOST=0.0.0.0` (jaringan internal `lab`, tanpa port publish) dan Railway
 * `HOST=::` (jaringan privat, tanpa domain publik).
 */
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3000;

export interface ListenOptions {
  hostname: string;
  port: number;
}

/**
 * Membaca alamat bind dari env. HOST kosong diperlakukan sama dengan tidak di-set, karena
 * `listen(port, '')` di Node berarti semua antarmuka.
 */
export function listenOptions(env: Readonly<Record<string, string | undefined>>): ListenOptions {
  const host = env.HOST?.trim();
  return {
    hostname: host ? host : DEFAULT_HOST,
    port: Number(env.PORT ?? DEFAULT_PORT),
  };
}

export function startTargetServer(
  env: Readonly<Record<string, string | undefined>>,
  onListening?: (info: AddressInfo) => void,
): ServerType {
  const { hostname, port } = listenOptions(env);
  return serve({ fetch: createTargetApp().fetch, port, hostname }, (info) => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'target-app listening',
        address: info.address,
        port: info.port,
      }),
    );
    onListening?.(info);
  });
}
