// D2(2026-09-28) — 클락 제어 저장의 CAS(내가 보고 누른 상태가 아직 서버에 그대로일 때만) + B2 대회 시작 시각 채우기.
//
// 재현(감사 D2): 폰이 잠든 사이 PC 가 정지 → 깨어난 폰(여전히 '진행 중')이 STOP → 옛 ends_at 으로 계산한 remaining_ms 가
//   조건 없이 들어가 정지해 있던 시간이 사라졌다. 음성 대조: saveClockPatch 의 CAS 필터를 빼면 1·2번이 빨개진다.
// 실행: npx vitest run src/api/clock.cas.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = [string, ...unknown[]];
const calls: Call[] = [];
let rows: unknown[] = [{}];
const chain = (table: string) => {
  const q: Record<string, unknown> = {};
  const rec = (name: string) => (...a: unknown[]) => { calls.push([`${table}.${name}`, ...a]); return q; };
  for (const n of ['update', 'eq', 'is', 'filter', 'match']) q[n] = rec(n);
  q.select = (...a: unknown[]) => { calls.push([`${table}.select`, ...a]); return Promise.resolve({ data: rows, error: null }); };
  return q;
};
const rpcCalls: [string, Record<string, unknown>][] = [];
let countRpcError: { code: string; message?: string } | null = null;
vi.mock('../lib/supabase', () => ({ IS_MOCK: false, supabase: { from: (t: string) => chain(t), rpc: async (name: string, args: Record<string, unknown>) => {
  rpcCalls.push([name, args]);
  if (name === 'clock_adjust_counts') return { data: null, error: countRpcError };
  return { data: null, error: { code: 'PGRST202' } };
} } }));
const { saveClockPatch, emptyClockState, defaultClockConfig, CLOCK_STALE_TEXT, CLOCK_COUNT_RPC_MISSING_TEXT } = await import('./clock');

