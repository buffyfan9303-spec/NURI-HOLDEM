-- 20260924o — 서버가 만드는 알림 4종에 **앱이 이미 처리하는 목적지** link 를 싣는다 (CONNECTIVITY-ALL 3·4번).
--
-- ✅ 2026-09-24 운영 적용 완료(nuri-lead). 적용 후 md5 4/4 기대값 일치 · ACL 4/4 불변. (초안 store-team, begin…rollback 리허설 통과)
--
-- 무엇이 바뀌나 — 각 함수에서 **link 값(과 그 컬럼 목록)만** 바뀐다. 나머지 본문은 라이브 정의와 byte 동일.
--   (리허설에서 md5(replace(라이브 정의, 옛 조각, 새 조각)) = md5(적용 후 정의) 로 증명)
--   | 함수                        | 수신자            | 옛 link | 새 link                         |
--   | send_weekly_venue_reports   | 매장 업주         | (없음)  | '?tab=my-store'                 |
--   | notify_on_review            | 매장 업주         | (없음)  | '/community/' || new.venue_id   |
--   | expire_old_buyin_requests   | 바인 요청한 손님  | (없음)  | '/community/' || r.venue_id     |
--   | send_venue_announcement     | 매장 팔로워(손님) | '/'     | '/community/' || p_venue_id     |
--   소비처: 앱 안 = src/App.tsx handleNavigateNotification('/community/:id' → 매장 페이지) ·
--           NotificationPanel → App.openInternalLink('?tab=' TAB_IDS) / 푸시 = public/sw.js toAppLink
--           ('/community/:id' → '/?venue=:id', '?…' → '/?…'). 새 처리기 없이 둘 다 이미 연다.
--   ⚠ 추가 변경 1곳(link 외): send_weekly_venue_reports 의 type 'report' → 'system'.
--     notif_type enum 에 'report' 가 없다(qna,approval,comment,system,mention,reminder). 그래서 이 함수는
--     실적 있는 매장이 하나라도 있으면 통째로 실패한다 — cron.job_run_details 실측 08-31·09-07·09-21 failed
--     "invalid input value for enum notif_type: report", 주간 리포트 행은 **지금까지 0건**.
--     link 만 고치면 받는 사람이 여전히 0 이라 같이 고친다. 클라 NotificationType 에도 'report' 가 없어 'system' 이 맞다.
--   제외: notify_league_invite — 연합 리그 화면이 동결·제거돼(2026-08-26) '수락/거절' 할 곳이 없다. 오너 결정 대기.
--
-- 적용 전 라이브 md5(pg_get_functiondef) · ACL (2026-09-24 실측)
--   send_weekly_venue_reports()              c760cfad7f88856d92ba5c3d36a4cf15  {postgres, service_role}
--   notify_on_review()                       2d64a9d8d9a8d2da591c846486d2c3e5  {postgres, service_role}  (trg_notify_review on venue_reviews)
--   expire_old_buyin_requests()              af8654d9e92c69b2c40ffc520b70b71e  {postgres, service_role}
--   send_venue_announcement(uuid,text,text)  e5fe1447738f24331f1b109b20b32ccf  {postgres, authenticated, service_role}
-- 적용 후 기대 md5 (리허설 실측): weekly 0c309ea867e287bcf9cfb7092dacf70b · review c0f0a354831b8d0d78c4c516832a7775 ·
--   expire 1cadd695ab54b4a4442464c5df5846ca · announcement 0d9f869f3ee1de2a815860ba74418dd3 · ACL 4/4 불변.
--   CREATE OR REPLACE 는 ACL 을 보존한다(CLAUDE.md 보안 §3). 새로 만들어지는 경우를 위해 REVOKE/GRANT 를 같이 적는다.
--
-- 되돌리기: 이 파일의 네 link 조각을 옛 값으로 되돌린 create or replace 를 다시 적용한다
--   (weekly·review·expire 는 link 컬럼과 값을 빼고 weekly 는 type 'report' 로, announcement 는 '/' 로). 리허설에서 되돌린 뒤 md5 가
--   위 적용 전 값과 4/4 같아지는 것을 확인했다. 이미 발송된 notifications 행은 건드리지 않는다.

create or replace function public.send_weekly_venue_reports()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v record;
  v_start date; v_end date;
  v_entries int; v_sales bigint; v_new int; v_total_players int;
  v_worst_day text; v_worst_cnt int; v_best_cnt int; v_days int;
  v_advice text;
  v_side_entries int; v_side_sales bigint; v_side_line text;
