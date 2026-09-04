-- 캘린더 범위 축소 (오너 지시 2026-09-04)
--
-- 지시 원문: "캘린더는 본인들이 뱅크롤 날짜별로 입력하게 해주고, 머니인 한 경우 본인 닉네임과
--            이름이 정확하게 매장쪽에서 기입이 되는 경우에도 안 넣어도 돼. 그런건 그냥 직접
--            본인이 수기 기입이야. 매장 예약이나 찜한 가게, 본인 스스로 관리하는 뱅크롤,
--            기타 스케쥴만 적을 수 있는 간단한 기능이야."
--
-- 즉 캘린더에 남는 것은 **찜 · 예약 · 뱅크롤(수기) · 기타 스케줄(수기)** 넷뿐이다.
-- 매장 장부에서 끌어오던 바이인 이력(my_buyin_history)과 랭킹 입상 기록은 캘린더에서 뺀다.
--
-- ⚠ my_buyin_history 함수 자체는 **지우지 않는다** — 다른 화면이 쓸 수 있고, 함수 삭제는
--   비가역이다. 캘린더가 호출을 멈추는 것으로 충분하다(클라이언트 변경).
--
-- 이 마이그레이션이 DB 에서 할 일은 하나뿐이다: '기타 스케줄'은 금액이 없으므로
-- bankroll_entries 의 amount<>0 제약을 풀어 준다. 새 테이블은 필요 없다 — memo 컬럼이 이미 있다.
--
-- 롤백:
--   alter table public.bankroll_entries drop constraint if exists bankroll_entry_not_empty;
--   delete from public.bankroll_entries where amount = 0;   -- 기타 스케줄 행 제거가 선행돼야 한다
--   alter table public.bankroll_entries add constraint bankroll_amount_nonzero check (amount <> 0);

alter table public.bankroll_entries drop constraint if exists bankroll_amount_nonzero;
alter table public.bankroll_entries drop constraint if exists bankroll_entry_not_empty;

-- 금액이 있거나(뱅크롤) 메모가 있거나(기타 스케줄) — 둘 다 비면 의미 없는 빈 행이다.
alter table public.bankroll_entries
  add constraint bankroll_entry_not_empty
  check (amount <> 0 or btrim(memo) <> '');

comment on table public.bankroll_entries is
  '유저가 직접 적는 캘린더 기록. amount<>0 이면 뱅크롤(+/-), amount=0 이면 기타 스케줄(메모만). 본인 행만(RLS).';
