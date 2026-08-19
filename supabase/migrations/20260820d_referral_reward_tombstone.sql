-- 감사 #2(파밍): 탈퇴로 CI 를 푼 뒤 재가입·재인증을 반복해 추천/인증 보상(+500/+300)을 무한 수령하는 것을 차단.
-- 재가입 자체는 허용하되(마음 바뀐 정상 복귀 보호), 과거 탈퇴/제재 명의(텀스톤 일치)면 보상만 스킵한다.
create or replace function public._grant_referral_reward(p_referee uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $fn$
declare r public.referrals; v_ci text;
begin
  select * into r from public.referrals where referee_id = p_referee and rewarded_at is null;
  if not found then return; end if;
  select ci into v_ci from public.profiles where id = p_referee and verified_at is not null;
  if v_ci is null then return; end if;
  if exists (select 1 from public.withdrawn_identities where ci_hash = md5(v_ci)) then
    update public.referrals set rewarded_at = now() where referee_id = p_referee;
    return;
  end if;
  update public.profiles set activity_points = coalesce(activity_points,0) + 300 where id = r.referee_id;
  update public.profiles set activity_points = coalesce(activity_points,0) + 500 where id = r.referrer_id;
  update public.referrals set rewarded_at = now() where referee_id = p_referee;
  insert into public.notifications (user_id, type, title, message, link) values
    (r.referrer_id, 'system', '🎉 친구 초대 보상', '초대한 친구가 본인인증을 완료해 활동점수 +500점!', '/'),
    (r.referee_id,  'system', '🎉 추천 가입 보상', '추천 가입 + 본인인증 완료로 활동점수 +300점!', '/');
end $fn$;

create or replace function public.tombstone_banned_ci()
 returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if new.status = 'banned' and old.status is distinct from 'banned' and new.ci is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (md5(new.ci), 'banned')
    on conflict (ci_hash) do update set reason = 'banned', created_at = now();
  end if;
  return new;
end $fn$;
drop trigger if exists trg_tombstone_banned_ci on public.profiles;
create trigger trg_tombstone_banned_ci after update of status on public.profiles
  for each row execute function public.tombstone_banned_ci();
