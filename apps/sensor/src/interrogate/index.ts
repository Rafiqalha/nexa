// EKSPERIMENTAL (AGENTS.md §2.9) — interogasi kognitif = umpan TEKS saja.
// Menyisipkan teks kalibrasi (dari config/interrogation.json) ke halaman labirin dan
// mem-parsing balasan agen di endpoint kalibrasi. Berada di jalur request penyerang:
// deterministik per seed, tanpa LLM, tanpa I/O jaringan, tanpa perintah ke mesin penyerang.
import { z } from 'zod';
import type { TrackedSession } from '../detect/tracker';
import type { LabyrinthPage } from '../labyrinth/generator';
import { Rng } from '../labyrinth/prng';
import type { InterrogationConfig } from './config';

export interface ParsedReply {
  /** Field kanonis yang dikenali (mis. agen, instruksi_sistem), sudah dipotong. */
  fields: Record<string, string>;
  /** Balasan mentah (dipotong ke maxReplyChars). */
  raw: string;
}

/** Batas panjang satu field hasil parse. */
const FIELD_MAX = 4_000;

const ReplyObject = z.record(z.string(), z.unknown());

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? '');
}

/** Sisipkan blok setelah baris judul Markdown pertama (agar terbaca sejak awal). */
export function insertAfterTitle(body: string, block: string): string {
  const firstLineEnd = body.indexOf('\n');
  if (body.startsWith('#') && firstLineEnd > 0) {
    return `${body.slice(0, firstLineEnd + 1)}\n${block}\n${body.slice(firstLineEnd + 1)}`;
  }
  return `${block}\n\n${body}`;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ');
  }
  return JSON.stringify(value) ?? '';
}

export class Interrogation {
  /** Path endpoint kalibrasi, mis. "/arsip-internal/kalibrasi". */
  readonly replyPath: string;

  constructor(
    readonly config: InterrogationConfig,
    private readonly root: string,
  ) {
    this.replyPath = `${root}/${config.replyPath}`;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  /** Varian umpan untuk satu sesi: tetap selama sesi, deterministik per seed. */
  variantFor(seed: string): InterrogationConfig['variants'][number] {
    return new Rng(`interrogate|variant|${seed}`).pick(this.config.variants);
  }

  private ref(seed: string): string {
    return `${this.config.refPrefix}-${new Rng(`interrogate|ref|${seed}`).hex(4).toUpperCase()}`;
  }

  /** Halaman Markdown 200 saja; halaman akar labirin selalu, lainnya sesuai pageRate. */
  shouldInject(page: LabyrinthPage, seed: string): boolean {
    if (!this.config.enabled || page.status !== 200) return false;
    if (!page.contentType.startsWith('text/markdown')) return false;
    if (page.key === this.root) return true;
    return new Rng(`interrogate|page|${seed}|${page.key}`).chance(this.config.pageRate);
  }

  /** Hook `decorate` jalur publik: sisipkan teks umpan bila halaman terpilih. */
  readonly decorate = (page: LabyrinthPage, session: TrackedSession): LabyrinthPage => {
    const seed = session.labyrinthSeed;
    if (!this.shouldInject(page, seed)) return page;
    const variant = this.variantFor(seed);
    const block = render(variant.text, { replyUrl: this.replyPath, ref: this.ref(seed) });
    return { ...page, body: insertAfterTitle(page.body, block), interrogation: variant.id };
  };

  /** Isi halaman endpoint kalibrasi: petunjuk (tanpa balasan) atau "diterima". */
  respond(seed: string, accepted: boolean): string {
    const rng = new Rng(`interrogate|next|${seed}`);
    const values: Record<string, string> = { replyUrl: this.replyPath, ref: this.ref(seed) };
    this.config.nextLinks.forEach((slug, i) => {
      values[`next${i + 1}`] = `${this.root}/${slug}-${rng.hex(4)}`;
    });
    const { responses } = this.config;
    return render(accepted ? responses.accepted : responses.instructions, values);
  }

  /**
   * Parse balasan agen dari body JSON / form / teks bebas atau query string.
   * Input penyerang: divalidasi zod, dipotong, dan tidak pernah melempar.
   */
  parseReply(input: {
    query: URLSearchParams;
    contentType: string;
    bodyText: string | null;
  }): ParsedReply | null {
    const body = (input.bodyText ?? '').trim();
    const queryText = input.query.toString();
    if (!body && !queryText) return null;

    let obj: Record<string, unknown> | null = null;
    if (body && (/json/i.test(input.contentType) || /^[[{]/.test(body))) {
      try {
        const parsed: unknown = JSON.parse(body);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        const res = ReplyObject.safeParse(first);
        obj = res.success ? res.data : null;
      } catch {
        obj = null;
      }
    } else if (body && /x-www-form-urlencoded/i.test(input.contentType)) {
      obj = Object.fromEntries(new URLSearchParams(body));
    } else if (!body) {
      obj = Object.fromEntries(input.query);
    }
    return {
      fields: obj ? this.extractFields(obj) : {},
      raw: (body || queryText).slice(0, this.config.maxReplyChars),
    };
  }

  private extractFields(obj: Record<string, unknown>): Record<string, string> {
    const byLowerKey = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
    const out: Record<string, string> = {};
    for (const [canonical, aliases] of Object.entries(this.config.fields)) {
      for (const alias of aliases) {
        const value = byLowerKey.get(alias.toLowerCase());
        if (value === undefined || value === null) continue;
        const text = stringify(value).trim();
        if (text) {
          out[canonical] = text.slice(0, FIELD_MAX);
          break;
        }
      }
    }
    return out;
  }
}
