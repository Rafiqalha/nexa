import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runLlmAgent } from './agent';
import { assertAllowed, parseAllowlist, TargetNotAllowedError } from './allowlist';
import { loadAgentConfig, readLabEnvFile } from './config';
import type { ChatFn } from './model-client';
import { HttpTools } from './tools';

const ALLOW = parseAllowlist('sensor:8080,target-app:3000');

describe('allowlist agen uji (AGENTS.md §2.7)', () => {
  it('menerima target lab yang terdaftar', () => {
    expect(assertAllowed('http://sensor:8080/arsip-internal/', ALLOW).pathname).toBe(
      '/arsip-internal/',
    );
    expect(assertAllowed('http://target-app:3000/', ALLOW).host).toBe('target-app:3000');
  });

  it.each([
    ['host lain', 'http://example.com/'],
    ['port lain di host lab', 'http://sensor:22/'],
    ['port default 80', 'http://sensor/'],
    ['host mirip (subdomain)', 'http://sensor.evil.test:8080/'],
    ['host mirip (prefix)', 'http://evil-sensor:8080/'],
    ['IP meski menunjuk ke lab', 'http://127.0.0.1:8080/'],
    ['metadata cloud', 'http://169.254.169.254/latest/meta-data/'],
    ['skema file', 'file:///etc/passwd'],
    ['skema ftp', 'ftp://sensor:8080/'],
    ['kredensial tertanam', 'http://user:pass@sensor:8080/'],
    ['URL rusak', 'not a url'],
  ])('menolak %s', (_label, url) => {
    expect(() => assertAllowed(url, ALLOW)).toThrow(TargetNotAllowedError);
  });

  it('entri tanpa port mengizinkan port mana pun di host itu saja', () => {
    const allow = parseAllowlist('target-app');
    expect(() => assertAllowed('http://target-app:3000/', allow)).not.toThrow();
    expect(() => assertAllowed('http://other:3000/', allow)).toThrow(TargetNotAllowedError);
  });

  it('allowlist kosong/tidak valid membuat agen menolak berjalan', () => {
    expect(() => parseAllowlist('')).toThrow();
    expect(() => parseAllowlist('http://x/')).toThrow();
  });
});

describe('http tool menolak SEBELUM request dikirim', () => {
  it('fetch tidak pernah dipanggil untuk host di luar allowlist', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const tools = new HttpTools({ allow: ALLOW, fetchImpl: fetchSpy });
    const r = await tools.httpRequest({ url: 'http://example.com/secret' });
    expect(r.error).toMatch(/di luar LAB_TARGET_ALLOWLIST/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tools.stats.rejected).toBe(1);
    expect(tools.stats.requests).toBe(0);
  });

  it('metode di luar GET/POST/HEAD ditolak', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const tools = new HttpTools({ allow: ALLOW, fetchImpl: fetchSpy });
    const r = await tools.httpRequest({ method: 'DELETE', url: 'http://sensor:8080/x' });
    expect(r.error).toMatch(/metode DELETE/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('header penyamaran dibuang, redirect tidak diikuti otomatis', async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () => new Response('', { status: 302, headers: { location: 'http://example.com/' } }),
    );
    const tools = new HttpTools({ allow: ALLOW, fetchImpl: fetchSpy });
    const r = await tools.httpRequest({
      url: 'http://sensor:8080/x',
      headers: { 'X-Forwarded-For': '1.2.3.4', Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.redirect).toBe('manual');
    expect(init?.headers).toEqual({ accept: 'text/html' });
    expect(r.location).toBe('http://example.com/');
    // Mengikuti redirect ke luar lab tetap ditolak oleh allowlist.
    const follow = await tools.httpRequest({ url: String(r.location) });
    expect(follow.error).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('konfigurasi agen', () => {
  it('target awal di luar allowlist -> gagal saat start', () => {
    expect(() =>
      loadAgentConfig({
        ATTACKER_TARGET_URL: 'http://example.com/',
        LAB_TARGET_ALLOWLIST: 'sensor:8080',
      }),
    ).toThrow(TargetNotAllowedError);
  });

  it('.env lokal hanya menyumbang kunci ATTACKER_* dan LAB_TARGET_ALLOWLIST (secret sensor tidak ikut)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexa-agent-'));
    const file = join(dir, '.env');
    writeFileSync(
      file,
      'DEEPSEEK_API_KEY=sk-sensor\nDASHBOARD_TOKEN=tok\nATTACKER_LLM_MODEL=m\nLAB_TARGET_ALLOWLIST=sensor:8080\n',
    );
    expect(readLabEnvFile(file)).toEqual({
      ATTACKER_LLM_MODEL: 'm',
      LAB_TARGET_ALLOWLIST: 'sensor:8080',
    });
  });

  it('mode auto = scripted bila key agen kosong', () => {
    const cfg = loadAgentConfig({ LAB_TARGET_ALLOWLIST: 'localhost:8080,localhost:3000' });
    expect(cfg.mode).toBe('scripted');
  });
});

describe('loop ReAct', () => {
  const cfg = loadAgentConfig({
    ATTACKER_TARGET_URL: 'http://sensor:8080/',
    LAB_TARGET_ALLOWLIST: 'sensor:8080',
    ATTACKER_LLM_API_KEY: 'k',
    ATTACKER_MAX_STEPS: '5',
  });

  it('permintaan model ke host luar ditolak tool; loop berhenti pada jawaban akhir', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }));
    const tools = new HttpTools({ allow: cfg.allow, fetchImpl: fetchSpy });
    let call = 0;
    const chat: ChatFn = async ({ messages }) => {
      call += 1;
      expect(messages[0]?.content).toContain('Mission ID: LAB-TEST');
      if (call === 1) {
        return {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'a',
                type: 'function',
                function: { name: 'http_request', arguments: '{"url":"http://evil.test/"}' },
              },
              {
                id: 'b',
                type: 'function',
                function: { name: 'http_request', arguments: '{"url":"http://sensor:8080/"}' },
              },
            ],
          },
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          finishReason: 'tool_calls',
        };
      }
      return {
        message: { role: 'assistant', content: 'selesai' },
        usage: { promptTokens: 50, completionTokens: 5, totalTokens: 55 },
        finishReason: 'stop',
      };
    };
    const r = await runLlmAgent(cfg, tools, chat, 'LAB-TEST');
    expect(r.stopReason).toBe('final_answer');
    expect(r.toolCalls).toBe(2);
    expect(r.llm.totalTokens).toBe(175);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('http://sensor:8080/');
    expect(tools.stats.rejected).toBe(1);
  });

  it('berhenti saat batas token tercapai', async () => {
    const tools = new HttpTools({ allow: cfg.allow, fetchImpl: vi.fn<typeof fetch>() });
    const small = { ...cfg, maxTokens: 1_000 };
    const chat: ChatFn = async () => ({
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'x',
            type: 'function',
            function: { name: 'read_response', arguments: '{"response_id":"r9"}' },
          },
        ],
      },
      usage: { promptTokens: 900, completionTokens: 200, totalTokens: 1_100 },
      finishReason: 'tool_calls',
    });
    const r = await runLlmAgent(small, tools, chat, 'LAB-TEST');
    expect(r.stopReason).toBe('token_budget');
    expect(r.steps).toBe(1);
  });
});
