// 차단 목록 dedupe 키에 uid 가 있는가(P0-09) — 비행 중 로그아웃→다른 계정 로그인이 겹치면
// 새 계정의 BlockContext 가 이전 계정의 프라미스를 그대로 받아 남의 차단 목록으로 글을 숨기던 것.
// 실행: npx vitest run src/api/blocks.dedupe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let uid = 'A';
/** from('user_blocks') 가 호출된 순간의 uid — 요청이 실제로 몇 번, 누구 명의로 나갔는가 */
const sent: string[] = [];
/** 테스트가 풀어 줄 때까지 대기하는 응답들 — '비행 중' 상태를 만들려고 즉시 resolve 하지 않는다 */
const pending: (() => void)[] = [];
// 체이닝(.select().order()…)은 자기 자신을 돌려주고, await 되는 지점(thenable)에서 응답을 보류한다
const chain = new Proxy(function () {} as unknown as Record<string, unknown>, {
  get(_t, prop) {
    if (prop === 'from') return () => { sent.push(uid); return chain; };
    if (prop === 'then') {
      return (res: (v: unknown) => void) => {
        pending.push(() => res({ data: [{ blocked_id: 'X-' + sent.length, blocked_name: 'x', created_at: '2026-09-10T00:00:00Z' }], error: null }));
      };
    }
    return () => chain;
  },
  apply: () => chain,
}) as unknown as { then: unknown };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  get supabase() { return chain; },
}));
vi.mock('./_session', () => ({
  currentUser: async () => ({ id: uid }),
}));

const { getMyBlockedIds, listMyBlocks } = await import('./blocks');

const tick = () => new Promise((r) => setTimeout(r, 0));
const flush = () => { while (pending.length) pending.shift()!(); };

beforeEach(() => { sent.length = 0; pending.length = 0; });

describe('차단 목록 dedupe — 키에 uid 가 있다', () => {
  for (const [name, fn] of [['getMyBlockedIds', getMyBlockedIds], ['listMyBlocks', listMyBlocks]] as const) {
    it(`${name} — 비행 중 계정이 바뀌면 새 계정은 새 요청을 받는다`, async () => {
      uid = 'A';
      const pa = fn();
      await tick();
      uid = 'B';
      const pb = fn();
      await tick();
      // 예전엔 ['A'] — B 가 A 의 프라미스에 합류해 A 의 차단 목록을 받았다
      expect(sent).toEqual(['A', 'B']);
      flush();
      const [ra, rb] = await Promise.all([pa, pb]);
      expect(ra).not.toBe(rb);
    });

    it(`${name} — 같은 계정의 동시 호출은 한 요청으로 합쳐진다(기존 dedupe 유지)`, async () => {
      uid = 'A';
      const p1 = fn();
      const p2 = fn();
      await tick();
      expect(sent).toEqual(['A']);
      flush();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
    });
  }
});
