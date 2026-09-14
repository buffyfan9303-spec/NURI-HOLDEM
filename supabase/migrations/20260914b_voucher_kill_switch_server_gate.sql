-- ============================================================================
-- 20260914b — 매장이용권 킬스위치를 서버에서도 강제한다 (오너 지시 2026-09-14 "안 한 거 전부" · 독립 검토 perm-boundary-review)
--
-- 무엇이 문제였나 — 라이브 실측 2026-09-14 (PostgreSQL 17.6, list_migrations 최종 20260913132414, 20260914a 미적용)
--   app_settings.identity_voucher_enabled 는 **'off'** 다(오너 지시 2026-08-29 "일단 매장이용권 관련 비활성화").
--   그런데 그 스위치를 보는 곳은 클라이언트뿐이다:
--     · src/api/vouchers.ts assertVoucherOn — issueVoucher · redeemMyVoucherByQr · redeemMyVoucherByPhone 3곳
--     · 화면(지갑·발급 모달)은 identityEnabled() 로 숨김. **EventPage 는 안 숨긴다**(src/components/features/EventPage.tsx:86 → openEventCard).
--   서버는 어디서도 스위치를 안 본다. identity_gate_on() 을 부르는 4곳(_voucher_require_verified · accrue_voucher ·
--   issue_voucher · open_event_card)은 전부 "OFF 면 **본인인증을 요구하지 않는다**" 는 뜻으로만 쓴다(20260829f ③).
--   즉 OFF 상태에서 콘솔·직접 RPC·이벤트 카드 개봉으로는 이용권이 **인증 없이** 만들어지고 소비된다.
--
-- 스위치가 막아야 하는 범위 — 라이브 정의(20260829f 머리말·src/lib/identityFlag.ts·vouchers.ts:3-7)에서 그대로 가져온다
--   "상태를 **만들거나 소비하는** 경로" = store_vouchers **INSERT** + **status → 'used'** 전이.
--   ▸ 막는다: issue_voucher · accrue_voucher(service_role) · open_event_card(당첨 insert) · redeem_my_voucher_by_qr ·
--             redeem_my_voucher_by_phone · redeem_voucher(service_role) · 편집기 직접 INSERT/UPDATE — **어떤 경로든** 트리거 한 곳에서.
--   ▸ 막지 않는다: 읽기(지갑은 사실대로) · 회수(status→revoked) · 삭제 · 복구(_restore_voucher: used→active) ·
--             참여권 지급(_grant_event_tickets, 이용권이 아니다). 사고 대응 중 정리는 가능해야 한다.
--   ▸ 이벤트 카드 개봉은 **통째로** 막는다(참여권·카드 소모 **전**): event_cards 의 경품은 voucher_count(매장이용권)뿐이라
--     이 판은 발급 장치다. 당첨만 막고 꽝을 열리게 두면 손님은 참여권만 태운다. 참여권은 그대로 남아 켜지면 쓴다.
--   ▸ **admin 예외 없음.** 클라 assertVoucherOn 에도 예외가 없고, 스위치 자체가 admin 전용 set_app_setting 으로
--     몇 초면 켜진다. 예외를 두면 identityFlag.ts 가 경고한 '인증은 껐는데 이용권은 발급되는' 조합이 admin 경로로 생긴다
--     (OFF 면 트리거가 본인인증을 안 보므로 미인증 회원에게 발급된다).
--   ▸ identity_gate_on() 과 혼동하지 않는다: 같은 값을 읽지만 **뜻이 둘**이다 — ON 이면 '인증 요구', OFF 면 이제 '이용권 정지'.
--     ON 일 때의 판정은 문자 그대로 종전과 같다(가지 하나만 앞에 붙는다). 자가검사가 그 보존을 확인한다.
--
-- ON 일 때의 구멍 하나 (오너 규칙 2026-09-14 "본인인증이 완료된 사람만 사용" · 라이브 실측)
--   20260829f ③ 의 ON 판정은 `status→used` 를 **holder_user_id 가 있을 때만** 검사한다. 보유자 없이(이름만) 발급된
--   이용권은 홀더가 NULL 이라 사용 전이가 **인증 검사 없이 통과**한다. 그 전이를 만들 수 있는 것은 redeem_voucher
--   (라이브 authenticated 실행 가능 · 20260914a 뒤 service_role) 와 편집기 직접 UPDATE 뿐이고, 손님 경로
--   (_by_qr/_by_phone) 는 `v_holder is null` 을 먼저 거절한다. 홀더를 나중에 채우는 함수는 라이브에 **없다**
--   (prosrc 에 `update store_vouchers … holder_user_id =` 0건) — 이름만 발급된 표는 영원히 무주(無主)다.
--   → ON 이면 **보유자 없는 이용권은 사용할 수 없다**로 닫는다. 발급 자체(매장 보관용)·회수·삭제·복구는 그대로다.
--
-- 어떻게 고치나 — 최소 2곳
--   ① _voucher_require_verified 트리거(BEFORE INSERT OR UPDATE OF holder_user_id, status): OFF 면 INSERT 와 →used 를 raise.
--      ON 이면 →used 에 홀더가 없어도 raise(위 구멍). 홀더가 있으면 종전대로 ci_hash 검사.
--      RPC 마다 가드를 넣지 않는 이유는 20260827f 와 같다 — 어떤 함수를 거치든, 앞으로 생길 경로든 이 문을 지난다.
--      트리거 예외는 호출한 RPC 의 트랜잭션을 통째로 되돌리므로(한도 차감·카드 개봉 포함) 부분 상태가 남지 않는다.
--   ② open_event_card: 참여권·카드 소모 **전** 조기 가드. 트리거만 두면 소모 뒤 insert 에서 막혀 참여권만 탄다.
--      본문 = 20260914a(승인 가드 포함) + 이 가드. **20260914a 가 먼저 적용돼 있어야 한다**(preflight 가 강제).
--
-- ⚠ 적용하면 동작이 바뀐다 — 스위치가 지금 OFF 이므로 이 파일은 실제로 기능을 막는 유일한 마이그레이션이다
--   적용 직후: 이용권 발급(수동·적립·이벤트 당첨)과 사용(QR·전화·업주측)이 서버에서 전부 거절된다.
--   클라는 이미 그 화면을 숨기고 있어 손님·업주가 새로 보는 것은 없다. 예외 하나 — **이벤트 페이지**: 카드를 누르면
--   '매장이용권이 현재 비활성화되어 있습니다' 가 뜬다(라이브 event_campaigns 0행이라 지금은 볼 사람이 없다).
--   운영자가 편집기에서 store_vouchers 를 직접 고칠 때도 INSERT/→used 는 막힌다 — 켜고 하거나
--   `alter table public.store_vouchers disable trigger trg_voucher_verified` 로 잠깐 내리고 다시 올린다.
--   스위치를 ON 으로 켜면(select public.set_app_setting('identity_voucher_enabled','on')) 종전과 100% 같다.
--   데이터 UPDATE 없음 · 기존 행 변경 0 · 멱등(CREATE OR REPLACE + REVOKE/GRANT 재실행 안전).
-- 이 파일에 넣지 않은 것(클라 후속): EventPage 를 identityEnabled() 로 숨기는 것 — 서버가 막으므로 UX 문제일 뿐이다.
-- ============================================================================
begin;

