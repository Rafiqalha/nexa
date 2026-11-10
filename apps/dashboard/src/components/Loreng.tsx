// Loreng digital (DESIGN.md §5): blok piksel grid 10px, prosedural & deterministik,
// hanya di dasar sidebar, dekoratif (aria-hidden), tanpa animasi.
const COLORS = [
  'var(--camo-1)',
  'var(--camo-2)',
  'var(--camo-3)',
  'var(--camo-4)',
  'var(--camo-5)',
];
const CELL = 10;
const COLS = 32;
const ROWS = 16;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Blob {
  x: number;
  y: number;
  color: number;
}

function buildCells(seed: number): Array<{ x: number; y: number; color: number }> {
  const rnd = mulberry32(seed);
  const blobs: Blob[] = Array.from({ length: 26 }, () => ({
    x: rnd() * COLS,
    y: rnd() * ROWS,
    color: Math.floor(rnd() * COLORS.length),
  }));
  const cells: Array<{ x: number; y: number; color: number }> = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i] as Blob;
        // Jarak Chebyshev menghasilkan tepi kotak-kotak khas loreng digital.
        const d = Math.max(Math.abs(b.x - x), Math.abs(b.y - y) * 1.6);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      cells.push({ x, y, color: (blobs[best] as Blob).color });
    }
  }
  return cells;
}

const CELLS = buildCells(7);

export function Loreng({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="160"
    >
      {CELLS.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x * CELL}
          y={c.y * CELL}
          width={CELL}
          height={CELL}
          fill={COLORS[c.color]}
        />
      ))}
    </svg>
  );
}
