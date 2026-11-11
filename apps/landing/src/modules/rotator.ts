// Frasa terakhir judul hero berganti: blok aksen menyapu seperti redaksi, frasa baru muncul di
// baliknya. Semua frasa sudah ada di HTML (ditumpuk), jadi yang berganti hanya visibilitas,
// bukan tata letak. Berhenti saat tak terlihat/tab tersembunyi; reduced-motion: frasa pertama.
import { reducedMotion } from '../lib/motion';

const PERIOD_MS = 2800;
const SWAP_AT_MS = 320;

export function initRotator(el: HTMLElement): void {
  const words = [...el.querySelectorAll<HTMLElement>('.rotator__word')];
  if (words.length < 2 || reducedMotion()) return;
  let index = Math.max(
    0,
    words.findIndex((w) => w.classList.contains('is-on')),
  );
  let visible = true;
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  }).observe(el);
  window.setInterval(() => {
    if (!visible || document.hidden) return;
    el.classList.remove('is-wiping');
    void el.offsetWidth; // mulai ulang animasi
    el.classList.add('is-wiping');
    window.setTimeout(() => {
      index = (index + 1) % words.length;
      words.forEach((w, i) => {
        w.classList.toggle('is-on', i === index);
      });
    }, SWAP_AT_MS);
  }, PERIOD_MS);
}
