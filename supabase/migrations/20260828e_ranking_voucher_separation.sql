-- ============================================================================
-- 순위 저장 ↔ 매장이용권 지급 분리 (2026-08-28, 오너 지시)
--
-- 실측으로 확인한 사실 — '순위 저장이 이용권 때문에 롤백된다'는 가설은 거짓이다.
--   라이브 DB 에서 (E2E 매장 업주로 임퍼소네이트, 트랜잭션 롤백) 재현한 결과:
--     save_venue_rankings(...)                    → 성공(2행 저장)
--     issue_voucher(..., 미인증 회원)              → 실패
--        "매장이용권은 본인인증 회원만 보유·사용할 수 있습니다 — 프로필 > 보안에서 …"
--     순위 2행은 그대로 잔존
--   save_venue_rankings 는 store_vouchers 를 건드리지 않고, venue_rankings 에는
--   이용권 트리거도 없다. 즉 서버는 이미 분리돼 있었고, 두 작업을 한 버튼에 묶어
--   'RPC 성공 → 이어서 이용권 발급 루프'를 돌린 것은 클라이언트(RankingEditor)였다.
--   그래서 이 파일은 save_venue_rankings 를 건드리지 않는다(뗄 지급 로직이 없다).
--
-- 진짜 원인은 '본인인증 게이트가 두 곳에 서로 다른 기준으로 있는 것'이다.
--   · issue_voucher      : profiles.real_name 이 채워졌는가
--   · trg_voucher_verified(_voucher_require_verified, 2026-08-27) : profiles.ci_hash 가 있는가
--   두 기준이 갈려 있어 real_name 만 있는 회원은 RPC 를 통과한 뒤 트리거에서 막히고,
--   발급 한도까지 차감했다가 되돌아온다. 게이트 판정을 is_ci_verified 단일 소스로 모아
--   같은 회원에게 같은 이유·같은 문구로, 한도 차감 전에 거절되게 한다.
--   (정책은 최신인 2026-08-27 트리거 = CI 보유 기준을 따른다. 트리거가 어차피 막던
--    'real_name 만 있는 회원'은 전후 모두 거절이라 실사용 영향은 문구뿐이다.)
-- ============================================================================

-- ── (1) 순위 자동완성용 회원 검색 — user_id 동반 ─────────────────────────────
-- 왜 새로 만드나: 기존 search_members_for_ranking 은 (nickname, real_name, verified)
--   만 돌려줘 '누구에게 보낼지'를 특정할 수 없다. 그래서 지급 시점에 닉네임으로
--   find_user_for_transfer 를 다시 부분일치 검색했고, 동명이인·유사닉이면 지급을
--   통째로 보류하거나(확인필요) 엉뚱한 사람에게 나갈 위험을 안았다.
--   후보를 고르는 순간 id 를 붙잡아 두면 그 뒤로는 재검색이 필요 없다.
-- 기존 함수는 그대로 둔다(호출부 보존) — 이 파일은 순수 additive.
drop function if exists public.search_ranking_members(text);
create function public.search_ranking_members(p_q text)
returns table(id uuid, nickname text, real_name text, verified boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,
         p.nickname,
         p.name,                                              -- 표시 실명(구 RPC 와 동일 컬럼)
         public.is_ci_verified(p.ci_hash, p.verified_at)      -- 이용권 지급 가능 여부와 같은 판정
  from public.profiles p
  where exists (                                              -- 업주·운영자만(구 RPC 와 동일 게이트)
          select 1 from public.profiles me
          where me.id = auth.uid() and me.role in ('venue_owner', 'admin')
        )
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(p_q, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
  order by (p.nickname = btrim(p_q)) desc, p.nickname
  limit 12;                                                   -- 동명이인 표시용으로 8 → 12
$$;
revoke all on function public.search_ranking_members(text) from public, anon;
grant execute on function public.search_ranking_members(text) to authenticated;

-- ── (2) 이용권 지급 게이트 단일화 — is_ci_verified 하나로 ────────────────────
-- 바뀌는 것은 게이트 판정 기준과 문구뿐. 권한·승인·한도·만료·발급·알림은 그대로다.
create or replace function public.issue_voucher(
  p_venue_id uuid, p_title text, p_count integer default 1,
  p_holder_name text default null, p_holder_user_id uuid default null,
  p_note text default null, p_expires_at timestamp with time zone default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_count int; v_title text; v_holder text; v_quota int; v_vname text;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'; end if;
  if my_role() IS DISTINCT FROM 'admin' and not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 매장이용권을 발급할 수 있습니다';
  end if;
  -- 본인인증 게이트 — trg_voucher_verified 와 같은 기준(is_ci_verified).
  -- 여기서 먼저 막아야 한도 차감 뒤 트리거에서 되돌아오는 낭비가 없다.
  if p_holder_user_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_holder_user_id and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '본인인증을 완료한 회원에게만 매장이용권을 지급할 수 있습니다 — 받는 분이 프로필 > 보안에서 본인인증을 마쳐야 합니다';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception '만료일은 미래 시각이어야 합니다';
  end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  if my_role() IS DISTINCT FROM 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족합니다 (잔여 %개) — 운영자에게 문의해 주세요', coalesce(v_quota, 0);
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), '매장이용권');
  v_holder := nullif(btrim(coalesce(p_holder_name, '')), '');
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note, expires_at)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), ''), p_expires_at
  from generate_series(1, v_count);
  if p_holder_user_id is not null then
    begin
      select name into v_vname from public.venues where id = p_venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (p_holder_user_id, 'system', '🎟 매장이용권 도착!',
              format('%s에서 ''%s'' %s장을 보냈어요. 지갑에서 확인하세요%s',
                     coalesce(v_vname, '매장'), v_title, v_count,
                     case when p_expires_at is not null
                          then format(' (유효기간 ~%s)', to_char(p_expires_at at time zone 'Asia/Seoul', 'MM/DD'))
                          else '' end),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
  return v_count;
end $function$;
-- CREATE OR REPLACE 는 ACL 을 초기화하지 않지만(같은 시그니처), 명시로 못 박는다.
revoke all on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone) from public, anon;
grant execute on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone) to authenticated;

-- ── (3) 순위 저장 RPC 의 과잉 EXECUTE 회수 ───────────────────────────────────
-- 함수 안에서 can_manage_venue 로 막히긴 하지만(anon 은 false — fail-open 아님 실측 확인),
-- 비로그인이 호출을 시도할 이유 자체가 없다. 시그니처·본문은 그대로 둔다.
revoke execute on function public.save_venue_rankings(uuid, date, jsonb)       from public, anon;
revoke execute on function public.save_venue_rankings(uuid, date, jsonb, text) from public, anon;
grant  execute on function public.save_venue_rankings(uuid, date, jsonb)       to authenticated;
grant  execute on function public.save_venue_rankings(uuid, date, jsonb, text) to authenticated;
