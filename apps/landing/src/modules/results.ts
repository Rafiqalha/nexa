// FIG. 09 Hasil lab sebagai bagan satuan: satu sel = satu permintaan HTTP agen, berurutan
// seperti terjadi. Tanpa NEXA semua sel sampai ke aplikasi asli; dengan NEXA hanya beberapa
// permintaan pertama (sebelum terdeteksi) yang sampai, sisanya tertahan di labirin. Sel terisi
// berurutan saat terlihat dan angka menghitung naik. Semua angka dari content/lab.ts (sama
// dengan docs/metrics.json, dijaga test).
import { LAB } from '../content/lab';
import { countUp, formatNumber, inView } from '../lib/motion';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function counter(value: number, decimals = 0, className = 'num'): HTMLSpanElement {
  const span = el('span', className, formatNumber(value, decimals));
  span.dataset.countTo = String(value);
  span.dataset.decimals = String(decimals);
  return span;
}

function legend(): HTMLParagraphElement {
  const p = el('p', 'legend');
  for (const [cls, text] of [
    ['cell', 'sampai ke aplikasi asli'],
    ['cell is-held', 'ditahan di labirin'],
  ] as const) {
    const item = el('span', 'legend__item');
    item.append(el('span', cls), el('span', '', text));
    p.append(item);
  }
  return p;
}

export function initResults(bars: HTMLElement, stats: HTMLElement): void {
  const max = Math.max(...LAB.models.flatMap((m) => [m.withoutNexa, m.withNexa + m.heldRequests]));
  bars.append(legend());
  let order = 0;
  for (const m of LAB.models) {
    const group = el('div', 'bar-group');
    group.append(el('p', 'bar-group__model', m.model));
    for (const [label, reached, held] of [
      ['Tanpa NEXA', m.withoutNexa, 0],
      ['Dengan NEXA', m.withNexa, m.heldRequests],
    ] as const) {
      const row = el('div', 'bar-row');
      const cells = el('span', 'cells');
      cells.style.setProperty('--cols-1', String(max));
      cells.style.setProperty('--cols-2', String(Math.ceil(max / 2)));
      cells.setAttribute('role', 'img');
      cells.setAttribute(
        'aria-label',
        held > 0
          ? `${label}: ${reached} permintaan sampai ke aplikasi asli, ${held} ditahan di labirin`
          : `${label}: ${reached} permintaan sampai ke aplikasi asli`,
      );
      for (let i = 0; i < reached + held; i++) {
        const cell = el('span', i < reached ? 'cell' : 'cell is-held');
        cell.style.setProperty('--i', String(i));
        cells.append(cell);
      }
      cells.style.setProperty('--row', String(order++));
      row.append(el('span', '', label), cells, counter(reached, 0, 'bar-row__num'));
      group.append(row);
    }
    group.append(
      el(
        'p',
        'bar-group__note',
        `${m.heldRequests} permintaan ditahan di labirin · ${m.heldSeconds} dtk tertahan`,
      ),
    );
    bars.append(group);
  }

  const items: Array<[string, HTMLElement, string?]> = [
    ['Run agen dijebak', counter(LAB.trapped.runs), `/${LAB.trapped.total}`],
    ['Sampai terjebak (median)', counter(LAB.timeToTrapSeconds, 1), ' dtk'],
    ['False-positive manusia (simulasi)', counter(LAB.humans.flagged), `/${LAB.humans.total}`],
    ['Token LLM NEXA selama agen tertahan', counter(0)],
  ];
  for (const [label, value, suffix] of items) {
    const wrap = el('div');
    const dd = el('dd');
    dd.append(value);
    if (suffix) dd.append(el('small', '', suffix));
    wrap.append(el('dt', '', label), dd);
    stats.append(wrap);
  }

  const run = (root: HTMLElement) => {
    for (const n of root.querySelectorAll<HTMLElement>('[data-count-to]')) {
      countUp(n, Number(n.dataset.countTo), Number(n.dataset.decimals ?? 0));
    }
  };
  inView(bars, () => {
    bars.classList.add('is-in');
    run(bars);
  });
  inView(stats, () => run(stats));
}
