-- ============================================================================
-- 순위 → 이용권·소비 가능 포인트·금액 연결 제거 (법적위험완화 개발 지시서 v3, 2026-09-05)
--
-- 방향: 순위(매장·날짜·게임별 참가자 + 최종 등수)의 입력·저장·조회는 유지한다.
--       순위를 근거로 이용권·소비 가능 포인트·경제적 혜택이 생기는 연결과, 금액(상금)이 일반 성적에
--       섞이는 연결을 서버에서 끊는다. 과거 원본(상금·이용권·장부·활동점수 잔액·시즌 스냅샷)은 지우지 않는다.
--
-- 운영 DB 실측(2026-09-05, pg_get_functiondef 대조): 아래 함수 본문은 저장소 정본과 동일했다.
--   save_venue_rankings 3·4인자(20260623c) · issue_voucher(20260828e + 20260829f identity_gate_on 조각)
--   · _end_season_internal(20260817d) · claim_mission(20260830b) · current_season_standings(20260623c)
-- 소급 영향: venue_rankings 2행(상금 숫자 2건) · ranking_point_awards 2행 12점 · 종료된 시즌 0건 · 'moneyin' 미션 청구 1건.
--
-- 바뀌는 것(전부 '앞으로의 저장'에만 적용):
--   ① save_venue_rankings — 활동점수 가감·ranking_point_awards 기록 중단. 입력값의 prize 는 무시하고
--      같은 (매장·날짜·게임·닉네임) 행에 남아 있던 과거 prize 만 승계(전체 교체 저장이 과거 원본을 공란으로 덮지 않게).
--      3-인자 오버로드(이벤트 차원 무시·그 날짜 전체 삭제)는 DROP — 새 UI 를 거치지 않은 구형 호출도 신규 정책을 탄다.
--   ② _end_season_internal — 시즌 종료 상위 3명 활동점수(+1000/500/300) 지급 중단. 스냅샷·알림·상태 변경은 유지.
--   ③ claim_mission — 순위 등재 횟수를 근거로 하는 'moneyin' 유형(고정 moneyin1 포함) 보상 거절. 기존 moneyin 미션은 비활성.
--   ④ current_season_standings — 동점결정에서 prize_man(상금 합) 제거. 반환 컬럼·스냅샷 INSERT 는 그대로(원본 보존).
--   ⑤ issue_voucher — 제목·비고에 순위 시상 사유(순위·시상·입상·우승·AWARD:·award·rank·prize)가 있으면 거절.
--      일반 이용권 발급은 그대로다. ⚠ 문자열 가드는 심층 방어일 뿐, 직원의 수동 우회 발급까지 막지는 못한다(지시서 §05).
--
-- 남는 것: placement_points(등수 점수, 비금전)·parse_prize_man·moneyin_points·prize_moneyin_points 함수와
--   global_ranking_totals·weekly_league·weekly_moneyin_kings·get_domestic_rankings 는 그대로 둔다(클라이언트가 호출을 중단하고
--   '미산정'으로 표시한다 — 새 전국 공식을 발명하지 않는다). ranking_point_awards 표·과거 행도 그대로.
--
-- 롤백: 20260623c(save_venue_rankings 3·4인자) · 20260817d(_end_season_internal) · 20260830b(claim_mission)
--       · 20260623c(current_season_standings) · 20260828e + 20260829f(issue_voucher) 본문 재실행 + ACL 재기재.
-- ============================================================================

-- ── ① 순위 저장 — 참가자·등수만. 활동점수·상금 입력 없음, 과거 상금은 승계 ───────────────
drop function if exists public.save_venue_rankings(uuid, date, jsonb);

create or replace function public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb, p_event text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  e jsonb; i int := 0;
  v_ev text := left(coalesce(trim(p_event), ''), 40);
  v_nick text;
  v_prev jsonb;   -- lower(닉네임) → 기존 prize (같은 매장·날짜·게임)
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;

  -- 과거 상금 원본 승계: 삭제 전에 같은 칸의 (닉네임 → prize) 를 붙잡아 둔다.
  -- 입력값의 prize 는 어떤 값이 와도 쓰지 않는다 — 2026-09-05 부터 순위에 신규 상금을 입력하지 않는다.
  select coalesce(jsonb_object_agg(lower(trim(nickname)), prize), '{}'::jsonb) into v_prev
    from public.venue_rankings
   where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev and prize is not null;

  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;

  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_nick := left(trim(coalesce(e->>'nickname', '')), 30);
    if v_nick = '' then continue; end if;
    i := i + 1;
    insert into public.venue_rankings (venue_id, ranking_date, event_name, position, nickname, real_name, prize, created_by)
    values (p_venue_id, p_date, v_ev, i,
            v_nick,
            nullif(left(trim(coalesce(e->>'realName', '')), 20), ''),
            v_prev->>lower(v_nick),
            auth.uid());
  end loop;
  -- ranking_point_awards / profiles.activity_points 는 더 이상 건드리지 않는다(과거 행·잔액은 그대로).
end;
$function$;
revoke all on function public.save_venue_rankings(uuid, date, jsonb, text) from public, anon;
grant execute on function public.save_venue_rankings(uuid, date, jsonb, text) to authenticated, service_role;

