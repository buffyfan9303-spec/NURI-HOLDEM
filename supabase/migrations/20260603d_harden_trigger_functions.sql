-- ============================================================================
-- 보안 하드닝: 트리거 전용 SECURITY DEFINER 함수의 RPC 직접 호출 차단
--  (트리거로서의 실행에는 영향 없음 — 테이블 소유자 권한으로 동작)
-- ============================================================================
revoke execute on function public.notify_on_comment()           from anon, authenticated, public;
revoke execute on function public.notify_on_schedule_approved() from anon, authenticated, public;
revoke execute on function public.notify_on_owner_approved()    from anon, authenticated, public;
revoke execute on function public.rl_posts()                    from anon, authenticated, public;
revoke execute on function public.rl_comments()                 from anon, authenticated, public;
revoke execute on function public.rl_live()                     from anon, authenticated, public;
revoke execute on function public.sync_venue_followers()        from anon, authenticated, public;
