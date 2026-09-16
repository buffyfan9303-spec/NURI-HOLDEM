-- ✅ 2026-09-17 라이브 적용 완료 (MCP execute_sql · 4부로 나눠 적용 · 부마다 확인)
--
-- 오너 승인: "라이브 DB 수정 — A(보안 2건) · B(체크인 중복) · C(장부 금액 검증) · D(예약 인증 게이트)" 전부.
-- 전부 `begin; … rollback;` 리허설을 먼저 돌렸고, **음성 대조뿐 아니라 양성 대조**를 같이 넣었다
-- (아무도 통과 못 하는 고장은 음성만으로는 안 잡힌다 — nuri-migration §5).
--
-- 적용 시점 라이브 실측(참고): profiles 6 · venues 3 · schedules 0 · store_vouchers 0 ·
--   checkins 0 · venue_season_results 0 · schedule_reservations 0 · ledger_sessions 1.
--   운영 데이터가 비어 있는 상태라 **기존 행에 미치는 영향이 0** 인 가장 안전한 시점이었다.
--   (2026-09-10 출시 준비 정리로 테스트 데이터가 `_trash_20260910` 스키마로 옮겨져 있다.)

-- ─────────────────────────────────────────────────────────────────────────────
-- A① refund_quote — 게이트가 **0개**인데 authenticated 가 부를 수 있었다
-- ─────────────────────────────────────────────────────────────────────────────
-- 본문에 my_role/auth.uid/raise 가 하나도 없다(20260830n:783). 화면 호출부도 0곳이다.
-- 로그인한 아무나 p_purchase_id 를 1부터 훑어 **타인의 구매 종류·환불 여부·장착 코스메틱**을 읽을 수 있었다.
-- 내부에서 admin_refund_purchase 가 부르더라도 그쪽이 SECURITY DEFINER 라 영향이 없다.
-- 리허설 확인: authenticated=false(음성) · service_role=true(양성).
revoke all on function public.refund_quote(bigint) from public, anon, authenticated;
grant execute on function public.refund_quote(bigint) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A② season_results — 시즌 입상자 **실명**이 비로그인에게 그대로 나갔다
-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-10 에 순위 실명을 서버에서 마스킹했는데(20260910b) 그 마스킹은
-- venue_rankings_public · venue_hall_of_fame · current_season_standings · venues_season_leaders
-- **네 곳에만** 걸렸다. 같은 테이블을 읽는 `season_results` 와 테이블 SELECT 권한은 빠져 있었다.
-- 화면(SeasonPanel)은 옵트인 아니면 '표시만' 안 했을 뿐 응답에는 실려 왔다 — 화면이 유일한 가드였다.
-- 판정기는 순위와 **같은 두 개**를 쓴다(여기서 새로 만들면 또 갈린다).
-- ⚠ 클라이언트는 이 테이블을 직접 읽지 않는다(grep: src/ 에 venue_season_results 0건, RPC 만 사용) —
--   그래서 컬럼 GRANT 를 좁혀도 깨지는 화면이 없다.
create or replace function public.season_results(p_season_id uuid)
returns setof venue_season_results
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select r.season_id, r.rank, r.nickname,
         case when public._can_see_ranking_real_names(s.venue_id)
                or public._ranking_real_name_opted_in(r.nickname)
              then r.real_name else null end,
         r.points, r.prize_man, r.appearances, r.best_position
    from public.venue_season_results r
    join public.venue_seasons s on s.id = r.season_id
   where r.season_id = p_season_id
   order by r.rank;
$fn$;
-- 테이블 직접 SELECT 로도 못 읽게 한다(정책은 `using (true)` 였다). 나머지 컬럼은 그대로 공개.
revoke select on public.venue_season_results from anon, authenticated;
grant select (season_id, rank, nickname, points, prize_man, appearances, best_position)
  on public.venue_season_results to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- B check_in — 동시 호출로 출석·활동점수·단골 방문수가 부풀려졌다
-- ─────────────────────────────────────────────────────────────────────────────
-- 4시간 중복 가드가 `select … limit 1` 후 분기라 READ COMMITTED 에서 병렬 호출이 **전부 통과**했다.
-- 라이브 실측: advisory lock 없음 · checkins 유니크 인덱스 없음(pkey 뿐).
-- `Promise.all(Array(20).fill(() => rpc('check_in')))` 한 줄로 출석 20건 · activity_points +60(정상 +3) ·
-- customer_profiles.visit_count +20 이 만들어졌다. 트랜잭션 잠금 한 줄로 직렬화한다.
-- (참여권 트리거는 이미 같은 방식으로 보호돼 있었다 — 20260915e:208. 그 조리법을 본체에도 적용.)
-- ⚠ 이것은 **동시성**만 닫는다. '매장에 실제로 왔다'는 증명은 여전히 없다(QR 토큰 = 영구 매장 UUID).
--   회전 토큰 도입은 오너 결정 대기 항목이다.
create or replace function public.check_in(p_venue_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_name text; v_recent timestamptz;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_venue_id::text, 0));
  select name into v_name from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  return public._apply_checkin(p_venue_id, auth.uid()) || jsonb_build_object('name', v_name);
