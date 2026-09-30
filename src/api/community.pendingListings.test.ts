// 운영자 '개설·입점 승인' 대기열 — 점검 A-14(반려는 삭제가 아니라 상태) · A-03(새 매장도 대기열에 보인다), 2026-10-01
// 실행: npx vitest run src/api/community.pendingListings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; op: string; payload?: Record<string, unknown>; filters: [string, string, unknown][] };
let calls: Call[];
let rows: unknown[];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: (table: string) => {
      const c: Call = { table, op: 'select', filters: [] };
      calls.push(c);
      const q: Record<string, unknown> = {
        select: () => {
          // update/delete 뒤의 .select() 는 반영 행 확인(mustAffect) — 읽기 select 와 구분하려고 op 는 건드리지 않는다.
          if (c.op === 'select') return q;
          return Promise.resolve({ data: rows, error: null });
        },
        update: (p: Record<string, unknown>) => { c.op = 'update'; c.payload = p; return q; },
        delete: () => { c.op = 'delete'; return q; },
        eq: (k: string, v: unknown) => { c.filters.push(['eq', k, v]); return q; },
        neq: (k: string, v: unknown) => { c.filters.push(['neq', k, v]); return q; },
        order: () => q,
        then: (res: (v: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      return q;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'a1' } } }, error: null }) },
  },
}));

const community = await import('./community');
beforeEach(() => { calls = []; rows = [{ id: 'v1' }]; });

describe('rejectGroup — 삭제가 아니라 숨김 상태', () => {
  it("status='hidden' 으로 update 하고 delete 는 보내지 않는다 · 미승인 행에만", async () => {
    await community.rejectGroup('v1');
    expect(calls.map((c) => c.op)).toEqual(['update']);
    expect(calls[0].payload).toMatchObject({ status: 'hidden' });
    expect(calls[0].filters).toContainEqual(['eq', 'id', 'v1']);
    expect(calls[0].filters).toContainEqual(['eq', 'approved', false]);
  });
  it('이미 승인됐거나 처리돼 0행이면 던진다(성공으로 위장하지 않는다)', async () => {
    rows = [];
    await expect(community.rejectGroup('v1')).rejects.toThrow();
  });
});

describe('대기열 조회', () => {
  it('그룹 대기열은 미승인 · 반려(hidden) 제외', async () => {
    await community.getPendingGroups();
    const f = calls[0].filters;
    expect(f).toContainEqual(['eq', 'approved', false]);
    expect(f).toContainEqual(['neq', 'status', 'hidden']);
  });
});
