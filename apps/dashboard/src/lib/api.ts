// Klien REST: cookie sesi dikirim otomatis (same-origin); setiap respons divalidasi zod.
import type { z } from 'zod';
import { refreshAuth } from './auth';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'Sensor tidak terjangkau. Periksa koneksi lalu coba lagi.');
  }
  if (!res.ok) {
    let message = `Permintaan gagal (HTTP ${res.status}).`;
    let code: string | null = null;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
      code = body.error ?? null;
    } catch {
      // body bukan JSON
    }
    // Sesi berakhir di tengah jalan: muat ulang status agar layar masuk tampil.
    if (res.status === 401 && !path.startsWith('/api/auth/')) void refreshAuth();
    if (code === 'mfa_required') void refreshAuth();
    throw new ApiError(res.status, message, code);
  }
  return schema.parse(await res.json());
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  return request(path, schema);
}

export function apiPost<T extends z.ZodType>(
  path: string,
  body: unknown,
  schema: T,
): Promise<z.infer<T>> {
  return request(path, schema, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
  });
}

export function apiPatch<T extends z.ZodType>(
  path: string,
  body: unknown,
  schema: T,
): Promise<z.infer<T>> {
  return request(path, schema, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
  });
}

export function apiDelete<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  return request(path, schema, { method: 'DELETE' });
}

/** Galat validasi di sisi klien (pesannya aman ditampilkan). */
export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientError';
  }
}

/** Pesan galat yang aman ditampilkan (dari server/validasi klien, atau cadangan). */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof ClientError ? err.message : fallback;
}
