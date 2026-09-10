-- ============================================================================
-- 개인 ROI — bankroll_entries 에 참가비·재진입·애드온·매장·게임 컬럼 (2026-09-09, WP11-roi-calendar)
--
-- ⚠ 운영 적용 금지(오케스트레이터 지시) — 파일만 둔다. 적용은 오너 결정 뒤 nuri-migration 절차로.
--   클라이언트는 이 마이그레이션 없이도 동작한다: select '*' 로 읽어 컬럼이 없으면 0/'' 로 매핑하고,
--   insert 는 기본값 필드를 싣지 않으며, 값을 실었다가 컬럼 부재(PGRST204)로 거절되면 새 필드 없이 재시도한다(src/lib/roi.ts).
--
-- 왜: 캘린더의 수기 기록은 amount(순결과) 하나라 ROI(순결과/참가비)·ITM(입상/참가)의 분모가 없다(리더 ROI-01·ROI-02).
-- 스키마 결정(오케스트레이터 확정):
--   · amount 는 그대로 **순결과(net)** — 기존 행과 뜻이 같아 소급 변환 없음. result = amount + invested 로 파생.
--   · invested = buy_in + rebuy + addon (각 integer not null default 0, check >= 0)
--   · venue_name · game_name text not null default '' — 매장·게임별 필터(문자열 일치)
--   · bankroll_entry_not_empty 를 (amount<>0 or buy_in>0 or btrim(memo)<>'') 로 교체 — 본전(순결과 0·참가비 있음)도 기록이다.
-- 개인 비공개 기록 전용 — 공개 랭킹·경쟁에 잇지 않는다. RLS(bankroll_entries_own, 본인 행만)는 그대로.
-- 멱등: add column if not exists · drop constraint if exists 후 재생성. 기존 행: default 0/'' 로 채워져 0px 영향.
-- CREATE OR REPLACE 함수 없음 → ACL 재작성 대상 없음. SECURITY DEFINER 없음.
--
-- 롤백(순서대로):
--   alter table public.bankroll_entries drop constraint if exists bankroll_entry_not_empty;
--   -- ⚠ 옛 제약(amount<>0 or memo<>'')은 본전 행(amount=0·buy_in>0·memo='')이 있으면 재생성이 실패한다 → 먼저 정리
--   delete from public.bankroll_entries where amount = 0 and buy_in > 0 and btrim(memo) = '';
--   alter table public.bankroll_entries add constraint bankroll_entry_not_empty check (amount <> 0 or btrim(memo) <> '');
--   alter table public.bankroll_entries
--     drop column if exists buy_in, drop column if exists rebuy, drop column if exists addon,
--     drop column if exists venue_name, drop column if exists game_name;
--   notify pgrst, 'reload schema';
--
-- 검증(적용 후):
--   -- ① 컬럼·기본값
--   select column_name, data_type, column_default, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'bankroll_entries' order by ordinal_position;
--   -- ② 제약 4개(buy_in·rebuy·addon nonneg + not_empty)
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.bankroll_entries'::regclass and contype = 'c' order by conname;
--   -- ③ 합성 검증 — 트랜잭션 안에서 효과만 보고 되돌린다(운영 행 0건 변경)
--      ⚠ SQL 에디터/MCP 에서는 auth.uid() 가 NULL 이라 not-null 위반으로 먼저 깨진다 — 실제 profiles.id 하나를 :uid 로 넣어 돌린다.
--   begin;
--     insert into public.bankroll_entries (user_id, amount, buy_in) values (:uid, 0, 50000);            -- 통과(본전)
--     insert into public.bankroll_entries (user_id, amount, rebuy)  values (:uid, 0, 30000);            -- 통과(재진입만 적은 이벤트)
--     do $$ begin
--       begin insert into public.bankroll_entries (user_id, amount) values (:uid, 0); raise exception 'FAIL: 빈 행이 들어갔다';
--       exception when check_violation then null; end;
--       begin insert into public.bankroll_entries (user_id, amount, buy_in) values (:uid, -1000, -1); raise exception 'FAIL: 음수 참가비가 들어갔다';
--       exception when check_violation then null; end;
--       begin insert into public.bankroll_entries (user_id, amount, venue_name) values (:uid, 1000, repeat('가', 41)); raise exception 'FAIL: 41자 매장명이 들어갔다';
--       exception when check_violation then null; end;
--     end $$;
--   rollback;
--   -- ④ 기존 행 영향 0: select count(*) filter (where buy_in <> 0 or rebuy <> 0 or addon <> 0 or venue_name <> '' or game_name <> '') from public.bankroll_entries; → 0
--   -- ⑤ 어드바이저 보안 ERROR 0 유지.
-- ============================================================================

alter table public.bankroll_entries
  add column if not exists buy_in     integer not null default 0 constraint bankroll_buy_in_nonneg check (buy_in >= 0),
  add column if not exists rebuy      integer not null default 0 constraint bankroll_rebuy_nonneg  check (rebuy  >= 0),
  add column if not exists addon      integer not null default 0 constraint bankroll_addon_nonneg  check (addon  >= 0),
  -- 자유 입력 문자열은 클라이언트 maxLength(40)와 같은 상한을 서버에도 둔다(본인 행 전용이지만 무제한 text 는 두지 않는다).
  add column if not exists venue_name text    not null default '' constraint bankroll_venue_name_len check (length(venue_name) <= 40),
  add column if not exists game_name  text    not null default '' constraint bankroll_game_name_len  check (length(game_name)  <= 40);

-- 금액이 있거나(순결과) 투자가 있거나(본전 — 참가비·재진입·애드온 중 하나) 메모가 있거나(기타 일정) — 다 비면 의미 없는 빈 행이다.
-- 클라이언트 src/lib/roi.ts 의 investedOf(buyIn+rebuy+addon)·isMemoEntry 와 같은 규칙이어야 한다(재진입만 적은 행도 이벤트다).
-- 새 조건은 옛 조건보다 느슨하므로 기존 행은 전부 통과한다(재생성 시 검증 실패 없음).
alter table public.bankroll_entries drop constraint if exists bankroll_entry_not_empty;
alter table public.bankroll_entries
  add constraint bankroll_entry_not_empty
  check (amount <> 0 or (buy_in + rebuy + addon) > 0 or btrim(memo) <> '');

comment on column public.bankroll_entries.amount     is '순결과(net) — 참가비를 뺀 값. 음수 = 마이너스. result = amount + buy_in + rebuy + addon.';
comment on column public.bankroll_entries.buy_in     is '참가비(원). 0 = 미기록. invested = buy_in + rebuy + addon. 개인 ROI 전용.';
comment on column public.bankroll_entries.rebuy      is '재진입 합계(원). 0 = 없음.';
comment on column public.bankroll_entries.addon      is '애드온 합계(원). 0 = 없음.';
comment on column public.bankroll_entries.venue_name is '유저가 적은 매장 이름(자유 문자열, 필터는 일치 비교). venues 와 잇지 않는다 — 개인 비공개 기록.';
comment on column public.bankroll_entries.game_name  is '유저가 적은 게임 이름(자유 문자열, 필터는 일치 비교).';
comment on table  public.bankroll_entries is
  '유저가 직접 적는 캘린더 기록. amount<>0 또는 buy_in>0 이면 뱅크롤(순결과·참가비), 둘 다 0 이면 기타 스케줄(메모만). 본인 행만(RLS). 개인 ROI 는 클라이언트(src/lib/roi.ts)가 계산 — 공개 랭킹과 무관.';

notify pgrst, 'reload schema';
