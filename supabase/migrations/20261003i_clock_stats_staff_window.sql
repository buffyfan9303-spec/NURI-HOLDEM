-- ⏳ 적용 전 — 리드 적용 예정. 라이브 미적용. (store-team 2026-10-03 · critical-reviewer recheck1 R1 초안 + 자가검사·화면 연동)
-- 선행: 20261003h(lb_select v4) 와 같은 창 정의. h 보다 먼저 적용해도 해롭지 않다(그때는 직원이 행을 다 읽으므로 새 노출이 없다).
-- 화면: TournamentClock '장부 연동' 목록이 직원에게 창 밖 지난 마감 장부를 빼고(staffSeesSession), 서버 거절 문장은 그대로 보인다(ledgerErrorText).
-- 리허설: Documents/누리홀덤_영상분석_0930/recheck1-sec-fix-1003 — node rehearse.mjs 00_harness.sql <이 파일> 60_clock_window_check.sql
-- 초안(미적용) 20261003i_clock_stats_staff_window — 요구 키 recheck1-security-1003.md#R1 · 작성 critical-reviewer 2026-10-03 · 적용 판단은 리드
-- 무엇: 20261003h 가 직원의 ledger_buyins 읽기를 좁혔지만(Q3), 클락 트리거 _clock_states_ledger_stats(DEFINER)는 전체 행으로
--   live_stats.ledger(totalBuyins·entries·rebuys·addons·earlies) + buyInAmount 를 계산해 clock_states 에 싣고, 직원은 clock_states 를
--   읽고(clock_states_public_read) 쓸 수 있다(clock_states_ins/upd = can_access_ledger). → 직원이 클락의 session_date 를 지난 마감 날짜로
--   바꾸면 그 게임의 '날짜별 바인 수 × 단가' 가 그대로 나온다. 리드 F2 결정(ledger_buyin_counts 삭제)이 막으려던 것과 같은 값이다.
-- 고침: 직원(클라이언트 역할 · can_manage_pos 아님)이 lb_select 직원 창 밖의 마감 게임으로 클락을 **새로 연결**(INSERT·session_date 변경)하면 42501.
--   이미 업주가 연결해 둔 옛 게임 클락을 직원이 조작(설정·레벨·live_stats)할 때는 막지 않고 저장된 몫을 그대로 둔다(새 계산 없음 = 새 노출 없음).
--   업주·공동운영자·관리자·서버 경로(service_role·크론)는 종전 그대로.
-- 창 정의는 lb_select(20261003h v4)와 같다: 미마감 · 마감 18시간 이내이면서 KST 어제 이후 · 세션 날짜 ≥ KST 오늘 또는 ≥ ledger_business_date.
-- 출발점(라이브 2026-10-03): _clock_states_ledger_stats prosrc md5 9d8edcc117a8e65fb549a7592f6242f5 · ACL anon·authenticated 실행권 없음.
-- 리허설: node rehearse.mjs 00_harness.sql 20261003i_clock_stats_staff_window.draft.sql 60_clock_window_check.sql
--   음성 대조: 이 초안 없이 같은 시험 → R1 에서 CHECK FAIL.
do $pre$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public._clock_states_ledger_stats()'::regprocedure) is distinct from '9d8edcc117a8e65fb549a7592f6242f5' then
    raise exception '표류: 라이브 _clock_states_ledger_stats 본문이 초안 작성 때와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
end $pre$;

create or replace function public._clock_states_ledger_stats()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_sess jsonb; v_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  if new.session_date is null then
    return new;
  end if;
  select to_jsonb(s) into v_sess
    from public.ledger_sessions s
   where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq;
  -- 20261003i: 직원 창 밖 마감 게임 — lb_select 와 같은 경계
  if coalesce((v_sess ->> 'closed')::boolean, false)
     and not ((v_sess ->> 'closed_at')::timestamptz > now() - interval '18 hours' and new.session_date >= v_kst - 1)
     and new.session_date < v_kst
     and new.session_date < public.ledger_business_date(new.venue_id)
     and ( coalesce(current_setting('role', true), '') in ('authenticated', 'anon')
           or coalesce(auth.role(), '') in ('authenticated', 'anon') )
     and not coalesce(public.can_manage_pos(new.venue_id), false) then
    if tg_op = 'UPDATE' and old.session_date is not distinct from new.session_date then
      -- 업주가 연결해 둔 옛 게임: 새로 계산하지 않고 저장된 몫을 유지(클라이언트가 보낸 live_stats.ledger 도 덮는다)
      new.live_stats := coalesce(new.live_stats, '{}'::jsonb)
        || jsonb_build_object('ledger', old.live_stats -> 'ledger', 'buyInAmount', old.live_stats -> 'buyInAmount');
      return new;
    end if;
    raise exception '마감된 지난 장부에는 업주만 클락을 연결할 수 있습니다' using errcode = '42501';
  end if;
  new.live_stats := coalesce(new.live_stats, '{}'::jsonb) || jsonb_build_object(
    'ledger', public._clock_ledger_part(
      (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.ledger_buyins b
        where b.venue_id = new.venue_id and b.session_date = new.session_date and b.game_seq = new.game_seq),
      v_sess, new.config),
    'buyInAmount', coalesce((v_sess ->> 'buyin_amount')::integer, 0)
  );
  return new;
end $function$;
revoke all on function public._clock_states_ledger_stats() from public, anon, authenticated;
grant execute on function public._clock_states_ledger_stats() to service_role;

do $check$
declare f record;
begin
  select p.oid, p.prosecdef, p.proconfig, md5(p.prosrc) m into f from pg_proc p where p.oid = 'public._clock_states_ledger_stats()'::regprocedure;
  if not f.prosecdef or not (f.proconfig @> array['search_path=public, pg_temp']) then raise exception '20261003i: DEFINER·search_path 고정이 아니다'; end if;
  if has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then
    raise exception '20261003i: 트리거 함수를 anon·authenticated 가 실행할 수 있다';
  end if;
  if f.m = '9d8edcc117a8e65fb549a7592f6242f5' then raise exception '20261003i: 본문이 바뀌지 않았다'; end if;
  if position('업주만 클락을 연결' in (select prosrc from pg_proc where oid = f.oid)) = 0 then raise exception '20261003i: 직원 창 검사가 없다'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.clock_states'::regclass and tgname = 'trg_clock_states_ledger_stats' and tgenabled <> 'D') then
    raise exception '20261003i: 클락 몫 트리거가 없다(꺼져 있다)';
  end if;
end $check$;
