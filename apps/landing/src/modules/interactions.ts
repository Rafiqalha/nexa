// Interaksi kecil: riak klik tombol (nx-ripple, DESIGN.md §8.1) dan tombol salin perintah.
import { iconSvg } from '../lib/icons';
import { reducedMotion } from '../lib/motion';

export function initRipples(root: ParentNode): void {
  if (reducedMotion()) return;
  for (const btn of root.querySelectorAll<HTMLElement>('a.btn, button.btn')) {
    btn.addEventListener('pointerdown', (e) => {
      const r = btn.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.left = `${e.clientX - r.left}px`;
      dot.style.top = `${e.clientY - r.top}px`;
      btn.append(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    });
  }
}

export function initCopy(root: ParentNode): void {
  const announce = document.querySelector('[data-announce]');
  for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    const source = btn.parentElement?.querySelector('[data-copy-source]');
    btn.addEventListener('click', async () => {
      const text = source?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }
      btn.classList.add('is-done');
      btn.replaceChildren(iconSvg('check', 16, 2));
      if (announce) announce.textContent = 'Perintah disalin.';
      window.setTimeout(() => {
        btn.classList.remove('is-done');
        btn.replaceChildren(iconSvg('copy', 16));
      }, 1600);
    });
  }
}
