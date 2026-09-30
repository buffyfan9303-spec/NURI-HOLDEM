// 화면만 막던 가드를 서버로 옮긴 20260930f 의 조건이 SQL 에 실제로 적혀 있는지 잠근다(D-2 보안 점검).
// 실행 검증은 라이브 begin…rollback 리허설(파일 하단 기록)과 파일 안 §14 자가검사가 맡는다.
// 슬라이스는 섹션 마커(`-- §N `)로 — 머리말 주석의 설명 문장이 통과시켜 주는 착시를 막는다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260930f_server_guards_sanction_verify.sql'),
  'utf-8',
).replace(/\r\n/g, '\n');
const between = (from: string, to: string) => {
  const a = SQL.indexOf(from);
  const b = SQL.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`앵커를 찾지 못했다: ${from} … ${to}`);
  return SQL.slice(a, b);
};
const ACTIVE = 'if not public.is_account_active() then';

describe('20260930f — 서버 가드(본인인증·제재·공개 반환)', () => {
  it('F1 예약: 활성 계정만 본다 — 본인인증은 없다(오너 결정 2026-09-29 "대회 예약은 로그인만")', () => {
    const fn = between('-- §2 ', '-- §2-b');
    expect(fn).toContain(ACTIVE);
    expect(fn.indexOf(ACTIVE)).toBeLessThan(fn.indexOf('insert into schedule_reservations'));
    expect(fn).not.toContain('is_ci_verified');
    expect(fn).not.toContain('identity_gate_on');
  });

  it('F1 예약: 직접 INSERT·열 전체 UPDATE 회수, 이름만 고칠 수 있다', () => {
    const acl = between('-- §2-b', '-- §3 ');
    expect(acl).toContain('revoke all on table public.schedule_reservations from anon;');
    expect(acl).toContain('revoke insert, update on table public.schedule_reservations from authenticated;');
    expect(acl).toContain('grant update (display_name) on table public.schedule_reservations to authenticated;');
  });

  it('F2 트리거: 정의자 함수 안(auth.uid 있음)에서도 켜진다', () => {
    const trg = between('-- §1 ', '-- §2 ');
    expect(trg).toContain("(current_user in ('authenticated','anon') or auth.uid() is not null) and not public.is_account_active()");
  });

  it('F2·F3 쓰기 함수 첫 분기에 제재 검사', () => {
    for (const [from, to] of [['-- §3 ', '-- §4 '], ['-- §4 ', '-- §5 '], ['-- §6 ', '-- §7 '], ['-- §8 ', '-- §8-b']]) {
      expect(between(from, to)).toContain(ACTIVE);
    }
    // 접속 점수는 예외 대신 null — 호출부(auth.ts)는 오류를 삼키고 null 로 본다
    expect(between('-- §5 ', '-- §6 ')).toMatch(/if not public\.is_account_active\(\) then\n\s+return null;/);
    expect(between('-- §8-b', '-- §9 ')).toContain('with check (user_id = (select auth.uid()) and public.is_account_active())');
  });

  it('오너 결정(2026-09-30): 이용권 사용 경로에는 제재 차단을 넣지 않는다', () => {
    expect(SQL).not.toMatch(/create or replace function public\.redeem_my_voucher/);
  });

  it('F4 venues 수정은 제재 판정을 거친다(관리자 분기 유지)', () => {
    const pol = between('-- §9 ', '-- §10 ');
    expect(pol).toContain('public._actor_not_sanctioned()');
    expect(pol).toContain("my_role() = 'admin'::user_role");
  });

  it('P2-1 순위: total_won 을 반환하지 않고, DROP 뒤 ACL 을 다시 쓴다', () => {
    const fn = between('-- §10 ', '-- §12 ');
    expect(fn).toContain('returns table(nickname text, points bigint, wins integer, overseas integer)');
    expect(fn.slice(fn.indexOf('drop function'))).not.toContain('total_won'); // 섹션 제목(설명)은 빼고 코드만
    expect(fn).toContain('revoke all on function public.get_domestic_rankings(integer) from public;');
    expect(fn).toContain('grant execute on function public.get_domestic_rankings(integer) to anon, authenticated, service_role;');
    // 클라이언트도 같은 브랜치에서 읽지 않는다
    expect(readFileSync(join(__dirname, 'rankverify.ts'), 'utf-8')).not.toContain('total_won');
  });

  it('P2-2 는 이번 파일에서 빠졌다(별도 과제 — 공개 보드 기능 축소)', () => {
    expect(SQL).not.toMatch(/create or replace function public\.venue_player_counts/);
  });

  it('P2-3 투표 결과·기표는 글 조회 가능 여부를 본다', () => {
    const fn = between('-- §7 ', '-- §8 ');
    expect(fn).toContain('and public._poll_visible(p_poll_id)');
    expect(fn).toContain('if not public._poll_visible(p_poll_id) then');
    expect(fn).toContain('revoke all on function public._poll_visible(uuid) from public, anon, authenticated;');
  });

  it('P2-5 정책 0개 테이블의 GRANT 회수', () => {
    const sec = between('-- §12 ', '-- §13 ');
    for (const t of ['venue_event_requests', 'venue_owners', 'voucher_credit_requests', 'venue_kill_switch']) {
      expect(sec).toMatch(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated;`));
    }
  });
});
