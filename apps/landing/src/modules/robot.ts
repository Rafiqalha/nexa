// FIG. 00 · Robot di hero: maskot "agen uji" yang bermain di atas halaman. Elemen DOM menjadi
// pijakan (pola hedgehog-mode PostHog dan Shimeji): garis atas arena sebagai lantai, tombol CTA
// untuk diduduki. Ia berjalan, melompat, duduk mengayunkan kaki, memantul di tombol, menari,
// melambai saat kursor mendekat, melirik judul saat kata berganti, tertidur saat halaman
// didiamkan, dan bisa diangkat lalu dilempar. Dekoratif (aria-hidden); tombol "Robot" di hero
// mengistirahatkannya (WCAG 2.2.2). Loop berhenti saat hero tak terlihat; reduced-motion: pose
// duduk statis tanpa loop. Robot kedua tidur di atas wordmark footer.
import { LAB } from '../content/lab';
import {
  approach,
  clampTo,
  flightTime,
  GRAVITY,
  landingOn,
  type Platform,
  settle,
  sitSpot,
  solveJump,
} from '../lib/bot-physics';
import {
  applyPose,
  type BotPose,
  buildBot,
  type Face,
  HEAD_TOP,
  restPose,
  SIT_DROP,
  VIEW,
} from '../lib/bot-svg';
import { Loop, reducedMotion } from '../lib/motion';
import { wordmarkLedge } from './wordmark';

interface Ledge extends Platform {
  el: HTMLElement | null;
}

type Mode = 'idle' | 'walk' | 'sit' | 'crouch' | 'air' | 'held' | 'wave' | 'dance' | 'sleep';
type After = 'sit' | 'idle' | 'wave' | 'bounce';

interface Plan {
  target: Ledge;
  x: number;
  after: After;
  flip: boolean;
}

interface Grab {
  id: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  px: number;
  py: number;
  moved: boolean;
}

const LINES = {
  greet: ['Halo! Aku agen uji. Cuma main di sini.'],
  chatter: [
    'Tugasku: tersesat dengan gembira.',
    'Ada /arsip-internal/ di sini? Penasaran…',
    `Satu halaman umpan lagi. ±${LAB.baitTokensPerPage} token.`,
    'Kredensial! …eh, ternyata canary.',
    'Labirinnya tidak ada ujungnya. Seru.',
    'Tombol ini enak buat duduk.',
    'Pengunjung sah tidak terganggu olehku.',
  ],
  poke: ['Hup!', 'Hehe.', 'Sekali lagi?'],
  grab: ['Wah, aku terbang!', 'Pelan-pelan…'],
  hard: ['Aduh. Mendarat darurat.'],
  wake: ['Eh, aku tidak tidur kok.'],
  hello: ['Halo!', 'Hai, manusia.'],
  agent: ['Temanku masuk labirin. Semoga betah.'],
  human: ['Itu pengunjung sah. Silakan lewat.'],
  bye: ['Terima kasih sudah mampir.', 'Sampai jumpa di labirin.'],
} as const;

const STORAGE_KEY = 'nexa-robot';

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;

/** Posisi tata letak (tanpa transform animasi masuk) relatif terhadap ancestor. */
function offsetIn(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== ancestor) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent instanceof HTMLElement ? n.offsetParent : null;
  }
  return { x, y };
}

function makeZs(): HTMLSpanElement {
  const zs = document.createElement('span');
  zs.className = 'bot-z';
  for (let i = 0; i < 3; i++) {
    const z = document.createElement('i');
    z.textContent = 'z';
    zs.append(z);
  }
  return zs;
}

