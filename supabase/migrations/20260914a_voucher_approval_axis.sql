-- ============================================================================
-- 20260914a — 이용권 발급 승인 축 정합성 3건 (오너 결정 2026-09-14 · 독립 검토 perm-boundary-review)
--
-- 무엇이 문제였나 — 전부 라이브 pg_proc 실측(2026-09-14, PostgreSQL 17.6 / list_migrations 최종 20260913132414)
--   ① open_event_card 는 venues.voucher_quota 만 보고 **voucher_issue_approved 를 보지 않는다**
--      (prosrc 에 그 문자열이 없음). 승인은 _event_campaign_problems → admin_publish_event_campaign 의
--      **공개 시점에만** 검사된다. 그래서 공개 뒤 관리자가 set_voucher_issue_approval(false) 로 승인을 해제해도
--      캠페인을 숨기거나 종료하지 않는 한 카드 개봉·이용권 발급·한도 차감이 계속된다.
--      권한 상승은 아니다(관리자 부작위가 전제, 한도 상한은 그대로) — 정합성 결함이다.
--   ② admin_grant_voucher_quota 가 한도 충전과 함께 **voucher_issue_approved = true 를 같이 쓴다**
--      (라이브 본문 = 20260614b:105). 승인 해제가 충전 한 번으로 소리 없이 되돌아간다.
--      admin_decide_voucher_credit 은 **라이브에서 이미 승인 경로가 폐쇄돼**(§12-A, 반려만 가능) 자동 재승인이
--      없다 — 저장소 20260614b:91 과 다르다. 그 함수는 이 파일이 건드리지 않는다.
--   ③ redeem_voucher(업주 측 사용 처리)는 can_manage_venue 로 게이트해 **approved venue_staff 까지** 실행된다.
--      자기 매장 발급분·미만료만이라 타 매장은 못 건드리지만, 보유자 동의 없이 used 로 만들 수 있고 그 전이가
--      _voucher_used_checkin 으로 출석·참여권을 낳는다. UI 호출 0곳(src `redeemVoucher(` 0건),
--      DB 내부 호출 0(라이브 prosrc·트리거 정의 검색 0건). 라이브 ACL: authenticated=t anon=f service_role=t.
--
-- 어떻게 고치나
--   ① 승인 확인을 숨김/기간 가드 **직후, 참여권·카드 소모 전**에 둔다 — 본인인증 게이트를 앞에 둔 것과 같은
--      이유다(열고 나서 막으면 참여권과 카드만 사라진다). coalesce(..., false) 로 NULL-safe.
--   ② update 문에서 `voucher_issue_approved = true` 를 뺀다. 승인은 set_voucher_issue_approval 만 바꾼다.
--   ③ **실행권 회수**(방식 ②)를 택한다. 본문을 can_manage_pos 로 조이는 방식(①)은 함수가 계속 호출 가능한 채
--      헬퍼 정의에 기대므로 헬퍼가 나중에 바뀌면 다시 열릴 수 있다. 실행권 회수는 코드 경로 자체가 없어
--      **fail-open 이 불가능**하고, 직원용 상환 화면을 만들 때 `grant execute ... to authenticated` 한 줄로
--      되돌린다(본문이 이미 직원을 허용하므로 재작성이 없다). redeem_my_voucher(20260907d)·
--      accrue_voucher(20260905i) 와 같은 선례다. PostgREST 는 permission denied 를 0행이 아니라
--      하드 에러로 돌려주므로 조용한 실패가 아니다(nuri-affect).
--
-- 영향 — 기존 행 변경 0
--   ① event_campaigns 라이브 0행 → 지금 동작 변화 0. 앞으로 승인 해제된 매장의 live 캠페인은 카드가 안 열린다.
--   ② 데이터 변경 0. 다음 충전부터 승인 플래그를 건드리지 않는다(라이브 venues: approved=1, quota>0=1).
--   ③ 클라·DB 호출 0 → 기능 소실 0.
-- 멱등: CREATE OR REPLACE + REVOKE/GRANT 재실행 안전. 전제 검사는 '이미 적용된 상태'도 통과시킨다.
-- 이 파일에 넣지 않은 것: identity_voucher_enabled 킬스위치가 클라 전용이라 서버 발급 경로(이벤트 포함)를
--   안 막는 문제 — 별건, 오너 결정 대기.
-- ============================================================================
begin;

