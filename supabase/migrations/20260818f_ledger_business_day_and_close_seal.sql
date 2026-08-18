-- 장부 심층 감사(2026-08-18, 22건 확정) 서버 정비 1차 — 영업일 통일 + 마감 봉인.
-- (라이브 적용: ledger_business_day_and_close_seal)
--
-- 근본 원인 두 갈래:
--  [A] '영업일' 개념 부재 — 장부는 전날 날짜로 새벽까지 돌지만 QR 바인요청·이용권 사용·게임 목록·
--      만료 크론이 전부 'KST 오늘'(또는 UTC 오늘!)을 봐서, 자정을 넘는 순간 요청이 운영자 화면에
--      영영 안 뜨는 블랙홀이 생겼다(새벽 리바인 러시에서 QR 접수 라인 전멸).
--  [B] 마감(closed) 봉인 비대칭 — RLS 는 바인만 잠그고 세션 설정·명단은 안 잠갔으며, SECURITY
--      DEFINER RPC(승인·취소)는 그 잠금마저 우회했다. 마감 스냅샷이 파생 계산이라 세션 단가를
--      고치면 정산 확정 수치가 소급 변형됐다.

-- ── [A-0] 영업일 헬퍼 — 그 매장의 '지금 진행 중인 장부 날짜'(오늘 또는 어제), 없으면 KST 오늘 ──
create or replace function public.ledger_business_date(p_venue_id uuid)
returns date
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select max(session_date) from public.ledger_sessions
      where venue_id = p_venue_id and closed = false
        and session_date between (now() at time zone 'Asia/Seoul')::date - 1
                             and (now() at time zone 'Asia/Seoul')::date),
    (now() at time zone 'Asia/Seoul')::date);
$function$;
revoke all on function public.ledger_business_date(uuid) from public, anon;
grant execute on function public.ledger_business_date(uuid) to authenticated, service_role;

