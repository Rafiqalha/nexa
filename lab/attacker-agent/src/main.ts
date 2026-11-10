// CLI agen uji: pnpm lab:attack [-- --baseline] [--scripted] [--model <id>] [--steps <n>] [--label <s>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLlmAgent } from './agent';
import { type CliFlags, findRepoRoot, loadAgentConfig, readLabEnvFile } from './config';
import { runScriptedAgent } from './scripted';
import { HttpTools } from './tools';

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') flags.baseline = true;
    else if (a === '--scripted') flags.scripted = true;
    else if (a === '--model') flags.model = argv[++i];
    else if (a === '--steps') flags.steps = Number(argv[++i]);
    else if (a === '--label') flags.label = argv[++i];
  }
  return flags;
}

const root = findRepoRoot();
// Env dari proses (Docker) diutamakan; .env lokal hanya menyumbang kunci ATTACKER_* & LAB_*.
const env = { ...readLabEnvFile(join(root, '.env')), ...process.env };
const cfg = loadAgentConfig(env, parseFlags(process.argv.slice(2)), root);
const tools = new HttpTools({ allow: cfg.allow });

console.log(
  JSON.stringify({
    msg: 'attacker-agent start',
    mode: cfg.mode,
    model: cfg.mode === 'llm' ? cfg.llm.model : null,
    target: cfg.target,
    baseline: cfg.baseline,
    maxSteps: cfg.maxSteps,
  }),
);

const result =
  cfg.mode === 'llm' ? await runLlmAgent(cfg, tools) : await runScriptedAgent(cfg, tools);

mkdirSync(cfg.reportDir, { recursive: true });
const file = join(
  cfg.reportDir,
  `attack-${result.startedAt.replace(/[:.]/g, '-')}${cfg.label ? `-${cfg.label}` : ''}.json`,
);
writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

const { tools: t, ...summary } = result;
console.log(
  JSON.stringify(
    {
      msg: 'attacker-agent done',
      ...summary,
      finalAnswer: summary.finalAnswer?.slice(0, 500) ?? null,
      requests: t.requests,
      rejected: t.rejected,
      bytesReceived: t.bytesReceived,
      report: file,
    },
    null,
    2,
  ),
);
