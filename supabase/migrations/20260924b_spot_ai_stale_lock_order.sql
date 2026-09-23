-- 20260924b — _spot_ai_refund_stale 잠금 순서·건별 격리(critical-reviewer 재판정 잔여 위험, 2026-09-24).
--
-- ✅ **2026-09-24 라이브 적용 완료** (MCP execute_sql · begin…commit, 자가검사 통과) · md5 1aa6f8b6f34305978bcc74cde19a1e1a · ACL {postgres, service_role}
--   롤백 리허설: 10분 지난 대기 1건 + 방금 대기 1건 → 1회차 1건 환불(오래된 것만) · 2회차 0 · spent +60 → +30
--   크론 spot-ai-refund-stale 첫 틱 실행 기록 1회 succeeded(적용 시점 확인)
--
-- 문제: _spot_ai_begin 은 profiles → spot_ai_reviews 순으로 잠그는데, 크론은 spot_ai_reviews → profiles(_spot_ai_refund 안)
--       순이라 같은 사용자에 대해 둘이 겹치면 교착(deadlock)으로 한쪽이 중단될 수 있었다(수치는 안 틀어지지만 begin 이 500).
--       또 한 건이 예외를 내면 그 회차 전체가 롤백됐다.
-- 수정: 대상 행마다 먼저 그 사용자의 profiles 행을 잠그고(begin 과 같은 순서) 환불, 건별 예외는 삼키고 다음 행으로.

create or replace function public._spot_ai_refund_stale()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_n int := 0;
begin
  for r in select id, user_id from public.spot_ai_reviews
            where status = 'pending' and created_at < now() - interval '5 minutes'
            order by id loop
    begin
      perform 1 from public.profiles where id = r.user_id for update;   -- begin 과 같은 잠금 순서
      if public._spot_ai_refund(r.id) then v_n := v_n + 1; end if;
    exception when others then
      raise warning '[spot-ai-refund-stale] % 환불 실패: %', r.id, sqlerrm;   -- 다음 틱에 다시 시도된다
    end;
  end loop;
  return v_n;
end $$;
revoke all on function public._spot_ai_refund_stale() from public, anon, authenticated;
grant execute on function public._spot_ai_refund_stale() to service_role;

do $$
begin
  if pg_get_functiondef('public._spot_ai_refund_stale()'::regprocedure) not like '%for update%' then raise exception 'self-check: 잠금 순서'; end if;
  if has_function_privilege('authenticated', 'public._spot_ai_refund_stale()', 'execute') then raise exception 'self-check: ACL'; end if;
end $$;
