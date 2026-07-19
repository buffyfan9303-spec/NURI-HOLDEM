-- ============================================================================
-- 🎁 오픈 이벤트(2026-07-20 ~ 2026-08-03) 운영 쿼리 모음
--   A. 포인트 이상 지급 감사(이벤트 기간 매일 실행 권장)
--   B. 이벤트 성과 리포트(8/4 이후 1회 실행)
-- 실행: Supabase SQL Editor (읽기 전용 SELECT만 포함)
-- ============================================================================

-- ── A1. 일별 이벤트 지급 합계(알림 = 지급 장부) ────────────────────────────
-- 출석2배 +6/건 · 첫예약 +50/건 · 웰컴 +100/건 기준으로 일별 총 지급점수 추정
select (created_at at time zone 'Asia/Seoul')::date as kst_date,
       count(*) filter (where title = '🎁 오픈 이벤트 — 출석 2배')        as checkin_x2,
       count(*) filter (where title = '🎁 오픈 이벤트 — 첫 예약 보너스')   as first_reserve,
       count(*) filter (where title = '🎁 웰컴 보너스')                    as welcome,
       count(*) filter (where title = '🎁 오픈 이벤트 — 출석 2배') * 6
     + count(*) filter (where title = '🎁 오픈 이벤트 — 첫 예약 보너스') * 50
     + count(*) filter (where title = '🎁 웰컴 보너스') * 100              as est_points_granted
from notifications
where title like '🎁%' and created_at >= '2026-07-19 15:00+00'
group by 1 order by 1;

-- ── A2. 이상 징후: 같은 유저 하루 출석2배 알림 2건 이상(중복 지급 의심) ─────
select user_id, (created_at at time zone 'Asia/Seoul')::date as kst_date, count(*) as cnt
from notifications
where title = '🎁 오픈 이벤트 — 출석 2배'
group by 1, 2 having count(*) > 1 order by 3 desc;
-- 참고: 서로 다른 매장 체크인은 매장별 1회씩 정상(+6/매장/일). 같은 날 3매장 초과면 어뷰징 의심.

-- ── A3. 이상 징후: 첫 예약 보너스 중복(계정당 1회여야 함 — 0행이 정상) ──────
select user_id, count(*) from notifications
where title = '🎁 오픈 이벤트 — 첫 예약 보너스'
group by 1 having count(*) > 1;

-- ── A4. 이상 징후: 웰컴 보너스 중복(0행이 정상) ────────────────────────────
select user_id, count(*) from notifications
where title = '🎁 웰컴 보너스'
group by 1 having count(*) > 1;

-- ── A5. 이벤트 기간 포인트 급증 상위 20명(어뷰징 육안 점검용) ───────────────
select p.nickname, p.activity_points,
       (select count(*) from checkins c where c.user_id = p.id and c.created_at >= '2026-07-19 15:00+00') as checkins_during_event,
       (select count(*) from notifications n where n.user_id = p.id and n.title like '🎁%') as event_grants
from profiles p
where p.status = 'active'
order by checkins_during_event desc, p.activity_points desc
limit 20;

-- ============================================================================
-- ── B. 이벤트 성과 리포트(8/4 이후 실행) ────────────────────────────────────
-- ============================================================================

-- B1. 신규 가입: 이벤트 2주 vs 직전 2주
select
  count(*) filter (where created_at >= '2026-07-19 15:00+00' and created_at < '2026-08-03 15:00+00') as signups_event,
  count(*) filter (where created_at >= '2026-07-05 15:00+00' and created_at < '2026-07-19 15:00+00') as signups_prev2w
from profiles;

-- B2. 체크인: 이벤트 2주 vs 직전 2주 (건수·순 사용자)
select
  count(*)        filter (where created_at >= '2026-07-19 15:00+00' and created_at < '2026-08-03 15:00+00') as checkins_event,
  count(distinct user_id) filter (where created_at >= '2026-07-19 15:00+00' and created_at < '2026-08-03 15:00+00') as uniq_event,
  count(*)        filter (where created_at >= '2026-07-05 15:00+00' and created_at < '2026-07-19 15:00+00') as checkins_prev2w,
  count(distinct user_id) filter (where created_at >= '2026-07-05 15:00+00' and created_at < '2026-07-19 15:00+00') as uniq_prev2w
from checkins;

-- B3. 예약: 이벤트 2주 vs 직전 2주 + 첫 예약 보너스 수령자 수
select
  (select count(*) from schedule_reservations where created_at >= '2026-07-19 15:00+00' and created_at < '2026-08-03 15:00+00') as reserves_event,
  (select count(*) from schedule_reservations where created_at >= '2026-07-05 15:00+00' and created_at < '2026-07-19 15:00+00') as reserves_prev2w,
  (select count(*) from notifications where title = '🎁 오픈 이벤트 — 첫 예약 보너스') as first_reserve_claimed;

-- B4. 총 지급 포인트 결산
select
  count(*) filter (where title = '🎁 오픈 이벤트 — 출석 2배') * 3   as extra_from_checkin,  -- 2배분(추가 +3만 이벤트 비용)
  count(*) filter (where title = '🎁 오픈 이벤트 — 첫 예약 보너스') * 50 as from_first_reserve,
  count(*) filter (where title = '🎁 웰컴 보너스') * 100             as from_welcome
from notifications where title like '🎁%';

-- B5. 이벤트 종료 확인 체크리스트(8/4)
--  [ ] cron.job 에 event-% 잡이 남아있지 않은지: select jobname from cron.job where jobname like 'event-%';
--  [ ] 공지 자동 내려감 확인: select title from marketplace_notices where title like '🎁%';  -- 0행이 정상
--  [ ] 8/4 이후 체크인 토스트가 +3으로 복귀했는지 앱에서 확인(클라·서버 모두 날짜 게이트 자동)
