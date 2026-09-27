// 열린 글 상세의 실시간 댓글 삭제 — DELETE 구독에 filter 를 걸면 알림이 **한 건도 안 온다**(2026-09-27 점검).
//
// Supabase Realtime 문서: "Delete events are not filterable" — filter 를 건 postgres_changes 는 DELETE 를 받지 못한다.
//   RLS 테이블의 DELETE 페이로드는 old 에 기본키(id)만 싣기 때문에 post_id 로 거를 수도 없다.
//   그래서 subscribePostComments 가 `post_id=eq.X` 필터를 DELETE 에도 걸어 두었을 때, 다른 기기에서 지운 댓글이
//   열린 상세에 그대로 남았다(INSERT·UPDATE 는 정상). 같은 부류가 장부(api/ledger.ts subscribeLedger D1)에서 먼저 났다.
// 고친 계약: DELETE 는 필터 없이 듣고 id 만 넘긴다 — 호출부의 applyCommentEvent 가 목록에 없는 id 는 무시한다.
// 실행: npx vitest run src/api/community.realtimeDelete.test.ts
import { describe, it, expect, vi } from 'vitest';

type On = { type: string; cfg: { event: string; table: string; filter?: string }; cb: (p: unknown) => void };
const ons: On[] = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    channel: () => {
      const ch = {
        on: (type: string, cfg: On['cfg'], cb: On['cb']) => { ons.push({ type, cfg, cb }); return ch; },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: () => {},
  },
}));

const { subscribePostComments } = await import('./community');

describe('subscribePostComments — 삭제 전파', () => {
  it('DELETE 구독에는 filter 가 없다(필터가 있으면 Realtime 이 DELETE 를 보내지 않는다)', () => {
    ons.length = 0;
    subscribePostComments('p1', () => {});
    const del = ons.filter((o) => o.cfg.event === 'DELETE');
    expect(del).toHaveLength(1);
    expect(del[0].cfg.table).toBe('comments');
    expect(del[0].cfg.filter).toBeUndefined();
  });

  it('INSERT·UPDATE 는 이 글로 좁힌 채 유지한다(과구독 방지)', () => {
    ons.length = 0;
    subscribePostComments('p1', () => {});
    for (const ev of ['INSERT', 'UPDATE']) {
      expect(ons.find((o) => o.cfg.event === ev)?.cfg.filter).toBe('post_id=eq.p1');
    }
  });

  it('기본키만 실린 삭제 알림(old: {id})을 delete 이벤트로 넘긴다', () => {
    ons.length = 0;
    const got: unknown[] = [];
    subscribePostComments('p1', (e) => got.push(e));
    ons.find((o) => o.cfg.event === 'DELETE')!.cb({ old: { id: 'c9' } });
    expect(got).toEqual([{ type: 'delete', id: 'c9' }]);
  });
});
