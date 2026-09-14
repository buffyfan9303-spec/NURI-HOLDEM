// 관리자 광고 슬롯 — '연결할 수 있는 자리' 와 '저장이 진짜 닿았는가' 계약 (2026-09-15 오너 리포트)
//
// 오너 리포트: "노출관리 광고 탭에 '게시글 연결 필요'라고 되어 있는데 게시글에 연결할 수 있는 부분이 없어."
// 운영 DB 실측(2026-09-15): community_ads 에 **슬롯 1·3·4·5 네 행만** 있고 2번 행이 아예 없었다.
// 화면은 테이블에 있는 행만 그렸으므로 '커뮤니티 광고 5칸' 이라고 써 놓고 네 칸만 그렸고,
// 없는 자리에는 버튼이 없으니 그 칸에 글을 연결할 방법 자체가 없었다.
//
// 잠그는 것
//  ① getAdSlots 는 DB 에 행이 없어도 **1~5 다섯 자리를 항상** 돌려준다(빈 칸도 조작 대상이다).
//  ② saveAdSlot 은 **서버가 돌려준 행**을 준다 — 낙관적 입력값을 되돌려 주지 않는다.
//  ③ 0행(= RLS 가 조용히 막은 변이)은 성공이 아니라 오류다(nuri-affect).
// 실행: npx vitest run src/api/ads.slots.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Row { slot: number; post_id: string | null; active: boolean; starts_at: string | null; expires_at: string | null; title: string | null }

/** 서버가 돌려줄 값 — 테스트마다 갈아 끼운다 */
let selectRows: Row[] = [];
let selectError: unknown = null;
let upsertRows: Row[] = [];
let upsertError: unknown = null;
/** 실제로 나간 upsert 페이로드 */
let lastUpsert: Record<string, unknown> | null = null;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: selectRows, error: selectError }) }),
      upsert: (payload: Record<string, unknown>) => {
        lastUpsert = payload;
        return { select: () => Promise.resolve({ data: upsertRows, error: upsertError }) };
      },
    }),
  },
}));

const { getAdSlots, saveAdSlot, AD_SLOT_NUMBERS } = await import('./ads');

const row = (slot: number, over: Partial<Row> = {}): Row =>
  ({ slot, post_id: null, active: false, starts_at: null, expires_at: null, title: null, ...over });

beforeEach(() => {
  selectRows = []; selectError = null;
  upsertRows = []; upsertError = null;
  lastUpsert = null;
});

describe('getAdSlots — 다섯 자리는 항상 조작할 수 있다', () => {
  it('🔴 DB 에 2번 행이 없어도 1~5 다섯 칸을 돌려준다 (운영 실측 상태 재현)', async () => {
    // 2026-09-15 운영: 슬롯 1·3·4·5 만 존재
    selectRows = [1, 3, 4, 5].map((n) => row(n, { title: '옛 광고 ' + n }));
    const slots = await getAdSlots();
    expect(slots.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5]);
    // 없던 자리는 '비어 있는 연결 가능한 칸' 으로 나온다 — 여기에 버튼이 붙는다
    const two = slots.find((s) => s.slot === 2)!;
    expect(two).toEqual({ slot: 2, postId: null, active: false, startsAt: null, expiresAt: null, legacyTitle: '' });
  });

  it('행이 하나도 없어도 다섯 칸이 나온다 (빈 테이블 = 광고 칸이 없다 가 아니다)', async () => {
    selectRows = [];
    expect((await getAdSlots()).map((s) => s.slot)).toEqual([...AD_SLOT_NUMBERS]);
  });

  it('있는 행의 값은 그대로 매핑한다 (옛 문구는 지우지 않는다)', async () => {
    selectRows = [row(3, { post_id: 'p-3', active: true, starts_at: '2026-09-01', expires_at: '2026-09-30', title: '옛 문구' })];
    const s = (await getAdSlots()).find((x) => x.slot === 3)!;
    expect(s).toEqual({ slot: 3, postId: 'p-3', active: true, startsAt: '2026-09-01', expiresAt: '2026-09-30', legacyTitle: '옛 문구' });
  });

  it('1~5 밖의 옛 행이 있으면 잃어버리지 않고 뒤에 붙인다', async () => {
    selectRows = [row(7, { title: '옛 7번' })];
    expect((await getAdSlots()).map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it('조회 실패는 빈 목록으로 위장하지 않고 던진다', async () => {
    selectError = { message: 'permission denied for table community_ads' };
    await expect(getAdSlots()).rejects.toThrow('permission denied');
  });
});

describe('saveAdSlot — 화면에 뜨는 것 = 서버에 있는 것', () => {
  const next = { slot: 2, postId: 'p-9', active: true, startsAt: null, expiresAt: null, legacyTitle: '' };

  it('🔴 0행이면 던진다 — RLS 가 조용히 막은 변이를 성공이라 말하지 않는다', async () => {
    upsertRows = [];                       // PostgREST 는 막힌 변이를 오류가 아니라 0행으로 준다
    await expect(saveAdSlot(next)).rejects.toThrow(/반영되지 않았습니다/);
  });

  it('🔴 낙관적 입력값이 아니라 서버가 돌려준 행을 준다', async () => {
    // 서버에는 옛 문구가 남아 있고 active 도 서버 판정이 이긴다
    upsertRows = [row(2, { post_id: 'p-9', active: false, title: '서버에 남아 있던 문구' })];
    const saved = await saveAdSlot(next);
    expect(saved).toEqual({ slot: 2, postId: 'p-9', active: false, startsAt: null, expiresAt: null, legacyTitle: '서버에 남아 있던 문구' });
  });

  it('없던 슬롯도 그대로 upsert 한다 (행이 없는 자리는 저장할 때 만들어진다)', async () => {
    upsertRows = [row(2, { post_id: 'p-9', active: true })];
    await saveAdSlot(next);
    expect(lastUpsert).toMatchObject({ slot: 2, post_id: 'p-9', active: true, starts_at: null, expires_at: null });
  });

  it('서버 오류는 그대로 올린다', async () => {
    upsertError = { message: 'new row violates row-level security policy' };
    await expect(saveAdSlot(next)).rejects.toThrow(/row-level security/);
  });
});
