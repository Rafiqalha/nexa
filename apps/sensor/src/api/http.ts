// Tipe & helper bersama rute port admin.
import type { HttpBindings } from '@hono/node-server';
import type { Principal } from '@nexa/shared';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { Actor } from '../audit/log';
import { AUTH_ERROR_STATUS, AuthError } from '../auth/service';

export interface AdminVariables {
  principal: Principal;
  /** sha256 token sesi login (null untuk token API / token layanan). */
  loginSessionId: string | null;
}

export type AdminEnv = { Bindings: HttpBindings; Variables: AdminVariables };
export type AdminContext = Context<AdminEnv>;

export const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Baca & validasi body JSON; galat zod diringkas jadi satu pesan yang ramah. */
export async function readJson<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return {
      ok: false,
      res: c.json({ error: 'bad_request', message: 'body JSON tidak valid' }, 400),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      res: c.json(
        { error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'input tidak valid' },
        400,
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export function actorOf(p: Principal): Actor {
  return { id: p.userId, name: p.name };
}

/** Ubah AuthError jadi respons JSON; galat lain dilempar ulang ke onError (500). */
export function authErrorResponse(c: Context, err: unknown): Response {
  if (err instanceof AuthError) {
    return c.json({ error: err.code, message: err.message }, AUTH_ERROR_STATUS[err.code]);
  }
  throw err;
}
