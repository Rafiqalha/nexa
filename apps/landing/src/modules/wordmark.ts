// Wordmark footer: "NEXA" huruf piksel 5×7 di atas loreng digital (algoritma blob yang sama
// dengan Loreng dashboard). Sel tersusun diagonal saat pertama terlihat; sel di bawah kursor
// menyala lalu memudar (jejak). Loop hanya berjalan selama ada gerak; reduced-motion: statis.
import { mulberry32 } from '../../../sensor/src/labyrinth/prng';
import { fitCanvas, type Palette, palette } from '../lib/canvas';
import { reducedMotion } from '../lib/motion';

const GLYPHS: Record<string, readonly string[]> = {
  N: ['1...1', '11..1', '1.1.1', '1.1.1', '1..11', '1...1', '1...1'],
  E: ['11111', '1....', '1....', '1111.', '1....', '1....', '11111'],
  X: ['1...1', '1...1', '.1.1.', '..1..', '.1.1.', '1...1', '1...1'],
  A: ['.111.', '1...1', '1...1', '11111', '1...1', '1...1', '1...1'],
};
const WORD = 'NEXA';
const ROWS = 9; // 7 baris huruf + 1 sel margin atas & bawah
const COLS = 25; // 4 huruf × 5 + 3 sela + 1 sel margin kiri & kanan

/** Ukuran sel, jumlah kolom, dan kolom awal huruf pertama untuk kanvas w × h (px CSS). */
function grid(w: number, h: number): { cell: number; cols: number; x0: number } {
  const cell = Math.max(4, Math.floor(Math.min(w / COLS, h / ROWS)));
  const cols = Math.ceil(w / cell);
  return { cell, cols, x0: Math.max(1, Math.floor((cols - (COLS - 2)) / 2)) };
}

/** Tengah puncak huruf terakhir (A: baris atas ".111.") dalam koordinat kanvas: tempat duduk robot footer. */
export function wordmarkLedge(w: number, h: number): { x: number; y: number; cell: number } {
  const { cell, x0 } = grid(w, h);
  const ax = x0 + 6 * (WORD.length - 1);
  return { x: (ax + 2.5) * cell, y: cell, cell };
}

/** Peta nada loreng per sel (indeks 0..2 → --camo-1..3), deterministik. */
function camoMap(cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const rnd = mulberry32(7);
  const blobs = Array.from({ length: Math.max(8, Math.round(cols / 2)) }, () => ({
    x: rnd() * cols,
    y: rnd() * rows,
    tone: Math.floor(rnd() * 3),
  }));
  const out = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      blobs.forEach((b, i) => {
        // Jarak Chebyshev → tepi kotak-kotak khas loreng digital.
        const d = Math.max(Math.abs(b.x - x), Math.abs(b.y - y) * 1.6);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      out[y * cols + x] = blobs[best]?.tone ?? 0;
    }
  }
  return out;
}

export function initWordmark(canvas: HTMLCanvasElement): void {
  const reduced = reducedMotion();
  let pal: Palette = palette();
  let cols = 0;
  let cell = 0;
  let w = 0;
  let h = 0;
  let letter = new Uint8Array(0);
  let tone = new Uint8Array(0);
  let heat = new Float32Array(0);
  let born = 0; // detik sejak mulai tersusun; < 0 = belum terlihat
  let raf = 0;
  let last = 0;
  let pointer: { x: number; y: number } | null = null;

  const ctx = fitCanvas(canvas, (cw, ch) => {
    w = cw;
    h = ch;
    const g = grid(w, h);
    cell = g.cell;
    cols = g.cols;
    letter = new Uint8Array(cols * ROWS);
    let x0 = g.x0;
    for (const ch of WORD) {
      const glyph = GLYPHS[ch] ?? [];
      glyph.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) {
          const x = x0 + gx;
          if (row[gx] === '1' && x < cols) letter[(gy + 1) * cols + x] = 1;
        }
      });
      x0 += 6;
    }
    tone = camoMap(cols, ROWS);
    heat = new Float32Array(cols * ROWS);
    draw();
  });
  if (!ctx) return;

  const appearDelay = (i: number) => ((i % cols) + Math.floor(i / cols) * 2) * 0.026;

  function draw(): void {
    if (!ctx || cols === 0) return;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    const tones = [pal.camo[0], pal.camo[1], pal.camo[2]] as string[];
    // Jejak kursor memudar dalam dua tahap warna (tanpa cahaya, hanya ganti warna sel).
    const letterShade = [pal.muted, pal.text2, pal.text];
    const groundShade = [pal.camo[3], pal.camo[4]] as string[];
    for (let i = 0; i < letter.length; i++) {
      if (!reduced && born < appearDelay(i)) continue;
      const x = (i % cols) * cell;
      const y = Math.floor(i / cols) * cell;
      const v = heat[i] ?? 0;
      const level = v > 0.66 ? 2 : v > 0.33 ? 1 : 0;
      if (letter[i]) ctx.fillStyle = letterShade[level] as string;
      else
        ctx.fillStyle =
          level > 0 ? (groundShade[level - 1] as string) : (tones[tone[i] ?? 0] as string);
      ctx.fillRect(x, y, cell - 1, cell - 1);
    }
  }

  const busy = () => born < appearDelay(letter.length - 1) + 0.1 || heat.some((v) => v > 0);

  function tick(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    born += dt;
    if (pointer) {
      const cx = Math.floor(pointer.x / cell);
      const cy = Math.floor(pointer.y / cell);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < cols && y < ROWS) heat[y * cols + x] = 1;
        }
      }
    }
    for (let i = 0; i < heat.length; i++) {
      const v = heat[i] ?? 0;
      if (v > 0) heat[i] = Math.max(0, v - dt * 0.9);
    }
    draw();
    raf = busy() || pointer ? requestAnimationFrame(tick) : 0;
  }

  const wake = () => {
    if (reduced || raf !== 0) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  if (reduced) {
    born = Number.POSITIVE_INFINITY;
  } else {
    born = -1;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && born < 0) {
        born = 0;
        wake();
      }
    });
    io.observe(canvas);
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (born < 0) born = 0;
      wake();
    });
    canvas.addEventListener('pointerleave', () => {
      pointer = null;
    });
  }
  void document.fonts.ready.then(() => {
    pal = palette();
    draw();
  });
}
