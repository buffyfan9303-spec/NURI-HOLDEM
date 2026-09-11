// 순위 입력 회원 조회가 매장 범위 안에 있는가 (2026-09-11 · 20260911h 의 형제 건)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   범위 조건은 DB 에 적용해야만 도는 코드라 단위 테스트가 실행으로 검증할 수 없다.
//   그래서 **조건이 SQL 안에 실제로 적혀 있는지**를 잠근다(실행 검증은 파일 하단 do $$ … ABORT 가 맡는다).
//
// 이 테스트가 잡는 회귀
//   ① 매장 범위를 지우고 전 회원 부분 일치로 되돌리는 것
//   ② 내 매장 밖 회원 분기에 부분 일치나 이름을 다시 싣는 것
//   ③ 일괄 대조(resolve)가 이름을 무조건 싣는 것 — 닉네임 목록 → 신원 매핑 경로
//   ④ 범위 정의가 두 벌이 되는 것(장부와 순위가 각자 union 을 들고 가는 것)
//   ⑤ 회원/비회원 판정까지 좁혀 '가입 회원 줄에 비회원 배지' 거짓말을 되살리는 것
//   ⑥ 시그니처를 바꿔 '앱 먼저 배포' 창에 PGRST202 를 만드는 것
//   ⑦ CREATE OR REPLACE 뒤 ACL 재선언을 빠뜨리는 것
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911j_ranking_member_search_venue_scope.sql'),
  'utf-8',
);
/** 함수 선언부터 그 함수의 revoke 까지 — 머리말 주석의 설명이 통과시켜 주는 착시를 막는다. */
const fn = (name: string) =>
  SQL.slice(SQL.indexOf(`create or replace function public.${name}`), SQL.indexOf(`revoke all on function public.${name}`));

const SCOPE = fn('_venue_customer_ids');
const MINE = fn('_my_ledger_venue_ids');
const LEDGER = fn('search_registered_players');
const SEARCH = fn('search_ranking_members');
const RESOLVE = fn('resolve_ranking_members');
/** 내 매장 밖 회원 분기만 — 손님 분기가 대신 통과시켜 주는 착시를 막는다. */
const STRANGER = SEARCH.slice(SEARCH.indexOf('union all'), SEARCH.indexOf('select h.uid'));

const AUTH_TS = readFileSync(join(__dirname, 'auth.ts'), 'utf-8');
const RANK_TS = readFileSync(join(__dirname, 'rankings.ts'), 'utf-8');
const TAB_TSX = readFileSync(join(__dirname, '..', 'components', 'features', 'VenueManageTab.tsx'), 'utf-8');

