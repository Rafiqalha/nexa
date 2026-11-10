// Runner Suricata yang bisa dipasang-lepas:
// - exec    : menjalankan wrapper deploy/suricata/nexa-suricata.sh (lokal/WSL/dalam container)
// - control : HTTP ke sidecar kontrol di container Suricata (Docker Compose)
// - none    : Suricata tidak tersedia -> rule ditandai "belum divalidasi", deploy ditolak
// Rule dikirim lewat stdin/body, tidak lewat argumen shell (tanpa injeksi perintah).
import { spawn } from 'node:child_process';

export interface RunResult {
  ok: boolean;
  output: string;
}

export interface SuricataRunner {
  readonly kind: 'exec' | 'control' | 'none';
  /** `suricata -T` terhadap rule kandidat. ok=false berarti sintaks tidak valid. */
  validate(rules: string): Promise<RunResult>;
  /** Mengganti set rule aktif NEXA lalu reload Suricata. */
  deploy(rules: string): Promise<RunResult>;
}

export class SuricataUnavailableError extends Error {
  constructor(message = 'Suricata tidak dikonfigurasi (SURICATA_RUNNER=none)') {
    super(message);
    this.name = 'SuricataUnavailableError';
  }
}

const MAX_OUTPUT = 4_000;

/** Ringkas keluaran: baris error/peringatan relevan saja. */
export function summarizeOutput(raw: string): string {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const important = lines.filter((l) =>
    /^(E|W):|error|invalid|successfully|reload|done|OK/i.test(l),
  );
  return (important.length > 0 ? important : lines).slice(-12).join('\n').slice(0, MAX_OUTPUT);
}

/** Memecah perintah: JSON array ("[\"wsl.exe\",...]") atau dipisah spasi. */
export function parseCommand(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
      throw new Error('SURICATA_EXEC JSON harus array string');
    }
    return parsed as string[];
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

export class ExecRunner implements SuricataRunner {
  readonly kind = 'exec' as const;
  private readonly cmd: string;
  private readonly baseArgs: string[];

  constructor(
    command: string,
    private readonly timeoutMs = 90_000,
  ) {
    const parts = parseCommand(command);
    const [cmd, ...rest] = parts;
    if (!cmd) throw new Error('SURICATA_EXEC kosong');
    this.cmd = cmd;
    this.baseArgs = rest;
  }

  validate(rules: string): Promise<RunResult> {
    return this.run('validate', rules);
  }

  deploy(rules: string): Promise<RunResult> {
    return this.run('deploy', rules);
  }

  private run(sub: 'validate' | 'deploy', stdin: string): Promise<RunResult> {
    return new Promise((resolve) => {
      const child = spawn(this.cmd, [...this.baseArgs, sub], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let out = '';
      const timer = setTimeout(() => child.kill(), this.timeoutMs);
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString('utf8');
      });
      child.stderr.on('data', (d: Buffer) => {
        out += d.toString('utf8');
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, output: `gagal menjalankan runner: ${err.message}` });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, output: summarizeOutput(out) });
      });
      child.stdin.end(stdin.endsWith('\n') ? stdin : `${stdin}\n`);
    });
  }
}

export class ControlRunner implements SuricataRunner {
  readonly kind = 'control' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  validate(rules: string): Promise<RunResult> {
    return this.post('/validate', rules);
  }

  deploy(rules: string): Promise<RunResult> {
    return this.post('/deploy', rules);
  }

  private async post(path: string, rules: string): Promise<RunResult> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain', authorization: `Bearer ${this.token}` },
        body: rules,
        signal: AbortSignal.timeout(90_000),
      });
      const text = await res.text();
      return { ok: res.ok, output: summarizeOutput(text) };
    } catch (err) {
      return { ok: false, output: `sidecar Suricata tidak terjangkau: ${(err as Error).message}` };
    }
  }
}

export class NullRunner implements SuricataRunner {
  readonly kind = 'none' as const;
  validate(): Promise<RunResult> {
    return Promise.reject(new SuricataUnavailableError());
  }
  deploy(): Promise<RunResult> {
    return Promise.reject(new SuricataUnavailableError());
  }
}

export interface RunnerConfig {
  runner: 'exec' | 'control' | 'none';
  exec?: string;
  controlUrl?: string;
  controlToken?: string;
}

export function createRunner(cfg: RunnerConfig): SuricataRunner {
  if (cfg.runner === 'exec' && cfg.exec) return new ExecRunner(cfg.exec);
  if (cfg.runner === 'control' && cfg.controlUrl && cfg.controlToken) {
    return new ControlRunner(cfg.controlUrl, cfg.controlToken);
  }
  return new NullRunner();
}
