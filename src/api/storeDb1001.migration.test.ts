// 20261001k·l·m·n — 내 매장 서버 결함 S-07·S-09·S-08·S-11 (audit-store-1001)
//
// 실행 검증은 각 마이그레이션 하단 REHEARSAL(라이브 begin…raise 롤백)이 맡는다.
// 여기서는 적용 본문에 조건이 실제로 적혀 있는지를 잠그고, 옛 정의를 넣으면 같은 검사가 실패하는지(음성 대조)도 본다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', f), 'utf-8').replace(/\r\n/g, '\n');
/** 적용 본문만 — 주석·REHEARSAL 블록 속 글자가 통과시켜 주는 착시를 막는다. */
const applied = (src: string) => src.slice(0, src.indexOf('/* ── REHEARSAL')).replace(/^\s*--.*$/gm, '');

const K = applied(read('20261001k_today_games_hidden_login.sql'));
const L = applied(read('20261001l_can_manage_venue_unify.sql'));
const M = applied(read('20261001m_coowner_venue_page_edit.sql'));
const N = applied(read('20261001n_posters_upload_owner_only.sql'));

function fn(src: string, name: string): string {
  const head = `create or replace function public.${name}(`;
  const start = src.indexOf(head);
  if (start < 0) return '';
  return src.slice(start, src.indexOf('$function$;', start));
}
const anonRevoked = (src: string, sig: string) => {
  const grantPrefix = `grant execute on function public.${sig} to `;
  const grantsAnon = src.split('\n').some((l) => l.startsWith(grantPrefix) && /\banon\b/.test(l.slice(grantPrefix.length)));
  return src.includes(`revoke all on function public.${sig} from public, anon;`) && !grantsAnon;
};
const hiddenGated = (body: string) => body.includes('and not public.venue_hidden_for_viewer(p_venue_id)');
const delegatesToPos = (body: string) => /\$function\$[\s\S]*select public\.can_manage_pos\(p_venue_id\);\s*$/.test(body) && !/venue_owner'/.test(body);
/** venues_update 의 공동 운영자 분기 — 호출자가 실행할 수 있는 can_manage_pos 로만(직접 _venue_coowner_ok 는 42501) */
const policyBlock = (src: string) => src.slice(src.indexOf('alter policy venues_update'), src.indexOf(';', src.indexOf('alter policy venues_update')));
const coownerPolicyOk = (src: string) => policyBlock(src).includes('public.can_manage_pos(id)') && !policyBlock(src).includes('_venue_coowner_ok');
const postersBlock = (src: string) => src.slice(src.indexOf('alter policy posters_upload'), src.indexOf(';', src.indexOf('alter policy posters_upload')));
const postersOwnerOnly = (src: string) => {
  const b = postersBlock(src);
  return b.includes('public.is_any_venue_manager()') && b.includes('v.owner_id = (select auth.uid())')
    && !b.includes('my_role()') && !b.includes('approved') && b.includes("bucket_id = 'posters'") && b.includes('storage.foldername(name)');
};

// 2026-10-01 라이브에서 읽은 옛 정의(음성 대조용)
const OLD_TODAY = `create or replace function public.venue_today_games(p_venue_id uuid)
 returns table(game_seq smallint, title text) language sql security definer as $function$
  select s.game_seq, s.title from ledger_sessions s
  where s.venue_id = p_venue_id and s.session_date = public.ledger_business_date(p_venue_id)
  order by s.game_seq;
$function$;`;
const OLD_CMV = `create or replace function public.can_manage_venue(p_venue_id uuid) returns boolean language sql as $function$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.status, 'active') = 'active'
    and (p.role = 'admin' or (p.role = 'venue_owner' and p.approved)));
$function$;`;
const OLD_VU = `alter policy venues_update on public.venues
  using (((owner_id = (select auth.uid())) and public._actor_not_sanctioned()) or (my_role() = 'admin'::user_role));`;
const BAD_VU = `alter policy venues_update on public.venues
  using ((owner_id = (select auth.uid())) or (public._venue_coowner_ok(id, (select auth.uid())) and public._actor_not_sanctioned()));`;
const OLD_POSTERS = `alter policy posters_upload on storage.objects
  with check ((bucket_id = 'posters'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and ((my_role() = any (array['venue_owner'::user_role, 'admin'::user_role])) or public.is_any_venue_manager()));`;

