// N04-A(2026-09-13) — 관리 패널의 매장 전환 경합 **동작 검사**: A 응답을 B 보다 늦게 resolve 시키고 목록이 B 것인지 단언한다.
//   (jsdom 이 없어 컴포넌트 렌더 대신 reload 본문 함수를 React 와 같은 순서로 구동한다 — 배선은 voucherPanelStale.contract.test.ts.)
// 음성 대조: venueVoucherLoad.ts 의 `.then((v) => { if (stale()) return; on.list(v);` 에서 `if (stale()) return;` 을 지우면 첫 케이스가 실패한다.
// 실행: npx vitest run src/lib/venueVoucherLoad.test.ts
import { describe, it, expect } from 'vitest';
import { loadVenueVoucherPanel, loadVenueVoucherReasonRange } from './venueVoucherLoad';
import type { RequestStamp } from './staleResponse';

type V = { id: string; venueId: string };
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness() {
  const ref: { current: RequestStamp<string> } = { current: { seq: 0, owner: '' } };
  const state = { list: [] as V[], listErr: null as unknown, loading: false, stats: null as unknown, statsErr: null as unknown, profiles: [] as unknown[], approved: true, approvedErr: null as unknown, reason: null as unknown, reasonErr: null as unknown };
  const pending = new Map<string, { list: ReturnType<typeof deferred<V[]>>; stats: ReturnType<typeof deferred<unknown>>; profiles: ReturnType<typeof deferred<unknown[]>>; approved: ReturnType<typeof deferred<boolean>>; reason: ReturnType<typeof deferred<unknown>> }>();
  const api = {
    list: (id: string) => { const d = deferred<V[]>(); pending.get(id)!.list = d; return d.promise; },
    stats: (id: string) => { const d = deferred<unknown>(); pending.get(id)!.stats = d; return d.promise; },
    profiles: (id: string) => { const d = deferred<unknown[]>(); pending.get(id)!.profiles = d; return d.promise; },
    approved: (id: string) => { const d = deferred<boolean>(); pending.get(id)!.approved = d; return d.promise; },
    reasonStats: (id: string) => { const d = deferred<unknown>(); pending.get(id)!.reason = d; return d.promise; },
  };
  const on = {
    list: (v: V[]) => { state.list = v; }, listErr: (e: unknown) => { state.listErr = e; }, loading: (b: boolean) => { state.loading = b; },
    stats: (s: unknown) => { state.stats = s; }, profiles: (p: unknown[]) => { state.profiles = p; }, statsErr: (e: unknown) => { state.statsErr = e; },
    approved: (b: boolean) => { state.approved = b; }, approvedErr: (e: unknown) => { state.approvedErr = e; },
    reasonStats: (r: unknown) => { state.reason = r; }, reasonStatsErr: (e: unknown) => { state.reasonErr = e; },
  };
  const load = (venueId: string, canIssue = true) => { pending.set(venueId, {} as never); return loadVenueVoucherPanel(ref, venueId, canIssue, api, on); };
  return { state, load, pending, ref };
}

