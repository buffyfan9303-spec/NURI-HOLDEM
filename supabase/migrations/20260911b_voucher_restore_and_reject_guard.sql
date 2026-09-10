-- 20260911b — 이용권이 거절·취소·만료로 증발하던 것 + 거절 함수의 상태 가드 (2026-09-11 장부 점검)
--
-- 근본 원인
--   이용권 사용은 트리거(voucher_redeem_to_ledger_request)가 store_vouchers.status='used' 로 바꾸며 바인 요청을 만든다.
--   그 요청이 (a) 접수대에서 거절되거나 (b) 손님이 대기 중 취소하거나 (c) 크론이 자동 만료시키면
--   요청은 끝나는데 **이용권은 'used' 로 남는다** — 되살리는 코드가 저장소 어디에도 없었다.
--   특히 (b)(c)는 요청 행을 하드 삭제해서 업주 화면에 흔적이 0이고, 손님은 취소가 이용권을 태운다는 걸 알 길이 없었다.
--   (approve 는 이용권을 건드리지 않는다 — 'used' 그대로가 맞다. 비대칭은 되돌리는 쪽에만 있었다.)
--
-- 함께 고치는 것 — reject_buyin_request 에 상태 가드가 없었다
--   approve 는 `status is distinct from 'pending'` 가드가 있는데 reject 는 없어, 이미 승인되어 장부에 금액이
--   들어간 요청을 '거절'로 뒤집을 수 있었고 장부 행은 그대로 남았다. 거절된 이용권 요청은 재사용을 열어 주므로
--   승인 → 거절 → 재사용 경로에서 같은 참가가 두 번 기록될 수 있었다.
--   ⚠ 마감(ledger_is_closed) 가드는 **일부러 넣지 않는다** — reject 는 장부에 쓰지 않고, 마감 뒤 남은 대기 요청을
--     정리할 유일한 길이다(막으면 손님 화면이 영영 '대기중'이다).
--
-- 만지지 않는 것
--   _voucher_used_checkin 이 사용 시점에 만든 출석(checkins) 행은 그대로 둔다. 출석 → 참여권 → 활동점수 사슬은
--   별개 정책(출석 현장증명, 오너 결정 대기)이라 여기서 지우면 범위를 넘는다. 재사용 시에는 그 트리거의
--   4시간 중복 방지가 두 번째 출석을 막는다.
--
-- 적용: 운영 DB 에 아직 적용하지 않았다. 하단 '검증' 블록이 적용 직후 스스로 확인하고 아니면 중단한다.
-- 롤백: 옛 본문은 baseline/2026-07-20-live-snapshot.sql:3697(reject) · :1981(cancel) ·
--       migrations/20260818f_...:112(expire) 에 그대로 있다. 헬퍼는 drop function public._restore_voucher(uuid).

