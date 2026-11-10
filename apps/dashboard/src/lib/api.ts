// Klien REST: setiap respons divalidasi dengan skema zod dari @nexa/shared.
import type { z } from 'zod';
import { authHeaders, signOut } from './auth';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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
  const res = await fetch(path, {
    ...init,
    headers: { accept: 'application/json', ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    signOut();
    throw new ApiError(401, 'Sesi berakhir atau token tidak valid.');
  }
  if (!res.ok) {
    let message = `Permintaan gagal (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // abaikan body non-JSON
    }
    throw new ApiError(res.status, message);
  }
  return schema.parse(await res.json());
}

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
    headers: { 'content-type': 'application/json' },
  });
}

/** Cek token tanpa mengubah state (dipakai form masuk & deteksi proxy dev). */
export async function probe(headers: Record<string, string>): Promise<boolean> {
  return (await probeStatus(headers)) === 200;
}

/** Status HTTP pemeriksaan token; null bila sensor tidak terjangkau. */
export async function probeStatus(headers: Record<string, string>): Promise<number | null> {
  try {
    const res = await fetch('/api/overview', { headers });
    return res.status;
  } catch {
    return null;
  }
}
