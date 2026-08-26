-- ============================================================================
-- W2 법적 하드가드 (§12-A 오너 결정 · §18.4) — 전부 비파괴(가드 추가·실행권 회수, DROP 0)
-- 백업: backup_20260826 스키마 전 테이블 스냅샷(263행, 행수 대조 0 불일치) + 하단 ROLLBACK 블록
--
-- VCH-1 ①(양도 제한) 실사 결과: 유저↔유저 이용권 양도 RPC 는 존재하지 않는다 —
--   find_user_for_transfer 는 '발행(매장→유저) 수신자 검색'이며 발행매장 귀속·본인인증
--   게이트(issue_voucher)·발행매장 전용 사용(20260816a)이 이미 강제된다. 변경 불필요(기록만).
-- ============================================================================

-- ② VCH-1: 유상 발급쿼터 경로 폐쇄 — 이용권이 '상금 재원' 성격을 갖지 않게(§12-A-2).
--    업주 충전 요청(request) + 운영자 승인(approve) 파이프를 서버에서 봉쇄.
--    admin_grant_voucher_quota(운영자 수동 레버)는 존치 — 금전 수수와 무관한 운영 도구이며
--    전면 제거 시 쿼터 소진 매장의 발급이 영구 불능이 된다(deviation, admin 전용 가드 기존 유지).
create or replace function public.request_voucher_credit(p_venue_id uuid, p_amount integer, p_note text DEFAULT NULL::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  raise exception '이용권 유상 충전은 종료되었습니다 — 발급 한도는 운영자에게 문의해 주세요';
end $$;

create or replace function public.admin_decide_voucher_credit(p_request_id uuid, p_approve boolean, p_admin_note text DEFAULT NULL::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if my_role() IS DISTINCT FROM 'admin' then raise exception '운영자만 가능합니다'; end if;
  if p_approve then raise exception '유상 충전 승인 경로는 폐쇄되었습니다(§12-A) — 반려만 가능합니다'; end if;
  select * into r from public.voucher_credit_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception '대기 중인 요청이 아닙니다'; end if;
  update public.voucher_credit_requests
    set status = 'rejected',
        admin_note = nullif(btrim(coalesce(p_admin_note,'')), ''), decided_at = now()
    where id = p_request_id;
end $$;

-- ③ issue_voucher — 소진 안내가 폐쇄된 '충전 요청' 경로를 가리키던 카피만 정정(로직 동일)
create or replace function public.issue_voucher(p_venue_id uuid, p_title text, p_count integer DEFAULT 1, p_holder_name text DEFAULT NULL::text, p_holder_user_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int; v_title text; v_holder text; v_quota int; v_vname text;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'; end if;
  if my_role() IS DISTINCT FROM 'admin' and not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 매장이용권을 발급할 수 있습니다';
  end if;
  if p_holder_user_id is not null and not exists (
    select 1 from public.profiles where id = p_holder_user_id and real_name is not null and btrim(real_name) <> ''
  ) then
    raise exception '본인인증을 완료한 회원에게만 매장이용권을 지급할 수 있습니다';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception '만료일은 미래 시각이어야 합니다';
  end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  if my_role() IS DISTINCT FROM 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족합니다 (잔여 %개) — 운영자에게 문의해 주세요', coalesce(v_quota, 0);
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), '매장이용권');
  v_holder := nullif(btrim(coalesce(p_holder_name, '')), '');
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note, expires_at)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), ''), p_expires_at
  from generate_series(1, v_count);
  if p_holder_user_id is not null then
    begin
      select name into v_vname from public.venues where id = p_venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (p_holder_user_id, 'system', '🎟 매장이용권 도착!',
              format('%s에서 ''%s'' %s장을 보냈어요. 지갑에서 확인하세요%s',
                     coalesce(v_vname, '매장'), v_title, v_count,
                     case when p_expires_at is not null
                          then format(' (유효기간 ~%s)', to_char(p_expires_at at time zone 'Asia/Seoul', 'MM/DD'))
                          else '' end),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
  return v_count;
end $$;

-- ④ LEAGUE-FREEZE(§12-A-1): 연합리그 실행권 회수 — 동결이지 삭제가 아니다(DROP·하드 delete 금지).
--    클라 진입점은 IA1 에서 제거 완료, 구독은 LeaguePanel 언마운트로 해제.
revoke execute on function public.league_reset_event(uuid) from anon, authenticated;
revoke execute on function public.league_set_status(uuid, uuid, text, integer, jsonb) from anon, authenticated;
revoke execute on function public.league_settle_all(uuid) from anon, authenticated;
revoke execute on function public.league_start_final(uuid) from anon, authenticated;
-- ⚠ is_league_participant 는 RLS 정책(les_select)이 평가에 사용 — 회수 금지.
-- ⚠ weekly_league·loyalty.ts 의 leagueTierOf 는 연합리그가 아니라 코스메틱 활동점수 티어 — 대상 아님(§18.4 함정).

notify pgrst, 'reload schema';

-- ROLLBACK:
-- ① request_voucher_credit 원복:
-- CREATE OR REPLACE FUNCTION public.request_voucher_credit(p_venue_id uuid, p_amount integer, p_note text DEFAULT NULL::text)
--  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $rb$
-- begin
--   if not can_manage_pos(p_venue_id) then raise exception '업주만 충전 요청을 남길 수 있습니다'; end if;
--   if coalesce(p_amount, 0) < 1 then raise exception '수량을 입력해 주세요'; end if;
--   if exists (select 1 from public.voucher_credit_requests where venue_id = p_venue_id and status = 'pending') then
--     raise exception '이미 대기 중인 충전 요청이 있습니다 — 운영자 승인을 기다려 주세요';
--   end if;
--   insert into public.voucher_credit_requests(venue_id, requested_by, amount, note)
--   values (p_venue_id, auth.uid(), least(p_amount, 100000), nullif(btrim(coalesce(p_note,'')), ''));
-- end $rb$;
-- ② admin_decide_voucher_credit 원복(승인 시 쿼터 가산 포함) — backup_20260826._functions 의
--    proname='admin_decide_voucher_credit' def 참조.
-- ③ issue_voucher 원복 — backup_20260826._functions 의 proname='issue_voucher' def 참조.
-- ④ grant execute on function public.league_reset_event(uuid) to authenticated;
--    grant execute on function public.league_set_status(uuid, uuid, text, integer, jsonb) to authenticated;
--    grant execute on function public.league_settle_all(uuid) to authenticated;
--    grant execute on function public.league_start_final(uuid) to authenticated;
