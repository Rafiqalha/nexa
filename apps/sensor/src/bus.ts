import type { EventRow, SessionRow } from './db/schema';

/** Peristiwa internal sensor; dipakai SSE dashboard dan hook pasca-sesi. */
export interface BusEvents {
  'session:upsert': SessionRow;
  'session:closed': SessionRow;
  'event:new': EventRow;
  'canary:triggered': { canaryId: string; sessionId: string; triggerSessionId: string | null };
  'rule:changed': { ruleId: number };
  'intel:changed': { sessionId: string };
}

type Handler<T> = (payload: T) => void;

export class Bus {
  private readonly handlers = new Map<keyof BusEvents, Set<Handler<never>>>();

  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as Handler<BusEvents[K]>)(payload);
      } catch {
        // Satu subscriber gagal tidak boleh mengganggu jalur request.
      }
    }
  }
}
