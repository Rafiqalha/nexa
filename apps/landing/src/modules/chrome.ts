// Bilah progres baca (garis aksen 2px di atas), garis bawah header saat digulir, dan penanda
// bagian aktif di navigasi. Gulir tetap native: tidak ada smooth-scroll yang membajak.
export function initChrome(): void {
  const header = document.querySelector<HTMLElement>('.top');
  const bar = document.querySelector<HTMLElement>('.progress span');
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    bar?.style.setProperty('--p', p.toFixed(4));
    header?.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    },
    { passive: true },
  );
  window.addEventListener('resize', update);
  update();

  const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav a')];
  const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
  // Bagian yang sedang memotong pita tengah layar; di luar semua bagian (hero, manifesto),
  // tidak ada menu yang ditandai.
  const inBand = new Set<string>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inBand.add(e.target.id);
        else inBand.delete(e.target.id);
      }
      const current = [...byId.keys()].filter((id) => inBand.has(id)).pop();
      for (const a of links) a.classList.toggle('is-active', a === byId.get(current ?? ''));
    },
    { rootMargin: '-40% 0px -55% 0px' },
  );
  for (const id of byId.keys()) {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  }
}
