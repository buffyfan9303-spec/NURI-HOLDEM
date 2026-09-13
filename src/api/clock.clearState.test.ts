// C07(2026-09-12 재현/고정): clearClockState 가 DELETE 응답의 error 를 확인하지 않았다.
//
// 재현: 403/500 이 와도 호출부(TournamentClock.endClock)가 성공으로 알고
//   '클락을 종료했습니다' 안내 + 설정 화면 이동을 해 버린다 — 실제로는 서버에 그대로 남아 있다.
// 고침: DELETE 응답의 error 를 확인해 던진다.
//   (error 를 다시 무시하도록 되돌리면 아래 두 번째 테스트가 실패한다 — 음성 대조.)
// 2026-09-13 확장: RLS 거부는 error 가 아니라 **0행 200** 이다(_mustAffect.ts) — 그것도 성공이 아니다.
//   mustAffect 를 빼고 `if (error) throw error` 로 되돌리면 세 번째 테스트가 실패한다.
// 실행: npx vitest run src/api/clock.clearState.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let result: { data: unknown[] | null; error: unknown };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: () => {
      const q = {
        delete: () => q,
        eq: () => q,
        select: () => q,
        then: (resolve: (v: { data: unknown[] | null; error: unknown }) => void) => resolve(result),
      };
      return q;
    },
  },
}));

const { clearClockState } = await import('./clock');
const { NoRowsAffectedError } = await import('./_mustAffect');

beforeEach(() => { result = { data: [{ venue_id: 'v1', game_seq: 1 }], error: null }; });

describe('clearClockState · DELETE 실패를 전파한다(C07)', () => {
  it('1행이 지워지면 조용히 끝난다', async () => {
    await expect(clearClockState('v1', 1)).resolves.toBeUndefined();
  });

  it('DELETE 응답에 error 가 있으면 던진다', async () => {
    result = { data: null, error: { message: '권한이 없습니다', code: '42501' } };
    await expect(clearClockState('v1', 1)).rejects.toBeTruthy();
  });

  it('🔴 RLS 거부(0행 · error 없음)도 던진다 — TV 에는 클락이 계속 돌고 있다', async () => {
    result = { data: [], error: null };
    await expect(clearClockState('v1', 1)).rejects.toBeInstanceOf(NoRowsAffectedError);
    await expect(clearClockState('v1', 1)).rejects.toThrow(/종료할 클락을 찾지 못했습니다/);
  });
});