-- ── [A-1] request_buyin — 요청을 영업일 장부에 귀속(자정 넘김 블랙홀 소멸) ──
create or replace function public.request_buyin(
  p_venue_id uuid,
  p_note text default null,
  p_game_seq smallint default null,
  p_expected_date date default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_name text; v_venue text;
        v_kst date := (now() at time zone 'Asia/Seoul')::date;
        v_biz date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  v_biz := public.ledger_business_date(p_venue_id);
  -- 날짜 가드: 화면이 믿는 날짜가 'KST 오늘'도 '진행 중 영업일(어제일 수 있음)'도 아니면 거절.
  -- 자정 넘긴 토너에서 어제 날짜 포스터의 요청이 정당하게 통과하도록 v_biz 를 함께 인정한다.
  if p_expected_date is not null and p_expected_date <> v_kst and p_expected_date <> v_biz then
    raise exception '현장 참가 신청은 대회 당일에만 보낼 수 있습니다 (대회일 %, 오늘 %)', p_expected_date, v_kst;
  end if;
  select name into v_venue from venues where id = p_venue_id;
  if v_venue is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select coalesce(nullif(trim(nickname), ''), nullif(trim(name), ''), '회원') into v_name from profiles where id = auth.uid();
  if exists (select 1 from ledger_buyin_requests where venue_id = p_venue_id and session_date = v_biz and user_id = auth.uid() and status = 'pending') then
    update ledger_buyin_requests set requested_game_seq = coalesce(p_game_seq, requested_game_seq), note = coalesce(nullif(trim(p_note), ''), note)
      where venue_id = p_venue_id and session_date = v_biz and user_id = auth.uid() and status = 'pending';
    return v_venue;
  end if;
  insert into ledger_buyin_requests (venue_id, session_date, user_id, player_name, note, status, requested_game_seq)
  values (p_venue_id, v_biz, auth.uid(), coalesce(v_name, '회원'), nullif(trim(p_note), ''), 'pending', p_game_seq);
  return v_venue;
end; $function$;

-- ── [A-2] 이용권 사용 → 장부 요청 — 영업일 귀속 + '거절 후 재사용 소멸' 루프 수복 ──
-- 기존 dedup(not exists voucher_id=new.id)이 rejected 행에도 걸려, 거절→복원→재사용 시
-- 새 요청이 안 생기는데 이용권만 used 로 소진되는 자산 증발이 있었다(라이브 확정).
create or replace function public.voucher_redeem_to_ledger_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.used_venue_id is not null then
    insert into public.ledger_buyin_requests(venue_id, session_date, user_id, player_name, note, status, voucher_id)
    select
      new.used_venue_id,
      public.ledger_business_date(new.used_venue_id),
      new.holder_user_id,
      coalesce(nullif(btrim(new.holder_name), ''), '이용권 사용자'),
      '🎟 이용권 사용 — ' || coalesce(nullif(btrim(new.title), ''), '매장이용권') || ' · 수량/현금 확인 후 승인',
      'pending',
      new.id
    where not exists (
      select 1 from public.ledger_buyin_requests
      where voucher_id = new.id and status <> 'rejected'  -- 거절 행은 재사용을 막지 않는다
    );
  end if;
  return new;
end; $function$;

-- 부분 유니크도 동일 원리로 재생성(거절 행이 새 요청 삽입을 막지 않게)
drop index if exists uniq_ledger_req_voucher;
create unique index uniq_ledger_req_voucher on public.ledger_buyin_requests (voucher_id)
  where voucher_id is not null and status <> 'rejected';

-- ── [A-3] venue_today_games — UTC current_date 였던 것을 영업일로 통일 ──
create or replace function public.venue_today_games(p_venue_id uuid)
returns table(game_seq smallint, title text)
language sql
security definer
set search_path to 'public'
as $function$
  select s.game_seq, coalesce(nullif(trim(s.title), ''), case when s.game_seq = 1 then '메인' else '사이드' || (s.game_seq - 1) end) as title
  from ledger_sessions s
  where s.venue_id = p_venue_id and s.session_date = public.ledger_business_date(p_venue_id)
  order by s.game_seq;
$function$;

-- ── [A-4] 만료 크론 — 진행 중(미마감) 영업일의 대기 요청은 삭제하지 않는다 + 정오로 이동 ──
create or replace function public.expire_old_buyin_requests()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  -- 어제 날짜라도 그 장부가 아직 열려 있으면(새벽 운영) 살아 있는 대기열이다.
  insert into notifications (user_id, type, title, message, read)
  select r.user_id, 'system', '⏳ 바인 요청 마감', '보내신 참가(바인) 요청이 자동 마감되었습니다. 필요하면 매장에서 다시 요청해 주세요.', false
  from ledger_buyin_requests r
  where r.status = 'pending' and r.user_id is not null
    and (r.session_date < v_today - 1
      or (r.session_date < v_today and not exists (
        select 1 from ledger_sessions ls
        where ls.venue_id = r.venue_id and ls.session_date = r.session_date and ls.closed = false)));
  delete from ledger_buyin_requests r
  where r.status = 'pending'
    and (r.session_date < v_today - 1
      or (r.session_date < v_today and not exists (
        select 1 from ledger_sessions ls
        where ls.venue_id = r.venue_id and ls.session_date = r.session_date and ls.closed = false)));
  get diagnostics n = row_count;
  return n;
end; $function$;
do $$ begin
  perform cron.unschedule('expire-buyin-requests');
exception when others then null; end $$;
select cron.schedule('expire-buyin-requests', '0 3 * * *', $$select public.expire_old_buyin_requests()$$); -- 정오 KST(00:30 새벽 삭제 사고 방지)

-- ── [B-1] 마감 봉인 트리거 — closed 변경은 업주만, 마감 행은 메모 외 수정 금지 ──
create or replace function public._guard_ledger_session_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.closed is distinct from old.closed then
    if not coalesce(public.can_manage_pos(old.venue_id), false) then
      raise exception '마감 상태 변경은 업주만 가능합니다';
    end if;
  elsif old.closed = true then
    -- 마감 유지 상태의 수정: 메모·타임스탬프 외에는 거부(수정하려면 마감 해제 먼저 — UI 동선과 일치).
    -- 단가·할인은 buyinFinance 가 참조 계산하므로 이 봉인이 곧 '정산 확정 수치의 소급 변형 방지'다.
    if (to_jsonb(new) - 'close_memo' - 'closed_at' - 'updated_at' - 'clock_snapshot')
       is distinct from (to_jsonb(old) - 'close_memo' - 'closed_at' - 'updated_at' - 'clock_snapshot') then
      raise exception '마감된 장부는 수정할 수 없습니다 — 먼저 마감을 해제하세요';
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_guard_ledger_session_update on public.ledger_sessions;
create trigger trg_guard_ledger_session_update
  before update on public.ledger_sessions
  for each row execute function public._guard_ledger_session_update();

-- ── [B-2] 명단(ledger_players)도 마감 봉인 — 바인(lb_*)과 동일 수준으로 ──
alter policy lp_insert on public.ledger_players
  with check (can_access_ledger(venue_id) and not ledger_is_closed(venue_id, session_date, game_seq));
alter policy lp_update on public.ledger_players
  using (can_access_ledger(venue_id) and not ledger_is_closed(venue_id, session_date, game_seq));
alter policy lp_delete on public.ledger_players
  using (can_access_ledger(venue_id) and not ledger_is_closed(venue_id, session_date, game_seq));

-- ── [B-3] approve_buyin_request — 마감 가드 + 이용권 승인 시 티켓 바인 자동 기록 ──
-- (유료 매출 0 유지·엔트리/티켓 회수 정합 — '바인 기록됐다'는 UI 안내와 실제가 일치하게 된다)
create or replace function public.approve_buyin_request(p_request_id uuid, p_game_seq smallint DEFAULT 1, p_record_buyin boolean DEFAULT false, p_pay_method text DEFAULT 'cash'::text, p_split boolean DEFAULT false, p_cash integer DEFAULT 0, p_card integer DEFAULT 0, p_transfer integer DEFAULT 0)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r ledger_buyin_requests; v_sort int; v_amt int; v_entry int; v_pm text := lower(coalesce(p_pay_method, 'cash'));
begin
  select * into r from ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not can_access_ledger(r.venue_id) then raise exception '권한이 없습니다'; end if;
  if r.status <> 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;
  if not exists (select 1 from ledger_players lp where lp.venue_id = r.venue_id and lp.session_date = r.session_date and lp.game_seq = p_game_seq and lp.name = r.player_name) then
    select coalesce(max(sort_order) + 1, 0) into v_sort from ledger_players where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    insert into ledger_players (venue_id, session_date, game_seq, name, sort_order, created_by) values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_sort, auth.uid());
  end if;
  if r.voucher_id is not null then
    -- 이용권 = 무료입장: 유료 바인은 버리되, '티켓 완납' 1건을 자동 기록해
    -- 엔트리·티켓 회수·클락 통계가 실제와 일치하게 한다(예전엔 아무것도 안 남았다).
    p_record_buyin := false;
    select coalesce(max(entry_no), 0) + 1 into v_entry from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq and player_name = r.player_name;
    insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, created_by)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', auth.uid());
  end if;
  if p_record_buyin then
    select coalesce(buyin_amount, 0) into v_amt from ledger_sessions where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    select coalesce(max(entry_no), 0) + 1 into v_entry from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq and player_name = r.player_name;
    if p_split then
      v_pm := case when coalesce(p_card,0) >= coalesce(p_cash,0) and coalesce(p_card,0) >= coalesce(p_transfer,0) and coalesce(p_card,0) > 0 then 'card'
                   when coalesce(p_transfer,0) > coalesce(p_cash,0) and coalesce(p_transfer,0) > 0 then 'transfer' else 'cash' end;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split, cash_amount, card_amount, transfer_amount, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true, coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), auth.uid());
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, cash_amount, card_amount, transfer_amount, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm,
              case when v_pm = 'cash' then coalesce(v_amt, 0) else 0 end,
              case when v_pm = 'card' then coalesce(v_amt, 0) else 0 end,
              case when v_pm = 'transfer' then coalesce(v_amt, 0) else 0 end, auth.uid());
    end if;
  end if;
  update ledger_buyin_requests set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid() where id = p_request_id;
