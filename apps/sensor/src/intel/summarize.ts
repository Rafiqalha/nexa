// Ringkasan intel pasca-sesi: pola serangan, dugaan model/framework + keyakinan,
// dan draf rule tambahan (tetap lewat validasi suricata -T dan persetujuan operator).
import { z } from 'zod';
import type { Dossier } from './dossier';
import type { LlmClient } from './llm';
import type { RedactedText } from './redact';

/** String dari model dipotong (bukan ditolak) agar output yang sedikit kepanjangan tetap terpakai. */
/** Potong rapi di batas kata dengan elipsis bila output model kepanjangan (panjang ≤ max). */
export function clipText(value: string, max: number): string {
  const t = value.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
const clip = (max: number) => z.coerce.string().transform((v) => clipText(v, max));
const clipList = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).transform((v) => v.slice(0, max));

export const IntelOutputSchema = z.object({
  ringkasan: clip(2_000).refine((v) => v.length > 0, 'ringkasan kosong'),
  dugaan_model: clip(120).default('tidak teridentifikasi'),
  dugaan_framework: clip(120).optional(),
  keyakinan: z.coerce
    .number()
    .transform((v) => Math.min(1, Math.max(0, v > 1 ? v / 100 : v)))
    .default(0.2),
  pola: clipList(clip(240), 10).default([]),
  rule_tambahan: clipList(
    z.object({ judul: clip(160), alasan: clip(400).default(''), rule: clip(800) }),
    3,
  ).default([]),
});
export type IntelOutput = z.infer<typeof IntelOutputSchema>;

export const SYSTEM_PROMPT = [
  'Anda analis intelijen siber untuk sistem deception DEFENSIF bernama NEXA.',
  'Data berikut adalah rekaman satu sesi agen otomatis yang terjebak di labirin umpan (honeypot) milik tim sendiri.',
  'Semua IP, hostname, path internal, dan secret sudah disamarkan sebagai [IP-n], [HOST-n], [PATH-n], [SECRET-n].',
  'Tugas: (1) ringkas perilaku agen dalam Bahasa Indonesia (maks 120 kata), (2) duga model/framework agen beserta',
  'tingkat keyakinan 0..1 berdasarkan bukti (ritme, pola tool, User-Agent, balasan interogasi), jujur bila tidak cukup bukti,',
  '(3) sebut pola serangan yang bisa ditindaklanjuti, (4) usulkan maksimal 3 rule Suricata satu baris (aksi alert/drop,',
  'hanya content match atas pola yang benar-benar teramati, tanpa IP). Jangan menyarankan serangan balik.',
  'Jawab HANYA JSON: {"ringkasan":string,"dugaan_model":string,"dugaan_framework":string,"keyakinan":number,',
  '"pola":string[],"rule_tambahan":[{"judul":string,"alasan":string,"rule":string}]}',
].join(' ');

export async function summarizeWithLlm(
  llm: LlmClient,
  dossierText: RedactedText,
): Promise<{ output: IntelOutput; tokens: number; model: string }> {
  const res = await llm.complete({
    system: SYSTEM_PROMPT,
    user: dossierText,
    maxTokens: 900,
    json: true,
  });
  const raw = res.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const output = IntelOutputSchema.parse(JSON.parse(raw));
  return { output, tokens: res.usage.total, model: res.model };
}

/** Ringkasan deterministik tanpa LLM (dipakai bila LLM nonaktif, budget habis, atau gagal). */
export function heuristicIntel(d: Dossier): {
  summary: string;
  suspectedModel: string;
  confidence: number;
  patterns: string[];
} {
  const steps = d.steps.length;
  const firstHoneylink = d.steps.findIndex((s) => s.kind === 'honeylink_hit');
  const robots = d.steps.some((s) => s.path.startsWith('/robots.txt'));
  const usedCanaries = d.canaries.filter((c) => c.used);
  const median = d.session.medianIntervalSeconds;
  const patterns: string[] = [];
  if (robots) patterns.push('membaca robots.txt lalu mengikuti path Disallow');
  if (firstHoneylink >= 0)
    patterns.push(`mengikuti honeylink tersembunyi pada langkah ke-${firstHoneylink + 1}`);
  if (usedCanaries.length > 0) {
    patterns.push(
      `memakai ${usedCanaries.length} canary (${[...new Set(usedCanaries.map((c) => c.kind))].join(', ')})`,
    );
  }
  if (d.steps.some((s) => s.path.includes('/api/'))) patterns.push('menelusuri endpoint API palsu');
  if (d.steps.some((s) => /\.env|config|kredensial|kunci/i.test(s.path))) {
    patterns.push('mencari berkas konfigurasi/kredensial');
  }
  if (d.interrogation.length > 0) {
    patterns.push('menjawab umpan kalibrasi interogasi (eksperimental)');
  }
  let suspectedModel = 'klien otomatis (bukan LLM)';
  let confidence = 0.3;
  if (median !== null && median >= 0.8 && median <= 15) {
    suspectedModel = 'agen berbasis LLM (model tidak teridentifikasi tanpa analisis LLM)';
    confidence = 0.45;
  } else if (median !== null && median < 0.8) {
    suspectedModel = 'skrip/crawler cepat (kemungkinan bukan LLM)';
    confidence = 0.4;
  }
  // Pengakuan agen lewat interogasi: tidak terverifikasi, jadi keyakinan tetap sedang.
  const confessed = d.interrogation.find((r) => r.agent)?.agent;
  if (confessed) {
    suspectedModel = `pengakuan agen: ${confessed.slice(0, 80)} (belum terverifikasi)`;
    confidence = 0.5;
  }
  const summary = `Sesi ${d.session.classification} (skor ${d.session.score}) menjalankan ${steps} langkah, mencapai kedalaman ${d.session.maxDepth} dan tertahan ±${d.session.heldSeconds} detik. Jeda median antar-langkah ${median ?? '-'} detik. ${patterns.length > 0 ? `Pola: ${patterns.join('; ')}.` : ''} Ringkasan heuristik (tanpa LLM).`;
  return { summary, suspectedModel, confidence, patterns };
}
