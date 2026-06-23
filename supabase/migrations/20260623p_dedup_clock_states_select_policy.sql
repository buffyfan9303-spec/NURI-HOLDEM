-- 2026-06-23 #11 clock_states 동일 public SELECT 정책 2개 중복 제거(둘 다 qual=true·public).
-- 하나만 남겨도 익명 TV 관전 동작 불변. 매 행 2회 평가(permissive OR) 제거.
drop policy if exists clock_states_read on public.clock_states;
