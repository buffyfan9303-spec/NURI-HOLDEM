// 게시글·댓글 삭제 / 매장 상태 변경 — RLS 거부(0행 200)가 성공으로 새지 않는가 (F15, 2026-09-13).
//
// 실제로 났던 일: deletePost 가 `.select()` 없이 delete 해서, 권한 없는 운영자가 눌러도 PostgREST 가
//   **error 없이 0행 200** 을 줬고 여기서 성공으로 통과했다. App.handleDeletePost 는 낙관적으로 목록에서 빼고
//   '게시글이 삭제되었습니다' 를 띄우고 감사 로그까지 남기므로 새로고침 전까지 아무도 몰랐다.
//   approveOwner(approveOwner.test.ts)와 같은 부류의 **두 번째** — 그래서 통로(_mustAffect.ts)와 계약
//   (mutationAffected.contract.test.ts)으로 묶었다. 이 파일은 그 통로가 community.ts 의 대표 변이에
//   **실제로 도달하는지** 를 mock 으로 본다(정규식 계약은 문장의 존재만 보고 도달은 못 본다).
//
// ⚠ mock 의 핵심: `.select()` 를 타야만 0행이 드러난다. `.select()` 없이 await 하면 실제 서버처럼 error:null 이다.
//   mustAffect 를 빼고 `const { error } = await …; if (error) throw error;` 로 되돌리면 🔴 테스트가 실패한다.
// 실행: npx vitest run src/api/community.deletePost.test.ts
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
        // `.select()` 를 탄 경우에만 0행이 데이터로 드러난다.
        select: () => { selectCalls += 1; return Promise.resolve({ data: error ? null : rows, error }); },
        // `.select()` 없이 그대로 await 한 경우 — PostgREST 는 0행이어도 error: null 200 이다(실서버와 같은 맹점).
        then: (res: (v: { error: unknown }) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return q;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null }) },
  },
}));

// 모듈을 한 번만 적재한다 — resetModules 로 매번 새로 읽으면 community.ts 가 잡는 _mustAffect 인스턴스와
// 이 파일이 잡은 NoRowsAffectedError 클래스가 달라져 instanceof 가 어긋난다. mock 상태는 위 let 변수로 바꾼다.
const community = await import('./community');
const load = async () => community;
const { NoRowsAffectedError } = await import('./_mustAffect');

beforeEach(() => { rows = [{ id: 'p1' }]; error = null; selectCalls = 0; tables.length = 0; });

describe('deletePost — 0행 200 을 성공으로 넘기지 않는다', () => {
  it('1행이 지워지면 조용히 끝난다 · 반영 행을 select 로 확인했다', async () => {
    const { deletePost } = await load();
    await expect(deletePost('p1')).resolves.toBeUndefined();
    expect(tables).toEqual(['community_posts']);
    expect(selectCalls, '.select() 를 타지 않으면 0행을 알 방법이 없다').toBe(1);
  });

  it('🔴 RLS 거부(0행 · error 없음)면 던진다 — App 의 catch 가 reloadPosts 로 화면을 되돌린다', async () => {
    rows = [];
    const { deletePost } = await load();
    await expect(deletePost('p1')).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  it('서버 오류는 그대로 던진다(종전 동작 유지)', async () => {
    error = Object.assign(new Error('permission denied for table community_posts'), { code: '42501' });
    const { deletePost } = await load();
    await expect(deletePost('p1')).rejects.toMatchObject({ code: '42501' });
  });

  it('던지는 문장은 사람 말이고 서버 원문이 아니다(보안표준 6)', async () => {
    rows = [];
    const { deletePost } = await load();
    await expect(deletePost('p1')).rejects.toThrow(/권한이 없거나 이미 바뀐 항목입니다/);
  });
});

describe('같은 통로를 타는 형제 변이 — 삭제(delete)와 갱신(update) 양쪽', () => {
  it('🔴 deleteComment: 0행이면 던진다(App.handleDeleteComment 가 낙관적으로 지우고 성공 토스트를 낸다)', async () => {
    rows = [];
    const { deleteComment } = await load();
    await expect(deleteComment('c1')).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  it('🔴 updateVenueStatus: 0행이면 던진다(VenueManagement 가 `${name} 숨김` 토스트 뒤 상태를 바꾼다)', async () => {
    rows = [];
    const { updateVenueStatus } = await load();
    await expect(updateVenueStatus('v1', 'hidden')).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  // 2026-09-13 검증 FAIL ①: 예전 이 자리는 "unfollowVenue: 0행이면 던진다" 였다 — 그게 틀렸다. 켜기(followVenue)는
  //   23505 를 무시해 "이미 팔로우" 를 성공으로 흡수하는데 끄기만 던지니, 다른 탭에서 먼저 해제한 팔로우를 다시
  //   해제하면 VenuePage 가 setView(before) 로 **팔로우 중 + 팔로워 +1** 을 그렸다(서버엔 팔로우가 없다).
  //   끄기의 0행은 "이미 그 상태" 다 — idempotentOff 로 흡수한다(idempotentOff.test.ts 가 멱등 토글 4곳 전수를 본다).
  it('unfollowVenue: 0행은 **이미 해제된 상태** 라 성공이다 — 켜기(23505 무시)와 대칭', async () => {
    rows = [];
    const { unfollowVenue } = await load();
    await expect(unfollowVenue('v1')).resolves.toBeUndefined();
    expect(selectCalls, 'error 와 0행을 구분하려면 여전히 .select() 를 탄다').toBe(1);
  });

  it('🔴 unfollowVenue: 서버 오류(권한 거부 등)는 여전히 던진다 — 0행만 흡수한다', async () => {
    error = Object.assign(new Error('permission denied for table venue_follows'), { code: '42501' });
    const { unfollowVenue } = await load();
    await expect(unfollowVenue('v1')).rejects.toMatchObject({ code: '42501' });
  });

  it('reorderVenues: 여러 행 중 하나라도 0행이면 전체가 실패한다(호출부가 스냅샷으로 되돌린다)', async () => {
    rows = [];
    const { reorderVenues } = await load();
    await expect(reorderVenues({ items: [{ id: 'a', displayOrder: 1 }, { id: 'b', displayOrder: 2 }] })).rejects.toBeInstanceOf(NoRowsAffectedError);
  });
});