-- ── ② 시즌 종료 — 스냅샷·알림·상태 변경만. 활동점수 보상 없음 ─────────────────────────
create or replace function public._end_season_internal(p_season_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_venue uuid; r record; n int := 0;
begin
  select venue_id into v_venue from public.venue_seasons where id=p_season_id and status='active';
  if v_venue is null then return 0; end if;
  insert into public.venue_season_results (season_id, rank, nickname, real_name, points, prize_man, appearances, best_position)
    select p_season_id, rank, nickname, real_name, points, prize_man, appearances, best_position
    from public.current_season_standings(v_venue);
  get diagnostics n = row_count;
  -- 상위 3명 알림은 남긴다(성적 알림). 활동점수 +1000/500/300 은 2026-09-05 부터 지급하지 않는다(순위 → 소비 가능 포인트 연결 제거).
  for r in select rank, nickname from public.venue_season_results where season_id=p_season_id and rank<=3 loop
    insert into public.notifications (user_id, type, title, message, link)
      select id, 'system', '🏆 시즌 결과', '시즌 '||r.rank||'위 달성! 기록은 명예의 전당에 남습니다', '/community/'||v_venue
      from public.profiles where lower(nickname)=lower(r.nickname);
  end loop;
  update public.venue_seasons set status='ended', ended_at=now() where id=p_season_id;
  return n;
end $function$;
revoke all on function public._end_season_internal(uuid) from public, anon, authenticated;
grant execute on function public._end_season_internal(uuid) to service_role;

-- ── ③ 미션 — 순위 등재를 근거로 하는 'moneyin' 유형 보상 종료 ─────────────────────────
create or replace function public.claim_mission(p_key text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_week date; v_ok boolean := false; v_reward int := 0;
  v_cm record; v_goal int; v_type text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  v_week := (date_trunc('week', (now() at time zone 'Asia/Seoul')::timestamp))::date;
  if exists (select 1 from mission_claims where user_id = auth.uid() and mission_key = p_key and week_start = v_week) then
    raise exception '이미 받은 보상입니다';
  end if;

  if p_key like 'c%' and p_key ~ '^c[0-9]+$' then
    select * into v_cm from custom_missions where id = substring(p_key from 2)::int and active = true;
    if v_cm is null then raise exception '종료된 미션입니다'; end if;
    -- 매장주가 정한 값이라 그대로 믿지 않는다(상한 200)
    v_reward := least(200, greatest(0, coalesce(v_cm.reward, 0)));
    v_goal := v_cm.goal; v_type := v_cm.goal_type;
  elsif p_key = 'checkin2' then v_reward := 20; v_goal := 2; v_type := 'checkin';
  elsif p_key = 'post1' then v_reward := 10; v_goal := 1; v_type := 'post';
  elsif p_key = 'moneyin1' then raise exception '종료된 미션 유형입니다 — 대회 순위를 근거로 한 보상은 지급하지 않습니다';
  else raise exception '알 수 없는 미션입니다';
  end if;

  if v_type = 'checkin' then
    select count(*) >= v_goal into v_ok from checkins
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  elsif v_type = 'post' then
    select count(*) >= v_goal into v_ok from community_posts
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  else
    -- 'moneyin'(대회 순위 등재 횟수) — 순위를 근거로 한 포인트 지급은 2026-09-05 종료(법적위험완화 v3)
    raise exception '종료된 미션 유형입니다 — 대회 순위를 근거로 한 보상은 지급하지 않습니다';
  end if;
  if not v_ok then raise exception '아직 미션을 달성하지 못했습니다'; end if;
  insert into mission_claims(user_id, mission_key, week_start) values (auth.uid(), p_key, v_week);
  update profiles set activity_points = coalesce(activity_points, 0) + v_reward where id = auth.uid();
  return format('+%s점 지급 완료!', v_reward);
end $function$;
revoke all on function public.claim_mission(text) from public, anon;
grant execute on function public.claim_mission(text) to authenticated, service_role;

-- 기존 moneyin 미션 정의는 삭제하지 않고 비활성만(과거 청구 기록 보존).
update public.custom_missions set active = false where goal_type = 'moneyin' and active = true;

-- ── ④ 시즌 순위 — 동점결정에서 상금 합(prize_man) 제거(비금전 규칙 best_position·appearances 만) ──
create or replace function public.current_season_standings(p_venue_id uuid)
returns table(rank integer, nickname text, real_name text, points integer, prize_man integer, appearances integer, best_position integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with s as (select starts_on, ends_on from public.venue_seasons where venue_id=p_venue_id and status='active' limit 1),
  agg as (
    select vr.nickname,
      max(vr.real_name) as real_name,
      sum(public.placement_points(p_venue_id, vr.position))::int as points,
      sum(public.parse_prize_man(vr.prize))::int as prize_man,   -- 과거 원본 합계(표시·정렬에 쓰지 않음, 스냅샷 보존용)
      count(*)::int as appearances,
      min(vr.position)::int as best_position
    from public.venue_rankings vr, s
    where vr.venue_id=p_venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on and coalesce(trim(vr.nickname),'')<>''
    group by vr.nickname
  )
  select (row_number() over (order by points desc, best_position asc, appearances desc, nickname))::int as rank,
    nickname, real_name, points, prize_man, appearances, best_position
  from agg order by rank;
$function$;

-- ── ⑤ 이용권 발급 — 순위 시상 사유 거절(일반 발급은 그대로) ──────────────────────────────
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
  -- 순위(대회 등수)를 근거로 한 이용권 발급은 지원하지 않는다(2026-09-05 법적위험완화 v3).
  -- 순위 화면의 시상 경로(title '순위 시상' · note 'AWARD:…')는 클라이언트에서 제거됐고, 여기서 한 번 더 막는다.
  if coalesce(p_title, '') ~* '(순위|시상|입상|우승|award|rank|prize)' or coalesce(p_note, '') ~* '(AWARD:|순위|시상|입상|우승|award|rank|prize)' then
    raise exception '순위·입상을 근거로 한 이용권 발급은 지원하지 않습니다 — 제목·비고에서 순위/시상 관련 문구를 빼고 일반 이용권으로만 발급할 수 있습니다';
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
revoke all on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone) from public, anon;
grant execute on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone) to authenticated, service_role;