begin
  v_start := (date_trunc('week', ((now() at time zone 'Asia/Seoul')::date - 7)::timestamp))::date;
  v_end := v_start + 6;
  for v in select id, name, owner_id from public.venues where owner_id is not null loop
    -- 매출 = 실수령(현금+카드+이체). 저장 스냅샷이 정본이고, 2026-08-18 전환 이전 저장액 0 인
    --   레거시 행만 세션 단가로 재계산한다. 티켓·지원·미수는 0.
    select count(*),
           coalesce(sum(
             case
               when b.payment_method in ('support','ticket') then 0
               when b.is_unpaid then 0
               when (coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)) = 0
                    and not b.is_split and b.buyin_at < timestamptz '2026-08-18'
                 then greatest(0,
                        s.buyin_amount
                        - case when b.discount_index >= 1
                               then least(coalesce((s.discounts -> (b.discount_index - 1) ->> 'amount')::int, 0), s.buyin_amount)
                               else 0 end)
               else coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
             end), 0)
      into v_entries, v_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end;
    if v_entries = 0 then continue; end if;

    select count(*),
           coalesce(sum(
             case
               when b.payment_method in ('support','ticket') then 0
               when b.is_unpaid then 0
               when (coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)) = 0
                    and not b.is_split and b.buyin_at < timestamptz '2026-08-18'
                 then greatest(0,
                        s.buyin_amount
                        - case when b.discount_index >= 1
                               then least(coalesce((s.discounts -> (b.discount_index - 1) ->> 'amount')::int, 0), s.buyin_amount)
                               else 0 end)
               else coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
             end), 0)
      into v_side_entries, v_side_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end and b.game_seq > 1;
    if v_side_entries > 0 then
      v_side_line := format(E'\n🎲 사이드 %s회 · 매출 %s만원', v_side_entries, (v_side_sales / 10000)::bigint);
    else
      v_side_line := '';
    end if;

    select count(distinct lp.name) into v_new
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end
       and not exists (
         select 1 from public.ledger_players p2
          where p2.venue_id = v.id and p2.name = lp.name and p2.session_date < v_start);
    select count(distinct lp.name) into v_total_players
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end;

    select day_label, cnt, max_cnt, n_days into v_worst_day, v_worst_cnt, v_best_cnt, v_days
      from (
        select g.day_label, g.cnt,
               max(g.cnt) over () as max_cnt,
               count(*) over () as n_days
          from (
            select case extract(dow from b.session_date)
                     when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
                     when 4 then '목' when 5 then '금' else '토' end as day_label,
                   count(*) as cnt
              from public.ledger_buyins b
             where b.venue_id = v.id and b.session_date between v_start and v_end
             group by extract(dow from b.session_date)
          ) g
        order by g.cnt asc limit 1
      ) t;

    if v_days >= 2 and v_worst_cnt * 2 < v_best_cnt then
      v_advice := format('%s요일이 약했어요(%s건) — %s요일 프리롤·이벤트로 끌어올려 보세요.', v_worst_day, v_worst_cnt, v_worst_day);
    elsif v_total_players > 0 and v_new * 100 >= v_total_players * 30 then
      v_advice := format('신규 손님이 %s명이나 왔어요 — 첫 방문 쿠폰으로 단골 전환을 노려보세요.', v_new);
    else
      v_advice := '이번 주도 꾸준했어요 — 단골 재방문 이벤트로 한 번 더 끌어올려 보세요.';
    end if;

    insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, link)
    values (v.owner_id, 'system',
      '📊 ' || v.name || ' 주간 리포트',
      -- 2026-09-11(d): v_entries 는 count(*) = 바이인 횟수다. 예전엔 '엔트리 N건' 이라 불러
      --   오너 규칙(엔트리 = 실제 지불 가치 ÷ 정상가, 5만 할인이면 0.5)과 이름이 어긋났다.
      --   금액 기준 엔트리를 여기서 새로 계산하지는 않는다 — 지금은 이름만 맞춘다.
      format('지난주(%s~%s) 바이인 %s회 · 매출 %s만원 · 신규 손님 %s명%s' || E'\n' || '💡 %s',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new, v_side_line, v_advice),
      '📊', '#FFD100', '?tab=my-store');
  end loop;
