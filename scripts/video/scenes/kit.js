// Alat bantu adegan: semua animasi dihitung dari detik t (deterministik). Tanpa CSS animation.
(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const easeOut = (t) => 1 - (1 - t) ** 3;
  /** Progres 0..1 antara detik a dan a+d, dengan easing. */
  const prog = (t, a, d = 0.6, fn = easeOut) => fn(clamp((t - a) / d));
  /** Muncul: opacity + geser naik. */
  const reveal = (el, t, a, d = 0.6, dy = 18) => {
    const k = prog(t, a, d);
    el.style.opacity = String(k);
    el.style.transform = `translateY(${((1 - k) * dy).toFixed(2)}px)`;
  };
  /** Waktu cue dari data (detik sejak adegan mulai), dengan cadangan. */
  const cue = (name, fallback) => {
    const c = window.__data?.cues || {};
    return typeof c[name] === 'number' ? c[name] : fallback;
  };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  window.kit = { clamp, ease, easeOut, prog, reveal, cue, $, $$ };
})();
