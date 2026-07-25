--    단일 트랜잭션으로 돌아야 맨 아래 자기검증 실패 시 DDL 이 통째로 롤백된다.
--
-- 현장 바인(참가) 요청이 '대회 날짜와 무관하게 항상 오늘 장부'로 들어가던 문제의 서버 방어선.
--
-- 왜: request_buyin 은 session_date 를 (now() at time zone 'Asia/Seoul')::date 로 스스로 정한다.
--     손님이 2주 뒤 대회 포스터에서 눌러도 서버는 의심 없이 '오늘' 그 매장 장부에 요청을 넣고
--     성공을 돌려준다. 프런트에서 당일에만 버튼을 띄우도록 고쳤지만(ScheduleDetailModal),
--     캐시된 구버전·복사돼 돌아다니는 QR 링크로 우회될 수 있다. 그래서 '앱이 어느 날짜로 요청하는지'를
--     명시하게 하고 서버가 KST 오늘과 대조한다. null(현장 QR·구버전)이면 검사 생략 — 기존 동작 그대로.
--
-- 왜 '오늘 장부가 열려 있는지'로는 막지 않았나: ledger_sessions 행은 운영자가 장부를 열거나 저장할 때만
--     생기고(2026-07-26 라이브 기준 총 3행, 최신 2026-06-20), approve_buyin_request 는 세션 행 없이도
--     ledger_players 에 넣는다. 손님이 운영자의 장부 오픈보다 먼저 문 앞 QR 을 찍는 게 정상 동선이라,
--     세션 존재를 요구하면 지금 잘 도는 현장 사용이 깨진다.
--
-- 왜 drop+create 인가: 인자를 늘리는 건 create-or-replace 로 안 된다. 대신 ACL 이 초기화되므로 아래에서
--     다시 세운다. 기존 함수엔 PUBLIC/anon EXECUTE 가 남아 있었는데(로그인 전용 RPC 라 무의미한 권한),
--     이참에 check_in 과 같은 수준(authenticated + service_role)으로 조인다.

drop function if exists public.request_buyin(uuid, text, smallint);

create function public.request_buyin(
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
declare v_name text; v_venue text; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  -- 화면이 믿고 있던 날짜와 서버의 오늘(KST)이 다르면 거절.
  -- 왜: 다른 날짜 대회 상세에서 눌린 요청이 오늘 장부에 조용히 섞여 정산·명단을 오염시키기 때문.
  --     null 이면(현장 QR·구버전 클라) 검사하지 않는다 — 현장 동선을 깨지 않기 위한 의도적 관대함.
  if p_expected_date is not null and p_expected_date <> v_today then
    raise exception '현장 참가 신청은 대회 당일에만 보낼 수 있습니다 (대회일 %, 오늘 %)', p_expected_date, v_today;
  end if;
  select name into v_venue from venues where id = p_venue_id;
  if v_venue is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select coalesce(nullif(trim(nickname), ''), nullif(trim(name), ''), '회원') into v_name from profiles where id = auth.uid();
  if exists (select 1 from ledger_buyin_requests where venue_id = p_venue_id and session_date = v_today and user_id = auth.uid() and status = 'pending') then
    update ledger_buyin_requests set requested_game_seq = coalesce(p_game_seq, requested_game_seq), note = coalesce(nullif(trim(p_note), ''), note)
      where venue_id = p_venue_id and session_date = v_today and user_id = auth.uid() and status = 'pending';
    return v_venue;
  end if;
  insert into ledger_buyin_requests (venue_id, session_date, user_id, player_name, note, status, requested_game_seq)
  values (p_venue_id, v_today, auth.uid(), coalesce(v_name, '회원'), nullif(trim(p_note), ''), 'pending', p_game_seq);
  return v_venue;
end; $function$;

-- 새로 CREATE 했으므로 ACL 을 명시적으로 다시 세운다(create-or-replace 가 아니라 보존되지 않음).
revoke all on function public.request_buyin(uuid, text, smallint, date) from public;
revoke all on function public.request_buyin(uuid, text, smallint, date) from anon;
grant execute on function public.request_buyin(uuid, text, smallint, date) to authenticated, service_role;

-- ── 자기검증 ─────────────────────────────────────────────────────────────────
do $$
declare v_cnt int; v_src text;
begin
  -- 1) 오버로드가 남으면 PostgREST 가 인자 조합에 따라 엉뚱한 함수를 고른다 — 정확히 1개여야 한다.
  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_buyin';
  if v_cnt <> 1 then raise exception 'BUYIN ABORT: request_buyin 오버로드 %개 (1개여야 함)', v_cnt; end if;

  -- 2) 시그니처가 기대대로인지(구 3인자 호출도 default 로 흡수되어야 하므로 순서까지 고정)
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'request_buyin'
       and pg_get_function_identity_arguments(p.oid) = 'p_venue_id uuid, p_note text, p_game_seq smallint, p_expected_date date'
  ) then raise exception 'BUYIN ABORT: request_buyin 시그니처가 기대와 다릅니다'; end if;

  -- 3) 날짜 가드가 실제로 본문에 들어갔는지(주석만 남고 코드가 빠지는 사고 방지)
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_buyin';
  if v_src not like '%p_expected_date is not null and p_expected_date <> v_today%' then
    raise exception 'BUYIN ABORT: p_expected_date 가드가 본문에 없습니다';
  end if;
  if v_src not like '%Asia/Seoul%' then
    raise exception 'BUYIN ABORT: KST 기준(v_today) 계산이 사라졌습니다';
  end if;

  -- 4) SECURITY DEFINER + search_path 고정 유지
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'request_buyin'
       and p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
  ) then raise exception 'BUYIN ABORT: SECURITY DEFINER / search_path 설정이 빠졌습니다'; end if;

  -- 5) ACL — anon(및 PUBLIC 상속)은 실행 불가, authenticated 는 실행 가능해야 앱이 돈다.
  if has_function_privilege('anon', 'public.request_buyin(uuid, text, smallint, date)', 'execute') then
    raise exception 'BUYIN ABORT: anon 에 실행권한이 남아있습니다(PUBLIC grant 포함)';
  end if;
  if not has_function_privilege('authenticated', 'public.request_buyin(uuid, text, smallint, date)', 'execute') then
    raise exception 'BUYIN ABORT: authenticated 에 실행권한이 없습니다 — 앱이 전부 실패합니다';
  end if;
  if not has_function_privilege('service_role', 'public.request_buyin(uuid, text, smallint, date)', 'execute') then
    raise exception 'BUYIN ABORT: service_role 실행권한 없음';
  end if;

  raise notice 'BUYIN OK: request_buyin(uuid,text,smallint,date) 1개 · 날짜가드 있음 · anon revoke 완료';
end $$;