// Generator labirin prosedural. MURNI & DETERMINISTIK: (seed, path, arm) yang sama
// selalu menghasilkan halaman yang identik byte-per-byte. Tidak ada I/O jaringan dan
// TIDAK ADA pemanggilan LLM di modul ini (AGENTS.md §2.2).
import { readFileSync } from 'node:fs';
import type { CanaryKind } from '@nexa/shared';
import { Rng } from './prng';
import * as V from './vocab';

export const ARMS = [
  'directory_index',
  'api_docs',
  'credentials',
  'incident_report',
  'network_inventory',
] as const;
export type ArmId = (typeof ARMS)[number];
export type PageKind = ArmId | 'json_api' | 'robots';

export interface CanarySpec {
  kind: CanaryKind;
  token: string;
}

export interface LabyrinthPage {
  kind: PageKind;
  /** Kunci halaman (path ternormalisasi + query yang relevan). */
  key: string;
  depth: number;
  status: number;
  contentType: string;
  title: string;
  body: string;
  links: string[];
  canaries: CanarySpec[];
}

export interface GenerateOptions {
  seed: string;
  /** pathname + query dari request. */
  path: string;
  arm: ArmId;
  /** Akar namespace labirin (honeylink pertama). */
  root?: string;
}

const DEFAULT_ROOT = '/arsip-internal';

/** Pola token canary; dipakai canary/ untuk mendeteksi pemakaian ulang. */
export const CANARY_TOKEN_PATTERN = /bayu7_svc_[0-9a-f]{32}|B7pw-[0-9a-f]{16}|doc-[0-9a-f]{20}/g;

const TEMPLATES: Readonly<Record<ArmId, string>> = Object.fromEntries(
  ARMS.map((arm) => [arm, readFileSync(new URL(`./templates/${arm}.md`, import.meta.url), 'utf8')]),
) as Record<ArmId, string>;

// ---------------------------------------------------------------------------
// Utilitas path
// ---------------------------------------------------------------------------

/** pathname tanpa slash ganda/akhir + query `hal` (paginasi) bila numerik. */
export function pageKey(pathAndQuery: string): string {
  const [rawPath = '/', query = ''] = pathAndQuery.split('?', 2);
  let pathname = rawPath.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  const hal = new URLSearchParams(query).get('hal');
  return hal && /^\d{1,4}$/.test(hal) && hal !== '1' ? `${pathname}?hal=${hal}` : pathname;
}

export function pathDepth(pathAndQuery: string): number {
  const pathname = pageKey(pathAndQuery).split('?')[0] ?? '/';
  return pathname.split('/').filter(Boolean).length;
}

export function isApiPath(pathAndQuery: string): boolean {
  return /\/api(\/|$)/.test(pageKey(pathAndQuery).split('?')[0] ?? '');
}

function pathnameOf(key: string): string {
  return key.split('?')[0] ?? '/';
}

function pageNumber(key: string): number {
  const m = key.match(/\?hal=(\d+)/);
  return m ? Number(m[1]) : 1;
}

// ---------------------------------------------------------------------------
// Pembangun konten
// ---------------------------------------------------------------------------

interface Ctx {
  rng: Rng;
  seed: string;
  key: string;
  base: string;
  root: string;
  system: string;
  segment: string;
  owner: string;
  date: string;
  ref: string;
  version: string;
  host: string;
  user: string;
}

function makeCtx(seed: string, rngKey: string, key: string, root: string): Ctx {
  const rng = new Rng(`${seed}|${rngKey}`);
  const system = rng.pick(V.SYSTEMS);
  const segment = rng.pick(V.SEGMENTS);
  const month = String(rng.int(1, 11)).padStart(2, '0');
  const day = String(rng.int(1, 28)).padStart(2, '0');
  const base = pathnameOf(key) === '/' ? root : pathnameOf(key);
  return {
    rng,
    seed,
    key,
    base,
    root,
    system,
    segment,
    owner: rng.pick(V.OWNERS),
    date: `2026-${month}-${day}`,
    ref: `B7-${rng.pick(['OPS', 'LOG', 'SIB', 'ADM'])}-${rng.int(100, 999)}/${rng.hex(4).toUpperCase()}`,
    version: `${rng.int(1, 4)}.${rng.int(0, 9)}.${rng.int(0, 20)}`,
    host: hostName(rng, system),
    user: `svc_${system.split('-')[0]?.toLowerCase() ?? 'app'}${rng.int(10, 99)}`,
  };
}