describe('20260911j — 순위 회원 조회는 내 매장 범위 안에서만 이름을 준다', () => {
  it("'이 매장 손님' 정의는 한 벌뿐이고, 20260911h 와 같은 세 경로다", () => {
    expect(SCOPE).toContain('from public.checkins c');
    expect(SCOPE).toContain('from public.customer_profiles cp');
    expect(SCOPE).toContain('join public.schedules s on s.id = r.schedule_id');
    expect(SCOPE).toContain('and cp.user_id is not null');
    expect(SCOPE).toContain('and r.user_id is not null');
    // 장부·순위 셋 다 이 함수를 부른다 — 자기 사본을 들고 가면 규칙이 두 벌이 된다.
    expect(LEDGER).toContain('public._venue_customer_ids(array[p_venue_id])');
    expect(LEDGER).not.toContain('public.customer_profiles cp');
    expect(SEARCH).toContain('public._venue_customer_ids(');
    expect(RESOLVE).toContain('public._venue_customer_ids(');
  });

  it('순위 RPC 의 매장 집합은 장부 권한 경계와 같다', () => {
    expect(MINE).toContain('public.ledger_access la');
    expect(MINE).toContain('public.venue_owners vo');
    expect(MINE).toContain("vo.status = 'approved'");
    expect(MINE).toContain('v.owner_id = auth.uid()');
    expect(MINE).toContain("public.my_role() = 'admin'::user_role"); // 운영자는 전 매장
    expect(SEARCH).toContain('public._my_ledger_venue_ids()');
    expect(RESOLVE).toContain('public._my_ledger_venue_ids()');
  });

  it('부분 일치는 내 매장 손님으로 한정된다', () => {
    expect(SEARCH).toContain('join public.profiles p on p.id = rel.uid');
    expect(STRANGER).not.toContain('ilike');
    expect(STRANGER).toContain('lower(btrim(p.nickname)) = lower(btrim(p_q))');
    expect(STRANGER).toContain('not exists (select 1 from rel where rel.uid = p.id)');
  });

  it('내 매장 밖 회원의 이름은 내려보내지 않는다', () => {
    expect(STRANGER).toContain('null::text');
    expect(STRANGER).not.toContain('p.name');
  });

  it('일괄 대조는 회원 여부는 그대로 주고 이름만 내 매장 손님에게 싣는다', () => {
    expect(RESOLVE).toContain('public.is_ci_verified(p.ci_hash, p.verified_at)');
    expect(RESOLVE).toContain('case when c.uid is not null then p.name else null::text end');
    expect(RESOLVE).toContain('lower(btrim(p.nickname)) = lower(btrim(n.q))');
    expect(RESOLVE).toContain('[1:100]');
    // where 절에는 매장 조건이 없어야 한다 — 넣으면 그 매장 처음 온 회원이 전부 '비회원'으로 보인다.
    const where = RESOLVE.slice(RESOLVE.indexOf('where public.can_search_ranking_members()'));
    expect(where).not.toContain('rel');
    expect(where).not.toContain('_venue_customer_ids');
  });

  it('삭제된 profiles.ci 를 쓰지 않는다 (20260827c 가 컬럼을 지웠다)', () => {
    expect(SQL).not.toMatch(/is_ci_verified\(\s*p\.ci\s*,/);
    expect(SQL).toContain('public.is_ci_verified(p.ci_hash, p.verified_at)');
  });

  it('호출부 0 인 전 회원 검색 RPC 를 드롭한다', () => {
    expect(SQL).toContain('drop function if exists public.search_members_for_ranking(text);');
    // 클라이언트에 되살아나면 드롭이 무의미해진다(주석의 '지웠다' 기록은 남겨 둔다).
    expect(RANK_TS).not.toContain('search_members_for_ranking');
    expect(AUTH_TS).not.toMatch(/rpc\(\s*['"]search_members_for_ranking/);
  });

  it('시그니처를 바꾸지 않는다 — 앱 먼저 배포되는 창에서 PGRST202 가 나면 전원이 비회원이 된다', () => {
    expect(SQL).toContain('create or replace function public.search_ranking_members(p_q text)');
    expect(SQL).toContain('create or replace function public.resolve_ranking_members(p_names text[])');
    expect(SQL).toContain('returns table(id uuid, nickname text, real_name text, verified boolean)');
    expect(SQL).toContain('returns table(q text, id uuid, nickname text, real_name text, verified boolean)');
    // 인자를 늘리면 drop 이 필요해지고, 그 순간 옛 번들 호출이 전부 죽는다.
    expect(SQL).not.toContain('drop function if exists public.search_ranking_members(text);');
    expect(SQL).not.toContain('drop function if exists public.resolve_ranking_members(text[]);');
    expect(SQL).not.toMatch(/p_venue_id uuid default/);
  });

  it('SECURITY DEFINER 는 search_path 를 고정하고, CREATE OR REPLACE 뒤 ACL 을 다시 건다', () => {
    for (const f of [SCOPE, MINE, LEDGER, SEARCH, RESOLVE]) {
      expect(f).toContain('set search_path = public, pg_temp');
    }
    // `from anon` 만으로는 PUBLIC 기본 GRANT 가 남는다.
    expect(SQL).toContain('revoke all on function public.search_ranking_members(text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.search_ranking_members(text) to authenticated, service_role;');
    expect(SQL).toContain('revoke all on function public.resolve_ranking_members(text[]) from public, anon;');
    expect(SQL).toContain('grant execute on function public.resolve_ranking_members(text[]) to authenticated, service_role;');
    expect(SQL).toContain('revoke all on function public.search_registered_players(uuid, text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.search_registered_players(uuid, text) to authenticated, service_role;');
    // 내부 헬퍼는 직접 부르면 매장 손님 명단을 통째로 준다 — authenticated 도 회수한다.
    expect(SQL).toContain('revoke all on function public._venue_customer_ids(uuid[]) from public, anon, authenticated;');
    expect(SQL).toContain('revoke all on function public._my_ledger_venue_ids() from public, anon, authenticated;');
  });

  it('인덱스를 새로 만들지 않는다 — 닉네임 정확 일치는 기존 유니크 인덱스가 받는다', () => {
    expect(SQL).not.toMatch(/create\s+index/i);
    expect(SQL).toContain("indexname = 'uniq_profiles_nickname_ci'");
  });

  it('적용 시점에 스스로 확인한다(ABORT 블록)', () => {
    expect(SQL).toContain('ABORT:');
    expect(SQL).toContain("notify pgrst, 'reload schema';");
  });

  it('빈 이름이 사장님이 친 실명을 지우지 않는다', () => {
    // toMember 가 real_name null 을 ''로 바꾸므로 `??` 는 빈 문자열을 값으로 보고 입력을 덮는다.
    expect(TAB_TSX).toContain('(member?.realName || row.realName)');
    expect(TAB_TSX).not.toContain('(member?.realName ?? row.realName)');
  });
});
