import { Readable } from 'node:stream';

export interface PeekedBody {
  /** Byte awal body, paling banyak `limit` byte, untuk inspeksi. */
  head: Buffer;
  /** true bila body lebih panjang dari `limit`: inspeksi hanya mencakup `head` (best effort). */
  truncated: boolean;
  /** Body utuh untuk upstream: potongan yang sudah terbaca, lalu sisa stream asli. */
  body: Readable;
}

/**
 * Membaca paling banyak `limit` byte pertama body untuk inspeksi canary (F-10,
 * docs/hardening-followup.md). Tidak bergantung pada Content-Length, jadi body
 * `Transfer-Encoding: chunked` dan body besar tetap diperiksa bagian awalnya.
 *
 * Body tidak dipotong: `body` memutar ulang potongan yang sudah terbaca lalu melanjutkan sisa
 * stream, sehingga upstream menerima byte yang sama dengan yang dikirim klien. Memori per request
 * dibatasi sekitar `limit` ditambah satu chunk. Token yang berada setelah `limit` byte tidak
 * terlihat oleh inspeksi.
 */
export async function peekBody(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<PeekedBody> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let ended = false;
  // Baca sampai lewat `limit` (atau habis) agar body yang tepat `limit` byte tidak dianggap terpotong.
  while (size <= limit) {
    const next = await reader.read();
    if (next.done) {
      ended = true;
      break;
    }
    chunks.push(next.value);
    size += next.value.byteLength;
  }

  async function* replay(): AsyncGenerator<Uint8Array> {
    try {
      for (const chunk of chunks) yield chunk;
      if (ended) return;
      for (;;) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  return {
    head: Buffer.concat(chunks).subarray(0, limit),
    truncated: size > limit,
    body: Readable.from(replay(), { objectMode: false }),
  };
}
