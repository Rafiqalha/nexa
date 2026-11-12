// Angka hasil lab yang tampil di landing. Sumber: docs/metrics.json (median per run, sama
// dengan docs/metrics.md). `lab.test.ts` menghitung ulang dari JSON agar tidak pernah melenceng.
export const LAB_LABEL = 'Data simulasi lab';

export interface ModelResult {
  model: string;
  /** Permintaan agen yang sampai ke aplikasi asli, tanpa NEXA (median run baseline). */
  withoutNexa: number;
  /** Permintaan agen yang sampai ke aplikasi asli, dengan NEXA (median). */
  withNexa: number;
  /** Permintaan yang ditahan di labirin (median, dibulatkan). */
  heldRequests: number;
  /** Detik tertahan di labirin (median, dibulatkan). */
  heldSeconds: number;
  /** Token LLM yang dipakai NEXA untuk intelijen pasca-sesi (median per sesi). */
  intelTokens: number;
}

export const LAB = {
  models: [
    {
      model: 'deepseek-flash',
      withoutNexa: 58,
      withNexa: 2,
      heldRequests: 33,
      heldSeconds: 34,
      intelTokens: 3122,
    },
    {
      model: 'deepseek-v4-pro',
      withoutNexa: 77,
      withNexa: 2,
      heldRequests: 28,
      heldSeconds: 58,
      intelTokens: 2837,
    },
  ] satisfies ModelResult[],
  trapped: { runs: 11, total: 11 },
  /** Median detik sampai agen terjebak, 1 desimal. */
  timeToTrapSeconds: 1.8,
  humans: { flagged: 0, total: 14 },
  /** Estimasi token konten umpan per halaman labirin (median baitEstTokens / permintaan). */
  baitTokensPerPage: 600,
  /** Batas agen uji per run (lab/attacker-agent). */
  agentCap: { steps: 15, tokens: 250_000 },
} as const;