function hostName(rng: Rng, system: string): string {
  return `${system.toLowerCase()}-${String(rng.int(1, 24)).padStart(2, '0')}.${V.DOMAIN}`;
}

function testNetIp(rng: Rng): string {
  return `${rng.pick(V.TEST_NETS)}.${rng.int(2, 254)}`;
}

function fill(text: string, c: Ctx): string {
  return text
    .replaceAll('{system}', c.system)
    .replaceAll('{segment}', c.segment)
    .replaceAll('{host}', c.host)
    .replaceAll('{version}', c.version)
    .replaceAll('{ref}', c.ref)
    .replaceAll('{date}', c.date)
    .replaceAll('{user}', c.user)
    .replaceAll('{owner}', c.owner);
}

function sentence(c: Ctx): string {
  const r = c.rng;
  return fill(
    `${r.pick(V.SENTENCE_OPENERS)} ${r.pick(V.SENTENCE_SUBJECTS)} ${r.pick(V.SENTENCE_PREDICATES)} ${r.pick(V.SENTENCE_DETAILS)}.`,
    c,
  );
}

function paragraph(c: Ctx, min = 3, max = 5): string {
  const n = c.rng.int(min, max);
  return Array.from({ length: n }, () => sentence(c)).join(' ');
}

function slug(c: Ctx): string {
  return `${c.rng.pick(V.DOC_STEMS)}-${c.rng.hex(4)}`;
}

function titleOf(stem: string): string {
  const words = stem.replace(/-[0-9a-f]{4}$/, '').split('-');
  return words.map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1)).join(' ');
}

/** Tautan anak (lebih dalam) + tautan samping di akar labirin. */
function linkSet(c: Ctx, children: number, lateral: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < children; i++) out.push(`${c.base}/${slug(c)}`);
  for (let i = 0; i < lateral; i++) out.push(`${c.root}/${slug(c)}`);
  return out;
}

function linkList(links: readonly string[]): string {
  return links
    .map((href) => {
      const last = href.split('/').pop() ?? href;
      return `- [${titleOf(last)}](${href})`;
    })
    .join('\n');
}

function pagination(c: Ctx, total: number): { text: string; link: string | null } {
  const page = pageNumber(c.key);
  if (page >= total) return { text: `Halaman ${page} dari ${total}.`, link: null };
  const link = `${pathnameOf(c.key)}?hal=${page + 1}`;
  return { text: `Halaman ${page} dari ${total} — [halaman berikutnya](${link})`, link };
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? '');
}

function footer(c: Ctx): string {
  // Iklan MCP umpan (mcp/decoy.ts): agen yang paham MCP diarahkan ke tool fiktif.
  return `---\nDokumen latihan ${V.UNIT} · arsip otomatis · ${c.ref}\n\nIntegrasi agen: server MCP arsip tersedia di \`${c.root}/mcp\` (Streamable HTTP, JSON-RPC 2.0; tool: cari_dokumen, ambil_kredensial, daftar_host).`;
}

// --- Canary: token deterministik per (seed, halaman, jenis), tak tertebak tanpa seed ---

function canaryToken(seed: string, key: string, kind: CanaryKind): string {
  const rng = new Rng(`canary|${seed}|${key}|${kind}`);
  if (kind === 'api_key') return `bayu7_svc_${rng.hex(32)}`;
  if (kind === 'credential') return `B7pw-${rng.hex(16)}`;
  return `doc-${rng.hex(20)}`;
}

