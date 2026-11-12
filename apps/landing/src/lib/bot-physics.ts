// Fisika maskot robot (murni, diuji di bot-physics.test.ts). Sumbu y ke bawah, satuan px dan
// detik. Lompatan berupa parabola gravitasi yang mendarat tepat di target; pemulihan squash dan
// antena memakai pegas teredam kritis atau peluruhan eksponensial, jadi tidak ada overshoot
// (DESIGN.md §8.6).

/** Pijakan: tepi atas elemen DOM (tombol) atau garis lantai, dalam koordinat lokal hero. */
export interface Platform {
  id: string;
  x1: number;
  x2: number;
  y: number;
  floor: boolean;
}

export const GRAVITY = 2600;

export const clampTo = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** Kecepatan awal agar kaki dari (x0, y0) tiba di (x1, y1) tepat setelah t detik. */
export function solveJump(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: number,
  g = GRAVITY,
): { vx: number; vy: number } {
  return { vx: (x1 - x0) / t, vy: (y1 - y0 - 0.5 * g * t * t) / t };
}

/** Lama terbang yang wajar: lompatan jauh atau tinggi sedikit lebih lama. */
export function flightTime(dx: number, dy: number): number {
  return clampTo(0.42 + Math.hypot(dx, dy) / 1100, 0.42, 0.9);
}

/**
 * Pijakan yang dilewati dari atas saat kaki bergerak dari prevY ke y pada posisi x. Bila
 * beberapa terlewati dalam satu langkah, yang tertinggi (y terkecil) tersentuh lebih dulu.
 */
export function landingOn<P extends Platform>(
  platforms: readonly P[],
  x: number,
  prevY: number,
  y: number,
): P | null {
  if (y < prevY) return null;
  let best: P | null = null;
  for (const p of platforms) {
    if (x < p.x1 || x > p.x2) continue;
    if (prevY <= p.y + 0.5 && y >= p.y && (best === null || p.y < best.y)) best = p;
  }
  return best;
}

/**
 * Satu langkah pegas teredam kritis menuju 0 (solusi analitik, stabil untuk dt berapa pun).
 * Dari kecepatan awal nol, nilainya mendekati 0 tanpa pernah melewatinya.
 */
export function settle(x: number, v: number, omega: number, dt: number): [number, number] {
  const e = Math.exp(-omega * dt);
  const b = v + omega * x;
  return [(x + b * dt) * e, (v - omega * b * dt) * e];
}

/** Peluruhan eksponensial menuju target (tanpa overshoot). rate dalam 1/detik. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Posisi duduk yang enak di tombol: dekat ujung, tidak menutupi label di tengah. */
export function sitSpot(p: Platform, rand: number): number {
  const w = p.x2 - p.x1;
  const u = rand < 0.5 ? 0.1 + rand * 0.24 : 0.78 + (rand - 0.5) * 0.24;
  return p.x1 + w * u;
}
