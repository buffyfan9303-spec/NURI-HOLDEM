-- 20260911i — 일괄 삭제 두 경로에서 이용권이 아직 소실된다 (2026-09-11 장부 점검, 20260911b·c 후속)
--
-- ⚠ 선행: 20260911b(_restore_voucher) · 20260911c(_restore_voucher_for_request + ledger_buyins.request_id).
--   먼저 적용하지 않으면 하단 검증 블록이 스스로 중단시킨다(전체 롤백).
--
-- 근본 원인
--   20260911b 가 요청이 끝나는 세 경로(거절·손님취소·만료)를, 20260911c 가 승인된 바인을 **한 건씩**
--   지우는 두 경로(cancel_ledger_buyin·cancel_my_recent_buyin)를 닫았다.
--   그런데 바인을 **여러 건 한꺼번에** 지우는 두 경로가 그대로 남아 있었다. 둘 다 티켓 바인을 같이 지운다:
--     ① delete_ledger_player  (20260818g:31)  — 플레이어 + 그 세션·게임의 바인 전건
--     ② delete_ledger_session (baseline:2309) — 한 장부(venue·date·game)의 바인 전건
--   지워진 티켓 바인의 request_id 를 아무도 읽지 않아, 이용권은 'used' 에 갇힌 채 영구 소멸한다.
--   (경로를 하나씩 닫는 것으로는 끝나지 않는다는 뜻이라, 검증 블록에 '복원 없이 바인을 지우는 함수가
--    하나라도 있으면 중단'을 넣어 앞으로 생길 경로까지 같은 규칙 아래 둔다.)
--
-- 바꾸는 것
--   두 함수의 바인 delete 를 `returning request_id` 로 바꾸고, **실제로 지워진 행**의 요청에만
--   20260911c 의 _restore_voucher_for_request 를 적용한다. 규칙은 한 벌 — 새 헬퍼를 만들지 않는다.
--   덤으로 두 함수의 fail-open 가드를 NULL-safe 로 바꾼다(`<>` → `is distinct from`,
--   `not can_*()` → `not coalesce(can_*(), false)`). 두 갈래의 실제 효과가 다르므로 나눠 적는다:
--     · can_access_ledger·can_manage_pos 쪽은 **실동작 변화 0** — 20260828d 가 이미 헬퍼 안에서
--       NULL 을 없앴다(can_access_ledger = can_manage_pos(...) or exists(...)). coalesce 는 방어 중복이다.
--     · `my_role() <> 'admin'` → `is distinct from` 은 **동작이 바뀐다**. profiles 행이 없어 role 이 NULL 인
--       로그인 사용자는 지금 취소 비밀번호 없이 바인 있는 플레이어를 지울 수 있다(NULL → IF 를 건너뛴다).
--       앞으로는 비밀번호를 요구한다 — 방향이 fail-closed 고, handle_new_user 가 가입 시 profiles 를
--       만들므로 정상 업주에게는 변화가 없다. anon 은 애초에 EXECUTE 가 없다.
--
-- 일부러 안 바꾸는 것
--   · **승인되어 정상 사용된 이용권은 되살리지 않는다** — 비대칭은 되돌리는(=바인이 지워지는) 쪽에만 둔
--     20260911b 의 설계 그대로다. approve 는 여전히 이용권을 건드리지 않는다.
--   · delete_ledger_session 에 마감(ledger_is_closed) 가드를 넣지 않는다 — 마감된 장부를 지우는 것이
--     이 함수의 용도다. 넣으면 업주가 잘못 만든 마감 장부를 영영 못 지운다(기능 소실).
--   · 남는 요청 행의 status·resolve_note 는 그대로 둔다. 이력이고, 놓는 것은 이용권 소유권뿐이다.
--   · 그 장부의 **대기(pending)** 요청은 손대지 않는다 — 만료 크론(20260911b ④)이 영업일이 지나면
--     지우면서 이용권을 되돌린다. 여기서 같이 지우면 만료 규칙이 두 곳이 된다.
--   · 검증 ④ 를 ledger_buyin_requests 까지 넓히지 않는다 — 20260911b:109 의 expire_old_buyin_requests 는
--     복원을 헬퍼 호출이 아니라 CTE 안 인라인 UPDATE 로 해서 prosrc 에 '_restore_voucher' 가 없다.
--     넓히면 이 마이그레이션이 반드시 ABORT 한다.
--   · store_vouchers 를 직접 지우는 경로는 이 결함이 아니다: delete_voucher(20260829c:70 이 used 를
--     관리자 외에는 막는다)와 매장 삭제(venues 캐스케이드 · kill_venue 화이트리스트)는 이용권 **행 자체**가
--     함께 사라져 되살릴 대상이 없다. venues 캐스케이드는 store_vouchers(baseline:1117)·
--     ledger_buyins(:1084)·ledger_buyin_requests(:1083)를 동시에 지운다 — 고아 'used' 가 남지 않는다
--     (redeem 3경로 모두 used_venue_id = 이용권 자신의 venue_id 라 매장 간 어긋남이 없다: 20260816a·20260829c).
--   · ledger_buyins.request_id 의 on delete set null(20260911c)도 경로가 아니다: 요청을 지우는 두 함수는
--     'pending' 만 지우고, pending 에는 승인된 바인이 없다(approve 는 insert 와 status 전이가 한 트랜잭션이고,
--      먼저 커밋된 취소가 있으면 FK 가 approve 를 되돌린다).
--
-- 데이터 영향: 0 (기존 행을 건드리지 않는다 — 함수 본문 교체뿐).
--   복원 UPDATE 가 store_vouchers 의 두 AFTER UPDATE 트리거를 깨우지만 둘 다 `new.status = 'used'` 로
--   시작해 'used'→'active' 에는 아무 일도 하지 않는다(20260818f:75 · 20260905k:108).
--   이용권 기능은 app_settings identity_voucher_enabled='off' 로 꺼져 있다(20260911c 머리말 실측). 전부 예방이다.
-- 롤백: 파일 하단 '-- ROLLBACK'.

-- ── ① 플레이어 삭제 — 20260818g:31 본문 + 복원 + NULL-safe 가드 ─────────────────
create or replace function public.delete_ledger_player(p_player_id uuid, p_password text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v record; v_hash text; v_cnt int; v_reqs uuid[]; v_req uuid;
begin
  select venue_id, session_date, game_seq, name into v from public.ledger_players where id = p_player_id;
  if v.venue_id is null then return; end if;
  if not coalesce(can_access_ledger(v.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v.venue_id, v.session_date, v.game_seq) then
    raise exception '마감된 장부입니다 — 먼저 마감을 해제하세요';
  end if;
  select count(*) into v_cnt from public.ledger_buyins
   where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq and player_name = v.name;
  -- 돈 기록 삭제는 기존 정책 그대로 취소 비밀번호 검증(비교만 NULL-safe 로: 롤이 NULL 이면 '요구' 쪽으로 닫힌다)
  if v_cnt > 0 and my_role() is distinct from 'admin'::user_role then
    select cancel_password_hash into v_hash from public.venue_pos_settings where venue_id = v.venue_id;
    if v_hash is null then raise exception '취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다'; end if;
    if extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then raise exception '비밀번호가 올바르지 않습니다'; end if;
  end if;
  -- 삭제와 복원을 한 흐름으로 — 실제로 지워진 행의 요청만 되돌린다(20260911c 와 같은 규칙, 헬퍼 재사용)
  --   배열로 받는 이유: `for … in with del as (delete …) select …` 는 커서가 되어
  --   "DECLARE CURSOR must not contain data-modifying statements in WITH" 로 막힌다.
  with del as (
    delete from public.ledger_buyins
     where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq and player_name = v.name
    returning request_id
  )
  select array_agg(distinct d.request_id) into v_reqs from del d where d.request_id is not null;
  foreach v_req in array coalesce(v_reqs, '{}'::uuid[]) loop
    perform public._restore_voucher_for_request(v_req);
  end loop;
  delete from public.ledger_players where id = p_player_id;
end $$;
-- create or replace 는 ACL 을 초기화한다 — 20260818g:57 과 같은 선으로 다시 닫는다
revoke all on function public.delete_ledger_player(uuid, text) from public, anon;
grant execute on function public.delete_ledger_player(uuid, text) to authenticated, service_role;

-- ── ② 장부(세션) 통째 삭제 — baseline:2309 본문 + 복원 ────────────────────────
create or replace function public.delete_ledger_session(p_venue_id uuid, p_date date, p_game_seq smallint default 1)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_reqs uuid[]; v_req uuid;
begin
  if not coalesce(public.can_manage_pos(p_venue_id), false) then
    raise exception 'permission denied: POS 관리 권한이 필요합니다';
  end if;
  with del as (
    delete from public.ledger_buyins
     where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq
    returning request_id
  )
  select array_agg(distinct d.request_id) into v_reqs from del d where d.request_id is not null;
  foreach v_req in array coalesce(v_reqs, '{}'::uuid[]) loop
    perform public._restore_voucher_for_request(v_req);
  end loop;
  delete from public.ledger_players  where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
  delete from public.ledger_sessions where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
end $$;
-- 20260902c 가 세운 선과 동일(PUBLIC 기본 GRANT 를 함께 회수해야 anon 이 실제로 막힌다)
revoke all on function public.delete_ledger_session(uuid, date, smallint) from public, anon;
grant execute on function public.delete_ledger_session(uuid, date, smallint) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 하나라도 어긋나면 전체 롤백 ──────────────────
do $$
declare v_src text; v_bad text;
begin
  -- 선행 마이그레이션이 먼저 적용됐는가
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = '_restore_voucher') then
    raise exception 'ABORT: 20260911b 를 먼저 적용해야 한다(_restore_voucher 없음)';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = '_restore_voucher_for_request') then
    raise exception 'ABORT: 20260911c 를 먼저 적용해야 한다(_restore_voucher_for_request 없음)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ledger_buyins' and column_name = 'request_id') then
    raise exception 'ABORT: 20260911c 를 먼저 적용해야 한다(ledger_buyins.request_id 없음)';
  end if;

  -- ① 플레이어 삭제: 복원 + 기존 가드 보존
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_ledger_player';
  if v_src not like '%returning request_id%' or v_src not like '%_restore_voucher_for_request%' then
    raise exception 'ABORT: delete_ledger_player 에 이용권 복원 없음';
  end if;
  if v_src not like '%cancel_password_hash%' then raise exception 'ABORT: delete_ledger_player 취소 비밀번호 검증이 사라졌다'; end if;
  if v_src not like '%ledger_is_closed%'     then raise exception 'ABORT: delete_ledger_player 마감 가드가 사라졌다'; end if;
  if v_src not like '%is distinct from ''admin''%' then raise exception 'ABORT: delete_ledger_player 권한 비교가 NULL-safe 가 아니다'; end if;

  -- ② 장부 삭제: 복원 + 권한 가드 + 명단·세션까지 계속 지우는가(기능 보존)
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_ledger_session';
  if v_src not like '%returning request_id%' or v_src not like '%_restore_voucher_for_request%' then
    raise exception 'ABORT: delete_ledger_session 에 이용권 복원 없음';
  end if;
  if v_src not like '%can_manage_pos%' then raise exception 'ABORT: delete_ledger_session 권한 가드가 사라졌다'; end if;
  if v_src not like '%ledger_players%' or v_src not like '%ledger_sessions%' then
    raise exception 'ABORT: delete_ledger_session 이 명단·세션을 더 이상 지우지 않는다(기능 소실)';
  end if;

  -- ③ ACL — create or replace 가 초기화한 것을 다시 닫았는가 / 업주는 여전히 쓸 수 있는가
  if has_function_privilege('anon', 'public.delete_ledger_player(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.delete_ledger_session(uuid, date, smallint)', 'execute') then
    raise exception 'ABORT: 삭제 RPC 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_ledger_player(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.delete_ledger_session(uuid, date, smallint)', 'execute') then
    raise exception 'ABORT: 업주가 플레이어·장부를 못 지운다(기능 소실)';
  end if;

  -- ④ 전수 — 이용권 복원 없이 바인을 지우는 함수가 하나라도 남아 있으면 중단
  --   LIKE 대신 strpos: '%_restore_voucher%' 의 `_` 는 LIKE 와일드카드라 의도보다 느슨하다.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ 'delete\s+from\s+(public\.)?ledger_buyins\M'
     and strpos(p.prosrc, '_restore_voucher') = 0;
  if v_bad is not null then
    raise exception 'ABORT: 이용권 복원 없이 바인을 지우는 함수가 남아 있다 — %', v_bad;
  end if;
end $$;

-- ROLLBACK (필요 시 수동 — 되돌리면 이용권 소실이 함께 돌아온다)
--   새로 만든 객체가 없어 drop 할 것은 없다. 두 함수의 본문만 되돌리면 된다.
--   delete_ledger_player  : migrations/20260818g_ledger_atomic_player_ops.sql:31 의 본문으로 교체한 뒤
--                           revoke all … from public, anon; grant execute … to authenticated, service_role; 재적용
--   delete_ledger_session : baseline/2026-07-20-live-snapshot.sql:2309 의 본문으로 같은 절차