-- ── 전제 확인 — 하나라도 어긋나면 여기서 멈춘다 ──────────────────────────────
do $preflight$
declare v_src text; v_tg text;
begin
  if to_regprocedure('public.identity_gate_on()') is null then
    raise exception 'ABORT: identity_gate_on() 이 없다 — 20260829f 가 적용돼 있지 않다';
  end if;
  if to_regprocedure('public._voucher_require_verified()') is null then
    raise exception 'ABORT: _voucher_require_verified() 가 없다 — 20260827f/20260829f 가 적용돼 있지 않다';
  end if;
  select pg_get_triggerdef(t.oid) into v_tg from pg_trigger t
   where t.tgrelid = 'public.store_vouchers'::regclass and t.tgname = 'trg_voucher_verified' and not t.tgisinternal;
  if v_tg is null or v_tg not ilike '%BEFORE INSERT OR UPDATE OF holder_user_id, status%' then
    raise exception 'ABORT: trg_voucher_verified 가 없거나 이벤트 명세가 다르다: %', coalesce(v_tg, '<none>');
  end if;
  -- 트리거 본문이 20260829f 판(OFF → return new)이거나 이미 이 파일 판이어야 한다. 제3의 판이면 사람이 먼저 본다.
  select prosrc into v_src from pg_proc where oid = 'public._voucher_require_verified()'::regprocedure;
  if position('if not public.identity_gate_on() then return new; end if;' in v_src) = 0
     and position('킬스위치 OFF(20260914b)' in v_src) = 0 then
    raise exception 'ABORT: _voucher_require_verified 라이브 본문이 20260829f 판도 20260914b 판도 아니다 — 먼저 확인하라';
  end if;
  if position('p.ci_hash is not null' in v_src) = 0 then
    raise exception 'ABORT: _voucher_require_verified 에 본인인증 판정이 없다 — 덮어쓰면 무엇을 잃는지 먼저 보라';
  end if;
  -- open_event_card 는 20260914a(승인 가드) 위에 쌓는다. 순서가 뒤집히면 20260914a 의 자가검사가 이 판을 못 본다.
  select prosrc into v_src from pg_proc where oid = 'public.open_event_card(text, integer)'::regprocedure;
  if position('coalesce((select v.voucher_issue_approved from public.venues v where v.id = v_c.venue_id), false)' in v_src) = 0 then
    raise exception 'ABORT: 20260914a 가 적용돼 있지 않다(open_event_card 에 승인 가드 없음) — 20260914a 를 먼저 적용하라';
  end if;
  if position('v_c.hidden_at is not null' in v_src) = 0 or position('now() >= v_c.ends_at' in v_src) = 0 then
    raise exception 'ABORT: open_event_card 라이브 본문이 20260913123648 판이 아니다 — 먼저 확인하라';
  end if;