describe('loadVenueVoucherPanel — 매장이 바뀐 뒤 도착한 응답은 버린다', () => {
  it('🔴 A 조회 중 B 로 전환 · B 먼저 도착 · A 늦게 도착 → 목록은 B 것, A 이용권 id 가 화면에 없다', async () => {
    const h = harness();
    h.load('venue-A');
    h.load('venue-B');
    h.pending.get('venue-B')!.list.resolve([{ id: 'vB1', venueId: 'venue-B' }]);
    h.pending.get('venue-B')!.stats.resolve({ holderCount: 1 });
    h.pending.get('venue-B')!.profiles.resolve([{ userId: 'u' }]);
    h.pending.get('venue-B')!.approved.resolve(false);
    await flush();
    expect(h.state.list.map((v) => v.id)).toEqual(['vB1']);
    expect(h.state.loading).toBe(false);
    expect(h.state.approved).toBe(false);
    // A 가 이제야 도착
    h.pending.get('venue-A')!.list.resolve([{ id: 'vA1', venueId: 'venue-A' }, { id: 'vA2', venueId: 'venue-A' }]);
    h.pending.get('venue-A')!.stats.resolve({ holderCount: 9 });
    h.pending.get('venue-A')!.profiles.resolve([{ userId: 'a' }]);
    h.pending.get('venue-A')!.approved.resolve(true);
    await flush();
    expect(h.state.list.map((v) => v.id), 'A 매장 이용권이 B 화면에 실렸다 — 회수/삭제가 A 로 나간다').toEqual(['vB1']);
    expect(h.state.list.every((v) => v.venueId === 'venue-B')).toBe(true);
    expect(h.state.stats).toEqual({ holderCount: 1 });
    expect(h.state.profiles).toEqual([{ userId: 'u' }]);
    expect(h.state.approved, '늦은 A 의 승인 상태가 B 를 덮었다').toBe(false);
  });

  it('🔴 늦은 A 의 실패도 B 화면에 오류를 띄우지 않고, B 의 로딩을 끄지 않는다', async () => {
    const h = harness();
    h.load('venue-A');
    h.load('venue-B');
    expect(h.state.loading).toBe(true);
    h.pending.get('venue-A')!.list.reject({ code: '42501' });
    h.pending.get('venue-A')!.approved.reject(new Error('x'));
    h.pending.get('venue-A')!.stats.reject(new Error('x'));
    h.pending.get('venue-A')!.profiles.reject(new Error('x'));
    await flush();
    expect(h.state.listErr).toBeNull();
    expect(h.state.approvedErr).toBeNull();
    expect(h.state.statsErr).toBeNull();
    expect(h.state.loading, 'A 의 finally 가 B 의 로딩을 껐다').toBe(true);
    h.pending.get('venue-B')!.list.resolve([]);
    h.pending.get('venue-B')!.stats.resolve({});
    h.pending.get('venue-B')!.profiles.resolve([]);
    h.pending.get('venue-B')!.approved.resolve(true);
    await flush();
    expect(h.state.loading).toBe(false);
  });

  it('🔴 승인 상태 조회 실패는 approvedErr 로 남는다(초기값 true 가 "승인됨" 으로 위장하지 않게)', async () => {
    const h = harness();
    h.load('venue-A');
    h.pending.get('venue-A')!.approved.reject({ code: '42501' });
    h.pending.get('venue-A')!.list.resolve([]); h.pending.get('venue-A')!.stats.resolve({}); h.pending.get('venue-A')!.profiles.resolve([]);
    await flush();
    expect(h.state.approvedErr).toEqual({ code: '42501' });
    expect(h.state.approved).toBe(true);   // 값은 그대로 — 화면이 approvedErr 로 갈라 말한다
  });

  // V2(2026-09-24) 유형별 통계 — 음성 대조: venueVoucherLoad.ts 의 reasonStats `.then((r) => { if (stale()) return;` 에서
  //   `if (stale()) return;` 을 지우면 첫 단언(A 행이 B 표에 섞임)이 빨갛다.
  it('🔴 유형별 통계: A→B 전환 뒤 늦은 A 응답이 B 표에 섞이지 않는다', async () => {
    const h = harness();
    h.load('venue-A');
    h.load('venue-B');
    h.pending.get('venue-B')!.reason.resolve([{ reasonKey: 'grant', issued: 1 }]);
    await flush();
    h.pending.get('venue-A')!.reason.resolve([{ reasonKey: 'grant', issued: 99 }, { reasonKey: 'event_card', issued: 7 }]);
    await flush();
    expect(h.state.reason, 'A 매장 유형 통계가 B 화면을 덮었다').toEqual([{ reasonKey: 'grant', issued: 1 }]);
  });

  it('🔴 유형별 통계 권한 오류(42501)는 reasonErr 로 남고 값은 비어 있다 — "0장" 으로 위장하지 않는다', async () => {
    const h = harness();
    h.load('venue-A');
    h.pending.get('venue-A')!.reason.reject({ code: '42501', message: '권한 없음' });
    await flush();
    expect(h.state.reasonErr).toEqual({ code: '42501', message: '권한 없음' });
    expect(h.state.reason).toBeNull();
  });

  it('🔴 기간 칩: 매장·기간이 바뀐 뒤 도착한 앞 응답은 버린다', async () => {
    const ref: { current: RequestStamp<string> } = { current: { seq: 0, owner: '' } };
    const got: { rows: unknown; err: unknown } = { rows: null, err: null };
    const on = { rows: (r: unknown) => { got.rows = r; }, err: (e: unknown) => { got.err = e; } };
    const dA = deferred<unknown>(), dB = deferred<unknown>(), dB2 = deferred<unknown>();
    loadVenueVoucherReasonRange(ref, 'venue-A', '30d', () => dA.promise, on);
    loadVenueVoucherReasonRange(ref, 'venue-B', 'month', () => dB.promise, on);
    loadVenueVoucherReasonRange(ref, 'venue-B', '30d', () => dB2.promise, on);
    dB2.resolve(['B-30d']);
    await flush();
    dA.resolve(['A-30d']); dB.reject({ code: '42501' });
    await flush();
    expect(got.rows).toEqual(['B-30d']);
    expect(got.err, '늦은 앞 기간의 실패가 지금 표에 오류를 띄웠다').toBeNull();
  });

  it('같은 매장 재조회(realtime)는 최신 응답이 이긴다 · canIssue=false 면 통계·프로필을 조회하지 않는다', async () => {
    const h = harness();
    h.load('venue-A', false);
    expect(h.pending.get('venue-A')!.stats).toBeUndefined();
    expect(h.pending.get('venue-A')!.reason, '발급 권한이 없는데 유형별 통계를 조회했다').toBeUndefined();
    h.pending.get('venue-A')!.list.resolve([{ id: 'v1', venueId: 'venue-A' }]);
    h.pending.get('venue-A')!.approved.resolve(true);
    await flush();
    expect(h.state.list.map((v) => v.id)).toEqual(['v1']);
  });
});
