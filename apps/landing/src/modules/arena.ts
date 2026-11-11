// FIG. 01 Arena (hero): ilustrasi alur trafik, BUKAN data langsung. Permintaan mengalir dari
// kiri dan menyempit ke gerbang NEXA. Di gerbang, kotak HUD menampilkan skor: pengunjung sah
// diteruskan ke aplikasi asli; agen (dan sesi yang dicurigai) dibelokkan ke labirin umpan,
// berkeliling sel demi sel sambil meninggalkan jejak loreng, lalu sesinya ditutup.
// Flat: garis 1px, kotak, teks mono, sel berwarna token. Tanpa bayangan, gradien, atau filter.
import { Rng } from '../../../sensor/src/labyrinth/prng';
import { LAB } from '../content/lab';
import { fitCanvas, hudBrackets, monoFont, offscreen, type Palette, palette } from '../lib/canvas';
import { buildMaze, type Maze, neighbors } from '../lib/maze';
import { clamp, formatNumber, Loop, reducedMotion } from '../lib/motion';

type Kind = 'human' | 'agent' | 'suspect';
type Phase = 'ingress' | 'inspect' | 'forward' | 'divert' | 'maze' | 'fade';

interface Verdict {
  label: string;
  score: string;
  signals: string;
}

interface Req {
  kind: Kind;
  verdict: Verdict;
  phase: Phase;
  x: number;
  y: number;
  y0: number;
  speed: number;
  t: number;
  path: Array<[number, number]>;
  cell: number;
  prev: number;
  target: number;
  steps: number;
  maxSteps: number;
  alpha: number;
  trail: Array<[number, number]>;
  trailT: number;
  dead: boolean;
}

interface Layout {
  w: number;
  h: number;
  gateX: number;
  gateY: number;
  app: { x: number; y: number; w: number; h: number };
  maze: { x: number; y: number; cell: number; cols: number; rows: number };
}

// Varian skor mengikuti bobot sensor (detect/score.ts): honeylink 0,7 · UA otomasi 0,35 ·
// header hilang 0,2 · ritme cepat 0,25, dibatasi 1. Agen ≥ 0,85; dicurigai ≥ 0,6.
const VERDICTS: Record<Kind, readonly Verdict[]> = {
  human: [
    { label: 'MANUSIA', score: '0,00', signals: 'header browser lengkap' },
    { label: 'MANUSIA', score: '0,25', signals: 'ritme cepat · tetap sah' },
  ],
  agent: [
    { label: 'AGEN AI', score: '0,90', signals: 'honeylink + header hilang' },
    { label: 'AGEN AI', score: '1,00', signals: 'honeylink + UA otomasi' },
  ],
  suspect: [{ label: 'DICURIGAI', score: '0,80', signals: 'UA otomasi + header + ritme' }],
};

const INSPECT_S = 0.5;
const MOVE_SPEED = 180;
const MAZE_SPEED = 84;
const MAX_IN_MAZE = 7;