-- ── 전제 확인 — 하나라도 어긋나면 여기서 멈춘다(아무것도 바뀌지 않는다) ─────────────
do $preflight$
declare v_src text;
begin
  if to_regprocedure('public.open_event_card(text, integer)') is null then
    raise exception 'ABORT: open_event_card(text, integer) 가 없다 — 20260906b/20260913123648 이 적용돼 있지 않다';
  end if;
  if to_regprocedure('public.admin_grant_voucher_quota(uuid, integer)') is null then
    raise exception 'ABORT: admin_grant_voucher_quota(uuid, integer) 가 없다 — 20260614b 가 적용돼 있지 않다';
  end if;
  if to_regprocedure('public.redeem_voucher(uuid, uuid)') is null then
    raise exception 'ABORT: redeem_voucher(uuid, uuid) 가 없다';
  end if;
  if to_regprocedure('public.set_voucher_issue_approval(uuid, boolean)') is null then
    raise exception 'ABORT: set_voucher_issue_approval(uuid, boolean) 가 없다 — 승인을 바꿀 유일한 경로가 없으면 ② 가 승인을 영구히 잠근다';
  end if;
  -- 덮어쓸 본문이 이 파일이 전제한 판(20260913123648 번들: 숨김 가드 + `>=` 종료 경계)인지.
  -- 다른 판이면 무엇을 잃는지 사람이 먼저 봐야 한다.
  select prosrc into v_src from pg_proc where oid = 'public.open_event_card(text, integer)'::regprocedure;
  if position('v_c.hidden_at is not null' in v_src) = 0 or position('now() >= v_c.ends_at' in v_src) = 0 then
    raise exception 'ABORT: open_event_card 라이브 본문이 20260913123648 판이 아니다(숨김 가드/종료 경계 없음) — 그 번들을 먼저 적용하라';
  end if;
end $preflight$;

