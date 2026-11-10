// Server MCP intel (FR-19): analis/agen SOC menarik intelijen dari NEXA.
// BACA-SAJA: tidak ada tool yang menulis, menyetujui, menolak, atau men-deploy apa pun;
// persetujuan rule hanya lewat dashboard oleh operator (AGENTS.md §2.5).
// Dipasang di port admin (/api/mcp) di belakang token dashboard + validasi Host/Origin.
import type { HttpBindings } from '@hono/node-server';
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  type McpHttpHandler,
  McpServer,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import { LAB_LABEL, RULE_STATUSES } from '@nexa/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import { canaryToApi, intelToApi, listRules, listSessions, sessionSummary } from '../api/queries';
import type { Db } from '../db/client';
import { canaries, intel } from '../db/schema';

export const INTEL_TOOL_NAMES = ['daftar_sesi', 'intel_sesi', 'draf_aturan'] as const;

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function asText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function createIntelMcpServer(db: Db): McpServer {
  const server = new McpServer(
    { name: 'nexa-intel', version: '0.1.0' },
    {
      instructions: `Intel NEXA (baca-saja). ${LAB_LABEL}. Persetujuan rule hanya lewat dashboard Pos Komando.`,
    },
  );

  server.registerTool(
    'daftar_sesi',
    {
      title: 'Daftar kontak',
      description:
        'Sesi yang ditandai NEXA, terbaru dulu: klasifikasi, skor, status, kedalaman labirin, estimasi token penyerang, canary. Baca-saja.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20),
        termasuk_sah: z.boolean().default(false),
      }),
      annotations: READ_ONLY,
    },
    async ({ limit, termasuk_sah }) =>
      asText({ label: LAB_LABEL, sesi: listSessions(db, { limit, flagged: !termasuk_sah }) }),
  );

  server.registerTool(
    'intel_sesi',
    {
      title: 'Intel satu sesi',
      description:
        'Ringkasan intel pasca-sesi: pola serangan, dugaan model/framework dengan keyakinan, tangkapan interogasi (eksperimental), dan canary yang dipakai (token disamarkan). Baca-saja.',
      inputSchema: z.object({ session_id: z.string().uuid() }),
      annotations: READ_ONLY,
    },
    async ({ session_id }) => {
      const session = sessionSummary(db, session_id);
      if (!session) return { ...asText({ error: 'sesi tidak ditemukan' }), isError: true };
      const row = db
        .select()
        .from(intel)
        .where(eq(intel.sessionId, session_id))
        .orderBy(desc(intel.updatedAt))
        .get();
      const cans = db
        .select()
        .from(canaries)
        .where(eq(canaries.sessionId, session_id))
        .orderBy(asc(canaries.issuedAt))
        .all()
        .map(canaryToApi);
      return asText({
        label: LAB_LABEL,
        sesi: session,
        intel: row ? intelToApi(row) : null,
        canary: {
          diberikan: cans.length,
          dipakai: cans
            .filter((c) => c.triggeredAt !== null)
            .map((c) => ({ ...c, catatan: 'infrastruktur yang dipakai penyerang' })),
        },
      });
    },
  );

  server.registerTool(
    'draf_aturan',
    {
      title: 'Draf dan riwayat aturan',
      description:
        'Rule Suricata hasil NEXA beserta status validasi dan keputusan operator. Tool ini tidak bisa menyetujui atau men-deploy; persetujuan hanya lewat dashboard.',
      inputSchema: z.object({
        status: z.enum([...RULE_STATUSES, 'semua']).default('draft'),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: READ_ONLY,
    },
    async ({ status, limit }) =>
      asText({
        label: LAB_LABEL,
        aturan: listRules(db)
          .filter((r) => status === 'semua' || r.status === status)
          .slice(0, limit),
      }),
  );

  return server;
}

export function createIntelMcpHandler(db: Db): McpHttpHandler {
  return createMcpHandler(() => createIntelMcpServer(db));
}

/**
 * Pasang /mcp pada sub-app /api (yang sudah dilindungi requireToken).
 * Validasi Host/Origin menahan DNS rebinding dari halaman web pihak lain.
 */
export function registerIntelMcp(
  api: Hono<{ Bindings: HttpBindings }>,
  db: Db,
  extraHosts: readonly string[] = [],
): McpHttpHandler {
  const handler = createIntelMcpHandler(db);
  const hosts = [...localhostAllowedHostnames(), ...extraHosts];
  const origins = [...localhostAllowedOrigins(), ...extraHosts];
  api.all('/mcp', async (c) => {
    const req = c.req.raw;
    const rejected =
      hostHeaderValidationResponse(req, hosts) ?? originValidationResponse(req, origins);
    return rejected ?? handler.fetch(req);
  });
  return handler;
}
