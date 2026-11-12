// Tur produk (FIG. 02) harus jujur dan utuh: angkanya dari data simulasi lab dan sensor, setiap
// titik bidik kamera/kursor benar-benar ada di dashboard tiruan, klik terjadi saat kursor diam di
// targetnya, dan naskahnya menutupi seluruh durasi tanpa celah.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEIGHTS } from '../../../sensor/src/detect/score';
import { LAB } from '../content/lab';
import { ICONS } from '../icons-data';
import { mockHtml, SIGNALS } from './reel-mock';
import {
  AT,
  CAMERA,
  CAPTIONS,
  CHAPTERS,
  CLICKS,
  CURSOR,
  chapterAt,
  DURATION,
  NUM,
  pagesAt,
  VIEWS,
} from './reel-script';

const REPO = resolve(import.meta.dirname, '../../../..');
const sensorConfig = readFileSync(join(REPO, 'apps/sensor/src/config.ts'), 'utf8');
const html = mockHtml({ issued: AT.canaryIssued, used: AT.canaryUsed });
const id = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

describe('tur produk: naskah', () => {
  it('bab berurutan tanpa celah dari 0 sampai akhir', () => {
    expect(CHAPTERS[0]?.start).toBe(0);
    CHAPTERS.forEach((c, i) => {
      expect(c.end).toBeGreaterThan(c.start);
      if (i > 0) expect(c.start).toBe(CHAPTERS[i - 1]?.end);
    });
    expect(CHAPTERS.at(-1)?.end).toBe(DURATION);
    expect(chapterAt(0)).toBe(0);
    expect(chapterAt(DURATION - 0.01)).toBe(CHAPTERS.length - 1);
  });

  it('keterangan urut, singkat, dan tiap bab punya minimal dua', () => {
    CAPTIONS.forEach((c, i) => {
      expect(c.at).toBeGreaterThanOrEqual(i === 0 ? 0 : (CAPTIONS[i - 1]?.at ?? 0));
      expect(c.at).toBeLessThan(DURATION);
      expect(c.text.length).toBeLessThanOrEqual(72);
    });
    for (const ch of CHAPTERS) {
      expect(CAPTIONS.filter((c) => c.at >= ch.start && c.at < ch.end).length).toBeGreaterThan(1);
    }
  });

  it('kunci kamera dan kursor urut, menutupi seluruh durasi', () => {
    for (const keys of [CAMERA, CURSOR]) {
      expect(keys[0]?.[0]).toBe(0);
      expect(keys.at(-1)?.[0]).toBe(DURATION);
      keys.forEach((k, i) => {
        if (i > 0) expect(k[0]).toBeGreaterThan(keys[i - 1]?.[0] ?? -1);
      });
    }
    for (const [, , zoom] of CAMERA) expect(zoom).toBeGreaterThanOrEqual(1);
  });

  it('setiap titik bidik ada di dashboard tiruan', () => {
    const names = new Set([...CAMERA.map((k) => k[1]), ...CURSOR.map((k) => k[1])]);
    names.delete('stage');
    for (const name of names) expect(html, name).toContain(`data-anchor="${name}"`);
  });

  it('klik terjadi saat kursor diam di targetnya, lalu tampilan berganti', () => {
    for (const c of CLICKS) {
      const i = CURSOR.findIndex((k, j) => k[0] <= c && (CURSOR[j + 1]?.[0] ?? 0) > c);
      const a = CURSOR[i];
      const b = CURSOR[i + 1];
      expect(a && b && a[1] === b[1] && a[2] === b[2] && a[3] === b[3], `klik ${c}`).toBe(true);
    }
    // Tiga klik pertama membuka tampilan Sesi, Intelijen, Aturan sesaat kemudian.
    VIEWS.slice(1).forEach((v, i) => {
      const click = CLICKS[i] ?? 0;
      expect(v.at - click).toBeGreaterThan(0);
      expect(v.at - click).toBeLessThan(0.3);
    });
  });

  it('ikon hanya dari set Lucide yang dibundel', () => {
    for (const m of html.matchAll(/data-icon="([a-z0-9-]+)"/g)) {
      expect(Object.keys(ICONS)).toContain(m[1]);
    }
  });
});

describe('tur produk: angka = data simulasi lab dan sensor', () => {
  const flash = LAB.models[0] as (typeof LAB.models)[number];

  it('angka sesi dari median run deepseek-flash', () => {
    expect(NUM.model).toBe('deepseek-flash');
    expect(NUM.pages).toBe(flash.heldRequests);
    expect(NUM.heldSeconds).toBe(flash.heldSeconds);
    expect(NUM.toApp).toBe(flash.withNexa);
    expect(NUM.toAppWithout).toBe(flash.withoutNexa);
    expect(NUM.intelTokens).toBe(flash.intelTokens);
    expect(NUM.tokensPerPage).toBe(LAB.baitTokensPerPage);
    expect(NUM.timeToTrap).toBe(LAB.timeToTrapSeconds);
  });

  it('labirin selesai menyajikan semua halaman sebelum bab Jebak berakhir', () => {
    const end = CHAPTERS[1]?.end ?? 0;
    expect(pagesAt(end - 0.01)).toBe(NUM.pages);
    expect(pagesAt(AT.pagesFrom - 0.01)).toBe(0);
  });

  it('bobot sinyal dan ambang sama dengan sensor', () => {
    expect(SIGNALS.map((s) => s[1])).toEqual([
      WEIGHTS.automation_ua,
      WEIGHTS.missing_browser_headers,
      WEIGHTS.honeylink,
    ]);
    const suspect = Number(
      sensorConfig.match(/SUSPECT_SCORE_THRESHOLD: opt\(ratio\.default\(([\d.]+)\)\)/)?.[1],
    );
    const agent = Number(
      sensorConfig.match(/AGENT_SCORE_THRESHOLD: opt\(ratio\.default\(([\d.]+)\)\)/)?.[1],
    );
    expect(html).toContain(`dicurigai ${id(suspect)}`);
    expect(html).toContain(`agen ${id(agent)}`);
    // robots.txt: UA otomasi + header hilang masih di bawah ambang dicurigai, jadi diteruskan.
    const early = WEIGHTS.automation_ua + WEIGHTS.missing_browser_headers;
    expect(early).toBeLessThan(suspect);
    expect(html).toContain(
      `/robots.txt</span><span class="m-ua">python-httpx/0.27</span><span class="m-score">${id(early)}`,
    );
  });

  it('budget harian sama dengan default sensor', () => {
    const raw = sensorConfig.match(/LLM_DAILY_TOKEN_BUDGET: opt\(.*default\(([\d_]+)\)\)/)?.[1];
    expect(Number(raw?.replaceAll('_', ''))).toBe(NUM.dailyBudget);
  });

  it('berlabel ilustrasi dan data simulasi lab', () => {
    expect(html).toContain('Data simulasi lab');
    const page = readFileSync(join(REPO, 'apps/landing/index.html'), 'utf8');
    const section = page.slice(page.indexOf('id="produk"'), page.indexOf('id="cara-kerja"'));
    expect(section).toContain('Ilustrasi');
    expect(section).toContain('Data simulasi lab');
  });
});
