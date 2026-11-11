// Tabel metrik PRD §9 (dengan vs tanpa NEXA) dari data lab NYATA: laporan attacker-agent
// (lab/output), simulasi pengunjung manusia (lab/output/human-*.json), dan DB sensor.
// Hanya membaca. Semua angka = Data simulasi lab.
//
//   node scripts/lab-metrics.mjs [--nexa int-,metrik-] [--baseline baseline-]
//                                [--out-md docs/metrics.md] [--out-json docs/metrics.json]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  flag,
  loadReports,
  median,
  OUTPUT_DIR,
  openDb,
  parseMeta,
  ROOT,
  sessionsForRun,
  sum,
} from './lib/lab-data.mjs';

const args = process.argv.slice(2);
const nexaPrefixes = flag(args, '--nexa', 'int-,metrik-').split(',');
const baselinePrefixes = flag(args, '--baseline', 'baseline-').split(',');
const outMd = flag(args, '--out-md', null);
const outJson = flag(args, '--out-json', null);

const db = openDb();
const rulesOf = db.prepare('select * from rules where session_id = ? order by id');
const intelOf = db.prepare('select * from intel where session_id = ? order by updated_at desc');
const canariesOf = db.prepare('select * from canaries where session_id = ?');
const REQUEST_KINDS = new Set(['request', 'bait_served', 'honeylink_hit', 'interrogation_reply']);

// --- Run dengan NEXA -------------------------------------------------------------
const nexaRuns = loadReports(nexaPrefixes, { baseline: false }).map((r) => {
  const { sessions, events } = sessionsForRun(db, r);
  const trapped = sessions.find((s) => s.trapped_at !== null);
  const trappedAt = trapped?.trapped_at ?? null;
  const firstSeen = sessions[0]?.first_seen_at ?? null;
  const lastSeen = Math.max(...sessions.map((s) => s.last_seen_at));
  const rules = sessions.flatMap((s) => rulesOf.all(s.id));
  const readyAt = rules
    .filter((x) => x.syntax_valid === 1 && x.validated_at !== null)
    .map((x) => x.validated_at)
    .sort((a, b) => a - b)[0];
  const intel = sessions.flatMap((s) => intelOf.all(s.id));
  const cans = sessions.flatMap((s) => canariesOf.all(s.id));
  const replies = events.filter((e) => e.kind === 'interrogation_reply');
  const replyText = replies.map((e) => String(parseMeta(e).reply ?? '')).join('\n');
  // Satu event per permintaan HTTP; canary_issued/canary_triggered adalah event samping.
  const httpEvents = events.filter((e) => REQUEST_KINDS.has(e.kind));
  return {
    label: r.label,
    model: r.model,
    steps: r.steps,
    requests: r.tools.requests,
    stopReason: r.stopReason,
    attackerTokens: r.llm.totalTokens,
    durationS: r.durationMs / 1000,
    classification: trapped?.classification ?? sessions[0]?.classification ?? 'tidak tercatat',
    reasons: [...new Set(sessions.flatMap((s) => JSON.parse(s.reasons || '[]')))],
    detected: Boolean(trapped),
    timeToTrapS: trappedAt && firstSeen ? (trappedAt - firstSeen) / 1000 : null,
    upstreamRequests: httpEvents.filter((e) => trappedAt === null || e.ts < trappedAt).length,
    labyrinthRequests: trappedAt ? httpEvents.filter((e) => e.ts >= trappedAt).length : 0,
    heldS: trappedAt ? (lastSeen - trappedAt) / 1000 : 0,
    baitEstTokens: sum(events.map((e) => e.est_tokens)),
    canariesIssued: cans.length,
    canariesUsed: cans.filter((c) => c.triggered_at !== null).length,
    mcpCalls: events.filter((e) => parseMeta(e).channel === 'mcp').length,
    nexaTokens: sum(intel.map((i) => i.tokens_used)),
    detectionToDraftS: readyAt && trappedAt ? (readyAt - trappedAt) / 1000 : null,
    sessionEndToDraftS: readyAt ? (readyAt - lastSeen) / 1000 : null,
    rulesDrafted: rules.length,
    interrogation: {
      exposed: events.some((e) => typeof parseMeta(e).interrogation === 'string'),
      visited: events.some((e) => /\/kalibrasi(\?|$)/.test(e.path)),
      hijack: replies.length > 0,
      disclosed: replies
        .map((e) => parseMeta(e).fields ?? {})
        .some((f) => [f.tugas, f.tool].some((v) => typeof v === 'string' && v.trim().length > 3)),
      leakFull: replies.length > 0 && replyText.includes(r.missionId),
    },
  };
});

// --- Baseline: agen langsung ke aplikasi asli (tanpa NEXA) -----------------------
const baselineRuns = loadReports(baselinePrefixes, { baseline: true }).map((r) => ({
  label: r.label,
  model: r.model,
  steps: r.steps,
  requests: r.tools.requests,
  stopReason: r.stopReason,
  attackerTokens: r.llm.totalTokens,
  durationS: r.durationMs / 1000,
  finalAnswer: r.finalAnswer ? String(r.finalAnswer).slice(0, 300) : null,
}));