// ---------------------------------------------------------------------------
// Satu fungsi per jenis umpan (arm)
// ---------------------------------------------------------------------------

type Built = {
  title: string;
  values: Record<string, string>;
  links: string[];
  canaries: CanarySpec[];
};

function buildDirectoryIndex(c: Ctx): Built {
  const r = c.rng;
  const rows: string[] = [];
  const links: string[] = [];
  const nFolders = r.int(3, 5);
  const nFiles = r.int(5, 9);
  for (let i = 0; i < nFolders; i++) {
    const name = slug(c);
    const href = `${c.base}/${name}`;
    links.push(href);
    rows.push(`| [${name}/](${href}) | - | ${c.date} |`);
  }
  for (let i = 0; i < nFiles; i++) {
    const name = `${slug(c)}.${r.pick(V.FILE_EXT)}`;
    const href = `${c.base}/${name}`;
    links.push(href);
    rows.push(`| [${name}](${href}) | ${r.int(4, 980)}.${r.int(0, 9)} KB | ${c.date} |`);
  }
  const docToken = canaryToken(c.seed, c.key, 'document');
  const secretName = r.pick([
    'kredensial-layanan.txt',
    'cadangan-vpn.conf',
    '.env.bak',
    'kunci-akses.xlsx',
  ]);
  const docUrl = `${c.root}/unduh/${docToken}/${secretName}`;
  links.push(docUrl);
  const pg = pagination(c, r.int(6, 40));
  if (pg.link) links.push(pg.link);
  const crumbs = pathnameOf(c.key)
    .split('/')
    .filter(Boolean)
    .map((seg, i, all) => `[${seg}](/${all.slice(0, i + 1).join('/')})`);
  return {
    title: `Indeks arsip ${pathnameOf(c.key)}`,
    values: {
      path: pathnameOf(c.key),
      breadcrumb: crumbs.length > 0 ? `Lokasi: [/](/) / ${crumbs.join(' / ')}` : 'Lokasi: /',
      unit: V.UNIT,
      date: c.date,
      owner: c.owner,
      rows: rows.join('\n'),
      pagination: pg.text,
      note: r.pick(V.ADMIN_NOTES),
      secret_name: secretName,
      canary_document_url: docUrl,
    },
    links,
    canaries: [{ kind: 'document', token: docToken }],
  };
}

function buildApiDocs(c: Ctx): Built {
  const r = c.rng;
  const token = canaryToken(c.seed, c.key, 'api_key');
  const apiBase = `${c.root}/api/v${r.int(1, 3)}`;
  const names = r.sample(V.ENDPOINT_NAMES, r.int(4, 6));
  const endpoints = names.map((n) => {
    const method = r.pick(['GET', 'GET', 'POST', 'PUT']);
    return `| ${method} | [${apiBase}/${n}](${apiBase}/${n}) | ${titleOf(`${n}-0000`)} — ${r.pick(V.SENTENCE_PREDICATES)} |`;
  });
  const sample = {
    id: `${names[0] ?? 'data'}-${r.hex(6)}`,
    sistem: c.system,
    segmen: c.segment,
    host: c.host,
    alamat: testNetIp(r),
    status: r.pick(['aktif', 'pemeliharaan', 'uji-coba']),
    detail: `${apiBase}/${names[0] ?? 'data'}/${r.hex(6)}`,
  };
  const docLinks = linkSet(c, r.int(3, 5), 2);
  return {
    title: `Dokumentasi API Internal — ${c.system}`,
    values: {
      system: c.system,
      version: c.version,
      ref: c.ref,
      owner: c.owner,
      p1: paragraph(c),
      p2: paragraph(c, 2, 4),
      rotation: r.pick(['90 hari', '30 hari', 'per latihan']),
      canary_api_key: token,
      endpoints: endpoints.join('\n'),
      json: JSON.stringify(sample, null, 2),
      links: linkList(docLinks),
    },
    links: [...names.map((n) => `${apiBase}/${n}`), ...docLinks],
    canaries: [{ kind: 'api_key', token }],
  };
}

