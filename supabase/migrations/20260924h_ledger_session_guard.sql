-- 20260924h — 장부 세션 가드 (STORE-CHAIN-AUDIT ② F4).
-- ✅ 2026-09-24 라이브 적용 완료 · _ledger_session_guard md5 00c1f110fc5a073aa3069195be6de088
--   리허설(업주 c8e3… · dddd…): 바인 있는 게임 단가 변경 거절 · 기존 할인 삭제/변경 거절 · 할인 뒤 추가 ok · 제목 ok ·
--   바인 없는 게임 단가 ok · 마감 ok · 다른 기기 [시작] upsert 가 마감을 풀지 않음(closed=t, opened_at 보존).
--   음성 대조: 적용 전 단가 변경 통과 · 재오픈 upsert 로 closed=f.
-- 상태 보존은 클라이언트 역할(authenticated/anon)만 — reopen_ledger_session(SECURITY DEFINER)은 그대로 마감 해제 가능.
-- 단가·할인 고정은 모든 경로. 트리거 이름 trg_a_… 로 기존 trg_guard_ledger_session_update 보다 먼저 돈다(알파벳 순).
-- 할인 비교 기준은 클라이언트 discountsAppendOnly(ledger.ts:198)와 같다(label·amount·level, level 없으면 0).
create or replace function public._ledger_session_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
declare od jsonb; nd jsonb; i int;
begin
  if current_user in ('authenticated','anon') then
    if new.venue_id is distinct from old.venue_id or new.session_date is distinct from old.session_date
       or new.game_seq is distinct from old.game_seq then
      raise exception '장부의 매장·날짜·게임 번호는 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if old.opened_at is not null and new.opened_at is distinct from old.opened_at then
      new.opened_at := old.opened_at;   new.opened_by := old.opened_by;
      new.reg_closed := old.reg_closed; new.reg_closed_at := old.reg_closed_at;
      new.closed := old.closed;         new.closed_at := old.closed_at; new.close_memo := old.close_memo;
    end if;
  end if;
  if exists (select 1 from public.ledger_buyins b
              where b.venue_id = old.venue_id and b.session_date = old.session_date and b.game_seq = old.game_seq) then
    if new.buyin_amount is distinct from old.buyin_amount then
      raise exception '이미 기록된 바인이 있어 단가를 바꿀 수 없습니다' using errcode = '23514';
    end if;
    od := case when jsonb_typeof(old.discounts) = 'array' then old.discounts else '[]'::jsonb end;
    nd := case when jsonb_typeof(new.discounts) = 'array' then new.discounts else '[]'::jsonb end;
    if jsonb_array_length(nd) < jsonb_array_length(od) then
      raise exception '기존 할인은 지울 수 없습니다 — 뒤에 추가만 됩니다' using errcode = '23514';
    end if;
    for i in 0 .. jsonb_array_length(od) - 1 loop
      if (nd->i->'label') is distinct from (od->i->'label')
         or (nd->i->'amount') is distinct from (od->i->'amount')
         or coalesce(nullif(nd->i->'level','null'::jsonb),'0'::jsonb) is distinct from coalesce(nullif(od->i->'level','null'::jsonb),'0'::jsonb) then
        raise exception '기존 할인(%번째)은 바꿀 수 없습니다 — 뒤에 추가만 됩니다', i + 1 using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end $fn$;
revoke all on function public._ledger_session_guard() from public, anon, authenticated;
drop trigger if exists trg_a_ledger_session_guard on public.ledger_sessions;
create trigger trg_a_ledger_session_guard before update on public.ledger_sessions
  for each row execute function public._ledger_session_guard();
