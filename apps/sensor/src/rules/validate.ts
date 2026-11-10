// Validasi sintaks draf rule dengan `suricata -T` (FR-16) sebelum ditampilkan sebagai siap.
import { type SuricataRunner, SuricataUnavailableError } from './suricata';

export interface ValidationResult {
  /** true = lolos suricata -T; false = ditolak; null = Suricata tidak tersedia. */
  syntaxValid: boolean | null;
  output: string;
}

export async function validateRule(
  runner: SuricataRunner,
  body: string,
): Promise<ValidationResult> {
  try {
    const r = await runner.validate(body);
    return { syntaxValid: r.ok, output: r.output };
  } catch (err) {
    if (err instanceof SuricataUnavailableError) return { syntaxValid: null, output: err.message };
    return { syntaxValid: null, output: `validasi gagal dijalankan: ${(err as Error).message}` };
  }
}
