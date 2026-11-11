// Kanvas flat: warna hanya dari token CSS (tanpa bayangan, gradien, atau filter), buffer
// mengikuti ukuran CSS × DPR (maks. 2).
export interface Palette {
  bg: string;
  line: string;
  lineSubtle: string;
  lineStrong: string;
  text: string;
  text2: string;
  muted: string;
  accent: string;
  trapped: string;
  suspect: string;
  camo: readonly string[];
}

export function palette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    bg: v('--bg'),
    line: v('--line'),
    lineSubtle: v('--line-subtle'),
    lineStrong: v('--line-strong'),
    text: v('--text'),
    text2: v('--text-2'),
    muted: v('--text-muted'),
    accent: v('--accent'),
    trapped: v('--status-trapped'),
    suspect: v('--status-suspect'),
    camo: [v('--camo-1'), v('--camo-2'), v('--camo-3'), v('--camo-4'), v('--camo-5')],
  };
}

const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

export function monoFont(px: number, weight = 400): string {
  return `${weight} ${px}px ${MONO}`;
}

export const dpr = (): number => Math.min(2, window.devicePixelRatio || 1);

/**
 * Menyesuaikan buffer kanvas dengan ukuran CSS-nya. onResize dipanggil (asinkron) setiap kali
 * ukuran berubah, termasuk pertama kali, dengan transformasi sudah diskalakan ke DPR.
 */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  onResize: (width: number, height: number) => void,
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let lastW = 0;
  let lastH = 0;
  let lastD = 0;
  new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const d = dpr();
    if (w === lastW && h === lastH && d === lastD) return;
    lastW = w;
    lastH = h;
    lastD = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    onResize(w, h);
  }).observe(canvas);
  return ctx;
}

/** Kanvas di luar layar dengan ukuran logis w × h (untuk lapisan statis). */
export function offscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  const d = dpr();
  c.width = Math.round(w * d);
  c.height = Math.round(h * d);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return [c, ctx];
}

/** Sudut kotak deteksi (HUD) garis 1px, gaya anotasi teknis. */
export function hudBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  arm = 5,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const l = Math.round(x) + 0.5;
  const t = Math.round(y) + 0.5;
  const r = Math.round(x + w) - 0.5;
  const b = Math.round(y + h) - 0.5;
  ctx.moveTo(l, t + arm);
  ctx.lineTo(l, t);
  ctx.lineTo(l + arm, t);
  ctx.moveTo(r - arm, t);
  ctx.lineTo(r, t);
  ctx.lineTo(r, t + arm);
  ctx.moveTo(l, b - arm);
  ctx.lineTo(l, b);
  ctx.lineTo(l + arm, b);
  ctx.moveTo(r - arm, b);
  ctx.lineTo(r, b);
  ctx.lineTo(r, b - arm);
  ctx.stroke();
}
