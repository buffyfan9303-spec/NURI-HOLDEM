// 장부 접수대 손님 검색이 매장 범위 안에 있는가 (2026-09-11 · M2)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   search_registered_players 는 장부 권한자만 부를 수 있었지만 **검색 대상이 전 회원**이었다.
//   이름 두 글자만 치면 그 매장에 한 번도 온 적 없는 사람의 실명이 나왔다 — 직원 한 명이
//   플랫폼 전 회원 실명을 훑을 수 있는 상태(보안 표준 §6). 범위 조건은 DB 에 적용해야만 도는
//   코드라 단위 테스트가 실행으로 검증할 수 없다. 그래서 **조건이 SQL 안에 실제로 적혀 있는지**를 잠근다.
//   (실행 검증은 마이그레이션 하단 do $$ … ABORT 블록이 적용 시점에 맡는다.)
//
// 이 테스트가 잡는 회귀
//   ① 범위 조건(체크인·CRM·예약)을 지우고 전 회원 검색으로 되돌리는 것
//   ② 비방문 회원 분기에 부분 일치나 실명을 다시 싣는 것
//   ③ CREATE OR REPLACE 뒤 ACL 재선언을 빠뜨리는 것
//   ④ 장부 화면이 전 회원 검색(search_members_for_ranking)을 다시 병합해 우회하는 것
//
// ⚠ 이 파일은 **20260911h 파일 텍스트**를 잠근다. 라이브 본문은 20260911j 가 범위 union 을
//   공용 함수(_venue_customer_ids)로 옮겼다 — h 파일을 '고쳐서' 맞추지 마라(기존 마이그레이션 수정 금지).
//   현재 형태의 가드는 rankingMemberSearch.migration.test.ts 에 있다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911h_ledger_player_search_venue_scope.sql'),
  'utf-8',
);
/** 함수 본문만 — 머리말 주석의 설명이 통과시켜 주는 착시를 막는다. */
const FN = SQL.slice(
  SQL.indexOf('create or replace function public.search_registered_players'),
  SQL.indexOf('comment on function'),
);
/** 비방문 회원 분기만 — 이 매장 손님 분기가 대신 통과시켜 주는 착시를 막는다. */
const STRANGER = FN.slice(FN.indexOf('union all'), FN.indexOf('select h.uid'));
const LEDGER_TSX = readFileSync(
  join(__dirname, '..', 'components', 'features', 'NuriPosLedger.tsx'),
  'utf-8',
);

describe('20260911h — 장부 손님 검색은 매장 범위 안에서만 실명을 준다', () => {
  it('장부 권한 게이트가 두 분기 모두에 남아 있다', () => {
    expect((FN.match(/public\.can_access_ledger\(p_venue_id\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("'이 매장 손님' 을 체크인·CRM·예약 세 경로로 정의한다", () => {
    expect(FN).toContain('from public.checkins c');
    expect(FN).toContain('where c.venue_id = p_venue_id');
    expect(FN).toContain('where cp.venue_id = p_venue_id and cp.user_id is not null');
    expect(FN).toContain('join public.schedules s on s.id = r.schedule_id');
    expect(FN).toContain('where s.venue_id = p_venue_id and r.user_id is not null');
  });

  it('부분 일치 검색은 이 매장 손님으로 한정된다', () => {
    expect(FN).toContain('join public.profiles p on p.id = rel.uid');
    // 비방문 회원 분기에는 부분 일치가 없어야 한다 — 있으면 전 회원 검색이 되살아난 것이다.
    expect(STRANGER).not.toContain('ilike');
  });

  it('이 매장에 온 적 없는 회원은 닉네임 정확 일치만 나온다', () => {
    expect(STRANGER).toContain('lower(btrim(p.nickname)) = lower(btrim(p_query))');
    expect(STRANGER).toContain('not exists (select 1 from rel where rel.uid = p.id)');
  });

  it('이 매장에 온 적 없는 회원의 실명은 내려보내지 않는다', () => {
    expect(STRANGER).toContain('null::text');
    expect(STRANGER).not.toContain('p.real_name');
  });

  it('닉네임 인덱스를 새로 만들지 않는다 — 같은 표현식이 이미 있다', () => {
    // uniq_profiles_nickname_ci(20260601b) = lower(trim(nickname)) = lower(btrim(nickname)).
    // 복제 인덱스는 profiles 쓰기 비용만 늘리고 빌드 동안 라이브 테이블을 잠근다.
    expect(SQL).not.toMatch(/create\s+index/i);
    expect(SQL).toContain("indexname = 'uniq_profiles_nickname_ci'");
  });

  it('SECURITY DEFINER 는 search_path 를 고정하고, CREATE OR REPLACE 뒤 ACL 을 다시 건다', () => {
    expect(FN).toContain('set search_path = public, pg_temp');
    // `from anon` 만으로는 PUBLIC 기본 GRANT 가 남는다.
    expect(SQL).toContain('revoke all on function public.search_registered_players(uuid, text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.search_registered_players(uuid, text) to authenticated, service_role;');
  });

  it('적용 시점에 스스로 확인한다(ABORT 블록)', () => {
    expect(SQL).toContain('ABORT:');
  });

  it('장부 화면이 전 회원 검색을 다시 병합하지 않는다', () => {
    // 같은 화면에 이 호출이 남아 있으면 위 범위 제한이 통째로 무의미해진다.
    expect(LEDGER_TSX).not.toContain('searchMembersForRanking');
  });
});