end; $function$;

-- ── [B-4] cancel_ledger_buyin — 마감 가드(정산 확정 후 바인 삭제 차단) ──
create or replace function public.cancel_ledger_buyin(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_venue uuid; v_date date; v_game smallint; v_hash text;
begin
  select venue_id, session_date, game_seq into v_venue, v_date, v_game from public.ledger_buyins where id = p_id;
  if v_venue is null then return; end if;
  if not can_access_ledger(v_venue) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v_venue, v_date, v_game) then
    raise exception '마감된 장부의 바인은 취소할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  if my_role() <> 'admin'::user_role then
    select cancel_password_hash into v_hash from public.venue_pos_settings where venue_id = v_venue;
    if v_hash is null then raise exception '취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다'; end if;
    if extensions.crypt(coalesce(p_password,''), v_hash) <> v_hash then raise exception '비밀번호가 올바르지 않습니다'; end if;
  end if;
  delete from public.ledger_buyins where id = p_id;
end; $function$;

-- ── [B-5] self-undo — 본인이 '방금(90초)' 기록한 바인은 비밀번호 없이 되돌리기 ──
-- 하룻밤 100회+ 최빈 조작의 오입력 복구 경로. created_by=본인 + 90초 창이라 통제 약화 없음.
create or replace function public.cancel_my_recent_buyin(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v record;
begin
  select venue_id, session_date, game_seq, created_by, buyin_at into v from public.ledger_buyins where id = p_id;
  if v.venue_id is null then return; end if;
  if not can_access_ledger(v.venue_id) then raise exception '권한이 없습니다'; end if;
  if v.created_by is distinct from auth.uid() or v.buyin_at < now() - interval '90 seconds' then
    raise exception '직접 기록한 바인만 90초 안에 되돌릴 수 있습니다 — 이후엔 취소 비밀번호를 이용하세요';
  end if;
  if public.ledger_is_closed(v.venue_id, v.session_date, v.game_seq) then
    raise exception '마감된 장부입니다';
  end if;
  delete from public.ledger_buyins where id = p_id;
end; $function$;
revoke all on function public.cancel_my_recent_buyin(uuid) from public, anon;
grant execute on function public.cancel_my_recent_buyin(uuid) to authenticated, service_role;

-- ── [B-6] accrue_voucher — 장부 합성 표기 '실명(닉네임)'도 회원 지갑에 적립되게 파싱 ──
create or replace function public.accrue_voucher(p_venue_id uuid, p_player_name text, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int; v_uid uuid; v_name text; v_quota int; v_vname text; v_nick text; v_real text;
begin
  if not can_access_ledger(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 적립할 수 있습니다';
  end if;
  v_name := btrim(coalesce(p_player_name, ''));
  if v_name = '' then return 0; end if;
  -- 장부의 '실명(닉네임)' 합성 표기 분해 — 그대로 매칭하면 회원 지갑에 못 가고 쿼터만 소각됐다
  v_nick := btrim(coalesce((regexp_match(v_name, '^.*\((.+)\)$'))[1], ''));
  v_real := btrim(coalesce((regexp_match(v_name, '^(.*)\(.+\)$'))[1], ''));
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  if my_role() <> 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족해 적립하지 못했습니다 (잔여 %개 · 필요 %개) — 이용권 관리에서 충전을 요청해 주세요', coalesce(v_quota, 0), v_count;
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  select p.id into v_uid from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and (lower(btrim(p.nickname)) = lower(v_name)
       or (v_nick <> '' and lower(btrim(p.nickname)) = lower(v_nick))
       or btrim(p.real_name) = v_name
       or (v_real <> '' and btrim(p.real_name) = v_real)
       or btrim(p.name) = v_name)
   order by (lower(btrim(p.nickname)) = lower(case when v_nick <> '' then v_nick else v_name end)) desc
   limit 1;
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title)
  select p_venue_id, auth.uid(), v_uid, v_name, '적립 이용권'
  from generate_series(1, v_count);
  if v_uid is not null then
    begin
      select name into v_vname from public.venues where id = p_venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (v_uid, 'system', '🎟 적립 이용권 도착!',
              format('%s 방문 적립으로 이용권 %s장을 받았어요. 지갑에서 확인하세요', coalesce(v_vname, '매장'), v_count),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
  return v_count;
end; $function$;

-- ── 자기검증 — 실패 시 전체 롤백 ────────────────────────────────────────────
do $$
declare v_src text;
begin
  -- 영업일 헬퍼 배선 확인
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='request_buyin';
  if v_src not like '%ledger_business_date%' then raise exception 'ABORT: request_buyin 영업일 미배선'; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='voucher_redeem_to_ledger_request';
  if v_src not like '%ledger_business_date%' or v_src not like '%status <> ''rejected''%' then raise exception 'ABORT: 이용권 트리거 미배선'; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='venue_today_games';
  if v_src like '%current_date%' then raise exception 'ABORT: venue_today_games 가 여전히 UTC current_date'; end if;
  -- 마감 봉인 확인
  if not exists (select 1 from pg_trigger where tgname='trg_guard_ledger_session_update') then raise exception 'ABORT: 세션 봉인 트리거 없음'; end if;
  if not exists (select 1 from pg_policy where polrelid='public.ledger_players'::regclass and polname='lp_insert'
                   and pg_get_expr(polwithcheck, polrelid) like '%ledger_is_closed%') then raise exception 'ABORT: lp_insert 봉인 누락'; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_buyin_request';
  if v_src not like '%ledger_is_closed%' or v_src not like '%''ticket''%' then raise exception 'ABORT: approve 마감가드/티켓 기록 누락'; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cancel_ledger_buyin';
  if v_src not like '%ledger_is_closed%' then raise exception 'ABORT: cancel 마감가드 누락'; end if;
  -- 부분 유니크 재생성 확인
  if not exists (select 1 from pg_indexes where indexname='uniq_ledger_req_voucher' and indexdef like '%status <> ''rejected''%') then
    raise exception 'ABORT: voucher 부분유니크 미갱신'; end if;
  -- self-undo ACL
  if has_function_privilege('anon', 'public.cancel_my_recent_buyin(uuid)', 'execute') then raise exception 'ABORT: self-undo anon 실행권한'; end if;
  raise notice 'LEDGER SEAL OK: 영업일 배선 4곳 · 마감 봉인 4곳 · 이용권 루프 수복 · self-undo';
end $$;
