// TOTP (RFC 6238, HMAC-SHA1, 6 digit, 30 detik) untuk 2FA. Kompatibel dengan aplikasi
// authenticator umum. Implementasi kecil di atas node:crypto, tanpa dependensi.
import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from './crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_MS = 30_000;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Rahasia 160-bit (disarankan RFC 4226). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: number): number {
  return Math.floor(now / TOTP_STEP_MS);
}

export function totpAt(secretB32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secretB32)).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const bin =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Cocokkan kode dengan toleransi ±1 langkah (jam ponsel bergeser). Langkah yang sudah
 * pernah dipakai (`lastStep`) ditolak agar kode yang tersadap tidak bisa diputar ulang.
 * Mengembalikan langkah yang cocok, atau null.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  now: number,
  lastStep: number | null,
): number | null {
  const step = totpStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    if (safeEqual(totpAt(secretB32, s), code)) return s;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