describe('20261001k — S-07 오늘 게임 목록', () => {
  it('라이브 md5 게이트', () => {
    expect(K).toContain('afa7e21bf196696917e6f7e5f924152f');
    expect(K).toContain('88a9bc59252dc7f6e752af70d9ba4741');
  });
  it('숨긴 매장 판정이 본문에 있다 — 옛 정의는 걸린다', () => {
    expect(hiddenGated(fn(K, 'venue_today_games'))).toBe(true);
    expect(hiddenGated(fn(OLD_TODAY, 'venue_today_games'))).toBe(false);
  });
  it('비로그인 실행 회수 · 로그인 손님은 유지', () => {
    expect(anonRevoked(K, 'venue_today_games(uuid)')).toBe(true);
    expect(K).toContain('grant execute on function public.venue_today_games(uuid) to authenticated, service_role;');
    expect(anonRevoked('grant execute on function public.venue_today_games(uuid) to anon, authenticated;', 'venue_today_games(uuid)')).toBe(false);
  });
});

describe('20261001l — S-09 can_manage_venue 통일', () => {
  it('라이브 md5·전이 폐쇄 호출자 집합 게이트', () => {
    expect(L).toContain('b09b193c4bc88b6de37f9ae4fd70db37');
    expect(L).toContain('989d68ec42fbf6875d1049b457f541c6');
    expect(L).toContain("'redeem_voucher,save_venue_rankings,set_venue_coords,update_venue_address,update_venue_contact,update_venue_contacts,venue_player_counts'");
  });
  it('본문은 can_manage_pos 위임 한 줄 — role 조건이 남은 옛 정의는 걸린다', () => {
    expect(delegatesToPos(fn(L, 'can_manage_venue'))).toBe(true);
    expect(delegatesToPos(fn(OLD_CMV, 'can_manage_venue'))).toBe(false);
    expect(fn(L, 'can_manage_venue')).toContain("set search_path to 'public', 'pg_temp'");
    expect(fn(L, 'can_manage_venue')).toContain('security definer');
  });
});

describe('20261001m — S-08 공동 운영자 매장 페이지 수정', () => {
  it('라이브 md5 게이트(정책·승인 게이트·민감 칸 트리거)', () => {
    for (const h of ['6375dc38eaaea7ee8527d908c350e846', '19054611fd0e9f105c7ca3a33f872281', '409578b1db9f5231d2e2003e57afdfba']) expect(M).toContain(h);
  });
  it('정책은 can_manage_pos 로만 넓힌다 — 옛 정책·_venue_coowner_ok 직접 호출(42501)은 걸린다', () => {
    expect(coownerPolicyOk(M)).toBe(true);
    expect(coownerPolicyOk(OLD_VU)).toBe(false);
    expect(coownerPolicyOk(BAD_VU)).toBe(false);
  });
  it('칸 제한 트리거가 같은 파일에 있고 허용 목록에 민감 칸이 없다', () => {
    expect(M).toContain('create trigger trg_guard_venue_coowner_columns');
    expect(M).toContain('before update on public.venues');
    const list = M.slice(M.indexOf('c_page text[] := array['), M.indexOf('];', M.indexOf('c_page text[] := array[')));
    for (const ok of ['description', 'image_url', 'images', 'kakao_url']) expect(list).toContain(`'${ok}'`);
    for (const bad of ['owner_id', 'approved', 'status', 'name', 'business_number', 'slug', 'kind', 'verification_status', 'page_config', 'join_approval'])
      expect(list).not.toContain(`'${bad}'`);
    expect(M).toContain('old.owner_id is distinct from auth.uid()');
    expect(M).toContain('revoke all on function public._guard_venue_coowner_columns() from public, anon, authenticated;');
  });
  it('트리거 없이 정책만 넓히면 걸린다(음성 대조)', () => {
    const policyOnly = OLD_VU.replace("(my_role() = 'admin'::user_role));", "(my_role() = 'admin'::user_role) or public.can_manage_pos(id));");
    expect(coownerPolicyOk(policyOnly)).toBe(true);
    expect(policyOnly.includes('create trigger trg_guard_venue_coowner_columns')).toBe(false);
  });
});

describe('20261001n — S-11 포스터 업로드', () => {
  it('라이브 md5 게이트', () => {
    expect(N).toContain('3e465a2f3bbd5e9df8c6001f4caee7c9');
  });
  it('역할만 보는 절 제거 · 매장 소유(승인 무관) — 옛 정책은 걸린다', () => {
    expect(postersOwnerOnly(N)).toBe(true);
    expect(postersOwnerOnly(OLD_POSTERS)).toBe(false);
    // 승인 조건을 넣으면 첫 매장 사진이 깨진다(2026-09-30 42501) — 그것도 걸린다
    expect(postersOwnerOnly(N.replace('v.owner_id = (select auth.uid())', 'v.owner_id = (select auth.uid()) and v.approved'))).toBe(false);
  });
});
