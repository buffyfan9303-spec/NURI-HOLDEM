-- 20260924c — 매장이용권 발급 유형별 통계(읽기 전용 RPC). 오너 요청 2026-09-24 V2.
--
-- ✅ 2026-09-24 라이브 적용 완료 (MCP execute_sql · 자가검사 통과) · md5 a98ad5f78ad9ca512fad52d11c5152ab · ACL {authenticated, service_role}
--   롤백 리허설: 업주(누리 테스트 홀덤펍) 1행·불변식(발급=보유+사용+만료+회수+기타) true · 다른 매장 업주 42501 ·
--   자기 매장(이용권 0) 0행 · 비로그인 42501 · 기간 역전 22023 · anon ACL false.
--   음성 대조: 게이트 줄을 뺀 사본에서는 다른 매장 업주가 통과 → 위 차단은 게이트가 만든 것.
--
-- 정의(유형 키마다): 발급 = 남아 있는 행(delete_voucher 로 지운 미사용분은 빠진다 — 화면에 고지) ·
--   보유 = active 이고 미만료 · 사용 = used · 만료 = active 인데 만료 · 회수 = revoked · 기타 상태 = 0 이어야 한다.
--   event + event_campaign_id → 'event_card'(이벤트 카드 당첨), NULL → 'unrecorded'(9/5 이전·적립).
-- 권한: can_view_vouchers(= can_manage_pos: 업주·승인 공동운영자·admin, 제재 차단 + voucher_access 직원).
--   숫자만 돌려준다(개인정보 0). 권한 없음은 0행이 아니라 42501 — 화면에 거짓 '0장' 이 뜨지 않게.
-- 기존 voucher_holder_stats 는 반환 타입을 바꾸면 DROP→ACL 초기화라 건드리지 않고 새 함수로 둔다.

create or replace function public.venue_voucher_reason_stats(
  p_venue_id uuid, p_from date default null, p_to date default null)
returns table(reason_key text, issued bigint, held bigint, used bigint,
              expired bigint, revoked bigint, other_status bigint, holders bigint)
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if p_venue_id is null or not coalesce(public.can_view_vouchers(p_venue_id), false) then
    raise exception '이 매장의 이용권 통계를 볼 권한이 없습니다' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception '기간 시작일이 종료일보다 늦습니다' using errcode = '22023';
  end if;
  return query
  select case when sv.issue_reason = 'event' and sv.event_campaign_id is not null then 'event_card'
              when sv.issue_reason is null then 'unrecorded'
              else sv.issue_reason end,
         count(*),
         count(*) filter (where sv.status = 'active' and (sv.expires_at is null or sv.expires_at > now())),
         count(*) filter (where sv.status = 'used'),
         count(*) filter (where sv.status = 'active' and sv.expires_at <= now()),
         count(*) filter (where sv.status = 'revoked'),
         count(*) filter (where sv.status not in ('active','used','revoked')),
         count(distinct sv.holder_user_id)
    from public.store_vouchers sv
   where sv.venue_id = p_venue_id
     and (p_from is null or sv.created_at >= (p_from::timestamp at time zone 'Asia/Seoul'))
     and (p_to   is null or sv.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Seoul'))
   group by 1 order by 1;
end $fn$;
revoke all on function public.venue_voucher_reason_stats(uuid, date, date) from public, anon;
grant execute on function public.venue_voucher_reason_stats(uuid, date, date) to authenticated, service_role;

do $chk$
declare f oid := 'public.venue_voucher_reason_stats(uuid,date,date)'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') then raise exception '[chk] anon 실행 가능'; end if;
  if not has_function_privilege('authenticated', f, 'EXECUTE') then raise exception '[chk] authenticated 불가'; end if;
  if not (select prosecdef from pg_proc where oid = f) then raise exception '[chk] SECURITY DEFINER 아님'; end if;
end $chk$;
notify pgrst, 'reload schema';
