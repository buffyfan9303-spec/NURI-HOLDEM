select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- 20261006l — 광고성 정보 전송 제한(정보통신망법 제50조) 서버 정비 · home-team 2026-10-06
-- ⏳ 미적용(작성·라이브 롤백 리허설만). 적용은 리드가 한다 — 적용 후 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다.
--
-- 요구: 오너 2026-10-06 "보안, 개인정보법 위반 등 전체 연구해서 수정할 부분까지 수정" — 법령 축
--   원문: Documents/누리홀덤_영상분석_0930/security-1006/legal.md  P1-1 · P1-2 · P1-3 · P2-1
--   리드 결정: 앱 안 알림함 기록은 모두에게 유지(기능 보존) · **푸시·이메일 전송만** 마케팅 동의자로 한정 + '(광고)' +
--              21~08시 KST 전송 건너뜀 · 동의/철회 처리 결과는 알림함에 남긴다.
-- 기준: 라이브 정의(2026-10-06 ro.mjs 로 pg_get_functiondef 를 떠서 그 위에 고침) — 저장소의 옛 파일이 아니다.
--
-- ① notifications.is_ad — 광고성 알림 표지. 생산자 3곳(매장 공지·주간 팔로우 소식·팔로우 매장 새 포스터)만 true.
-- ② push_on_notification — 표지 행은 (마케팅 동의 ∧ 08~21시 KST) 일 때만 푸시, 제목 앞 '(광고)' + 본문에 전송자·수신거부 방법.
--    호출부 3곳마다 막지 않고 푸시 발송부 한 곳에서 거른다(새 광고 생산자도 is_ad 만 켜면 같은 규칙을 탄다).
-- ③ weekly_email_digest_rows — 주간 소식 이메일 수신자를 마케팅 동의자로 한정(P1-1). 표기·야간 가드는 엣지 함수.
-- ④ 마케팅 수신 동의·철회 처리 결과 통지(P1-3) — profiles.agreed_to_marketing 이 바뀌는 모든 경로
--    (가입 트리거·재동의 게이트·설정 토글·관리자)를 트리거 한 곳에서 알림함에 남긴다. 값이 그대로면 남기지 않는다.
-- ⑤ set_my_marketing_consent(p_on) — 설정 화면 토글(P2-1). 필수 동의·약관 판 번호를 건드리지 않는다
--    (record_my_legal_consent 는 필수 3종을 true 로 받아 판 번호를 올리므로 토글에 쓰면 안 된다).
--
-- 리허설: Documents/누리홀덤_영상분석_0930/security-1006/legal-fix/20261006l_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)
-- 적용 순서(리드 결정): 20261006s1 → 20261006s2 → 20261006l → 20261006m. 이 파일은 탈퇴 함수를 건드리지 않는다.

-- ① ───────────────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists is_ad boolean not null default false;
comment on column public.notifications.is_ad is
  '광고성 정보(정보통신망법 §50) 표지 — true 면 push_on_notification 이 마케팅 동의·야간(21~08시 KST)을 보고 푸시를 거른다. 알림함 기록은 그대로.';

-- 야간 판정 한 곳(§50③ — 오후 9시부터 다음 날 오전 8시까지). 리허설이 고정 시각으로 직접 시험한다.
create or replace function public._ad_quiet_hours(p_at timestamptz default now())
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select extract(hour from (p_at at time zone 'Asia/Seoul')) not between 8 and 20;
$$;
revoke all on function public._ad_quiet_hours(timestamptz) from public, anon, authenticated;
grant execute on function public._ad_quiet_hours(timestamptz) to service_role;

-- ② ───────────────────────────────────────────────────────────────────────
create or replace function public.push_on_notification()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rec jsonb := to_jsonb(new);
begin
  -- 20261006l: 광고성 알림은 마케팅 수신 동의자에게, 08~21시(KST)에만 푸시한다(정보통신망법 §50①③).
  --   알림함 기록(이 행)은 그대로 남는다 — 여기서 거르는 것은 '전송' 뿐이다. 야간분은 미루지 않고 건너뛴다.
  if new.is_ad then
    if not coalesce((select p.agreed_to_marketing from public.profiles p where p.id = new.user_id), false)
       or public._ad_quiet_hours(now()) then
      return new;
    end if;
    -- §50④ — 제목 시작 부분 '(광고)', 본문에 전송자 명칭·연락처와 수신 거부 방법.
    v_rec := v_rec || jsonb_build_object(
      'title',   '(광고) ' || new.title,
      'message', new.message || ' · 보낸 곳 엔에이치홀딩스(NURI HOLDEM) ace@nuriholdem.com · 수신거부: 내 정보 → 보안 → 마케팅 정보 수신');
  end if;
  perform net.http_post(
    url     := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c',
      'x-nuri-push-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_shared_secret'), '')
    ),
    body    := jsonb_build_object('type', 'INSERT', 'record', v_rec)
  );
  return new;