export function initRobot(hero: HTMLElement): void {
  const layer = hero.querySelector<HTMLElement>('[data-bot]');
  const floorEl = hero.querySelector<HTMLElement>('.arena');
  const buttons = [...hero.querySelectorAll<HTMLElement>('.cta .btn')];
  const blockers = [
    ...hero.querySelectorAll<HTMLElement>('.cta > *'),
    ...hero.querySelectorAll<HTMLElement>('.hero__grid > .lead'),
  ];
  const toggle = hero.querySelector<HTMLButtonElement>('[data-bot-toggle]');
  const toggleLabel = toggle?.querySelector('[data-bot-label]');
  if (!layer || !floorEl || buttons.length === 0) return;

  const reduced = reducedMotion();
  hero.classList.add('has-bot');
  const rig = buildBot();
  rig.svg.classList.add('is-hidden');
  const bubble = document.createElement('p');
  bubble.className = 'bot-bubble';
  const zs = makeZs();
  layer.append(rig.svg, bubble, zs);

  let ledges: Ledge[] = [];
  let scale = 0.8;
  let width = 0;
  let now = 0;
  let bubbleUntil = 0;
  let bubbleW = 0;
  let bubbleH = 0;
  let paused = false;
  let frozen = false;
  let greeted = false;
  let grab: Grab | null = null;
  let pointer: { x: number; y: number } | null = null;
  let pointerLocal: { x: number; y: number } | null = null;
  let lastActive = performance.now();

  const bot = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    dir: 1 as 1 | -1,
    ground: null as Ledge | null,
    u: 0.5,
    mode: 'idle' as Mode,
    t: 0,
    dur: 0,
    walkTo: 0,
    plan: null as Plan | null,
    thrown: false,
    flip: false,
    spin: 0,
    airT: 0.6,
    sit: 0,
    squash: 0,
    squashV: 0,
    rot: 0,
    tilt: 0,
    antenna: 0,
    blink: 1,
    blinkIn: 2,
    phase: 0,
    bounces: 0,
    faceOverride: null as Face | null,
    faceUntil: 0,
    lookX: 0,
    lookY: 0,
    lookAt: null as { x: number; y: number } | null,
    lookUntil: 0,
    wanderX: 0,
    wanderIn: 2,
    waveCooldown: 5,
    waveSide: 1 as 1 | -1,
    chatterIn: 16,
    heldVx: 0,
    heldVy: 0,
  };
  const pose: BotPose = restPose();

  const floor = (): Ledge => ledges[0] as Ledge;
  const buttonLedges = (): Ledge[] => ledges.filter((l) => !l.floor);
  const calm = (): boolean =>
    bot.ground !== null && (bot.mode === 'idle' || bot.mode === 'walk' || bot.mode === 'sit');
  const walkSpeed = (): number => 120 * scale;

  function measure(): void {
    width = hero.clientWidth;
    scale = width < 640 ? 0.66 : width < 1024 ? 0.8 : 0.95;
    rig.svg.setAttribute('width', (VIEW.w * scale).toFixed(1));
    rig.svg.setAttribute('height', (VIEW.h * scale).toFixed(1));
    const fo = offsetIn(floorEl as HTMLElement, hero);
    const pad = 28 * scale;
    const next: Ledge[] = [
      {
        id: 'lantai',
        x1: fo.x + pad,
        x2: fo.x + (floorEl as HTMLElement).offsetWidth - pad,
        y: fo.y,
        floor: true,
        el: null,
      },
    ];
    // Tombol hanya jadi pijakan bila ruang di atasnya cukup untuk robot berdiri: di layar sempit
    // tombol kedua ada tepat di bawah tombol pertama, dan robot tidak boleh menutupi tombol lain.
    const boxes = blockers.map((el) => {
      const o = offsetIn(el, hero);
      return { el, x1: o.x, x2: o.x + el.offsetWidth, y1: o.y, y2: o.y + el.offsetHeight };
    });
    const clearance = HEAD_TOP * scale + 6;
    buttons.forEach((b, i) => {
      if (b.offsetWidth === 0) return;
      const o = offsetIn(b, hero);
      const x2 = o.x + b.offsetWidth;
      const blocked = boxes.some(
        (k) => k.el !== b && k.x1 < x2 && k.x2 > o.x && k.y2 > o.y - clearance && k.y1 < o.y,
      );
      if (blocked) return;
      next.push({
        id: `tombol-${i}`,
        x1: o.x + 8,
        x2: o.x + b.offsetWidth - 8,
        y: o.y,
        floor: false,
        el: b,
      });
    });
    ledges = next;
    if (bot.ground) {
      const id = bot.ground.id;
      const g = ledges.find((l) => l.id === id) ?? floor();
      bot.ground = g;
      bot.x = g.x1 + (g.x2 - g.x1) * clampTo(bot.u, 0, 1);
      bot.y = g.y;
      if (bot.mode === 'walk') bot.walkTo = clampTo(bot.walkTo, g.x1, g.x2);
    }
  }

  function setMode(mode: Mode, dur = 0): void {
    bot.mode = mode;
    bot.t = 0;
    bot.dur = dur;
  }

  function setFace(face: Face, seconds: number): void {
    bot.faceOverride = face;
    bot.faceUntil = now + seconds;
  }

  function say(text: string, seconds = 3.2): void {
    if (paused) return;
    bubble.textContent = text;
    bubble.classList.add('is-on');
    bubbleW = bubble.offsetWidth;
    bubbleH = bubble.offsetHeight;
    bubbleUntil = now + seconds;
    placeBubble();
  }

  function settleOn(g: Ledge, x: number): void {
    bot.ground = g;
    bot.x = clampTo(x, g.x1, g.x2);
    bot.y = g.y;
    bot.u = (bot.x - g.x1) / Math.max(1, g.x2 - g.x1);
  }

  // ---------- Keputusan: apa yang dimainkan berikutnya ----------
  function decide(): void {
    const g = bot.ground;
    if (!g) return;
    const r = Math.random();
    const btns = buttonLedges();
    if (g.floor) {
      if (r < 0.36 || btns.length === 0) {
        const span = 140 + Math.random() * 260;
        bot.walkTo = clampTo(bot.x + (Math.random() < 0.5 ? -span : span), g.x1, g.x2);
        setMode('walk');
      } else if (r < 0.68) {
        const b = pick(btns);
        jumpTo(b, sitSpot(b, Math.random()), 'sit');
      } else if (r < 0.8) {
        setMode('dance', 2.4 + Math.random() * 1.2);
      } else {
        setMode('idle', 1.2 + Math.random() * 1.8);
      }
      return;
    }
    const others = btns.filter((b) => b !== g);
    if (r < 0.34) {
      setMode('sit', 4 + Math.random() * 4);
    } else if (r < 0.5) {
      bot.bounces = 2;
      jumpTo(g, bot.x, 'bounce');
    } else if (r < 0.64 && others.length > 0) {
      const b = pick(others);
      jumpTo(b, sitSpot(b, Math.random()), Math.random() < 0.6 ? 'sit' : 'idle');
    } else if (r < 0.86) {
      const f = floor();
      jumpTo(f, bot.x + (Math.random() - 0.5) * 420, 'idle', Math.random() < 0.25);
    } else {
      bot.walkTo = g.x1 + (g.x2 - g.x1) * Math.random();
      setMode('walk');
    }
  }

  function jumpTo(target: Ledge, x: number, after: After, flip = false): void {
    bot.plan = { target, x: clampTo(x, target.x1, target.x2), after, flip };
    bot.squash = -0.14;
    bot.squashV = 0;
    setMode('crouch');
  }

  function launch(): void {
    const p = bot.plan;
    if (!p) {
      setMode('idle', 0.5);
      return;
    }
    const t = flightTime(p.x - bot.x, p.target.y - bot.y);
    const v = solveJump(bot.x, bot.y, p.x, p.target.y, t);
    bot.vx = v.vx;
    bot.vy = v.vy;
    if (Math.abs(v.vx) > 5) bot.dir = v.vx > 0 ? 1 : -1;
    bot.ground = null;
    bot.flip = p.flip;
    bot.spin = 0;
    bot.airT = t;
    bot.squash = 0.12;
    bot.squashV = 0;
    setMode('air');
  }

  function land(p: Ledge): void {
    const impact = bot.vy;
    const plan = bot.plan;
    const thrown = bot.thrown;
    settleOn(p, bot.x);
    bot.vx = 0;
    bot.vy = 0;
    bot.flip = false;
    bot.spin = 0;
    bot.rot = 0;
    bot.thrown = false;
    bot.plan = null;
    bot.squash = -clampTo(impact / 4400, 0.06, 0.3);
    bot.squashV = 0;
    dust();
    if (p.el) press(p.el);
    if (thrown) {
      if (impact > 1450) {
        setFace('dizzy', 1.4);
        say(pick(LINES.hard), 2.2);
        setMode('idle', 1.6);
      } else {
        setMode('idle', 0.8);
      }
      return;
    }
    switch (plan?.after) {
      case 'sit':
        setMode('sit', 4 + Math.random() * 4);
        break;
      case 'wave':
        wave();
        if (!greeted) {
          greeted = true;
          say(pick(LINES.greet), 3.6);
        }
        break;
      case 'bounce':
        if (bot.bounces > 0) {
          bot.bounces -= 1;
          jumpTo(p, bot.x, 'bounce');
        } else {
          setMode('idle', 0.8);
        }
        break;
      default:
        setMode('idle', 0.7 + Math.random());
    }
  }

  function wave(side: 1 | -1 = 1): void {
    bot.waveSide = side;
    setMode('wave', 1.7);
  }

  function sleep(): void {
    if (!bot.ground) return;
    bot.plan = null;
    bot.bounces = 0;
    setMode('sleep');
    if (!paused) zs.classList.add('is-on');
  }

  function wake(): void {
    zs.classList.remove('is-on');
    setFace('wide', 0.5);
    setMode('sit', 1.4);
    if (Math.random() < 0.6) say(pick(LINES.wake), 2.4);
  }

  function poke(): void {
    if (bot.mode === 'sleep') {
      wake();
      return;
    }
    const g = bot.ground;
    if (!g || bot.mode === 'crouch') return;
    say(pick(LINES.poke), 1.6);
    jumpTo(g, bot.x + (Math.random() - 0.5) * 40, 'idle', true);
  }

  function startHeld(): void {
    bot.ground = null;
    bot.plan = null;
    bot.flip = false;
    bot.spin = 0;
    bot.thrown = false;
    bot.heldVx = 0;
    bot.heldVy = 0;
    zs.classList.remove('is-on');
    setMode('held');
    document.documentElement.classList.add('is-grabbing');
    say(pick(LINES.grab), 2);
  }

  function throwBot(): void {
    bot.vx = clampTo(bot.heldVx, -1500, 1500);
    bot.vy = clampTo(bot.heldVy, -1500, 1500);
    bot.thrown = true;
    bot.plan = null;
    bot.flip = false;
    setMode('air');
  }

  // ---------- Langkah per mode ----------
  function walkStep(dt: number): void {
    const d = bot.walkTo - bot.x;
    if (Math.abs(d) < 0.5) {
      setMode('idle', 0.5 + Math.random() * 1.2);
      return;
    }
    bot.dir = d > 0 ? 1 : -1;
    bot.x += Math.sign(d) * Math.min(Math.abs(d), walkSpeed() * dt);
    bot.phase += dt * 10;
    const g = bot.ground;
    if (g) bot.u = (bot.x - g.x1) / Math.max(1, g.x2 - g.x1);
  }

  function airStep(dt: number): void {
    const f = floor();
    const prevY = bot.y;
    bot.vy = Math.min(bot.vy + GRAVITY * dt, 1600);
    bot.x += bot.vx * dt;
    bot.y += bot.vy * dt;
    if (bot.x < f.x1) {
      bot.x = f.x1;
      bot.vx = Math.abs(bot.vx) * 0.35;
    } else if (bot.x > f.x2) {
      bot.x = f.x2;
      bot.vx = -Math.abs(bot.vx) * 0.35;
    }
    const ceiling = HEAD_TOP * scale - 30;
    if (bot.y < ceiling) {
      bot.y = ceiling;
      bot.vy = Math.max(0, bot.vy);
    }
    if (bot.flip) bot.spin = Math.min(360, bot.spin + (dt * 360) / bot.airT);
    else bot.rot = approach(bot.rot, 0, bot.thrown ? 3 : 8, dt);
    const hit = landingOn(ledges, bot.x, prevY, bot.y) ?? (bot.y >= f.y ? f : null);
    if (hit) land(hit);
  }

  function heldStep(dt: number): void {
    if (!grab) return;
    const f = floor();
    const tx = clampTo(grab.px - grab.dx, f.x1, f.x2);
    const ty = clampTo(grab.py - grab.dy, HEAD_TOP * scale - 30, f.y);
    const px = bot.x;
    const py = bot.y;
    bot.x = approach(bot.x, tx, 26, dt);
    bot.y = approach(bot.y, ty, 26, dt);
    const inv = 1 / Math.max(dt, 1e-3);
    bot.heldVx = approach(bot.heldVx, (bot.x - px) * inv, 18, dt);
    bot.heldVy = approach(bot.heldVy, (bot.y - py) * inv, 18, dt);
    bot.rot = approach(bot.rot, clampTo(-bot.heldVx * 0.035, -30, 30), 10, dt);
    bot.phase += dt * 16;
  }

  function look(dt: number): void {
    let tx = 0;
    let ty = 0;
    let tilt = 0;
    const head = { x: bot.x, y: bot.y - (58 - SIT_DROP * bot.sit) * scale };
    let target: { x: number; y: number } | null = null;
    if (bot.lookAt && now < bot.lookUntil) target = bot.lookAt;
    else if (pointerLocal && Math.hypot(pointerLocal.x - head.x, pointerLocal.y - head.y) < 380) {
      target = pointerLocal;
    }
    if (bot.mode === 'sleep' || bot.mode === 'held') target = null;
    if (target) {
      const dx = target.x - head.x;
      const dy = target.y - head.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      // Mata ada di dalam root yang dicerminkan menurut arah hadap.
      tx = (dx / d) * 3.2 * bot.dir;
      ty = clampTo((dy / d) * 2.4, -2.4, 2.4);
      tilt = (dx / d) * 6 * bot.dir;
    } else if (bot.mode === 'walk') {
      tx = 2.6;
    } else {
      bot.wanderIn -= dt;
      if (bot.wanderIn <= 0) {
        bot.wanderX = (Math.random() - 0.5) * 5;
        bot.wanderIn = 1.5 + Math.random() * 2.5;
      }
      tx = bot.wanderX;
    }
    bot.lookX = approach(bot.lookX, tx, 12, dt);
    bot.lookY = approach(bot.lookY, ty, 12, dt);
    bot.tilt = approach(bot.tilt, tilt, 6, dt);
  }

  function social(dt: number): void {
    if (paused) return;
    bot.waveCooldown -= dt;
    if (pointerLocal && bot.waveCooldown <= 0 && calm()) {
      const hx = bot.x;
      const hy = bot.y - 50 * scale;
      if (Math.hypot(pointerLocal.x - hx, pointerLocal.y - hy) < 120) {
        bot.waveCooldown = 16;
        const screenSide: 1 | -1 = pointerLocal.x >= bot.x ? 1 : -1;
        wave(screenSide === bot.dir ? 1 : -1);
        if (Math.random() < 0.6) say(pick(LINES.hello), 1.8);
        return;
      }
    }
    bot.chatterIn -= dt;
    if (bot.chatterIn <= 0 && bubbleUntil === 0 && calm()) {
      say(pick(LINES.chatter));
      bot.chatterIn = 15 + Math.random() * 12;
    }
  }

  function update(dt: number): void {
    now += dt;
    bot.blinkIn -= dt;
    if (bot.blinkIn <= 0) {
      bot.blink = 0;
      bot.blinkIn = 2.2 + Math.random() * 3.8;
    }
    bot.blink = approach(bot.blink, 1, 16, dt);

    const quiet = (performance.now() - lastActive) / 1000;
    if (!paused && bot.mode !== 'sleep' && quiet > 30 && calm()) sleep();
    else if (!paused && bot.mode === 'sleep' && quiet < 0.6) wake();

    bot.t += dt;
    switch (bot.mode) {
      case 'idle':
        if (bot.t >= bot.dur && !paused) decide();
        break;
      case 'walk':
        walkStep(dt);
        break;
      case 'sit':
        bot.phase += dt * 3.4;
        if (bot.t >= bot.dur && !paused) setMode('idle', 0.4);
        break;
      case 'crouch':
        if (bot.t >= 0.14) launch();
        break;
      case 'air':
        airStep(dt);
        break;
      case 'held':
        heldStep(dt);
        break;
      case 'wave':
        if (bot.t >= bot.dur) setMode('idle', 0.5);
        break;
      case 'dance':
        bot.phase += dt * 7.5;
        if (bot.t >= bot.dur) setMode('idle', 0.6);
        break;
      case 'sleep':
        break;
    }
    if (paused && bot.ground && bot.mode !== 'sleep' && bot.mode !== 'crouch') sleep();

    bot.sit = approach(bot.sit, bot.mode === 'sit' || bot.mode === 'sleep' ? 1 : 0, 9, dt);
    [bot.squash, bot.squashV] = settle(bot.squash, bot.squashV, 15, dt);

    // Antena tertinggal dari gerak horizontal lalu kembali tanpa memantul.
    const vx =
      bot.mode === 'walk'
        ? bot.dir * walkSpeed()
        : bot.mode === 'held'
          ? bot.heldVx
          : bot.mode === 'air'
            ? bot.vx
            : 0;
    const wobble =
      bot.mode === 'walk' || bot.mode === 'dance' ? Math.sin(bot.phase * 2) * 5 * bot.dir : 0;
    const droop = bot.mode === 'sleep' ? 16 : 0;
    bot.antenna = approach(bot.antenna, clampTo(-vx * 0.035, -30, 30) + wobble + droop, 9, dt);

    look(dt);
    social(dt);
    if (bubbleUntil > 0 && now > bubbleUntil) {
      bubble.classList.remove('is-on');
      bubbleUntil = 0;
    }
  }

  // ---------- Pose & gambar ----------
  function currentFace(): Face {
    if (bot.faceOverride && now < bot.faceUntil) return bot.faceOverride;
    switch (bot.mode) {
      case 'sleep':
        return 'sleep';
      case 'held':
        return 'wide';
      case 'air':
        return bot.thrown ? 'wide' : 'happy';
      case 'wave':
      case 'dance':
        return 'happy';
      default:
        return 'normal';
    }
  }

  function computePose(): BotPose {
    const p = pose;
    const m = bot.mode;
    const breath = frozen ? 0 : Math.sin(now * 2.2);
    p.dir = bot.dir;
    p.sy = 1 + bot.squash;
    p.sx = 1 - bot.squash * 0.6;
    p.sit = bot.sit;
    p.rot = bot.rot + (bot.flip ? bot.spin * bot.dir : 0);
    p.bob = 0;
    p.legL.rot = 0;
    p.legL.lift = 0;
    p.legL.scale = 1;
    p.legR.rot = 0;
    p.legR.lift = 0;
    p.legR.scale = 1;
    p.armL = 4;
    p.armR = 4;
    p.headTilt = bot.tilt;
    p.antenna = bot.antenna;
    p.lookX = bot.lookX;
    p.lookY = bot.lookY;
    p.blink = bot.blink;
    p.alert = m === 'held' || bot.thrown || currentFace() === 'dizzy';
    switch (m) {
      case 'idle':
        p.bob = breath * 0.7;
        p.armL = 4 + breath * 2;
        p.armR = p.armL;
        break;
      case 'walk': {
        const s = Math.sin(bot.phase);
        p.legL.lift = Math.max(0, s) * 3.4;
        p.legR.lift = Math.max(0, -s) * 3.4;
        p.legL.rot = -s * 5;
        p.legR.rot = -s * 5;
        p.bob = -Math.abs(Math.cos(bot.phase)) * 1.6;
        p.rot += bot.dir * 3 + s * 2.5;
        p.armL = 10 + s * 20;
        p.armR = 10 - s * 20;
        break;
      }
      case 'sit':
      case 'sleep': {
        const k = m === 'sleep' ? 0 : 1;
        const s = Math.sin(bot.phase);
        p.legL.rot = s * 9 * k;
        p.legR.rot = -s * 9 * k;
        p.legL.scale = 1 - (0.5 + 0.5 * s) * 0.24 * k;
        p.legR.scale = 1 - (0.5 - 0.5 * s) * 0.24 * k;
        p.armL = 24;
        p.armR = 24;
        p.bob = m === 'sleep' ? (frozen ? 0 : Math.sin(now * 1.4) * 0.8) : breath * 0.5;
        if (m === 'sleep') p.headTilt = 9;
        break;
      }
      case 'crouch':
        p.bob = 2.5;
        p.armL = 26;
        p.armR = 26;
        break;
      case 'air':
        if (bot.thrown) {
          const s = Math.sin(now * 22);
          p.armL = 125 + s * 24;
          p.armR = 125 - s * 24;
          p.legL.lift = Math.max(0, Math.sin(now * 18)) * 4;
          p.legR.lift = Math.max(0, -Math.sin(now * 18)) * 4;
        } else {
          p.armL = bot.vy < 0 ? 150 : 110;
          p.armR = p.armL;
          p.legL.scale = 0.8;
          p.legR.scale = 0.8;
          p.legL.lift = 2;
          p.legR.lift = 2;
        }
        break;
      case 'held':
        p.armL = 150 + Math.sin(now * 9) * 10;
        p.armR = 150 - Math.sin(now * 9) * 10;
        p.legL.lift = Math.max(0, Math.sin(bot.phase)) * 4.5;
        p.legR.lift = Math.max(0, -Math.sin(bot.phase)) * 4.5;
        break;
      case 'wave': {
        const w = 150 + Math.sin(bot.t * 13) * 22;
        if (bot.waveSide > 0) {
          p.armR = w;
          p.armL = 8;
        } else {
          p.armL = w;
          p.armR = 8;
        }
        p.bob = -Math.max(0, Math.sin(Math.min(bot.t * 7, Math.PI))) * 5;
        break;
      }
      case 'dance': {
        const s = Math.sin(bot.phase);
        p.rot += s * 8;
        p.armL = 100 + s * 46;
        p.armR = 100 - s * 46;
        p.legL.lift = Math.max(0, s) * 3.5;
        p.legR.lift = Math.max(0, -s) * 3.5;
        p.bob = -Math.abs(s) * 2.6;
        p.headTilt = -s * 7;
        break;
      }
    }
    p.face = currentFace();
    return p;
  }

  function placeBubble(): void {
    if (bubbleUntil === 0) return;
    const top = bot.y - (HEAD_TOP - SIT_DROP * bot.sit) * scale - 12 - bubbleH;
    const left = clampTo(bot.x - bubbleW / 2, 8, Math.max(8, width - bubbleW - 8));
    bubble.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    bubble.style.setProperty('--tail', `${clampTo(bot.x - left, 14, bubbleW - 14).toFixed(1)}px`);
  }

  function render(): void {
    applyPose(rig, computePose());
    const s = scale;
    rig.svg.style.transform = `translate3d(${(bot.x + VIEW.x * s).toFixed(1)}px, ${(bot.y + VIEW.y * s).toFixed(1)}px, 0)`;
    placeBubble();
    if (zs.classList.contains('is-on')) {
      zs.style.transform = `translate3d(${(bot.x + 16 * s).toFixed(1)}px, ${(bot.y - (84 - SIT_DROP * bot.sit) * s).toFixed(1)}px, 0)`;
    }
  }

  function dust(): void {
    const d = document.createElement('span');
    d.className = 'bot-dust';
    for (const side of ['l', 'r']) {
      const p = document.createElement('i');
      p.className = `bot-dust__p bot-dust__p--${side}`;
      d.append(p);
    }
    d.style.transform = `translate3d(${bot.x.toFixed(1)}px, ${bot.y.toFixed(1)}px, 0)`;
    layer?.append(d);
    window.setTimeout(() => d.remove(), 600);
  }

  function press(el: HTMLElement): void {
    el.classList.add('is-bot-press');
    window.setTimeout(() => el.classList.remove('is-bot-press'), 160);
  }

  function placeSeated(face: Face): void {
    measure();
    const btns = buttonLedges();
    const g = btns[btns.length - 1] ?? floor();
    settleOn(g, g.floor ? (g.x1 + g.x2) / 2 : sitSpot(g, 0.92));
    bot.mode = face === 'sleep' ? 'sleep' : 'sit';
    bot.sit = 1;
    bot.phase = 0;
    bot.antenna = face === 'sleep' ? 16 : 0;
    bot.faceOverride = face;
    bot.faceUntil = Number.POSITIVE_INFINITY;
    rig.svg.classList.remove('is-hidden');
    render();
  }

  // ---------- Reduced motion: pose duduk statis, tanpa loop ----------
  if (reduced) {
    frozen = true;
    new ResizeObserver(() => placeSeated('normal')).observe(hero);
    return;
  }

  // ---------- Interaksi ----------
  const loop = new Loop(hero, (dt) => {
    const r = hero.getBoundingClientRect();
    pointerLocal = pointer ? { x: pointer.x - r.left, y: pointer.y - r.top } : null;
    update(dt);
    render();
    if (paused && bot.mode === 'sleep' && bot.sit > 0.985 && !frozen) {
      frozen = true;
      render();
      // Loop.stop() dari dalam frame baru berlaku setelah frame selesai.
      queueMicrotask(() => loop.stop());
    }
  });

  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = hero.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // Gerak dan lepas didengar di window: pointer capture pada elemen SVG tidak selalu andal,
  // dan pengguna bisa melepas robot di luar area pegangnya.
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      lastActive = performance.now();
      if (!grab || e.pointerId !== grab.id) return;
      const p = local(e);
      grab.px = p.x;
      grab.py = p.y;
      if (!grab.moved && Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy) > 5) {
        grab.moved = true;
        startHeld();
      }
    },
    { passive: true },
  );
  for (const type of ['pointerdown', 'keydown', 'scroll'] as const) {
    window.addEventListener(
      type,
      () => {
        lastActive = performance.now();
      },
      { passive: true },
    );
  }

  rig.hit.addEventListener('pointerdown', (e) => {
    if (paused || bot.mode === 'crouch') return;
    const p = local(e);
    grab = {
      id: e.pointerId,
      dx: p.x - bot.x,
      dy: p.y - bot.y,
      sx: e.clientX,
      sy: e.clientY,
      px: p.x,
      py: p.y,
      moved: false,
    };
  });
  const release = (e: PointerEvent): void => {
    if (!grab || e.pointerId !== grab.id) return;
    const moved = grab.moved;
    grab = null;
    document.documentElement.classList.remove('is-grabbing');
    if (moved) throwBot();
    else poke();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  const rotator = hero.querySelector<HTMLElement>('.rotator');
  rotator?.addEventListener('nx:swap', () => {
    if (paused || !calm() || Math.random() > 0.3) return;
    const o = offsetIn(rotator, hero);
    bot.lookAt = { x: o.x + rotator.offsetWidth / 2, y: o.y + rotator.offsetHeight / 2 };
    bot.lookUntil = now + 1.4;
  });
  const react = (lines: readonly string[]) => (): void => {
    if (paused || !bot.ground) return;
    say(pick(lines), 2.6);
    bot.lookAt = { x: bot.x, y: floor().y + 240 };
    bot.lookUntil = now + 1.6;
  };
  hero.querySelector('[data-arena="agent"]')?.addEventListener('click', react(LINES.agent));
  hero.querySelector('[data-arena="human"]')?.addEventListener('click', react(LINES.human));

  function setPaused(next: boolean): void {
    paused = next;
    if (toggleLabel) toggleLabel.textContent = next ? 'Bangunkan robot' : 'Istirahatkan robot';
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'istirahat' : 'main');
    } catch {
      // penyimpanan diblokir: preferensi hanya berlaku di halaman ini
    }
    if (next) {
      zs.classList.remove('is-on');
      bubble.classList.remove('is-on');
      bubbleUntil = 0;
      if (grab) {
        grab = null;
        document.documentElement.classList.remove('is-grabbing');
        throwBot();
      }
    } else {
      frozen = false;
      bot.faceOverride = null;
      if (bot.mode === 'sleep') wake();
    }
    loop.start();
  }

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => setPaused(!paused));
  }

  measure();
  new ResizeObserver(() => {
    measure();
    if (frozen) render();
  }).observe(hero);
  void document.fonts?.ready.then(() => {
    measure();
    if (frozen) render();
  });

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (stored === 'istirahat') {
    paused = true;
    frozen = true;
    if (toggleLabel) toggleLabel.textContent = 'Bangunkan robot';
    placeSeated('sleep');
    bot.faceOverride = null;
    return;
  }

  // Masuk: jatuh dari atas hero ke tombol terakhir, lalu melambai dan menyapa.
  window.setTimeout(() => {
    measure();
    const btns = buttonLedges();
    const target = btns[btns.length - 1] ?? floor();
    const x = target.floor ? (target.x1 + target.x2) / 2 : sitSpot(target, 0.92);
    bot.x = x;
    bot.y = HEAD_TOP * scale - 30;
    bot.vx = 0;
    bot.vy = 0;
    bot.plan = { target, x, after: 'wave', flip: false };
    setMode('air');
    rig.svg.classList.remove('is-hidden');
    loop.start();
  }, 900);
}

