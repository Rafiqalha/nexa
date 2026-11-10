// Kredensial dashboard hanya di sessionStorage tab ini (tidak pernah di bundle/localStorage).
import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'nexa.token';
const OPERATOR_KEY = 'nexa.operator';
/** Penanda proxy dev menyisipkan token (DASHBOARD_DEV_AUTOAUTH=1); token tidak ada di browser. */
const PROXY_AUTH = '__proxy__';

export interface AuthState {
  token: string | null;
  operator: string;
}

const listeners = new Set<() => void>();
let snapshot: AuthState = read();

function read(): AuthState {
  return {
    token: sessionStorage.getItem(TOKEN_KEY),
    operator: sessionStorage.getItem(OPERATOR_KEY) ?? '',
  };
}

function emit(): void {
  snapshot = read();
  for (const l of listeners) l();
}

export function getAuth(): AuthState {
  return snapshot;
}

export function signIn(token: string, operator: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(OPERATOR_KEY, operator);
  emit();
}

export function signInViaProxy(operator: string): void {
  signIn(PROXY_AUTH, operator);
}

export function setOperator(operator: string): void {
  sessionStorage.setItem(OPERATOR_KEY, operator);
  emit();
}

export function signOut(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  emit();
}

/** Header Authorization; kosong bila token disisipkan proxy dev. */
export function authHeaders(): Record<string, string> {
  const t = snapshot.token;
  return t && t !== PROXY_AUTH ? { authorization: `Bearer ${t}` } : {};
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}