-- ── ① 공용 헬퍼 — 이용권을 지갑으로 되돌린다(멱등: 'used' 인 것만, null 이면 아무것도 안 함) ──────────
create or replace function public._restore_voucher(p_voucher_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.store_vouchers
     set status = 'active', used_venue_id = null, used_at = null
   where id = p_voucher_id and status = 'used';
$$;
-- 내부 함수: 직접 호출 차단. SECURITY DEFINER 호출자(아래 셋)는 소유자 권한으로 실행되므로 영향 없다.
revoke all on function public._restore_voucher(uuid) from public, anon, authenticated;
grant execute on function public._restore_voucher(uuid) to service_role;
comment on function public._restore_voucher(uuid) is
  '거절·취소·만료된 바인 요청에 붙어 있던 이용권을 active 로 되돌린다(2026-09-11). 내부 전용.';

-- ── ② reject_buyin_request — 상태 가드 + 이용권 복원 ────────────────────────────────────
create or replace function public.reject_buyin_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.ledger_buyin_requests;
begin
  select * into r from public.ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(public.can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  -- approve 와 같은 가드 — 이미 승인된(장부에 들어간) 요청을 거절로 뒤집지 못하게 한다
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  -- ⚠ 전이는 한 문장으로 — 위 검사와 이 갱신 사이에 다른 화면의 승인이 커밋되면(READ COMMITTED)
  --   'approved' 를 'rejected' 로 덮고 이용권까지 되살린다. 술어에 status 를 넣어 승인된 행은 건너뛴다(cancel 과 같은 원리).
  update public.ledger_buyin_requests
     set status = 'rejected', resolve_note = nullif(trim(p_reason), ''), resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id and status = 'pending';
  if not found then raise exception '이미 처리된 요청입니다'; end if;
  perform public._restore_voucher(r.voucher_id);
end $$;
revoke all on function public.reject_buyin_request(uuid, text) from public, anon;
grant execute on function public.reject_buyin_request(uuid, text) to authenticated, service_role;

-- ── ③ cancel_buyin_request(손님 취소) — 지우기 전에 이용권 id 를 챙겨 되돌린다 ─────────────────
--   delete … returning 으로 한 문장 안에서 잡는다: 조회 → 삭제 사이에 승인이 끼어들면 이용권이 지갑으로
--   돌아갔는데 장부에도 남는 이중 상태가 되므로, 실제로 지워진 행의 voucher_id 만 복원한다.
create or replace function public.cancel_buyin_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_voucher uuid;
begin
  delete from public.ledger_buyin_requests
   where id = p_request_id and user_id = auth.uid() and status = 'pending'
   returning voucher_id into v_voucher;
  if not found then raise exception '취소할 수 없는 요청입니다(이미 처리됨)'; end if;
  perform public._restore_voucher(v_voucher);
end $$;
revoke all on function public.cancel_buyin_request(uuid) from public, anon;
grant execute on function public.cancel_buyin_request(uuid) to authenticated, service_role;

-- ── ④ expire_old_buyin_requests(크론) — 만료 삭제 전에 이용권부터 되돌린다 ────────────────────
--   본문은 20260818f 그대로이고, delete 앞에 복원 한 문장만 들어간다. 같은 트랜잭션이라 원자적이다.
create or replace function public.expire_old_buyin_requests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  -- 만료 삭제와 이용권 복원을 **한 문장**으로 — 실제로 지워진 행의 이용권만 지갑으로 돌아간다(2026-09-11).
  --   두 문장이면 그 사이에 승인이 커밋된 요청의 이용권이 지갑에 돌아간 채 장부에도 남는다.
  with del as (
    delete from ledger_buyin_requests r
    where r.status = 'pending'
      and (r.session_date < v_today - 1
        or (r.session_date < v_today and not exists (
          select 1 from ledger_sessions ls
          where ls.venue_id = r.venue_id and ls.session_date = r.session_date and ls.closed = false)))
    returning r.voucher_id
  ), restored as (
    update public.store_vouchers v
       set status = 'active', used_venue_id = null, used_at = null
     where v.status = 'used'
       and v.id in (select d.voucher_id from del d where d.voucher_id is not null)
    returning v.id
  )
  select count(*) into n from del;
  return n;
end $$;
-- 크론 전용(내부): 직접 호출 차단
revoke all on function public.expire_old_buyin_requests() from public, anon, authenticated;
grant execute on function public.expire_old_buyin_requests() to service_role;

notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 하나라도 어긋나면 전체 롤백 ────────────────────────────────
do $$
declare v_src text;
begin
  -- 헬퍼가 있고 anon·authenticated 는 부를 수 없다
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = '_restore_voucher') then
    raise exception 'ABORT: _restore_voucher 없음';
  end if;
  if has_function_privilege('anon', 'public._restore_voucher(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._restore_voucher(uuid)', 'execute') then
    raise exception 'ABORT: _restore_voucher 가 외부에 열려 있다';
  end if;
  -- 세 호출부가 전부 복원 경로를 탄다
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reject_buyin_request';
  if v_src not like '%_restore_voucher%' then raise exception 'ABORT: reject 에 이용권 복원 없음'; end if;
  if v_src not like '%is distinct from ''pending''%' then raise exception 'ABORT: reject 상태 가드 없음'; end if;
  if v_src not like '%where id = p_request_id and status = ''pending''%' then raise exception 'ABORT: reject 전이가 원자적이지 않다(승인과 경합)'; end if;
  if v_src like '%ledger_is_closed%' then raise exception 'ABORT: reject 에 마감 가드가 들어갔다(대기 요청이 영영 못 닫힌다)'; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_buyin_request';
  if v_src not like '%returning voucher_id%' or v_src not like '%_restore_voucher%' then raise exception 'ABORT: cancel 에 이용권 복원 없음'; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'expire_old_buyin_requests';
  if v_src not like '%returning r.voucher_id%' or v_src not like '%status = ''active'', used_venue_id = null%' then raise exception 'ABORT: expire 가 삭제·복원을 한 문장으로 하지 않는다'; end if;
  -- ACL: 변이 둘은 authenticated 만, 크론은 service_role 만
  if has_function_privilege('anon', 'public.reject_buyin_request(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.cancel_buyin_request(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.expire_old_buyin_requests()', 'execute') then
    raise exception 'ABORT: ACL 이 열려 있다';
  end if;
  -- 재사용을 막는 인덱스 조건이 그대로다(거절 행만 제외 · 삭제된 행은 애초에 없다)
  if not exists (select 1 from pg_indexes where indexname = 'uniq_ledger_req_voucher'
                 and indexdef like '%status <> ''rejected''%') then
    raise exception 'ABORT: uniq_ledger_req_voucher 조건이 바뀌었다 — 거절 뒤 재사용이 막힌다';
  end if;
end $$;
