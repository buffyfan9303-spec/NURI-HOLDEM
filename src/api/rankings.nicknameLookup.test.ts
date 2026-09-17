// D7(2026-09-17) — '내 입상 기록'(getMyRankingHistory)·업적 머니인 카운트(getMyBadgeStats)가 닉네임을
// `.ilike()` 패턴으로 넘겨 `%`·`_` 가 와일드카드로 먹혔다. 소셜 가입 기본 닉네임은 `이름_1a2b`(20260903c) 라
// `_` 가 흔하다 → 'kim_01' 의 대시보드에 'kimX01' 의 입상 행이 섞였고, 닉네임 '%' 는 전 행과 매칭됐다.
//
// 이 목 supabase 는 PostgreSQL LIKE 의미(%·_ 와일드카드 · `\` 이스케이프 · ILIKE 대소문자 무시)와
// PostgREST 의 `*`→`%` 치환(2026-09-17 라이브 REST 실측)을 그대로 흉내 낸다 — 결함의 본질이 "서버가 패턴을
// 어떻게 읽는가" 라서, 필터가 '호출됐는지'가 아니라 '무엇이 걸러졌는지'를 검사한다.
// 라이브 venue_rankings 는 0행(2026-09-17 실측)이라 데이터로는 재현되지 않는다 — 여기서 증명한다.
// 대소문자 무시는 **의도된** 동작이다(서버 규칙이 전부 lower(nickname)=lower(x): 20260905g·20260910b) → eq 로 바꾸면 안 된다.
// 음성 대조: rankings.ts / loyalty.ts 의 `likeLiteral(` 을 벗기면 '섞임' 케이스 3개가 빨개진다.
// 실행: npx vitest run src/api/rankings.nicknameLookup.test.ts
import { describe, it, expect, vi } from 'vitest';

/** PostgreSQL LIKE/ILIKE — `%` 0+글자, `_` 1글자, `\x` 리터럴 x. PostgREST 는 그 전에 `*` 를 `%` 로 바꾼다. */
function ilikeMatch(rawPattern: string, value: string): boolean {
  const pattern = rawPattern.replace(/\*/g, '%');
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) { re += esc(pattern[++i]); continue; }
    re += c === '%' ? '.*' : c === '_' ? '.' : esc(c);
  }
  return new RegExp(re + '$', 'i').test(value);
}

const RANK_ROWS = [
  { nickname: 'kim_01', position: 1, ranking_date: '2026-09-01', prize: null, venues: { name: 'A' } },
  { nickname: 'KIM_01', position: 3, ranking_date: '2026-08-20', prize: null, venues: { name: 'B' } }, // 대소문자만 다른 본인 행 — 포함돼야 한다
  { nickname: 'kimX01', position: 2, ranking_date: '2026-09-02', prize: null, venues: { name: 'C' } }, // 남 — `_` 가 와일드카드면 섞인다
  { nickname: '%',      position: 5, ranking_date: '2026-09-03', prize: null, venues: { name: 'D' } },
];

function mockSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    venue_rankings: RANK_ROWS,
    checkins: [],
    profiles: [{ checkin_streak: 0 }],
  };
  return {
    IS_MOCK: false,
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
      rpc: async () => ({ data: null, error: null }),
      from: (table: string) => {
        let rows = tables[table] ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = {
          select: () => q,
          order: () => q,
          limit: () => q,
          gte: () => q,
          lte: () => q,
          eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; },
          ilike: (col: string, pattern: string) => { rows = rows.filter((r) => ilikeMatch(pattern, String(r[col]))); return q; },
          single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
          then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
        };
        return q;
      },
    },
  };
}

async function load() {
  vi.resetModules();
  vi.doMock('../lib/supabase', mockSupabase);
  const [r, l] = await Promise.all([import('./rankings'), import('../lib/loyalty')]);
  return { getMyRankingHistory: r.getMyRankingHistory, getMyBadgeStats: l.getMyBadgeStats };
}

describe('D7 — 닉네임의 %·_ 는 와일드카드가 아니라 글자다', () => {
  it('🔴 getMyRankingHistory("kim_01"): 본인 행 2건(대소문자 무시)만 — kimX01 은 섞이지 않는다', async () => {
    const { getMyRankingHistory } = await load();
    const rows = await getMyRankingHistory('kim_01');
    expect(rows.map((r) => r.venueName).sort()).toEqual(['A', 'B']);
  });

  it('🔴 getMyRankingHistory("%"): 전 행이 아니라 닉네임이 정확히 "%" 인 1건', async () => {
    const { getMyRankingHistory } = await load();
    const rows = await getMyRankingHistory('%');
    expect(rows.map((r) => r.venueName)).toEqual(['D']);
  });

  it('🔴 getMyBadgeStats("kim_01"): 머니인 2회·최고 1위 — 남의 2위 행이 최고 등수를 바꾸지 않는다', async () => {
    const { getMyBadgeStats } = await load();
    const s = await getMyBadgeStats('kim_01', 0);
    expect(s).toMatchObject({ moneyin: 2, bestPosition: 1 });
  });

  it('양성 대조: 대소문자만 다른 "Kim_01" 도 같은 사람이다(서버 lower()=lower() 규칙과 동일)', async () => {
    const { getMyRankingHistory } = await load();
    const rows = await getMyRankingHistory('Kim_01');
    expect(rows).toHaveLength(2);
  });
});
