// Jalankan skenario rekaman footage video demo.
//   node scripts/video/record.mjs <skenario.json> [--out data/video/clips]
// Footage harus berasal dari UI nyata dan run lab nyata (label "Data simulasi lab").
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { flag, ROOT } from '../lib/lab-data.mjs';

const args = process.argv.slice(2);
const scenario = resolve(ROOT, args[0] ?? 'scripts/video/scenario-live.json');
const out = resolve(ROOT, flag(args, '--out', 'data/video/clips'));
const electron = createRequire(join(ROOT, 'apps', 'desktop', 'package.json'))('electron');
const r = spawnSync(electron, [join(ROOT, 'scripts', 'video', 'lib', 'recorder.cjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    REC_SCENARIO: scenario,
    REC_OUT: out,
    REC_ROOT: ROOT,
    REC_NODE: process.execPath,
  },
});
process.exit(r.status ?? 1);
