-- ⏸ 초안 — 리드가 리허설 후 적용(store-team, 묶음 terms, 2026-09-29). 라이브에 아직 적용하지 않았다.
--
-- 요구: docs/HANDOFF-2026-09-29-account-switch.md#7 §5 오너 결정 "이용권 용어" — 손님→매장='사용', 매장→손님='전송'.
--   업주 되돌리기(revoke_vouchers) 버튼·배지·확인창·결과 화면 문구는 store-team 이 이번 커밋에서 '전송 취소'로 통일했다
--   (src/components/features/VoucherManageModal.tsx·LedgerVoucherRail.tsx). 서버가 보내는 알림 제목·본문만 그대로 '회수'
--   였다 — 화면과 알림의 말이 갈리면 손님이 받는 통지가 방금 본 업주 화면 용어와 달라 보인다.
--
-- 무엇: revoke_vouchers(uuid[]) 의 **문구만** 바꾼다. 함수 시그니처·SQL 로직·리턴 shape·권한(ACL)은
--   20260926e 라이브 정의(적용 완료, MCP 조회로 재확인)와 완전히 동일하다 — CREATE OR REPLACE 라 ACL 은
--   보존되지만(CLAUDE.md 보안 표준 §3), 관행대로 REVOKE/GRANT 를 다시 적어 둔다.
--   바뀌는 것: notifications 행의 title '🎟 매장이용권이 회수되었습니다' → '🎟 매장이용권 전송이 취소되었습니다',
--   message '%s의 매장이용권 %s장이 매장에 의해 회수되었습니다…' → '…전송이 취소되었습니다…'.
--   v_reasons 의 사람이 읽는 사유 문구(권한 없음/이미 사용/이미 회수/찾을 수 없음)도 같은 원칙으로 옮겼다 —
--   클라이언트 vouchers.errortext.test.ts 가 revokeVouchers 본문에 humanize 가 없어야 한다고 잠그는 대상은
--   클라이언트 함수 쪽이라 이 서버 문구 변경과는 무관하다(별도 확인 필요 없음).
--
-- 바꾸지 않는 것: 함수 이름·파라미터·SECURITY DEFINER·search_path·행 개수 상한(500)·모든 SELECT/UPDATE 조건.
--   store_vouchers.status 값('revoked')도 그대로다 — DB 값은 서버 계약이라 손대지 않는다(CLAUDE.md §5 사유 라벨 원칙과 같다).
--
-- 리허설 제안(라이브 begin … rollback):
--   R0 준비: 미사용(active) 이용권을 가진 보유자 1명 + 업주 계정 1개를 고른다(role='venue_owner' 이고 해당 매장 owner_id 또는 승인 공동운영자).
--   R1 문구: 업주 계정으로 select public.revoke_vouchers(array[<active 이용권 id>]) 실행 → notifications 최신 행의
--        title = '🎟 매장이용권 전송이 취소되었습니다', message 가 '전송이 취소되었습니다' 를 포함(구 '회수되었습니다' 미포함).
--   R2 반환 shape 불변: 반환 jsonb 의 키가 여전히 {ok, failed, reasons} 셋뿐이고, ok/failed 숫자가 20260926e 와 같은 입력에서 같다.
--   R3 음성 — 타 매장 업주로 같은 id 호출 → ok=0, reasons 에 '권한이 없습니다 — 업주만 전송을 취소할 수 있습니다' 류가 담긴다(문구만 확인, 로직은 원본과 동일해 거절 자체는 이미 보장됨).
--   R4 ACL: has_function_privilege('anon', 'public.revoke_vouchers(uuid[])', 'execute') = false,
--        authenticated = true. (CREATE OR REPLACE 라 ACL 은 이미 보존되어 있을 것 — 이 R4 는 회귀가 없음을 재확인하는 용도다.)
--   R5 기존 행 불변: 리허설 전후 select md5(string_agg(t::text, '' order by id)) from store_vouchers t 가 롤백 뒤 같다.
--
-- 함께 볼 것: 화면 쪽 '전송 취소' 통일은 이 마이그레이션과 별개 커밋(store-team, 묶음 terms)에서 이미 끝났다.
--   이 파일을 적용하지 않아도 화면은 깨지지 않는다(클라이언트는 서버 message 를 그대로 토스트에 옮기지 않고
--   reportBulk 가 자체 문구를 쓴다 — VoucherManageModal.tsx:437-440). 이 파일은 **알림함(notifications)의 문구**만 고친다.

