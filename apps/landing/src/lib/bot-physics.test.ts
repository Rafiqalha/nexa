import { describe, expect, it } from 'vitest';
import {
  approach,
  flightTime,
  GRAVITY,
  landingOn,
  type Platform,
  settle,
  sitSpot,
  solveJump,
} from './bot-physics';

function simulate(x0: number, y0: number, vx: number, vy: number, t: number, dt = 1 / 240) {
  let x = x0;
  let y = y0;
  let v = vy;
  let minY = y0;
  for (let s = 0; s < t - 1e-9; s += dt) {
    const step = Math.min(dt, t - s);
    // Integrasi tepat untuk gravitasi konstan per langkah.
    y += v * step + 0.5 * GRAVITY * step * step;
    v += GRAVITY * step;
    x += vx * step;
    minY = Math.min(minY, y);
  }
  return { x, y, minY };
}

describe('robot: lompatan', () => {
  it.each([
    [0, 0, 220, -150],
    [400, -150, 60, 0],
    [60, -150, 300, 0],
    [0, 0, -180, 0],
  ])('dari (%d,%d) mendarat tepat di (%d,%d)', (x0, y0, x1, y1) => {
    const t = flightTime(x1 - x0, y1 - y0);
    const { vx, vy } = solveJump(x0, y0, x1, y1, t);
    const end = simulate(x0, y0, vx, vy, t);
    expect(end.x).toBeCloseTo(x1, 3);
    expect(end.y).toBeCloseTo(y1, 3);
    // Puncak lompatan lebih tinggi dari kedua ujung: robot tidak menembus tepi tombol.
    expect(end.minY).toBeLessThan(Math.min(y0, y1) - 20);
  });

  it('lama terbang dibatasi wajar', () => {
    expect(flightTime(0, 0)).toBeCloseTo(0.42);
    expect(flightTime(5000, 0)).toBe(0.9);
  });
});

describe('robot: pijakan', () => {
  const floor: Platform = { id: 'lantai', x1: 0, x2: 1000, y: 600, floor: true };
  const btn: Platform = { id: 'tombol', x1: 700, x2: 860, y: 460, floor: false };
  const all = [floor, btn];

  it('mendarat di tombol saat jatuh melewatinya', () => {
    expect(landingOn(all, 760, 450, 470)?.id).toBe('tombol');
  });

  it('di luar lebar tombol jatuh terus ke lantai', () => {
    expect(landingOn(all, 600, 450, 470)).toBeNull();
    expect(landingOn(all, 600, 590, 610)?.id).toBe('lantai');
  });

  it('bergerak naik tidak pernah mendarat', () => {
    expect(landingOn(all, 760, 470, 450)).toBeNull();
  });

  it('dua pijakan terlewati sekaligus: yang tertinggi menang', () => {
    expect(landingOn(all, 760, 400, 700)?.id).toBe('tombol');
  });

  it('posisi duduk di dekat ujung tombol, bukan di tengah label', () => {
    for (const r of [0, 0.2, 0.49, 0.5, 0.8, 0.99]) {
      const u = (sitSpot(btn, r) - btn.x1) / (btn.x2 - btn.x1);
      expect(u < 0.35 || u > 0.77).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0.1);
      expect(u).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('robot: pemulihan tanpa overshoot', () => {
  it('pegas teredam kritis mendekati nol tanpa melewatinya', () => {
    let x = -0.24;
    let v = 0;
    let prev = Math.abs(x);
    for (let i = 0; i < 240; i++) {
      [x, v] = settle(x, v, 18, 1 / 60);
      expect(x).toBeLessThanOrEqual(0);
      expect(Math.abs(x)).toBeLessThanOrEqual(prev + 1e-12);
      prev = Math.abs(x);
    }
    expect(Math.abs(x)).toBeLessThan(1e-4);
  });

  it('peluruhan eksponensial tidak melewati target', () => {
    let v = 0;
    for (let i = 0; i < 120; i++) {
      v = approach(v, 10, 8, 1 / 60);
      expect(v).toBeLessThanOrEqual(10);
    }
    expect(v).toBeCloseTo(10, 3);
  });
});