end $fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- D 예약 본인인증 — 화면이 **유일한** 가드였다
-- ─────────────────────────────────────────────────────────────────────────────
-- RPC reserve_schedule 은 로그인·종료대회·닉네임중복만 봤고 `verified` 검사가 없었다(grep: 0건).
-- RLS sr_insert 도 `user_id = auth.uid()` 뿐이라 **테이블 직접 INSERT 로 RPC 를 통째로 우회**할 수 있었다.
-- 그래서 RPC 가 아니라 **트리거**에 둔다 — 이용권(_voucher_require_verified)과 같은 조리법이다.
--
-- ⚠ 킬스위치 방향이 이용권과 **반대**인 것에 주의: 이용권은 기능 자체가 비활성이라 OFF 면 막는 것이 맞지만,
--   예약은 인증과 무관하게 살아 있어야 하는 기본 기능이라 OFF 면 **통과**시킨다.
--   (여기서 막으면 인증 기능이 꺼진 동안 아무도 예약을 못 한다.)
-- 적용 시점 스위치 = 'on' 이라 화면(ensureVerified)은 이미 막고 있었다 → 정상 이용자 경험은 **변화 0**,
--   콘솔·REST 우회만 닫힌다. 예약 행도 0건이라 소급 영향이 없다.
-- 리허설 확인: 미인증 계정 차단(음성) · 인증 계정 통과(양성) — 둘 다 실제 계정으로.
create or replace function public._reservation_require_verified()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not public.identity_gate_on() then return new; end if;
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.ci_hash is not null) then
    raise exception '대회 예약은 본인인증 회원만 할 수 있습니다 — 프로필 > 보안에서 본인인증을 완료해 주세요';
  end if;
  return new;
end $fn$;
revoke all on function public._reservation_require_verified() from public, anon, authenticated;

drop trigger if exists trg_reservation_require_verified on public.schedule_reservations;
create trigger trg_reservation_require_verified
  before insert on public.schedule_reservations
  for each row execute function public._reservation_require_verified();

-- ─────────────────────────────────────────────────────────────────────────────
-- C 장부 금액 — approve_buyin_request 에 없던 두 가지 검증
-- ─────────────────────────────────────────────────────────────────────────────
-- C① 세션 행이 없어도 `coalesce(buyin_amount,0)` 가 0 으로 떨어져 **0원 바인이 영구 기록**됐다.
--     대시보드 QR 위젯은 장부를 안 열어도(클락만 켜도) 승인 버튼을 띄우므로 실제로 닿는 경로다.
--     10만 게임이면 승인 1건당 매출 −10만 · 엔트리 0 이고, 나중에 장부를 열어 단가를 넣어도
--     `buyinFinance` 가 저장값 0 을 정본으로 읽어 **되살아나지 않는다.** 기록하기 전에 막는다.
-- C② 분납 갈래는 서버 검증이 **0** 이었다(장부 화면만 합계 일치를 강제했고, 대시보드 분할 팝오버는
--     '합계 = 화면 입력값' 만 봤다). 10만 게임에 4만+4만을 넣으면 8만으로 저장되고, 미수 칸이 없어
--     사라진 2만이 **어디에도 안 남는다.** 장부 화면과 같은 규칙을 서버에도 둔다.
--
-- ⚠ C③(할인 자리번호를 서버가 자동 산정)은 **여기 넣지 않았다.** 그러려면 클락의 현재 레벨 계산을
--   SQL 에 다시 구현해야 하는데, 그건 이번 감사가 잡아낸 "같은 계산이 두 벌" 문제를 서버에 또 만드는 일이다.
--   대신 클라이언트에서 판정기 **하나**를 두 호출부가 공유하도록 고친다(같은 커밋의 discountIndex 정본화).
--
-- 리허설 확인: ① 세션 없음 차단 ② 분납 8만 ≠ 10만 차단 ③ **양성** — 정상 승인이 통과하고
--   기록된 cash_amount 가 정확히 100000 인 것까지 단언.
--
-- 아래 본문은 라이브 `pg_get_functiondef` 원문에 위 두 검증만 더한 것이다(그 외 로직 변경 0).
create or replace function public.approve_buyin_request(p_request_id uuid, p_game_seq smallint DEFAULT 1, p_record_buyin boolean DEFAULT false, p_pay_method text DEFAULT 'cash'::text, p_split boolean DEFAULT false, p_cash integer DEFAULT 0, p_card integer DEFAULT 0, p_transfer integer DEFAULT 0, p_discount_index integer DEFAULT 0)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 set search_path = public, pg_temp
AS $function$
declare
  r ledger_buyin_requests;
  v_sort int; v_entry int;
  v_amt int; v_discounts jsonb;
  v_disc int := 0; v_idx int := 0; v_unit int; v_net int;
  v_pm text := lower(coalesce(p_pay_method, 'cash'));
  v_has_session boolean := false;
  v_sum int;
