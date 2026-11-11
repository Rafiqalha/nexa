// Elemen [data-reveal] muncul saat masuk layar: naik pelan (bawaan) atau "redaksi" untuk judul
// (blok solid menyapu, lalu teks terbuka). Tanpa JS semua tetap terlihat (kelas .js di <html>).
import { reducedMotion } from '../lib/motion';

function prepareWipe(el: HTMLElement): void {
  const wrap = document.createElement('span');
  wrap.className = 'wipe';
  const text = document.createElement('span');
  text.className = 'wipe__text';
  text.append(...el.childNodes);
  const bar = document.createElement('span');
  bar.className = 'wipe__bar';
  bar.setAttribute('aria-hidden', 'true');
  wrap.append(text, bar);
  el.append(wrap);
}

export function initReveal(root: ParentNode): void {
  const els = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
  for (const el of els) {
    if (el.dataset.reveal === 'wipe') prepareWipe(el);
    const i = el.dataset.i;
    if (i) el.style.setProperty('--i', i);
  }
  if (reducedMotion()) {
    for (const el of els) el.classList.add('is-in');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  for (const el of els) io.observe(el);
}
