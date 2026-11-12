// Robot maskot NEXA ("agen uji"): SVG flat dari persegi bulat dan garis. Warnanya dari token
// lewat kelas CSS (bukan warna mentah), tanpa bayangan atau gradien. Titik (0,0) = tengah telapak
// kaki, satuan = px pada skala 1. Rig: kaki dan badan atas (lengan, torso, kepala, antena, mata),
// masing-masing diputar di sendinya; pose dihitung modul pemakai lalu diterapkan applyPose.
const NS = 'http://www.w3.org/2000/svg';

export type Face = 'normal' | 'happy' | 'sleep' | 'wide' | 'dizzy';

export interface Limb {
  /** Derajat, berputar di pangkal (pinggul). */
  rot: number;
  /** px ke atas. */
  lift: number;
  /** Skala panjang (1 = penuh); dipakai untuk kaki berayun saat duduk. */
  scale: number;
}

export interface BotPose {
  face: Face;
  dir: 1 | -1;
  /** Squash/stretch di sekitar kaki. */
  sx: number;
  sy: number;
  /** Derajat, putaran seluruh badan di sekitar pusat badan. */
  rot: number;
  /** 0 = berdiri, 1 = duduk di tepi (kaki menggantung). */
  sit: number;
  /** px, naik-turun badan atas (negatif = naik). */
  bob: number;
  legL: Limb;
  legR: Limb;
  /** Derajat ke arah luar badan (0 = lengan menggantung). */
  armL: number;
  armR: number;
  headTilt: number;
  antenna: number;
  lookX: number;
  lookY: number;
  /** 1 = mata terbuka, 0 = tertutup. */
  blink: number;
  alert: boolean;
}

/** Kotak gambar (viewBox) relatif terhadap titik kaki. */
export const VIEW = { x: -60, y: -112, w: 120, h: 144 } as const;
/** Seberapa jauh badan turun saat duduk: pantat tepat di tepi pijakan. */
export const SIT_DROP = 13;
/** Tinggi ujung antena dari kaki. */
export const HEAD_TOP = 89;

export function restPose(): BotPose {
  return {
    face: 'normal',
    dir: 1,
    sx: 1,
    sy: 1,
    rot: 0,
    sit: 0,
    bob: 0,
    legL: { rot: 0, lift: 0, scale: 1 },
    legR: { rot: 0, lift: 0, scale: 1 },
    armL: 4,
    armR: 4,
    headTilt: 0,
    antenna: 0,
    lookX: 0,
    lookY: 0,
    blink: 1,
    alert: false,
  };
}

export interface BotRig {
  svg: SVGSVGElement;
  root: SVGGElement;
  legs: SVGGElement;
  upper: SVGGElement;
  legL: SVGGElement;
  legR: SVGGElement;
  armL: SVGGElement;
  armR: SVGGElement;
  head: SVGGElement;
  antenna: SVGGElement;
  eyes: SVGGElement;
  lids: SVGGElement;
  hit: SVGRectElement;
}

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
}

function leg(x: number, parent: SVGGElement): SVGGElement {
  const g = node('g', {}, parent);
  node('rect', { class: 'bot__limb', x: x - 3, y: -15, width: 6, height: 12, rx: 3 }, g);
  node('rect', { class: 'bot__foot', x: x - 4.5, y: -4.5, width: 9, height: 4.5, rx: 2.2 }, g);
  return g;
}

function arm(x: number, parent: SVGGElement): SVGGElement {
  const g = node('g', {}, parent);
  node('rect', { class: 'bot__limb', x: x - 2.5, y: -35, width: 5, height: 14, rx: 2.5 }, g);
  node('circle', { class: 'bot__hand', cx: x, cy: -20, r: 3.2 }, g);
  return g;
}