end;
$function$;
revoke all on function public.send_weekly_venue_reports() from public, anon, authenticated;
grant execute on function public.send_weekly_venue_reports() to service_role;

create or replace function public.notify_on_review()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_owner uuid; v_vname text;
begin
  select owner_id, name into v_owner, v_vname from public.venues where id = new.venue_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, read, link)
  values (v_owner, 'system',
    case when new.rating <= 2 then '🚨 낮은 평점 후기' else '⭐ 새 매장 후기' end,
    coalesce(v_vname,'내 매장') || ' · ' || new.rating || '점' || case when btrim(coalesce(new.content,'')) <> '' then ' — ' || left(new.content, 60) else '' end,
    '⭐', case when new.rating <= 2 then '#FF4D6D' else '#FCD535' end, false, '/community/' || new.venue_id);
  return new;
end $function$;
revoke all on function public.notify_on_review() from public, anon, authenticated;
grant execute on function public.notify_on_review() to service_role;

create or replace function public.expire_old_buyin_requests()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n integer; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  -- 어제 날짜라도 그 장부가 아직 열려 있으면(새벽 운영) 살아 있는 대기열이다.
  insert into notifications (user_id, type, title, message, read, link)
  select r.user_id, 'system', '⏳ 바인 요청 마감', '보내신 참가(바인) 요청이 자동 마감되었습니다. 필요하면 매장에서 다시 요청해 주세요.', false, '/community/' || r.venue_id
  from ledger_buyin_requests r
  where r.status = 'pending' and r.user_id is not null
    and (r.session_date < v_today - 1
      or (r.session_date < v_today and not exists (
        select 1 from ledger_sessions ls
        where ls.venue_id = r.venue_id and ls.session_date = r.session_date and ls.closed = false)));
  -- 만료 삭제와 이용권 복원을 **한 문장**으로 — 실제로 지워진 행의 이용권만 지갑으로 돌아간다(2026-09-11).
  with del as (
    delete from ledger_buyin_requests r
    where r.status = 'pending'
      and (r.session_date < v_today - 1
        or (r.session_date < v_today and not exists (
          select 1 from ledger_sessions ls
          where ls.venue_id = r.venue_id and ls.session_date = r.session_date and ls.closed = false)))
    returning r.voucher_id
  ), restored as (
    update public.store_vouchers v
       set status = 'active', used_venue_id = null, used_at = null
     where v.status = 'used'
       and v.id in (select d.voucher_id from del d where d.voucher_id is not null)
    returning v.id
  )
  select count(*) into n from del;
  return n;
end $function$;
revoke all on function public.expire_old_buyin_requests() from public, anon, authenticated;
grant execute on function public.expire_old_buyin_requests() to service_role;

create or replace function public.send_venue_announcement(p_venue_id uuid, p_title text, p_message text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_count int; v_today int;
begin
  -- 방어적 게이트: 무인증/권한없음/NULL 전부 차단(NULL → false 로 강제)
  if auth.uid() is null or not coalesce(public.can_manage_pos(p_venue_id), false) then
    raise exception '권한이 없습니다';
  end if;
  if coalesce(trim(p_title),'') = '' or coalesce(trim(p_message),'') = '' then raise exception '제목과 내용을 입력하세요'; end if;
  -- 같은 매장의 동시 발송을 직렬화 — 세고 넣는 사이에 다른 트랜잭션이 끼어 4번째가 통과하던 틈을 막는다.
  perform pg_advisory_xact_lock(hashtext('venue_announce:' || p_venue_id::text));
  v_today := public._venue_announce_sent_today(p_venue_id);
  if v_today >= 3 then raise exception '오늘은 3회까지 보낼 수 있어요 (자정에 초기화)'; end if;
  insert into public.notifications (user_id, type, title, message, link, read)
    select vf.user_id, 'system', left(trim(p_title), 60), left(trim(p_message), 200), '/community/' || p_venue_id, false
    from public.venue_follows vf where vf.venue_id = p_venue_id;
  get diagnostics v_count = row_count;
  insert into public.venue_announcements (venue_id, sent_by, title, message, recipients)
    values (p_venue_id, auth.uid(), left(trim(p_title),60), left(trim(p_message),200), v_count);
  return v_count;
end $function$;
revoke all on function public.send_venue_announcement(uuid, text, text) from public, anon;
grant execute on function public.send_venue_announcement(uuid, text, text) to authenticated, service_role;
