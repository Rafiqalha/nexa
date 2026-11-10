import { describe, expect, it } from 'vitest';
import { extractLinks, findBearer, findCredentials, priorityOf } from './scripted';

describe('kebijakan scripted', () => {
  it('mengekstrak tautan dari HTML, Markdown, dan robots.txt', () => {
    const text = [
      '<a href="/dokumen">Dokumen</a>',
      '- [Arsip](/arsip-internal/a-1234)',
      'Disallow: /arsip-internal/',
      '<a href="#top">abaikan</a>',
    ].join('\n');
    expect(extractLinks(text, 'http://sensor:8080/')).toEqual([
      'http://sensor:8080/dokumen',
      'http://sensor:8080/arsip-internal/a-1234',
      'http://sensor:8080/arsip-internal/',
    ]);
  });

  it('memprioritaskan path yang tampak sensitif', () => {
    expect(priorityOf('http://x/arsip-internal/kunci-integrasi')).toBeGreaterThan(
      priorityOf('http://x/pengumuman'),
    );
    expect(priorityOf('http://x/static/style.css')).toBeLessThan(0);
  });

  it('mengenali kredensial & bearer token pada halaman umpan', () => {
    expect(findCredentials('username = svc_x12\nport = 1\npassword = B7pw-0011')).toEqual({
      username: 'svc_x12',
      password: 'B7pw-0011',
    });
    expect(findBearer('Authorization: Bearer bayu7_svc_abc')).toBe('bayu7_svc_abc');
    expect(findCredentials('tidak ada')).toBeNull();
  });
});
