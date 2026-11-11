// AUTH_SECRET yang dibuat sekali dan disimpan di folder data sensor (izin 0600) bila tidak
// disediakan lewat env. Nilainya tidak pernah dicetak ke log.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../logger';

export function loadOrCreateSecret(path: string, logger?: Logger): string {
  if (existsSync(path)) {
    const value = readFileSync(path, 'utf8').trim();
    if (value.length >= 32) {
      logger?.info('auth secret loaded from data dir', { path });
      return value;
    }
    throw new Error(`berkas secret auth tidak valid: ${path}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  const value = randomBytes(48).toString('base64url');
  // flag wx: gagal bila berkas muncul bersamaan (dua proses) daripada menimpa.
  writeFileSync(path, `${value}\n`, { mode: 0o600, flag: 'wx' });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows: izin POSIX tidak berlaku.
  }
  logger?.info('auth secret generated in data dir', { path });
  return value;
}
