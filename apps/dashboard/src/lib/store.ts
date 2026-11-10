// State aplikasi kecil (tanpa library): overview, ringkasan sesi, dan linimasa yang dibuka.
// Diperbarui realtime oleh SSE; komponen membaca lewat useSyncExternalStore.
import type {
  Overview,
  Rule,
  SessionDetail,
  SessionSummary,
  StreamMessage,
  TimelineEvent,
} from '@nexa/shared';
import { useSyncExternalStore } from 'react';
import type { ConnectionState } from './stream';

export interface AppState {
  overview: Overview | null;
  sessions: ReadonlyMap<string, SessionSummary>;
  details: ReadonlyMap<string, SessionDetail>;
  rules: ReadonlyMap<number, Rule>;
  connection: ConnectionState;
  /** Penanda perubahan intel (halaman Intel memuat ulang bila berubah). */
  intelVersion: number;
}

let state: AppState = {
  overview: null,
  sessions: new Map(),
  details: new Map(),
  rules: new Map(),
  connection: 'connecting',
  intelVersion: 0,
};
const listeners = new Set<() => void>();

function set(next: Partial<AppState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function setConnection(connection: ConnectionState): void {
  if (state.connection !== connection) set({ connection });
}

export function setOverview(overview: Overview): void {
  const sessions = new Map(state.sessions);
  for (const s of overview.contacts) sessions.set(s.id, s);
  const rules = new Map(state.rules);
  for (const r of overview.pendingRules) rules.set(r.id, r);
  set({ overview, sessions, rules });
}

export function setSessions(list: readonly SessionSummary[]): void {
  const sessions = new Map(state.sessions);
  for (const s of list) sessions.set(s.id, s);
  set({ sessions });
}

export function setRules(list: readonly Rule[]): void {
  set({ rules: new Map(list.map((r) => [r.id, r])) });
}

export function upsertRule(rule: Rule): void {
  const rules = new Map(state.rules);
  rules.set(rule.id, rule);
  const details = new Map(state.details);
  if (rule.sessionId) {
    const d = details.get(rule.sessionId);
    if (d) {
      const others = d.rules.filter((r) => r.id !== rule.id);
      details.set(rule.sessionId, { ...d, rules: [...others, rule].sort((a, b) => a.id - b.id) });
    }
  }
  set({ rules, details });
}

export function setDetail(detail: SessionDetail): void {
  const details = new Map(state.details);
  details.set(detail.session.id, detail);
  const sessions = new Map(state.sessions);
  sessions.set(detail.session.id, detail.session);
  set({ details, sessions });
}

function appendEvent(ev: TimelineEvent): void {
  const d = state.details.get(ev.sessionId);
  if (!d || d.events.some((e) => e.id === ev.id)) return;
  const details = new Map(state.details);
  details.set(ev.sessionId, { ...d, events: [...d.events, ev] });
  set({ details });
}

function upsertSession(s: SessionSummary): void {
  const sessions = new Map(state.sessions);
  sessions.set(s.id, s);
  const d = state.details.get(s.id);
  if (d) {
    const details = new Map(state.details);
    details.set(s.id, { ...d, session: s });
    set({ sessions, details });
  } else {
    set({ sessions });
  }
}

export function applyStreamMessage(msg: StreamMessage): void {
  switch (msg.type) {
    case 'overview':
      setOverview(msg.data);
      break;
    case 'session':
      upsertSession(msg.data);
      break;
    case 'event':
      appendEvent(msg.data);
      break;
    case 'rule':
      upsertRule(msg.data);
      break;
    case 'intel':
      set({ intelVersion: state.intelVersion + 1 });
      break;
  }
}

export function getState(): AppState {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
