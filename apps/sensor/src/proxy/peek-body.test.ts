import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { peekBody } from './peek-body';

/** Stream web dari potongan tetap. `pulled()` = byte yang sudah diambil dari sumber. */
function source(chunks: readonly Uint8Array[]) {
  let index = 0;
  let bytes = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const next = chunks[index++];
        if (next === undefined) {
          controller.close();
          return;
        }
        bytes += next.byteLength;
        controller.enqueue(next);
      },
    },
    // Tanpa prefetch: sumber hanya dibaca bila diminta, agar batas baca bisa diukur.
    { highWaterMark: 0 },
  );
  return { stream, pulled: () => bytes };
}

describe('peekBody: inspeksi body berbatas (F-10)', () => {
  it('body kecil multi-chunk dibaca utuh, termasuk token yang terbelah antar chunk', async () => {
    const chunks = ['username=svc_x&', 'password=B7pw-01234567', '89abcdef'].map((s) =>
      Buffer.from(s),
    );
    const { stream } = source(chunks);
    const peeked = await peekBody(stream, 1024);
    expect(peeked.head.toString('utf8')).toBe('username=svc_x&password=B7pw-0123456789abcdef');
    expect(peeked.truncated).toBe(false);
    expect((await buffer(peeked.body)).equals(Buffer.concat(chunks))).toBe(true);
  });

  it('body kosong', async () => {
    const peeked = await peekBody(source([]).stream, 1024);
    expect(peeked.head.length).toBe(0);
    expect(peeked.truncated).toBe(false);
    expect((await buffer(peeked.body)).length).toBe(0);
  });

  it('body tepat sebesar batas tidak dianggap terpotong', async () => {
    const peeked = await peekBody(source([Buffer.from('1234'), Buffer.from('5678')]).stream, 8);
    expect(peeked.head.toString('utf8')).toBe('12345678');
    expect(peeked.truncated).toBe(false);
  });

  it('body di atas batas: sumber dibaca secukupnya, head dipotong, body diteruskan utuh', async () => {
    const limit = 4 * 1024;
    const chunks = Array.from({ length: 64 }, (_, i) => Buffer.alloc(1024, i));
    const { stream, pulled } = source(chunks);
    const peeked = await peekBody(stream, limit);
    // Sebelum diteruskan, hanya `limit` + satu chunk yang dibaca dari klien.
    expect(pulled()).toBeLessThanOrEqual(limit + 1024);
    expect(peeked.truncated).toBe(true);
    expect(peeked.head.length).toBe(limit);
    expect(peeked.head.equals(Buffer.concat(chunks).subarray(0, limit))).toBe(true);

    const forwarded = await buffer(peeked.body);
    expect(forwarded.length).toBe(64 * 1024);
    expect(forwarded.equals(Buffer.concat(chunks))).toBe(true);
    expect(pulled()).toBe(64 * 1024);
  });
});
