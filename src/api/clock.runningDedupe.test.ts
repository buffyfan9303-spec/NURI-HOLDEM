// R-05 ① A/B(2026-10-01) — 라이브 탭을 누르면 배지(App refreshClocks)와 본문(LiveGamesTab load)이 같은 순간 clock_states 를
// 각자 받아 응답 두 개가 ~100ms 간격으로 커밋됐다(늦은 커밋 프레임마다 래스터 지연). 이 파일이 잠그는 것:
//   ① 진행 중인 요청이 있으면 같은 요청을 쓴다(네트워크 1회 · 두 호출자가 같은 배열) ② 내용이 같으면 지난번 배열 그대로(다시 그리지 않기)
//   ③ 내용이 바뀌면 새 배열 ④ 실패는 삼키지 않고 다음 호출은 다시 요청한다.
// 음성 대조: getRunningClocks 의 inflight 공유를 빼면 ① 이(요청 2회), 같은-내용 비교를 빼면 ② 가 빨개진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
let rows: Row[] = [];
let calls = 0;
let fail = false;
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    from: () => ({
      select: () => {
        const b = {
          eq() { return b; },
          order() { calls += 1; const snap = rows.map((r) => ({ ...r })); const f = fail;
            return new Promise((res) => setTimeout(() => res(f ? { data: null, error: new Error('down') } : { data: snap, error: null }), 5)); },
        };
        return b;
      },
    }),
  },
}));

const clock = await import('./clock');
const NOW = Date.now();
const row = (o: Row): Row => ({
  venue_id: 'v', game_seq: 1, session_date: null, title: 't', config: { levels: [{ kind: 'level', sb: 100, bb: 200, ante: 0, minutes: 20 }] },
  current_index: 0, running: true, ends_at: new Date(NOW + 600_000).toISOString(), remaining_ms: 0,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null, ...o,
});

beforeEach(() => { calls = 0; fail = false; rows = [row({})]; });

describe('getRunningClocks — 동시 호출 1회 · 같은 내용이면 같은 참조', () => {
  it('① 동시에 두 번 부르면 요청은 1회이고 둘이 같은 배열을 받는다(배지 = 본문)', async () => {
    const [a, b] = await Promise.all([clock.getRunningClocks(), clock.getRunningClocks()]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });
  it('② 다음 조회 내용이 같으면 지난번 배열 그대로(React 가 다시 그리지 않는다)', async () => {
    const a = await clock.getRunningClocks();
    const b = await clock.getRunningClocks();
    expect(calls).toBe(2);
    expect(b).toBe(a);
  });
  it('③ 내용이 바뀌면 새 배열', async () => {
    const a = await clock.getRunningClocks();
    rows = [row({ eliminations: 3 })];
    const b = await clock.getRunningClocks();
    expect(b).not.toBe(a);
    expect(b[0].eliminations).toBe(3);
  });
  it('④ 실패는 던지고, 다음 호출은 다시 요청한다(진행 중 표식이 남지 않는다)', async () => {
    fail = true;
    await expect(clock.getRunningClocks()).rejects.toThrow('down');
    fail = false;
    await expect(clock.getRunningClocks()).resolves.toHaveLength(1);
    expect(calls).toBe(2);
  });
});
