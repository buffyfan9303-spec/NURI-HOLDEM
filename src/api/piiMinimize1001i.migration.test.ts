// 20261001i — 초대 이메일·매장 보안 설정 여부·공개 순위 role 을 줄였는가 (SEC-01 · SEC-04 · SEC-05)
//
// DB 에 적용해야 도는 코드라 실행 검증은 마이그레이션 하단 REHEARSAL(라이브 begin…raise 롤백)이 맡는다.
// 여기서는 **본문에 조건이 실제로 적혀 있는지**를 잠그고, 옛 정의를 넣으면 같은 검사가 실패하는지(음성 대조)도 본다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20261001i_pii_minimize_invites_leaderboard.sql'),
  'utf-8',
).replace(/\r\n/g, '\n');
/** 적용 본문만 — 주석·REHEARSAL 블록 속 글자가 통과시켜 주는 착시를 막는다. */
const APPLIED = SQL.slice(0, SQL.indexOf('/* ── REHEARSAL')).replace(/^\s*--.*$/gm, '');

function fn(src: string, name: string): string {
  const start = src.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  if (start < 0) return '';
  return src.slice(start, src.indexOf('$function$;', start));
}

const inviteEmailHidden = (body: string) => /case when my_role\(\) = 'admin'::user_role then p\.email end/.test(body);
const flagGated = (body: string, gate: string) => new RegExp(`coalesce\\(public\\.${gate}\\(p_venue_id\\), false\\)\\s+and exists`).test(body);
const killGated = (body: string) =>
  /v\.id = p_venue_id\s+and \(v\.owner_id = auth\.uid\(\) or coalesce\(my_role\(\) = 'admin'::user_role, false\)\)\)\s+and exists\(select 1 from public\.venue_kill_switch/.test(body);
const noRole = (body: string) => !/\brole\b/.test(body.slice(0, body.indexOf('language sql')));
const anonRevoked = (src: string, sig: string) =>
  new RegExp(`revoke all on function public\\.${sig.replace(/[()]/g, '\\$&')} from public, anon;`).test(src)
  && !new RegExp(`grant execute on function public\\.${sig.replace(/[()]/g, '\\$&')} to [^;]*\\banon\\b`).test(src);

// 2026-10-01 라이브에서 읽은 옛 정의의 핵심 줄(음성 대조용)
const OLD_INVITES = `create or replace function public.get_my_venue_invites(p_venue_id uuid default null)
 returns table(id uuid, user_id uuid, email text) language sql as $function$
  select i.id, i.user_id, p.email, p.nickname from venue_staff_invites i join profiles p on p.id = i.user_id
$function$;`;
const OLD_KILL = `create or replace function public.kill_switch_is_set(p_venue_id uuid) returns boolean language sql as $function$
  select exists(select 1 from public.venue_kill_switch where venue_id = p_venue_id);
$function$;`;
const OLD_BOARD = `create or replace function public.get_activity_leaderboard(p_limit integer default 20)
 returns table(id uuid, nickname text, activity_points integer, avatar_color text, role user_role, equipped_mark text)
 language sql as $function$ select 1 $function$;`;

describe('20261001i — 개인정보·설정 여부 최소 노출', () => {
  it('적용 전 게이트가 네 함수의 라이브 md5 를 확인한다', () => {
    for (const h of ['50deb1d63f7e26b89016367cdd5b87df', '56effd97dc607699f6500a79f313159f',
      '4283d7c72980b7c5208a797a5b8184ce', '4419e4baa9e9560d9943693710de944e']) expect(APPLIED).toContain(h);
  });

  it('SEC-01: 초대 대기 목록의 이메일은 관리자에게만 — 옛 정의는 같은 검사에 걸린다', () => {
    expect(inviteEmailHidden(fn(APPLIED, 'get_my_venue_invites'))).toBe(true);
    expect(inviteEmailHidden(fn(OLD_INVITES, 'get_my_venue_invites'))).toBe(false);
    expect(fn(APPLIED, 'get_my_venue_invites')).toContain('and can_manage_pos(i.venue_id)');
    expect(anonRevoked(APPLIED, 'get_my_venue_invites(uuid)')).toBe(true);
  });

  it('SEC-04: 킬스위치·취소 비밀번호 설정 여부는 권한자에게만 true — 옛 정의는 걸린다', () => {
    // 킬스위치는 set_kill_password 와 같은 서버 조건(대표 업주 또는 관리자) — 정지 제외를 더하면 '최초 설정 → 서버 거부' 막다른 길(검토 권고 A)
    expect(killGated(fn(APPLIED, 'kill_switch_is_set'))).toBe(true);
    expect(fn(APPLIED, 'kill_switch_is_set')).not.toContain('can_manage_pos');
    expect(killGated(fn(OLD_KILL, 'kill_switch_is_set'))).toBe(false);
    expect(flagGated(fn(APPLIED, 'pos_has_password'), 'can_access_ledger')).toBe(true);
    expect(anonRevoked(APPLIED, 'kill_switch_is_set(uuid)')).toBe(true);
    expect(anonRevoked(APPLIED, 'pos_has_password(uuid)')).toBe(true);
  });

  it('SEC-05: 공개 순위는 role 을 반환하지 않는다 — 반환 타입이 바뀌니 DROP 후 ACL 을 다시 쓴다', () => {
    expect(noRole(fn(APPLIED, 'get_activity_leaderboard'))).toBe(true);
    expect(noRole(fn(OLD_BOARD, 'get_activity_leaderboard'))).toBe(false);
    const drop = APPLIED.indexOf('drop function if exists public.get_activity_leaderboard(integer);');
    const revoke = APPLIED.indexOf('revoke all on function public.get_activity_leaderboard(integer) from public;');
    expect(drop).toBeGreaterThan(-1);
    expect(revoke).toBeGreaterThan(drop);
    expect(APPLIED).toContain('grant execute on function public.get_activity_leaderboard(integer) to anon, authenticated, service_role;');
  });

  it('네 함수 모두 SECURITY DEFINER + search_path 고정', () => {
    for (const n of ['get_my_venue_invites', 'kill_switch_is_set', 'pos_has_password', 'get_activity_leaderboard']) {
      const b = fn(APPLIED, n);
      expect(b, n).toContain('security definer');
      expect(b, n).toContain('set search_path = public, pg_temp');
    }
  });
});
