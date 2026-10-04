// F(2026-09-28) — 필터 구독이 못 받는 DELETE 와 소켓 재연결(SUBSCRIBED 재진입)을 받는지.
// 음성 대조: subscribeClock 의 필터 없는 DELETE 리스너나 .subscribe(resubscribeStatus(...)) 를 빼면 빨개진다.
import { describe, it, expect, vi } from 'vitest';

type Handler = { filter: Record<string, unknown>; cb: (p: unknown) => void };
const channels: { handlers: Handler[]; status?: (s: string) => void }[] = [];
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    channel: () => {
      const c = { handlers: [] as Handler[], status: undefined as ((s: string) => void) | undefined };
      channels.push(c);
      const api = {
        on: (_t: string, filter: Record<string, unknown>, cb: (p: unknown) => void) => { c.handlers.push({ filter, cb }); return api; },
        subscribe: (s?: (x: string) => void) => { c.status = s; return api; },
      };
      return api;
    },
    removeChannel: () => {},
  },
}));
const { subscribeClock } = await import('./clock');
const { subscribeBuyinRequests, subscribeMyBuyinRequests } = await import('./ledger');

const fire = (c: (typeof channels)[number], table: string, payload: unknown) =>
  c.handlers.filter((h) => h.filter.table === table && h.filter.event === 'DELETE' && !h.filter.filter).forEach((h) => h.cb(payload));

describe('실시간 DELETE·재연결', () => {
  it('클락 종료(DELETE)는 이 매장 것만 재조회한다', () => {
    const on = vi.fn();
    subscribeClock('v1', on);
    const c = channels[channels.length - 1];
    fire(c, 'clock_states', { old: { venue_id: 'v2', game_seq: 1 } });
    expect(on).toHaveBeenCalledTimes(0);
    fire(c, 'clock_states', { old: { venue_id: 'v1', game_seq: 1 } });
    expect(on).toHaveBeenCalledTimes(1);
  });

  it('소켓이 끊겼다 다시 붙으면(두 번째 SUBSCRIBED) 한 번 다시 읽는다', () => {
    const on = vi.fn();
    subscribeClock('v1', on);
    const c = channels[channels.length - 1];
    c.status?.('SUBSCRIBED');
    expect(on).toHaveBeenCalledTimes(0);
    c.status?.('CLOSED'); c.status?.('SUBSCRIBED');
    expect(on).toHaveBeenCalledTimes(1);
  });

  it('손님 요청 취소·만료(DELETE)는 화면이 들고 있는 요청이면 재조회한다', () => {
    const on = vi.fn();
    subscribeBuyinRequests('v1', on, { ownsId: (id) => id === 'r1' });
    const c = channels[channels.length - 1];
    fire(c, 'ledger_buyin_requests', { old: { id: 'zz' } });
    expect(on).toHaveBeenCalledTimes(0);
    fire(c, 'ledger_buyin_requests', { old: { id: 'r1' } });
    expect(on).toHaveBeenCalledTimes(1);
  });

  it('손님 본인 바인 요청 구독(홈 배너)도 소켓 재연결(두 번째 SUBSCRIBED) 때 한 번 다시 읽는다 — R4-03', () => {
    const on = vi.fn();
    subscribeMyBuyinRequests('u1', on);
    const c = channels[channels.length - 1];
    c.status?.('SUBSCRIBED');
    expect(on).toHaveBeenCalledTimes(0);
    c.status?.('CLOSED'); c.status?.('SUBSCRIBED');
    expect(on).toHaveBeenCalledTimes(1);
  });
});