exception when others then
  return new; -- 푸시 호출 실패가 알림 생성 트랜잭션을 막지 않도록
end;
$function$;
revoke all on function public.push_on_notification() from public, anon, authenticated;
grant execute on function public.push_on_notification() to service_role;

-- 광고 생산자 3곳 — 수신자·문구는 그대로(알림함 기능 보존), is_ad 만 켠다.
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
  -- 20261006l: is_ad — 푸시는 마케팅 동의자·주간에만(push_on_notification). 알림함은 팔로워 전원 그대로.
  insert into public.notifications (user_id, type, title, message, link, read, is_ad)
    select vf.user_id, 'system', left(trim(p_title), 60), left(trim(p_message), 200), '/community/' || p_venue_id, false, true
    from public.venue_follows vf where vf.venue_id = p_venue_id;
  get diagnostics v_count = row_count;
  insert into public.venue_announcements (venue_id, sent_by, title, message, recipients)
    values (p_venue_id, auth.uid(), left(trim(p_title),60), left(trim(p_message),200), v_count);
  return v_count;
end $function$;
revoke all on function public.send_venue_announcement(uuid, text, text) from public, anon;
grant execute on function public.send_venue_announcement(uuid, text, text) to authenticated, service_role;

create or replace function public.send_weekly_follow_digest()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- 20261006l: is_ad — 푸시는 마케팅 동의자에게만(크론 금 10:00 KST 라 야간 아님). 알림함은 팔로워 전원 그대로.
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link, is_ad)
  select f.user_id, 'system',
         format('📅 이번 주 팔로우 매장 대회 %s개', f.n),
         format('%s%s — 오늘부터 7일 안에 %s개 대회가 열려요. 일정에서 확인하고 미리 예약하세요!',
                f.vname, case when f.vn > 1 then format(' 외 %s곳', f.vn - 1) else '' end, f.n),
         '📅', '#FFD100', '/', true
  from (
    select vf.user_id, count(*) as n, count(distinct s.venue_id) as vn, min(v.name) as vname
    from public.venue_follows vf
    join public.schedules s on s.venue_id = vf.venue_id
     and s.approved = true
     and s.date >= (now() at time zone 'Asia/Seoul')::date
     and s.date <  (now() at time zone 'Asia/Seoul')::date + 7
    join public.venues v on v.id = s.venue_id
    group by vf.user_id
  ) f
  join public.profiles p on p.id = f.user_id and coalesce(p.status::text, 'active') = 'active';
end $function$;
revoke all on function public.send_weekly_follow_digest() from public, anon, authenticated;
grant execute on function public.send_weekly_follow_digest() to service_role;

create or replace function public.notify_followers_on_poster()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.venue_id is not null
     and ((tg_op = 'INSERT' and new.approved) or (tg_op = 'UPDATE' and new.approved and coalesce(old.approved, false) = false)) then
    -- 20261006l: is_ad — 승인 시각이 야간이면 푸시는 건너뛴다(push_on_notification). 알림함은 팔로워 전원 그대로.
    insert into public.notifications (user_id, type, title, message, link, read, is_ad)
    select vf.user_id, 'system', '팔로우 매장 새 포스터',
      coalesce((select name from public.venues where id = new.venue_id), '매장') || ' — ' || new.title || ' (' || new.date || ')',
      '/schedules/' || new.id, false, true
    from public.venue_follows vf
    where vf.venue_id = new.venue_id
      and vf.user_id <> coalesce(new.owner_id, '00000000-0000-0000-0000-000000000000');
  end if;
  return new;
end $function$;
revoke all on function public.notify_followers_on_poster() from public, anon, authenticated;

