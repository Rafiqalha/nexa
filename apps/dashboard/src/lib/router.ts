// Router hash kecil (tanpa dependensi). Rute: #/, #/kontak, #/kontak/<id>, #/intel, #/aturan.
import { useSyncExternalStore } from 'react';

export type Page = 'pos' | 'kontak' | 'intel' | 'aturan';
export interface Route {
  page: Page;
  id: string | null;
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first, second] = parts;
  if (first === 'kontak') return { page: 'kontak', id: second ?? null };
  if (first === 'intel') return { page: 'intel', id: null };
  if (first === 'aturan') return { page: 'aturan', id: null };
  return { page: 'pos', id: null };
}

export const HREF: Readonly<Record<Page, string>> = {
  pos: '#/',
  kontak: '#/kontak',
  intel: '#/intel',
  aturan: '#/aturan',
};

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
