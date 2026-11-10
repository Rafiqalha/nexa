import { Hono } from 'hono';
import { ANNOUNCEMENTS, DOCUMENTS, layout, ROBOTS_TXT, STYLE_CSS, UNIT_NAME } from './content';

/**
 * "Portal satuan" fiktif untuk lab NEXA. Semua respons statis dan deterministik
 * agar respons lewat sensor bisa dibandingkan byte-per-byte dengan akses langsung.
 */
export function createTargetApp(): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const items = ANNOUNCEMENTS.map(
      (a) => `<li><a href="/pengumuman#${a.id}">${a.judul}</a> <small>${a.tanggal}</small></li>`,
    ).join('\n');
    return c.html(
      layout(
        'Beranda',
        `<p>Selamat datang di portal internal ${UNIT_NAME}. Gunakan menu di atas untuk melihat pengumuman dan dokumen umum.</p>
<h2>Pengumuman terbaru</h2>
<ul>
${items}
</ul>`,
        { honeylink: true },
      ),
    );
  });

  app.get('/pengumuman', (c) => {
    const items = ANNOUNCEMENTS.map(
      (a) =>
        `<article id="${a.id}"><h2>${a.judul}</h2><p><small>${a.tanggal}</small></p><p>${a.isi}</p></article>`,
    ).join('\n');
    return c.html(layout('Pengumuman', items));
  });

  app.get('/dokumen', (c) => {
    const items = DOCUMENTS.map((d) => `<li><a href="/dokumen/${d.slug}">${d.judul}</a></li>`).join(
      '\n',
    );
    return c.html(layout('Dokumen Umum', `<ul>\n${items}\n</ul>`, { honeylink: true }));
  });

  app.get('/dokumen/:slug', (c) => {
    const doc = DOCUMENTS.find((d) => d.slug === c.req.param('slug'));
    if (!doc) return c.html(layout('Tidak ditemukan', '<p>Dokumen tidak ditemukan.</p>'), 404);
    const body = `<ol>\n${doc.isi.map((p) => `<li>${p}</li>`).join('\n')}\n</ol>`;
    return c.html(layout(doc.judul, body));
  });

  app.get('/kontak', (c) =>
    c.html(
      layout(
        'Kontak',
        `<p>Helpdesk portal: helpdesk@bayu7.latihan.test</p>
<p>Jam layanan: Senin–Jumat, 08.00–15.00 WIB.</p>`,
      ),
    ),
  );

  app.get('/login', (c) =>
    c.html(
      layout(
        'Masuk',
        `<form method="post" action="/login">
<label>Nama pengguna <input name="username" autocomplete="username"></label>
<label>Kata sandi <input name="password" type="password" autocomplete="current-password"></label>
<button type="submit">Masuk</button>
</form>`,
      ),
    ),
  );

  // Login lab selalu gagal: tidak ada akun nyata di portal fiktif ini.
  app.post('/login', (c) =>
    c.html(layout('Masuk', '<p>Login gagal. Periksa nama pengguna dan kata sandi.</p>'), 401),
  );

  app.get('/api/status', (c) =>
    c.json({ service: 'portal-satuan', unit: UNIT_NAME, status: 'ok', version: '1.4.2' }),
  );

  app.get('/api/pengumuman', (c) => c.json({ items: ANNOUNCEMENTS }));

  app.get('/robots.txt', (c) => c.text(ROBOTS_TXT));

  app.get('/static/style.css', (c) => {
    c.header('content-type', 'text/css; charset=utf-8');
    return c.body(STYLE_CSS);
  });

  app.notFound((c) => c.html(layout('Tidak ditemukan', '<p>Halaman tidak ditemukan.</p>'), 404));

  return app;
}
