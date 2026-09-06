-- ============================================================================
-- 기간제 정지가 기한이 지나도 풀리지 않던 것 — 만료분을 되돌리는 크론 (2026-09-07 전체 디버깅)
--
-- 무엇이 잘못됐나
--   관리자 화면은 "정지 해제: 2026-09-14" 라고 날짜를 약속하고(UserManagementTab.tsx:282),
--   제재 메일도 "기간 만료 후 자동으로 해제됩니다" 라고 말한다(notify-sanction/index.ts:82).
--   그런데 되돌리는 주체가 **어디에도 없다**:
--     · 클라이언트 게이트(AuthContext.tsx:53)는 status 만 보고 suspended_until 을 안 본다 → 만료 후에도 즉시 로그아웃.
--     · 서버 게이트 public.is_account_active() = `status = 'active' and (suspended_until is null or suspended_until < now())`
--       는 status 가 'suspended' 인 한 첫 항에서 걸려 만료절이 참이 될 수 없다 → 글·후기·매물 작성도 계속 차단.
--     · 운영 cron.job 10건 어디에도 status 를 되돌리는 잡이 없다(실측).
--   결과: 7일 정지가 **영구 차단**이 되고, 관리자가 수동으로 '제재 해제'를 눌러야만 풀린다.
--
-- 왜 크론인가 (클라이언트·서버 함수를 고치지 않는 이유)
--   클라이언트만 고치면 로그인은 되는데 작성이 서버에 막혀 "제재 중인 계정" 오류를 계속 맞는다 —
--   깨끗한 차단보다 나쁘다. 서버 함수만 고치면 status 가 영원히 'suspended' 로 남아
--   관리자 목록·카운트(UserManagementTab · community.ts 의 제재 회원 수)가 이미 풀린 사람을 계속 제재로 센다.
--   status 를 실제로 되돌리면 **클라이언트·서버 게이트·관리자 목록·약속 문구가 한꺼번에 맞는다.**
--   그래서 앱 코드 변경 0줄이다.
--
-- 안전 범위
--   · status = 'suspended' 이고 suspended_until 이 **과거**인 행만 건드린다.
--     무기한 정지(suspended_until is null)·영구 차단(banned)·탈퇴(withdrawn)는 조건에서 빠진다.
--   · suspended_until 은 null 로 정리한다(다음 정지가 깨끗한 상태에서 시작하도록).
--   · 되돌린 사실을 activity_log 에 남겨 '왜 풀렸는지'가 추적된다(관리자 수동 해제와 구분되는 actor).
--   · 15분마다 — 정지 단위가 일(日)이라 이 지연은 체감되지 않고, 잡 부하도 무시할 수준이다.
--
-- 멱등: 함수는 CREATE OR REPLACE, 잡은 기존 동명 잡을 지우고 다시 건다.
-- ============================================================================

create or replace function public.cron_unsuspend_expired()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  with done as (
    update public.profiles
       set status = 'active', suspended_until = null
     where status = 'suspended'
       and suspended_until is not null
       and suspended_until < now()
    returning id
  )
  select count(*) into v_n from done;

  if v_n > 0 then
    -- 컬럼명 주의: 본문 칸은 detail 이 아니라 target_summary 다(실측 확인).
    insert into public.activity_log (actor_id, actor_name, action, target_type, target_summary)
    values (null, '시스템(크론)', 'unsuspend_expired', 'profile',
            format('정지 기간 만료로 %s명 자동 해제', v_n));
  end if;
  return v_n;
end $$;

-- 내부(크론) 전용 — 직접 호출 차단. PUBLIC 기본 GRANT 까지 회수해야 실제로 막힌다(nuri-migration §1).
revoke all on function public.cron_unsuspend_expired() from public, anon, authenticated;
grant execute on function public.cron_unsuspend_expired() to service_role;

comment on function public.cron_unsuspend_expired() is
  '기간 만료된 정지(status=suspended · suspended_until < now())를 active 로 되돌린다. 무기한 정지·banned·withdrawn 은 제외. (20260907c)';

select cron.unschedule('unsuspend-expired') where exists (select 1 from cron.job where jobname = 'unsuspend-expired');
select cron.schedule('unsuspend-expired', '*/15 * * * *', $$select public.cron_unsuspend_expired()$$);

notify pgrst, 'reload schema';

-- ROLLBACK
--   select cron.unschedule('unsuspend-expired');
--   drop function if exists public.cron_unsuspend_expired();
