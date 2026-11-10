// Ringkasan run lab dari DB sensor (mode lokal): `node scripts/lab-report.mjs [sessionId]`.
// Tanpa argumen: sesi terjebak terakhir. Hanya membaca (readonly).
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps', 'sensor', 'package.json'));
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH
  ? resolve(root, process.env.DATABASE_PATH)
  : join(root, 'data', 'nexa.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const wanted = process.argv[2];
const session = wanted
  ? db.prepare('select * from sessions where id = ?').get(wanted)
  : db
      .prepare(
        "select * from sessions where status in ('trapped','exited') and trapped_at is not null order by first_seen_at desc limit 1",
      )
      .get();

if (!session) {
  console.log('Belum ada sesi terjebak.');
  process.exit(0);
}

const events = db.prepare('select * from events where session_id = ? order by ts').all(session.id);
const bait = events.filter((e) => e.kind === 'bait_served' || e.kind === 'honeylink_hit');
const armCount = {};
for (const e of bait) {
  const arm = JSON.parse(e.meta || '{}').arm ?? 'unknown';
  armCount[arm] = (armCount[arm] ?? 0) + 1;
}
const totalTokens = bait.reduce((s, e) => s + e.est_tokens, 0);
const totalChars = bait.reduce((s, e) => s + e.chars_served, 0);
const heldMs = session.trapped_at ? session.last_seen_at - session.trapped_at : 0;

console.log(
  JSON.stringify(
    {
      session: {
        id: session.id,
        userAgent: session.user_agent,
        classification: session.classification,
        status: session.status,
        score: session.score,
        reasons: JSON.parse(session.reasons),
        requests: session.request_count,
        maxDepth: session.max_depth,
        heldSeconds: Math.round(heldMs / 100) / 10,
      },
      labyrinth: {
        baitServed: bait.length,
        charsServed: totalChars,
        estTokens: totalTokens,
        armsServed: armCount,
        mostServedArm: Object.entries(armCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      },
      bandit: db.prepare('select * from bandit_arms order by mean_reward desc').all(),
      eventKinds: Object.fromEntries(
        db
          .prepare('select kind, count(*) n from events where session_id = ? group by kind')
          .all(session.id)
          .map((r) => [r.kind, r.n]),
      ),
    },
    null,
    2,
  ),
);
