// NURI SPOT '날짜 직접 지정' — 오너 2026-09-25 SPOT-DATE 결정.
//
// 서버는 played_on(date, nullable)를 spot_reviews 에 추가했다(20260925b) — null 이면 화면이
// created_at 의 KST 날짜로 대신 보여준다. 여기서 잠그는 것은 **클라이언트가 그 컬럼을 실제로
// 읽고·쓰고·갱신하는지**뿐이다(날짜 계산 자체는 CalendarPanel/kst.ts 쪽 책임).
// 실행: npx vitest run src/api/spots.playedOn.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emptySpot, toJSON } from '../lib/spot';
import { evaluateSpot } from '../lib/spotEvaluate';

let lastInsert: Record<string, unknown> | null = null;
let lastUpdate: Record<string, unknown> | null = null;
let lastUpdateEqId: string | null = null;
let selectRow: Record<string, unknown> | null = null;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
    from: (table: string) => {
      if (table !== 'spot_reviews') throw new Error(`예상 밖 테이블: ${table}`);
      return {
        insert: (payload: Record<string, unknown>) => {
          lastInsert = payload;
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'row1' }, error: null }) }) };
        },
        update: (payload: Record<string, unknown>) => {
          lastUpdate = payload;
          return { eq: (_col: string, id: string) => { lastUpdateEqId = id; return { select: () => Promise.resolve({ data: [{}], error: null }) }; } };
        },
        select: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: selectRow ? [selectRow] : [], error: null }) }),
        }),
      };
    },
  },
}));

const { saveMySpot, updateSpotPlayedOn, listMySpots } = await import('./spots');

beforeEach(() => {
  lastInsert = null; lastUpdate = null; lastUpdateEqId = null; selectRow = null;
});

const spot = emptySpot();
const evaluation = evaluateSpot(spot, { heroEquity: null });

describe('saveMySpot — played_on', () => {
  it('고른 날짜를 played_on 으로 함께 저장한다', async () => {
    const id = await saveMySpot(spot, evaluation, '2026-09-20');
    expect(id).toBe('row1');
    expect(lastInsert).not.toBeNull();
    expect(lastInsert!.played_on).toBe('2026-09-20');
  });

  it('날짜를 안 주면 played_on 은 null — 서버가 created_at 의 KST 날짜로 대신 보여준다', async () => {
    await saveMySpot(spot, evaluation);
    expect(lastInsert!.played_on).toBeNull();
  });

  // 음성 대조: saveMySpot 에서 `played_on: playedOn ?? null,` 한 줄을 지우면
  // lastInsert!.played_on 이 undefined 가 되어 위 두 단언이 FAIL 한다(실측 확인).
});

describe('updateSpotPlayedOn — 저장한 뒤에도 날짜를 바꾼다', () => {
  it('id·날짜를 그대로 update 페이로드로 보낸다', async () => {
    await updateSpotPlayedOn('row1', '2026-09-21');
    expect(lastUpdate).toEqual({ played_on: '2026-09-21' });
    expect(lastUpdateEqId).toBe('row1');
  });

  it('null 을 주면 played_on 을 다시 비운다(날짜 선택 취소)', async () => {
    await updateSpotPlayedOn('row1', null);
    expect(lastUpdate).toEqual({ played_on: null });
  });
});

describe('listMySpots — played_on 을 읽어 playedOn 으로 돌려준다', () => {
  it('서버 행의 played_on 이 SavedSpot.playedOn 이 된다', async () => {
    selectRow = {
      id: 'row1', spot: toJSON(spot), coverage_kind: evaluation.kind,
      source_label: null, dataset_version: evaluation.datasetVersion,
      created_at: '2026-09-19T10:00:00Z', played_on: '2026-09-20',
    };
    const rows = await listMySpots();
    expect(rows).toHaveLength(1);
    expect(rows[0].playedOn).toBe('2026-09-20');
  });

  it('played_on 이 없는(옛) 행은 playedOn 이 null — createdAt 은 그대로 남는다', async () => {
    selectRow = {
      id: 'row1', spot: toJSON(spot), coverage_kind: evaluation.kind,
      source_label: null, dataset_version: evaluation.datasetVersion,
      created_at: '2026-09-19T10:00:00Z', played_on: null,
    };
    const rows = await listMySpots();
    expect(rows[0].playedOn).toBeNull();
    expect(rows[0].createdAt).toBe('2026-09-19T10:00:00Z');
  });

  // 음성 대조: rowToSaved 에서 `playedOn: (r.played_on as string | null) ?? null,` 을 지우면
  // rows[0].playedOn 이 undefined 가 되어 위 두 단언이 FAIL 한다(실측 확인).
});
