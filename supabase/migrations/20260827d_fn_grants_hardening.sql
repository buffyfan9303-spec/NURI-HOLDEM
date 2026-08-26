-- 함수 EXECUTE 과잉 권한 회수(advisors) — 트리거 함수는 트리거 컨텍스트에서 grant 와
-- 무관하게 실행되므로 클라이언트 롤 실행권이 필요 없다. withdraw 는 로그인 사용자 전용.
revoke execute on function public.withdraw_my_account() from anon;
revoke execute on function public.tombstone_banned_ci() from public, anon, authenticated;
revoke execute on function public._referral_reward_on_verify() from public, anon, authenticated;
revoke execute on function public._grant_referral_reward(uuid) from public, anon, authenticated;
revoke execute on function public.guard_profile_privileged_cols() from public, anon, authenticated;
revoke execute on function public.guard_listing_seller() from public, anon, authenticated;
