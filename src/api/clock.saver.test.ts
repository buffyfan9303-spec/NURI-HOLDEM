// 클락 조작 저장기 — 연타 합치기·순서 보장·바뀐 칸만 (오너 2026-09-24 CLOCK-TAP-LAG)
//
// 재현(e2e/clock-tap-latency · 왕복 300ms · 탭 250ms 간격): 예전엔 탭마다 전 행 upsert 가 병렬로 나가고,
//   자기 저장의 realtime 에코가 부른 재조회가 앞선 탭까지만 반영된 값으로 화면을 되돌려 20탭이 +11 로 끝났다.
// 실행: npx vitest run src/api/clock.saver.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ IS_MOCK: false, supabase: {} }));
const { createCoalescingSaver, clockPatchRow, emptyClockState } = await import('./clock');

type S = { k: string; v: number };
function harness() {
  const calls: { next: S; base: S }[] = [];
  const gates: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  let concurrent = 0; let maxConcurrent = 0;
  const events: string[] = [];
  const saver = createCoalescingSaver<S>(
    (s) => s.k,
    (next, base) => new Promise<void>((resolve, reject) => {
      calls.push({ next, base });
      concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
      gates.push({ resolve: () => { concurrent--; resolve(); }, reject: (e) => { concurrent--; reject(e); } });
    }),
    { error: (_e, back) => events.push(`error:${back.v}`), idle: () => events.push('idle') },
  );
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { saver, calls, gates, events, flush, max: () => maxConcurrent };
}

describe('createCoalescingSaver', () => {
  it('날아가는 동안 들어온 탭은 마지막 값 하나로 합치고, 한 번에 한 요청만 보낸다', async () => {
    const h = harness();
    h.saver.push({ k: 'g1', v: 1 }, { k: 'g1', v: 0 });
    for (let v = 2; v <= 20; v++) h.saver.push({ k: 'g1', v }, { k: 'g1', v: v - 1 });
    expect(h.calls.map((c) => c.next.v)).toEqual([1]);
    expect(h.saver.busy).toBe(true);
    h.gates[0].resolve(); await h.flush();
    expect(h.calls.map((c) => c.next.v), '중간 값은 보내지 않고 최종값 하나만').toEqual([1, 20]);
    expect(h.calls[1].base.v, '두 번째 저장의 기준은 서버가 받아 준 값(1)').toBe(1);
    h.gates[1].resolve(); await h.flush();
    expect(h.max(), '동시에 두 요청이 날아갔다 — 도착 순서가 뒤섞일 수 있다').toBe(1);
    expect(h.saver.busy).toBe(false);
    expect(h.events).toEqual(['idle']);
  });

  it('첫 저장의 기준은 연타 직전 값이다', async () => {
    const h = harness();
    h.saver.push({ k: 'g1', v: 5 }, { k: 'g1', v: 4 });
    expect(h.calls[0].base.v).toBe(4);
  });

  it('실패하면 그 뒤에 쌓인 탭은 버리고, 서버가 마지막으로 받아 준 값으로 되돌린다', async () => {
    const h = harness();
    h.saver.push({ k: 'g1', v: 1 }, { k: 'g1', v: 0 });
    h.saver.push({ k: 'g1', v: 2 }, { k: 'g1', v: 1 });
    h.gates[0].resolve(); await h.flush();          // 1 확정
    h.saver.push({ k: 'g1', v: 3 }, { k: 'g1', v: 2 }); // 2 가 날아가는 중 3 대기
    h.gates[1].reject(new Error('net')); await h.flush();
    expect(h.events).toEqual(['error:1', 'idle']);
    expect(h.calls.map((c) => c.next.v), '실패한 값 위의 3 은 보내지 않는다').toEqual([1, 2]);
    expect(h.saver.busy).toBe(false);
  });

  it('다른 게임(키)의 대기 값은 합쳐지지 않는다 — 게임 전환 직후 탭이 사라지지 않게', async () => {
    const h = harness();
    h.saver.push({ k: 'g1', v: 1 }, { k: 'g1', v: 0 });
    h.saver.push({ k: 'g2', v: 7 }, { k: 'g2', v: 6 });
    h.saver.push({ k: 'g1', v: 2 }, { k: 'g1', v: 1 });
    h.gates[0].resolve(); await h.flush();
    h.gates[1].resolve(); await h.flush();
    h.gates[2]?.resolve(); await h.flush();
    expect(h.calls.map((c) => `${c.next.k}:${c.next.v}`).sort()).toEqual(['g1:1', 'g1:2', 'g2:7']);
    expect(h.calls.find((c) => c.next.k === 'g2')!.base.v).toBe(6);
  });
});

describe('clockPatchRow — 바뀐 칸만', () => {
  const base = { ...emptyClockState('v1'), eliminations: 3, currentIndex: 2 };
  it('엔트리 보정만 바꾸면 adj_entries 만 나간다(탈락·레벨은 다른 기기 몫이라 다시 쓰지 않는다)', () => {
    expect(clockPatchRow(base, { ...base, adjEntries: 4 })).toEqual({ adj_entries: 4 });
  });
  it('통계 스냅샷이 바뀌면 live_stats 도 나간다', () => {
    const ls = { entries: 5, rebuys: 0, earlies: 0, addons: 0, alive: 2, eliminations: 3, totalStack: 0, avgStack: 0 };
    expect(Object.keys(clockPatchRow(base, { ...base, adjEntries: 1, liveStats: ls })).sort()).toEqual(['adj_entries', 'live_stats']);
  });
  it('시작/정지는 running·ends_at·remaining_ms 만', () => {
    const next = { ...base, running: true, endsAt: '2026-09-24T00:00:00.000Z', remainingMs: 0 };
    expect(Object.keys(clockPatchRow(base, next)).sort()).toEqual(['ends_at', 'remaining_ms', 'running']);
  });
  it('변화가 없으면 빈 조각', () => {
    expect(clockPatchRow(base, { ...base })).toEqual({});
  });
});
