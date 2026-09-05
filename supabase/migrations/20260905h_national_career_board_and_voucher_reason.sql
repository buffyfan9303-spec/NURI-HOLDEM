-- ============================================================================
-- 전국 랭킹 = 대회 머니인 입상 경력(비금전) · 주간 리그 삭제 · 일반 이용권 발급 근거(사유) 정책
-- (오너 결정 2026-09-05 오후 — 법적위험완화 v3 후속)
--
-- ① global_ranking_totals(p_since) — 전국 보드는 '대회 머니인(입상) 경력'만 센다: 입상 횟수·우승·TOP3·최고 등수·
--    입상 매장 수·최근 입상일. 상금·금액 파생 컬럼(moneyin_points·prize_points)은 반환에서 제거한다.
--    p_since 로 기간(전체/올해/최근 90일)을 자른다. 구형 무인자 시그니처는 DROP(기본값 인자와 모호해지므로).
-- ② weekly_league(integer) DROP — 오너: "주간랭킹을 삭제". 클라이언트 호출은 이미 0.
-- ③ 이용권 발급 근거 정책 — store_vouchers.issue_reason(welcome·visit·event·service·other) + issue_voucher p_reason.
--    '순위·시상' 사유는 20260905g 가드가 계속 거절하고, 여기서는 **모든 일반 발급에 사유를 남긴다**(감사 추적).
--    'other' 는 비고 필수. 구형 클라이언트(p_reason 미전송)는 'service' 로 기록된다.
--    ⚠ 직원의 수동 우회(다른 사유로 시상)를 코드로 완전히 막을 수는 없다 — 사유 로그가 사후 감사의 근거다.
--
-- 소급: store_vouchers 기존 101행은 issue_reason NULL 유지(덮어쓰지 않음). 삭제되는 데이터 없음.
-- 롤백: 20260829f(global_ranking_totals 무인자·weekly_league) 본문 재실행, issue_voucher 는 20260905g 본문 재실행 +
--       8-인자 DROP, issue_reason 컬럼은 남겨도 무해.
-- ============================================================================

-- ── ① 전국 대회 머니인 입상 경력 ───────────────────────────────────────────────
drop function if exists public.global_ranking_totals();
drop function if exists public.global_ranking_totals(date);
create function public.global_ranking_totals(p_since date default null)
returns table(nickname text, moneyin_count bigint, wins bigint, top3 bigint,
              best_position integer, venues bigint, last_date date)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select r.nickname,
         count(*)::bigint                                          as moneyin_count,
         count(*) filter (where r.position = 1)::bigint             as wins,
         count(*) filter (where r.position <= 3)::bigint            as top3,
         min(r.position)::integer                                   as best_position,
         count(distinct r.venue_id)::bigint                         as venues,
         max(r.ranking_date)::date                                  as last_date
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
    and (p_since is null or r.ranking_date >= p_since)
  group by r.nickname
  order by moneyin_count desc, wins desc, top3 desc, best_position asc, last_date desc, r.nickname
$fn$;
revoke all on function public.global_ranking_totals(date) from public;
grant execute on function public.global_ranking_totals(date) to anon, authenticated, service_role;
comment on function public.global_ranking_totals(date) is
  '전국 대회 머니인 입상 경력(비금전) — 매장이 등록한 대회 순위(venue_rankings)만 집계. 상금·금액 미사용(2026-09-05).';

-- ── ② 주간 리그 삭제 ───────────────────────────────────────────────────────────
drop function if exists public.weekly_league(integer);

-- ── ③ 이용권 발급 근거(사유) ────────────────────────────────────────────────────
alter table public.store_vouchers add column if not exists issue_reason text;
alter table public.store_vouchers drop constraint if exists store_vouchers_issue_reason_chk;
alter table public.store_vouchers add constraint store_vouchers_issue_reason_chk
  check (issue_reason is null or issue_reason in ('welcome', 'visit', 'event', 'service', 'other'));
comment on column public.store_vouchers.issue_reason is
  '발급 근거 — welcome(첫 방문 환영) · visit(방문 감사) · event(이벤트·프로모션) · service(서비스 보상) · other(기타, 비고 필수). 순위·시상 사유는 서버가 거절(20260905g). 2026-09-05 이전 행은 NULL.';

-- 시그니처가 바뀌므로(p_reason 추가) 7-인자 정의를 지우고 8-인자로 재생성한다 — 기본값 인자와 모호해지지 않게.
drop function if exists public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone);
create function public.issue_voucher(
  p_venue_id uuid, p_title text, p_count integer default 1,
  p_holder_name text default null, p_holder_user_id uuid default null,
  p_note text default null, p_expires_at timestamp with time zone default null,
  p_reason text default 'service')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_count int; v_title text; v_holder text; v_quota int; v_vname text; v_reason text;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'; end if;
  -- 순위(대회 등수)를 근거로 한 이용권 발급은 지원하지 않는다(2026-09-05 법적위험완화 v3).
  if coalesce(p_title, '') ~* '(순위|시상|입상|우승|award|rank|prize)' or coalesce(p_note, '') ~* '(AWARD:|순위|시상|입상|우승|award|rank|prize)' then
    raise exception '순위·입상을 근거로 한 이용권 발급은 지원하지 않습니다 — 제목·비고에서 순위/시상 관련 문구를 빼고 일반 이용권으로만 발급할 수 있습니다';
  end if;
  -- 발급 근거(사유) — 모든 발급에 남긴다. 구형 클라이언트는 'service'.
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'service');
  if v_reason not in ('welcome', 'visit', 'event', 'service', 'other') then
    raise exception '발급 사유를 골라 주세요 — 첫 방문 환영·방문 감사·이벤트·서비스 보상·기타 중 하나';
  end if;
  if v_reason = 'other' and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception '기타 사유는 비고에 발급 이유를 적어 주세요';
  end if;
  if my_role() IS DISTINCT FROM 'admin' and not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 매장이용권을 발급할 수 있습니다';
  end if;
  if public.identity_gate_on() and p_holder_user_id is not null and not exists (
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
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note, expires_at, issue_reason)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), ''), p_expires_at, v_reason
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
revoke all on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone, text) from public, anon;
grant execute on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone, text) to authenticated, service_role;
