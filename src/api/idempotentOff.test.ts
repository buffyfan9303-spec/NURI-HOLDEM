// 멱등 토글의 끄는 쪽 4곳 — 0행이 "이미 그 상태" 로 흡수되고, error 는 여전히 던지는가 (2026-09-13 검증 FAIL ①).
//
// 실제로 났던 일: mustAffect 스윕이 찜 해제·언팔로우·반응 취소·차단 해제에도 "0행 = 실패" 를 적용했다. 켜는 쪽은
//   upsert / 23505 무시로 "이미 켜져 있음" 을 성공으로 흡수하는데 끄는 쪽만 엄격해지니, 다른 기기·탭에서 먼저 해제한
//   찜을 다시 해제하면 ScheduleDetailModal 이 setLiked(!next) 로 되돌려 **하트가 '찜함' 으로 켜졌다(서버엔 찜이 없다)**.
//   VenuePage 는 setView(before) 로 팔로우 중 + 팔로워 +1, PostDetailModal 은 스냅샷 복원 — 같은 부류 셋.
//   "화면이 거짓을 말하지 않게" 하려던 스윕이 같은 부류의 거짓을 반대 방향으로 만든 것이다.
//
// 이 파일은 통로(idempotentOff)가 **네 호출부에 실제로 도달하는지** 를 mock 으로 본다(mutationAffected.contract.test.ts 의
//   정규식은 문장의 존재만 본다). 같은 파일의 토글이 아닌 삭제는 여전히 mustAffect 로 던지는 것을 음성 대조로 함께 본다.
// 음성 대조: calendar.ts / community.ts / blocks.ts 의 idempotentOff( 를 mustAffect( 로 되돌리면 🔴 '0행' 테스트가 실패한다.
// 실행: npx vitest run src/api/idempotentOff.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rows: unknown[] | null;
let error: unknown;
let selectCalls: number;
const tables: string[] = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: (table: string) => {
      tables.push(table);
      const q = {
        delete: () => q,
        update: () => q,
        eq: () => q,
        // `.select()` 를 탄 경우에만 0행이 데이터로 드러난다 — error 와 0행을 구분하는 유일한 길.
        select: () => { selectCalls += 1; return Promise.resolve({ data: error ? null : rows, error }); },
        // `.select()` 없이 그대로 await 한 경우 — PostgREST 는 0행이어도 error: null 200 이다(실서버와 같은 맹점).
        then: (res: (v: { error: unknown }) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return q;
    },
    auth: {
      // community·blocks 는 currentUser(getSession), calendar 는 getUser 를 직접 부른다.
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
    },
  },
}));

// 모듈을 한 번만 적재한다(resetModules 로 매번 새로 읽으면 _mustAffect 인스턴스가 갈려 instanceof 가 어긋난다).
const calendar = await import('./calendar');
const community = await import('./community');
const blocks = await import('./blocks');
const { NoRowsAffectedError } = await import('./_mustAffect');

beforeEach(() => { rows = [{ user_id: 'u1' }]; error = null; selectCalls = 0; tables.length = 0; });

/** 끄는 쪽 전수 — 켜는 쪽 짝은 mutationAffected.contract.test.ts 의 IDEMPOTENT_OFF 가 코드로 확인한다. */
const OFF: ReadonlyArray<readonly [string, () => Promise<unknown>, string, unknown]> = [
  ['toggleScheduleLike(off) · 찜 해제',   () => calendar.toggleScheduleLike('s1', false), 'schedule_likes', false],
  ['unfollowVenue · 언팔로우',            () => community.unfollowVenue('v1'),            'venue_follows',  undefined],
  ['removeReaction · 배드빗/굿런 취소',    () => community.removeReaction('p1'),           'post_reactions', undefined],
  ['unblockUser · 차단 해제',             () => blocks.unblockUser('u2'),                 'user_blocks',    undefined],
];

describe.each(OFF)('%s — 끄는 쪽은 켜는 쪽과 대칭이다', (_name, call, table, resolved) => {
  it('1행 지워지면 성공 · 반영 행을 select 로 확인했다(error 와 0행을 구분하려면 필요하다)', async () => {
    await expect(call()).resolves.toBe(resolved);
    expect(tables).toEqual([table]);
    expect(selectCalls).toBe(1);
  });

  it('🔴 0행(이미 꺼져 있음)도 성공 — 호출부가 되돌리지 않으므로 화면이 서버와 반대 방향을 그리지 않는다', async () => {
    rows = [];
    await expect(call()).resolves.toBe(resolved);
  });

  it('🔴 서버 오류(권한 거부 등)는 그대로 던진다 — 0행만 흡수하지 error 를 삼키지 않는다', async () => {
    error = Object.assign(new Error(`permission denied for table ${table}`), { code: '42501' });
    await expect(call()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('음성 대조 — 같은 파일의 토글이 아닌 삭제는 여전히 엄격하다(스윕이 통째로 풀린 것이 아니다)', () => {
  it('🔴 deleteBankrollEntry(calendar.ts): 0행이면 NoRowsAffectedError', async () => {
    rows = [];
    await expect(calendar.deleteBankrollEntry('b1')).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  it('🔴 deleteComment(community.ts): 0행이면 NoRowsAffectedError', async () => {
    rows = [];
    await expect(community.deleteComment('c1')).rejects.toBeInstanceOf(NoRowsAffectedError);
  });
});
