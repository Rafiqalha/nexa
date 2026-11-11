// Primitif kriptografi auth (node:crypto saja, tanpa dependensi baru).
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Token acak URL-safe (default 256 bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Perbandingan waktu-konstan untuk string sembarang panjang. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

/**
 * Kunci turunan dari AUTH_SECRET: enkripsi rahasia TOTP (AES-256-GCM) dan tanda tangan
 * HMAC untuk tantangan login 2FA. AUTH_SECRET sendiri tidak pernah keluar dari proses.
 */
export class SecretBox {
  private readonly encKey: Buffer;
  private readonly macKey: Buffer;

  constructor(secret: string) {
    this.encKey = Buffer.from(hkdfSync('sha256', secret, 'nexa-auth', 'totp-encryption', 32));
    this.macKey = Buffer.from(hkdfSync('sha256', secret, 'nexa-auth', 'challenge-mac', 32));
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      ct.toString('base64url'),
      tag.toString('base64url'),
    ].join('.');
  }

  decrypt(box: string): string | null {
    const [v, iv, ct, tag] = box.split('.');
    if (v !== 'v1' || !iv || !ct || !tag) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ct, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.macKey).update(payload).digest('base64url');
  }

  /** `payload.mac`; payload tidak boleh memuat rahasia (hanya id & waktu). */
  sign(payload: string): string {
    return `${payload}.${this.mac(payload)}`;
  }

  verify(signed: string): string | null {
    const i = signed.lastIndexOf('.');
    if (i <= 0) return null;
    const payload = signed.slice(0, i);
    return safeEqual(signed.slice(i + 1), this.mac(payload)) ? payload : null;
  }
}
