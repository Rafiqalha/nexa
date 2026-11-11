// Kata terakhir judul hero berganti: blok aksen menyapu seperti redaksi, kata baru muncul di
// baliknya. Berhenti saat tak terlihat/tab tersembunyi; reduced-motion: kata pertama saja.
import { reducedMotion } from '../lib/motion';

const PERIOD_MS = 2800;
const SWAP_AT_MS = 320;

export function initRotator(el: HTMLElement): void {
  const words = (el.dataset.words ?? '').split('|').filter(Boolean);
  if (words.length < 2 || reducedMotion()) return;
  let index = 0;
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
      el.textContent = words[index] ?? '';
    }, SWAP_AT_MS);
  }, PERIOD_MS);
}
