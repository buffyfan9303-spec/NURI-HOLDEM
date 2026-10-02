-- ✅ 적용 완료 2026-10-03 (리드, Management API). 되돌림 리허설 PASS(수정 전 FAIL·후 PASS, 워크인 행 불변 양성 대조) · advisors ERROR 0 · critical-reviewer 설계·리허설
-- 20261003b — 적용됨 · 요구 키 audit-link-1002.md#L-07 · 작성 critical-reviewer 2026-10-02
-- 무엇: 이용권 사용 요청(트리거 voucher_redeem_to_ledger_request)의 player_name 을 발급 때 이름 스냅샷(store_vouchers.holder_name)이
--       아니라 **손님 계정의 지금 닉네임**으로 쓴다. 현금 요청 request_buyin 과 같은 식이라 장부 한 사람이 두 이름으로 갈리지 않는다.
-- 출발점: 라이브 pg_get_functiondef (def md5 69f78195443ccaa8fda02d276225c7e7 · prosrc md5 6f1d6c1088e68c6cdb6c6a953a24a0fa) — 바꾼 곳 1곳.
-- 적용 후 prosrc md5: 7802da3ea47ab8b86c5d5ebf5816a57f
-- 영향(2026-10-02 라이브 실측): 이용권 10장 중 이름 불일치 0 · 이용권 요청 8건 중 불일치 0 · 대기 요청 0 → 기존 행 변화 없음(트리거라 새 요청부터).
-- 리허설: names-1002/l07_rehearse.sql (bug/fixed 두 모드, rehearse.mjs 되돌림).
-- 파일명은 리드 지정(20261003b). 라이브 미적용.
do $pre_voucher_redeem_to_ledger_request$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.voucher_redeem_to_ledger_request'::regproc) is distinct from '6f1d6c1088e68c6cdb6c6a953a24a0fa' then
    raise exception '표류: 라이브 voucher_redeem_to_ledger_request 본문이 초안 작성 때(6f1d6c1088e68c6cdb6c6a953a24a0fa)와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
end $pre_voucher_redeem_to_ledger_request$;

CREATE OR REPLACE FUNCTION public.voucher_redeem_to_ledger_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_seq smallint;
  v_biz date;
  v_game_closed boolean;
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.used_venue_id is not null then
    v_seq := nullif(current_setting('nuri.voucher_game_seq', true), '')::smallint;

    if v_seq is not null then
      if v_seq < 1 then
        raise exception '게임 번호가 올바르지 않습니다 — 접수대에서 게임을 다시 선택해 주세요';
      end if;
      v_biz := public.ledger_business_date(new.used_venue_id);
      select ls.closed
        into v_game_closed
        from public.ledger_sessions ls
       where ls.venue_id = new.used_venue_id
         and ls.session_date = v_biz
         and ls.game_seq = v_seq
       for share;
      if not found then
        raise exception '해당 게임을 찾을 수 없습니다 — 접수대에서 게임을 다시 선택해 주세요';
      end if;
      if v_game_closed then
        raise exception '이미 마감된 게임입니다 — 접수대에서 다른 게임으로 다시 요청해 주세요';
      end if;
    end if;

    insert into public.ledger_buyin_requests(
      venue_id, session_date, user_id, player_name, note, status, voucher_id, requested_game_seq
    )
    select
      new.used_venue_id,
      public.ledger_business_date(new.used_venue_id),
      new.holder_user_id,
      -- 20261002x L-07: 계정이 있으면 **지금 닉네임**(request_buyin 과 같은 식). 발급 때 이름(holder_name)은 계정이 없을 때만 쓴다.
      coalesce((select coalesce(nullif(trim(p.nickname), ''), nullif(trim(p.name), ''))
                  from public.profiles p where p.id = new.holder_user_id),
               nullif(btrim(new.holder_name), ''), '이용권 사용자'),
      '🎟 이용권 사용 — ' || coalesce(nullif(btrim(new.title), ''), '매장이용권') || ' · 수량/현금 확인 후 승인',
      'pending',
      new.id,
      v_seq
    where not exists (
      select 1 from public.ledger_buyin_requests
       where voucher_id = new.id and status <> 'rejected'
    );
  end if;
  return new;
end;
$function$;
revoke all on function public.voucher_redeem_to_ledger_request() from public, anon, authenticated;
grant execute on function public.voucher_redeem_to_ledger_request() to service_role;

do $post_voucher_redeem_to_ledger_request$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.voucher_redeem_to_ledger_request'::regproc) is distinct from '7802da3ea47ab8b86c5d5ebf5816a57f' then
    raise exception '자가검사: voucher_redeem_to_ledger_request 새 본문 md5 가 기대(7802da3ea47ab8b86c5d5ebf5816a57f)와 다르다';
  end if;
  if (select md5(replace(p.prosrc, '      -- 20261002x L-07: 계정이 있으면 **지금 닉네임**(request_buyin 과 같은 식). 발급 때 이름(holder_name)은 계정이 없을 때만 쓴다.
      coalesce((select coalesce(nullif(trim(p.nickname), ''''), nullif(trim(p.name), ''''))
                  from public.profiles p where p.id = new.holder_user_id),
               nullif(btrim(new.holder_name), ''''), ''이용권 사용자''),
', '      coalesce(nullif(btrim(new.holder_name), ''''), ''이용권 사용자''),
')) from pg_proc p where p.oid = 'public.voucher_redeem_to_ledger_request'::regproc) is distinct from '6f1d6c1088e68c6cdb6c6a953a24a0fa' then
    raise exception '자가검사: voucher_redeem_to_ledger_request 에서 의도한 줄 밖이 바뀌었다';
  end if;
end $post_voucher_redeem_to_ledger_request$;

do $acl_seven$ begin
  if has_function_privilege('anon', 'public.voucher_redeem_to_ledger_request()', 'execute') is distinct from false
     or has_function_privilege('authenticated', 'public.voucher_redeem_to_ledger_request()', 'execute') is distinct from false then
    raise exception '자가검사: voucher_redeem_to_ledger_request() ACL 이 기대(anon=false, authenticated=false)와 다르다';
  end if;
end $acl_seven$;