begin
  select * into r from ledger_buyin_requests where id = p_request_id for update;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb)
    into v_amt, v_discounts
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_has_session := FOUND;
  v_amt := coalesce(v_amt, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  if (p_record_buyin or r.voucher_id is not null) and not v_has_session then
    raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요';
  end if;
  if p_record_buyin and not p_split and v_amt <= 0 then
    raise exception '참가비가 0원입니다 — 장부에서 참가비를 먼저 입력하세요';
  end if;

  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; v_disc := least(v_disc, v_amt); else v_disc := 0; end if;
  end if;

  if p_record_buyin and p_split then
    v_sum := coalesce(p_cash,0) + coalesce(p_card,0) + coalesce(p_transfer,0);
    if v_sum is distinct from greatest(0, v_amt - v_disc) then
      raise exception '분납 합계(%원)가 참가비(%원)와 다릅니다', v_sum, greatest(0, v_amt - v_disc);
    end if;
  end if;

  if not exists (select 1 from ledger_players lp
                  where lp.venue_id = r.venue_id and lp.session_date = r.session_date
                    and lp.game_seq = p_game_seq and lp.name = r.player_name) then
    select coalesce(max(sort_order) + 1, 0) into v_sort
      from ledger_players where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    insert into ledger_players (venue_id, session_date, game_seq, name, sort_order, created_by)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_sort, auth.uid());
  end if;

  if r.voucher_id is not null then
    p_record_buyin := false;
    select coalesce(max(entry_no), 0) + 1 into v_entry
      from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                           and game_seq = p_game_seq and player_name = r.player_name;
    insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid(), r.id);
  end if;

  if p_record_buyin then
    select coalesce(max(entry_no), 0) + 1 into v_entry
      from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                           and game_seq = p_game_seq and player_name = r.player_name;
    if p_split then
      v_pm := case when coalesce(p_card,0) >= coalesce(p_cash,0) and coalesce(p_card,0) >= coalesce(p_transfer,0) and coalesce(p_card,0) > 0 then 'card'
                   when coalesce(p_transfer,0) > coalesce(p_cash,0) and coalesce(p_transfer,0) > 0 then 'transfer'
                   else 'cash' end;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true,
              coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), v_idx, auth.uid(), r.id);
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      v_unit := v_amt;
      v_net  := greatest(0, v_unit - v_disc);
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm,
              case when v_pm = 'cash'     then v_net else 0 end,
              case when v_pm = 'card'     then v_net else 0 end,
              case when v_pm = 'transfer' then v_net else 0 end,
              v_idx, auth.uid(), r.id);
    end if;
  end if;

  update ledger_buyin_requests
     set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id and status = 'pending';
  if not found then raise exception '이미 처리된 요청입니다'; end if;
end;
$function$;

-- ⚠ CREATE OR REPLACE 는 ACL 을 **보존**한다(2026-09-12 격리 컨테이너 실측 — 초기화되는 것은 DROP+재생성이다).
--   그래도 REVOKE/GRANT 를 같이 적는다: 이 파일이 **함수가 없는 DB 에 적용되는 경우** 새로 만들어지고,
--   그때는 PUBLIC 기본 GRANT 가 붙어 anon 까지 실행 가능해지기 때문이다.
--   `from anon` 만으로는 무효 — 반드시 `from public` 을 함께 쓴다.
revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 자가검사 (적용 후 실측값 — 전부 기대대로 나왔다)
-- ─────────────────────────────────────────────────────────────────────────────
--   refund_quote authenticated 실행권 ............ false  (이전 true)
--   venue_season_results.real_name anon SELECT ... false  (이전 true)
--   venue_season_results.nickname  anon SELECT ... true   ← 양성 대조(공개 컬럼은 그대로)
--   season_results 본문에 마스킹 판정기 .......... true
--   check_in 본문에 advisory lock ................ true
--   trg_reservation_require_verified 설치 ........ 1건
--   _reservation_require_verified anon/auth 실행권  false / false
--   approve_buyin_request C①·C② 본문 반영 ........ true / true
--   approve_buyin_request anon/auth 실행권 ....... false / true  ← 운영자는 authenticated 다(내부 can_access_ledger 가 인가)
