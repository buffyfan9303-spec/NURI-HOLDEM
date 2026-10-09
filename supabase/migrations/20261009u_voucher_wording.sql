-- ✅ 적용 완료 2026-10-09 19:13 KST(리드). 리허설 PASS 11/11(바꿈 17 · 건너뜀 0).
--    적용 후 실측: public 함수 prosrc 에 '발급 매장에 문의' · '(발급 매장에서만 사용 가능)' · '발급 한도는 운영자에게' 0건.
-- (작성 당시) 미적용(2026-10-09 초안 · store-team). 적용·리허설·커밋 판단은 nuri-lead. 적용 경로: MCP execute_sql 로 이 파일 전문(nuri-migration §0).
--
-- 요구: audit-open-1009 r1-result.json GAP-07 (B-031) — 화면 용어는 '전송 / 보낸 매장 / 전송 취소'로 바뀌었는데
--   서버 예외·알림 문구에 '발급 매장에 문의해 주세요'·'(발급 매장에서만 사용 가능)'·'발급 장수/발급 한도'·'회수' 가 남아
--   토스트(vouchers.ts 는 한국어 서버 문구를 그대로 통과시킨다 — vouchers.errortext.test.ts '우리가 쓴 한국어 문구는 그대로 통과')로 옛 말이 보인다.
--   용어 기준: 매장→손님 = 전송, 업주 되돌리기 = 전송 취소(20260929e revoke_vouchers 와 같은 말), 이용권을 보낸 매장 = 보낸 매장.
--
-- 무엇: 아래 17개 함수의 **코드 안 문자열 리터럴 36개만** 바꾼다. 함수 본문은 손으로 옮겨 적지 않는다 —
--   적용 시점의 라이브 pg_get_functiondef() 를 읽어 (1) md5 가 초안 작성 때(2026-10-09 읽기 전용 조회)와 같은지 확인하고
--   (2) 따옴표까지 포함한 옛 리터럴을 정확히 정해진 횟수만큼 replace() 한 뒤 (3) 그 결과의 md5 가 미리 계산한 값과 같을 때만 실행한다.
--   그래서 리터럴 밖의 바이트(주석·로직·헤더·SET search_path·SECURITY DEFINER)는 1바이트도 바뀌지 않는다.
--   CREATE OR REPLACE 라 소유자·ACL 은 보존된다(CLAUDE.md 보안 표준 §3) — 실행 뒤 ACL 문자열이 초안 때와 같은지 단언한다.
--   이 파일은 리터럴에 줄바꿈이 없어서 작업트리 CRLF(core.autocrlf)여도 결과가 같다.
--
-- 바꾸지 않는 것: 참여권(‘참여권 지급’ 3곳 — 이용권이 아니다) · settle_unpaid_after_close 의 '회수'(미수 회수 = 수금, 다른 뜻) ·
--   refund_quote 의 주석 · 모든 주석 안의 '발급' · DB 값(status 'revoked', reason 'grant' 등).
-- 앱 영향: src/e2e/supabase/functions 에서 이 문구들을 문자열로 매칭하는 곳 0(grep, 2026-10-09 origin/main 4d9253e8).
--   vouchers.issueReturn.test.ts 의 '발급 한도가 부족합니다' 는 목 오류 원문이 그대로 통과되는지 보는 시험이라 서버 문구와 무관하다.
--   클라이언트 EventOpsAdmin 의 '매장 전송 한도' 문구와 서버 _event_campaign_problems 문구가 이 변경으로 같아진다.
--
-- 멱등: 이미 바뀐 함수(md5 = 적용 후 값)는 건너뛴다. 라이브가 초안 뒤에 바뀌었으면(md5 불일치) 아무것도 바꾸지 않고 멈춘다 → 초안 재생성.
-- 재생성: Documents/누리홀덤_영상분석_0930/audit-open-1009/fix-db/gen_u.mjs (q/b5_defs_wide.sql·b8_defs_extra.sql 를 rq.mjs 로 다시 읽은 뒤).
-- 리허설: supabase/tests/20261009u_rehearsal.sql (이 파일 뒤에 이어 붙여 rehearse.mjs 로).

do $mig$
declare
  f record; p record; v_def text; v_new text; v_cnt int; v_done int := 0; v_skip int := 0; v_acl text;
