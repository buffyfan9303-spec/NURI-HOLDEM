// D4(2026-09-17) — 매장 순위 패널의 첫 렌더 캐시(localStorage `nuri:rankcache:<venueId>`)에
// 실명(totals·latest.entries 의 realName)·업주 자유 텍스트 사유(manual.reason)·방문자 명단(checkinRows)이
// 통째로 들어갔고, 로그아웃(clearAuthStorage)이 그 키를 지우지 않았다. 매장 PC 는 공용이다.
// 고침: 캐시에 넣기 **전에** 민감값을 떨어뜨린다(redactForCache) + 로그아웃이 캐시 키를 함께 걷는다.
// 음성 대조: VenuePage.writeRankCache 에서 redactForCache 를 벗기면 첫 describe 가, clearAuthStorage 에서
//   RANK_CACHE_PREFIX 분기를 지우면 둘째 describe 가 빨개진다.
// 실행: npx vitest run src/lib/rankCachePrivacy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

class FakeStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  keys() { return [...this.m.keys()].sort(); }
}

describe('redactForCache — 캐시에는 속도용 숫자만 남고 사람 식별 정보는 없다', () => {
  it('🔴 realName·reason 은 비고 checkinRows 는 빈다. 점수·닉네임·보드 설정은 그대로다', async () => {
    const { redactForCache } = await import('../api/rankings');
    const out = redactForCache({
      cfg: { rankMetrics: ['score', 'visit_count'] },
      totals: [{ nickname: 'kim', realName: '김철수', moneyPoints: 10, appearances: 1, bestPosition: 1 }],
      latest: { date: '2026-09-01', entries: [{ position: 1, nickname: 'kim', realName: '김철수', prize: '트로피' }] },
      manual: [{ id: 'm1', name: 'kim', points: 5, reason: '단골이라 보너스', entryDate: '2026-09-01', boardKey: null }],
      checkinRows: [{ name: '김철수', count: 3 }],
      buyinCounts: { kim: 2 },
      playerCounts: [{ name: 'kim', buyins: 2, visits: 1 }],
      metric: 'score',
    });
    expect(out.totals).toEqual([{ nickname: 'kim', realName: '', moneyPoints: 10, appearances: 1, bestPosition: 1 }]);
    expect(out.latest).toEqual({ date: '2026-09-01', entries: [{ position: 1, nickname: 'kim', realName: '', prize: '트로피' }] });
    expect(out.manual).toEqual([{ id: 'm1', name: 'kim', points: 5, reason: null, entryDate: '2026-09-01', boardKey: null }]);
    expect(out.checkinRows).toEqual([]);
    expect(out.buyinCounts).toEqual({ kim: 2 });
    expect(out.playerCounts).toEqual([{ name: 'kim', buyins: 2, visits: 1 }]);
    expect(out.metric).toBe('score');
    expect(JSON.stringify(out)).not.toMatch(/김철수|단골/);
  });
});

describe('🔴 F5(2026-09-24) — 장부 집계 이름 "실명(닉네임)" 도 캐시에는 닉네임만', () => {
  it('playerCounts·buyinCounts 의 실명이 사라지고 같은 닉네임은 합쳐진다', async () => {
    const { redactForCache } = await import('../api/rankings');
    const out = redactForCache({
      totals: [], latest: { date: null, entries: [] }, manual: [], checkinRows: [], metric: 'buyin_count',
      playerCounts: [{ name: '김철수(kim)', buyins: 3, visits: 2 }, { name: 'kim', buyins: 1, visits: 1 }, { name: '박영희(park)', buyins: 5, visits: 4 }],
      buyinCounts: { '김철수(kim)': 3, kim: 1, '박영희(park)': 5 },
    });
    expect(out.playerCounts).toEqual([{ name: 'kim', buyins: 4, visits: 3 }, { name: 'park', buyins: 5, visits: 4 }]);
    expect(out.buyinCounts).toEqual({ kim: 4, park: 5 });
    expect(JSON.stringify(out)).not.toMatch(/김철수|박영희/);
  });
});

describe('clearAuthStorage — 로그아웃은 순위 캐시 키도 걷는다', () => {
  let ls: FakeStorage; let ss: FakeStorage;
  beforeEach(() => {
    vi.resetModules();
    ls = new FakeStorage(); ss = new FakeStorage();
    vi.stubGlobal('window', { localStorage: ls, sessionStorage: ss });
    ls.setItem('sb-abc-auth-token', '{}');
    ls.setItem('nuri:rankcache:v1', '{"totals":[]}');      // 옛 접두사(F5 이전) — 로그아웃이 이것도 걷는다
    ls.setItem('nuri:rankcache2:v2', '{}');               // 새 접두사
    ls.setItem('nuri:keep-signed-in', '1');   // 취향 플래그 — 남아야 한다
    ss.setItem('nuri:rankcache2:v3', '{}');
    ss.setItem('nh_pw_otp', '1');
  });
  it('🔴 sb-*-auth-token · nuri:rankcache:* · nh_pw_otp 가 두 저장소에서 사라지고 취향 플래그는 남는다', async () => {
    const { clearAuthStorage, RANK_CACHE_PREFIX } = await import('./supabase');
    // 2026-09-24 F5 — 접두사를 올렸다(옛 캐시에 '실명(닉네임)' 이 남아 있을 수 있어 옛 키는 읽지 않고 지운다).
    expect(RANK_CACHE_PREFIX).toBe('nuri:rankcache2:');
    clearAuthStorage();
    expect(ls.keys()).toEqual(['nuri:keep-signed-in']);
    expect(ss.keys()).toEqual([]);
  });
});

describe('🔴 F5(2026-09-24) — 옛 접두사 순위 캐시는 읽지 않고 지운다', () => {
  it('purgeLegacyRankCache 가 nuri:rankcache:* 만 두 저장소에서 지우고 새 접두사·다른 키는 남긴다', async () => {
    vi.resetModules();
    const ls = new FakeStorage(); const ss = new FakeStorage();
    vi.stubGlobal('window', { localStorage: ls, sessionStorage: ss });
    ls.setItem('nuri:rankcache:v1', '{"playerCounts":[{"name":"김철수(kim)"}]}');
    ls.setItem('nuri:rankcache2:v1', '{}');
    ls.setItem('nuri:keep-signed-in', '1');
    ss.setItem('nuri:rankcache:v9', '{}');
    const { purgeLegacyRankCache } = await import('./supabase');
    purgeLegacyRankCache();
    expect(ls.keys()).toEqual(['nuri:keep-signed-in', 'nuri:rankcache2:v1']);
    expect(ss.keys()).toEqual([]);
  });
});
