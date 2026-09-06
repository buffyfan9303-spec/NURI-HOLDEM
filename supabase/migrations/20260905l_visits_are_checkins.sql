-- ============================================================================
-- '방문' = QR 체크인(public.checkins) 으로 통일 (2026-09-05 모바일 점검 #8 · 오너 결정)
--
-- 무엇을 푸는가
--   '방문' 정의가 셋이었다 — 프로필 탭 = 지난 예약, 대시보드 헤더·매장 페이지·홈 '이어서 하기' =
--   예약 전체(미래 포함), 뱃지·출석왕 = QR 체크인. 예약 없이 QR 출석만 10회 한 회원은 매장 페이지
--   '내 활동'이 아예 안 뜨고, 예약만 하고 안 간 회원은 '방문 1회'로 보였다.
--   → 20260829g(ranking_top_venues)와 같은 정의로 못 박는다: 방문 = checkins, 단위 = 매장별 KST 날짜 distinct.
--   (같은 날 같은 매장 재스캔 = 1방문. 4시간 중복 방지 때문에 하루 2회 스캔이 가능하므로 count(*) 는 부풀려진다.)
--   20260829g 헤더의 "(개인 대시보드용 my_visited_venues 는 예약 기반이지만 본인만 보는 화면이라 그대로 둔다)" 는
--   이 마이그레이션으로 정정 — 실제로는 매장 페이지 Tier1 요약·Tier3 게이트·홈 '이어서 하기'가 이 값을 쓴다.
--
-- 정렬: visits desc, max(created_at) desc — App 홈 '이어서 하기'는 첫 행을 '최근 방문 매장'으로 쓰므로
--   동률에서 최근 방문이 앞에 와야 한다(결정적 정렬).
--
-- 호출자(전부 자동 교정): VenuePage '이 매장 방문 N회'·내 활동 게이트, App 홈 '이어서 하기', 내 정보 대시보드 방문 매장 목록.
-- 소급: 데이터 변경 0(읽기 함수 본문만). 라이브 실측(2026-09-05) checkins 7건 / 예약 2건, 예약만 있고 체크인 없는 쌍 0 → 손실 없음.
-- 롤백: 아래 함수를 20260720 baseline 의 schedule_reservations 집계 본문으로 CREATE OR REPLACE 후 같은 REVOKE/GRANT 재실행.
-- ============================================================================

-- 반환 타입 동일(venue_id uuid, venue_name text, visits bigint) → CREATE OR REPLACE 로 충분.
create or replace function public.my_visited_venues()
 returns table(venue_id uuid, venue_name text, visits bigint)
 language sql stable security definer
 set search_path = public, pg_temp
as $$
  select c.venue_id,
         v.name,
         count(distinct ((c.created_at at time zone 'Asia/Seoul')::date))::bigint
  from public.checkins c
  left join public.venues v on v.id = c.venue_id
  where c.user_id = auth.uid()
  group by c.venue_id, v.name
  order by 3 desc, max(c.created_at) desc;
$$;
-- CREATE OR REPLACE 는 ACL 을 초기화한다(보안 표준 §3) → 다시 건다. 비로그인은 auth.uid() 가 null 이라 0행이지만 원칙대로 anon 회수.
revoke all on function public.my_visited_venues() from public, anon;
grant execute on function public.my_visited_venues() to authenticated, service_role;