-- ③ ───────────────────────────────────────────────────────────────────────
create or replace function public.weekly_email_digest_rows()
 returns table(email text, nickname text, vname text, vn integer, n integer)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p.email, p.nickname, f.vname, f.vn, f.n
  from (
    select vf.user_id, count(*)::int as n, count(distinct s.venue_id)::int as vn, min(v.name) as vname
    from public.venue_follows vf
    join public.schedules s on s.venue_id = vf.venue_id
     and s.approved = true
     and s.date >= (now() at time zone 'Asia/Seoul')::date
     and s.date <  (now() at time zone 'Asia/Seoul')::date + 7
    join public.venues v on v.id = s.venue_id
    group by vf.user_id
  ) f
  join public.profiles p on p.id = f.user_id
   and coalesce(p.status::text, 'active') = 'active'
   and p.agreed_to_marketing is true                      -- 20261006l: §50① 사전 동의자만
   and p.email is not null and btrim(p.email) <> '';
$function$;
revoke all on function public.weekly_email_digest_rows() from public, anon, authenticated;
grant execute on function public.weekly_email_digest_rows() to service_role;

-- ④ ───────────────────────────────────────────────────────────────────────
-- 시행령 §62의2: 의사 표시일부터 14일 안에 ① 전송자 명칭 ② 동의·철회 사실과 그 날짜 ③ 처리 결과를 알린다.
create or replace function public._notify_marketing_consent()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_on boolean := coalesce(new.agreed_to_marketing, false);
begin
  if tg_op = 'INSERT' then
    if not v_on then return new; end if;               -- 가입 때 고르지 않은 선택 항목은 '의사 표시'가 아니다
  elsif new.agreed_to_marketing is not distinct from old.agreed_to_marketing then
    return new;                                         -- 값이 그대로면 처리할 것이 없다
  end if;
  if coalesce(new.status::text, 'active') = 'withdrawn' then return new; end if;
  insert into public.notifications (user_id, type, title, message, link, read, is_ad)
  values (new.id, 'system',
    case when v_on then '마케팅 정보 수신 동의 처리 결과' else '마케팅 정보 수신 동의 철회 처리 결과' end,
    format('전송자: 엔에이치홀딩스(NURI HOLDEM) · %s에 마케팅 정보 수신 %s 의사를 표시하셨고 그대로 처리했습니다. 처리 결과: %s. 변경은 내 정보 → 보안 → 마케팅 정보 수신에서 할 수 있습니다.',
           to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'),
           case when v_on then '동의' else '동의 철회' end,
           case when v_on then '광고성 정보(푸시·이메일) 수신 동의됨' else '광고성 정보(푸시·이메일)를 더 보내지 않음' end),
    '/me/security', false, false);
  return new;
end $function$;
revoke all on function public._notify_marketing_consent() from public, anon, authenticated;

drop trigger if exists trg_notify_marketing_consent on public.profiles;
create trigger trg_notify_marketing_consent
  after insert or update of agreed_to_marketing on public.profiles
  for each row execute function public._notify_marketing_consent();

-- ⑤ ───────────────────────────────────────────────────────────────────────
create or replace function public.set_my_marketing_consent(p_on boolean)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_at timestamptz := now();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception '동의 여부를 지정해 주세요' using errcode = '22023';
  end if;
  update public.profiles set agreed_to_marketing = p_on where id = v_uid;   -- 처리 결과 통지는 ④ 트리거
  -- append-only 이력(정보통신망법 §50⑦ 동의 상태 확인 · 개보법 §35 열람). 필수 항목·판 번호는 현재 값 그대로 옮겨 적는다.
  insert into public.legal_consents (
    user_id, legal_version, agreed_to_terms, agreed_to_privacy,
    agreed_to_anti_gambling, agreed_to_marketing, source, agreed_at
  )
  select p.id, coalesce(p.consented_legal_version, public.current_legal_version()),
         coalesce(p.agreed_to_terms, false), coalesce(p.agreed_to_privacy, false),
         coalesce(p.agreed_to_anti_gambling, false), p_on, 'settings', v_at
    from public.profiles p where p.id = v_uid;
  return v_at;
end $function$;
revoke all on function public.set_my_marketing_consent(boolean) from public, anon;
grant execute on function public.set_my_marketing_consent(boolean) to authenticated, service_role;
