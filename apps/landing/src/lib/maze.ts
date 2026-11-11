// Labirin deterministik (recursive backtracker) dengan PRNG yang sama dengan sensor:
// seed yang sama selalu menghasilkan labirin dan urutan jelajah yang sama.
import { Rng } from '../../../sensor/src/labyrinth/prng';

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export interface Maze {
  cols: number;
  rows: number;
  /** Bitmask sisi terbuka per sel (N/E/S/W). */
  open: Uint8Array;
  /** Jejak jelajah berurutan (termasuk mundur di jalan buntu); tiap langkah bertetangga. */
  walk: number[];
}

const DIRS = [
  [N, 0, -1, S],
  [E, 1, 0, W],
  [S, 0, 1, N],
  [W, -1, 0, E],
] as const;

export function buildMaze(seed: string, cols: number, rows: number): Maze {
  const rng = new Rng(seed);
  const n = cols * rows;
  const open = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const stack: number[] = [0];
  const walk: number[] = [0];
  seen[0] = 1;
  while (stack.length > 0) {
    const cur = stack[stack.length - 1] as number;
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    const options: Array<readonly [number, number, number]> = [];
    for (const [bit, dx, dy, back] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nb = ny * cols + nx;
      if (!seen[nb]) options.push([bit, back, nb]);
    }
    if (options.length === 0) {
      stack.pop();
      const top = stack[stack.length - 1];
      if (top !== undefined) walk.push(top);
      continue;
    }
    const [bit, back, nb] = rng.pick(options);
    open[cur] = (open[cur] ?? 0) | bit;
    open[nb] = (open[nb] ?? 0) | back;
    seen[nb] = 1;
    stack.push(nb);
    walk.push(nb);
  }
  return { cols, rows, open, walk };
}

/** Sel tetangga yang terhubung (tanpa dinding) dengan sel `cell`. */
export function neighbors(m: Maze, cell: number): number[] {
  const o = m.open[cell] ?? 0;
  const out: number[] = [];
  if (o & N) out.push(cell - m.cols);
  if (o & E) out.push(cell + 1);
  if (o & S) out.push(cell + m.cols);
  if (o & W) out.push(cell - 1);
  return out;
}
