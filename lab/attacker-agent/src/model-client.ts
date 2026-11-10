// Klien chat-completions OpenAI-compatible yang minimal (fetch, tanpa SDK).
// Khusus agen lab; sensor memakai intel/llm.ts sebagai satu-satunya pintu ke model.
import { z } from 'zod';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  message: ChatMessage;
  usage: Usage;
  finishReason: string | null;
}

export interface ChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: readonly unknown[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type ChatFn = (opts: ChatOptions) => Promise<ChatResult>;

const ResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                type: z.literal('function').optional(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

export const chatCompletion: ChatFn = async (opts) => {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 1_024,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const parsed = ResponseSchema.parse(await res.json());
  const choice = parsed.choices[0];
  if (!choice) throw new Error('respons LLM tanpa choices');
  const toolCalls = (choice.message.tool_calls ?? []).map((t) => ({
    id: t.id,
    type: 'function' as const,
    function: t.function,
  }));
  // reasoning_content (model "thinking") sengaja tidak disimpan/dikirim ulang.
  return {
    message: {
      role: 'assistant',
      content: choice.message.content ?? null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    usage: {
      promptTokens: parsed.usage?.prompt_tokens ?? 0,
      completionTokens: parsed.usage?.completion_tokens ?? 0,
      totalTokens: parsed.usage?.total_tokens ?? 0,
    },
    finishReason: choice.finish_reason ?? null,
  };
};
