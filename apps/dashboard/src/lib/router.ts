// Router hash kecil (tanpa dependensi).
// Rute: #/, #/sesi, #/sesi/<id>, #/intel, #/aturan, #/pengguna, #/tagihan, #/pengaturan,
// #/audit, #/akun, dan rute publik #/undangan/<token>, #/reset/<token>. Tanpa login,
// #/daftar membuka tab Daftar di layar masuk (setelah masuk diperlakukan sebagai Dashboard).
// `#/kontak` lama tetap diterima sebagai alias `#/sesi` agar tautan lama tidak putus.
import { useSyncExternalStore } from 'react';

export const APP_PAGES = [
  'dashboard',
  'sesi',
  'intel',
  'aturan',
  'pengguna',
  'tagihan',
  'pengaturan',
  'audit',
  'akun',
] as const;
export type AppPage = (typeof APP_PAGES)[number];
/** Halaman publik (tanpa login): menerima undangan dan reset kata sandi. */
export type PublicPage = 'undangan' | 'reset';
export type Page = AppPage | PublicPage;

export interface Route {
  page: Page;
  id: string | null;
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first, second] = parts;
  if (first === 'sesi' || first === 'kontak') return { page: 'sesi', id: second ?? null };
  if (first === 'undangan' || first === 'reset') return { page: first, id: second ?? null };
  if (first && (APP_PAGES as readonly string[]).includes(first) && first !== 'sesi') {
    return { page: first as AppPage, id: null };
  }
  return { page: 'dashboard', id: null };
}

export function isPublicPage(page: Page): page is PublicPage {
  return page === 'undangan' || page === 'reset';
}

export const HREF: Readonly<Record<AppPage, string>> = {
  dashboard: '#/',
  sesi: '#/sesi',
  intel: '#/intel',
  aturan: '#/aturan',
  pengguna: '#/pengguna',
  tagihan: '#/tagihan',
  pengaturan: '#/pengaturan',
  audit: '#/audit',
  akun: '#/akun',
};

export function sessionHref(id: string): string {
  return `#/sesi/${id}`;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

/** Tautan langsung ke tab Daftar di layar masuk. */
export const REGISTER_HASH = '#/daftar';

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

export function useRoute(): Route {
  return parseHash(useHash());
}