end $preflight$;

-- ── ① 트리거 — OFF 면 이용권 상태를 만들거나 소비하지 못한다 ───────────────────
-- 20260829f ③ 본문에서 바뀐 것은 맨 앞 가지뿐이다(return new → 만들기/소비 거절). 나머지는 문자 그대로 동일.
create or replace function public._voucher_require_verified() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_gate boolean := false;
begin
  -- 킬스위치 OFF(20260914b): 이용권 상태를 **만들거나(INSERT) 소비(status→used)** 하지 못한다 — 어떤 RPC 를 거치든.
  --   회수(revoked)·복구(used→active)·삭제·읽기는 그대로다. admin 예외 없음(클라 assertVoucherOn 과 같다).
  --   INSERT 에서는 OLD 가 없으므로 앞 조건이 먼저 참이 되어 OLD 를 읽지 않는다.
  if not public.identity_gate_on() then
    if tg_op = 'INSERT' or (new.status = 'used' and old.status is distinct from 'used') then
      raise exception '매장이용권이 현재 비활성화되어 있습니다 — 본인인증 준비가 끝나면 다시 열립니다';
    end if;
    return new;
  end if;
  -- ON: 보유자 없는 이용권은 사용할 수 없다(20260914b) — 홀더가 NULL 이면 아래 인증 판정이 건너뛰어졌다.
  --   INSERT(이름만 발급)·회수·삭제·복구(used→active)는 이 가지에 걸리지 않는다. 손님 경로는 이미 v_holder is null 을 거절한다.
  if tg_op = 'UPDATE' and new.status = 'used' and old.status is distinct from 'used' and new.holder_user_id is null then
    raise exception '보유자가 지정되지 않은 이용권은 사용할 수 없습니다 — 본인인증을 마친 회원 계정으로 발급된 이용권만 사용됩니다';
  end if;
  if tg_op = 'INSERT' then
    v_gate := new.holder_user_id is not null;
  else
    v_gate := (new.holder_user_id is distinct from old.holder_user_id and new.holder_user_id is not null)
           or (new.status = 'used' and old.status is distinct from 'used' and new.holder_user_id is not null);
  end if;
  if v_gate and not exists (
    select 1 from public.profiles p where p.id = new.holder_user_id and p.ci_hash is not null
  ) then
    raise exception '매장이용권은 본인인증 회원만 보유·사용할 수 있습니다 — 프로필 > 보안에서 본인인증을 완료해 주세요';
  end if;
  return new;
end $$;
revoke all on function public._voucher_require_verified() from public, anon, authenticated;
grant execute on function public._voucher_require_verified() to service_role;   -- 종전 ACL 그대로(트리거는 소유자로 돈다)

