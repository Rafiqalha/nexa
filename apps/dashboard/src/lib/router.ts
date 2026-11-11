// Router hash kecil (tanpa dependensi). Rute: #/, #/sesi, #/sesi/<id>, #/intel, #/aturan.
// `#/kontak` lama tetap diterima sebagai alias `#/sesi` agar tautan lama tidak putus.
import { useSyncExternalStore } from 'react';

export type Page = 'dashboard' | 'sesi' | 'intel' | 'aturan';
export interface Route {
  page: Page;
  id: string | null;
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first, second] = parts;
  if (first === 'sesi' || first === 'kontak') return { page: 'sesi', id: second ?? null };
  if (first === 'intel') return { page: 'intel', id: null };
  if (first === 'aturan') return { page: 'aturan', id: null };
  return { page: 'dashboard', id: null };
}

export const HREF: Readonly<Record<Page, string>> = {
  dashboard: '#/',
  sesi: '#/sesi',
  intel: '#/intel',
  aturan: '#/aturan',
};

export function sessionHref(id: string): string {
  return `#/sesi/${id}`;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