export function buildBot(extraClass = ''): BotRig {
  const svg = node('svg', {
    class: `bot ${extraClass}`.trim(),
    viewBox: `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`,
    'aria-hidden': 'true',
    focusable: 'false',
    'data-face': 'normal',
  });
  const root = node('g', {}, svg);
  const legs = node('g', {}, root);
  const legL = leg(-7, legs);
  const legR = leg(7, legs);
  const upper = node('g', {}, root);
  const armL = arm(-14.5, upper);
  const armR = arm(14.5, upper);
  node('rect', { class: 'bot__torso', x: -13, y: -38, width: 26, height: 26, rx: 7 }, upper);
  node('rect', { class: 'bot__panel', x: -7, y: -31, width: 14, height: 9, rx: 2 }, upper);
  node('rect', { class: 'bot__led', x: -4.5, y: -28.5, width: 3, height: 3, rx: 0.8 }, upper);
  node(
    'rect',
    { class: 'bot__led bot__led--b', x: 1.5, y: -28.5, width: 3, height: 3, rx: 0.8 },
    upper,
  );
  node('rect', { class: 'bot__neck', x: -3.5, y: -43, width: 7, height: 6 }, upper);
  const head = node('g', {}, upper);
  const antenna = node('g', {}, head);
  node('line', { class: 'bot__stalk', x1: 0, y1: -72, x2: 0, y2: -82 }, antenna);
  node('circle', { class: 'bot__bulb', cx: 0, cy: -85, r: 3.8 }, antenna);
  node('rect', { class: 'bot__ear', x: -24.5, y: -63, width: 4.5, height: 12, rx: 2 }, head);
  node('rect', { class: 'bot__ear', x: 20, y: -63, width: 4.5, height: 12, rx: 2 }, head);
  node('rect', { class: 'bot__skull', x: -21, y: -73, width: 42, height: 32, rx: 9 }, head);
  node('rect', { class: 'bot__screen', x: -16, y: -68, width: 32, height: 22, rx: 5 }, head);
  const eyes = node('g', {}, head);
  const lids = node('g', { class: 'bot__eyes-open' }, eyes);
  node('rect', { class: 'bot__eye', x: -9, y: -62, width: 5, height: 9, rx: 2.5 }, lids);
  node('rect', { class: 'bot__eye', x: 4, y: -62, width: 5, height: 9, rx: 2.5 }, lids);
  node(
    'path',
    { class: 'bot__ink bot__eyes-happy', d: 'M-10-55.5q3.5-5 7 0M3-55.5q3.5-5 7 0' },
    eyes,
  );
  node('path', { class: 'bot__ink bot__eyes-sleep', d: 'M-10-57h7M3-57h7' }, eyes);
  const wide = node('g', { class: 'bot__eyes-wide' }, eyes);
  node('circle', { class: 'bot__ink', cx: -6.5, cy: -57.5, r: 3.6 }, wide);
  node('circle', { class: 'bot__ink', cx: 6.5, cy: -57.5, r: 3.6 }, wide);
  node('circle', { class: 'bot__pupil', cx: -6.5, cy: -57.5, r: 1.4 }, wide);
  node('circle', { class: 'bot__pupil', cx: 6.5, cy: -57.5, r: 1.4 }, wide);
  node(
    'path',
    { class: 'bot__ink bot__eyes-dizzy', d: 'M-9.5-60l5 5m0-5l-5 5M4.5-60l5 5m0-5l-5 5' },
    eyes,
  );
  node('path', { class: 'bot__ink bot__mouth bot__mouth--flat', d: 'M-3-50.5h6' }, head);
  node('path', { class: 'bot__ink bot__mouth bot__mouth--smile', d: 'M-4-51.5q4 3.6 8 0' }, head);
  node('circle', { class: 'bot__ink bot__mouth bot__mouth--o', cx: 0, cy: -50.5, r: 1.9 }, head);
  const hit = node(
    'rect',
    { class: 'bot__hit', x: -26, y: -90, width: 52, height: 90, rx: 8 },
    svg,
  );
  return { svg, root, legs, upper, legL, legR, armL, armR, head, antenna, eyes, lids, hit };
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

function set(el: Element, transform: string): void {
  if (el.getAttribute('transform') !== transform) el.setAttribute('transform', transform);
}

function limb(g: SVGGElement, hx: number, hy: number, l: Limb): void {
  set(
    g,
    `translate(0 ${r2(-l.lift)}) rotate(${r2(l.rot)} ${hx} ${hy}) translate(${hx} ${hy}) scale(1 ${r2(l.scale)}) translate(${-hx} ${-hy})`,
  );
}

export function applyPose(rig: BotRig, p: BotPose): void {
  const ds = rig.svg.dataset;
  if (ds.face !== p.face) ds.face = p.face;
  const bulb = p.alert ? 'alert' : 'idle';
  if (ds.bulb !== bulb) ds.bulb = bulb;
  const drop = SIT_DROP * p.sit;
  set(rig.root, `rotate(${r2(p.rot)} 0 -45) scale(${r2(p.dir * p.sx)} ${r2(p.sy)})`);
  set(rig.legs, `translate(0 ${r2(drop)})`);
  set(rig.upper, `translate(0 ${r2(drop + p.bob)})`);
  limb(rig.legL, -7, -15, p.legL);
  limb(rig.legR, 7, -15, p.legR);
  set(rig.armL, `rotate(${r2(p.armL)} -14.5 -35)`);
  set(rig.armR, `rotate(${r2(-p.armR)} 14.5 -35)`);
  set(rig.head, `rotate(${r2(p.headTilt)} 0 -42)`);
  set(rig.antenna, `rotate(${r2(p.antenna)} 0 -72)`);
  set(rig.eyes, `translate(${r2(p.lookX)} ${r2(p.lookY)})`);
  const b = Math.min(1, Math.max(0.08, p.blink));
  set(rig.lids, `translate(0 ${r2(-57.5 * (1 - b))}) scale(1 ${r2(b)})`);
}