-- ── ② open_event_card — OFF 면 참여권·카드를 소모하기 전에 거절 ──────────────────
-- 20260914a 본문 그대로 + 킬스위치 가드 한 블록. 나머지 불변식은 그대로다:
-- 숨김 거절 · `>=` 종료 경계 · 발급 승인 가드 · 본인인증 게이트 · 참여권 잠금 · 카드 행 잠금 · 한도 차감 · 알림 실패 무시.
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

  -- ⚠ 킬스위치(20260914b): 매장이용권이 꺼져 있으면 카드를 **열지 않는다** — 참여권·카드 소모 전에 본다.
  --   경품이 매장이용권뿐이라 이 판은 발급 장치다. 당첨만 막고 꽝을 열리게 두면 손님은 참여권만 태운다.
  if not public.identity_gate_on() then
    raise exception '매장이용권이 현재 비활성화되어 있습니다 — 본인인증 준비가 끝나면 다시 열립니다';
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

-- ── 자가검사 — 실패하면 여기서 멈춘다(RAISE NOTICE 는 편집기에서 안 보일 수 있다) ─────────
-- ⚠ ACL 검사는 CREATE OR REPLACE 가 ACL 을 보존하므로 이미 회수된 라이브에서는 REVOKE 줄을 빼도 통과한다 —
--   음성 대조는 DROP 후 적용으로만 가능하다(nuri-migration §1). 본문 검사는 본문이 실제로 바뀌므로 진짜 판별한다.
do $check$
declare
  v_src text; v_tg text; v_keep text; v_secdef boolean; v_cfg text[];
  v_kill int; v_approve int; v_ticket int;
