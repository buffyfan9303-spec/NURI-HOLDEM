// 이용권 DELETE 구독 — 남의 매장 삭제에 목록을 다시 읽지 않는다(review-db-a3-1002 ③ (d)).
// DELETE 는 postgres_changes 필터가 안 먹어(old 에는 PK 만) 모든 구독자에게 온다. 목록의 id 집합으로 걸러낸다.
// 음성 대조: DELETE 갈래의 shouldReloadOnVoucherDelete 호출을 `onChange()` 직접 호출로 되돌리면 ①·지갑 ① 이 실패한다.
// 실행: npx vitest run src/api/vouchers.deleteScope.test.ts
import { describe, it, expect, vi } from 'vitest';

type Handler = (p: { old?: { id?: string } | null }) => void;

function setup(rows: { id: string }[], uid = 'user-a') {
  const deleteHandlers: Handler[] = [];
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: uid } } } }) },
    from: () => {
      const q = {
        select: () => q, eq: () => q, order: () => q,
        then: (resolve: (v: { data: unknown; error: unknown }) => void) => resolve({ data: rows, error: null }),
      };
      return q;
    },
    channel: () => {
      const ch = {
        on: (_t: string, cfg: { event: string }, cb: Handler) => { if (cfg.event === 'DELETE') deleteHandlers.push(cb); return ch; },
        subscribe: () => ch,
      };
      return ch;
    },
    rpc: async () => ({ data: null, error: { message: 'x' } }),
    removeChannel: () => {},
  };
  return { supabase, deleteHandlers };
}

async function load(rows: { id: string }[]) {
  vi.resetModules();
  const s = setup(rows);
  vi.doMock('../lib/supabase', () => ({ IS_MOCK: false, supabase: s.supabase }));
  const mod = await import('./vouchers');
  return { ...mod, ...s };
}

describe('subscribeVenueVouchers DELETE — 매장 구분', () => {
  it('① 다른 매장 id 의 삭제 → 다시 읽지 않는다', async () => {
    const m = await load([{ id: 'mine-1' }]);
    await m.listVenueVouchers('v1');
    const onChange = vi.fn();
    m.subscribeVenueVouchers('v1', onChange);
    m.deleteHandlers[0]({ old: { id: 'other-venue-voucher' } });
    expect(onChange).toHaveBeenCalledTimes(0);
  });
  it('② 내 목록 id 의 삭제 → 1회', async () => {
    const m = await load([{ id: 'mine-1' }]);
    await m.listVenueVouchers('v1');
    const onChange = vi.fn();
    m.subscribeVenueVouchers('v1', onChange);
    m.deleteHandlers[0]({ old: { id: 'mine-1' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('③ 목록을 아직 못 받았으면(집합 없음) → 1회(페일오픈)', async () => {
    const m = await load([{ id: 'mine-1' }]);
    const onChange = vi.fn();
    m.subscribeVenueVouchers('v1', onChange);
    m.deleteHandlers[0]({ old: { id: 'anything' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('④ old 가 비어 있으면 → 1회', async () => {
    const m = await load([{ id: 'mine-1' }]);
    await m.listVenueVouchers('v1');
    const onChange = vi.fn();
    m.subscribeVenueVouchers('v1', onChange);
    m.deleteHandlers[0]({ old: null });
    m.deleteHandlers[0]({});
    expect(onChange).toHaveBeenCalledTimes(2);
  });
  it('⑤ 매장 전환 — v2 구독은 v2 목록 기준(v1 의 id 는 모르는 id)', async () => {
    const m = await load([{ id: 'v1-a' }]);
    await m.listVenueVouchers('v1');
    await m.listVenueVouchers('v2');   // 목 응답이 같아 id 집합은 같다 — 구독 키만 확인
    const onChange = vi.fn();
    m.subscribeVenueVouchers('v3', onChange);   // v3 는 목록을 받은 적 없다 → 페일오픈
    m.deleteHandlers[0]({ old: { id: 'zzz' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeMyVouchers DELETE — 손님 지갑', () => {
  it('① 남의 이용권 삭제 → 다시 읽지 않는다', async () => {
    const m = await load([{ id: 'w-1' }]);
    await m.listMyVouchers();
    const onChange = vi.fn();
    m.subscribeMyVouchers(onChange);
    await vi.waitFor(() => expect(m.deleteHandlers.length).toBe(1));
    m.deleteHandlers[0]({ old: { id: 'not-mine' } });
    expect(onChange).toHaveBeenCalledTimes(0);
  });
  it('② 내가 가진 이용권이 삭제되면 → 1회(지갑에서 사라진다)', async () => {
    const m = await load([{ id: 'w-1' }]);
    await m.listMyVouchers();
    const onChange = vi.fn();
    m.subscribeMyVouchers(onChange);
    await vi.waitFor(() => expect(m.deleteHandlers.length).toBe(1));
    m.deleteHandlers[0]({ old: { id: 'w-1' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
