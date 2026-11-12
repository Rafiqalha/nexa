// FIG. 02 · Tur produk: dashboard NEXA tiruan (reel-mock.ts) diputar menurut naskah
// (reel-script.ts) seperti video, tetapi berupa DOM: teks tetap tajam di zoom berapa pun, ringan,
// dan bisa dijeda. Kamera memperbesar ke titik aksi, kursor bergerak lalu mengklik, keterangan
// berganti per langkah. Semua keadaan dihitung murni dari detik T, jadi jeda dan lompat bab selalu
// konsisten. Loop berhenti saat tak terlihat; reduced-motion: tanpa putar otomatis, setiap bab
// ditampilkan dalam keadaan akhirnya.
import { decoyPath } from '../content/decoys';
import { iconSvg, mountIcons } from '../lib/icons';
import { clamp, easeOut, formatNumber, Loop, reducedMotion } from '../lib/motion';
import { mockHtml, SIGNALS, STAGE } from './reel-mock';
import {
  AT,
  CAMERA,
  CAPTIONS,
  CHAPTERS,
  CLICKS,
  CRUMBS,
  CURSOR,
  chapterAt,
  DURATION,
  NUM,
  pagesAt,
  RULE,
  SUMMARY,
  VIEWS,
  type View,
} from './reel-script';

type Point = { x: number; y: number };

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, e: number): number => a + (b - a) * e;

/** Indeks kunci aktif dan progres ease-in-out menuju kunci berikutnya. */
function locate(times: readonly number[], t: number): [number, number] {
  let i = 0;
  while (i < times.length - 2 && t >= (times[i + 1] ?? Number.POSITIVE_INFINITY)) i++;
  const a = times[i] ?? 0;
  const b = times[i + 1] ?? a;
  return [i, b > a ? easeInOut(seg(t, a, b)) : 0];
}

const CAMERA_T = CAMERA.map((k) => k[0]);
const CURSOR_T = CURSOR.map((k) => k[0]);