create or replace function public.revoke_vouchers(p_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  r record; v_ok int := 0; v_reasons text[] := '{}'::text[]; v_total int; v_msg text;
  v_ids uuid[] := coalesce(p_ids, '{}'::uuid[]);
  v_done uuid[];
begin
  -- 20260926e: 알림 대상 = 이 호출의 UPDATE 가 돌려준 id(v_done). 종전엔 입력 id 전체의 status='revoked' 를 모아
  --   남의 매장·이미 회수된 이용권 보유자에게도 '회수' 알림이 갔다.
  -- 20260929e: 문구만 '전송 취소' 로 통일(오너 결정 — 화면 쪽 용어와 맞춘다). 로직은 20260926e 와 동일.
  v_total := coalesce(array_length(v_ids, 1), 0);
  if v_total = 0 then return jsonb_build_object('ok', 0, 'failed', 0, 'reasons', '[]'::jsonb); end if;
  if v_total > 500 then raise exception '한 번에 500장까지 전송을 취소할 수 있습니다'; end if;

  for r in
    select sv.id, sv.status, sv.venue_id, can_manage_pos(sv.venue_id) as mine
    from public.store_vouchers sv where sv.id = any(v_ids)
  loop
    v_msg := case
      when not r.mine then '권한이 없습니다 — 업주만 전송을 취소할 수 있습니다'
      when r.status = 'used' then '이미 사용된 이용권은 전송을 취소할 수 없습니다 — 사용 내역은 그대로 보존됩니다'
      when r.status = 'revoked' then '이미 전송이 취소된 이용권입니다'
      else null end;
    if v_msg is not null and not (v_msg = any(v_reasons)) then
      v_reasons := array_append(v_reasons, v_msg);
    end if;
  end loop;

  with upd as (
    update public.store_vouchers sv set status = 'revoked'
     where sv.id = any(v_ids) and sv.status = 'active' and can_manage_pos(sv.venue_id)
    returning sv.id
  )
  select coalesce(array_agg(upd.id), '{}'::uuid[]) into v_done from upd;
  v_ok := coalesce(array_length(v_done, 1), 0);

  if v_ok < v_total and not exists (select 1 from public.store_vouchers where id = any(v_ids)) then
    v_reasons := array_append(v_reasons, '이용권을 찾을 수 없습니다 — 이미 삭제되었을 수 있습니다'::text);
  end if;

  if v_ok > 0 then
    begin
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      select g.holder_user_id, 'system', '🎟 매장이용권 전송이 취소되었습니다',
             format('%s의 매장이용권 %s장 전송이 매장에 의해 취소되었습니다. 문의는 매장으로 부탁드립니다.',
                    coalesce(v.name, '매장'), g.n),
             '🎟', '#FFD100', '/wallet'
      from (
        select sv.holder_user_id, sv.venue_id, count(*) as n
        from public.store_vouchers sv
        where sv.id = any(v_done) and sv.holder_user_id is not null
        group by sv.holder_user_id, sv.venue_id
      ) g left join public.venues v on v.id = g.venue_id;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', v_ok, 'failed', v_total - v_ok, 'reasons', to_jsonb(v_reasons));
end $function$;

revoke all on function public.revoke_vouchers(uuid[]) from public, anon;
grant execute on function public.revoke_vouchers(uuid[]) to authenticated;
