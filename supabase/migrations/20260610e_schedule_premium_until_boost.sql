-- 포스터 부스트: N일 동안 상단 고정(기간 만료형 프리미엄). is_premium(무기한)과 병행.
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS premium_until timestamptz;
