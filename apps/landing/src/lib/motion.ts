// Utilitas gerak: preferensi reduced-motion, loop rAF yang berhenti saat elemen tak terlihat
// atau tab tersembunyi, hitung naik angka (mono tabular), dan pemicu sekali saat terlihat.
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

export function reducedMotion(): boolean {
  return mq.matches;
}

export function onReducedMotionChange(cb: (reduced: boolean) => void): void {
  mq.addEventListener('change', () => cb(mq.matches));
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Loop requestAnimationFrame yang hanya berjalan selama elemen terlihat & tab aktif. */
export class Loop {
  private raf = 0;
  private last = 0;
  private visible = false;
  private running = false;

  constructor(
    el: Element,
    private readonly frame: (dt: number) => void,
  ) {
    new IntersectionObserver(
      (entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        this.sync();
      },
      { rootMargin: '160px 0px' },
    ).observe(el);
    document.addEventListener('visibilitychange', () => this.sync());
  }

  start(): void {
    this.running = true;
    this.sync();
  }

  stop(): void {
    this.running = false;
    this.sync();
  }

  private sync(): void {
    const go = this.running && this.visible && !document.hidden;
    if (go && this.raf === 0) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!go && this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private readonly tick = (now: number): void => {
    // dt dibatasi agar simulasi tidak melompat setelah tab kembali aktif.
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.frame(dt);
    this.raf = requestAnimationFrame(this.tick);
  };
}

/** Panggil cb sekali saat elemen pertama kali terlihat. */
export function inView(el: Element, cb: () => void, threshold = 0.2): void {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cb();
      }
    },
    { threshold },
  );
  io.observe(el);
}

const formatters = new Map<number, Intl.NumberFormat>();

export function formatNumber(n: number, decimals = 0): string {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, f);
  }
  return f.format(n);
}

/** Angka menghitung naik (ease-out). Reduced-motion: langsung ke nilai akhir. */
export function countUp(el: Element, to: number, decimals = 0, duration = 1100): void {
  if (reducedMotion()) {
    el.textContent = formatNumber(to, decimals);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = formatNumber(to * easeOut(t), decimals);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
