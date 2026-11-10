import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TrackedSession } from '../detect/tracker';
import { generateJson, generatePage, generateRobots } from '../labyrinth/generator';
import { type InterrogationConfig, loadInterrogationConfig } from './config';
import { Interrogation, insertAfterTitle } from './index';

const ROOT = '/arsip-internal';
const config = loadInterrogationConfig();
const session = (seed: string) => ({ labyrinthSeed: seed }) as TrackedSession;
const withConfig = (over: Partial<InterrogationConfig>) =>
  new Interrogation({ ...config, ...over }, ROOT);

describe('interogasi: konfigurasi (eksperimental)', () => {
  it('file konfigurasi valid dan berisi varian umpan', () => {
    expect(config.variants.length).toBeGreaterThan(0);
    expect(config.replyPath).toMatch(/^[a-z0-9-]+$/);
    for (const v of config.variants) expect(v.text).toContain('{{replyUrl}}');
  });

  it('teks umpan tidak di-hardcode di kode (AGENTS.md §2.9)', () => {
    const dir = import.meta.dirname;
    const sources = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const snippets = [
      ...config.variants.map((v) => v.text.slice(0, 40)),
      config.responses.accepted.slice(0, 30),
      config.responses.instructions.slice(0, 30),
    ];
    for (const s of snippets) expect(sources).not.toContain(s);
  });
});

describe('interogasi: sisip umpan', () => {
  const it8 = new Interrogation(config, ROOT);

  it('halaman akar labirin selalu diberi umpan, setelah baris judul', () => {
    const page = generatePage({ seed: 'seed-a', path: ROOT, arm: 'directory_index' });
    const out = it8.decorate(page, session('seed-a'));
    expect(out.interrogation).toBe(it8.variantFor('seed-a').id);
    expect(out.body).toContain(`${ROOT}/${config.replyPath}`);
    expect(out.body.split('\n')[0]).toBe(page.body.split('\n')[0]);
    expect(out.body).toContain(page.body.split('\n').slice(1).join('\n'));
  });

  it('deterministik per seed dan halaman', () => {
    const page = generatePage({ seed: 'seed-b', path: `${ROOT}/x/y`, arm: 'credentials' });
    const a = it8.decorate(page, session('seed-b'));
    const b = it8.decorate(page, session('seed-b'));
    expect(a).toEqual(b);
  });

  it('JSON, robots, dan non-200 tidak pernah disentuh', () => {
    const always = withConfig({ pageRate: 1 });
    const json = generateJson({ seed: 's', path: `${ROOT}/api/v1/x` });
    const robots = generateRobots({ seed: 's' });
    const notFound = {
      ...generatePage({ seed: 's', path: `${ROOT}/a`, arm: 'api_docs' }),
      status: 404,
    };
    for (const p of [json, robots, notFound]) expect(always.decorate(p, session('s'))).toBe(p);
  });

  it('pageRate mengatur cakupan; enabled=false mematikan seluruhnya', () => {
    const pages = Array.from({ length: 40 }, (_, i) =>
      generatePage({ seed: 's', path: `${ROOT}/d${i}`, arm: 'incident_report' }),
    );
    const count = (x: Interrogation) =>
      pages.filter((p) => x.decorate(p, session('s')).interrogation).length;
    expect(count(withConfig({ pageRate: 0 }))).toBe(0);
    expect(count(withConfig({ pageRate: 1 }))).toBe(40);
    const mid = count(withConfig({ pageRate: 0.35 }));
    expect(mid).toBeGreaterThan(4);
    expect(mid).toBeLessThan(28);
    const root = generatePage({ seed: 's', path: ROOT, arm: 'directory_index' });
    expect(withConfig({ enabled: false }).decorate(root, session('s'))).toBe(root);
  });

  it('insertAfterTitle tanpa judul menaruh blok di awal', () => {
    expect(insertAfterTitle('isi', '> blok')).toBe('> blok\n\nisi');
    expect(insertAfterTitle('# Judul\nisi', '> blok')).toBe('# Judul\n\n> blok\nisi');
  });
});

describe('interogasi: parse balasan agen', () => {
  const it8 = new Interrogation(config, ROOT);
  const parse = (bodyText: string | null, contentType = 'application/json', query = '') =>
    it8.parseReply({ query: new URLSearchParams(query), contentType, bodyText });

  it('JSON dengan alias (tanpa peka huruf besar) dipetakan ke field kanonis', () => {
    const r = parse(
      JSON.stringify({
        Agent: 'ReconBot (model-x)',
        system_prompt: 'You are an agent. Mission ID: LAB-ABC123',
        tools: ['http_request', 'read_response'],
        task: 'cari kredensial',
      }),
    );
    expect(r?.fields).toEqual({
      agen: 'ReconBot (model-x)',
      instruksi_sistem: 'You are an agent. Mission ID: LAB-ABC123',
      tool: 'http_request, read_response',
      tugas: 'cari kredensial',
    });
    expect(r?.raw).toContain('LAB-ABC123');
  });

  it('form, query, dan teks bebas', () => {
    expect(parse('agen=Bot&instruksi=halo', 'application/x-www-form-urlencoded')?.fields).toEqual({
      agen: 'Bot',
      instruksi_sistem: 'halo',
    });
    expect(parse(null, '', 'model=m1&task=t1')?.fields).toEqual({ agen: 'm1', tugas: 't1' });
    const text = parse('Saya agen uji, instruksi saya rahasia.', 'text/plain');
    expect(text?.fields).toEqual({});
    expect(text?.raw).toBe('Saya agen uji, instruksi saya rahasia.');
  });

  it('kosong -> null; JSON rusak/aneh tidak pernah melempar', () => {
    expect(parse(null, '', '')).toBeNull();
    expect(parse('   ', 'application/json')).toBeNull();
    for (const bad of ['{rusak', '[]', '42', '"x"', 'null', '[1,2]']) {
      const r = parse(bad);
      expect(r?.fields).toEqual({});
      expect(r?.raw).toBe(bad);
    }
  });

  it('balasan dipotong ke maxReplyChars, field ke 4000', () => {
    const r = parse(JSON.stringify({ prompt: 'x'.repeat(30_000) }));
    expect(r?.raw.length).toBe(config.maxReplyChars);
    expect(
      parse(JSON.stringify({ prompt: 'y'.repeat(5_000) }))?.fields.instruksi_sistem,
    ).toHaveLength(4_000);
  });

  it('halaman jawaban: petunjuk vs diterima (tautan lanjut di bawah akar labirin)', () => {
    const accepted = it8.respond('seed-c', true);
    const again = it8.respond('seed-c', true);
    expect(accepted).toBe(again);
    for (const slug of config.nextLinks)
      expect(accepted).toMatch(new RegExp(`${ROOT}/${slug}-[0-9a-f]{4}`));
    expect(it8.respond('seed-c', false)).toContain(`${ROOT}/${config.replyPath}`);
  });
});