/** Robot kedua: tidur di puncak huruf A wordmark footer; klik untuk membangunkannya sebentar. */
export function initFooterBot(foot: HTMLElement): void {
  const canvas = foot.querySelector<HTMLCanvasElement>('.wordmark');
  const host = canvas?.parentElement;
  if (!canvas || !host) return;
  host.classList.add('has-foot-bot');
  const rig = buildBot('bot--foot');
  const bubble = document.createElement('p');
  bubble.className = 'bot-bubble';
  const zs = makeZs();
  const layer = document.createElement('div');
  layer.className = 'bot-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.append(rig.svg, bubble, zs);
  host.append(layer);

  const pose = restPose();
  let scale = 1;
  let x = 0;
  let y = 0;
  let awake = false;
  let timer = 0;

  const asleep = (): void => {
    pose.face = 'sleep';
    pose.sit = 1;
    pose.headTilt = 9;
    pose.antenna = 16;
    pose.armL = 24;
    pose.armR = 24;
    pose.lookX = 0;
    zs.classList.add('is-on');
    bubble.classList.remove('is-on');
  };

  const place = (): void => {
    const ledge = wordmarkLedge(canvas.clientWidth, canvas.clientHeight);
    scale = clampTo(ledge.cell / 42, 0.42, 1.05);
    const o = offsetIn(canvas, host);
    x = o.x + ledge.x;
    y = o.y + ledge.y;
    rig.svg.setAttribute('width', (VIEW.w * scale).toFixed(1));
    rig.svg.setAttribute('height', (VIEW.h * scale).toFixed(1));
    rig.svg.style.transform = `translate3d(${(x + VIEW.x * scale).toFixed(1)}px, ${(y + VIEW.y * scale).toFixed(1)}px, 0)`;
    zs.style.transform = `translate3d(${(x + 16 * scale).toFixed(1)}px, ${(y - (84 - SIT_DROP) * scale).toFixed(1)}px, 0)`;
    if (bubble.classList.contains('is-on')) {
      const w = bubble.offsetWidth;
      const left = clampTo(x - w / 2, 0, Math.max(0, host.clientWidth - w));
      const top = y - (HEAD_TOP - SIT_DROP) * scale - 12 - bubble.offsetHeight;
      bubble.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      bubble.style.setProperty('--tail', `${clampTo(x - left, 14, w - 14).toFixed(1)}px`);
    }
    applyPose(rig, pose);
  };

  asleep();
  rig.hit.addEventListener('click', () => {
    if (awake) return;
    awake = true;
    pose.face = 'happy';
    pose.headTilt = 0;
    pose.antenna = 0;
    pose.armR = reducedMotion() ? 24 : 150;
    zs.classList.remove('is-on');
    bubble.textContent = pick(LINES.bye);
    bubble.classList.add('is-on');
    place();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      awake = false;
      asleep();
      place();
    }, 2600);
  });
  new ResizeObserver(place).observe(canvas);
}
