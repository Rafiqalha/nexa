// Status login dari sensor (GET /api/auth/status). Sesi berupa cookie httpOnly yang diatur
// server: browser tidak pernah memegang token di JavaScript, sessionStorage, atau bundle.
import {
  type AuthStatus,
  AuthStatusSchema,
  can,
  type Permission,
  type Principal,
} from '@nexa/shared';
import { useSyncExternalStore } from 'react';

export interface AuthState {
  status: AuthStatus | null;
  /** Sensor tidak terjangkau saat memeriksa status. */
  offline: boolean;
}

let state: AuthState = { status: null, offline: false };
const listeners = new Set<() => void>();

function set(next: AuthState): void {
  state = next;
  for (const l of listeners) l();
}

let inflight: Promise<AuthStatus | null> | null = null;

/** Muat ulang status login (dipanggil saat start, setelah login/logout, dan saat 401). */
export function refreshAuth(): Promise<AuthStatus | null> {
  inflight ??= (async () => {
    try {
      const res = await fetch('/api/auth/status', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const status = AuthStatusSchema.parse(await res.json());
      set({ status, offline: false });
      return status;
    } catch {
      set({ status: state.status, offline: true });
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { accept: 'application/json' } });
  } finally {
    window.location.hash = '#/';
    await refreshAuth();
  }
}

export function getAuth(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function usePrincipal(): Principal | null {
  return useAuth().status?.principal ?? null;
}

/** Izin hanya untuk menampilkan/menyembunyikan aksi; server tetap memeriksa setiap rute. */
export function useCan(permission: Permission): boolean {
  return can(usePrincipal()?.role, permission);
}
