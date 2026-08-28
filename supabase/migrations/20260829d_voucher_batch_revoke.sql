-- ============================================================================
-- 일괄 회수 RPC (2026-08-29) — 한 번의 회수 = 손님에게 알림 한 통
--
-- 실측(브라우저 관통, [E2E] 매장): 업주가 '회수' 한 번을 눌러 3장을 되돌렸는데
--   손님에게 '회수되었습니다' 알림이 3건 갔다. 이용권의 기본 단위가 '한 사람에게
--   N장'이라 20장이면 푸시가 20번 울린다 — 회수는 손님에게 이미 나쁜 소식인데
--   그걸 20번 반복해 알리는 셈이다.
-- 왜 클라이언트가 아니라 서버인가: 알림을 만드는 곳이 서버(SECURITY DEFINER)다.
--   클라이언트가 for 문으로 단건 RPC 를 N번 부르는 한 알림도 N건이 된다.
--   덤으로 실패 사유 집계(권한·이미사용·이미회수)도 서버 한 곳에서 끝난다.
-- 왜 revoke_voucher(단건)를 남기나: 구버전 클라이언트(캐시된 번들) 호환.
--   신규 클라이언트는 배치를 쓰고, RPC 미배포 DB 에서는 단건 루프로 폴백한다.
-- 사유 문구는 단건 함수와 글자 단위로 같게 유지한다 — 두 경로가 다른 말을 하면
--   사장님이 '무엇이 달라졌나'를 의심하게 된다.
-- 전량 additive: 새 함수 1개 + ACL. 기존 함수·데이터 변경 0.
-- ROLLBACK: drop function if exists public.revoke_vouchers(uuid[]);
-- ============================================================================
create or replace function public.revoke_vouchers(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record; v_ok int := 0; v_reasons text[] := '{}'::text[]; v_total int; v_msg text;
  v_ids uuid[] := coalesce(p_ids, '{}'::uuid[]);
begin
  v_total := coalesce(array_length(v_ids, 1), 0);
  if v_total = 0 then return jsonb_build_object('ok', 0, 'failed', 0, 'reasons', '[]'::jsonb); end if;
  if v_total > 500 then raise exception '한 번에 500장까지 회수할 수 있습니다'; end if;

  -- 권한·상태별 사유 집계. 남의 매장 건은 '존재'조차 알려 주지 않는다(권한 없음으로 뭉갠다).
  -- ⚠ v_reasons(text[]) || '문자열리터럴' 로 쓰면 안 된다 — 리터럴이 unknown 타입이라
  --   Postgres 가 anycompatiblearray || anycompatiblearray 로 해석해 배열 리터럴 파싱을
  --   시도하고 "malformed array literal" 로 터진다(이미 회수된 건이 섞인 재호출에서 실측).
  --   array_append(…, '…'::text) 로 '원소 추가'임을 명시한다.
  for r in
    select sv.id, sv.status, sv.venue_id, can_manage_pos(sv.venue_id) as mine
    from public.store_vouchers sv where sv.id = any(v_ids)
  loop
    v_msg := case
      when not r.mine then '권한이 없습니다 — 업주만 회수할 수 있습니다'
      when r.status = 'used' then '이미 사용된 이용권은 회수할 수 없습니다 — 사용 내역은 그대로 보존됩니다'
      when r.status = 'revoked' then '이미 회수된 이용권입니다'
      else null end;
    if v_msg is not null and not (v_msg = any(v_reasons)) then
      v_reasons := array_append(v_reasons, v_msg);
    end if;
  end loop;

  with upd as (
    update public.store_vouchers sv set status = 'revoked'
     where sv.id = any(v_ids) and sv.status = 'active' and can_manage_pos(sv.venue_id)
    returning sv.holder_user_id, sv.venue_id
  )
  select count(*) into v_ok from upd;

  if v_ok < v_total and not exists (select 1 from public.store_vouchers where id = any(v_ids)) then
    v_reasons := array_append(v_reasons, '이용권을 찾을 수 없습니다 — 이미 삭제되었을 수 있습니다'::text);
  end if;

  -- 보유자별 알림 1통(장수만 합산) — 20장 회수에 푸시 20번을 울리지 않는다.
  if v_ok > 0 then
    begin
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      select g.holder_user_id, 'system', '🎟 매장이용권이 회수되었습니다',
             format('%s의 매장이용권 %s장이 매장에 의해 회수되었습니다. 문의는 매장으로 부탁드립니다.',
                    coalesce(v.name, '매장'), g.n),
             '🎟', '#FFD100', '/wallet'
      from (
        select sv.holder_user_id, sv.venue_id, count(*) as n
        from public.store_vouchers sv
        where sv.id = any(v_ids) and sv.status = 'revoked' and sv.holder_user_id is not null
        group by sv.holder_user_id, sv.venue_id
      ) g left join public.venues v on v.id = g.venue_id;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', v_ok, 'failed', v_total - v_ok, 'reasons', to_jsonb(v_reasons));
end $function$;
revoke all on function public.revoke_vouchers(uuid[]) from public, anon;
grant execute on function public.revoke_vouchers(uuid[]) to authenticated;

notify pgrst, 'reload schema';
