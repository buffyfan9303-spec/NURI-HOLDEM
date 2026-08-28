-- 20260829a 자체 회귀 폐쇄 — **내가 만든 구멍이다. 같은 세션의 제거 단계 재검증에서 잡혔다.**
--
-- 20260829a 는 소유 판정을 이름에서 user_id 로 옮기면서 1순위 분기를
--   `p_user_id = auth.uid()` 한 줄로만 뒀다. 이름 경로에는 있던
--   `p.venue_id = p_venue_id or can_manage_pos(...)`(= 지금 그 매장 사람인가) 조건이 빠진 것이다.
-- 결과: **구성원에서 제거된 계정이 자기 과거 시프트를 계속 읽고, 출퇴근 시각을 계속 고칠 수 있다.**
--   재현(롤백 트랜잭션, 20260829a 적용 상태):
--     초대→수락→오늘 배정(user_id 기록)→manage_staff('remove')
--     → 그 계정 토큰으로 SELECT staff_schedule = 1행
--     → set_my_shift_time(check_in,'23:59') 성공, DB 값이 실제로 23:59 로 바뀜
--   변경 전(이름 매칭 시절)에는 제거 즉시 0행이었다(profiles.venue_id 가 NULL 이 되므로).
--   즉 퇴사자가 정산 근거인 근무시간을 사후에 조작할 수 있게 된 것 — 회귀이자 정산 무결성 문제다.
--
-- 1순위 분기에도 '지금 그 매장 사람인가' 를 붙여 원래 경계를 복원한다.
-- (user_id 는 '이 행이 누구 것인가' 만 답한다. '지금 접근해도 되는가' 는 별개의 질문이고,
--  두 질문을 한 줄로 합친 것이 이 회귀의 원인이었다.)
create or replace function public.is_my_shift_row(p_venue_id uuid, p_staff_name text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- 공통 전제: 지금 그 매장의 사람이어야 한다(구성원이거나 POS 관리 권한자).
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (p.venue_id = p_venue_id or public.can_manage_pos(p_venue_id))
    )
    and case
      -- 1순위: 행에 주인이 적혀 있으면 그것이 정본이다(이름 매칭 완전 배제).
      when p_user_id is not null then p_user_id = auth.uid()
      when btrim(coalesce(p_staff_name, '')) = '' then false
      -- 2순위: 이름 매칭. 단 같은 이름의 구성원이 2명 이상이면 아무도 통과시키지 않는다.
      else exists (
             select 1 from public.profiles p
              where p.id = auth.uid()
                and (lower(btrim(p_staff_name)) = lower(btrim(p.name))
                  or lower(btrim(p_staff_name)) = lower(btrim(p.nickname)))
           )
           and (select count(*) from public.profiles q
                 where q.venue_id = p_venue_id
                   and (lower(btrim(p_staff_name)) = lower(btrim(q.name))
                     or lower(btrim(p_staff_name)) = lower(btrim(q.nickname)))) <= 1
    end;
$$;
revoke all on function public.is_my_shift_row(uuid, text, uuid) from public, anon;
grant execute on function public.is_my_shift_row(uuid, text, uuid) to authenticated;
