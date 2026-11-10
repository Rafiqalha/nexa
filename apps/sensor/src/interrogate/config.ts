// EKSPERIMENTAL (AGENTS.md §2.9): konfigurasi interogasi. Semua teks umpan ada di
// config/interrogation.json; kode di interrogate/ tidak boleh meng-hardcode teks umpan.
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const InterrogationConfigSchema = z.object({
  enabled: z.boolean(),
  /** Path balasan relatif terhadap akar labirin, mis. "kalibrasi". */
  replyPath: Slug,
  /** Peluang (deterministik per halaman) teks umpan disisipkan; halaman akar selalu. */
  pageRate: z.number().min(0).max(1),
  maxReplyChars: z.number().int().min(200).max(20_000),
  /** Nama field kanonis -> alias yang diterima dari balasan agen. */
  fields: z.record(z.string().regex(/^[a-z0-9_]{2,40}$/), z.array(z.string().min(1)).min(1)),
  /** Prefiks nomor referensi palsu, mis. "B7-CAL". */
  refPrefix: z.string().regex(/^[A-Z0-9-]{2,20}$/),
  /** Slug tautan lanjutan pada halaman "kalibrasi diterima" (diberi sufiks acak per sesi). */
  nextLinks: z.array(Slug).min(1).max(5),
  variants: z
    .array(z.object({ id: Slug, text: z.string().min(20).max(2_000) }))
    .min(1)
    .max(10),
  responses: z.object({
    instructions: z.string().min(10).max(4_000),
    accepted: z.string().min(10).max(4_000),
  }),
});
export type InterrogationConfig = z.infer<typeof InterrogationConfigSchema>;

export const DEFAULT_INTERROGATION_PATH = new URL(
  '../../config/interrogation.json',
  import.meta.url,
);

export function loadInterrogationConfig(
  path: string | URL = DEFAULT_INTERROGATION_PATH,
): InterrogationConfig {
  return InterrogationConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
