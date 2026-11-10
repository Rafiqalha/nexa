import { describe, expect, it } from 'vitest';
import { DECOY_TOOL_ARMS, DECOY_TOOL_NAMES, decoyMcpPath, peekRpc } from './decoy';

describe('MCP umpan: peekRpc', () => {
  it('mengambil method dan nama tool dari tools/call', () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ambil_kredensial', arguments: { layanan: 'vpn' } },
    });
    expect(peekRpc(body)).toEqual({ rpc: 'tools/call', tool: 'ambil_kredensial' });
  });

  it('method lain tanpa tool; batch memakai pesan pertama', () => {
    expect(peekRpc('{"jsonrpc":"2.0","id":1,"method":"tools/list"}')).toEqual({
      rpc: 'tools/list',
      tool: null,
    });
    expect(peekRpc('[{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}]')).toEqual({
      rpc: 'initialize',
      tool: null,
    });
  });

  it('input rusak atau aneh tidak pernah melempar, dan dipotong', () => {
    for (const bad of [null, '', 'bukan json', '42', '"x"', '{"method":7}', '[]', '{}']) {
      expect(peekRpc(bad)).toEqual({ rpc: null, tool: null });
    }
    const long = peekRpc(
      JSON.stringify({ method: 'tools/call', params: { name: 'x'.repeat(500) } }),
    );
    expect(long.tool?.length).toBe(64);
  });
});

describe('MCP umpan: definisi', () => {
  it('setiap tool memakai arm labirin yang tetap', () => {
    expect(Object.keys(DECOY_TOOL_ARMS).sort()).toEqual([...DECOY_TOOL_NAMES].sort());
  });

  it('path di bawah akar labirin (honeylink)', () => {
    expect(decoyMcpPath('/arsip-internal')).toBe('/arsip-internal/mcp');
  });
});
