// 그룹 게시판 삭제 · 내가 가입한 그룹 목록 — 서버 계약(2026-10-02 라이브 리허설)에 맞는가.
//
// 실제로 났던 일(리허설 40_groups.sql D08, 운영 DB begin…rollback 113 단언):
//   ① group_posts 에는 UPDATE 정책이 **없다**(gpost_read·gpost_insert·gpost_delete 셋뿐).
//      화면의 삭제(deleteGroupPost)는 `update({deleted:true})` 라 작성자·개설자 모두 **0행** → mustAffect 가
//      '권한이 없거나…' 를 던졌다. 그룹 게시판 글은 누구도 지울 수 없었다. DELETE 정책은 작성자·운영진을 허용한다.
//   ② getMyJoinedGroups 가 `role <> 'manager'` 로 걸러, 개설자가 **운영진으로 지정한 멤버**는 그 그룹이
//      '내가 운영'(owner_id 기준)에도 '가입한 그룹'에도 안 보였다. 걸러야 할 것은 '내가 개설한 그룹' 이다.
// mock 은 서버 정책을 흉내 낸다: group_posts UPDATE → 0행, DELETE → 1행. 수정을 되돌리면 🔴 두 테스트가 실패한다.
// 실행: npx vitest run src/api/community.groups.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ME = 'u1';
let ops: string[];
const MEMBERSHIPS = [
  { id: 'm-own', group_id: 'g-own', role: 'manager', status: 'approved' },   // 내가 개설한 그룹(개설자 = manager)
  { id: 'm-staff', group_id: 'g-staff', role: 'manager', status: 'approved' }, // 남의 그룹에서 운영진으로 지정됨
  { id: 'm-mem', group_id: 'g-mem', role: 'member', status: 'pending' },
];
const VENUES = [
  { id: 'g-own', owner_id: ME, kind: 'club', name: '내 동호회' },
  { id: 'g-staff', owner_id: 'u2', kind: 'dealer_team', name: '남의 딜러팀' },
  { id: 'g-mem', owner_id: 'u3', kind: 'club', name: '가입 대기' },
];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: (table: string) => {
      let op = 'select';
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const rows = () => (table === 'group_members' ? MEMBERSHIPS : table === 'venues' ? VENUES : []) as Record<string, unknown>[];
      const q = {
        delete: () => { op = 'delete'; return q; },
        update: () => { op = 'update'; return q; },
        eq: (c: string, v: unknown) => { if (c !== 'user_id') filters.push((r) => r[c] === v); return q; },
        neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
        in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
        select: () => {
          if (op === 'select') return q;
          ops.push(`${table}.${op}`);
          // 라이브 정책: group_posts 는 UPDATE 정책 없음(0행) · DELETE 는 작성자/운영진 허용(1행)
          const n = table === 'group_posts' && op === 'update' ? 0 : 1;
          return Promise.resolve({ data: Array.from({ length: n }, () => ({ id: 'p1' })), error: null });
        },
        then: (res: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }).then(res),
      };
      return q;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ME } } }, error: null }) },
  },
}));

const community = await import('./community');

beforeEach(() => { ops = []; });

describe('deleteGroupPost — 서버에 있는 경로(DELETE)로 지운다', () => {
  it('🔴 작성자·운영진 삭제가 성공한다(UPDATE 정책이 없어 soft delete 는 항상 0행이었다)', async () => {
    await expect(community.deleteGroupPost('p1')).resolves.toBeUndefined();
    expect(ops).toEqual(['group_posts.delete']);
  });
});

describe('getMyJoinedGroups — 운영진으로 지정된 그룹도 보인다', () => {
  it('🔴 내가 개설한 그룹만 빼고, 운영진·멤버·대기 그룹은 모두 돌려준다', async () => {
    const got = await community.getMyJoinedGroups();
    expect(got.map((j) => j.group.id).sort()).toEqual(['g-mem', 'g-staff']);
    expect(got.find((j) => j.group.id === 'g-mem')?.status).toBe('pending');
  });
});
