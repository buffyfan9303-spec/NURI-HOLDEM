-- 20260924d — 장부 바인 클라이언트 직접 쓰기 가드 (STORE-CHAIN-AUDIT ② F1·F2, critical-reviewer 2026-09-24).
--
-- ✅ 2026-09-24 라이브 적용 완료 (MCP execute_sql · 자가검사 통과) · 함수 md5 561bcf6f2aeaf45be27b5424fe1be0ef
--   롤백 리허설(업주 c8e3… · 테스트 매장 dddd…): 정상 기록 ok(created_by 가 본인으로 강제) · 금액 수정 ok ·
--   request_id 위조 insert 42501 · created_by/buyin_at 변경 42501 · anon INSERT 권한 false.
--   음성 대조: 트리거 없이 같은 계정의 created_by 변경이 통과 → 차단은 이 트리거가 만든 것.
--
-- 문제: authenticated 가 ledger_buyins 에 표 단위 INSERT/UPDATE 를 가져 request_id·created_by·buyin_at 을 직접 쓸 수 있었다.
--   F2: 남의 매장 승인 요청 id 를 request_id 로 넣고 cancel_my_recent_buyin → _restore_voucher_for_request 가
--       그 이용권을 다시 active 로 → 이용권 1장으로 장부 2회·매장 경계 위반.
--   F1: created_by·buyin_at 을 본인·지금으로 바꾼 뒤 cancel_my_recent_buyin → 남의 현금 바인을 비밀번호 없이 삭제.
--   (운영 노출 0건 — request 연결 0, ledger_access 0 — 이용권 사용 첫날부터 열리는 구멍이라 먼저 닫는다.)
-- 수정: 클라이언트 직접 쓰기(current_user authenticated/anon)만 가드. SECURITY DEFINER RPC(소유자 postgres)·service_role 은 통과.
--   INSERT: request_id 금지, created_by=auth.uid()·buyin_at=now() 강제(클라이언트는 원래 이 둘만 이렇게 보낸다 — ledger.ts upsertBuyin).
--   UPDATE: request_id·created_by·buyin_at·venue_id·session_date 변경 금지(클라이언트는 금액·결제·할인·얼리만 고친다).
--   anon 의 INSERT/UPDATE/DELETE 표 권한 회수(RLS 가 막고 있었지만 비로그인이 장부에 쓸 이유가 없다).
-- 남은 것: 직원이 금액을 0으로 고치는 것(비밀번호는 삭제만 막는다)은 정책 결정 사항 — 리드 보고.

create or replace function public._ledger_buyins_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.request_id is not null then
      raise exception '바인 요청 연결은 서버만 설정할 수 있습니다' using errcode = '42501';
    end if;
    new.created_by := auth.uid();
    new.buyin_at := now();
  else
    if new.request_id is distinct from old.request_id
       or new.created_by is distinct from old.created_by
       or new.buyin_at is distinct from old.buyin_at
       or new.venue_id is distinct from old.venue_id
       or new.session_date is distinct from old.session_date then
      raise exception '기록자·기록 시각·매장·요청 연결은 바꿀 수 없습니다' using errcode = '42501';
    end if;
  end if;
  return new;
end $fn$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;
drop trigger if exists ledger_buyins_client_guard on public.ledger_buyins;
create trigger ledger_buyins_client_guard before insert or update on public.ledger_buyins
  for each row execute function public._ledger_buyins_client_guard();
revoke insert, update, delete on public.ledger_buyins from anon;

do $chk$ begin
  if not exists (select 1 from pg_trigger where tgname='ledger_buyins_client_guard' and tgrelid='public.ledger_buyins'::regclass) then raise exception '[chk] trigger missing'; end if;
  if has_table_privilege('anon','public.ledger_buyins','INSERT') then raise exception '[chk] anon insert'; end if;
end $chk$;
