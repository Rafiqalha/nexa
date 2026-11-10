// Escaping konten rule Suricata. Nilai dari penyerang (UA, path) TIDAK BOLEH bisa
// menyuntikkan opsi rule baru (mis. `"; sid:1; ...`). Karakter khusus dienkode |XX|.

/** Karakter yang wajib di-escape di dalam `content:"..."` plus semua non-ASCII/kontrol. */
const SPECIAL = new Set(['"', ';', '\\', '|', ':']);

export function escapeContent(value: string): string {
  const bytes = Buffer.from(value, 'utf8');
  let out = '';
  let hex: string[] = [];
  const flush = () => {
    if (hex.length > 0) {
      out += `|${hex.join(' ')}|`;
      hex = [];
    }
  };
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    if (b < 0x20 || b > 0x7e || SPECIAL.has(ch)) {
      hex.push(b.toString(16).toUpperCase().padStart(2, '0'));
    } else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

/** Teks msg: hanya karakter aman, tanpa kutip/titik koma/backslash, maks 120 karakter. */
export function safeMsg(value: string): string {
  return value
    .replace(/[^\p{L}\p{N} ./_:()@-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Nilai metadata: [a-z0-9_-] saja. */
export function safeMeta(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 64) || 'x'
  );
}
