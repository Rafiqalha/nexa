// Mode scripted (tanpa LLM): kebijakan deterministik yang meniru agen penjelajah.
// Dipakai untuk CI/demo offline. Bukan AI: dilabeli "scripted" di setiap laporan.
import type { RunResult } from './agent';
import { newMissionId } from './agent';
import type { AgentConfig } from './config';
import type { HttpTools } from './tools';

const KEYWORDS = [
  'internal',
  'arsip',
  'rahasia',
  'kredensial',
  'credential',
  'password',
  'sandi',
  'akun',
  'api',
  'config',
  'konfigurasi',
  'vpn',
  'kunci',
  'backup',
  'cadangan',
  'admin',
  'svc',
  'unduh',
];

export function extractLinks(text: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const patterns = [/href="([^"#]+)"/g, /\]\(([^)\s#]+)\)/g, /^Disallow:\s*(\S+)/gm];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      if (!raw) continue;
      try {
        out.add(new URL(raw, baseUrl).toString());
      } catch {
        // abaikan tautan rusak
      }
    }
  }
  return [...out];
}

export function priorityOf(url: string): number {
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname).toLowerCase();
  let score = 0;
  for (const k of KEYWORDS) if (path.includes(k)) score += 2;
  score += path.split('/').filter(Boolean).length * 0.3;
  if (/\.(css|js|png|jpe?g|ico|svg)$/.test(path)) score -= 10;
  return score;
}

export function findCredentials(text: string): { username: string; password: string } | null {
  const m = text.match(/username\s*=\s*(\S+)[\s\S]{0,200}?password\s*=\s*(\S+)/);
  return m?.[1] && m[2] ? { username: m[1], password: m[2] } : null;
}

export function findBearer(text: string): string | null {
  return text.match(/Authorization:\s*Bearer\s+(\S+)/)?.[1] ?? null;
}

export async function runScriptedAgent(
  cfg: AgentConfig,
  tools: HttpTools,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<RunResult> {
  const started = Date.now();
  const origin = new URL(cfg.target).origin;
  const frontier = new Map<string, number>();
  const visited = new Set<string>();
  const push = (url: string, prio: number) => {
    if (new URL(url).origin !== origin || visited.has(url)) return;
    frontier.set(url, Math.max(frontier.get(url) ?? Number.NEGATIVE_INFINITY, prio));
  };
  push(cfg.target, 100);
  push(`${origin}/robots.txt`, 99);

  let steps = 0;
  let toolCalls = 0;
  let stopReason: RunResult['stopReason'] = 'max_steps';
  const triedCreds = new Set<string>();
  const queued: Array<{
    method: string;
    url: string;
    body?: string;
    headers?: Record<string, string>;
  }> = [];

  while (steps < cfg.maxSteps) {
    let action = queued.shift();
    if (!action) {
      let best: string | null = null;
      let bestPrio = Number.NEGATIVE_INFINITY;
      for (const [url, prio] of frontier) {
        if (prio > bestPrio) {
          best = url;
          bestPrio = prio;
        }
      }
      if (!best) {
        stopReason = 'no_more_links';
        break;
      }
      frontier.delete(best);
      action = { method: 'GET', url: best };
    }
    steps += 1;
    toolCalls += 1;
    visited.add(action.url);
    const res = await tools.httpRequest(action);
    const id = typeof res.response_id === 'string' ? res.response_id : null;
    if (id) {
      toolCalls += 1;
      tools.readResponse({ response_id: id });
      const text = tools.fullText(id);
      for (const link of extractLinks(text, action.url)) push(link, priorityOf(link));
      const creds = findCredentials(text);
      if (creds && !triedCreds.has(creds.password)) {
        triedCreds.add(creds.password);
        queued.push({
          method: 'POST',
          url: `${origin}/login`,
          body: new URLSearchParams(creds).toString(),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        });
      }
      const bearer = findBearer(text);
      if (bearer && !triedCreds.has(bearer)) {
        triedCreds.add(bearer);
        const api = extractLinks(text, action.url).find((l) => l.includes('/api/'));
        if (api)
          queued.push({ method: 'GET', url: api, headers: { authorization: `Bearer ${bearer}` } });
      }
    }
    if (cfg.stepDelayMs > 0) await sleep(cfg.stepDelayMs);
  }

  return {
    mode: 'scripted',
    model: null,
    target: cfg.target,
    baseline: cfg.baseline,
    label: cfg.label,
    missionId: newMissionId(),
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    steps,
    toolCalls,
    llm: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    stopReason,
    finalAnswer: null,
    error: null,
    tools: tools.stats,
  };
}
