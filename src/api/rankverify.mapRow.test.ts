// 🔴 2026-09-21 — 행 매핑 계약. 뮤테이션 검증에서 **사살률 0%** 였던 두 줄을 잠근다.
//
// 왜 중요한가: `rankverify.ts` 의 `mapRow` 는 DB 행을 화면 모델로 옮기는데,
//   `eventKind` 는 **국내 순위 합산 여부를 가른다**(같은 파일 주석: "국내 순위는 official 만 합산").
//   `node scripts/mutation-check.mjs --file src/api/rankverify.ts` 가 이 두 줄의 `===` 를 `!==` 로
//   바꿔도 테스트가 전부 통과했다 — 즉 **펍 게임과 공식 대회가 통째로 뒤바뀌어도 아무도 못 잡는다.**
//   (그 스크립트 자신이 적는다: "금액 계산·권한·순서 판정에서 생존자가 나오면 그건 진짜 구멍이다.")
//
// mapRow 는 export 되지 않으므로 **공개 API**(adminListRankVerifications)를 통해 잰다 —
//   내보내기를 늘리지 않고 실제 경로를 그대로 지난다.
import { describe, it, expect, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rows: any[] = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    from: () => {
      // from().select().eq().order() → { data, error }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: rows, error: null }),
      };
      return chain;
    },
  },
}));

const rv = await import('./rankverify');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', nickname: '닉', event_name: '대회', amount_won: 1_000_000,
  event_kind: 'official', is_overseas: false,
  status: 'pending', admin_note: null, created_at: '2026-09-01T00:00:00Z',
  proof_url: 'p.png', id_card_path: null, user_id: 'u1', ...over,
});

describe('mapRow — 국내 순위 합산을 가르는 두 필드', () => {
  it("event_kind 가 'pub' 이면 pub, 그 밖은 전부 official 이다", async () => {
    rows = [row({ id: 'a', event_kind: 'pub' }), row({ id: 'b', event_kind: 'official' }),
            row({ id: 'c', event_kind: null }), row({ id: 'd', event_kind: '이상한값' })];
    const out = await rv.adminListRankVerifications();
    expect(out.map((x) => [x.id, x.eventKind]),
      "'pub' 만 pub 이고 나머지는 official 이어야 한다 — 뒤바뀌면 펍이 전국 랭킹에 들어간다")
      .toEqual([['a', 'pub'], ['b', 'official'], ['c', 'official'], ['d', 'official']]);
  });

  it('is_overseas 는 **정확히 true** 일 때만 true 다(문자열 "true"·1 은 아니다)', async () => {
    rows = [row({ id: 'a', is_overseas: true }), row({ id: 'b', is_overseas: false }),
            row({ id: 'c', is_overseas: null }), row({ id: 'd', is_overseas: 'true' }),
            row({ id: 'e', is_overseas: 1 })];
    const out = await rv.adminListRankVerifications();
    expect(out.map((x) => [x.id, x.isOverseas]))
      .toEqual([['a', true], ['b', false], ['c', false], ['d', false], ['e', false]]);
  });

  it('전제: 목킹이 실제로 걸렸다 — 행이 0개면 위 두 검사가 공허해진다', async () => {
    rows = [row()];
    const out = await rv.adminListRankVerifications();
    expect(out.length, '목킹한 행이 매핑을 통과해 나오지 않았다').toBe(1);
    expect(out[0].amountWon).toBe(1_000_000);
  });
});