function setText(el: Element, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

/** Jam dinding tiruan: 10.46.58 + detik. */
function clock(seconds: number): string {
  const total = 10 * 3600 + 46 * 60 + 58 + Math.round(seconds);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 3600))}.${p(Math.floor((total % 3600) / 60))}.${p(total % 60)}`;
}

export function initReel(fig: HTMLElement): void {
  const stage = fig.querySelector<HTMLElement>('[data-reel-stage]');
  const viewport = stage?.parentElement ?? null;
  const caption = fig.querySelector<HTMLElement>('[data-reel-caption]');
  const pill = caption?.parentElement ?? null;
  const playBtn = fig.querySelector<HTMLButtonElement>('[data-reel-play]');
  const chapterBtns = [...fig.querySelectorAll<HTMLButtonElement>('[data-chapter]')];
  if (!stage || !viewport || !caption || !pill) return;

  stage.innerHTML = mockHtml({ issued: AT.canaryIssued, used: AT.canaryUsed });
  mountIcons(stage);
  stage.querySelector('[data-m="cursor"] svg')?.classList.add('m-cursor__icon');
  const reduced = reducedMotion();
  fig.classList.toggle('is-static', reduced);

  const one = (name: string): HTMLElement =>
    stage.querySelector<HTMLElement>(`[data-m="${name}"]`) ?? document.createElement('span');
  const all = (sel: string): HTMLElement[] => [...stage.querySelectorAll<HTMLElement>(sel)];
  const el = {
    crumb: one('crumb'),
    burn: one('burn'),
    nexa: one('nexa'),
    kTrapped: one('k-trapped'),
    kHeld: one('k-held'),
    kDepth: one('k-depth'),
    kRules: one('k-rules'),
    lowerA: one('lower-a'),
    lowerB: one('lower-b'),
    agentVerdict: one('agent-verdict'),
    gauge: one('gauge'),
    score: one('score'),
    cap: one('cap'),
    verdict: one('verdict'),
    ttt: one('ttt'),
    sDepth: one('s-depth'),
    sTokens: one('s-tokens'),
    sHeld: one('s-held'),
    sLast: one('s-last'),
    decoys: one('decoys'),
    summary: one('summary'),
    summaryCaret: one('summary-caret'),
    intelTokens: one('intel-tokens'),
    rule: one('rule'),
    ruleCaret: one('rule-caret'),
    ruleValid: one('rule-valid'),
    ruleStatus: one('rule-status'),
    approve: one('approve'),
    audit: one('audit'),
    cursor: one('cursor'),
    ring: one('ring'),
  };
  const feed = all('[data-feed]');
  const signals = all('[data-signal]');
  const timeline = all('[data-tl]');
  const redacts = all('[data-redact]');
  const views = all('[data-view]');
  const navItems = all('[data-nav]');

  // Titik bidik dalam koordinat panggung (posisi tata letak, tidak terpengaruh skala kamera).
  const anchors = new Map<string, Point>();
  const center: Point = { x: STAGE.w / 2, y: STAGE.h / 2 };
  function anchor(name: string): Point {
    if (name === 'stage') return center;
    const cached = anchors.get(name);
    if (cached) return cached;
    const target = stage?.querySelector<HTMLElement>(`[data-anchor="${name}"]`);
    if (!target) return center;
    let x = target.offsetWidth / 2;
    let y = target.offsetHeight / 2;
    for (let n: HTMLElement | null = target; n && n !== stage; ) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent instanceof HTMLElement ? n.offsetParent : null;
    }
    const p = { x, y };
    anchors.set(name, p);
    return p;
  }

  function camera(t: number): Point & { z: number } {
    const [i, e] = locate(CAMERA_T, t);
    const a = CAMERA[i];
    const b = CAMERA[i + 1] ?? a;
    if (!a || !b) return { ...center, z: 1 };
    const pa = anchor(a[1]);
    const pb = anchor(b[1]);
    return { x: lerp(pa.x, pb.x, e), y: lerp(pa.y, pb.y, e), z: lerp(a[2], b[2], e) };
  }

  function cursor(t: number): Point {
    const [i, e] = locate(CURSOR_T, t);
    const a = CURSOR[i];
    const b = CURSOR[i + 1] ?? a;
    if (!a || !b) return center;
    const pa = anchor(a[1]);
    const pb = anchor(b[1]);
    return { x: lerp(pa.x + a[2], pb.x + b[2], e), y: lerp(pa.y + a[3], pb.y + b[3], e) };
  }

  let vw = 0;
  let vh = 0;
  let t = reduced ? (CHAPTERS[0]?.end ?? 1) - 0.01 : 0;
  let playing = !reduced;
  let lastCaption = -1;
  let lastPages = -1;

  function renderDecoys(n: number): void {
    if (n === lastPages) return;
    lastPages = n;
    const items: HTMLLIElement[] = [];
    for (let i = n - 1; i >= Math.max(0, n - 6); i--) {
      const li = document.createElement('li');
      if (i === n - 1 && !reduced) li.className = 'is-new';
      const path = document.createElement('code');
      path.textContent = decoyPath('BAYU-7', i);
      const tok = document.createElement('span');
      tok.textContent = `+${formatNumber(NUM.tokensPerPage)}`;
      li.append(path, tok);
      items.push(li);
    }
    el.decoys.replaceChildren(...items);
  }

  function render(now: number): void {
    if (!stage) return;
    // Kamera: skala "cover" agar panggung selalu memenuhi jendela, lalu zoom ke titik bidik.
    if (vw > 0 && vh > 0) {
      const c = camera(now);
      // Di layar sempit skala dasar sudah besar (cover), jadi zoom kamera diredam.
      const z = 1 + (c.z - 1) * (vw < 640 ? 0.4 : 1);
      const s = Math.max(vw / STAGE.w, vh / STAGE.h) * z;
      const tx = clamp(vw / 2 - c.x * s, vw - STAGE.w * s, 0);
      const ty = clamp(vh / 2 - c.y * s, vh - STAGE.h * s, 0);
      stage.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
    }
    const fade = reduced ? 1 : clamp(Math.min(now / 0.35, (DURATION - now) / 0.35), 0, 1);
    stage.style.opacity = fade.toFixed(3);

    // Tampilan aktif & menu.
    let view: View = 'dashboard';
    for (const v of VIEWS) if (now >= v.at) view = v.view;
    for (const v of views) v.classList.toggle('is-on', v.dataset.view === view);
    for (const n of navItems) n.classList.toggle('is-on', n.dataset.nav === view);
    setText(el.crumb, CRUMBS[view]);

    // Keterangan & bab.
    let ci = 0;
    CAPTIONS.forEach((c, i) => {
      if (now >= c.at) ci = i;
    });
    if (ci !== lastCaption) {
      lastCaption = ci;
      setText(caption as HTMLElement, CAPTIONS[ci]?.text ?? '');
      if (!reduced) {
        pill?.classList.remove('is-new');
        void pill?.offsetWidth;
        pill?.classList.add('is-new');
      }
    }
    const active = chapterAt(now);
    chapterBtns.forEach((b, i) => {
      const ch = CHAPTERS[i];
      if (!ch) return;
      const p = i < active ? 1 : i > active ? 0 : seg(now, ch.start, ch.end);
      b.style.setProperty('--p', p.toFixed(3));
      if (i === active) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });

    // Bab 1: permintaan masuk dan skor.
    feed.forEach((r, i) => {
      r.classList.toggle('is-on', now >= (AT.feed[i] ?? 0));
    });
    const judged = now >= AT.verdict;
    setText(el.agentVerdict, judged ? 'AGEN · dibelokkan' : 'menilai…');
    el.agentVerdict.classList.toggle('m-trap', judged);
    signals.forEach((s, i) => {
      s.classList.toggle('is-on', now >= (AT.signals[i] ?? 0));
    });
    let score = 0;
    SIGNALS.forEach(([, w], i) => {
      const a = AT.signals[i] ?? 0;
      // Skor dibatasi 1,00 seperti sensor: bobot terakhir hanya mengisi sisa.
      const room = Math.max(
        0,
        Math.min(w, 1 - SIGNALS.slice(0, i).reduce((s2, x) => s2 + x[1], 0)),
      );
      score += room * easeOut(seg(now, a, a + 0.35));
    });
    el.gauge.style.transform = `scaleX(${score.toFixed(3)})`;
    setText(el.score, formatNumber(score, 2));
    el.score.classList.toggle('m-trap', score >= 0.85);
    el.cap.classList.toggle('is-on', now >= (AT.signals[2] ?? 0) + 0.35);
    el.verdict.classList.toggle('is-on', judged);
    el.ttt.classList.toggle('is-on', now >= AT.timeToTrap);
    el.lowerA.classList.toggle('is-on', now < 9.5);
    el.lowerB.classList.toggle('is-on', now >= 9.5);

    // Bab 2: labirin membakar token penyerang; token NEXA tetap nol.
    const pages = pagesAt(now);
    const held = Math.round((pages / NUM.pages) * NUM.heldSeconds);
    const depth =
      pages === 0 ? (now >= AT.trapped ? 1 : 0) : 1 + Math.min(4, Math.floor(pages / 7));
    const burned = formatNumber(pages * NUM.tokensPerPage);
    setText(el.burn, burned);
    setText(el.kTrapped, now >= AT.trapped ? '1' : '0');
    setText(el.kHeld, String(held));
    setText(el.kDepth, String(depth));
    setText(el.kRules, now >= AT.rulesPending && now < AT.approved ? '1' : '0');
    setText(el.sDepth, String(Math.max(1, depth)));
    setText(el.sTokens, burned);
    setText(el.sHeld, String(held));
    setText(el.sLast, clock(3 + held));
    renderDecoys(pages);

    // Bab 3: canary diberikan lalu dipakai.
    for (const r of timeline) r.classList.toggle('is-on', now >= Number(r.dataset.at ?? 0));

    // Bab 4: redaksi lalu ringkasan model.
    redacts.forEach((r, i) => {
      r.classList.toggle('is-redacted', now >= (AT.redact[i] ?? 0));
    });
    const [s0, s1] = AT.summary;
    setText(el.summary, SUMMARY.slice(0, Math.floor(seg(now, s0, s1) * SUMMARY.length)));
    el.summaryCaret.classList.toggle('is-on', now >= s0 && now < s1 + 0.4);
    const intel =
      now >= AT.intelTokens
        ? Math.round(NUM.intelTokens * easeOut(seg(now, AT.intelTokens, AT.intelTokens + 0.6)))
        : 0;
    setText(el.nexa, formatNumber(intel));
    setText(el.intelTokens, now >= AT.intelTokens ? `${formatNumber(intel)} token` : '–');

    // Bab 5: draf aturan diketik, divalidasi, lalu disetujui operator.
    const [r0, r1] = AT.ruleType;
    setText(el.rule, RULE.slice(0, Math.floor(seg(now, r0, r1) * RULE.length)));
    el.ruleCaret.classList.toggle('is-on', now >= r0 && now < r1 + 0.3);
    const valid = now >= AT.ruleValid;
    setText(el.ruleValid, valid ? 'Sintaks valid (suricata -T)' : 'memvalidasi…');
    el.ruleValid.classList.toggle('m-ok', valid);
    const approved = now >= AT.approved;
    setText(el.ruleStatus, approved ? 'Disetujui operator · tercatat' : 'Menunggu persetujuan');
    el.ruleStatus.classList.toggle('m-ok', approved);
    el.ruleStatus.classList.toggle('m-wait', !approved);
    const click = CLICKS[CLICKS.length - 1] ?? 0;
    el.approve.classList.toggle('is-pressed', now >= click && now < AT.approved);
    el.approve.classList.toggle('is-done', approved);
    el.audit.classList.toggle('is-on', now >= AT.audit);

    // Kursor dan riak klik.
    const p = cursor(now);
    const pressed = CLICKS.some((c) => now >= c - 0.06 && now < c + 0.14);
    el.cursor.style.transform = `translate(${(p.x - 4).toFixed(1)}px, ${(p.y - 4).toFixed(1)}px) scale(${pressed ? 0.82 : 1})`;
    const ripple = CLICKS.find((c) => now >= c && now < c + 0.6);
    if (ripple === undefined) {
      el.ring.style.opacity = '0';
    } else {
      const k = (now - ripple) / 0.6;
      el.ring.style.opacity = (0.6 * (1 - k)).toFixed(3);
      el.ring.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${(0.4 + 1.4 * k).toFixed(3)})`;
    }
  }

  function setPlaying(next: boolean): void {
    playing = next;
    if (!playBtn) return;
    playBtn.setAttribute('aria-label', next ? 'Jeda tur produk' : 'Putar tur produk');
    playBtn.replaceChildren(iconSvg(next ? 'pause' : 'play', 16, 2));
  }

  chapterBtns.forEach((b, i) => {
    b.addEventListener('click', () => {
      const ch = CHAPTERS[i];
      if (!ch) return;
      t = reduced ? ch.end - 0.01 : ch.start + 0.001;
      render(t);
      if (!reduced) setPlaying(true);
    });
  });

  new ResizeObserver(() => {
    vw = viewport.clientWidth;
    vh = viewport.clientHeight;
    render(t);
  }).observe(viewport);
  void document.fonts?.ready.then(() => {
    anchors.clear();
    render(t);
  });

  if (reduced) return;
  if (playBtn) {
    playBtn.hidden = false;
    playBtn.addEventListener('click', () => setPlaying(!playing));
  }
  new Loop(fig, (dt) => {
    if (!playing) return;
    t += dt;
    if (t >= DURATION) t -= DURATION;
    render(t);
  }).start();
}
