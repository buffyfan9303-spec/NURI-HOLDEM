// venueRemove — 정지·비활성 매장은 보관을 제안하지 않고, 서버 상태값 원문을 화면에 싣지 않는다(review-admin-wire-1002 메모 ①②).
// 실행: npx vitest run src/lib/venueRemove.test.ts --maxWorkers=4
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
let rpcError: { message: string } | null = null;
const HAS_RECORDS = { message: '장부·이용권·출석 등 기록이 있는 매장은 삭제할 수 없습니다 — 숨김(보관)으로 전환하세요 (checkins)' };

vi.mock('./supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    rpc: async (name: string) => { calls.push(`rpc:${name}`); return { data: null, error: rpcError }; },
    from: (table: string) => {
      const q = {
        delete: () => { calls.push(`delete:${table}`); return q; },
        eq: () => q,
        select: () => Promise.resolve({ data: null, error: HAS_RECORDS }),
      };
      return q;
    },
  },
}));

const { removeOrArchiveVenue } = await import('./venueRemove');
const venue = { id: 'v-1', name: '테스트펍' };

beforeEach(() => { calls.length = 0; rpcError = null; vi.stubGlobal('confirm', () => true); });

describe('removeOrArchiveVenue — 기록 있는 매장', () => {
  for (const status of ['suspended', 'inactive'] as const) {
    it(`${status} 매장은 보관을 묻지 않고 이유를 던진다(보관 RPC 0회 · 원문 상태값 없음)`, async () => {
      const prompts: string[] = [];
      vi.stubGlobal('confirm', (m: string) => { prompts.push(m); return true; });
      const err = await removeOrArchiveVenue({ ...venue, status }).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('정지·비활성 매장은 보관');
      expect((err as Error).message).not.toMatch(/suspended|inactive|active/);
      expect(prompts).toHaveLength(1);                    // 삭제 확인만 — 보관 제안은 없다
      expect(calls).toEqual(['delete:venues']);
    });
  }
  it('활성 매장은 종전대로 보관을 제안하고 보관 RPC 로 간다(기능 보존)', async () => {
    expect(await removeOrArchiveVenue({ ...venue, status: 'active' })).toBe('archived');
    expect(calls).toEqual(['delete:venues', 'rpc:admin_set_venue_archived']);
  });
  it('보관 RPC 의 거부 문구에서 서버 상태값 꼬리를 뗀다', async () => {
    rpcError = { message: '활성(active) 매장만 보관할 수 있습니다 (현재 suspended)' };
    const err = await removeOrArchiveVenue({ ...venue, status: 'active' }).catch((e: Error) => e);
    expect((err as Error).message).toBe('활성 매장만 보관할 수 있습니다');
  });
});