export function initArena(fig: HTMLElement): void {
  const canvas = fig.querySelector<HTMLCanvasElement>('canvas');
  if (!canvas) return;
  const statEls = {
    forwarded: fig.querySelector('[data-stat="forwarded"]'),
    trapped: fig.querySelector('[data-stat="trapped"]'),
    pages: fig.querySelector('[data-stat="pages"]'),
    tokens: fig.querySelector('[data-stat="tokens"]'),
  };
  const reduced = reducedMotion();
  let rng = new Rng(reduced ? 'arena-statis' : `arena-${Date.now()}`);
  let pal: Palette = palette();
  let L: Layout | null = null;
  let maze: Maze = buildMaze('nexa-arena', 4, 3);
  let heat = new Float32Array(0);
  let staticLayer: HTMLCanvasElement | null = null;
  const reqs: Req[] = [];
  const counts = { forwarded: 0, trapped: 0, pages: 0, tokens: 0 };
  let spawnIn = 0.2;
  // Agen otomatis sering datang beruntun: sesekali tiga agen masuk berdekatan.
  let burstIn = 5;
  let burstQueue: number[] = [];
  let statT = 0;
  let pointer: { x: number; y: number } | null = null;

  const ctx = fitCanvas(canvas, (w, h) => {
    L = layout(w, h);
    maze = buildMaze('nexa-arena', L.maze.cols, L.maze.rows);
    heat = new Float32Array(L.maze.cols * L.maze.rows);
    reqs.length = 0;
    drawStatic();
    if (reduced) staticScene();
    else draw();
  });
  if (!ctx) return;

  // ---------- Tata letak ----------
  function layout(w: number, h: number): Layout {
    const pad = 16;
    const narrow = w < 640;
    const gateX = Math.round(w * (narrow ? 0.3 : 0.36));
    const gateY = Math.round(h * 0.36);
    const appX = Math.round(w * (narrow ? 0.62 : 0.7));
    const cell = narrow ? 14 : 18;
    const mx = gateX + 36;
    const my = Math.round(h * 0.52);
    const cols = Math.max(4, Math.floor((w - pad - mx) / cell));
    const rows = Math.max(3, Math.floor((h - pad - my) / cell));
    return {
      w,
      h,
      gateX,
      gateY,
      app: { x: appX, y: pad + 24, w: w - pad - appX, h: Math.round(h * 0.24) },
      maze: { x: mx, y: my, cell, cols, rows },
    };
  }

  const cellCenter = (c: number): [number, number] => {
    const m = (L as Layout).maze;
    return [
      m.x + (c % m.cols) * m.cell + m.cell / 2,
      m.y + Math.floor(c / m.cols) * m.cell + m.cell / 2,
    ];
  };

  // ---------- Lapisan statis: label, gerbang, jalur, aplikasi, dinding labirin ----------
  function drawStatic(): void {
    if (!L) return;
    const [layer, g] = offscreen(L.w, L.h);
    staticLayer = layer;
    const { gateX, gateY, app, maze: mz } = L;
    g.textBaseline = 'alphabetic';

    g.font = monoFont(10);
    g.fillStyle = pal.muted;
    g.fillText('INTERNET', 16, 22);

    // Jalur pandu (garis putus-putus redup).
    g.strokeStyle = pal.lineStrong;
    g.lineWidth = 1;
    g.setLineDash([2, 6]);
    g.beginPath();
    g.moveTo(gateX + 6, gateY + 0.5);
    g.lineTo(app.x, app.y + app.h / 2 + 0.5);
    const entryY = mz.y + mz.cell / 2;
    g.moveTo(gateX + 0.5, gateY + 6);
    g.lineTo(gateX + 0.5, entryY + 0.5);
    g.lineTo(mz.x, entryY + 0.5);
    g.stroke();
    g.setLineDash([]);

    // Gerbang NEXA.
    g.strokeStyle = pal.accent;
    g.beginPath();
    g.moveTo(gateX + 0.5, 34);
    g.lineTo(gateX + 0.5, L.h - 16);
    g.stroke();
    g.fillStyle = pal.bg;
    g.fillRect(gateX - 4, gateY - 4, 9, 9);
    g.strokeRect(gateX - 3.5, gateY - 3.5, 8, 8);
    g.font = monoFont(11, 500);
    g.fillStyle = pal.accent;
    g.fillText('NEXA', gateX + 8, 22);
    g.font = monoFont(10);
    g.fillStyle = pal.muted;
    if (L.w >= 640) g.fillText('reverse proxy · skor sinyal', gateX + 46, 22);

    // Aplikasi asli.
    g.strokeStyle = pal.lineStrong;
    g.strokeRect(app.x + 0.5, app.y + 0.5, app.w - 1, app.h - 1);
    g.font = monoFont(10, 500);
    g.fillStyle = pal.text2;
    g.fillText('APLIKASI ASLI', app.x + 10, app.y + 18);
    g.font = monoFont(10);
    g.fillStyle = pal.muted;
    if (app.h > 44) g.fillText('diteruskan utuh', app.x + 10, app.y + 32);

    // Labirin.
    g.font = monoFont(10, 500);
    g.fillStyle = pal.trapped;
    g.fillText('LABIRIN UMPAN', mz.x, mz.y - 10);
    g.font = monoFont(10);
    g.fillStyle = pal.muted;
    if (L.w >= 640) g.fillText('tanpa LLM · tanpa ujung', mz.x + 96, mz.y - 10);
    g.strokeStyle = pal.line;
    g.beginPath();
    for (let c = 0; c < maze.open.length; c++) {
      const x = mz.x + (c % mz.cols) * mz.cell;
      const y = mz.y + Math.floor(c / mz.cols) * mz.cell;
      const o = maze.open[c] ?? 0;
      if (!(o & 1)) {
        g.moveTo(x, y + 0.5);
        g.lineTo(x + mz.cell, y + 0.5);
      }
      if (!(o & 8) && c !== 0) {
        g.moveTo(x + 0.5, y);
        g.lineTo(x + 0.5, y + mz.cell);
      }
      if (c % mz.cols === mz.cols - 1) {
        g.moveTo(x + mz.cell - 0.5, y);
        g.lineTo(x + mz.cell - 0.5, y + mz.cell);
      }
      if (Math.floor(c / mz.cols) === mz.rows - 1) {
        g.moveTo(x, y + mz.cell - 0.5);
        g.lineTo(x + mz.cell, y + mz.cell - 0.5);
      }
    }
    g.stroke();
  }

  // ---------- Simulasi ----------
  function spawn(kind?: Kind, atY?: number): void {
    if (!L) return;
    const k: Kind = kind ?? (rng.chance(0.3) ? (rng.chance(0.25) ? 'suspect' : 'agent') : 'human');
    const y0 = atY ?? L.h * 0.18 + rng.float() * L.h * 0.64;
    reqs.push({
      kind: k,
      verdict: rng.pick(VERDICTS[k]),
      phase: 'ingress',
      x: -6,
      y: y0,
      y0,
      speed: k === 'human' ? 78 + rng.float() * 22 : 118 + rng.float() * 36,
      t: 0,
      path: [],
      cell: 0,
      prev: -1,
      target: 0,
      steps: 0,
      maxSteps: 34 + rng.int(0, 40),
      alpha: 1,
      trail: [],
      trailT: 0,
      dead: false,
    });
  }

  function nextCell(r: Req): number {
    const options = neighbors(maze, r.cell).filter((c) => c !== r.prev);
    return options.length > 0 ? rng.pick(options) : Math.max(0, r.prev);
  }

  function moveAlong(r: Req, dt: number): boolean {
    let budget = MOVE_SPEED * dt;
    while (budget > 0 && r.path.length > 0) {
      const [tx, ty] = r.path[0] as [number, number];
      const dx = tx - r.x;
      const dy = ty - r.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        r.x = tx;
        r.y = ty;
        budget -= d;
        r.path.shift();
      } else {
        r.x += (dx / d) * budget;
        r.y += (dy / d) * budget;
        budget = 0;
      }
    }
    return r.path.length === 0;
  }

  function update(dt: number): void {
    if (!L) return;
    const lay = L;
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawn();
      spawnIn = 0.45 + rng.float() * 0.6;
    }
    burstIn -= dt;
    if (burstIn <= 0) {
      burstIn = 9 + rng.float() * 6;
      burstQueue.push(0, 0.2, 0.4);
    }
    if (burstQueue.length > 0) {
      burstQueue = burstQueue.map((t) => t - dt);
      const due = burstQueue.filter((t) => t <= 0).length;
      burstQueue = burstQueue.filter((t) => t > 0);
      for (let i = 0; i < due; i++) spawn('agent');
    }
    for (const r of reqs) {
      r.t += dt;
      switch (r.phase) {
        case 'ingress': {
          r.x += r.speed * dt;
          const p = clamp(r.x / lay.gateX, 0, 1);
          r.y = r.y0 + (lay.gateY - r.y0) * (p * p * (3 - 2 * p));
          if (r.x >= lay.gateX - 4) {
            r.x = lay.gateX - 4;
            r.y = lay.gateY;
            r.phase = 'inspect';
            r.t = 0;
          }
          break;
        }
        case 'inspect': {
          if (r.t < INSPECT_S) break;
          r.t = 0;
          if (r.kind === 'human') {
            r.phase = 'forward';
            r.path = [[lay.app.x + 8, lay.app.y + lay.app.h / 2]];
          } else {
            r.phase = 'divert';
            const entryY = lay.maze.y + lay.maze.cell / 2;
            r.path = [
              [lay.gateX, entryY],
              [lay.maze.x + lay.maze.cell / 2, entryY],
            ];
            counts.trapped += 1;
          }
          break;
        }
        case 'forward': {
          if (moveAlong(r, dt)) {
            counts.forwarded += 1;
            r.dead = true;
          }
          break;
        }
        case 'divert': {
          if (moveAlong(r, dt)) {
            r.phase = 'maze';
            r.cell = 0;
            r.prev = -1;
            r.target = nextCell(r);
            enterCell(r, 0);
          }
          break;
        }
        case 'maze': {
          const [tx, ty] = cellCenter(r.target);
          const dx = tx - r.x;
          const dy = ty - r.y;
          const d = Math.hypot(dx, dy);
          const step = MAZE_SPEED * dt;
          if (d <= step) {
            r.x = tx;
            r.y = ty;
            r.prev = r.cell;
            r.cell = r.target;
            enterCell(r, r.cell);
            if (r.steps >= r.maxSteps) {
              r.phase = 'fade';
              r.t = 0;
            } else r.target = nextCell(r);
          } else {
            r.x += (dx / d) * step;
            r.y += (dy / d) * step;
          }
          break;
        }
        case 'fade': {
          r.alpha -= dt / 0.7;
          if (r.alpha <= 0) r.dead = true;
          break;
        }
      }
      r.trailT += dt;
      if (r.trailT > 0.06) {
        r.trailT = 0;
        r.trail.unshift([r.x, r.y]);
        if (r.trail.length > 5) r.trail.pop();
      }
    }
    // Batas agen di labirin: sesi tertua ditutup lebih dulu.
    const inMaze = reqs.filter((r) => r.phase === 'maze');
    if (inMaze.length > MAX_IN_MAZE) {
      const oldest = inMaze[0];
      if (oldest) {
        oldest.phase = 'fade';
        oldest.t = 0;
      }
    }
    for (let i = reqs.length - 1; i >= 0; i--) if (reqs[i]?.dead) reqs.splice(i, 1);
    for (let i = 0; i < heat.length; i++) {
      const v = heat[i] ?? 0;
      if (v > 0) heat[i] = Math.max(0, v - dt * 0.11);
    }
  }

  function enterCell(r: Req, cell: number): void {
    r.steps += 1;
    counts.pages += 1;
    counts.tokens += LAB.baitTokensPerPage;
    heat[cell] = 1;
  }

  // ---------- Gambar ----------
  function colorOf(r: Req): string {
    if (r.phase === 'ingress') return pal.text2;
    if (r.kind === 'agent') return pal.trapped;
    if (r.kind === 'suspect') return pal.suspect;
    return pal.text2;
  }

  function label(r: Req, hovered: boolean): void {
    if (!L || !ctx) return;
    const color = r.phase === 'ingress' ? pal.muted : colorOf(r);
    hudBrackets(ctx, r.x - 10, r.y - 10, 20, 20, color);
    const title =
      r.phase === 'ingress' ? 'BELUM DIPERIKSA' : `${r.verdict.label} · ${r.verdict.score}`;
    const sub =
      r.phase === 'ingress'
        ? 'semua tampak sama'
        : r.kind === 'human'
          ? `${r.verdict.signals} → diteruskan`
          : `${r.verdict.signals} → labirin`;
    ctx.font = monoFont(10, 500);
    const titleW = ctx.measureText(title).width;
    ctx.font = monoFont(10);
    const w = Math.max(titleW, ctx.measureText(sub).width);
    let tx = r.x + 16;
    if (tx + w > L.w - 8) tx = r.x - 16 - w;
    const ty = clamp(r.y - 14, 14, L.h - 22);
    ctx.font = monoFont(10, 500);
    ctx.fillStyle = color;
    ctx.fillText(title, tx, ty);
    if (hovered || r.phase !== 'ingress') {
      ctx.font = monoFont(10);
      ctx.fillStyle = pal.muted;
      ctx.fillText(sub, tx, ty + 13);
    }
  }

  function draw(): void {
    if (!L || !ctx) return;
    const { w, h, maze: mz } = L;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);

    // Jejak loreng di sel yang dikunjungi agen (nada token, memudar perlahan).
    const tones = [pal.camo[2], pal.camo[3], pal.camo[4], pal.lineStrong] as string[];
    for (let c = 0; c < heat.length; c++) {
      const v = heat[c] ?? 0;
      if (v <= 0.02) continue;
      const cx = c % mz.cols;
      const cy = Math.floor(c / mz.cols);
      ctx.globalAlpha = Math.min(1, v * 1.2);
      ctx.fillStyle = tones[(cx * 7 + cy * 3) % tones.length] as string;
      ctx.fillRect(mz.x + cx * mz.cell + 1, mz.y + cy * mz.cell + 1, mz.cell - 1, mz.cell - 1);
    }
    ctx.globalAlpha = 1;
    if (staticLayer) ctx.drawImage(staticLayer, 0, 0, w, h);

    let hovered: Req | null = null;
    if (pointer) {
      let best = 24;
      for (const r of reqs) {
        const d = Math.hypot(r.x - pointer.x, r.y - pointer.y);
        if (d < best) {
          best = d;
          hovered = r;
        }
      }
    }

    for (const r of reqs) {
      const color = colorOf(r);
      ctx.fillStyle = color;
      for (let i = 0; i < r.trail.length; i++) {
        const p = r.trail[i] as [number, number];
        ctx.globalAlpha = r.alpha * (0.32 - i * 0.06);
        ctx.fillRect(Math.round(p[0] - 2), Math.round(p[1] - 2), 4, 4);
      }
      ctx.globalAlpha = r.alpha;
      ctx.fillRect(Math.round(r.x - 3), Math.round(r.y - 3), 6, 6);
    }
    ctx.globalAlpha = 1;
    // Satu label pemeriksaan sekaligus (yang paling lama diperiksa) agar teks tidak bertumpuk.
    let inspecting: Req | null = null;
    for (const r of reqs) {
      if (r.phase === 'inspect' && (inspecting === null || r.t > inspecting.t)) inspecting = r;
    }
    if (inspecting && inspecting !== hovered) label(inspecting, false);
    if (hovered) label(hovered, true);
  }

  function renderStats(): void {
    const set = (el: Element | null, v: number) => {
      if (el) el.textContent = formatNumber(v);
    };
    set(statEls.forwarded, counts.forwarded);
    set(statEls.trapped, counts.trapped);
    set(statEls.pages, counts.pages);
    set(statEls.tokens, counts.tokens);
  }

  // ---------- Mode reduced-motion: satu frame statis hasil simulasi deterministik ----------
  function simulate(seconds: number): void {
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) update(dt);
  }

  function staticScene(): void {
    rng = new Rng('arena-statis');
    counts.forwarded = 0;
    counts.trapped = 0;
    counts.pages = 0;
    counts.tokens = 0;
    simulate(16);
    // Satu permintaan sedang diperiksa agar kotak HUD terlihat di frame statis.
    spawn('agent');
    const last = reqs[reqs.length - 1];
    if (last && L) {
      last.phase = 'inspect';
      last.x = L.gateX - 4;
      last.y = L.gateY;
      last.trail = [];
    }
    draw();
    renderStats();
  }

  // ---------- Interaksi ----------
  const localPoint = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointermove', (e) => {
    pointer = localPoint(e);
    if (reduced) draw();
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
    if (reduced) draw();
  });
  const release = (kind: Kind, atY?: number) => {
    spawn(kind, atY);
    if (reduced) {
      simulate(3);
      draw();
      renderStats();
    }
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!L) return;
    const p = localPoint(e);
    if (p.x < L.gateX - 10) release('agent', clamp(p.y, L.h * 0.12, L.h * 0.88));
  });
  for (const btn of fig.querySelectorAll<HTMLButtonElement>('[data-arena]')) {
    btn.addEventListener('click', () => release(btn.dataset.arena === 'human' ? 'human' : 'agent'));
  }

  // Font kanvas siap → gambar ulang label.
  void document.fonts.ready.then(() => {
    pal = palette();
    drawStatic();
    if (reduced) staticScene();
  });

  if (reduced) return;
  new Loop(canvas, (dt) => {
    update(dt);
    draw();
    statT += dt;
    if (statT > 0.15) {
      statT = 0;
      renderStats();
    }
  }).start();
}