-- ── ① open_event_card — 발급 승인 해제 시 즉시 멈춘다 ────────────────────────────
-- 20260913123648:1946-2033 본문 그대로 + 승인 가드 한 블록. 나머지 불변식은 그대로다:
-- 숨김 거절 · `>=` 종료 경계 · 본인인증 게이트 · 참여권 잠금(skip locked) · 카드 행 잠금 · 발급 한도 차감 · 알림 실패 무시.
create or replace function public.open_event_card(p_slug text, p_idx int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_c record; v_card record; v_ticket uuid; v_name text; v_quota int; v_vname text;
begin
  if auth.uid() is null then raise exception '로그인 후 참여할 수 있습니다'; end if;

  select * into v_c from public.event_campaigns where slug = p_slug;
  if v_c is null or v_c.status <> 'live' then raise exception '진행 중인 이벤트가 아닙니다'; end if;
  -- 숨긴 판은 관리자에게도 참여를 열지 않는다 — 미리보기는 보는 것까지다.
  if v_c.hidden_at is not null then
    raise exception '지금은 참여할 수 없는 이벤트입니다';
  end if;
  if (v_c.starts_at is not null and now() < v_c.starts_at)
     or (v_c.ends_at is not null and now() >= v_c.ends_at) then
    raise exception '이벤트 기간이 아닙니다';
  end if;

  -- ⚠ 발급 승인은 **참여권·카드를 소모하기 전에** 본다(20260914a). 공개 시점(_event_campaign_problems)에만
  --   보면 공개 뒤 승인을 해제해도 발급이 계속됐다. NULL-safe: 매장 행이 없거나 NULL 이면 false.
  if not coalesce((select v.voucher_issue_approved from public.venues v where v.id = v_c.venue_id), false) then
    raise exception '이 매장은 이용권 발급이 중단된 상태입니다 — 매장에 문의해 주세요';
  end if;

  -- ⚠ 본인인증 게이트는 **카드를 열기 전에** 본다. 열고 나서 발급 단계에서 막으면
  --   참여권과 카드만 사라지고 손님은 아무것도 못 받는다(되돌릴 방법이 없다).
  if public.identity_gate_on() and not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '본인인증을 완료해야 참여할 수 있습니다 — 내 정보 > 보안에서 인증을 마쳐 주세요';
  end if;

  select id into v_ticket from public.event_tickets
   where campaign_id = v_c.id and user_id = auth.uid() and used_at is null
   order by created_at limit 1 for update skip locked;
  if v_ticket is null then
    raise exception '참여권이 없습니다 — 매장 출석 QR을 찍으면 1장 지급됩니다';
  end if;

  select * into v_card from public.event_cards
   where campaign_id = v_c.id and idx = p_idx for update;
  if v_card is null then raise exception '없는 카드입니다'; end if;
  if v_card.opened_at is not null then
    raise exception '이미 열린 카드예요 — 다른 카드를 골라 주세요';
  end if;

  select coalesce(nickname, name) into v_name from public.profiles where id = auth.uid();

  update public.event_cards
     set opened_by = auth.uid(), opened_name = v_name, opened_at = now()
   where campaign_id = v_c.id and idx = p_idx;
  update public.event_tickets set used_idx = p_idx, used_at = now() where id = v_ticket;

  if v_card.voucher_count > 0 then
    select voucher_quota into v_quota from public.venues where id = v_c.venue_id for update;
    if coalesce(v_quota, 0) < v_card.voucher_count then
      raise exception '매장 발급 한도가 부족합니다 — 매장에 문의해 주세요';
    end if;
    update public.venues set voucher_quota = voucher_quota - v_card.voucher_count
     where id = v_c.venue_id;

    insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name,
                                      title, note, expires_at, issue_reason,
                                      event_campaign_id, event_card_idx)
    select v_c.venue_id, v_c.issued_by, auth.uid(), v_name,
           v_c.voucher_title,
           format('%s 당첨 · %s번 카드', v_c.title, p_idx),
           v_c.voucher_expires_at, 'event',
           v_c.id, p_idx
      from generate_series(1, v_card.voucher_count);

    begin
      select name into v_vname from public.venues where id = v_c.venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (auth.uid(), 'system', '🎉 이벤트 당첨!',
              format('%s에서 ''%s'' %s장을 받았어요. 지갑에서 확인하세요',
                     coalesce(v_vname, '매장'), v_c.voucher_title, v_card.voucher_count),
              '🎉', '#FFD100', '/wallet');
    exception when others then null;   -- 알림 실패가 당첨을 되돌리면 안 된다
    end;
  end if;

  return jsonb_build_object('idx', p_idx, 'tier', v_card.tier,
                            'voucherCount', v_card.voucher_count,
                            'voucherTitle', v_c.voucher_title);
end $function$;

revoke all on function public.open_event_card(text, int) from public, anon;
grant execute on function public.open_event_card(text, int) to authenticated, service_role;

