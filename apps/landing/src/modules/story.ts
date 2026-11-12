// Scrollytelling "Cara kerja": langkah aktif ditentukan posisi gulir (IntersectionObserver),
// figur sticky berganti panel, indeks kiri ikut menandai. Panel 6 memutar urutan gerbang
// persetujuan: aturan "diketik", lolos suricata -T, lalu Setujui dengan centang tergambar.
import { inView, reducedMotion } from '../lib/motion';

const TITLES = ['Deteksi', 'Belokkan', 'Tahan', 'Canary', 'Redaksi', 'Persetujuan'];

export function initStory(root: HTMLElement): void {
  const stage = root.querySelector<HTMLElement>('.stage');
  if (!stage) return;
  const label = root.querySelector('[data-stage-label]');
  const steps = [...root.querySelectorAll<HTMLElement>('.step')];
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.story__index a')];
  const panels = [...root.querySelectorAll<HTMLElement>('.panel')];
  const approval = createApproval(root);
  const redaction = createRedaction(root);
  let active = 0;

  const activate = (n: number) => {
    if (n === active || n < 1) return;
    active = n;
    stage.dataset.active = String(n);
    if (label)
      // Langkah 1 = FIG. 03 (FIG. 02 dipakai tur produk).
      label.textContent = `FIG. ${String(n + 2).padStart(2, '0')} · ${TITLES[n - 1] ?? ''}`;
    for (const s of steps) s.classList.toggle('is-active', Number(s.dataset.step) === n);
    for (const a of links) a.classList.toggle('is-active', Number(a.dataset.index) === n);
    for (const p of panels) p.classList.toggle('is-active', Number(p.dataset.panel) === n);
    if (n === 5) redaction.play();
    else redaction.reset();
    if (n === 6) approval.play();
    else approval.reset();
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) activate(Number((e.target as HTMLElement).dataset.step));
      }
    },
    { rootMargin: '-42% 0px -52% 0px' },
  );
  for (const s of steps) io.observe(s);
  // Panel 1 diputar saat panggung pertama kali terlihat, bukan saat halaman dimuat.
  inView(stage, () => activate(Math.max(1, active)), 0.3);
}

/**
 * Panel 5: blok redaksi menyapu tiap nilai; tepat saat blok menutup penuh, nilai asli diganti
 * token (pergantian instan, bukan animasi tata letak), lalu blok terbuka memperlihatkan token.
 */
function createRedaction(root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>('.redact')];
  let timers: number[] = [];

  const reset = () => {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
    for (const el of items) el.classList.remove('is-redacted');
  };

  const play = () => {
    reset();
    items.forEach((el, i) => {
      if (reducedMotion()) {
        el.classList.add('is-redacted');
        return;
      }
      // Sama dengan jeda CSS: 400ms + i × 260ms, blok menutup penuh di ~46% dari 760ms.
      timers.push(window.setTimeout(() => el.classList.add('is-redacted'), 760 + i * 260));
    });
  };

  return { play, reset };
}

function createApproval(root: HTMLElement) {
  const rule = root.querySelector<HTMLElement>('[data-rule]');
  const checks = root.querySelector<HTMLElement>('[data-checks]');
  const approve = root.querySelector<HTMLElement>('[data-approve]');
  const wait = checks?.querySelector<HTMLElement>('.wait');
  const full = rule?.textContent ?? '';
  const waitHtml = wait?.innerHTML ?? '';
  let timers: number[] = [];

  const finish = () => {
    checks?.classList.add('is-on');
    approve?.classList.add('is-done');
    if (wait) {
      wait.classList.replace('wait', 'done');
      const textNode = [...wait.childNodes].find((c) => c.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' disetujui operator · tercatat';
    }
  };

  const reset = () => {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
    if (rule) rule.textContent = full;
    checks?.classList.remove('is-on');
    approve?.classList.remove('is-done');
    if (wait) {
      wait.classList.replace('done', 'wait');
      wait.innerHTML = waitHtml;
    }
  };

  const play = () => {
    reset();
    if (!rule || reducedMotion()) {
      finish();
      return;
    }
    rule.textContent = '';
    const text = document.createTextNode('');
    const caret = document.createElement('span');
    caret.className = 'caret';
    rule.append(text, caret);
    const perChar = 1000 / 90;
    for (let i = 1; i <= full.length; i += 3) {
      timers.push(
        window.setTimeout(() => {
          text.textContent = full.slice(0, i);
        }, i * perChar),
      );
    }
    const typed = full.length * perChar;
    timers.push(
      window.setTimeout(() => {
        text.textContent = full;
        caret.remove();
        checks?.classList.add('is-on');
      }, typed + 120),
    );
    timers.push(window.setTimeout(finish, typed + 1500));
  };

  return { play, reset };
}
