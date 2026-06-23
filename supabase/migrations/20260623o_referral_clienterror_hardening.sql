-- 2026-06-23 보안 sealing #2·#5
-- #2 추천보상 게이트 강화: ci 존재 → verified_at(verify-identity service_role 만 세팅) 기준.
--   자가 ci 위조 경로(20260623n 가드로 이미 차단)에 대한 2차 방어. referrals 0건이라 무위험.
create or replace function public._grant_referral_reward(p_referee uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r public.referrals;
begin
  select * into r from public.referrals where referee_id = p_referee and rewarded_at is null;
  if not found then return; end if;
  if not exists (select 1 from public.profiles where id = p_referee and verified_at is not null) then return; end if;
  update public.profiles set activity_points = coalesce(activity_points,0) + 300 where id = r.referee_id;
  update public.profiles set activity_points = coalesce(activity_points,0) + 500 where id = r.referrer_id;
  update public.referrals set rewarded_at = now() where referee_id = p_referee;
  insert into public.notifications (user_id, type, title, message, link) values
    (r.referrer_id, 'system', '🎉 친구 초대 보상', '초대한 친구가 본인인증을 완료해 활동점수 +500점!', '/'),
    (r.referee_id,  'system', '🎉 추천 가입 보상', '추천 가입 + 본인인증 완료로 활동점수 +300점!', '/');
end $function$;

-- #5 client_errors 무제한 INSERT 방어: payload 길이 캡 + 인증사용자 분당 15건(definer 카운터로 RLS 우회 평가) + 30일 보존 cron.
create or replace function public.client_error_rate_ok()
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select auth.uid() is null
      or (select count(*) from public.client_errors c where c.user_id = (select auth.uid()) and c.created_at > now() - interval '1 minute') < 15;
$$;
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to anon, authenticated
  with check (
    char_length(coalesce(message,'')) <= 2000
    and char_length(coalesce(stack,'')) <= 6000
    and public.client_error_rate_ok()
  );
create index if not exists client_errors_created_idx on public.client_errors(created_at);
create or replace function public.purge_old_client_errors()
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.client_errors where created_at < now() - interval '30 days';
$$;
select cron.schedule('purge-client-errors', '30 3 * * *', 'select public.purge_old_client_errors()');

-- #13 (참고) verify-identity 엣지함수 age fail-closed 는 supabase/functions/verify-identity/index.ts v3 로 배포됨(코드 형상관리).
