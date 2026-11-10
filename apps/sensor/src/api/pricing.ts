// Tabel harga (konfigurasi) untuk meteran biaya. Semua angka = ESTIMASI.
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const ModelPrice = z.object({
  inputUsdPerMTok: z.number().nonnegative(),
  outputUsdPerMTok: z.number().nonnegative(),
});

export const PricingSchema = z.object({
  source: z.string(),
  retrievedAt: z.string(),
  basis: z.string(),
  usdToIdr: z.number().positive(),
  usdToIdrNote: z.string(),
  attackerAssumedModel: z.string(),
  models: z.record(z.string(), ModelPrice),
});
export type Pricing = z.infer<typeof PricingSchema>;

export const DEFAULT_PRICING_PATH = new URL('../../config/pricing.json', import.meta.url);

export function loadPricing(path: string | URL = DEFAULT_PRICING_PATH): Pricing {
  return PricingSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Harga input (Rupiah per 1 juta token). Model tak dikenal / lokal -> 0. */
export function idrPerMTok(pricing: Pricing, model: string): number {
  const p = pricing.models[model];
  if (!p) return 0;
  return Math.round(p.inputUsdPerMTok * pricing.usdToIdr * 100) / 100;
}

export function tokensToIdr(tokens: number, pricePerMTokIdr: number): number {
  return Math.round(((tokens * pricePerMTokIdr) / 1_000_000) * 100) / 100;
}

/** Model yang dipakai NEXA sendiri: base URL non-DeepSeek (Ollama/vLLM) dianggap lokal. */
export function nexaPricingModel(baseUrl: string, model: string): string {
  try {
    const host = new URL(baseUrl).hostname;
    if (!host.endsWith('deepseek.com')) return 'local';
  } catch {
    return 'local';
  }
  return model || 'deepseek-flash';
}