begin
  -- ① 트리거 함수: OFF 가지 존재 · ON 가지(본인인증 판정) 문자 그대로 보존 · SECDEF/search_path · ACL · 트리거 부착
  select prosrc, prosecdef, proconfig into v_src, v_secdef, v_cfg
    from pg_proc where oid = 'public._voucher_require_verified()'::regprocedure;
  if position('킬스위치 OFF(20260914b)' in v_src) = 0
     or position('if tg_op = ''INSERT'' or (new.status = ''used'' and old.status is distinct from ''used'') then' in v_src) = 0 then
    raise exception 'ABORT: ① 트리거에 킬스위치 가지가 없다';
  end if;
  if position('if not public.identity_gate_on() then return new; end if;' in v_src) > 0 then
    raise exception 'ABORT: ① 트리거가 아직 20260829f 판(OFF → 통과)이다';
  end if;
  -- ON 구멍 폐쇄: 보유자 없는 →used 거절 가지가 있어야 한다
  if position('and new.holder_user_id is null then' in v_src) = 0
     or position('보유자가 지정되지 않은 이용권은 사용할 수 없습니다' in v_src) = 0 then
    raise exception 'ABORT: ① 트리거에 보유자 없는 사용 거절 가지가 없다 — 이름만 발급된 표가 인증 없이 사용된다';
  end if;
  -- ON 일 때의 판정은 종전(20260829f ③)과 문자 그대로 같아야 한다 — 이 문구들이 그 본문이다
  foreach v_keep in array array[
    'v_gate := new.holder_user_id is not null;',
    'v_gate := (new.holder_user_id is distinct from old.holder_user_id and new.holder_user_id is not null)',
    'or (new.status = ''used'' and old.status is distinct from ''used'' and new.holder_user_id is not null);',
    'select 1 from public.profiles p where p.id = new.holder_user_id and p.ci_hash is not null',
    '매장이용권은 본인인증 회원만 보유·사용할 수 있습니다'
  ] loop
    if position(v_keep in v_src) = 0 then
      raise exception 'ABORT: ① ON 판정 본문에서 ''%'' 가 사라졌다 — 켜져 있을 때 동작이 달라진다', v_keep;
    end if;
  end loop;
  if not v_secdef or v_cfg is null or not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception 'ABORT: ① _voucher_require_verified 가 SECURITY DEFINER + search_path 고정이 아니다: %', v_cfg;
  end if;
  if has_function_privilege('anon', 'public._voucher_require_verified()', 'execute')
     or has_function_privilege('authenticated', 'public._voucher_require_verified()', 'execute') then
    raise exception 'ABORT: ① 트리거 함수가 클라이언트 롤에 열려 있다';
  end if;
  select pg_get_triggerdef(t.oid) into v_tg from pg_trigger t
   where t.tgrelid = 'public.store_vouchers'::regclass and t.tgname = 'trg_voucher_verified' and not t.tgisinternal;
  if v_tg is null or v_tg not ilike '%BEFORE INSERT OR UPDATE OF holder_user_id, status ON public.store_vouchers%'
     or v_tg not ilike '%_voucher_require_verified()%' then
    raise exception 'ABORT: ① trg_voucher_verified 가 떨어졌거나 명세가 바뀌었다: %', coalesce(v_tg, '<none>');
  end if;

  -- ② open_event_card: 킬 가드 존재 · 승인 가드(20260914a) 보존 · 순서 = 킬 < 승인 < 참여권 잠금 · SECDEF · ACL
  select prosrc, prosecdef, proconfig into v_src, v_secdef, v_cfg
    from pg_proc where oid = 'public.open_event_card(text, integer)'::regprocedure;
  v_kill    := position('킬스위치(20260914b)' in v_src);
  v_approve := position('coalesce((select v.voucher_issue_approved from public.venues v where v.id = v_c.venue_id), false)' in v_src);
  v_ticket  := position('for update skip locked' in v_src);
  if v_kill = 0 then raise exception 'ABORT: ② open_event_card 에 킬스위치 가드가 없다'; end if;
  if v_approve = 0 then raise exception 'ABORT: ② open_event_card 의 20260914a 승인 가드가 사라졌다'; end if;
  if v_ticket = 0 or not (v_kill < v_approve and v_approve < v_ticket) then
    raise exception 'ABORT: ② 가드 순서가 틀렸다(킬 %, 승인 %, 잠금 %) — 소모 뒤에 막으면 참여권만 탄다', v_kill, v_approve, v_ticket;
  end if;
  foreach v_keep in array array[
    'v_c.hidden_at is not null', 'now() >= v_c.ends_at', 'now() < v_c.starts_at',
    'public.identity_gate_on() and not exists', 'is_ci_verified(p.ci_hash, p.verified_at)',
    'voucher_quota - v_card.voucher_count', 'event_campaign_id, event_card_idx', '''event''',
    'exception when others then null'
  ] loop
    if position(v_keep in v_src) = 0 then
      raise exception 'ABORT: ② open_event_card 재정의에서 ''%'' 가 사라졌다', v_keep;
    end if;
  end loop;
  if not v_secdef or v_cfg is null or not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception 'ABORT: ② open_event_card 가 SECURITY DEFINER + search_path 고정이 아니다: %', v_cfg;
  end if;
  if has_function_privilege('anon', 'public.open_event_card(text, integer)', 'execute') then
    raise exception 'ABORT: ② open_event_card 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.open_event_card(text, integer)', 'execute') then
    raise exception 'ABORT: ② open_event_card 가 authenticated 에서 막혔다 — 손님이 카드를 못 연다';
  end if;

  -- 스위치 자체가 살아 있는가 — 켤 방법(set_app_setting, admin) 이 없으면 이 파일은 영구 정지가 된다
  if to_regprocedure('public.set_app_setting(text, text)') is null then
    raise exception 'ABORT: set_app_setting(text, text) 이 없다 — 스위치를 켤 경로가 없으면 적용하지 않는다';
  end if;
end $check$;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- ROLLBACK (역순)
--   ② open_event_card 를 20260914a 본문(승인 가드 포함, 킬 가드 없음)으로 다시 실행하고 REVOKE/GRANT 두 줄 재기재.
--   ① _voucher_require_verified 를 20260829f ③ 본문(OFF → return new · 홀더 없는 →used 통과)으로 다시 실행하고
--      `revoke all ... from public, anon, authenticated; grant execute ... to service_role;` 재기재. 트리거는 그대로다.
--      ⚠ 되돌리면 이름만 발급된 표가 다시 인증 없이 사용될 수 있다(오너 규칙 2026-09-14 위반) — 알고 되돌려라.
--   데이터 변경은 없었으므로 되돌릴 행이 없다.
--   ⚠ "기능만 잠깐 열고 싶다" 면 롤백이 아니라 스위치다: select public.set_app_setting('identity_voucher_enabled','on');
-- ============================================================================
