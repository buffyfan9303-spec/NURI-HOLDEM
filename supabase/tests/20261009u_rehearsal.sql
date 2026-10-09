-- 20261009u 라이브 롤백 리허설(초안 · store-team 2026-10-09). 실행(리드):
--   node <Documents>/누리홀덤_영상분석_0930/open-reset-1008/rehearse.mjs <저장소>/supabase/migrations/20261009u_voucher_wording.sql <저장소>/supabase/tests/20261009u_rehearsal.sql
-- 본문만 있다(begin/commit 없음) — rehearse.mjs 가 끝에 raise 를 붙여 통째로 되돌린다. 달러 태그는 글자만.
-- 결과는 open_reset.report 에 'U… PASS/FAIL' 로 쌓이고, 하나라도 FAIL 이면 이 블록이 먼저 예외로 멈춘다.
-- 음성 대조: 마이그레이션 없이 이 파일만 돌리면 U1~U5 가 옛 문구로 FAIL 이어야 한다(라이브는 아직 옛 문구).
-- 시험 계정(2026-10-09 읽기 전용 조회로 역할·소유 확인 — 이 블록이 다시 확인한다):
--   업주 7e435684(role venue_owner · 로티아레나 f35b42d1 owner_id · ci 보유) · 일반 회원 708de904(소유 0 · 공동운영 0)
--   보유자 후보 fd14c2dc(일반 회원 · ci 보유 · 소유 0) · 다른 매장 베가라운지 bca7960c.
do $urehearsal$
declare
  c_roti constant uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  c_vega constant uuid := 'bca7960c-5dcd-401c-8b0c-bb34c5fc3d3c';
  c_owner constant uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_user constant uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_holder constant uuid := 'fd14c2dc-d994-46e4-8f12-b6cf38104983';
  total int := 0; fails int := 0; notrun int := 0; out text := ''; v uuid; v_appr boolean; v_exp text; t text; n int;
  v_holder text;
