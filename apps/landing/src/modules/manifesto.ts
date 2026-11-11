// Manifesto: kata demi kata menyala mengikuti posisi gulir (dikendalikan pengguna, bukan
// waktu). Reduced-motion: semua kata langsung penuh.
import { clamp, reducedMotion } from '../lib/motion';

export function initManifesto(el: HTMLElement): void {
  const words = (el.textContent ?? '').trim().split(/\s+/);
  const spans = words.map((word) => {
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = word;
    return s;
  });
  el.replaceChildren(
    ...spans.flatMap((s, i) => (i < spans.length - 1 ? [s, document.createTextNode(' ')] : [s])),
  );
  if (reducedMotion()) {
    for (const s of spans) s.classList.add('is-on');
    return;
  }
  let raf = 0;
  const update = () => {
    raf = 0;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = clamp((vh * 0.9 - r.top) / (r.height + vh * 0.4), 0, 1);
    const on = Math.round(p * spans.length);
    spans.forEach((s, i) => {
      s.classList.toggle('is-on', i < on);
    });
  };
  window.addEventListener(
    'scroll',
    () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}
