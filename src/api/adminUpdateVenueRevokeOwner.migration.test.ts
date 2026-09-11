// 업주 교체가 이전 업주의 매장 권한까지 회수하는가 (2026-09-11 · 20260911l)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   회수 로직은 DB 에 적용해야만 도는 코드라 단위 테스트가 실행으로 검증할 수 없다.
//   그래서 **문장이 SQL 안에 실제로 적혀 있는지**를 잠근다(실행 검증은 파일 하단 do $verify$ … ABORT 가 맡는다).
//
// 이 테스트가 잡는 회귀
//   ① 회수 세 줄(사장님·장부·이용권) 중 하나가 빠지는 것 — 하나만 남아도 문이 열린다
//   ② 회수 범위가 매장을 넘어(user_id 만으로) 다른 매장 권한까지 날리는 것
//   ③ 이전 업주의 계정 역할(role)을 내려 그 사람의 다른 매장을 죽이는 것
//   ④ 본문을 손으로 옮겨 적다 기존 로직(필수값·업주 갱신·연결 해제·임명)을 흘리는 것
//   ⑤ 관리자 가드를 NULL-safe 가 아닌 비교로 되돌리는 것(20260820a 가 고친 fail-open)
//   ⑥ 시그니처를 바꿔 '앱 먼저 배포' 창에 PGRST202 를 만드는 것
//   ⑦ CREATE OR REPLACE 뒤 ACL 재선언을 빠뜨리는 것
//   ⑧ 권한 판정이 읽지도 않는 venue_staff 명부를 같이 지우는 것(데이터만 날아간다)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911l_admin_update_venue_revoke_owner.sql'),
  'utf-8',
);
/** 함수 선언부터 revoke 까지 — 머리말 주석·ROLLBACK 주석이 통과시켜 주는 착시를 막는다. */
const FN = SQL.slice(
  SQL.indexOf('create or replace function public.admin_update_venue'),
  SQL.indexOf('revoke all on function public.admin_update_venue'),
);
/** 이전 업주 분기만 — 새 업주 분기가 대신 통과시켜 주는 착시를 막는다. */
const OLD_OWNER = FN.slice(FN.indexOf('if v_old_owner is not null then'), FN.indexOf('if p_owner_id is not null then'));

const ADMIN_TSX = readFileSync(join(__dirname, '..', 'components', 'features', 'AdminTab.tsx'), 'utf-8');