begin
  -- 전제: 계정 역할·소유가 위 설명과 같다(다르면 시험 자체가 틀린다 — 멈춘다)
  if (select owner_id from public.venues where id = c_roti) is distinct from c_owner
     or exists (select 1 from public.venues where owner_id = c_user)
     or exists (select 1 from public.venue_owners where user_id = c_user)
     or (select role::text from public.profiles where id = c_user) is distinct from 'user' then
    raise exception 'U 전제 불일치 — 시험 계정을 다시 고르세요';
  end if;

  -- U0 ACL 독립 확인: 17개 모두 anon 불가 · 앱이 부르는 12개는 authenticated 가능 · 내부 5개는 authenticated 불가
  total := total + 1;
  select count(*) into n from (values
    ('public._event_campaign_problems(uuid)', false), ('public._voucher_require_verified()', false),
    ('public.accrue_voucher(uuid,text,integer)', false), ('public.redeem_my_voucher(uuid)', false), ('public.redeem_voucher(uuid,uuid)', false),
    ('public.admin_decide_voucher_quota(uuid,boolean,text)', true), ('public.admin_decide_venue_event(uuid,boolean,text)', true),
    ('public.admin_delete_event_draft(uuid)', true), ('public.delete_voucher(uuid)', true),
    ('public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)', true), ('public.kill_venue(uuid,text,text)', true),
    ('public.open_event_card(text,integer)', true), ('public.redeem_my_voucher_by_phone(uuid,text,smallint)', true),
    ('public.redeem_my_voucher_by_qr(uuid,uuid,smallint)', true), ('public.request_voucher_credit(uuid,integer,text)', true),
    ('public.revoke_voucher(uuid)', true), ('public.search_voucher_recipients(uuid,text)', true)
  ) a(sig, auth_ok)
  where not has_function_privilege('anon', a.sig, 'execute')
    and has_function_privilege('authenticated', a.sig, 'execute') = a.auth_ok
    and has_function_privilege('service_role', a.sig, 'execute');
  if n = 17 then out := out || 'U0 PASS; '; else fails := fails + 1; out := out || 'U0 FAIL acl ' || n || '/17; '; end if;

  -- U1 음성: 일반 회원은 업주 가드에서 막히고, 문구는 새 말이다
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
    perform public.issue_voucher(c_roti, '리허설', 1, null, null, null, null, 'visit');
    fails := fails + 1; out := out || 'U1 FAIL 통과됨; ';
  exception when others then
    if sqlerrm = '권한이 없습니다 — 매장이용권 전송은 업주만 가능합니다' then out := out || 'U1 PASS; ';
    else fails := fails + 1; out := out || 'U1 FAIL ' || sqlerrm || '; '; end if;
  end;

  -- U2 양성: 업주는 가드를 지나 다음 검사(사유)에서 새 문구로 멈춘다
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
    perform public.issue_voucher(c_roti, '리허설', 1, null, null, null, null, 'zzz');
    fails := fails + 1; out := out || 'U2 FAIL 통과됨; ';
  exception when others then
    if sqlerrm = '전송 사유를 골라 주세요 — 첫 방문 환영·방문 감사·이벤트·서비스 보상·기타 중 하나' then out := out || 'U2 PASS; ';
    else fails := fails + 1; out := out || 'U2 FAIL ' || sqlerrm || '; '; end if;
  end;

  -- U3 양성: 업주 · 정상 사유 · 받는 회원 없음 → 승인 매장이면 '받는 회원을 지정해야…전송할 수', 미승인이면 '운영자 승인 후…전송할 수'
  total := total + 1;
  select coalesce(voucher_issue_approved, false) into v_appr from public.venues where id = c_roti;
  v_exp := case when v_appr then '받는 회원을 지정해야 매장이용권을 전송할 수 있습니다 — 보유자 없는 이용권은 사용할 수 없습니다'
                else '운영자 승인 후 매장이용권을 전송할 수 있습니다' end;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
    perform public.issue_voucher(c_roti, '리허설', 1, null, null, null, null, 'visit');
    fails := fails + 1; out := out || 'U3 FAIL 통과됨; ';
  exception when others then
    if sqlerrm = v_exp then out := out || 'U3 PASS; ';
    else fails := fails + 1; out := out || 'U3 FAIL ' || sqlerrm || '; '; end if;
  end;

  -- U4 준비: 전송 취소(revoked) 상태 이용권 1장(되돌림). INSERT 가 킬스위치로 막히면 기존 이용권 1장을 revoked 로 바꿔 쓴다.
  perform set_config('request.jwt.claims', '', true);
  begin
    insert into public.store_vouchers (venue_id, issued_by, holder_user_id, title, status, issue_reason)
    values (c_roti, c_owner, c_holder, '리허설', 'revoked', 'visit') returning id into v;
  exception when others then
    v := null; out := out || 'U4prep insert 막힘(' || left(sqlerrm, 40) || ') → 기존 행; ';
    select sv.id into v from public.store_vouchers sv where sv.holder_user_id is not null and sv.venue_id is not null
     order by sv.created_at desc limit 1;
    if v is not null then update public.store_vouchers set status = 'revoked' where id = v; end if;
  end;

  if v is null then
    notrun := notrun + 6; out := out || 'U4a~U5b NOT_RUN(이용권 0장 — 문구는 U0·마이그레이션 md5 단언으로만 확인); ';
  else
    select holder_user_id, venue_id into v_holder, t from public.store_vouchers where id = v;  -- 보유자·매장(텍스트)
    perform set_config('request.jwt.claims', json_build_object('sub', v_holder, 'role', 'authenticated')::text, true);
    -- U4a 다른 매장 QR → '보낸 매장에서만'
    total := total + 1;
    begin
      perform public.redeem_my_voucher_by_qr(v, case when t::uuid = c_vega then c_roti else c_vega end, null);
      fails := fails + 1; out := out || 'U4a FAIL 통과됨; ';
    exception when others then
      if sqlerrm = '이 매장의 이용권이 아닙니다 (보낸 매장에서만 사용 가능)' then out := out || 'U4a PASS; ';
      else fails := fails + 1; out := out || 'U4a FAIL ' || sqlerrm || '; '; end if;
    end;
    -- U4b 보낸 매장 QR · U4c 전화번호 · U4d 직접 — 셋 다 전송 취소 문구
    total := total + 1;
    begin
      perform public.redeem_my_voucher_by_qr(v, t::uuid, null);
      fails := fails + 1; out := out || 'U4b FAIL 통과됨; ';
    exception when others then
      if sqlerrm = '매장이 전송을 취소한 이용권입니다 — 보낸 매장에 문의해 주세요' then out := out || 'U4b PASS; ';
      else fails := fails + 1; out := out || 'U4b FAIL ' || sqlerrm || '; '; end if;
    end;
    total := total + 1;
    begin
      perform public.redeem_my_voucher_by_phone(v, '010-0000-0000', null);
      fails := fails + 1; out := out || 'U4c FAIL 통과됨; ';
    exception when others then
      if sqlerrm = '매장이 전송을 취소한 이용권입니다 — 보낸 매장에 문의해 주세요' then out := out || 'U4c PASS; ';
      else fails := fails + 1; out := out || 'U4c FAIL ' || sqlerrm || '; '; end if;
    end;
    total := total + 1;
    begin
      perform public.redeem_my_voucher(v);
      fails := fails + 1; out := out || 'U4d FAIL 통과됨; ';
    exception when others then
      if sqlerrm = '매장이 전송을 취소한 이용권입니다 — 보낸 매장에 문의해 주세요' then out := out || 'U4d PASS; ';
      else fails := fails + 1; out := out || 'U4d FAIL ' || sqlerrm || '; '; end if;
    end;

    -- U5 revoke_voucher: 음성(일반 회원) · 양성(업주는 가드를 지나 '이미 전송이 취소된')
    total := total + 1;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
      perform public.revoke_voucher(v);
      fails := fails + 1; out := out || 'U5a FAIL 통과됨; ';
    exception when others then
      if sqlerrm = '권한이 없습니다 — 업주만 전송을 취소할 수 있습니다' then out := out || 'U5a PASS; ';
      else fails := fails + 1; out := out || 'U5a FAIL ' || sqlerrm || '; '; end if;
    end;
    if t::uuid = c_roti then
      total := total + 1;
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
        perform public.revoke_voucher(v);
        fails := fails + 1; out := out || 'U5b FAIL 통과됨; ';
      exception when others then
        if sqlerrm = '이미 전송이 취소된 이용권입니다' then out := out || 'U5b PASS; ';
        else fails := fails + 1; out := out || 'U5b FAIL ' || sqlerrm || '; '; end if;
      end;
    else
      notrun := notrun + 1; out := out || 'U5b NOT_RUN(로티 이용권 아님); ';
    end if;
  end if;

  -- U6 무조건 raise 함수: 새 문구 그대로
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
    perform public.request_voucher_credit(c_roti, 1, null);
    fails := fails + 1; out := out || 'U6 FAIL 통과됨; ';
  exception when others then
    if sqlerrm = '이용권 유상 충전은 종료되었습니다 — 전송 한도는 운영자에게 문의해 주세요' then out := out || 'U6 PASS; ';
    else fails := fails + 1; out := out || 'U6 FAIL ' || sqlerrm || '; '; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  out := format('[20261009u 리허설 %s %s/%s NOT_RUN %s :: %s] ', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, notrun, out);
  perform set_config('open_reset.report', coalesce(current_setting('open_reset.report', true), '') || out, true);
  if fails > 0 then raise exception '%', out; end if;
end $urehearsal$;