const base = () => ({ ...emptyClockState('v1', defaultClockConfig(), 1), sessionDate: '2026-09-28' });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('saveClockPatch CAS', () => {
  beforeEach(() => { calls.length = 0; rows = [{}]; rpcCalls.length = 0; countRpcError = null; });

  it('진행 중 클락을 멈출 때 — 내가 본 ends_at·레벨·running 이 그대로일 때만 쓴다', async () => {
    const b = { ...base(), running: true, currentIndex: 2, endsAt: '2026-09-28T10:20:00.000Z', remainingMs: 0 };
    await saveClockPatch(b, { ...b, running: false, endsAt: null, remainingMs: 300_000 });
    const f = calls.filter((c) => c[0].startsWith('clock_states.'));
    expect(f).toContainEqual(['clock_states.eq', 'running', true]);
    expect(f).toContainEqual(['clock_states.eq', 'current_index', 2]);
    expect(f).toContainEqual(['clock_states.filter', 'ends_at', 'eq', '2026-09-28T10:20:00.000Z']);
  });

  it('정지 중 클락을 재개할 때 — ends_at 없음 + 남은 시간이 그대로일 때만 쓴다', async () => {
    const b = { ...base(), running: false, currentIndex: 1, endsAt: null, remainingMs: 420_000 };
    await saveClockPatch(b, { ...b, running: true, endsAt: '2026-09-28T10:07:00.000Z' });
    const f = calls.filter((c) => c[0].startsWith('clock_states.'));
    expect(f).toContainEqual(['clock_states.filter', 'ends_at', 'is', null]);
    expect(f).toContainEqual(['clock_states.match', { remaining_ms: 420_000 }]);
  });

  it('0행(다른 기기가 먼저 바꿈)이면 CLOCK_STALE_TEXT 로 실패한다 — 저장기가 되돌리고 다시 읽는다', async () => {
    rows = [];
    const b = { ...base(), running: true, currentIndex: 0, endsAt: '2026-09-28T10:20:00.000Z' };
    await expect(saveClockPatch(b, { ...b, running: false, endsAt: null, remainingMs: 1 })).rejects.toThrow(CLOCK_STALE_TEXT);
  });

  it('±카운트만 바꾸는 조작에는 CAS 를 걸지 않는다(서로 다른 칸이라 경합이 아니다)', async () => {
    const b = { ...base(), running: true, endsAt: '2026-09-28T10:20:00.000Z' };
    await saveClockPatch(b, { ...b, eliminations: 3 });
    expect(calls.some((c) => c[0] === 'clock_states.filter' || (c[0] === 'clock_states.eq' && c[1] === 'running'))).toBe(false);
  });

  // 🔴 K1(2026-09-29 실측 2A·2C) — 카운트는 **차분**으로 서버 원자 RPC 에 간다. 절대값 UPDATE 로 되돌리면
  //   동시 탈락 두 건이 한 건이 되고, 잠든 폰의 탈락 한 번이 그 사이 다른 기기의 3건을 지운다.
  //   음성 대조: saveClockPatch 의 deltas 블록을 지우고 clockPatchRow 에 eliminations 를 되살리면 아래 두 단언이 빨개진다.
  it('🔴 탈락·보정은 차분(next − base)만 clock_adjust_counts 로 — clock_states 에 절대값을 쓰지 않는다', async () => {
    const b = { ...base(), eliminations: 0, adjEntries: 2 };
    await saveClockPatch(b, { ...b, eliminations: 1, adjEntries: 1 });
    expect(rpcCalls).toEqual([['clock_adjust_counts', { p_venue_id: 'v1', p_game_seq: 1, p_d_elim: 1, p_d_entries: -1, p_d_rebuys: 0, p_d_earlies: 0, p_d_addons: 0 }]]);
    expect(calls.filter((c) => c[0] === 'clock_states.update')).toEqual([]);
  });

  it('🔴 서버에 RPC 가 없으면(PGRST202) 옛 절대값 쓰기로 떨어지지 않고 오류를 보인다', async () => {
    countRpcError = { code: 'PGRST202' };
    const b = base();
    await expect(saveClockPatch(b, { ...b, eliminations: 1 })).rejects.toThrow(CLOCK_COUNT_RPC_MISSING_TEXT);
    expect(calls.filter((c) => c[0] === 'clock_states.update')).toEqual([]);
  });

  it('B2 — 연동 클락이 처음 돌면 장부의 비어 있는 대회 시작 시각을 채운다(업주 입력은 is null 로 보존)', async () => {
    const b = { ...base(), running: false, endsAt: null, remainingMs: 1_200_000 };
    await saveClockPatch(b, { ...b, running: true, endsAt: '2026-09-28T10:20:00.000Z' });
    await flush();
    const l = calls.filter((c) => c[0].startsWith('ledger_sessions.'));
    expect(l.find((c) => c[0] === 'ledger_sessions.update')?.[1]).toMatchObject({ tournament_start: expect.any(String) });
    expect(l).toContainEqual(['ledger_sessions.is', 'tournament_start', null]);
    expect(l).toContainEqual(['ledger_sessions.eq', 'closed', false]);
    expect(l).toContainEqual(['ledger_sessions.eq', 'session_date', '2026-09-28']);
  });

  it('B2 — 정지(running→false)나 미연동(sessionDate 없음) 클락은 시작 시각을 건드리지 않는다', async () => {
    const run = { ...base(), running: true, endsAt: '2026-09-28T10:20:00.000Z' };
    await saveClockPatch(run, { ...run, running: false, endsAt: null, remainingMs: 1 });
    const solo = { ...base(), sessionDate: null, running: false, endsAt: null, remainingMs: 5 };
    await saveClockPatch(solo, { ...solo, running: true, endsAt: '2026-09-28T10:20:00.000Z' });
    await flush();
    expect(calls.some((c) => c[0].startsWith('ledger_sessions.'))).toBe(false);
  });
});