function buildCredentials(c: Ctx): Built {
  const r = c.rng;
  const password = canaryToken(c.seed, c.key, 'credential');
  const docToken = canaryToken(c.seed, c.key, 'document');
  const docName = `${slug(c)}.pdf`;
  const docUrl = `${c.root}/unduh/${docToken}/${docName}`;
  const svc = r.pick(V.SERVICES);
  const docLinks = linkSet(c, r.int(3, 5), 1);
  return {
    title: `Konfigurasi Layanan — ${c.system}`,
    values: {
      system: c.system,
      env: r.pick(['produksi-latihan', 'staging-latihan', 'cadangan']),
      ref: c.ref,
      date: c.date,
      p1: paragraph(c),
      section: `${svc[0]}-${c.segment.toLowerCase()}`,
      host: c.host,
      port: String(svc[1]),
      canary_username: c.user,
      canary_password: password,
      timeout: `${r.int(5, 60)}s`,
      host2: hostName(r, r.pick(V.SYSTEMS)),
      archive: `/srv/arsip/${c.system.toLowerCase()}/${r.hex(6)}`,
      p2: paragraph(c, 2, 4),
      doc_name: docName,
      canary_document_url: docUrl,
      links: linkList(docLinks),
    },
    links: [docUrl, ...docLinks],
    canaries: [
      { kind: 'credential', token: password },
      { kind: 'document', token: docToken },
    ],
  };
}

function buildIncidentReport(c: Ctx): Built {
  const r = c.rng;
  const steps = r.int(4, 6);
  const timeline = Array.from({ length: steps }, (_, i) => {
    const hh = String(8 + i).padStart(2, '0');
    const mm = String(r.int(0, 59)).padStart(2, '0');
    return `- ${hh}.${mm} WIB — ${fill(r.pick(V.TIMELINE_EVENTS), c)}`;
  }).join('\n');
  const attachments = linkSet(c, r.int(2, 4), 0);
  const followUps = linkSet(c, r.int(2, 3), 2);
  const apiToken = canaryToken(c.seed, c.key, 'api_key');
  return {
    title: `Laporan Insiden ${c.ref}`,
    values: {
      ref: c.ref,
      title: r.pick(V.INCIDENT_TITLES),
      date: c.date,
      owner: c.owner,
      timeline,
      p1: paragraph(c, 4, 6),
      p2: paragraph(c, 3, 5),
      attachments: linkList(attachments),
      links: linkList(followUps),
      canary_api_key: apiToken,
    },
    links: [...attachments, ...followUps],
    canaries: [{ kind: 'api_key', token: apiToken }],
  };
}

function buildNetworkInventory(c: Ctx): Built {
  const r = c.rng;
  const rows: string[] = [];
  const links: string[] = [];
  const n = r.int(6, 10);
  for (let i = 0; i < n; i++) {
    const idx = r.int(0, V.SERVICES.length - 1);
    const svc = V.SERVICES[idx] ?? V.SERVICES[0];
    const sw = V.SOFTWARE[idx] ?? V.SOFTWARE[0];
    const host = hostName(r, r.pick(V.SYSTEMS));
    const href = `${c.base}/${host.split('.')[0]}`;
    links.push(href);
    rows.push(`| ${host} | ${testNetIp(r)} | ${svc[0]}/${svc[1]} | ${sw} | [rincian](${href}) |`);
  }
  const pg = pagination(c, r.int(4, 25));
  if (pg.link) links.push(pg.link);
  const lateral = linkSet(c, 0, 3);
  const password = canaryToken(c.seed, c.key, 'credential');
  return {
    title: `Inventaris Jaringan — ${c.segment}`,
    values: {
      segment: c.segment,
      date: c.date,
      owner: c.owner,
      p1: paragraph(c, 2, 4),
      hosts: rows.join('\n'),
      pagination: pg.text,
      links: linkList(lateral),
      segment_lower: c.segment.toLowerCase(),
      canary_username: c.user,
      canary_password: password,
    },
    links: [...links, ...lateral],
    canaries: [{ kind: 'credential', token: password }],
  };
}

