// Memasang ikon Lucide ke elemen [data-icon]. Dekoratif: selalu aria-hidden.
import { ICONS, type IconName } from '../icons-data';

const SVG_NS = 'http://www.w3.org/2000/svg';

function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICONS, name);
}

export function iconSvg(name: IconName, size = 16, stroke = 1.75): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(stroke),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const [tag, nodeAttrs] of ICONS[name]) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(nodeAttrs)) child.setAttribute(k, v);
    svg.append(child);
  }
  return svg;
}

export function mountIcons(root: ParentNode): void {
  for (const host of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    const name = host.dataset.icon ?? '';
    if (!isIconName(name)) continue;
    host.setAttribute('aria-hidden', 'true');
    host.replaceChildren(
      iconSvg(name, Number(host.dataset.size ?? 16), Number(host.dataset.stroke ?? 1.75)),
    );
  }
}
