-- ✅ 적용 완료 2026-09-28 (nuri-lead). pgTAP 권한 기준선 B 위반 1건: SECURITY DEFINER 인데 search_path 에 pg_temp 가 빠져 있었다.
-- 적용 후 public SECURITY DEFINER 353개 전부 search_path=public, pg_temp (get_push_shared_secret 은 "" 로 안전 예외).
alter function public._block_ended_reservation() set search_path = public, pg_temp;
