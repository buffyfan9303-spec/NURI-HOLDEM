-- 20260925b — 누리 스팟을 '원하는 날짜'에 저장(캘린더 칸). 오너 2026-09-25 결정: "날짜 직접 지정 추가".
-- ✅ 운영 적용 완료(nuri-lead). 추가 전용(nullable) — 기존 행·기존 클라이언트는 영향 없음(null = created_at 의 KST 날짜로 표시).
-- 권한: 표 단위 GRANT 라 새 컬럼도 authenticated 가 읽고 쓴다. RLS spot_reviews_own(user_id = auth.uid()) 그대로.
-- 같이 정리: anon 의 INSERT/UPDATE/DELETE 표 권한 회수(RLS 가 막던 것 — 보안 표준 3).
-- 되돌리기: alter table public.spot_reviews drop column played_on;  (값이 있으면 먼저 확인)
alter table public.spot_reviews add column if not exists played_on date;
alter table public.spot_reviews drop constraint if exists spot_reviews_played_on_sane;
alter table public.spot_reviews add constraint spot_reviews_played_on_sane check (played_on is null or played_on between date '2000-01-01' and date '2100-12-31');
comment on column public.spot_reviews.played_on is '사용자가 고른 이 스팟의 날짜(캘린더 칸). null 이면 created_at 의 KST 날짜로 표시. 2026-09-25 오너 지시.';
revoke insert, update, delete on public.spot_reviews from anon;
notify pgrst, 'reload schema';
