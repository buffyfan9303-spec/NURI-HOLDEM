// 매장 '정지·숨김' 이 포스터·라이브 클락·신규 예약까지 닿는가 (2026-09-11 · 20260911m)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   RLS 정책은 DB 에 적용해야만 도는 코드라 단위 테스트가 실행으로 검증할 수 없다.
//   그래서 **조건이 SQL 안에 실제로 적혀 있는지**를 잠근다(실행 검증은 파일 하단 do $$ … ABORT 가 맡는다).
//
// ⚠ 슬라이스 앵커는 반드시 섹션 마커(`-- ── ①`…)를 쓴다.
//   `create policy schedules_select` 같은 문자열은 머리말 ROLLBACK 주석에 먼저 나오기 때문에
//   indexOf 가 주석을 집어 슬라이스가 헬퍼 본문·롤백 예시까지 삼킨다(원안이 이 함정에 걸려 있었다).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911m_suspended_venue_hides_schedules.sql'),
  'utf-8',
);
/** 실행되는 구간만 잘라 본다 — 머리말 주석의 설명이 통과시켜 주는 착시를 막는다. */
const between = (from: string, to: string) => {
  const a = SQL.indexOf(from);
  const b = SQL.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error(`앵커를 찾지 못했다: ${from} … ${to}`);
  return SQL.slice(a, b);
};

const HELPER       = between('-- ── ①', '-- ── ②');
const SCHED_POLICY = between('-- ── ②', '-- ── ③');
const CLOCK_POLICY = between('-- ── ③', '-- ── ④');
const TRIGGER_FN   = between('-- ── ④', '-- ── ⑤');

const RES_TS = readFileSync(join(__dirname, 'reservations.ts'), 'utf-8');

