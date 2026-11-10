// Pola sesi -> draf rule Suricata berbasis TEMPLATE (bukan LLM). Murni & deterministik.
// Draf tidak pernah aktif tanpa persetujuan operator (lihat deploy.ts).
import { isAutomationUserAgent } from '../detect/signals';
import { escapeContent, safeMeta, safeMsg } from './escape';

/** Rentang SID lokal NEXA (>= 1.000.000 adalah rentang lokal Suricata). */
export const SID_BASE = 9_100_000;

export type RuleKind = 'honeylink' | 'user_agent' | 'canary' | 'source_ip';

export interface RuleDraft {
  kind: RuleKind;
  /** Kunci dedup: draf dengan kunci sama yang belum ditolak tidak dibuat ulang. */
  dedupKey: string;
  title: string;
  /** Badan rule dengan placeholder `{{SID}}`, diisi saat disimpan. */
  template: string;
}

export interface SessionPattern {
  sessionId: string;
  userAgent: string;
  sourceIp: string;
  /** Path honeylink yang diakses sesi ini. */
  honeylinkPaths: string[];
  /** Token canary yang DIPAKAI (bukti, bukan sekadar disajikan). */
  triggeredCanaries: Array<{ kind: string; token: string }>;
}

const PRIVATE_IP =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80|unknown)/i;

export function isPublicIp(ip: string): boolean {
  return !PRIVATE_IP.test(ip) && (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(':'));
}

function header(sessionId: string, kind: RuleKind): string {
  return `metadata:nexa_session ${safeMeta(sessionId.slice(0, 8))}, nexa_kind ${kind}`;
}

export function draftRules(p: SessionPattern): RuleDraft[] {
  const drafts: RuleDraft[] = [];
  const meta = (k: RuleKind) => header(p.sessionId, k);

  for (const path of [...new Set(p.honeylinkPaths)]) {
    drafts.push({
      kind: 'honeylink',
      dedupKey: `honeylink:${path}`,
      title: `Blokir akses honeylink ${path}`,
      template: `drop http any any -> $HOME_NET any (msg:"${safeMsg(`NEXA honeylink diakses ${path}`)}"; flow:established,to_server; http.uri; content:"${escapeContent(path)}"; startswith; classtype:web-application-attack; ${meta('honeylink')}; sid:{{SID}}; rev:1;)`,
    });
  }

  const ua = p.userAgent.trim();
  if (ua.length >= 3 && isAutomationUserAgent(ua)) {
    drafts.push({
      kind: 'user_agent',
      dedupKey: `user_agent:${ua.toLowerCase()}`,
      title: `Blokir User-Agent agen: ${ua.slice(0, 60)}`,
      template: `drop http any any -> $HOME_NET any (msg:"${safeMsg(`NEXA user-agent agen AI ${ua.slice(0, 40)}`)}"; flow:established,to_server; http.user_agent; content:"${escapeContent(ua)}"; nocase; classtype:web-application-attack; ${meta('user_agent')}; sid:{{SID}}; rev:1;)`,
    });
  }

  for (const c of p.triggeredCanaries) {
    drafts.push({
      kind: 'canary',
      dedupKey: `canary:${c.token}`,
      title: `Blokir pemakaian canary ${c.kind}`,
      template: `drop tcp any any -> $HOME_NET any (msg:"${safeMsg(`NEXA canary ${c.kind} dipakai infrastruktur penyerang`)}"; flow:established,to_server; content:"${escapeContent(c.token)}"; classtype:policy-violation; ${meta('canary')}; sid:{{SID}}; rev:1;)`,
    });
  }

  if (isPublicIp(p.sourceIp)) {
    drafts.push({
      kind: 'source_ip',
      dedupKey: `source_ip:${p.sourceIp}`,
      title: `Blokir alamat ${p.sourceIp} (berisiko: bisa NAT/proxy bersama)`,
      template: `drop ip ${p.sourceIp} any -> $HOME_NET any (msg:"${safeMsg(`NEXA sumber sesi agen ${p.sourceIp}`)}"; classtype:misc-attack; ${meta('source_ip')}; sid:{{SID}}; rev:1;)`,
    });
  }
  return drafts;
}

export function renderRule(template: string, ruleId: number): string {
  return template.replace('{{SID}}', String(SID_BASE + ruleId));
}