-- ── ② admin_grant_voucher_quota — 한도 충전이 승인을 건드리지 않는다 ────────────────
-- 라이브 본문(20260614b:105) 에서 `, voucher_issue_approved = true` 만 뺐다. 승인은 set_voucher_issue_approval 만.
create or replace function public.admin_grant_voucher_quota(p_venue_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare q int;
begin
  if my_role() IS DISTINCT FROM 'admin' then raise exception '운영자만 가능합니다'; end if;
  -- 승인 플래그는 여기서 쓰지 않는다(20260914a) — 충전이 승인 해제를 되돌리던 것.
  update public.venues set voucher_quota = greatest(0, coalesce(voucher_quota,0) + coalesce(p_amount,0))
    where id = p_venue_id returning voucher_quota into q;
  return coalesce(q, 0);
end $function$;

revoke all on function public.admin_grant_voucher_quota(uuid, integer) from public, anon;
grant execute on function public.admin_grant_voucher_quota(uuid, integer) to authenticated, service_role;

-- ── ③ redeem_voucher — 클라이언트 실행권 회수 ─────────────────────────────────────
-- 본문은 그대로 둔다(직원 상환 화면을 만들 때 GRANT 한 줄로 복귀). postgres·service_role 은 남긴다.
-- ⚠ REVOKE 는 FROM PUBLIC 까지 해야 실제로 막힌다(nuri-migration §1).
revoke execute on function public.redeem_voucher(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.redeem_voucher(uuid, uuid) to service_role;

comment on function public.redeem_voucher(uuid, uuid) is
  '업주 측 사용 처리 — can_manage_venue 게이트라 직원까지 실행됐다. 2026-09-14 부터 authenticated 실행 회수(20260914a). 손님 경로는 redeem_my_voucher_by_qr·_by_phone 만.';

-- ── 자가검사 — 세 변경이 실제로 적용됐는지. 아니면 여기서 멈춘다(RAISE NOTICE 는 편집기에서 안 보일 수 있다) ──
-- ⚠ ①② 의 본문 검사는 CREATE OR REPLACE 가 본문을 실제로 바꾸므로 진짜 판별한다.
--   ③ 의 ACL 검사는 첫 적용에서는 판별하지만(라이브 authenticated=t → f), **재실행에서는 자명하게 통과**한다.
--   CREATE OR REPLACE 가 ACL 을 보존하기 때문에, 이 파일에서 REVOKE 줄을 빼도 이미 회수된 라이브에서는 통과한다 —
--   ACL 검사의 음성 대조는 `DROP` 후 적용으로만 가능하다(nuri-migration §1·nuri-verify).
do $check$
declare
  v_src text; v_guard int; v_ticket int; v_keep text;
  v_secdef boolean; v_cfg text[];
begin
  -- ① 승인 가드 존재 · NULL-safe 형태 · 참여권 소모(for update skip locked) **앞**에 위치
  select prosrc, prosecdef, proconfig into v_src, v_secdef, v_cfg
    from pg_proc where oid = 'public.open_event_card(text, integer)'::regprocedure;
  v_guard  := position('coalesce((select v.voucher_issue_approved from public.venues v where v.id = v_c.venue_id), false)' in v_src);
  v_ticket := position('for update skip locked' in v_src);
  if v_guard = 0 then raise exception 'ABORT: ① open_event_card 에 NULL-safe 승인 가드가 없다'; end if;
  if v_ticket = 0 or v_guard > v_ticket then
    raise exception 'ABORT: ① 승인 가드가 참여권 소모 뒤에 있다(가드 %, 잠금 %) — 열고 나서 막으면 참여권만 탄다', v_guard, v_ticket;
  end if;
  -- 보존 불변식 — 기존 계약 테스트(src/api/adminEventOps.migration.test.ts · eventVisibility.test.ts)가 지키는 문구
  foreach v_keep in array array[
    'v_c.hidden_at is not null', 'now() >= v_c.ends_at', 'now() < v_c.starts_at',
    'public.identity_gate_on()', 'is_ci_verified(p.ci_hash, p.verified_at)',
    'voucher_quota - v_card.voucher_count', 'event_campaign_id, event_card_idx', '''event''',
    'exception when others then null'
  ] loop
    if position(v_keep in v_src) = 0 then
      raise exception 'ABORT: ① open_event_card 재정의에서 ''%'' 가 사라졌다', v_keep;
    end if;
  end loop;
  if not v_secdef or v_cfg is null or not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception 'ABORT: ① open_event_card 가 SECURITY DEFINER + search_path=public, pg_temp 가 아니다: %', v_cfg;
  end if;
  if has_function_privilege('anon', 'public.open_event_card(text, integer)', 'execute') then
    raise exception 'ABORT: ① open_event_card 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.open_event_card(text, integer)', 'execute') then
    raise exception 'ABORT: ① open_event_card 가 authenticated 에서 막혔다 — 손님이 카드를 못 연다';
  end if;

  -- ② 자동 재승인 제거 · 관리자 가드 NULL-safe 유지
  select prosrc, prosecdef, proconfig into v_src, v_secdef, v_cfg
    from pg_proc where oid = 'public.admin_grant_voucher_quota(uuid, integer)'::regprocedure;
  if position('voucher_issue_approved' in v_src) > 0 then
    raise exception 'ABORT: ② admin_grant_voucher_quota 가 아직 voucher_issue_approved 를 쓴다';
  end if;
  if position('my_role() IS DISTINCT FROM ''admin''' in v_src) = 0 then
    raise exception 'ABORT: ② admin_grant_voucher_quota 의 관리자 가드가 NULL-safe 가 아니다';
  end if;
  if position('voucher_quota = greatest(0, coalesce(voucher_quota,0) + coalesce(p_amount,0))' in v_src) = 0 then
    raise exception 'ABORT: ② 한도 충전 식이 바뀌었다 — 충전 기능이 달라진다';
  end if;
  if not v_secdef or v_cfg is null or not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception 'ABORT: ② admin_grant_voucher_quota 가 SECURITY DEFINER + search_path 고정이 아니다: %', v_cfg;
  end if;
  if has_function_privilege('anon', 'public.admin_grant_voucher_quota(uuid, integer)', 'execute') then
    raise exception 'ABORT: ② admin_grant_voucher_quota 가 anon 에 열려 있다';
  end if;
  -- 승인을 바꿀 유일한 경로가 살아 있는가(② 로 승인이 영구 잠기지 않게)
  select prosrc into v_src from pg_proc where oid = 'public.set_voucher_issue_approval(uuid, boolean)'::regprocedure;
  if position('voucher_issue_approved = p_approved' in v_src) = 0
     or position('my_role() IS DISTINCT FROM ''admin''' in v_src) = 0 then
    raise exception 'ABORT: set_voucher_issue_approval 이 기대한 형태가 아니다(승인 토글 또는 관리자 가드 없음)';
  end if;

  -- ③ 클라이언트 롤 실행 불가 · service_role 유지 (anon=false 면 PUBLIC GRANT 도 없는 것이다)
  if has_function_privilege('authenticated', 'public.redeem_voucher(uuid, uuid)', 'execute') then
    raise exception 'ABORT: ③ redeem_voucher 가 아직 authenticated 에서 실행된다';
  end if;
  if has_function_privilege('anon', 'public.redeem_voucher(uuid, uuid)', 'execute') then
    raise exception 'ABORT: ③ redeem_voucher 가 anon(=PUBLIC) 에서 실행된다';
  end if;
  if not has_function_privilege('service_role', 'public.redeem_voucher(uuid, uuid)', 'execute') then
    raise exception 'ABORT: ③ redeem_voucher 가 service_role 에서도 막혔다 — 서버 경로 복구 불가';
  end if;
  -- ③ 은 본문을 바꾸지 않았어야 한다(직원 화면 복귀 시 재작성이 없도록)
  select prosrc into v_src from pg_proc where oid = 'public.redeem_voucher(uuid, uuid)'::regprocedure;
  if position('can_manage_venue(p_used_venue_id)' in v_src) = 0 or position('venue_id = p_used_venue_id' in v_src) = 0 then
    raise exception 'ABORT: ③ redeem_voucher 본문이 바뀌었다 — 이 파일은 ACL 만 손대야 한다';
  end if;
end $check$;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- ROLLBACK (역순)
--   ③ grant execute on function public.redeem_voucher(uuid, uuid) to authenticated;
--      comment on function public.redeem_voucher(uuid, uuid) is null;
--   ② admin_grant_voucher_quota 의 update 문에 `, voucher_issue_approved = true` 를 되살린다
--      (= 20260614b:100-110 본문 재실행). REVOKE/GRANT 두 줄 재기재.
--   ① open_event_card 를 20260913123648:1946-2033 본문으로 다시 실행하고 그 파일의 REVOKE/GRANT 두 줄을 다시 쓴다.
--   데이터 변경은 없었으므로 되돌릴 행이 없다.
-- ============================================================================
