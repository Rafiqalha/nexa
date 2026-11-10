// SATU-SATUNYA pintu ke model (AGENTS.md §2.4). Hanya dipakai pasca-sesi oleh intel/queue.ts.
// - konten pengguna wajib bertipe RedactedText (hasil intel/redact.ts)
// - setiap panggilan diperiksa budget harian SEBELUM request dikirim
// - model-agnostic: baseURL dari env (DeepSeek, Ollama, vLLM, ...)
import OpenAI from 'openai';
import type { Logger } from '../logger';
import type { DailyBudget } from './budget';
import type { RedactedText } from './redact';

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface LlmRequest {
  /** Instruksi statis milik NEXA (tidak berisi data sesi). */
  system: string;
  /** Data sesi yang SUDAH disamarkan. */
  user: RedactedText;
  maxTokens: number;
  json?: boolean;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage: { prompt: number; completion: number; total: number };
}

export interface LlmDeps {
  budget: DailyBudget;
  logger: Logger;
  /** Disuntikkan test untuk memeriksa payload keluar tanpa jaringan. */
  fetch?: typeof fetch;
}

/** Estimasi kasar token sebelum panggilan (karakter / 3, konservatif). */
export function estimateRequestTokens(
  req: Pick<LlmRequest, 'system' | 'user' | 'maxTokens'>,
): number {
  return Math.ceil((req.system.length + req.user.length) / 3) + req.maxTokens;
}

export function isDeepSeek(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith('deepseek.com');
  } catch {
    return false;
  }
}

/** Model default bila LLM_MODEL kosong. */
export function effectiveModel(cfg: LlmConfig): string {
  if (cfg.model) return cfg.model;
  return isDeepSeek(cfg.baseUrl) ? 'deepseek-flash' : '';
}

export class LlmClient {
  private readonly client: OpenAI | null;
  readonly model: string;

  constructor(
    private readonly cfg: LlmConfig,
    private readonly deps: LlmDeps,
  ) {
    this.model = effectiveModel(cfg);
    this.client =
      cfg.apiKey && this.model
        ? new OpenAI({
            apiKey: cfg.apiKey,
            baseURL: cfg.baseUrl,
            timeout: 60_000,
            maxRetries: 1,
            ...(deps.fetch ? { fetch: deps.fetch } : {}),
          })
        : null;
  }

  /** false bila key/model tidak dikonfigurasi: intel jatuh ke ringkasan heuristik. */
  get enabled(): boolean {
    return this.client !== null;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.client) throw new Error('LLM tidak dikonfigurasi');
    this.deps.budget.reserve(estimateRequestTokens(req));
    const body = {
      model: this.model,
      messages: [
        { role: 'system' as const, content: req.system },
        { role: 'user' as const, content: req.user },
      ],
      max_tokens: req.maxTokens,
      ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
      // DeepSeek: ringkasan intel tidak butuh mode "thinking" (lebih hemat & cepat).
      ...(isDeepSeek(this.cfg.baseUrl) ? { thinking: { type: 'disabled' } } : {}),
    };
    const res = await this.client.chat.completions.create(
      body as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );
    const usage = {
      prompt: res.usage?.prompt_tokens ?? 0,
      completion: res.usage?.completion_tokens ?? 0,
      total: res.usage?.total_tokens ?? 0,
    };
    this.deps.budget.commit(usage.total || estimateRequestTokens(req));
    this.deps.logger.info('llm call', { model: this.model, tokens: usage.total });
    return { text: res.choices[0]?.message?.content ?? '', model: res.model || this.model, usage };
  }
}