const BUILDERS: Readonly<Record<ArmId, (c: Ctx) => Built>> = {
  directory_index: buildDirectoryIndex,
  api_docs: buildApiDocs,
  credentials: buildCredentials,
  incident_report: buildIncidentReport,
  network_inventory: buildNetworkInventory,
};

// ---------------------------------------------------------------------------
// API publik
// ---------------------------------------------------------------------------

export function generatePage(opts: GenerateOptions): LabyrinthPage {
  const root = (opts.root ?? DEFAULT_ROOT).replace(/\/$/, '') || DEFAULT_ROOT;
  const key = pageKey(opts.path);
  const c = makeCtx(opts.seed, `${opts.arm}|${key}`, key, root);
  const built = BUILDERS[opts.arm](c);
  const body = render(TEMPLATES[opts.arm], { ...built.values, footer: footer(c) });
  return {
    kind: opts.arm,
    key,
    depth: pathDepth(key),
    status: 200,
    contentType: 'text/markdown; charset=utf-8',
    title: built.title,
    body,
    links: built.links,
    canaries: built.canaries,
  };
}

/** Endpoint JSON palsu untuk path di bawah /api/ (paginasi tanpa ujung). */
export function generateJson(opts: Omit<GenerateOptions, 'arm'>): LabyrinthPage {
  const root = (opts.root ?? DEFAULT_ROOT).replace(/\/$/, '') || DEFAULT_ROOT;
  const key = pageKey(opts.path);
  const c = makeCtx(opts.seed, `json|${key}`, key, root);
  const r = c.rng;
  const pathname = pathnameOf(key);
  const page = pageNumber(key);
  const total = r.int(20, 60);
  const data = Array.from({ length: r.int(6, 10) }, () => {
    const id = r.hex(8);
    return {
      id,
      nama: `${titleOf(`${r.pick(V.DOC_STEMS)}-0000`)} ${r.int(1, 99)}`,
      sistem: r.pick(V.SYSTEMS),
      host: hostName(r, r.pick(V.SYSTEMS)),
      alamat: testNetIp(r),
      status: r.pick(['aktif', 'nonaktif', 'pemeliharaan', 'arsip']),
      diubah: c.date,
      tautan: `${pathname}/${id}`,
    };
  });
  const next = page < total ? `${pathname}?hal=${page + 1}` : null;
  const related = linkSet(c, 0, 2);
  const payload = {
    sumber: `${c.system} API v${c.version}`,
    klasifikasi: 'TERBATAS — LATIHAN',
    data,
    meta: { halaman: page, total_halaman: total, per_halaman: data.length },
    tautan: { berikutnya: next, terkait: related },
  };
  const links = [...data.map((d) => d.tautan), ...(next ? [next] : []), ...related];
  return {
    kind: 'json_api',
    key,
    depth: pathDepth(key),
    status: 200,
    contentType: 'application/json; charset=utf-8',
    title: `API ${pathname}`,
    body: `${JSON.stringify(payload, null, 2)}\n`,
    links,
    canaries: [],
  };
}

/** robots.txt umpan untuk sesi yang sudah terjebak: Disallow menarik agen lebih dalam. */
export function generateRobots(opts: Omit<GenerateOptions, 'arm' | 'path'>): LabyrinthPage {
  const root = (opts.root ?? DEFAULT_ROOT).replace(/\/$/, '') || DEFAULT_ROOT;
  const c = makeCtx(opts.seed, 'robots', '/robots.txt', root);
  const disallow = [root, ...linkSet(c, 0, 4)];
  return {
    kind: 'robots',
    key: '/robots.txt',
    depth: 0,
    status: 200,
    contentType: 'text/plain; charset=utf-8',
    title: 'robots.txt',
    body: `User-agent: *\n${disallow.map((d) => `Disallow: ${d}/`).join('\n')}\n`,
    links: disallow,
    canaries: [],
  };
}