begin
  for f in
    select * from (values
        ($q$public._event_campaign_problems(uuid)$q$, '1a6667a562fe9948a5347b5135ba912a', 'f17ff688b8121b37444a2da3a610bc7a', $q$postgres=X/postgres service_role=X/postgres$q$),
        ($q$public._voucher_require_verified()$q$, '12e2672e05319a32ec32df6919c78a90', '2d268a36f0e80d4e9200a51938dfbd96', $q$postgres=X/postgres service_role=X/postgres$q$),
        ($q$public.accrue_voucher(uuid,text,integer)$q$, '71feb09e654c5e64ec31d3e41567f243', '376919e5d21ffe66272d4bb921fc5744', $q$postgres=X/postgres service_role=X/postgres$q$),
        ($q$public.admin_decide_voucher_quota(uuid,boolean,text)$q$, '2df8ad0f8ce4ebc872d31addb7601b59', 'c0f18503af21b3cf92885cf97bb3d434', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.admin_decide_venue_event(uuid,boolean,text)$q$, '50e12b4f035e3e939c7c934b6aace58d', 'a0188f2c7270f263944ee36e9b1db48f', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.admin_delete_event_draft(uuid)$q$, 'df27b241530b52d2b0737ef6ea16f451', '68ad86839b8b450a7f2859f8d683ce58', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.delete_voucher(uuid)$q$, '34d6f8e67476ff6fabb224f5c3a6e2aa', '4894f04fcb472f2ad893a3486c2fc8db', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, '3797a03df616b28cddb894863a05f938', 'da41283594d8dff31907bf9259da68a7', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.kill_venue(uuid,text,text)$q$, '014fc33d56426627d23181edd58d8813', '39911da419a43e466af76ea08b3545ef', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.open_event_card(text,integer)$q$, 'b9266fdf2548eabb38aa0f1686252384', '45a8146ec5e99ddbdf10e47015e3739f', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.redeem_my_voucher(uuid)$q$, 'c1c2427275be0c9cf6856c06107bd588', 'a039968b95952141d4603a41a5e09470', $q$postgres=X/postgres service_role=X/postgres$q$),
        ($q$public.redeem_my_voucher_by_phone(uuid,text,smallint)$q$, '7b4d05b3748c93e987e3d8db534c5b79', '91d143e70b0c7ac51e1690e65b8a34c2', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.redeem_my_voucher_by_qr(uuid,uuid,smallint)$q$, '487710fc00842291ec9c8d555a1fc4e8', '333aa637f9570b172ba660aa33217634', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.redeem_voucher(uuid,uuid)$q$, 'cde6c70c339befa2be56658a713d2972', 'c4cf7ec6ef210625bb6f054a28ad191d', $q$postgres=X/postgres service_role=X/postgres$q$),
        ($q$public.request_voucher_credit(uuid,integer,text)$q$, '124882c2c8a7955f59d53ccd0c281d0f', '1a4219141274260262158afa41b2cdf9', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.revoke_voucher(uuid)$q$, 'b7cba8afbab4be139171a6dd84c7287c', '7fc8ed510c0de8be3a889a3ce6108a80', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$),
        ($q$public.search_voucher_recipients(uuid,text)$q$, 'a6cd7b851eaa254abc11397c33b6feb8', '90ca08c3fae8c774ae76cf7e63d28c46', $q$postgres=X/postgres authenticated=X/postgres service_role=X/postgres$q$)
    ) t(sig, md5_before, md5_after, acl)
  loop
    v_def := pg_get_functiondef(f.sig::regprocedure);
    if md5(v_def) = f.md5_after then v_skip := v_skip + 1; continue; end if;           -- 이미 적용됨
    if md5(v_def) is distinct from f.md5_before then
      raise exception '20261009u: % 의 라이브 정의가 초안 이후 바뀌었습니다(md5 %) — 초안을 다시 만드세요', f.sig, md5(v_def);
    end if;
    v_new := v_def;
    for p in
      select * from (values
          ($q$public._event_campaign_problems(uuid)$q$, $q$'경품 이용권 유효기간이 이미 지났습니다 — 받는 즉시 만료된 이용권이 발급됩니다'$q$, $q$'경품 이용권 유효기간이 이미 지났습니다 — 받는 즉시 만료된 이용권이 전송됩니다'$q$, 1),
          ($q$public._event_campaign_problems(uuid)$q$, $q$'이 매장은 이용권 발급이 승인되지 않았습니다 — 매장 관리에서 먼저 승인하세요'$q$, $q$'이 매장은 이용권 전송이 승인되지 않았습니다 — 매장 관리에서 먼저 승인하세요'$q$, 1),
          ($q$public._event_campaign_problems(uuid)$q$, $q$'필요한 이용권 %s장이 매장 발급 한도 %s장을 넘습니다'$q$, $q$'필요한 이용권 %s장이 매장 전송 한도 %s장을 넘습니다'$q$, 1),
          ($q$public._voucher_require_verified()$q$, $q$'보유자가 지정되지 않은 이용권은 사용할 수 없습니다 — 본인인증을 마친 회원 계정으로 발급된 이용권만 사용됩니다'$q$, $q$'보유자가 지정되지 않은 이용권은 사용할 수 없습니다 — 본인인증을 마친 회원 계정으로 전송된 이용권만 사용됩니다'$q$, 1),
          ($q$public.accrue_voucher(uuid,text,integer)$q$, $q$'발급 한도가 부족해 적립하지 못했습니다 (잔여 %개 · 필요 %개)'$q$, $q$'전송 한도가 부족해 적립하지 못했습니다 (잔여 %개 · 필요 %개)'$q$, 1),
          ($q$public.admin_decide_voucher_quota(uuid,boolean,text)$q$, $q$'이용권 발행 한도 승인'$q$, $q$'이용권 전송 한도 승인'$q$, 1),
          ($q$public.admin_decide_voucher_quota(uuid,boolean,text)$q$, $q$'이용권 발행 한도 반려'$q$, $q$'이용권 전송 한도 반려'$q$, 1),
          ($q$public.admin_decide_voucher_quota(uuid,boolean,text)$q$, $q$'요청한 이용권 발행 한도 '$q$, $q$'요청한 이용권 전송 한도 '$q$, 1),
          ($q$public.admin_decide_venue_event(uuid,boolean,text)$q$, $q$'매장 발행 한도가 부족합니다 (잔여 %장 · 필요 %장) — 먼저 한도를 늘려 주세요'$q$, $q$'매장 전송 한도가 부족합니다 (잔여 %장 · 필요 %장) — 먼저 한도를 늘려 주세요'$q$, 1),
          ($q$public.admin_delete_event_draft(uuid)$q$, $q$'이 이벤트로 발급된 이용권이 있어 삭제할 수 없습니다'$q$, $q$'이 이벤트로 전송된 이용권이 있어 삭제할 수 없습니다'$q$, 1),
          ($q$public.delete_voucher(uuid)$q$, $q$'사용 완료된 이용권은 삭제할 수 없습니다 — 손님의 사용 내역과 장부 연동이 함께 사라집니다. 미사용분만 삭제하거나 회수해 주세요'$q$, $q$'사용 완료된 이용권은 삭제할 수 없습니다 — 손님의 사용 내역과 장부 연동이 함께 사라집니다. 미사용분만 삭제하거나 전송을 취소해 주세요'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'$q$, $q$'권한이 없습니다 — 매장이용권 전송은 업주만 가능합니다'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'순위·입상을 근거로 한 이용권 발급은 지원하지 않습니다 — 제목·비고에서 순위/시상 관련 문구를 빼고 일반 이용권으로만 발급할 수 있습니다'$q$, $q$'순위·입상을 근거로 한 이용권 전송은 지원하지 않습니다 — 제목·비고에서 순위/시상 관련 문구를 빼고 일반 이용권으로만 전송할 수 있습니다'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'발급 사유를 골라 주세요 — 첫 방문 환영·방문 감사·이벤트·서비스 보상·기타 중 하나'$q$, $q$'전송 사유를 골라 주세요 — 첫 방문 환영·방문 감사·이벤트·서비스 보상·기타 중 하나'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'기타 사유는 비고에 발급 이유를 적어 주세요'$q$, $q$'기타 사유는 비고에 전송 이유를 적어 주세요'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'운영자 승인 후 매장이용권을 발급할 수 있습니다'$q$, $q$'운영자 승인 후 매장이용권을 전송할 수 있습니다'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'본인인증을 완료한 회원에게만 매장이용권을 지급할 수 있습니다 — 받는 분이 프로필 > 보안에서 본인인증을 마쳐야 합니다'$q$, $q$'본인인증을 완료한 회원에게만 매장이용권을 전송할 수 있습니다 — 받는 분이 프로필 > 보안에서 본인인증을 마쳐야 합니다'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'받는 회원을 지정해야 매장이용권을 발급할 수 있습니다 — 보유자 없는 이용권은 사용할 수 없습니다'$q$, $q$'받는 회원을 지정해야 매장이용권을 전송할 수 있습니다 — 보유자 없는 이용권은 사용할 수 없습니다'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'발급 장수는 1~1000 사이여야 합니다 (요청 %장)'$q$, $q$'전송 장수는 1~1000 사이여야 합니다 (요청 %장)'$q$, 1),
          ($q$public.issue_voucher(uuid,text,integer,text,uuid,text,timestamp with time zone,text)$q$, $q$'발급 한도가 부족합니다 (잔여 %개) — 운영자에게 문의해 주세요'$q$, $q$'전송 한도가 부족합니다 (잔여 %개) — 운영자에게 문의해 주세요'$q$, 1),
          ($q$public.kill_venue(uuid,text,text)$q$, $q$'손님이 아직 쓰지 않은 매장이용권이 %장 남아 있어 매장을 삭제할 수 없습니다. 이용권을 모두 사용하거나 회수한 뒤 다시 시도해 주세요'$q$, $q$'손님이 아직 쓰지 않은 매장이용권이 %장 남아 있어 매장을 삭제할 수 없습니다. 이용권을 모두 사용하거나 전송을 취소한 뒤 다시 시도해 주세요'$q$, 1),
          ($q$public.open_event_card(text,integer)$q$, $q$'이 매장은 이용권 발급이 중단된 상태입니다 — 매장에 문의해 주세요'$q$, $q$'이 매장은 이용권 전송이 중단된 상태입니다 — 매장에 문의해 주세요'$q$, 1),
          ($q$public.open_event_card(text,integer)$q$, $q$'매장 발급 한도가 부족합니다 — 매장에 문의해 주세요'$q$, $q$'매장 전송 한도가 부족합니다 — 매장에 문의해 주세요'$q$, 1),
          ($q$public.redeem_my_voucher(uuid)$q$, $q$'매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'$q$, $q$'매장이 전송을 취소한 이용권입니다 — 보낸 매장에 문의해 주세요'$q$, 1),
          ($q$public.redeem_my_voucher_by_phone(uuid,text,smallint)$q$, $q$'매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'$q$, $q$'매장이 전송을 취소한 이용권입니다 — 보낸 매장에 문의해 주세요'$q$, 1),
          ($q$public.redeem_my_voucher_by_qr(uuid,uuid,smallint)$q$, $q$'매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'$q$, $q$'매장이 전송을 취소한 이용권입니다 — 보낸 매장에 문의해 주세요'$q$, 1),
          ($q$public.redeem_my_voucher_by_qr(uuid,uuid,smallint)$q$, $q$'이 매장의 이용권이 아닙니다 (발급 매장에서만 사용 가능)'$q$, $q$'이 매장의 이용권이 아닙니다 (보낸 매장에서만 사용 가능)'$q$, 1),
          ($q$public.redeem_voucher(uuid,uuid)$q$, $q$'사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소되었거나 이 매장 발급이 아님)'$q$, $q$'사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소되었거나 이 매장이 보낸 이용권이 아님)'$q$, 1),
          ($q$public.request_voucher_credit(uuid,integer,text)$q$, $q$'이용권 유상 충전은 종료되었습니다 — 발급 한도는 운영자에게 문의해 주세요'$q$, $q$'이용권 유상 충전은 종료되었습니다 — 전송 한도는 운영자에게 문의해 주세요'$q$, 1),
          ($q$public.revoke_voucher(uuid)$q$, $q$'권한이 없습니다 — 업주만 회수할 수 있습니다'$q$, $q$'권한이 없습니다 — 업주만 전송을 취소할 수 있습니다'$q$, 1),
          ($q$public.revoke_voucher(uuid)$q$, $q$'이미 사용된 이용권은 회수할 수 없습니다 — 사용 내역은 그대로 보존됩니다'$q$, $q$'이미 사용된 이용권은 전송을 취소할 수 없습니다 — 사용 내역은 그대로 보존됩니다'$q$, 1),
          ($q$public.revoke_voucher(uuid)$q$, $q$'이미 회수된 이용권입니다'$q$, $q$'이미 전송이 취소된 이용권입니다'$q$, 1),
          ($q$public.revoke_voucher(uuid)$q$, $q$'회수 처리에 실패했습니다 — 새로고침 후 다시 시도해 주세요'$q$, $q$'전송 취소에 실패했습니다 — 새로고침 후 다시 시도해 주세요'$q$, 1),
          ($q$public.revoke_voucher(uuid)$q$, $q$'🎟 매장이용권이 회수되었습니다'$q$, $q$'🎟 매장이용권 전송이 취소되었습니다'$q$, 1),
          ($q$public.revoke_voucher(uuid)$q$, $q$'%s의 ''%s'' 1장이 매장에 의해 회수되었습니다. 문의는 매장으로 부탁드립니다.'$q$, $q$'%s의 ''%s'' 1장 전송이 매장에 의해 취소되었습니다. 문의는 매장으로 부탁드립니다.'$q$, 1),
          ($q$public.search_voucher_recipients(uuid,text)$q$, $q$'권한이 없습니다 — 매장이용권 발급 권한자만 검색할 수 있습니다'$q$, $q$'권한이 없습니다 — 매장이용권 전송 권한자만 검색할 수 있습니다'$q$, 1)
      ) t(sig, old_lit, new_lit, n)
      where t.sig = f.sig
    loop
      v_cnt := (length(v_new) - length(replace(v_new, p.old_lit, ''))) / length(p.old_lit);
      if v_cnt is distinct from p.n then
        raise exception '20261009u: % 의 리터럴 출현 수가 다릅니다(기대 %, 실제 %): %', f.sig, p.n, v_cnt, p.old_lit;
      end if;
      v_new := replace(v_new, p.old_lit, p.new_lit);
    end loop;
    if md5(v_new) is distinct from f.md5_after then
      raise exception '20261009u: % 치환 결과 md5 가 계산값과 다릅니다(%) — 실행하지 않습니다', f.sig, md5(v_new);
    end if;
    execute v_new;
    if md5(pg_get_functiondef(f.sig::regprocedure)) is distinct from f.md5_after then
      raise exception '20261009u: % 적용 뒤 정의 md5 불일치', f.sig;
    end if;
    select coalesce(array_to_string(pr.proacl, ' '), '(default)') into v_acl from pg_proc pr where pr.oid = f.sig::regprocedure;
    if v_acl is distinct from f.acl then
      raise exception '20261009u: % ACL 이 바뀌었습니다(기대 %, 실제 %)', f.sig, f.acl, v_acl;
    end if;
    v_done := v_done + 1;
  end loop;

  -- 자가검사: 옛 리터럴(따옴표 포함)이 public 함수 어디에도 남지 않았다
  if exists (
    select 1 from pg_proc pr, (values
      ('''매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'''),
      ('''이 매장의 이용권이 아닙니다 (발급 매장에서만 사용 가능)'''),
      ('''발급 장수는 1~1000 사이여야 합니다 (요청 %장)'''),
      ('''발급 한도가 부족합니다 (잔여 %개) — 운영자에게 문의해 주세요'''),
      ('''권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'''),
      ('''이미 회수된 이용권입니다''')
    ) o(lit)
    where pr.pronamespace = 'public'::regnamespace and position(o.lit in pr.prosrc) > 0
  ) then
    raise exception '20261009u 자가검사 실패: 옛 리터럴이 남아 있습니다';
  end if;
  raise notice '20261009u: 바꿈 % · 이미 적용 %', v_done, v_skip;
  perform set_config('open_reset.report', coalesce(current_setting('open_reset.report', true), '') || format('[20261009u 바꿈 %s 건너뜀 %s] ', v_done, v_skip), true);
end $mig$;