describe('20260911m — 정지 매장은 포스터·클락·신규 예약이 함께 내려간다', () => {
  it('판정은 한 벌뿐이고, active 가 아니면 전부 내린다(inactive·suspended·hidden)', () => {
    expect(HELPER).toContain("v.status is distinct from 'active'::venue_status");
    // 특정 상태만 나열하면 나중에 추가된 상태가 조용히 새어 나간다.
    expect(HELPER).not.toContain("'suspended'::venue_status");
    expect(HELPER).not.toContain("'hidden'::venue_status");
    // 두 정책이 같은 함수를 부른다 — 각자 사본을 들고 가면 규칙이 두 벌이 된다.
    expect(SCHED_POLICY).toContain('public.venue_is_hidden(venue_id)');
    expect(CLOCK_POLICY).toContain('public.venue_is_hidden(venue_id)');
  });

  it('RLS 헬퍼에 `_` 내부 함수 이름을 쓰지 않는다 — 규약이 `_` 함수의 anon 권한을 회수하기 때문', () => {
    // CLAUDE.md 보안표준 §3 · 20260902b:12 · 20260902c 가 "`_` 내부 함수는 anon·authenticated 회수"다.
    // 이 함수는 RLS 가 호출자 권한으로 부르므로 anon EXECUTE 가 사라지면 앱이 통째로 42501 이 된다.
    expect(SQL).not.toContain('_venue_not_active');
    expect(SQL).toContain('public.venue_is_hidden(uuid)');
  });

  it('venue_id 가 null 인 포스터(pub_name 전용)는 통과한다', () => {
    // exists 형태라 매칭 행이 없으면 false → not false = 통과. not exists 로 뒤집으면 통째로 사라진다.
    expect(HELPER).toContain('select exists (');
    expect(HELPER).not.toContain('not exists (');
    expect(SQL).toContain('if public.venue_is_hidden(null) is not false then');
  });

  it('판정을 정책 안 서브쿼리로 되돌리지 않는다 — venues RLS 에 걸려 미승인 매장 포스터가 증발한다', () => {
    expect(HELPER).toContain('security definer');
    expect(SCHED_POLICY).not.toContain('from public.venues');
    expect(CLOCK_POLICY).not.toContain('from public.venues');
  });

  it('업주·운영자 분기는 그대로 남는다 — 정지 매장 업주가 자기 포스터를 정리해야 한다', () => {
    expect(SCHED_POLICY).toContain('or owner_id = (select auth.uid())');
    expect(SCHED_POLICY).toContain("or (select public.my_role()) is not distinct from 'admin'::user_role");
    // `<>` 나 `=` 로 되돌리면 비로그인(auth.uid()=NULL)에서 판정이 NULL 이 된다.
    expect(SCHED_POLICY).not.toContain("my_role() = 'admin'");
    // 매장 상태 조건은 공개(approved) 분기 안쪽에만 붙는다 — 바깥으로 나가면 업주 분기까지 같이 죽는다.
    expect(SCHED_POLICY).toContain('approved = true');
    expect(SCHED_POLICY.indexOf('venue_is_hidden')).toBeLessThan(SCHED_POLICY.indexOf('or owner_id'));
  });

  it('정지 매장 운영자는 자기 클락을 계속 본다 — 진행 중 게임을 마감할 수 있어야 한다', () => {
    expect(CLOCK_POLICY).toContain('coalesce(public.can_access_ledger(venue_id), false)');
    expect(SCHED_POLICY).toContain('coalesce(public.can_access_ledger(venue_id), false)');
    // 20260623p 가 지운 중복 정책이 되살아나면 permissive OR 로 이 변경이 통째로 무효가 된다.
    expect(SQL).toContain('drop policy if exists clock_states_read on public.clock_states;');
    expect(SQL).toContain("and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'");
  });

  it('RLS 가 호출자 권한으로 부르는 헬퍼라 anon·authenticated EXECUTE 를 반드시 남긴다', () => {
    // `from anon` 만으로는 PUBLIC 기본 GRANT 가 남는다 → public 부터 회수.
    expect(SQL).toContain('revoke all on function public.venue_is_hidden(uuid) from public;');
    expect(SQL).toContain('grant execute on function public.venue_is_hidden(uuid) to anon, authenticated, service_role;');
    // 내부 전용으로 착각해 회수하면 포스터·클락 읽기가 전부 42501 이 된다.
    expect(SQL).not.toContain('revoke all on function public.venue_is_hidden(uuid) from public, anon');
    expect(SQL).toContain("has_function_privilege('anon', 'public.venue_is_hidden(uuid)', 'execute')");
    expect(SQL).toContain("has_function_privilege('authenticated', 'public.venue_is_hidden(uuid)', 'execute')");
    expect(HELPER).toContain('set search_path = public, pg_temp');
  });

  it('신규 예약은 이미 있는 최후 게이트 한 곳에서 막는다(RPC·직접 insert 양쪽)', () => {
    expect(TRIGGER_FN).toContain('public.venue_is_hidden(v_venue)');
    expect(TRIGGER_FN).toContain("raise exception '지금은 예약을 받지 않는 매장입니다'");
    // 20260726a 의 종료 판정은 그대로 남아 있어야 한다(같은 함수를 덮어쓰기 때문).
    expect(TRIGGER_FN).toContain('public._schedule_ended(new.schedule_id) is not false');
    expect(TRIGGER_FN).toContain("raise exception '이미 종료된 대회입니다 — 예약할 수 없습니다'");
    // 정책을 새로 만들어 판정이 두 벌이 되면 안 된다.
    expect(SQL).not.toContain('create policy sr_insert');
  });

  it('이미 예약한 손님의 취소는 막지 않는다 — 가둬 두면 안 된다', () => {
    expect(SQL).not.toContain('before delete on public.schedule_reservations');
    expect(SQL).not.toContain('create policy sr_delete');
    expect(SQL).toContain('before insert on public.schedule_reservations');
  });

  it('새 RPC 를 만들지 않는다 — 앱 먼저 배포되는 창에서 PGRST202 가 날 자리가 없다', () => {
    expect(SQL).not.toContain('returns table(');
    expect(SQL).not.toContain('drop function if exists public.reserve_schedule');
    // 클라이언트는 이 마이그레이션 때문에 새 호출을 배우지 않는다.
    expect(RES_TS).not.toContain('venue_is_hidden');
  });

  it('내려간 포스터의 내 예약 행은 남고, 비는 정보는 정직하게 말한다', () => {
    expect(RES_TS).toContain("title: r.schedules?.title ?? '(내려간 대회)'");
    // embed 는 !inner 가 아니어야 행 자체가 살아남는다(취소 버튼이 붙어 있어야 한다).
    expect(RES_TS).toContain('schedules(title, date, start_time, venue_id, venues(name))');
  });

  it('삭제된 컬럼을 쓰지 않고, 표·컬럼을 새로 만들지 않는다(멱등·비파괴)', () => {
    expect(SQL).not.toContain('profiles.ci ');
    expect(SQL).not.toMatch(/create\s+table/i);
    expect(SQL).not.toMatch(/add\s+column/i);
    expect(SQL).not.toMatch(/\bdelete\s+from\b/i);
    expect(SQL).not.toMatch(/\bupdate\s+public\./i);
  });

  it('적용 시점에 스스로 확인한다(ABORT 블록)', () => {
    expect(SQL).toContain('ABORT:');
    expect(SQL).toContain("notify pgrst, 'reload schema';");
    // 정상 매출 보호 — active 매장이 하나라도 가려지면 적용을 멈춘다.
    expect(SQL).toContain('ABORT: active 매장 %건이 비활성으로 판정됨');
  });
});
