// 오너 2026-09-25 MYSTORE-FULL-AUDIT — 클락 API 의 C2·C3·C8 회귀 검사.
//   C2 saveClockLevel 은 CAS(ends_at 조건)가 막았을 때 0 을 돌려줘야 호출부가 재조회한다(예전 void).
//   C3 getRunningClocks 는 running=true 여도 마지막 레벨을 다 쓴 행을 라이브 목록에서 뺀다.
//   C8 사이드 날짜는 기기 로컬 오늘이 아니라 현재 클락 → 메인 클락 → KST 오늘 순이다.
// 음성 대조: 각 수정 줄을 되돌리면(void 반환 · filter 제거 · toLocaleDateString) 해당 it 이 빨개진다(보고에 기록).
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
let rows: Row[] = [];
let lastFilters: Array<[string, unknown]> = [];
let updateRows: Row[] = [];

function builder(kind: 'select' | 'update') {
  const b = {
    eq(col: string, v: unknown) { lastFilters.push([col, v]); return b; },
    order() { return b; },
    select() { return b; },
    then(res: (v: { data: Row[]; error: null }) => unknown) {
      return Promise.resolve(res({ data: kind === 'select' ? rows : updateRows, error: null }));
    },
  };
  return b;
}
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    from: () => ({ select: () => builder('select'), update: () => builder('update') }),
  },
}));

const clock = await import('./clock');

const NOW = Date.now();
const L = (m: number) => ({ kind: 'level', sb: 100, bb: 200, ante: 0, minutes: m });
const row = (o: Row): Row => ({
  venue_id: 'v', game_seq: 1, session_date: null, title: 't', config: { levels: [L(20), L(20)] },
  current_index: 0, running: true, ends_at: new Date(NOW + 60_000).toISOString(), remaining_ms: 0,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null, ...o,
});

beforeEach(() => { rows = []; lastFilters = []; updateRows = []; });

describe('C3 — 라이브 목록은 소진된 running 행을 뺀다', () => {
  it('8일 전에 시작해 방치된 running 행은 목록에 없다 · 진행 중 행은 남는다', async () => {
    rows = [
      row({ venue_id: 'ghost', ends_at: new Date(NOW - 8 * 86_400_000).toISOString() }),
      row({ venue_id: 'live' }),
    ];
    const got = await clock.getRunningClocks();
    expect(got.map((g) => g.venueId)).toEqual(['live']);
  });
});

describe('C2 — CAS 가 막으면 0 을 돌려준다', () => {
  it('반영 0행 → 0, ends_at 조건이 실제로 걸린다', async () => {
    updateRows = [];
    const n = await clock.saveClockLevel('v', 1, { currentIndex: 1, remainingMs: 1, endsAt: 'x' }, '2026-09-25T00:00:00.000Z');
    expect(n).toBe(0);
    expect(lastFilters).toContainEqual(['ends_at', '2026-09-25T00:00:00.000Z']);
  });
  it('반영 1행 → 1', async () => {
    updateRows = [{ venue_id: 'v' }];
    expect(await clock.saveClockLevel('v', 1, { currentIndex: 1, remainingMs: 1, endsAt: 'x' }, 'e')).toBe(1);
  });
});

describe('C8 — 사이드 날짜', () => {
  const at15z = Date.UTC(2026, 8, 25, 15, 30);   // KST 9/26 00:30 — 기기가 UTC 면 로컬 오늘은 9/25
  it('현재 클락의 장부 날짜가 이긴다(자정 넘긴 대회)', () => {
    expect(clock.sideGameDate({ sessionDate: '2026-09-24' }, { sessionDate: '2026-09-23' }, at15z)).toBe('2026-09-24');
  });
  it('현재가 단독이면 메인 클락의 장부 날짜', () => {
    expect(clock.sideGameDate({ sessionDate: null }, { sessionDate: '2026-09-25' }, at15z)).toBe('2026-09-25');
  });
  it('둘 다 없으면 KST 오늘(기기 로컬 아님)', () => {
    expect(clock.sideGameDate(null, null, at15z)).toBe('2026-09-26');
  });
});