describe('20260911l — 업주를 교체하면 이전 업주의 매장 권한도 회수된다', () => {
  it('이전 업주의 세 권한 경로를 매장 범위로 회수한다', () => {
    // can_manage_pos / can_manage_venue_staff 가 보는 행
    expect(OLD_OWNER).toContain('delete from public.venue_owners  where venue_id = p_venue_id and user_id = v_old_owner;');
    // can_access_ledger 가 보는 행(장부 금액·손님 명단)
    expect(OLD_OWNER).toContain('delete from public.ledger_access  where venue_id = p_venue_id and user_id = v_old_owner;');
    // can_view_vouchers 가 보는 행(이용권 발급·내역)
    expect(OLD_OWNER).toContain('delete from public.voucher_access where venue_id = p_venue_id and user_id = v_old_owner;');
  });

  it('회수는 이 매장 범위를 넘지 않는다 — 이전 업주가 다른 매장의 사장일 수 있다', () => {
    expect(FN).not.toMatch(/delete from public\.\w+\s+where user_id = v_old_owner/);
    expect(FN).not.toContain("set role = 'user'");
    expect(FN).not.toContain('approved = false');
  });

  it('권한 판정이 읽지 않는 명부(venue_staff)는 건드리지 않는다', () => {
    // 주석에서 can_manage_venue_staff 를 언급하는 것까지 막지는 않는다 — 실제 접근만 막는다.
    expect(FN).not.toMatch(/(from|into|update|join)\s+public\.venue_staff\b/);
  });

  it('새 업주를 승인된 사장님으로 올린다 — on conflict 대상은 실제 기본키와 같다', () => {
    expect(FN).toContain('insert into public.venue_owners (venue_id, user_id, added_by, status)');
    expect(FN).toContain("values (p_venue_id, p_owner_id, auth.uid(), 'approved')");
    expect(FN).toContain("on conflict (venue_id, user_id) do update set status = 'approved'");
    // 기본키가 바뀌면 upsert 가 조용히 틀린다 — 적용 시점에 확인한다.
    expect(SQL).toContain("t.relname = 'venue_owners' and c.contype = 'p'");
  });

  it('현행 정의의 다른 로직이 그대로 남아 있다', () => {
    expect(FN).toContain("raise exception '매장명과 지역은 필수입니다'");
    expect(FN).toContain('select owner_id into v_old_owner from public.venues where id = p_venue_id;');
    expect(FN).toContain('owner_id   = p_owner_id,');
    expect(FN).toContain('update public.profiles set venue_id = null');
    expect(FN).toContain('where id = v_old_owner and venue_id = p_venue_id;');
    expect(FN).toContain("set role = 'venue_owner'::user_role, venue_id = p_venue_id, approved = true");
    expect(FN).toContain('if p_owner_id is distinct from v_old_owner then');
  });

  it('관리자 가드는 NULL-safe 다 (비로그인에서 열리면 임의 매장 업주 교체가 된다)', () => {
    expect(FN).toContain("if my_role() is distinct from 'admin'::user_role then");
    expect(FN).not.toMatch(/my_role\(\)\s*<>\s*'admin'/);
  });

  it('없는 매장 id 는 명시적으로 거절한다 — FK 오류로 제약 이름이 새지 않게', () => {
    expect(FN).toContain("raise exception '매장을 찾을 수 없습니다'");
    const guard = FN.indexOf('if not found then');
    expect(guard).toBeGreaterThan(FN.indexOf('update public.venues'));
    expect(guard).toBeLessThan(FN.indexOf('insert into public.venue_owners'));
  });

  it('시그니처를 바꾸지 않는다 — 앱이 먼저 배포돼도 PGRST202 창이 없다', () => {
    expect(FN).toContain('create or replace function public.admin_update_venue(');
    expect(FN).toContain("p_address text default ''::text");
    expect(FN).toContain('p_owner_id uuid default null::uuid');
    expect(FN).toContain('returns void');
    expect(SQL).not.toMatch(/drop function[^\n]*admin_update_venue/);
  });

  it('SECURITY DEFINER 는 search_path 를 고정하고, CREATE OR REPLACE 뒤 ACL 을 다시 건다', () => {
    expect(FN).toContain('security definer');
    expect(FN).toContain('set search_path = public, pg_temp');
    // `from anon` 만으로는 PUBLIC 기본 GRANT 가 남는다.
    expect(SQL).toContain('revoke all on function public.admin_update_venue(uuid, text, text, text, uuid) from public, anon;');
    expect(SQL).toContain('grant execute on function public.admin_update_venue(uuid, text, text, text, uuid) to authenticated, service_role;');
  });

  it('적용 시점에 스스로 확인한다(ABORT 블록) — 그리고 검사 문자열이 본문 주석에 없다', () => {
    expect(SQL).toContain('ABORT:');
    expect(SQL).toContain("notify pgrst, 'reload schema';");
    // prosrc 에는 주석도 들어간다 — 검사 문자열이 본문 주석에 있으면 검사가 스스로를 속인다.
    for (const line of FN.split('\n').filter((l) => l.trim().startsWith('--'))) {
      expect(line).not.toContain('delete from public.venue_owners');
      expect(line).not.toContain('delete from public.ledger_access');
      expect(line).not.toContain('delete from public.voucher_access');
      expect(line).not.toContain('on conflict (venue_id, user_id)');
      expect(line).not.toContain("is distinct from 'admin'");
      expect(line).not.toContain("set role = 'user'");
    }
  });

  it('머리말이 남는 문(대표 교체 후 잔존 행)을 숨기지 않는다', () => {
    // blastRadius 의 '새 권한은 안 생긴다' 는 삽입 시점만 맞다 — 행은 owner_id 보다 오래 산다.
    const head = SQL.slice(0, SQL.indexOf('create or replace function public.admin_update_venue'));
    expect(head).toContain('transfer_venue_primary');
    expect(head).toContain('admin_create_venue');
  });

  it('관리자 화면이 회수 사실을 말한다 — 되돌리려면 재초대·승인이 필요하다', () => {
    expect(ADMIN_TSX).toContain('이 매장에서 제외됩니다');
    expect(ADMIN_TSX).toContain('권한이 함께 회수됩니다');
  });
});
