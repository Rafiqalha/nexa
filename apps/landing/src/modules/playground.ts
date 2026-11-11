// FIG. 08 Labirin dari seed: pengunjung mengetik seed, labirin dibangkitkan deterministik
// (PRNG sensor), lalu agen menjelajahinya sel demi sel. Tiap sel baru = satu halaman umpan
// (path fiktif dari kosakata sensor). Selesai satu lapis, lapis berikutnya dibangkitkan dari
// seed yang sama, jadi labirin tidak pernah habis. Grid tetap 26×16 agar seed yang sama
// menghasilkan labirin yang sama di semua ukuran layar.
import { hashString } from '../../../sensor/src/labyrinth/prng';
import { decoyPath } from '../content/decoys';
import { fitCanvas, hudBrackets, type Palette, palette } from '../lib/canvas';
import { buildMaze, type Maze } from '../lib/maze';
import { formatNumber, Loop, reducedMotion } from '../lib/motion';

const COLS = 26;
const ROWS = 16;
const STEPS_PER_SECOND = 22;
const LIST_MAX = 7;
const RANDOM_SEEDS = ['GARUDA', 'KABUT-TIMUR', 'RIMBA-HIJAU', 'ELANG-SENJA', 'SAMUDRA-DIAM'];

export function initPlayground(section: HTMLElement): void {
  const input = section.querySelector<HTMLInputElement>('#seed');
  const canvas = section.querySelector<HTMLCanvasElement>('canvas');
  const list = section.querySelector<HTMLOListElement>('[data-play="list"]');
  const hashEl = section.querySelector('[data-play="hash"]');
  const layerEl = section.querySelector('[data-play="layer"]');
  const pagesEl = section.querySelector('[data-play="pages"]');
  const randomBtn = section.querySelector<HTMLButtonElement>('[data-play="random"]');
  if (!input || !canvas || !list) return;

  const reduced = reducedMotion();
  let pal: Palette = palette();
  let size = { w: 0, h: 0, cell: 0, ox: 0, oy: 0 };
  let seed = input.value.trim() || 'NEXA';
  let layer = 1;
  let maze: Maze = buildMaze(`${seed}#1`, COLS, ROWS);
  let visited = new Uint8Array(COLS * ROWS);
  let idx = 0;
  let pages = 0;
  let carry = 0;
  let pause = 0;
  let pendingPage: { n: number; path: string } | null = null;

  const ctx = fitCanvas(canvas, (w, h) => {
    const cell = Math.floor(Math.min((w - 2) / COLS, (h - 2) / ROWS));
    size = {
      w,
      h,
      cell,
      ox: Math.floor((w - cell * COLS) / 2),
      oy: Math.floor((h - cell * ROWS) / 2),
    };
    render();
  });
  if (!ctx) return;

  const layerSeed = () => `${seed}#${layer}`;

  function build(): void {
    maze = buildMaze(layerSeed(), COLS, ROWS);
    visited = new Uint8Array(COLS * ROWS);
    idx = 0;
    carry = 0;
    pause = 0;
    visited[0] = 1;
    if (hashEl) hashEl.textContent = hashString(seed).toString(16).padStart(8, '0');
    if (layerEl) layerEl.textContent = formatNumber(layer);
    if (reduced) {
      visited.fill(1);
      idx = maze.walk.length - 1;
    }
  }

  function restart(nextSeed: string): void {
    seed = nextSeed.trim() || 'NEXA';
    layer = 1;
    pages = reduced ? COLS * ROWS : 0;
    list?.replaceChildren();
    build();
    if (reduced) {
      for (let i = 0; i < LIST_MAX; i++) addPage(i + 1, decoyPath(layerSeed(), i), false);
    }
    if (pagesEl) pagesEl.textContent = formatNumber(pages);
    render();
  }

  function addPage(n: number, path: string, animate = true): void {
    if (!list) return;
    const li = document.createElement('li');
    if (animate) li.className = 'is-new';
    const num = document.createElement('span');
    num.className = 'n';
    num.textContent = String(n).padStart(3, '0');
    const p = document.createElement('span');
    p.textContent = path;
    li.append(num, p);
    if (animate) list.prepend(li);
    else list.append(li);
    while (list.children.length > LIST_MAX) list.lastElementChild?.remove();
  }

  function step(dt: number): void {
    if (idx >= maze.walk.length - 1) {
      pause += dt;
      if (pause > 1.4) {
        layer += 1;
        build();
      }
      return;
    }
    carry += dt * STEPS_PER_SECOND;
    while (carry >= 1 && idx < maze.walk.length - 1) {
      carry -= 1;
      idx += 1;
      const c = maze.walk[idx] as number;
      if (!visited[c]) {
        visited[c] = 1;
        pages += 1;
        pendingPage = { n: pages, path: decoyPath(layerSeed(), c) };
      }
    }
    // Paling banyak satu baris baru per frame agar daftar tetap terbaca.
    if (pendingPage) {
      addPage(pendingPage.n, pendingPage.path);
      pendingPage = null;
      if (pagesEl) pagesEl.textContent = formatNumber(pages);
    }
  }

  function render(): void {
    if (!ctx || size.cell <= 0) return;
    const { w, h, cell, ox, oy } = size;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    const tones = [pal.camo[1], pal.camo[2], pal.camo[3], pal.camo[4]] as string[];
    const recent = new Set(maze.walk.slice(Math.max(0, idx - 10), idx + 1));
    for (let c = 0; c < visited.length; c++) {
      if (!visited[c]) continue;
      const x = ox + (c % COLS) * cell;
      const y = oy + Math.floor(c / COLS) * cell;
      ctx.fillStyle = recent.has(c)
        ? pal.lineStrong
        : (tones[(c * 7 + layer) % tones.length] as string);
      ctx.fillRect(x + 1, y + 1, cell - 1, cell - 1);
    }
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c < maze.open.length; c++) {
      const x = ox + (c % COLS) * cell;
      const y = oy + Math.floor(c / COLS) * cell;
      const o = maze.open[c] ?? 0;
      if (!(o & 1)) {
        ctx.moveTo(x, y + 0.5);
        ctx.lineTo(x + cell, y + 0.5);
      }
      if (!(o & 8) && c !== 0) {
        ctx.moveTo(x + 0.5, y);
        ctx.lineTo(x + 0.5, y + cell);
      }
      if (c % COLS === COLS - 1) {
        ctx.moveTo(x + cell - 0.5, y);
        ctx.lineTo(x + cell - 0.5, y + cell);
      }
      if (Math.floor(c / COLS) === ROWS - 1) {
        ctx.moveTo(x, y + cell - 0.5);
        ctx.lineTo(x + cell, y + cell - 0.5);
      }
    }
    ctx.stroke();
    if (!reduced) {
      const c = maze.walk[idx] as number;
      const ax = ox + (c % COLS) * cell + cell / 2;
      const ay = oy + Math.floor(c / COLS) * cell + cell / 2;
      const s = Math.max(4, Math.round(cell * 0.36));
      ctx.fillStyle = pal.trapped;
      ctx.fillRect(Math.round(ax - s / 2), Math.round(ay - s / 2), s, s);
      hudBrackets(ctx, ax - cell * 0.8, ay - cell * 0.8, cell * 1.6, cell * 1.6, pal.trapped, 4);
    }
  }

  let debounce = 0;
  input.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => restart(input.value), 180);
  });
  randomBtn?.addEventListener('click', () => {
    const pool = RANDOM_SEEDS.filter((s) => s !== seed);
    const next =
      Math.random() < 0.5
        ? (pool[Math.floor(Math.random() * pool.length)] ?? 'NEXA')
        : Math.random().toString(36).slice(2, 8).toUpperCase();
    input.value = next;
    restart(next);
  });

  void document.fonts.ready.then(() => {
    pal = palette();
    render();
  });

  restart(seed);
  if (reduced) return;
  new Loop(canvas, (dt) => {
    step(dt);
    render();
  }).start();
}
