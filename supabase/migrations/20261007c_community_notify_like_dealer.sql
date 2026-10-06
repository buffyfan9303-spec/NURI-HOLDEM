select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용 — 초안(community-team, 2026-10-07). 라이브 롤백 리허설만 했다. 적용 판단·실행은 리드.
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다. 리허설: supabase/tests/20261007c_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)
-- 20261007c — 커뮤니티 알림 두 가지 (10회차 점검 audit10)
--   ② audit10-visual-dummy-1006.md#P3-2 · audit10-function-1006.md#F4-05 — 좋아요→취소→좋아요 하면 작성자에게 '좋아요' 알림이 2건 쌓인다.
--      오너 결정(2026-09-29 #11) '좋아요 두 번 = 취소' 는 그대로 둔다(toggle_post_like 는 안 건드린다). 알림만 같은 사람·같은 글 1건.
--   ④ audit10-function-1006.md#P3-3 — 딜러 구인 지원이 들어와도 글쓴이에게 알림이 없다(상세를 열어야 안다).
--      의도된 침묵이 아니다: 개인정보처리방침 제2조 '딜러 구인 지원서(이름, 연락처, 메시지): 지원한 구인 글의 작성자에게 전달됩니다'
--      (src/pages/legal/PrivacyPolicy.tsx:165) — 도착 안내는 그 전달의 일부다. 거래성 알림이라 is_ad = false(기본값).
--      알림에는 지원자 이름·연락처를 싣지 않는다(푸시 경유 — 내용은 글 상세의 '받은 지원서' 에서만 본다).
--      link '/dealer' → 앱이 커뮤니티 '딜러' 하위탭을 연다(App.tsx handleNavigateNotification, 같은 PR).
-- 기준: 라이브 정의(2026-10-07 ro.mjs 로 pg_get_functiondef — notify_on_post_like md5 33a97e5f…) 위에 고쳤다. 저장소의 옛 파일이 아니다.
--
-- 되돌리기(데이터 보존 — 알림 행은 남는다):
--   drop trigger if exists trg_notify_dealer_application on public.dealer_applications;
--   drop function if exists public.notify_on_dealer_application();
--   notify_on_post_like 는 20260817d ④ 본문(search_path 에 pg_temp 추가)으로 되돌린다.

-- 출발점 게이트 — 교체하는 함수가 작성 때 라이브와 같아야 한다. 그 사이 바뀌었으면 조용히 덮지 않고 멈춘다.
do $gate$
begin
  if (select md5(pg_get_functiondef('public.notify_on_post_like()'::regprocedure))) is distinct from '33a97e5f577ca4c4c1e3a8b4942c06ba' then
    raise exception '20261007c: notify_on_post_like 라이브 정의가 작성 때와 다르다 — 라이브 정의를 다시 떠서 합쳐라';
  end if;
  if to_regprocedure('public.notify_on_dealer_application()') is not null then
    raise exception '20261007c: notify_on_dealer_application 이 이미 있다 — 라이브 정의를 확인하라';
  end if;
end $gate$;

-- ② 좋아요 알림 — 같은 작성자에게 같은 글·같은 사람의 좋아요 알림이 이미 있으면 다시 넣지 않는다.
--   알림 표(notifications)에는 '누가' 칸이 없어 문구(닉네임 — 대소문자 무시 UNIQUE)로 같은 사람을 가른다.
--   ponytail: 닉네임을 바꾼 뒤 다시 누르거나, 작성자가 알림을 지운 뒤 다시 누르면 1건 더 생긴다 — 정확히 1건이 필요해지면
--   (post_id, liker) 기록 표를 두되 탈퇴 정리(withdraw purge)에 그 표를 함께 넣어야 한다.
--   조회는 idx_notif_user(user_id, created_at desc) 를 탄다(작성자 한 명의 알림만 훑는다).
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_author uuid; v_liker text; v_msg text; v_link text;
begin
  select user_id into v_author from public.community_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then return new; end if; -- 본인 좋아요 제외
  select coalesce(nullif(btrim(nickname), ''), name) into v_liker from public.profiles where id = new.user_id;
  v_msg  := coalesce(v_liker, '회원') || '님이 회원님의 글을 좋아합니다';
  v_link := '/posts/' || new.post_id;
  -- 20261007c: 좋아요→취소→좋아요 는 같은 사람의 같은 좋아요다 — 알림은 처음 한 번만.
  if exists (select 1 from public.notifications n
              where n.user_id = v_author and n.link = v_link
                and n.title = '❤️ 내 글에 좋아요가 달렸어요' and n.message = v_msg) then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link, read)
  values (v_author, 'system', '❤️ 내 글에 좋아요가 달렸어요', v_msg, '❤️', '#FF4D6D', v_link, false);
  return new;
end; $function$;
revoke all on function public.notify_on_post_like() from public, anon, authenticated;

-- ④ 딜러 구인 지원서 도착 알림 — 글쓴이에게. 같은 지원자가 같은 글에 여러 번 내도 알림은 첫 지원서 한 번(도배 방지).
--   지운 글(deleted)·본인 지원·작성자 없음은 건너뛴다.
create or replace function public.notify_on_dealer_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_author uuid;
begin
  select dp.author_id into v_author from public.dealer_posts dp where dp.id = new.post_id and not dp.deleted;
  if v_author is null or v_author is not distinct from new.applicant_id then return new; end if;
  if new.applicant_id is not null and exists (
       select 1 from public.dealer_applications a
        where a.post_id = new.post_id and a.applicant_id = new.applicant_id and a.id <> new.id) then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, message, avatar_text, link, read)
  values (v_author, 'system', '📋 구인글에 지원서가 도착했어요',
          '딜러 게시판 구인글에 새 지원서가 왔어요 — 글을 열어 받은 지원서를 확인하세요', '📋', '/dealer', false);
  return new;
end; $function$;
revoke all on function public.notify_on_dealer_application() from public, anon, authenticated;

drop trigger if exists trg_notify_dealer_application on public.dealer_applications;
create trigger trg_notify_dealer_application after insert on public.dealer_applications
  for each row execute function public.notify_on_dealer_application();

-- 자가검사 — 실행권이 남아 있지 않고 트리거가 붙었다.
do $check$
begin
  if has_function_privilege('anon', 'public.notify_on_dealer_application()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_on_dealer_application()', 'execute')
     or has_function_privilege('anon', 'public.notify_on_post_like()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_on_post_like()', 'execute') then
    raise exception '20261007c: 트리거 함수 실행권이 anon/authenticated 에 남아 있다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_notify_dealer_application'
                   and tgrelid = 'public.dealer_applications'::regclass and not tgisinternal) then
    raise exception '20261007c: trg_notify_dealer_application 트리거가 없다';
  end if;
end $check$;
