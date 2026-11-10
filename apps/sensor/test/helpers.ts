import type { AddressInfo } from 'node:net';
import { type ServerType, serve } from '@hono/node-server';
import { type Config, loadConfig } from '../src/config';
import { type DbHandle, openDb, runMigrations } from '../src/db/client';

export const TEST_TOKEN = 'test-dashboard-token-0123456789';

export const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'id-ID,id;q=0.9',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-dest': 'document',
  accept: 'text/html,application/xhtml+xml',
} as const;

export interface Listening {
  server: ServerType;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export function listen(
  fetch: (req: Request, env: never) => Response | Promise<Response>,
): Promise<Listening> {
  return new Promise((resolve) => {
    const server = serve(
      { fetch: fetch as Parameters<typeof serve>[0]['fetch'], port: 0, hostname: '127.0.0.1' },
      (info: AddressInfo) => {
        resolve({
          server,
          port: info.port,
          url: `http://127.0.0.1:${info.port}`,
          close: () =>
            new Promise<void>((done) => {
              server.close(() => done());
              if ('closeAllConnections' in server) server.closeAllConnections();
            }),
        });
      },
    );
  });
}

export function testConfig(upstreamUrl: string, over: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    UPSTREAM_URL: upstreamUrl,
    DASHBOARD_TOKEN: TEST_TOKEN,
    DATABASE_PATH: ':memory:',
    ...over,
  });
}

export function testDb(): DbHandle {
  const handle = openDb(':memory:');
  runMigrations(handle.db);
  return handle;
}
