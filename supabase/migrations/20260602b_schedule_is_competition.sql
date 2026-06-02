-- ============================================================================
-- Task 3: 포스터(요강)에 '대회/이벤트' 분류 플래그 추가
--  필터 [전체, MTT, GTD, 대회] 중 '대회'를 구분하기 위한 컬럼.
--  - is_competition = true  → '대회' 필터에 노출
--  기본값 false, NOT NULL → 기존/신규 레코드 안전. 멱등 재실행 가능.
-- ============================================================================
alter table public.schedules
  add column if not exists is_competition boolean not null default false;
