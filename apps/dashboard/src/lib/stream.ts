// Klien SSE berbasis fetch (cookie sesi same-origin; token tidak pernah di URL).
import { type StreamMessage, StreamMessageSchema } from '@nexa/shared';
import { refreshAuth } from './auth';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface StreamHandlers {
  onMessage: (msg: StreamMessage) => void;
  onState: (state: ConnectionState) => void;
}

/** Mem-parsing blok SSE ("event: x\ndata: y"); mengembalikan sisa buffer yang belum lengkap. */
export function parseSseChunk(buffer: string, emit: (type: string, data: string) => void): string {
  let rest = buffer.replace(/\r\n/g, '\n');
  let idx = rest.indexOf('\n\n');
  while (idx >= 0) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let type = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) emit(type, data.join('\n'));
    idx = rest.indexOf('\n\n');
  }
  return rest;
}

export function connectStream(handlers: StreamHandlers): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let attempt = 0;

  const run = async () => {
    while (!stopped) {
      handlers.onState('connecting');
      controller = new AbortController();
      try {
        const res = await fetch('/api/stream', {
          credentials: 'same-origin',
          headers: { accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (res.status === 401 || res.status === 403) {
          // Sesi berakhir / wajib 2FA: status login dimuat ulang, layar menyesuaikan.
          void refreshAuth();
          return;
        }
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        attempt = 0;
        handlers.onState('open');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer = parseSseChunk(buffer + decoder.decode(value, { stream: true }), (type, data) => {
            try {
              const parsed = StreamMessageSchema.safeParse({ type, data: JSON.parse(data) });
              if (parsed.success) handlers.onMessage(parsed.data);
            } catch {
              // pesan rusak diabaikan
            }
          });
        }
      } catch {
        // koneksi putus; coba lagi
      }
      if (stopped) break;
      handlers.onState('closed');
      attempt += 1;
      await new Promise((r) => setTimeout(r, Math.min(10_000, 1_000 * attempt)));
    }
  };
  void run();

  return () => {
    stopped = true;
    controller?.abort();
  };
}
