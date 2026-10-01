-- ✅ 2026-10-01 라이브 적용 완료(nuri-lead · Management API database/query 로 이 파일 본문 그대로 한 번에, k→l→m 순). 게이트 통과.
--    적용 후 실측: venue_today_games md5 06400fe7 · anon 실행 false · authenticated true · 본문에 venue_hidden_for_viewer 확인 · 보안 어드바이저 ERROR 0(WARN 290·INFO 16).
--    적용 전 독립 검토: critical-reviewer PASS(store-db-report.md 독립 검토 절).
-- (원래 머리줄) ⏳ 미적용 초안(2026-10-01, 서버 수정 초안 담당 Opus 5.5). 리드 독립 검토 뒤 지시가 있을 때만 적용한다.
--    적용은 이 파일 전체(REHEARSAL 주석 블록 제외)를 **한 번의 execute_sql** 로 — 게이트 raise 가 뒤 문장까지 멈추게.
-- 20261001k — S-07(audit-store-1001) · SEC-04 잔여(review-sec-1001b): 오늘 게임 목록
--
-- 라이브 실측(2026-10-01, 바꾸기 전):
--   · venue_today_games(uuid) md5 afa7e21bf196696917e6f7e5f924152f · ACL {=X,postgres,anon,authenticated,service_role} · VOLATILE · DEFINER
--   · 본문은 ledger_sessions 를 venue_id·영업일로만 거른다 → 숨긴(hidden) 매장의 오늘 게임 제목을 누구에게나 준다.
--   · 화면 호출부는 하나: src/api/ledger.ts:1642 venueTodayGames ← src/App.tsx:1557 startBuyinRequest.
--     비로그인이면 App.tsx:1619-1625 가 의도를 저장하고 로그인 창을 연 뒤 로그인 후 실행한다 → **anon 호출 경로 0**
--     (review-sec-1001b §6 이 '출석 QR 이 anon 으로 부른다'는 옛 근거를 정정함). DB 안의 다른 함수·정책 참조 0.
-- 무엇을 바꾸나:
--   ① 본문에 `and not public.venue_hidden_for_viewer(p_venue_id)` — 20261001h 의 숨김 판정과 같은 선
--      (숨김 = status 'hidden', 대표·관리자·장부 권한자는 계속 본다). 정지·비활성 매장 노출은 20261001h 와 같이 범위 밖.
--   ② anon·PUBLIC 실행 회수, authenticated·service_role 만.
--   반환 타입 그대로 → CREATE OR REPLACE(ACL 보존). 그래도 REVOKE/GRANT 를 명시한다(새로 만들어지는 경우 대비).

do $$
begin
  if (select md5(pg_get_functiondef('public.venue_today_games(uuid)'::regprocedure)))
       is distinct from 'afa7e21bf196696917e6f7e5f924152f' then
    raise exception '20261001k 게이트: venue_today_games 가 초안 작성 때와 다르다';
  end if;
  if (select md5(pg_get_functiondef('public.venue_hidden_for_viewer(uuid)'::regprocedure)))
       is distinct from '88a9bc59252dc7f6e752af70d9ba4741' then
    raise exception '20261001k 게이트: venue_hidden_for_viewer(20261001h) 가 없거나 바뀌었다';
  end if;
end $$;

create or replace function public.venue_today_games(p_venue_id uuid)
 returns table(game_seq smallint, title text)
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- 20261001k: 숨긴 매장은 권한자(대표·관리자·장부 권한자) 외에는 0행. 로그인 후에만 부른다(App.tsx:1557).
  select s.game_seq, coalesce(nullif(trim(s.title), ''), case when s.game_seq = 1 then '메인' else '사이드' || (s.game_seq - 1) end) as title
  from ledger_sessions s
  where s.venue_id = p_venue_id and s.session_date = public.ledger_business_date(p_venue_id)
    and not public.venue_hidden_for_viewer(p_venue_id)
  order by s.game_seq;
$function$;

revoke all on function public.venue_today_games(uuid) from public, anon;
grant execute on function public.venue_today_games(uuid) to authenticated, service_role;

-- 자가검사
do $$
begin
  if pg_get_functiondef('public.venue_today_games(uuid)'::regprocedure) !~ 'not public\.venue_hidden_for_viewer\(p_venue_id\)' then
    raise exception '20261001k: 숨김 판정이 본문에 없다';
  end if;
  if has_function_privilege('anon', 'public.venue_today_games(uuid)', 'execute') then
    raise exception '20261001k: anon 이 아직 실행할 수 있다(PUBLIC 회수 누락?)';
  end if;
  if not has_function_privilege('authenticated', 'public.venue_today_games(uuid)', 'execute') then
    raise exception '20261001k: 로그인 손님이 못 부른다 — 바인 요청 게임 선택이 깨진다';
  end if;
  if pg_get_functiondef('public.venue_today_games(uuid)'::regprocedure) !~ 'search_path TO ''public'', ''pg_temp''' then
    raise exception '20261001k: search_path 고정 누락';
  end if;
end $$;

/* ── REHEARSAL — 운영 DB 에서 `<이 파일 본문>` + 아래 블록을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정(2026-10-01 조회): OWNER 7e435684(venue_owner·승인·매장 R 대표) · ADMIN f5d305f2(소유 0) · USER 708de904(user, 소유·소속 0)
   매장 R = f35b42d1-2d54-4905-95c1-1fda24e0f178. 오늘 세션이 없을 수 있어 트랜잭션 안에서 1행을 만든다.
-- ▼REHEARSAL
do $$
declare
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_admin uuid := 'f5d305f2-0f30-4d61-91ce-51f3332e5193';
  c_user  uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_r uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  n int; ok_anon boolean := false;
begin
  if not exists (select 1 from public.ledger_sessions where venue_id = c_r and session_date = public.ledger_business_date(c_r)) then
    insert into public.ledger_sessions(venue_id, session_date, game_seq, title)
    values (c_r, public.ledger_business_date(c_r), 1, '리허설');
  end if;

  -- 양성 0: 숨기기 전 회원은 본다
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.venue_today_games(c_r);
  execute 'reset role';
  if n = 0 then raise exception 'FAIL: 준비 — 숨기기 전 회원이 0행'; end if;

  -- 음성 1: 비로그인 실행 거부
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform * from public.venue_today_games(c_r);
  exception when insufficient_privilege then ok_anon := true; end;
  execute 'reset role';
  if not ok_anon then raise exception 'FAIL: 비로그인이 아직 부른다'; end if;

  update public.venues set status = 'hidden' where id = c_r;

  -- 음성 2: 숨긴 뒤 다른 회원 0행
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.venue_today_games(c_r);
  execute 'reset role';
  if n <> 0 then raise exception 'FAIL: 숨긴 매장 게임이 다른 회원에게 보인다(%)', n; end if;

  -- 양성 1·2: 대표·관리자는 여전히 본다
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.venue_today_games(c_r);
  execute 'reset role';
  if n = 0 then raise exception 'FAIL: 대표가 자기 숨긴 매장 게임을 못 본다'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.venue_today_games(c_r);
  execute 'reset role';
  if n = 0 then raise exception 'FAIL: 관리자가 숨긴 매장 게임을 못 본다'; end if;

  raise exception 'REHEARSAL_OK 20261001k';
end $$;
*/
