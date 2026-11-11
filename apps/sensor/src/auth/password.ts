// Hash kata sandi dengan scrypt (bawaan Node). Format: scrypt$N$r$p$salt$hash (base64url).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { ...opts, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** NFKC agar kata sandi yang tampak sama (mis. dari keyboard berbeda) menghasilkan hash sama. */
const norm = (p: string) => p.normalize('NFKC');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(norm(password), salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, 'base64url');
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(cost.N) || cost.N > 1 << 20 || expected.length < 32) return false;
  const key = await scrypt(norm(password), Buffer.from(salt, 'base64url'), expected.length, cost);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Hash tiruan berparameter sama: dipakai saat email tidak terdaftar agar waktu respons
 * login setara (mencegah enumerasi akun lewat timing).
 */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${'A'.repeat(22)}$${'A'.repeat(86)}`;