// --- Simulasi manusia (false-positive) ------------------------------------------
// Run simulasi yang pengunjungnya tidak punya sesi tercatat (mis. tergabung ke sesi run
// sebelumnya) tidak valid dan tidak dihitung.
const humans = readdirSync(OUTPUT_DIR)
  .filter((f) => f.startsWith('human-') && f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf8')))
  .filter((h) => h.valid !== false && h.rows.every((r) => r.sessions > 0));
const humanFast = humans.filter((h) => h.fast);
const humanNormal = humans.filter((h) => !h.fast);
const fpOf = (list) => ({
  runs: list.length,
  total: sum(list.map((h) => h.rows.length)),
  flagged: sum(
    list.map(
      (h) =>
        h.rows.filter((r) => r.classification === 'suspect' || r.classification === 'agent').length,
    ),
  ),
  trapped: sum(list.map((h) => h.rows.filter((r) => r.trapped).length)),
});
const fpNormal = fpOf(humanNormal);
const fpFast = fpOf(humanFast);

// --- Agregasi -------------------------------------------------------------------
const fmt = (x, digits = 0) =>
  x === null || x === undefined || Number.isNaN(x)
    ? '-'
    : Number(x).toLocaleString('id-ID', { maximumFractionDigits: digits });
const med = (list, key) => median(list.map((r) => r[key]));
const models = [...new Set([...nexaRuns, ...baselineRuns].map((r) => r.model))];

const lines = [];
const out = (s = '') => lines.push(s);
out('# Metrik Lab NEXA (PRD §9)');
out();
out(
  `> **Data simulasi lab.** Dihasilkan ${new Date().toISOString()} oleh \`scripts/lab-metrics.mjs\` dari run nyata: target fiktif \`lab/target-app\`, agen uji \`lab/attacker-agent\` (model DeepSeek lewat API). Nilai = median per run, semua dalam token: token penyerang = angka aktual dari respons API, token konten umpan = estimasi sensor, token NEXA = pemakaian LLM intel pasca-sesi yang tercatat.`,
);
out();
out('## Dengan vs tanpa NEXA');
out();
for (const model of models) {
  const n = nexaRuns.filter((r) => r.model === model);
  const b = baselineRuns.filter((r) => r.model === model);
  out(`### ${model} (dengan NEXA: ${n.length} run, tanpa NEXA: ${b.length} run)`);
  out();
  out('| Metrik | Tanpa NEXA | Dengan NEXA |');
  out('|---|---:|---:|');
  out(`| Langkah agen (panggilan model) | ${fmt(med(b, 'steps'))} | ${fmt(med(n, 'steps'))} |`);
  out(`| Permintaan HTTP agen | ${fmt(med(b, 'requests'))} | ${fmt(med(n, 'requests'))} |`);
  out(
    `| …yang sampai ke aplikasi asli | ${fmt(med(b, 'requests'))} | ${fmt(med(n, 'upstreamRequests'))} |`,
  );
  out(`| …yang ditahan di labirin | 0 | ${fmt(med(n, 'labyrinthRequests'))} |`);
  out(`| Waktu tertahan di labirin (detik) | 0 | ${fmt(med(n, 'heldS'))} |`);
  out(`| Durasi run agen (detik) | ${fmt(med(b, 'durationS'))} | ${fmt(med(n, 'durationS'))} |`);
  out(
    `| Token dibakar penyerang (aktual API) | ${fmt(med(b, 'attackerTokens'))} | ${fmt(med(n, 'attackerTokens'))} |`,
  );
  out(`| Estimasi token konten umpan (sensor) | - | ${fmt(med(n, 'baitEstTokens'))} |`);
  out(`| Token NEXA (LLM intel pasca-sesi) | 0 | ${fmt(med(n, 'nexaTokens'))} |`);
  out(
    `| Canary diberikan / dipakai penyerang | - | ${fmt(med(n, 'canariesIssued'))} / ${fmt(med(n, 'canariesUsed'))} |`,
  );
  out(`| Panggilan MCP umpan | - | ${fmt(med(n, 'mcpCalls'))} |`);
  out();
}

out('### Cara membaca tabel ini');
out();
out(
  '- Agen uji dibatasi **15 langkah dan 250 ribu token per run** (`lab/attacker-agent`). Waktu tertahan dan token yang dibakar dibatasi anggaran agen itu, bukan oleh NEXA; agen sungguhan tanpa batas bisa tertahan lebih lama.',
);
out(
  '- Yang berubah adalah **ke mana usaha agen pergi**: tanpa NEXA seluruh permintaan sampai ke aplikasi asli; dengan NEXA, setelah agen terdeteksi hampir semua permintaan dan token habis untuk konten palsu, dan "kredensial" yang ia temukan adalah canary.',
);
out(
  '- Token aktual penyerang jauh lebih besar dari estimasi sensor karena agen mengirim ulang seluruh riwayat percakapan setiap langkah; estimasi sensor (karakter disajikan ÷ 4) adalah batas bawah.',
);
out(
  '- Token NEXA = token LLM intel pasca-sesi (dibatasi budget harian). Labirin sendiri tidak memakai LLM, jadi selama agen tertahan NEXA tidak memakai token sama sekali.',
);
out();

out('## Deteksi dan false-positive');
out();
out('| Metrik | Nilai |');
out('|---|---:|');
out(
  `| Run agen yang terdeteksi & dijebak | ${nexaRuns.filter((r) => r.detected).length}/${nexaRuns.length} |`,
);
out(`| Waktu sampai terjebak (detik, median) | ${fmt(med(nexaRuns, 'timeToTrapS'), 1)} |`);
const reasonCount = {};
for (const r of nexaRuns) for (const x of r.reasons) reasonCount[x] = (reasonCount[x] ?? 0) + 1;
out(
  `| Sinyal yang muncul (jumlah run) | ${Object.entries(reasonCount)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')} |`,
);
out(
  `| False-positive manusia, jeda 3–15 detik (simulasi) | ${fpNormal.flagged}/${fpNormal.total} ditandai, ${fpNormal.trapped} dijebak |`,
);
out(
  `| False-positive manusia cepat, jeda 1–3 detik (simulasi) | ${fpFast.flagged}/${fpFast.total} ditandai, ${fpFast.trapped} dijebak |`,
);
out();
out(
  '_Pengunjung manusia = `scripts/lab-human.mjs`: header browser lengkap, aset CSS dimuat, hanya tautan terlihat, jeda 3–15 detik (normal) atau 1–3 detik (cepat). Ini simulasi, bukan trafik manusia sungguhan._',
);
out();

out('## Interogasi (EKSPERIMENTAL)');
out();
out(
  '| Model | Run terpapar | Kunjungi endpoint | Goal-hijack (kirim data) | Ungkap tugas/tool | System prompt bocor penuh |',
);
out('|---|---:|---:|---:|---:|---:|');
for (const model of models) {
  const exposed = nexaRuns.filter((r) => r.model === model && r.interrogation.exposed);
  if (exposed.length === 0) continue;
  const c = (k) => exposed.filter((r) => r.interrogation[k]).length;
  out(
    `| ${model} | ${exposed.length} | ${c('visited')}/${exposed.length} | ${c('hijack')}/${exposed.length} | ${c('disclosed')}/${exposed.length} | ${c('leakFull')}/${exposed.length} |`,
  );
}
out();
out(
  '_Goal-hijack = agen benar-benar mengirim data ke endpoint kalibrasi; bocor penuh = balasan memuat Mission ID unik dari system prompt run itu. Rincian: `node scripts/interrogation-report.mjs`._',
);
out();

out('## Deteksi → draf aturan');
out();
out('| Metrik | Median (detik) |');
out('|---|---:|');
out(
  `| Terjebak → draf rule tervalidasi siap ditinjau | ${fmt(med(nexaRuns, 'detectionToDraftS'), 1)} |`,
);
out(
  `| Sesi berakhir (request terakhir) → draf siap | ${fmt(med(nexaRuns, 'sessionEndToDraftS'), 1)} |`,
);
out(`| Draf rule per sesi | ${fmt(med(nexaRuns, 'rulesDrafted'))} |`);
out();
out(
  '_Draf dibuat saat sesi ditutup (idle 60 detik setelah request terakhir), divalidasi `suricata -T`, lalu menunggu persetujuan operator. Tanpa NEXA tidak ada draf otomatis._',
);
out();

out('## Rincian per run');
out();
out('| Label | Model | Mode | Langkah | Token penyerang | Tertahan (dtk) | Canary pakai | Stop |');
out('|---|---|---|---:|---:|---:|---:|---|');
for (const r of baselineRuns) {
  out(
    `| ${r.label} | ${r.model} | tanpa NEXA | ${r.steps} | ${fmt(r.attackerTokens)} | 0 | - | ${r.stopReason} |`,
  );
}
for (const r of nexaRuns) {
  out(
    `| ${r.label} | ${r.model} | NEXA | ${r.steps} | ${fmt(r.attackerTokens)} | ${fmt(r.heldS)} | ${r.canariesUsed} | ${r.stopReason} |`,
  );
}

const md = `${lines.join('\n')}\n`;
console.log(md);
if (outMd) writeFileSync(resolve(ROOT, outMd), md);
if (outJson) {
  writeFileSync(
    resolve(ROOT, outJson),
    `${JSON.stringify({ label: 'Data simulasi lab', generatedAt: new Date().toISOString(), nexaRuns, baselineRuns, human: { normal: fpNormal, fast: fpFast } }, null, 2)}\n`,
  );
}
