-- 관리자 알림 막다른 링크 교정 (⚠ 제안 상태 — 아직 라이브 미적용, 오너/메인 세션이 적용)
-- 오너 리포트 2026-08-27: '🏪 새 매장 입점 신청' 알림을 눌러도 아무 데도 이동하지 않는다.
-- 원인: 라이브 전용 트리거 함수 2개(_notify_admin_new_venue · _notify_admin_pending_poster —
-- 레포 마이그레이션에 없고 라이브 DB 에만 존재)가 link '/' 로 발송 → 클라이언트 라우터는
-- '/' 를 홈 탭으로 보낸다(관리자가 홈에 있으면 무동작으로 보인다).
-- 교정: 두 알림 모두 수신자가 role=admin 뿐이므로 '/admin'(관리자 설정 탭)으로.
-- 클라이언트는 이미 '/admin' 라우팅을 갖고 있다(App.tsx handleNavigateNotification).
-- CREATE OR REPLACE(동일 시그니처) = 기존 트리거 연결·ACL 보존. 멱등 재실행 안전.

-- ① 새 매장 입점 신청 → 관리자 설정 탭
create or replace function public._notify_admin_new_venue()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.notifications (user_id, type, title, message, link)
  select p.id, 'system', '🏪 새 매장 입점 신청',
         coalesce(new.name,'(이름 없음)') || ' · ' || coalesce(new.region,'-') || ' — 관리자 설정에서 승인해 주세요',
         '/admin'
  from public.profiles p where p.role = 'admin';
  return new;
end $function$;

-- ② 포스터 승인 대기 → 관리자 설정 탭
create or replace function public._notify_admin_pending_poster()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_venue text;
begin
  select name into v_venue from public.venues where id = new.venue_id;
  insert into public.notifications (user_id, type, title, message, link)
  select p.id, 'system', '📢 포스터 승인 대기',
         coalesce(new.title,'(제목 없음)') || ' · ' || coalesce(v_venue,'-') || ' — 승인하면 일정탐색에 노출됩니다',
         '/admin'
  from public.profiles p where p.role = 'admin';
  return new;
end $function$;

-- ③ 이미 쌓인 과거 행 백필 — 클라이언트 읽기 시점 보정(api/notifications.ts normalizeLink)이
--    이미 커버하지만, 데이터 자체를 바로잡아 다른 소비처(푸시 send-push 의 url = link)도 고친다.
update public.notifications
   set link = '/admin'
 where link = '/'
   and title in ('🏪 새 매장 입점 신청', '📢 포스터 승인 대기');
