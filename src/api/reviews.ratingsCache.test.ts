// §5-B(2026-09-12) — `rpc/venue_rating_summary` ×2.
//
// 성능 기준선 하네스(e2e/perf-baseline.spec.ts)가 **콜드·리로드·로그인 모든 조건에서** 재현한
// 유일한 중복 요청이다. 원인은 `dedupe`(src/lib/inflight.ts)가 **비행 중일 때만** 합류시키는데
// 실제 호출 3곳의 시점이 어긋나 있기 때문이다:
//   App.tsx:1782(부팅) → idle 프리마운트 CommunityTab.tsx:1092 → VenuePage.tsx:115(매장 열 때).
// 부팅 응답이 이미 도착한 뒤 CommunityTab 이 마운트되므로 dedupe 키는 이미 비어 있다.
// (로그인 상태에서는 RPC 폴백까지 돌아 `venue_reviews?...limit=5000` 도 같이 ×2 였다.)
//
// 고침: 짧은 TTL(60초) 로 '같은 순간 근처의 두 번째 왕복'만 지운다. **캐시가 아니라 합류 창의 확장**이다 —
//   TTL 이 지나면 그대로 다시 나가고(재조회 시점 보존), 내가 후기를 쓰거나 지우면 즉시 무효화된다.
//
// 음성 대조: reviews.ts 의 `if (ratingsCache && Date.now() - ratingsCache.at < RATINGS_TTL_MS) return ratingsCache.value;`
//   한 줄을 지우면 아래 '시차 2회 → 왕복 1회' 가 실패한다(rpc 2회).
//   `invalidateVenueRatings()` 호출을 지우면 '후기 저장 뒤 즉시 재조회' 가 실패한다.
//
// 실행: npx vitest run src/api/reviews.ratingsCache.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

const ROWS = [{ venue_id: 'v1', avg: '4.5', count: 2 }];

function makeSupabaseMock(counter: { rpc: number; from: number }) {
  return {
    IS_MOCK: false,
    supabase: {
      rpc: async (name: string) => {
        if (name === 'venue_rating_summary') counter.rpc += 1;
        return { data: ROWS, error: null };
      },
      from: () => {
        counter.from += 1;
        const q = {
          select: () => q,
          limit: async () => ({ data: [], error: null }),
          upsert: async () => ({ data: null, error: null }),
          delete: () => q,
          // delete().eq() 뒤에 mustAffect 가 .select() 로 반영 행을 확인한다 — 1행 지워진 것으로 응답
          eq: () => ({ select: async () => ({ data: [{ id: 'r1' }], error: null }) }),
        };
        return q;
      },
    },
  };
}

async function loadReviews(counter: { rpc: number; from: number }) {
  vi.resetModules();
  vi.doMock('../lib/supabase', () => makeSupabaseMock(counter));
  vi.doMock('./_session', () => ({ currentUser: async () => ({ id: 'user-a' }) }));
  return import('./reviews');
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('getVenueRatings — dedupe 가 못 잡는 시차 중복(§5-B)', () => {
  it('🔴 순차(비행 중이 아닌) 2회 호출이 서버 왕복 1회로 합쳐진다', async () => {
    vi.useFakeTimers();
    const c = { rpc: 0, from: 0 };
    const { getVenueRatings } = await loadReviews(c);

    const first = await getVenueRatings();          // App 부팅
    expect(c.rpc).toBe(1);
    const second = await getVenueRatings();         // idle 프리마운트 CommunityTab — 첫 응답이 이미 끝난 뒤다
    expect(c.rpc, 'dedupe 만으로는 여기서 2가 된다 — 이것이 하네스가 잰 ×2 다').toBe(1);
    expect(second).toEqual(first);
    expect(second.v1).toEqual({ avg: 4.5, count: 2 });
  });

  it('TTL 이 지나면 다시 나간다 — 재조회 시점을 보존한다(영구 캐시가 아니다)', async () => {
    vi.useFakeTimers();
    const c = { rpc: 0, from: 0 };
    const { getVenueRatings } = await loadReviews(c);

    await getVenueRatings();
    vi.advanceTimersByTime(60_001);
    await getVenueRatings();
    expect(c.rpc, 'TTL 이 지났는데도 낡은 값을 주면 별점이 영원히 갱신되지 않는다').toBe(2);
  });

  it('내가 후기를 저장하면 즉시 무효화된다 — 내 평점이 TTL 동안 낡아 보이지 않는다', async () => {
    vi.useFakeTimers();
    const c = { rpc: 0, from: 0 };
    const { getVenueRatings, saveVenueReview } = await loadReviews(c);

    await getVenueRatings();
    expect(c.rpc).toBe(1);
    await saveVenueReview('v1', 5, '좋아요', '닉');
    await getVenueRatings();
    expect(c.rpc, '후기 저장 뒤에도 캐시를 돌려주면 방금 쓴 별점이 반영되지 않는다').toBe(2);
  });

  it('삭제도 같은 계약 — 지운 후기가 평균에 남아 보이지 않는다', async () => {
    vi.useFakeTimers();
    const c = { rpc: 0, from: 0 };
    const { getVenueRatings, deleteVenueReview } = await loadReviews(c);

    await getVenueRatings();
    await deleteVenueReview('r1');
    await getVenueRatings();
    expect(c.rpc).toBe(2);
  });

  it('조회 실패는 기억하지 않는다 — 다음 호출이 그대로 재시도한다', async () => {
    vi.useFakeTimers();
    const c = { rpc: 0, from: 0 };
    vi.resetModules();
    let boom = true;
    vi.doMock('../lib/supabase', () => ({
      IS_MOCK: false,
      supabase: {
        rpc: async () => { c.rpc += 1; if (boom) throw new Error('network down'); return { data: ROWS, error: null }; },
        from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      },
    }));
    vi.doMock('./_session', () => ({ currentUser: async () => ({ id: 'user-a' }) }));
    const { getVenueRatings } = await import('./reviews');

    await expect(getVenueRatings()).rejects.toThrow('network down');
    boom = false;
    const ok = await getVenueRatings();
    expect(c.rpc, '실패를 캐시하면 화면이 TTL 동안 빈 별점에 갇힌다').toBe(2);
    expect(ok.v1).toEqual({ avg: 4.5, count: 2 });
  });
});
