-- Canonical Supabase CLI migration for the production migration history entry
-- 20260913123648 / event_voucher_bundle_20260913_hardened.
--
-- Production already records this version. Keep it so local history matches the remote
-- entry and the exact applied SQL remains auditable. Legacy letter-suffix prerequisites
-- still prevent a full fresh reset; this file does not claim to repair that older debt.
-- Do not run it manually.
begin;

-- 적용 전 전제 확인 — 하나라도 어긋나면 여기서 멈춘다(아무것도 바뀌지 않는다).
do $preflight$
begin
  if to_regprocedure('public._restore_voucher(uuid)') is null then
    raise exception 'ABORT: 20260911b 가 적용돼 있지 않다(_restore_voucher 없음). 이 묶음의 선행 조건이다.';
  end if;
  if to_regprocedure('public._restore_voucher_for_request(uuid)') is null then
    raise exception 'ABORT: 20260911c 가 적용돼 있지 않다(_restore_voucher_for_request 없음).';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ledger_buyins'
                    and column_name = 'request_id') then
    raise exception 'ABORT: 20260911c 가 적용돼 있지 않다(ledger_buyins.request_id 없음).';
  end if;
  if to_regclass('public.event_campaigns') is null then
    raise exception 'ABORT: 20260906b 가 적용돼 있지 않다(event_campaigns 없음). 이벤트 기반이 없다.';
  end if;
  raise notice '전제 확인 통과 — 6개 적용을 시작한다.';
end $preflight$;



-- ========================================================================
-- [1/6] 20260911g_voucher_multi_use_pending_uniq.sql
--        이용권 2장 사용 — 대기 유니크를 voucher_id is null 로 좁히고 lbr_insert_self 위조를 막는다
-- ========================================================================

-- 20260911g — 같은 날 같은 매장에 이용권 2장을 쓰면 두 번째가 실패하던 것 (2026-09-11 장부 점검 M1)
--
-- 근본 원인 — '한 사람 = 하루 한 요청' 이라는 가정이 두 곳에 박혀 있다
--   ① baseline:1263  ledger_buyin_req_uniq_pending = (venue_id, session_date, user_id) where status='pending'
--   ② 20260818f:55-57  request_buyin 의 중복 접기(if exists … then update … return)
--   이용권 사용 트리거(20260818f:68 voucher_redeem_to_ledger_request)는 그 가정을 모른 채
--   **이용권 한 장마다 요청 행을 하나씩** 만든다. 그래서
--     · 같은 날 같은 매장에 2장 → 두 번째 insert 가 ①에 걸려 실패한다. store_vouchers 의 status='used'
--       UPDATE 와 같은 문장(AFTER 트리거)이라 함께 롤백된다 — 이용권이 타 없어지지는 않지만 **못 쓴다**.
--     · 그날 이미 현장결제 요청(request_buyin)을 보낸 손님은 대기 행이 이미 있어 **한 장도** 못 쓴다.
--   증상은 이미 코드에 두 번 적혀 있다 — src/components/features/MyVoucherSheet.tsx:340 의 주석과,
--   src/api/vouchers.ts voucherErrorText 의 `duplicate key|unique constraint` → '같은 날 같은 매장에
--   이미 신청이 있어요' 전용 분기.
--
-- 지금 손해가 0인 이유 · 그래서 언제 적용해야 하는가
--   이용권·본인인증은 킬스위치 OFF 다(app_settings.identity_voucher_enabled='off' — 20260829f:40,
--   클라 게이트 src/api/vouchers.ts assertVoucherOn · src/lib/identityFlag.ts). 사용 진입점이 전부 막혀 있고
--   2026-09-11 운영 실측 store_vouchers 0행이라 지금 이 결함으로 피해를 본 손님은 없다.
--   ⚠ 그러므로 이 파일은 **킬스위치를 'on' 으로 켜는 커밋과 같은 커밋**에 들어가야 하고, 스위치를 켜기
--     **전에** DB 에 적용돼야 한다. 순서가 뒤집히면 기능을 여는 첫날 '2장 보내기'가 그대로 실패한다.
--
-- ⚠⚠ 이 마이그레이션만으로는 부족하다 — 접수대 '전체 승인'을 먼저 순차로 바꿔야 한다 (2026-09-11 반증)
--   대기 행이 여러 개가 되면 **같은 player_name 요청 2건**이 처음으로 생긴다. 그런데
--   src/components/features/NuriPosLedger.tsx:363 bulkApprove 는
--     Promise.allSettled(flat.map((x) => approveBuyinRequest(...)))
--   로 **병렬** 호출한다. approve_buyin_request(20260911d)는 ledger_players 를 `not exists` 로 넣고
--   entry_no 를 `max(entry_no)+1` 로 뽑는다 — READ COMMITTED 에서 두 트랜잭션이 같은 이전 상태를 읽어
--     baseline:1009 ledger_players_venue_date_game_name_key(venue_id, session_date, game_seq, name)
--     baseline:1008 ledger_buyins_venue_date_game_player_entry_key(venue_id, session_date, game_seq, player_name, entry_no)
--   중 하나가 반드시 터진다. 접수대에는 '1건 승인 · 1건 실패'가 뜨고 두 번째 요청은 pending 으로 남는다
--   (이용권은 그 pending 행에 묶여 있어 재시도하면 성공 — 자산 손실은 없다).
--   → bulkApprove 를 for-await 순차 루프로 바꾸는 커밋이 **이 파일보다 먼저 또는 같이** 배포돼야 한다.
--   서버(approve_buyin_request)는 일부러 손대지 않는다 — 20260911d 가 방금 다시 쓴 SECURITY DEFINER 함수라
--   여기서 create or replace 하면 그 수정을 되돌릴 위험이 이득보다 크다. 두 기기 동시 승인이라는 잔여
--   경합은 드물고 재시도로 복구된다.
--
-- 왜 인덱스를 그냥 지우지 않는가
--   ①은 중복 요청 방지다 — QR 을 두 번 찍어 같은 참가가 접수대에 두 줄로 뜨는 것을 막는다.
--   그 보호는 **이용권이 붙지 않은 요청**에만 의미가 있다(이용권 요청은 장수만큼 있는 게 정상이다).
--   그래서 지우지 않고 조건을 좁힌다: `voucher_id is null` 인 행만 유일. 이용권 쪽 중복은 이미
--   uniq_ledger_req_voucher(voucher_id, where voucher_id is not null and status <> 'rejected')가
--   **이용권 1장당 요청 1건**으로 막는다 — 대기 행 N개 = 실제로 소진된 이용권 N장이다.
--
-- 바꾸는 것 (셋)
--   ① 대기 유니크 인덱스에 `and voucher_id is null` 을 더한다(이름 유지 — 아는 이름을 바꾸지 않는다).
--   ② request_buyin 의 중복 접기를 같은 조건으로 좁힌다. **①만 하면 새 버그가 난다**:
--      이용권 대기 행이 있는 손님이 현장결제 요청을 보내면 새 요청이 생기지 않고(성공 토스트만 뜬다),
--      그 UPDATE 가 조건에 맞는 **이용권 대기 행 전부**의 note·requested_game_seq 를 덮어쓴다.
--      (이건 인덱스와 무관하게 **지금도 나는 버그**다 — 이용권 대기 행 하나짜리에서도 note 가 덮인다.)
--   ③ RLS insert 정책 lbr_insert_self 에 `and voucher_id is null`.
--
-- ③이 왜 같이 가야 하나 (①만 하면 열리는 구멍)
--   lbr_insert_self(baseline:5076)는 authenticated 에게 `user_id = auth.uid()` 하나만 보고 INSERT 를 허용하고,
--   voucher_id 에는 FK 도 검사도 없다. 표 권한도 열려 있다 — 20260905o 는 TRUNCATE/REFERENCES/TRIGGER 만
--   회수했고 INSERT 는 Supabase 기본 GRANT 그대로다. ①을 좁히고 ③을 안 하면 아무 uuid 나 voucher_id 에
--   넣은 행을 **무한히** 꽂을 수 있다(대기열 도배 · _notify_buyin_request 알림 유발). 게다가 그렇게 꽂힌
--   행은 접수대에서 '✓ 승인·티켓'으로 보이고, 승인하면 approve_buyin_request(20260911d:98)가 r.voucher_id 를
--   믿고 **무료 티켓 바인**을 기록한다(①과 무관하게 지금도 하루 1건씩 가능하던 경로 — 여기서 같이 닫는다).
--   서버 경로는 영향 0: 이용권 요청을 만드는 것은 SECURITY DEFINER 트리거(소유자 권한)이고 이 스키마에
--   force row level security 가 걸린 표가 하나도 없어 RLS 를 타지 않는다.
--   클라이언트에는 ledger_buyin_requests 직접 INSERT 가 한 곳도 없다(2026-09-11 grep — src/api/ledger.ts 는
--   select·realtime 구독뿐, e2e 는 route 목킹뿐, supabase/functions/* 는 이 표를 쓰지 않는다).
--
-- 같이 닫는 인접 구멍
--   · lbr_insert_self 는 status='pending' 도 강제한다. 로그인 유저가 임의 venue_id 로 approved 행을
--     꽂아 승인율·평균대기 통계를 위조하는 경로를 같은 신뢰 경계에서 막는다.
--   · ledger_buyin_requests.voucher_id 에 FK 를 새로 걸지 않는다 — ③이 클라 입력을 막아 불필요하고,
--     라이브 표에 검증 스캔을 얹을 이유가 없다.
--
-- 일부러 안 바꾸는 것
--   · voucher_redeem_to_ledger_request — 한 글자도 고치지 않는다. 트리거는 처음부터 옳게 동작했다.
--   · uniq_ledger_req_voucher — 조건 그대로 둔다('거절 후 재사용'을 여는 20260818f:95 의 설계).
--   · approve/reject/cancel/expire/_restore_voucher* (20260911b·c·d) — 무관. 되돌리지 않는다.
--   · '요청 1건이 이용권 N장을 들고 가는' 설계(quantity 컬럼)로 가지 않는다 — 표·RPC·접수대 UI·
--     승인 시 entry_no 까지 전부 바뀐다. 지금 필요한 건 '대기 행 N개를 허용한다' 뿐이다.
--   · request_buyin 의 시그니처·날짜 가드·반환값·본문 나머지 — 20260818f:30 그대로다.
--
-- 데이터 영향 0 — 기존 행을 읽지도 쓰지도 않는다. 새 인덱스의 대상 행은 옛 인덱스의 **부분집합**이라
--   중복 때문에 생성이 실패할 수 없다. drop→create 가 한 트랜잭션이라 '유일성이 없는 순간'도 없다.
--   ledger_buyin_req_uniq_pending 은 부분 인덱스라 제약(CONSTRAINT)이 뒤에 붙어 있을 수 없다 — drop 이 막히지 않는다.
-- 롤백: 파일 하단 '-- ROLLBACK'.

-- ── ① 대기 유니크 인덱스 — 이용권이 붙은 요청은 비켜 간다 ─────────────────────
drop index if exists public.ledger_buyin_req_uniq_pending;
create unique index if not exists ledger_buyin_req_uniq_pending
  on public.ledger_buyin_requests (venue_id, session_date, user_id)
  where status = 'pending' and voucher_id is null;
comment on index public.ledger_buyin_req_uniq_pending is
  '앱 요청(voucher_id is null)의 중복 접수 방지. 이용권 요청은 장수만큼 있는 게 정상이라 제외하고,
   그쪽 중복은 uniq_ledger_req_voucher 가 이용권 1장당 1건으로 막는다(2026-09-11 M1).';

-- ── ② request_buyin — 중복 접기를 같은 조건으로 좁힌다 ──────────────────────────
--   20260818f:30 본문 그대로이고, 55·57행 두 술어에 `and voucher_id is null` 한 조각씩만 더했다.
--   search_path 만 하드닝 표기로 바꾼다(public 뒤에 pg_temp 를 **명시**해 두는 형태 — 생략하면
--   pg_temp 가 암묵적으로 맨 앞에서 검색된다). 시그니처 동일 → 오버로드가 생기지 않는다.
create or replace function public.request_buyin(
  p_venue_id uuid,
  p_note text default null,
  p_game_seq smallint default null,
  p_expected_date date default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
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
  -- 접는 대상은 **내가 앱으로 보낸 요청**뿐이다. 이 조건이 없으면 이용권 대기 행에 흡수되어
  --   새 요청이 안 생기고, 아래 update 가 이용권 대기 행 전부의 note·requested_game_seq 를 덮어쓴다.
  if exists (select 1 from ledger_buyin_requests where venue_id = p_venue_id and session_date = v_biz and user_id = auth.uid() and status = 'pending' and voucher_id is null) then
    update ledger_buyin_requests set requested_game_seq = coalesce(p_game_seq, requested_game_seq), note = coalesce(nullif(trim(p_note), ''), note)
      where venue_id = p_venue_id and session_date = v_biz and user_id = auth.uid() and status = 'pending' and voucher_id is null;
    return v_venue;
  end if;
  insert into ledger_buyin_requests (venue_id, session_date, user_id, player_name, note, status, requested_game_seq)
  values (p_venue_id, v_biz, auth.uid(), coalesce(v_name, '회원'), nullif(trim(p_note), ''), 'pending', p_game_seq);
  return v_venue;
end; $function$;
-- ⚠ CREATE OR REPLACE 뒤에는 ACL 을 다시 쓴다(nuri-migration §1). `from anon` 만으로는 PUBLIC 기본 GRANT 가 남는다.
revoke all on function public.request_buyin(uuid, text, smallint, date) from public, anon;
grant execute on function public.request_buyin(uuid, text, smallint, date) to authenticated, service_role;

-- ── ③ RLS — 클라이언트는 voucher_id 를 직접 꽂을 수 없다 ───────────────────────
--   같은 트랜잭션 안이라 정책이 비는 순간이 없다. 서버(SECURITY DEFINER 트리거)는 RLS 를 타지 않는다.
drop policy if exists lbr_insert_self on public.ledger_buyin_requests;
create policy lbr_insert_self on public.ledger_buyin_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and voucher_id is null and status = 'pending');

notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 하나라도 어긋나면 전체 롤백 ──────────────────
do $$
declare v_src text; v_def text; v_cnt int;
begin
  -- ① 인덱스가 좁혀졌는가
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'ledger_buyin_req_uniq_pending';
  if v_def is null then raise exception 'ABORT: ledger_buyin_req_uniq_pending 가 사라졌다 — 중복 요청 방지가 통째로 없어졌다'; end if;
  if lower(v_def) not like '%unique%' then raise exception 'ABORT: 대기 인덱스가 UNIQUE 가 아니다 — %', v_def; end if;
  if lower(v_def) not like '%voucher_id is null%' then
    raise exception 'ABORT: 대기 인덱스가 아직 이용권 요청까지 막는다 — %', v_def;
  end if;
  -- 같은 표에 '이용권을 가리지 않는' 대기 유니크가 다른 이름으로 남아 있지 않은가
  if exists (select 1 from pg_indexes
              where schemaname = 'public' and tablename = 'ledger_buyin_requests'
                and lower(indexdef) like '%unique%'
                and lower(indexdef) like '%status = ''pending''%'
                and lower(indexdef) not like '%voucher_id is null%') then
    raise exception 'ABORT: 이용권을 가리지 않는 대기 유니크 인덱스가 남아 있다';
  end if;
  -- 이용권 1장당 1건 보호는 그대로여야 한다(이걸 잃으면 이용권 하나로 요청 여러 건이 생긴다)
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'uniq_ledger_req_voucher'
                  and indexdef like '%status <> ''rejected''%') then
    raise exception 'ABORT: uniq_ledger_req_voucher 가 없거나 조건이 바뀌었다';
  end if;
  -- 승인이 기대는 두 유니크 제약이 살아 있는가(대기 행이 여러 개가 된 뒤로는 이게 접수대의 마지막 방어선이다)
  if not exists (select 1 from pg_constraint where conname = 'ledger_buyins_venue_date_game_player_entry_key')
     or not exists (select 1 from pg_constraint where conname = 'ledger_players_venue_date_game_name_key') then
    raise exception 'ABORT: ledger_buyins/ledger_players 의 유니크 제약이 없다 — 같은 손님 2건 승인이 조용히 중복 기록된다';
  end if;

  -- ② request_buyin — 오버로드 1개 · 두 술어 모두 좁혀졌는가 · 가드 보존
  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_buyin';
  if v_cnt <> 1 then raise exception 'ABORT: request_buyin 오버로드 %개 (1개여야 한다)', v_cnt; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_buyin';
  if (length(v_src) - length(replace(v_src, 'and status = ''pending'' and voucher_id is null', '')))
       / length('and status = ''pending'' and voucher_id is null') <> 2 then
    raise exception 'ABORT: request_buyin 의 중복 접기가 두 곳(검사·갱신) 모두 좁혀지지 않았다 — 이용권 대기 행을 덮어쓴다';
  end if;
  if v_src not like '%ledger_business_date%' then raise exception 'ABORT: request_buyin 의 영업일 귀속이 사라졌다(20260818f 회귀)'; end if;
  if v_src not like '%현장 참가 신청은 대회 당일에만%' then raise exception 'ABORT: request_buyin 의 날짜 가드가 사라졌다(20260726b 회귀)'; end if;
  if has_function_privilege('anon', 'public.request_buyin(uuid, text, smallint, date)', 'execute') then
    raise exception 'ABORT: request_buyin 이 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.request_buyin(uuid, text, smallint, date)', 'execute') then
    raise exception 'ABORT: request_buyin 이 authenticated 에 닫혔다 — 현장 참가 신청이 죽는다';
  end if;

  -- ③ RLS — 클라 INSERT 는 voucher_id 를 실을 수 없다
  select with_check into v_def from pg_policies
   where schemaname = 'public' and tablename = 'ledger_buyin_requests' and policyname = 'lbr_insert_self';
  if v_def is null then raise exception 'ABORT: lbr_insert_self 정책이 없다 — 손님이 요청을 못 넣는다'; end if;
  if lower(v_def) not like '%voucher_id is null%' then
    raise exception 'ABORT: 클라이언트가 voucher_id 를 직접 꽂을 수 있다 — 무료 티켓 위조 · 대기열 도배 — %', v_def;
  end if;
  if lower(v_def) not like '%status = ''pending''%' then
    raise exception 'ABORT: 클라이언트가 처리 완료 상태를 직접 꽂을 수 있다 — 승인 통계 위조 — %', v_def;
  end if;
  if lower(v_def) not like '%auth.uid()%' then raise exception 'ABORT: lbr_insert_self 의 본인 확인이 사라졌다 — %', v_def; end if;

  raise notice 'M1 OK — 대기 유니크는 이용권 요청을 비켜간다 · request_buyin 두 술어 · lbr_insert_self voucher_id/status 차단';
  raise notice 'M1 남은 일 — 접수대 bulkApprove(NuriPosLedger.tsx)를 순차 승인으로 바꾼 커밋이 배포됐는지 확인할 것';
end $$;

-- ROLLBACK (필요 시 수동)
--   ⚠ 되돌리기 전에 (venue_id, session_date, user_id) 중복 대기 행부터 정리해야 인덱스가 만들어진다:
--     select venue_id, session_date, user_id, count(*) from public.ledger_buyin_requests
--      where status = 'pending' group by 1,2,3 having count(*) > 1;
--   drop index if exists public.ledger_buyin_req_uniq_pending;
--   create unique index ledger_buyin_req_uniq_pending
--     on public.ledger_buyin_requests (venue_id, session_date, user_id) where status = 'pending';
--   request_buyin : 20260818f_ledger_business_day_and_close_seal.sql:30 본문을 그대로 재실행한 뒤
--     revoke all … from public, anon;  grant execute … to authenticated, service_role;  (ACL 재발급 필수)
--   정책 : drop policy if exists lbr_insert_self on public.ledger_buyin_requests;
--          create policy lbr_insert_self on public.ledger_buyin_requests for insert to authenticated
--            with check (user_id = (select auth.uid()));
--   ⚠ 롤백하면 '이용권 2장' 결함이 그대로 돌아온다 — 킬스위치를 다시 'off' 로 내리는 것과 같이 해야 한다.


-- ========================================================================
-- [2/6] 20260911i_bulk_delete_voucher_restore.sql
--        일괄 삭제(플레이어·세션) 두 경로에서 이용권을 복구한다 — 영구 소멸 차단
-- ========================================================================

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


-- ========================================================================
-- [3/6] 20260912a_buyin_request_approve_race.sql
--        승인↔거절 경합 — 승인이 거절을 덮어 이용권 1장으로 2회 참가하던 것
-- ========================================================================

-- V01 / P1 — 바인 요청 승인의 경합을 막는다 (2026-09-12)
--
-- APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened. Activation is separate.
--
-- ── 무엇이 문제인가 ────────────────────────────────────────────────────────────
-- `approve_buyin_request` 는 요청 행을 **잠그지 않고** 읽고, 마지막 전이에도 상태 술어가 없다:
--
--     select * into r from ledger_buyin_requests where id = p_request_id;   -- 잠금 없음
--     if r.status is distinct from 'pending' then raise ...                  -- 스냅샷 검사
--     ...  (ledger_players / ledger_buyins INSERT — 되돌릴 수 없는 부수효과)
--     update ledger_buyin_requests set status='approved' where id = p_request_id;  -- 술어 없음
--
-- `reject_buyin_request`(20260911b)는 이미 CAS 를 갖고 있다
-- (`where id = ... and status='pending'` + `if not found then raise`).
-- 그래서 **거절이 승인을 덮는 방향은 막혀 있지만, 승인이 거절을 덮는 방향은 열려 있다.**
--
-- 재현(READ COMMITTED, connection 2개):
--   ① A: approve 가 pending 을 읽는다(잠금 없음).
--   ② B: reject 가 CAS 로 'rejected' 로 바꾸고 `_restore_voucher` 로 이용권을 active 로 되돌린 뒤 커밋.
--   ③ A: 그대로 진행해 ledger_buyins 를 INSERT 하고 status 를 'approved' 로 **덮어쓴다**.
--   결과: **active 이용권과 확정 바인이 동시에 남는다.**
--
--   approve ↔ approve 도 같다 — 둘 다 pending 을 읽고 둘 다 바인을 INSERT 해
--   요청 1건에 확정 바인 2건이 생긴다(다른 게임으로 각각 승인하는 경우 포함).
--
-- ── 어떻게 고치는가 ───────────────────────────────────────────────────────────
--   ① `for update` 로 요청 행을 잠근다. 잠금을 얻은 시점에 **최신 커밋본**을 다시 읽으므로
--      ②에서 거절이 커밋됐으면 여기서 걸린다. 부수효과 이전에 막힌다.
--   ② 마지막 전이에도 `and status='pending'` 을 넣고 `if not found` 로 확인한다(거절과 같은 모양).
--      ①이 있으면 도달하지 않지만, 두 겹으로 둔다 — 이 함수는 돈과 이용권을 동시에 움직인다.
--
-- 본문의 나머지 로직(단가·할인·분납·티켓·마감 검사)은 20260911d 와 **한 글자도 다르지 않다.**
-- 바꾼 것은 위 두 줄뿐이다.
--
-- ── 적용 후 확인 ──────────────────────────────────────────────────────────────
--   select proname, proacl from pg_proc where proname = 'approve_buyin_request';
--   어드바이저 보안 ERROR 0 유지.
--
-- ROLLBACK: 20260911d_buyin_value_payment_method_neutral.sql 의
--           approve_buyin_request 정의를 그대로 재실행한 뒤, 아래 REVOKE/GRANT 2줄을 다시 쓴다.

create or replace function public.approve_buyin_request(
  p_request_id uuid,
  p_game_seq smallint default 1,
  p_record_buyin boolean default false,
  p_pay_method text default 'cash',
  p_split boolean default false,
  p_cash integer default 0,
  p_card integer default 0,
  p_transfer integer default 0,
  p_discount_index integer default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r ledger_buyin_requests;
  v_sort int; v_entry int;
  v_amt int; v_discounts jsonb;
  v_disc int := 0; v_idx int := 0; v_unit int; v_net int;
  v_pm text := lower(coalesce(p_pay_method, 'cash'));
begin
  -- ⚠ 2026-09-12(V01): `for update` — 같은 요청을 동시에 처리하는 다른 트랜잭션을 여기서 줄 세운다.
  --   잠금을 얻으면 최신 커밋본을 다시 읽으므로, 그 사이 거절/승인이 커밋됐다면 아래 상태 검사에 걸린다.
  --   **부수효과(바인 INSERT) 이전에** 막히는 것이 핵심이다 — 뒤에서 막으면 이미 돈이 기록된 뒤다.
  select * into r from ledger_buyin_requests where id = p_request_id for update;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  -- 세션 단가 · 할인 프리셋. card_amount 는 더 이상 읽지 않는다.
  select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb)
    into v_amt, v_discounts
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_amt := coalesce(v_amt, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  -- 할인 자리번호(1~5) → 금액. 프리셋이 비었거나 0원이면 '할인 없음'으로 기록한다(정가).
  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; v_disc := least(v_disc, v_amt); else v_disc := 0; end if;
  end if;

  if not exists (select 1 from ledger_players lp
                  where lp.venue_id = r.venue_id and lp.session_date = r.session_date
                    and lp.game_seq = p_game_seq and lp.name = r.player_name) then
    select coalesce(max(sort_order) + 1, 0) into v_sort
      from ledger_players where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    insert into ledger_players (venue_id, session_date, game_seq, name, sort_order, created_by)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_sort, auth.uid());
  end if;

  if r.voucher_id is not null then
    p_record_buyin := false;
    select coalesce(max(entry_no), 0) + 1 into v_entry
      from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                           and game_seq = p_game_seq and player_name = r.player_name;
    insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid(), r.id);
  end if;

  if p_record_buyin then
    select coalesce(max(entry_no), 0) + 1 into v_entry
      from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                           and game_seq = p_game_seq and player_name = r.player_name;
    if p_split then
      v_pm := case when coalesce(p_card,0) >= coalesce(p_cash,0) and coalesce(p_card,0) >= coalesce(p_transfer,0) and coalesce(p_card,0) > 0 then 'card'
                   when coalesce(p_transfer,0) > coalesce(p_cash,0) and coalesce(p_transfer,0) > 0 then 'transfer'
                   else 'cash' end;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true,
              coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), v_idx, auth.uid(), r.id);
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      -- 결제수단은 바인 가치를 바꾸지 않는다(오너 지시) — 카드도 현금 단가로 기록한다.
      v_unit := v_amt;
      v_net  := greatest(0, v_unit - v_disc);
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm,
              case when v_pm = 'cash'     then v_net else 0 end,
              case when v_pm = 'card'     then v_net else 0 end,
              case when v_pm = 'transfer' then v_net else 0 end,
              v_idx, auth.uid(), r.id);
    end if;
  end if;

  -- ⚠ 2026-09-12(V01): 전이에도 술어를 둔다 — 거절(20260911b)과 같은 모양.
  --   위 `for update` 가 있으면 여기 도달하지 않지만, 이 함수는 돈과 이용권을 함께 움직이므로 두 겹으로 막는다.
  update ledger_buyin_requests
     set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id and status = 'pending';
  if not found then raise exception '이미 처리된 요청입니다'; end if;
end;
$$;

-- ⚠ CREATE OR REPLACE 는 ACL 을 초기화한다 — 반드시 다시 쓴다.
--   `from anon` 만으로는 무효다(PUBLIC 기본 GRANT). 반드시 `from public`.
revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) to authenticated, service_role;

comment on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) is
  '바인 요청 승인. 2026-09-12(V01): 요청 행을 for update 로 잠그고 전이에 pending 술어를 둬 승인↔거절·승인↔승인 경합을 막는다.';

-- ── 요청당 확정 바인 1건 계약 ────────────────────────────────────────────────
--
-- `ledger_buyins_request_idx`(20260911c:38)는 **nonunique** 라 중복 승인을 막지 못한다.
-- 먼저 중복을 검사해 데이터가 있으면 임의 정리하지 않고 전체 적용을 중단한다. 0건이면 같은
-- 트랜잭션에서 유니크 인덱스를 만들어 함수 잠금뿐 아니라 저장 구조로도 1:1 계약을 고정한다.
do $request_uniq_preflight$
declare v_dup int;
begin
  select count(*) into v_dup
    from (select request_id from public.ledger_buyins
           where request_id is not null
           group by request_id having count(*) > 1) d;
  if v_dup > 0 then
    raise exception 'ABORT: request_id 중복 %건 — 자동 삭제하지 않고 적용을 중단합니다', v_dup;
  end if;
end $request_uniq_preflight$;

create unique index if not exists ledger_buyins_request_uniq
  on public.ledger_buyins (request_id) where request_id is not null;

do $request_uniq_check$
declare v_def text;
begin
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'ledger_buyins_request_uniq';
  if v_def is null
     or not exists (select 1 from pg_index where indexrelid = to_regclass('public.ledger_buyins_request_uniq')
                    and indisunique and indisvalid and indisready)
     or lower(v_def) not like '%unique%'
     or lower(v_def) not like '%(request_id)%'
     or lower(v_def) not like '%request_id is not null%' then
    raise exception 'ABORT: 요청당 확정 바인 1건 유니크가 올바르지 않습니다 — %', coalesce(v_def, 'missing');
  end if;
end $request_uniq_check$;


-- ========================================================================
-- [4/6] 20260912b_voucher_qr_game_seq.sql
--        이용권 QR/전화 사용 — 비로그인 fail-open 차단 + 게임 회차(p_game_seq) 전달
-- ========================================================================

-- 20260912b — 이용권 QR 사용의 게임(메인/사이드) 지정이 서버까지 가지 않던 것 (V06, 2026-09-12 재현)
-- APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened. Activation is separate.
--
-- 근본 원인
--   손님이 사이드 게임 테이블의 바인 QR 을 찍으면 클라이언트(MyVoucherSheet.tsx)는 hit.gameSeq 를
--   plan.gameSeq 로 들고 있었지만, 실제 사용 RPC(redeem_my_voucher_by_qr/_by_phone)는 voucher_id ·
--   venue_id(또는 phone) 만 받아 게임 번호를 서버로 보낼 방법이 아예 없었다.
--   사용 처리는 store_vouchers.status → 'used' 전이에 물린 트리거 voucher_redeem_to_ledger_request
--   (20260818f:68)가 대신 만드는데, 이 트리거는 UPDATE 문 자체에서 촉발되는 것이라 RPC 인자를
--   직접 받을 수 없어 requested_game_seq 를 항상 NULL 로 남겼다.
--   운영자가 그 대기 요청을 승인할 때(planBuyinApprovals, src/lib/buyinApproval.ts) requested_game_seq
--   가 NULL 이면 '지금 보고 있는 게임'으로 대체한다 — 사이드2 QR 로 찍었는데 메인1 을 보며 승인하면
--   메인1 명단에 들어갔다(손님 자산이 엉뚱한 게임으로 새는 결함).
--
-- 고치는 방법 — 소비와 게임 지정을 같은 트랜잭션 안에서 묶는다(소비 후 되돌아가 고치는 비원자 보정 금지)
--   ① redeem_my_voucher_by_qr/_by_phone 에 p_game_seq(smallint, default null)를 더한다(하위호환:
--      기본값이 있어 구버전 클라이언트 호출도 그대로 동작한다).
--   ② UPDATE 직전에 set_config('nuri.voucher_game_seq', ..., true) 로 **트랜잭션 범위** 세션 변수에
--      싣는다(커밋/롤백과 함께 사라진다 — 다른 세션·다음 요청에 새지 않는다).
--   ③ 트리거는 같은 트랜잭션 안에서 그 변수를 읽어 INSERT 문 한 줄에 requested_game_seq 를 채운다 —
--      RPC 가 UPDATE 하나만 실행해도 트리거의 INSERT 까지 원자적으로 게임 번호를 갖는다.
--   ④ p_game_seq 가 왔는데 그 게임이 이미 마감돼 있으면 사용 자체를 거절한다(만료·마감된 게임으로
--      조용히 흘려보내지 않는다) — request_buyin 과 달리 이용권은 즉시 소비되므로 더 엄격하게 막는다.
--
-- 데이터 영향: 0. 컬럼·트리거 시그니처 전부 하위호환(신규 파라미터는 DEFAULT NULL).
--   REVOKE/GRANT 를 같이 적는다 — ⚠ 2026-09-12 실측 정정: CREATE OR REPLACE 는 ACL 을 **보존**하고, 날아가는 것은 DROP+재생성이다
--   (아래에서 옛 2-인자 시그니처를 DROP 하고 3-인자로 **새로 만드는** 경우가 정확히 그것이라 REVOKE/GRANT 가 반드시 필요하다).
--
-- ⚠⚠ 2026-09-13 정정(N04 감사, 적대 반증 생존 · high) — 아래 옛 주장은 **틀렸다**:
--   (옛 문장) "anon 도 실행 가능했다는 뜻은 아니다, 함수 내부가 auth.uid() 를 강제해 실질 피해는 없지만 규약을 맞춘다"
--   그 주장은 **NULL 경로를 놓쳤다.** 옛 가드 `if v_holder is null or v_holder <> auth.uid()` 는 비로그인(anon)에서 auth.uid() 가 NULL 이라
--   `false OR NULL = NULL` → IF 를 **건너뛴다(fail-open)**. 게다가 두 RPC 는 REVOKE 가 저장소 어디에도 없어 PUBLIC EXECUTE 가 잔존했다 —
--   즉 anon 이 voucher_id 만 알면 남의 이용권을 '사용됨' 으로 만들 수 있는 조합이었다(20260829c:131·:160).
--   이번 초안은 ① `auth.uid() is null` 명시 체크 + `is distinct from` ② REVOKE ALL FROM PUBLIC, ANON + authenticated·service_role 재부여
--   ③ search_path = public, pg_temp 로 닫는다(nuri-migration §1·§2·§3 · CLAUDE.md 보안표준 2·3).
--   ⚠ 현재 실피해 0 — 킬스위치 OFF · store_vouchers 0행(2026-09-11 실측). 과장하지 않는다. **기능을 켜는 첫날부터 유효**하다.
--   (approve_buyin_request 의 승인 경합은 별건 — 초안 20260912a 가 `for update` + status 술어 + `if not found` 로 다룬다. 여기 넣지 않는다.)
--   계약: src/api/voucherRedeemNullSafe.migration.test.ts
--
-- 검증(적용 시 라이브에서 트랜잭션 롤백으로): 사이드 게임 QR 스캔 흉내 → redeem_my_voucher_by_qr(...,
--   p_game_seq:=2) 호출 → ledger_buyin_requests.requested_game_seq = 2 확인 → ROLLBACK.
-- 롤백: 파일 하단 참고.
-- ============================================================================

-- ── ① 트리거 — 세션 변수로 넘어온 게임 번호를 requested_game_seq 에 싣는다 ──────────────────
create or replace function public.voucher_redeem_to_ledger_request()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_seq smallint;
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.used_venue_id is not null then
    -- 트랜잭션 범위 세션 변수(is_local=true) — RPC 가 같은 트랜잭션에서 set_config 로 싣는다.
    -- 값이 없거나(구버전 RPC·직접 UPDATE) 빈 문자열이면 NULL — 예전처럼 '게임 미지정' 요청이 된다.
    v_seq := nullif(current_setting('nuri.voucher_game_seq', true), '')::smallint;
    insert into public.ledger_buyin_requests(venue_id, session_date, user_id, player_name, note, status, voucher_id, requested_game_seq)
    select
      new.used_venue_id,
      public.ledger_business_date(new.used_venue_id),
      new.holder_user_id,
      coalesce(nullif(btrim(new.holder_name), ''), '이용권 사용자'),
      '🎟 이용권 사용 — ' || coalesce(nullif(btrim(new.title), ''), '매장이용권') || ' · 수량/현금 확인 후 승인',
      'pending',
      new.id,
      v_seq
    where not exists (
      select 1 from public.ledger_buyin_requests
      where voucher_id = new.id and status <> 'rejected'
    );
  end if;
  return new;
end; $function$;
revoke all on function public.voucher_redeem_to_ledger_request() from public, anon, authenticated;
-- (트리거 함수는 authenticated 실행 권한이 필요 없다 — 20260829c 가 이미 이렇게 회수해 두었다. 유지.)

-- ── ② redeem_my_voucher_by_qr — 게임 지정 + 마감된 게임 명확히 거절 ──────────────────────────
--   set_config 는 반드시 UPDATE **이전에** 부른다 — AFTER 트리거가 그 값을 읽는다.
create or replace function public.redeem_my_voucher_by_qr(p_voucher_id uuid, p_venue_id uuid, p_game_seq smallint default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_holder uuid; v_venue uuid; v_name text; v_exp timestamptz; v_status text; v_biz date;
begin
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  -- NULL-safe(2026-09-13): auth.uid() 가 NULL(비로그인)이면 `<>` 는 NULL 이 되어 IF 를 건너뛰었다(fail-open). 명시 체크 + is distinct from.
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if v_holder is null or v_holder is distinct from auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_venue is distinct from p_venue_id then raise exception '이 매장의 이용권이 아닙니다 (발급 매장에서만 사용 가능)'; end if;
  if v_status = 'used' then raise exception '이미 사용한 이용권입니다 — 지갑의 사용 내역에서 확인할 수 있어요'; end if;
  if v_status = 'revoked' then raise exception '매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'; end if;
  if v_status <> 'active' then raise exception '사용할 수 없는 이용권입니다 (상태: %)', v_status; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  if p_game_seq is not null then
    if p_game_seq < 1 then
      raise exception '게임 번호가 올바르지 않습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    v_biz := public.ledger_business_date(p_venue_id);
    if not exists (
      select 1 from public.ledger_sessions ls
       where ls.venue_id = p_venue_id and ls.session_date = v_biz and ls.game_seq = p_game_seq
    ) then
      raise exception '해당 게임을 찾을 수 없습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    if public.ledger_is_closed(p_venue_id, v_biz, p_game_seq) then
      raise exception '이미 마감된 게임입니다 — 접수대에서 다른 게임으로 다시 요청해 주세요';
    end if;
  end if;
  perform set_config('nuri.voucher_game_seq', coalesce(p_game_seq::text, ''), true);
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end; $function$;
revoke all on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) from public, anon;
grant execute on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) to authenticated, service_role;
-- 이전 2-인자 시그니처는 더 이상 쓰이지 않으므로 남겨두면 그림자 함수가 된다 — 정리한다.
drop function if exists public.redeem_my_voucher_by_qr(uuid, uuid);

-- ── ③ redeem_my_voucher_by_phone — 같은 원리. gameSeq 는 항상 null 이 오지만 시그니처는 맞춘다 ──
create or replace function public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text, p_game_seq smallint default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_holder uuid; v_venue uuid; v_owner uuid; v_ownerphone text; v_norm text; v_name text; v_exp timestamptz; v_status text; v_biz date;
begin
  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_norm) < 9 then raise exception '전화번호를 정확히 입력하세요'; end if;
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  -- NULL-safe(2026-09-13): auth.uid() 가 NULL(비로그인)이면 `<>` 는 NULL 이 되어 IF 를 건너뛰었다(fail-open). 명시 체크 + is distinct from.
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if v_holder is null or v_holder is distinct from auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_status = 'used' then raise exception '이미 사용한 이용권입니다 — 지갑의 사용 내역에서 확인할 수 있어요'; end if;
  if v_status = 'revoked' then raise exception '매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'; end if;
  if v_status <> 'active' then raise exception '사용할 수 없는 이용권입니다 (상태: %)', v_status; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  select owner_id, name into v_owner, v_name from public.venues where id = v_venue;
  select regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.profiles p where p.id = v_owner;
  if v_ownerphone is null or v_ownerphone = '' then
    select regexp_replace(coalesce(contact_phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.venues where id = v_venue;
  end if;
  if v_ownerphone is null or v_ownerphone = '' or v_ownerphone <> v_norm then raise exception '이 매장 업주의 전화번호가 아닙니다'; end if;
  if p_game_seq is not null then
    if p_game_seq < 1 then
      raise exception '게임 번호가 올바르지 않습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    v_biz := public.ledger_business_date(v_venue);
    if not exists (
      select 1 from public.ledger_sessions ls
       where ls.venue_id = v_venue and ls.session_date = v_biz and ls.game_seq = p_game_seq
    ) then
      raise exception '해당 게임을 찾을 수 없습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    if public.ledger_is_closed(v_venue, v_biz, p_game_seq) then
      raise exception '이미 마감된 게임입니다 — 접수대에서 다른 게임으로 다시 요청해 주세요';
    end if;
  end if;
  perform set_config('nuri.voucher_game_seq', coalesce(p_game_seq::text, ''), true);
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  return coalesce(v_name, '매장');
end; $function$;
revoke all on function public.redeem_my_voucher_by_phone(uuid, text, smallint) from public, anon;
grant execute on function public.redeem_my_voucher_by_phone(uuid, text, smallint) to authenticated, service_role;
drop function if exists public.redeem_my_voucher_by_phone(uuid, text);

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK
--   drop function public.redeem_my_voucher_by_qr(uuid, uuid, smallint);
--   drop function public.redeem_my_voucher_by_phone(uuid, text, smallint);
--   create or replace function public.redeem_my_voucher_by_qr(p_voucher_id uuid, p_venue_id uuid) ... (20260829c 본문 그대로)
--   create or replace function public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text) ... (20260829c 본문 그대로)
--   create or replace function public.voucher_redeem_to_ledger_request() ... (20260818f:68 본문 그대로, requested_game_seq 없이)
--   grant execute on function public.redeem_my_voucher_by_qr(uuid, uuid) to public;   -- 되돌리려면(권장하지 않음)
--   grant execute on function public.redeem_my_voucher_by_phone(uuid, text) to public;
-- ============================================================================


-- ========================================================================
-- [5/6] 20260912c_admin_event_ops.sql
--        관리자 이벤트 RPC 8종 + store_vouchers 이벤트 원천참조 2컬럼  ⚠ d 보다 먼저
-- ========================================================================

-- ============================================================================
-- 20260912c — 관리자 이벤트 운영(§6) 서버 경로 + 당첨↔이용권 구조적 참조
--
-- APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened.
-- Activation and campaign data are separate; do not re-run this file on production.
--
-- ── 무엇이 없었나 (2026-09-12 실측) ─────────────────────────────────────────────
--   `event_campaigns` 에 insert/update/delete 정책이 **하나도 없다**(20260906b:84-86 은 select 뿐).
--   `event_cards` 는 `revoke all … from public, anon, authenticated`(:93).
--   즉 service_role 우회 말고는 캠페인을 만들거나 공개·중단·종료할 SQL 경로가 **존재하지 않았다.**
--   관리자는 지금까지 DB 콘솔에서 직접 SQL 을 쳐야 했고, 그건 감사도 검증도 없는 경로다.
--
-- ── 이 파일이 하는 일 ────────────────────────────────────────────────────────
--   ① store_vouchers 에 `event_campaign_id` · `event_card_idx` 를 **추가(nullable)** 하고
--      open_event_card 가 채우게 한다. 지금은 당첨↔이용권이 note 문자열
--      (`format('%s 당첨 · %s번 카드', …)`, 20260906b:249)로만 이어져 있다 — 제목에 '·' 가 들어가거나
--      캠페인명을 바꾸는 순간 끊기는 연결이다.
--      ⚠ **비파괴**: 기존 행은 NULL 로 남고 소비자는 note 폴백을 그대로 쓴다. 백필하지 않는다
--        (옛 note 를 파싱해 되채우면 파싱이 틀린 행에 **틀린 캠페인**을 박아 넣게 된다 — 없는 것보다 나쁘다).
--      `on delete set null` — 캠페인을 지워도 손님 지갑의 이용권은 절대 사라지지 않는다.
--   ② 관리자 RPC 7종. **테이블 정책은 한 줄도 새로 열지 않는다** — 변경은 전부 SECURITY DEFINER 안이고
--      RLS 표면은 20260906b 그대로다(= 이 파일을 되돌려도 권한이 넓어진 채 남지 않는다).
--
-- ── 지키는 계약 (하나라도 빠지면 파일 하단 자가검사가 전체를 롤백시킨다) ──────────
--   · 관리자 가드는 **`my_role() is distinct from 'admin'::user_role`**.
--     `<>` 는 비로그인(auth.uid()=NULL)에서 NULL 이 되어 if 를 건너뛴다 = 가드가 열린다(20260820a 실사고).
--   · `security definer` + `set search_path = public, pg_temp` 전부.
--   · `revoke all … from public, anon` + `grant … to authenticated, service_role`.
--     `from anon` 만으로는 **무효** — PUBLIC 기본 GRANT 가 남는다. `create or replace` 는 ACL 을
--     초기화하므로 재정의 뒤 REVOKE/GRANT 를 다시 쓴다(open_event_card 가 그 경우다).
--   · **발급 주체는 서버가 유도한다** — `issued_by := auth.uid()`. 클라이언트가 보낸 이름·id 를 쓰지 않는다
--     (옛 seed 는 `where name = '로티아레나'` / `role='admin' order by id limit 1` 로 **첫 매장·첫 관리자**를
--      문자열로 골랐다 — 그게 §6 이 금지한 바로 그 방식이다).
--   · **셔플은 서버에서만.** 클라이언트가 자리 배치를 정하면 당첨 자리를 고를 수 있다.
--     자리 배치는 `order by random()` 으로 서버가 만들고, 응답·감사기록 어디에도 자리별 등급을 싣지 않는다.
--   · **공개 이후 배치 변경 불가.** 구성·삭제는 `status = 'draft'` 에서만.
--   · 감사기록(`public._audit`, 20260623q append-only)을 생성·구성·공개·종료·삭제 다섯 단계 전부에 건다.
--
-- ── 일부러 만들지 않은 것 (§6 이 금지한 것) ────────────────────────────────────
--   열린 카드 닫기 · 당첨자 변경 · 특정 사용자 당첨 강제 · 판 초기화(다음 회차는 새 캠페인이다).
--   관리자용 '미개봉 자리 보기' 도 없다 — 목록·검증은 **집계만** 돌려준다.
--
-- 멱등: add column if not exists / create or replace / drop … if exists. 두 번 실행해도 같다.
-- 롤백: 파일 맨 아래 ROLLBACK 절 참조.
-- ============================================================================

-- ── ⓪ 당첨 → 이용권 구조적 참조 (비파괴) ────────────────────────────────────
alter table public.store_vouchers
  add column if not exists event_campaign_id uuid references public.event_campaigns(id) on delete set null;
alter table public.store_vouchers
  add column if not exists event_card_idx int;

comment on column public.store_vouchers.event_campaign_id is
  '이 이용권을 만든 이벤트 캠페인. NULL = 이벤트 발급이 아니거나 20260912c 이전에 발급된 행(그 행들은 note 문자열 폴백으로 읽는다 — 백필하지 않는다). (20260912c)';
comment on column public.store_vouchers.event_card_idx is
  '이 이용권을 만든 카드 자리 번호. event_campaign_id 와 짝. (20260912c)';

create index if not exists store_vouchers_event_src_idx
  on public.store_vouchers(event_campaign_id, event_card_idx)
  where event_campaign_id is not null;

-- 모든 매장 출석을 대상으로 하는 초안/진행 이벤트는 하나만 허용한다. 함수의 EXISTS 검사는
-- 친절한 안내용이고, 이 유니크 인덱스가 동시 생성 경합까지 원자적으로 막는 최종 방어선이다.
create unique index if not exists event_campaigns_one_global_open_idx
  on public.event_campaigns ((true))
  where ticket_venue_id is null and status in ('draft', 'live');

-- ── ① open_event_card — 20260906b 정의 + 원천 참조 두 컬럼 ────────────────────
-- 손님 경로의 **동작은 한 글자도 바꾸지 않는다**. insert 열 목록에 두 컬럼이 붙을 뿐이다.
-- (20260906b 의 잠금 순서·본인인증 게이트·발급 한도 차감·알림 실패 무시가 전부 그대로여야 한다 —
--  자가검사가 그 다섯 가지를 prosrc 로 확인한다.)
create or replace function public.open_event_card(p_slug text, p_idx int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_c record; v_card record; v_ticket uuid; v_name text; v_quota int; v_vname text;
begin
  if auth.uid() is null then raise exception '로그인 후 참여할 수 있습니다'; end if;

  select * into v_c from public.event_campaigns where slug = p_slug;
  if v_c is null or v_c.status <> 'live' then raise exception '진행 중인 이벤트가 아닙니다'; end if;
  if (v_c.starts_at is not null and now() < v_c.starts_at)
     or (v_c.ends_at is not null and now() > v_c.ends_at) then
    raise exception '이벤트 기간이 아닙니다';
  end if;

  -- ⚠ 본인인증 게이트는 **카드를 열기 전에** 본다. 열고 나서 발급 단계에서 막으면
  --   참여권과 카드만 사라지고 손님은 아무것도 못 받는다(되돌릴 방법이 없다).
  if public.identity_gate_on() and not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '본인인증을 완료해야 참여할 수 있습니다 — 내 정보 > 보안에서 인증을 마쳐 주세요';
  end if;

  -- 참여권 한 장을 잠그고 집는다(skip locked: 동시에 여러 번 눌러도 각각 다른 장을 집는다)
  select id into v_ticket from public.event_tickets
   where campaign_id = v_c.id and user_id = auth.uid() and used_at is null
   order by created_at limit 1 for update skip locked;
  if v_ticket is null then
    raise exception '참여권이 없습니다 — 매장 출석 QR을 찍으면 1장 지급됩니다';
  end if;

  -- 카드를 잠근다 — 둘이 같은 자리를 동시에 열 수 없다
  select * into v_card from public.event_cards
   where campaign_id = v_c.id and idx = p_idx for update;
  if v_card is null then raise exception '없는 카드입니다'; end if;
  if v_card.opened_at is not null then
    raise exception '이미 열린 카드예요 — 다른 카드를 골라 주세요';
  end if;

  select coalesce(nickname, name) into v_name from public.profiles where id = auth.uid();

  update public.event_cards
     set opened_by = auth.uid(), opened_name = v_name, opened_at = now()
   where campaign_id = v_c.id and idx = p_idx;
  update public.event_tickets set used_idx = p_idx, used_at = now() where id = v_ticket;

  if v_card.voucher_count > 0 then
    -- 발급 한도 차감 — issue_voucher 와 같은 불변식(20260906b 헤더 주석 참조)
    select voucher_quota into v_quota from public.venues where id = v_c.venue_id for update;
    if coalesce(v_quota, 0) < v_card.voucher_count then
      raise exception '매장 발급 한도가 부족합니다 — 매장에 문의해 주세요';
    end if;
    update public.venues set voucher_quota = voucher_quota - v_card.voucher_count
     where id = v_c.venue_id;

    -- ⚠ event_campaign_id · event_card_idx 가 **구조적 원천 참조**다(§7 "제목/note 파싱으로 연결하지 않는다").
    --   note 는 사람이 읽는 설명으로만 남긴다 — 지우면 기존 지갑 화면의 문구가 사라지므로 유지한다.
    insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name,
                                      title, note, expires_at, issue_reason,
                                      event_campaign_id, event_card_idx)
    select v_c.venue_id, v_c.issued_by, auth.uid(), v_name,
           v_c.voucher_title,
           -- 대회 입상 문구(순위·시상·입상·우승)를 쓰지 않는다 — 성격이 다른 경품이다
           format('%s 당첨 · %s번 카드', v_c.title, p_idx),
           v_c.voucher_expires_at, 'event',
           v_c.id, p_idx
      from generate_series(1, v_card.voucher_count);

    begin
      select name into v_vname from public.venues where id = v_c.venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (auth.uid(), 'system', '🎉 이벤트 당첨!',
              format('%s에서 ''%s'' %s장을 받았어요. 지갑에서 확인하세요',
                     coalesce(v_vname, '매장'), v_c.voucher_title, v_card.voucher_count),
              '🎉', '#FFD100', '/wallet');
    exception when others then null;   -- 알림 실패가 당첨을 되돌리면 안 된다
    end;
  end if;

  return jsonb_build_object('idx', p_idx, 'tier', v_card.tier,
                            'voucherCount', v_card.voucher_count,
                            'voucherTitle', v_c.voucher_title);
end $function$;

-- create or replace 는 ACL 을 PUBLIC 기본 GRANT 로 되돌린다 → 20260906b:269-270 을 그대로 다시 쓴다.
revoke all on function public.open_event_card(text, int) from public, anon;
grant execute on function public.open_event_card(text, int) to authenticated, service_role;

-- ── ② 검증 로직 (내부 전용) ─────────────────────────────────────────────────
-- 검증 RPC 와 공개 RPC 가 **같은 코드**를 봐야 한다. 두 벌로 두면 화면은 통과라 하고 공개는 거절하거나,
-- 더 나쁘게는 그 반대가 된다. `_` 접두 = 클라이언트 롤 전면 회수(직접 호출 차단).
create or replace function public._event_campaign_problems(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_c record; v_p jsonb := '[]'::jsonb;
  v_cards int; v_prize int; v_vouchers int; v_quota int; v_approved boolean; v_mixed int; v_maxidx int;
begin
  select * into v_c from public.event_campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false,
      'problems', jsonb_build_array(jsonb_build_object(
        'code', 'not_found', 'field', 'campaign', 'message', '캠페인을 찾을 수 없습니다')));
  end if;

  select count(*), count(*) filter (where tier is not null),
         coalesce(sum(voucher_count), 0), coalesce(max(idx), 0)
    into v_cards, v_prize, v_vouchers, v_maxidx
    from public.event_cards where campaign_id = p_campaign_id;

  -- 같은 등급에 서로 다른 이용권 장수가 섞여 있으면 확률 표의 `max(voucher_count)` 집계가
  -- **실제와 다른 경품**을 고지한다(event_board 의 voucherByTier — 20260906b:160-163). 그건 허위 고지다.
  select count(*) into v_mixed from (
    select tier from public.event_cards
     where campaign_id = p_campaign_id and tier is not null
     group by tier having count(distinct voucher_count) > 1
  ) s;

  select coalesce(voucher_quota, 0), coalesce(voucher_issue_approved, false)
    into v_quota, v_approved from public.venues where id = v_c.venue_id;

  if v_cards = 0 then
    v_p := v_p || jsonb_build_object('code', 'no_cards', 'field', 'cards',
      'message', '카드가 아직 구성되지 않았습니다 — 카드판에서 수량을 정하고 생성하세요');
  elsif v_maxidx <> v_cards then
    v_p := v_p || jsonb_build_object('code', 'idx_gap', 'field', 'cards',
      'message', format('카드 자리 번호가 1~%s 로 이어지지 않습니다 (총 %s장, 마지막 번호 %s)', v_cards, v_cards, v_maxidx));
  end if;
  if v_cards > 0 and v_prize = 0 then
    v_p := v_p || jsonb_build_object('code', 'no_prize', 'field', 'tiers',
      'message', '당첨 카드가 0장입니다 — 전부 꽝인 판은 공개할 수 없습니다');
  end if;
  if v_mixed > 0 then
    v_p := v_p || jsonb_build_object('code', 'tier_voucher_mixed', 'field', 'tiers',
      'message', '같은 등급에 이용권 장수가 서로 다른 카드가 섞여 있습니다 — 확률 표가 실제와 달라집니다');
  end if;
  if v_c.starts_at is not null and v_c.ends_at is not null and v_c.starts_at >= v_c.ends_at then
    v_p := v_p || jsonb_build_object('code', 'period_inverted', 'field', 'endsAt',
      'message', '종료 시각이 시작 시각보다 빠르거나 같습니다');
  end if;
  if v_c.ends_at is not null and v_c.ends_at <= now() then
    v_p := v_p || jsonb_build_object('code', 'ends_in_past', 'field', 'endsAt',
      'message', '종료 시각이 이미 지났습니다');
  end if;
  if v_c.voucher_expires_at is not null and v_c.voucher_expires_at <= now() then
    v_p := v_p || jsonb_build_object('code', 'voucher_expired', 'field', 'voucherExpiresAt',
      'message', '경품 이용권 유효기간이 이미 지났습니다 — 받는 즉시 만료된 이용권이 발급됩니다');
  elsif v_c.voucher_expires_at is not null and v_c.ends_at is not null
        and v_c.voucher_expires_at < v_c.ends_at then
    v_p := v_p || jsonb_build_object('code', 'voucher_expires_before_end', 'field', 'voucherExpiresAt',
      'message', '경품 이용권이 이벤트 종료보다 먼저 만료됩니다 — 마지막에 당첨된 손님이 쓰지 못합니다');
  end if;
  if not v_approved then
    v_p := v_p || jsonb_build_object('code', 'venue_not_approved', 'field', 'venueId',
      'message', '이 매장은 이용권 발급이 승인되지 않았습니다 — 매장 관리에서 먼저 승인하세요');
  end if;
  -- 남은 당첨 카드와 매장 공용 발급 한도는 다르다(§7). 한도가 모자라면 마지막 당첨자들이
  -- '한도 부족' 으로 아무것도 못 받는다 — 공개 전에 막는다. 여기서 한도를 **올리지 않는다**.
  if v_vouchers > coalesce(v_quota, 0) then
    v_p := v_p || jsonb_build_object('code', 'quota_short', 'field', 'venueId',
      'message', format('필요한 이용권 %s장이 매장 발급 한도 %s장을 넘습니다', v_vouchers, coalesce(v_quota, 0)));
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_p) = 0,
    'problems', v_p,
    'summary', jsonb_build_object(
      'status', v_c.status, 'slug', v_c.slug, 'title', v_c.title,
      'totalCards', v_cards, 'prizeCards', v_prize, 'totalVouchers', v_vouchers,
      'venueQuota', coalesce(v_quota, 0), 'venueApproved', v_approved));
end $fn$;

revoke all on function public._event_campaign_problems(uuid) from public, anon, authenticated;
grant execute on function public._event_campaign_problems(uuid) to service_role;

-- ── ③ 목록 ──────────────────────────────────────────────────────────────────
-- ⚠ **집계만** 내려보낸다. 자리별 등급(event_cards.tier + idx)은 어떤 경로로도 나가지 않는다 —
--    관리자에게도 진행 중 미개봉 당첨 위치를 공개하지 않는다(§6 카드판).
create or replace function public.admin_list_event_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v_out jsonb;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트 목록을 조회할 수 있습니다';
  end if;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r."createdAt" desc), '[]'::jsonb)
    into v_out
  from (
    select
      c.id, c.slug, c.title, c.subtitle, c.status,
      c.created_at as "createdAt",
      c.starts_at   as "startsAt",
      c.ends_at     as "endsAt",
      c.venue_id    as "venueId",
      v.name        as "venueName",
      c.ticket_venue_id as "ticketVenueId",
      tv.name       as "ticketVenueName",
      c.voucher_title as "voucherTitle",
      c.voucher_expires_at as "voucherExpiresAt",
      c.issued_by   as "issuedBy",
      coalesce(ip.nickname, ip.name) as "issuedByName",
      coalesce(v.voucher_quota, 0)   as "venueQuota",
      coalesce(v.voucher_issue_approved, false) as "venueApproved",
      coalesce(cc.total, 0)          as "totalCards",
      coalesce(cc.opened, 0)         as "openedCards",
      coalesce(cc.total, 0) - coalesce(cc.opened, 0) as "remainCards",
      coalesce(cc.prize, 0)          as "prizeCards",
      coalesce(cc.prize_left, 0)     as "remainPrizeCards",
      coalesce(cc.vouchers, 0)       as "totalVouchers",
      coalesce(cc.vouchers_won, 0)   as "wonVouchers",
      coalesce(tk.issued, 0)         as "ticketsIssued",
      coalesce(tk.used, 0)           as "ticketsUsed",
      coalesce(sv.issued, 0)         as "vouchersIssued",
      coalesce(sv.used, 0)           as "vouchersUsed"
    from public.event_campaigns c
    left join public.venues   v  on v.id  = c.venue_id
    left join public.venues   tv on tv.id = c.ticket_venue_id
    left join public.profiles ip on ip.id = c.issued_by
    left join lateral (
      select count(*) as total,
             count(*) filter (where opened_at is not null) as opened,
             count(*) filter (where tier is not null) as prize,
             count(*) filter (where tier is not null and opened_at is null) as prize_left,
             coalesce(sum(voucher_count), 0) as vouchers,
             coalesce(sum(voucher_count) filter (where opened_at is not null), 0) as vouchers_won
        from public.event_cards where campaign_id = c.id
    ) cc on true
    left join lateral (
      select count(*) as issued, count(*) filter (where used_at is not null) as used
        from public.event_tickets where campaign_id = c.id
    ) tk on true
    -- 구조적 참조(⓪)로 센다. note 파싱으로 세면 제목에 '·' 하나만 들어가도 숫자가 틀린다.
    left join lateral (
      select count(*) as issued, count(*) filter (where used_at is not null) as used
        from public.store_vouchers where event_campaign_id = c.id
    ) sv on true
  ) r;

  return v_out;
end $fn$;

revoke all on function public.admin_list_event_campaigns() from public, anon;
grant execute on function public.admin_list_event_campaigns() to authenticated, service_role;

-- ── ④ 초안 생성 ─────────────────────────────────────────────────────────────
create or replace function public.admin_create_event_campaign(
  p_venue_id uuid, p_slug text, p_title text, p_subtitle text default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null,
  p_ticket_venue_id uuid default null,
  p_voucher_title text default '매장이용권', p_voucher_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_id uuid; v_slug text; v_title text; v_vt text;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 만들 수 있습니다';
  end if;

  v_slug  := lower(btrim(coalesce(p_slug, '')));
  v_title := btrim(coalesce(p_title, ''));
  v_vt    := btrim(coalesce(p_voucher_title, ''));

  -- 허용 목록으로 판단한다 — `?event=<slug>` 로 밖에서 들어오는 값이라 거부 목록이면 빠뜨린 글자가 곧 구멍이다.
  -- ⚠ `src/api/events.ts` 의 `isEventSlug` 와 **같은 집합이 아니다**: 그쪽은 대문자도 통과시키고
  --   여기는 소문자만 받는다(=서버가 더 좁다). 의도한 것이다 — 주소는 대소문자로 갈리면 안 되고,
  --   위에서 `lower()` 로 내려 받으므로 서버가 만든 slug 는 언제나 앱의 집합 **안에** 들어간다
  --   (좁은 쪽이 서버라 "서버가 만든 걸 앱이 거부" 하는 방향은 발생하지 않는다).
  --   화면도 대문자를 미리 거절한다(EventOpsAdmin.tsx 의 소문자 안내).
  if v_slug !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception '링크 주소(slug)는 영문 소문자·숫자로 시작하고 영문 소문자·숫자·-·_ 만 쓸 수 있습니다 (최대 64자)';
  end if;
  if v_title = '' then raise exception '이벤트 제목을 입력해 주세요'; end if;
  if v_vt = ''    then raise exception '경품 이용권 이름을 입력해 주세요'; end if;
  if p_venue_id is null then raise exception '매장을 선택해 주세요'; end if;
  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception '매장을 찾을 수 없습니다';
  end if;
  if p_ticket_venue_id is not null
     and not exists (select 1 from public.venues where id = p_ticket_venue_id) then
    raise exception '참여권 지급 매장을 찾을 수 없습니다';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_starts_at >= p_ends_at then
    raise exception '종료 시각이 시작 시각보다 빠르거나 같습니다';
  end if;
  if exists (select 1 from public.event_campaigns where slug = v_slug) then
    raise exception '이미 쓰고 있는 링크 주소입니다 — 다른 주소를 입력해 주세요';
  end if;

  -- §7 — ticket_venue_id = NULL 은 '모든 매장 출석' 이다. 그런 판이 둘 이상 살아 있으면
  -- 출석 **한 번**에 판마다 참여권이 각각 생긴다. 사업 정책이 정해지기 전까지 그 모호한 중복을 막는다.
  -- (기존 로티 캠페인은 그대로 둔다 — 새로 만드는 쪽만 매장을 지정하게 한다.)
  if p_ticket_venue_id is null and exists (
    select 1 from public.event_campaigns
     where ticket_venue_id is null and status in ('draft', 'live')
  ) then
    raise exception '참여권을 모든 매장 출석에 주는 이벤트가 이미 있습니다 — 이 이벤트는 참여권 지급 매장을 지정해 주세요';
  end if;

  insert into public.event_campaigns(
    slug, venue_id, issued_by, title, subtitle, status,
    starts_at, ends_at, ticket_venue_id, voucher_title, voucher_expires_at)
  values (
    v_slug, p_venue_id,
    -- 발급 주체는 **서버가 유도한다**. 클라이언트가 보낸 이름·id 를 믿지 않는다(§6 초안).
    auth.uid(),
    v_title, nullif(btrim(coalesce(p_subtitle, '')), ''), 'draft',
    p_starts_at, p_ends_at, p_ticket_venue_id, v_vt, p_voucher_expires_at)
  returning id into v_id;

  perform public._audit('admin_create_event_campaign', v_id::text,
    jsonb_build_object('slug', v_slug, 'venue_id', p_venue_id, 'title', v_title,
                       'ticket_venue_id', p_ticket_venue_id));

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'status', 'draft');
end $fn$;

revoke all on function public.admin_create_event_campaign(uuid, text, text, text, timestamptz, timestamptz, uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_create_event_campaign(uuid, text, text, text, timestamptz, timestamptz, uuid, text, timestamptz) to authenticated, service_role;

-- ── ⑤ 카드판 구성 — **서버 셔플** ────────────────────────────────────────────
-- p_tiers = [{"tier":1,"cards":1,"vouchers":10}, {"tier":4,"cards":11,"vouchers":1}, …]
-- 클라이언트는 **수량만** 보낸다. 자리 배치를 보내면 당첨 자리를 고를 수 있다.
create or replace function public.admin_compose_event_cards(
  p_campaign_id uuid, p_total int, p_tiers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_prize int; v_vouchers int; v_rows int;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 카드판을 구성할 수 있습니다';
  end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  -- 공개 이후 위치별 등급 배치와 이미 열린 결과는 바꿀 수 없다(§6). 다음 행사는 **새 회차**다.
  if v_c.status <> 'draft' then
    raise exception '초안(준비 중) 상태에서만 카드판을 구성할 수 있습니다 — 이미 공개된 판의 배치는 바꿀 수 없습니다';
  end if;

  if p_total is null or p_total < 1 or p_total > 1000 then
    raise exception '총 카드 수는 1~1000장 사이여야 합니다';
  end if;
  if jsonb_typeof(coalesce(p_tiers, 'null'::jsonb)) is distinct from 'array'
     or jsonb_array_length(p_tiers) = 0 then
    raise exception '등급 구성을 한 줄 이상 입력해 주세요';
  end if;

  -- 타입 검사를 **먼저** 끝낸다. 캐스팅과 범위 검사를 한 OR 안에 섞으면 평가 순서 보장이 없어
  -- 문자열이 들어왔을 때 캐스팅이 먼저 터지고 우리 문장 대신 Postgres 내부 오류가 나간다.
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where jsonb_typeof(e->'tier') is distinct from 'number'
        or jsonb_typeof(e->'cards') is distinct from 'number'
        or jsonb_typeof(e->'vouchers') is distinct from 'number'
  ) then
    raise exception '등급·카드 수·이용권 장수는 숫자여야 합니다';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where (e->>'tier')::numeric     <> trunc((e->>'tier')::numeric)
        or (e->>'cards')::numeric    <> trunc((e->>'cards')::numeric)
        or (e->>'vouchers')::numeric <> trunc((e->>'vouchers')::numeric)
  ) then
    raise exception '등급·카드 수·이용권 장수는 정수여야 합니다 (소수 불가)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where (e->>'tier')::int not between 1 and 4
        or (e->>'cards')::int < 0 or (e->>'cards')::int > p_total
        or (e->>'vouchers')::int < 0 or (e->>'vouchers')::int > 100
  ) then
    raise exception '등급은 1~4등, 카드 수는 0~총 카드 수, 이용권은 0~100장 범위여야 합니다';
  end if;
  if (select count(distinct (e->>'tier')::int) from jsonb_array_elements(p_tiers) e)
     <> (select count(*) from jsonb_array_elements(p_tiers) e) then
    raise exception '같은 등급이 두 번 들어 있습니다 — 등급당 한 줄로 입력해 주세요';
  end if;
  -- 당첨인데 이용권 0장이면 손님은 '당첨' 을 보고 아무것도 못 받는다.
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where (e->>'cards')::int > 0 and (e->>'vouchers')::int < 1
  ) then
    raise exception '당첨 등급의 이용권 장수는 1장 이상이어야 합니다';
  end if;

  select coalesce(sum((e->>'cards')::int), 0),
         coalesce(sum((e->>'cards')::int * (e->>'vouchers')::int), 0)
    into v_prize, v_vouchers
    from jsonb_array_elements(p_tiers) e;
  if v_prize > p_total then
    raise exception '등급별 카드 수의 합(%장)이 총 카드 수(%장)보다 많습니다', v_prize, p_total;
  end if;
  if v_prize = 0 then
    raise exception '당첨 카드가 0장입니다 — 전부 꽝인 판은 만들 수 없습니다';
  end if;

  -- 초안이므로 개봉 이력이 있을 수 없다. 그래도 방어적으로 확인한다 —
  -- 손으로 status 를 draft 로 되돌린 판이 있으면 여기서 이력이 지워진다.
  if exists (select 1 from public.event_cards
              where campaign_id = p_campaign_id and opened_at is not null) then
    raise exception '이미 열린 카드가 있는 판입니다 — 배치를 다시 만들 수 없습니다';
  end if;

  delete from public.event_cards where campaign_id = p_campaign_id;

  -- ⚠ 자리 배치는 **서버가** 무작위로 만든다. 자리 번호와 등급 사이에 규칙이 없어야 한다.
  --   (아래 한 줄의 문자열을 자가검사가 찾는다 — 그래서 이 주석에는 그 표현을 쓰지 않는다.
  --    prosrc 에는 주석도 들어가므로, 주석이 검사를 대신 통과시켜 주면 검사가 무의미해진다.)
  with prizes as (
    select (e->>'tier')::int as tier, (e->>'vouchers')::int as cnt
      from jsonb_array_elements(p_tiers) e,
           lateral generate_series(1, (e->>'cards')::int)
  ),
  padded as (
    select tier, cnt from prizes
    union all
    select null::int, 0 from generate_series(1, p_total - v_prize)
  ),
  shuffled as (
    select row_number() over (order by random()) as idx, tier, cnt from padded
  )
  insert into public.event_cards(campaign_id, idx, tier, voucher_count)
  select p_campaign_id, idx, tier, cnt from shuffled;
  get diagnostics v_rows = row_count;

  -- ⚠ 감사기록에 **자리별 등급을 남기지 않는다**. 남기면 audit_log 를 읽을 수 있는 관리자가
  --   미개봉 당첨 위치를 전부 알게 된다 — §6·§10 이 금지한 바로 그 유출이다.
  perform public._audit('admin_compose_event_cards', p_campaign_id::text,
    jsonb_build_object('total', v_rows, 'prize_cards', v_prize, 'total_vouchers', v_vouchers,
                       'tiers', p_tiers));

  return jsonb_build_object('campaignId', p_campaign_id, 'totalCards', v_rows,
                            'prizeCards', v_prize, 'totalVouchers', v_vouchers);
end $fn$;

revoke all on function public.admin_compose_event_cards(uuid, int, jsonb) from public, anon;
grant execute on function public.admin_compose_event_cards(uuid, int, jsonb) to authenticated, service_role;

-- ── ⑥ 검증(읽기) ────────────────────────────────────────────────────────────
create or replace function public.admin_validate_event_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 검증할 수 있습니다';
  end if;
  return public._event_campaign_problems(p_campaign_id);
end $fn$;

revoke all on function public.admin_validate_event_campaign(uuid) from public, anon;
grant execute on function public.admin_validate_event_campaign(uuid) to authenticated, service_role;

-- ── ⑦ 공개 (draft → live, 원자적) ───────────────────────────────────────────
create or replace function public.admin_publish_event_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_chk jsonb; v_rows int;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 공개할 수 있습니다';
  end if;

  -- 행을 먼저 잠근다 — 두 관리자가 동시에 눌러도 한 번만 공개된다.
  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status = 'live'  then raise exception '이미 진행 중인 이벤트입니다'; end if;
  if v_c.status = 'ended' then raise exception '이미 종료된 이벤트입니다 — 다음 회차는 새 캠페인으로 만들어 주세요'; end if;

  -- ⚠ 검증은 **잠금 안에서 다시** 돈다. 화면에서 통과했더라도 그 사이 매장 한도가 다른 발급으로
  --   빠져나갔을 수 있다(§7 "다른 발급 경로가 한도를 소진"). 화면의 통과는 약속이 아니다.
  v_chk := public._event_campaign_problems(p_campaign_id);
  if not (v_chk->>'ok')::boolean then
    raise exception '공개할 수 없습니다: %', coalesce(
      (select string_agg(p->>'message', ' / ') from jsonb_array_elements(v_chk->'problems') p),
      '검증에 실패했습니다');
  end if;

  update public.event_campaigns
     set status = 'live', starts_at = coalesce(starts_at, now())
   where id = p_campaign_id and status = 'draft';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '공개에 실패했습니다 — 상태가 방금 바뀌었습니다. 목록을 새로고침해 주세요';
  end if;

  perform public._audit('admin_publish_event_campaign', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'summary', v_chk->'summary'));

  return jsonb_build_object('id', p_campaign_id, 'slug', v_c.slug, 'status', 'live');
end $fn$;

revoke all on function public.admin_publish_event_campaign(uuid) from public, anon;
grant execute on function public.admin_publish_event_campaign(uuid) to authenticated, service_role;

-- ── ⑧ 종료 ──────────────────────────────────────────────────────────────────
-- 종료해도 카드·참여권·발급 이용권·감사 이력은 **그대로 둔다**(§6 상태·복사). 지우는 경로는 없다.
create or replace function public.admin_end_event_campaign(p_campaign_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_rows int;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 종료할 수 있습니다';
  end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status = 'draft' then raise exception '아직 공개되지 않은 초안입니다 — 종료 대신 삭제를 쓰세요'; end if;
  if v_c.status = 'ended' then raise exception '이미 종료된 이벤트입니다'; end if;

  update public.event_campaigns set status = 'ended' where id = p_campaign_id and status = 'live';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '종료에 실패했습니다 — 상태가 방금 바뀌었습니다. 목록을 새로고침해 주세요';
  end if;

  perform public._audit('admin_end_event_campaign', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'reason', left(btrim(coalesce(p_reason, '')), 500)));

  return jsonb_build_object('id', p_campaign_id, 'slug', v_c.slug, 'status', 'ended');
end $fn$;

revoke all on function public.admin_end_event_campaign(uuid, text) from public, anon;
grant execute on function public.admin_end_event_campaign(uuid, text) to authenticated, service_role;

-- ── ⑨ 초안 삭제 — 참조·발급·개봉 이력이 **하나도 없을 때만** ────────────────────
create or replace function public.admin_delete_event_draft(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 초안을 삭제할 수 있습니다';
  end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status <> 'draft' then
    raise exception '공개되었거나 종료된 이벤트는 삭제할 수 없습니다 — 결과·이용권·감사 이력을 보존합니다';
  end if;
  if exists (select 1 from public.event_cards
              where campaign_id = p_campaign_id and opened_at is not null) then
    raise exception '이미 열린 카드가 있어 삭제할 수 없습니다';
  end if;
  if exists (select 1 from public.event_tickets where campaign_id = p_campaign_id) then
    raise exception '이미 지급된 참여권이 있어 삭제할 수 없습니다';
  end if;
  -- 구조적 참조(⓪)로 확인한다. note 파싱으로 확인하면 못 찾은 이용권이 고아가 된다.
  if exists (select 1 from public.store_vouchers where event_campaign_id = p_campaign_id) then
    raise exception '이 이벤트로 발급된 이용권이 있어 삭제할 수 없습니다';
  end if;

  perform public._audit('admin_delete_event_draft', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'title', v_c.title, 'venue_id', v_c.venue_id));

  delete from public.event_cards where campaign_id = p_campaign_id;
  delete from public.event_campaigns where id = p_campaign_id;

  return jsonb_build_object('id', p_campaign_id, 'deleted', true);
end $fn$;

revoke all on function public.admin_delete_event_draft(uuid) from public, anon;
grant execute on function public.admin_delete_event_draft(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── 자가검사 ─────────────────────────────────────────────────────────────────
-- 존재·ACL 만 보면 핵심 동작이 빠져도 통과한다 → prosrc 를 **strpos** 로 본다.
-- (LIKE 는 '_' 가 단일문자 와일드카드라 의도보다 느슨해진다 — 20260911i·k 가 같은 함정을 기록.)
-- 여기서 찾는 문자열이 각 함수의 본문 주석에 등장하지 않는지 확인해 두었다.
do $check$
declare
  v_oid oid; v_cfg text[]; v_acl aclitem[]; v_src text; v_def text; v_n int;
  v_fn text;
  -- ⚠ 이름으로만 찾는다. `pg_get_function_identity_arguments` 는 **파라미터 이름까지** 돌려주므로
  --    ('p_user_id uuid, p_reason text') 타입만 적어 비교하면 **영원히 일치하지 않아** 자가검사가
  --    '함수가 없다' 로 오탐한다(컨테이너 실행으로 확인 — 20260911k 에 같은 함정이 남아 있다).
  --    대신 오버로드가 하나뿐인지를 따로 확인해 이름 매칭의 모호함을 없앤다.
  v_mut text[] := array[
    'admin_create_event_campaign', 'admin_compose_event_cards', 'admin_validate_event_campaign',
    'admin_list_event_campaigns', 'admin_publish_event_campaign', 'admin_end_event_campaign',
    'admin_delete_event_draft', 'open_event_card'
  ];
  i int;
begin
  -- ① 공통 계약: 존재 · SECURITY DEFINER · search_path · ACL
  for i in 1 .. array_length(v_mut, 1) loop
    v_fn := v_mut[i];
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_n = 0 then
      raise exception 'ABORT: public.% 가 생성되지 않았습니다', v_fn;
    end if;
    if v_n > 1 then
      raise exception 'ABORT: public.% 오버로드가 %개입니다 — 옛 시그니처가 남아 있으면 PostgREST 가 어느 쪽을 부를지 모른다', v_fn, v_n;
    end if;
    select p.oid, p.proconfig, p.proacl, p.prosrc into v_oid, v_cfg, v_acl, v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'ABORT: % 가 SECURITY DEFINER 가 아닙니다', v_fn;
    end if;
    if v_cfg is null or not exists (select 1 from unnest(v_cfg) c where c like 'search_path=%pg_temp%') then
      raise exception 'ABORT: % 의 search_path 가 public, pg_temp 로 고정되지 않았습니다', v_fn;
    end if;
    if v_acl is null then
      raise exception 'ABORT: % 의 EXECUTE 가 PUBLIC 기본 GRANT 상태입니다(REVOKE 누락 — from anon 만으로는 무효)', v_fn;
    end if;
    if has_function_privilege('anon', v_oid, 'execute') then
      raise exception 'ABORT: anon 이 % 를 실행할 수 있습니다', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'ABORT: authenticated 가 % 를 실행할 수 없습니다(관리자 화면이 죽는다)', v_fn;
    end if;
    -- 관리자 가드는 NULL-safe 여야 한다. open_event_card 는 손님 함수라 제외.
    if v_fn <> 'open_event_card' then
      if strpos(v_src, 'my_role() is distinct from ''admin''::user_role') = 0 then
        raise exception 'ABORT: % 의 관리자 가드가 NULL-safe 가 아닙니다(비로그인에서 가드가 열린다)', v_fn;
      end if;
      if v_src ~ 'my_role\(\)\s*<>\s*''admin''' then
        raise exception 'ABORT: % 에 `my_role() <> ''admin''` 가 남아 있습니다', v_fn;
      end if;
    end if;
  end loop;

  -- ② 내부 검증 함수는 클라이언트 롤에서 **직접 호출 불가**여야 한다
  select p.oid, p.prosrc into v_oid, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_event_campaign_problems';
  if v_oid is null then raise exception 'ABORT: _event_campaign_problems 가 없습니다'; end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: _event_campaign_problems 가 클라이언트 롤에 열려 있습니다';
  end if;
  if strpos(v_src, 'period_inverted') = 0 or strpos(v_src, 'quota_short') = 0
     or strpos(v_src, 'voucher_expired') = 0 or strpos(v_src, 'tier_voucher_mixed') = 0
     or strpos(v_src, 'no_cards') = 0 then
    raise exception 'ABORT: 검증에서 기간 역전·한도 부족·경품 만료·등급 혼재·카드 없음 중 하나가 빠졌습니다';
  end if;

  -- ③ 발급 주체는 서버 유도 · 셔플은 서버
  --
  -- ⚠ 파라미터를 `prosrc` 로 찾으면 **절대 걸리지 않는다.** prosrc 는 `declare` 부터의 본문이라
  --   시그니처가 들어 있지 않다(컨테이너 실측: strpos(prosrc,'p_tiers')=671 인데
  --   strpos(prosrc,'p_tiers jsonb')=0 — 타입이 붙은 형태는 본문에 없다).
  --   그래서 '파라미터가 늘었는가' 는 반드시 pg_get_function_arguments 로 본다.
  --   예전 두 줄(`strpos(v_src,'p_issued_by')` · `strpos(v_src,'p_cards jsonb')`)은
  --   구조적으로 발화 불가능한 **죽은 검사**였다 — 통과가 곧 거짓 안심이었다.
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_create_event_campaign';
  if strpos(v_src, 'auth.uid()') = 0 then
    raise exception 'ABORT: 발급 주체(issued_by)가 서버에서 유도되지 않습니다';
  end if;
  if pg_get_function_arguments(v_oid) ~* '(issued|issuer|actor|admin_id)' then
    raise exception 'ABORT: 발급 주체를 클라이언트 파라미터로 받고 있습니다 — 시그니처: %',
      pg_get_function_arguments(v_oid);
  end if;
  if (select pronargs from pg_proc where oid = v_oid) <> 9 then
    raise exception 'ABORT: admin_create_event_campaign 의 파라미터가 9개가 아닙니다(%) — 시그니처: %',
      (select pronargs from pg_proc where oid = v_oid), pg_get_function_arguments(v_oid);
  end if;
  if strpos(v_src, 'ticket_venue_id is null and exists') = 0 then
    raise exception 'ABORT: ticket_venue_id=NULL 캠페인 중복 활성화 가드가 없습니다(출석 1회로 여러 판 참여권이 생긴다)';
  end if;
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'event_campaigns_one_global_open_idx';
  if v_def is null
     or not exists (select 1 from pg_index where indexrelid = to_regclass('public.event_campaigns_one_global_open_idx')
                    and indisunique and indisvalid and indisready)
     or lower(v_def) not like '%unique%'
     or lower(v_def) not like '%((true))%'
     or lower(v_def) not like '%ticket_venue_id is null%'
     or lower(v_def) not like '%status%''draft''%''live''%' then
    raise exception 'ABORT: 전체 매장 이벤트 동시 생성 유니크가 올바르지 않습니다 — %', coalesce(v_def, 'missing');
  end if;

  select p.oid, p.prosrc into v_oid, v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_compose_event_cards';
  if strpos(v_src, 'row_number() over (order by random()) as idx') = 0 then
    raise exception 'ABORT: 카드 셔플이 서버에서 이뤄지지 않습니다(클라이언트가 당첨 자리를 고를 수 있다)';
  end if;
  -- 자리 배치를 받는 파라미터가 하나라도 늘면 만든 사람이 당첨 자리를 고를 수 있다.
  if pg_get_function_identity_arguments(v_oid) <> 'p_campaign_id uuid, p_total integer, p_tiers jsonb' then
    raise exception 'ABORT: admin_compose_event_cards 의 시그니처가 (p_campaign_id uuid, p_total integer, p_tiers jsonb) 가 아닙니다 — 현재: %',
      pg_get_function_identity_arguments(v_oid);
  end if;
  if strpos(v_src, 'v_c.status <> ''draft''') = 0 then
    raise exception 'ABORT: 공개된 판의 배치를 바꿀 수 있습니다(draft 가드 누락)';
  end if;

  -- ④ 공개는 잠금 안에서 다시 검증한다
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_publish_event_campaign';
  if strpos(v_src, 'for update') = 0 then
    raise exception 'ABORT: 공개가 캠페인 행을 잠그지 않습니다(동시 공개 경합)';
  end if;
  if strpos(v_src, '_event_campaign_problems') = 0 then
    raise exception 'ABORT: 공개가 검증을 다시 돌지 않습니다(화면 통과가 곧 공개가 된다)';
  end if;
  if strpos(v_src, 'status = ''draft''') = 0 or strpos(v_src, 'get diagnostics') = 0 then
    raise exception 'ABORT: 공개가 draft 조건부 UPDATE + 행 수 확인으로 원자적이지 않습니다';
  end if;

  -- ⑤ 초안 삭제는 세 이력 전부를 본다
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_delete_event_draft';
  if strpos(v_src, 'opened_at is not null') = 0
     or strpos(v_src, 'public.event_tickets where campaign_id') = 0
     or strpos(v_src, 'event_campaign_id = p_campaign_id') = 0 then
    raise exception 'ABORT: 초안 삭제가 개봉·참여권·발급 이용권 이력 중 하나를 보지 않습니다';
  end if;

  -- ⑥ 손님 경로가 그대로인가 + 구조적 참조를 채우는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'open_event_card';
  if strpos(v_src, 'event_campaign_id, event_card_idx') = 0 then
    raise exception 'ABORT: open_event_card 가 당첨↔이용권 구조적 참조를 남기지 않습니다(note 파싱으로 되돌아간다)';
  end if;
  if strpos(v_src, 'for update skip locked') = 0
     or strpos(v_src, 'identity_gate_on()') = 0
     or strpos(v_src, 'voucher_quota = voucher_quota - v_card.voucher_count') = 0
     or strpos(v_src, '이미 열린 카드예요') = 0 then
    raise exception 'ABORT: open_event_card 재정의에서 20260906b 의 불변식(참여권 잠금·본인인증·한도 차감·중복 개봉 차단)이 사라졌습니다';
  end if;

  -- ⑦ 등급 유출 표면이 넓어지지 않았는가 — event_cards 는 여전히 아무 클라이언트 롤도 못 읽는다
  if has_table_privilege('anon', 'public.event_cards', 'select')
     or has_table_privilege('authenticated', 'public.event_cards', 'select') then
    raise exception 'ABORT: event_cards 가 클라이언트 롤에 열렸습니다(미개봉 등급 위치가 샌다)';
  end if;

  -- ⑧ 구조적 참조 컬럼
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'store_vouchers'
                    and column_name = 'event_campaign_id') then
    raise exception 'ABORT: store_vouchers.event_campaign_id 가 없습니다';
  end if;
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.store_vouchers'::regclass and c.contype = 'f'
       and c.confrelid = 'public.event_campaigns'::regclass
       and c.confdeltype = 'n'   -- on delete set null
  ) then
    raise exception 'ABORT: store_vouchers → event_campaigns FK 가 ON DELETE SET NULL 이 아닙니다(캠페인 삭제가 손님 이용권을 지운다)';
  end if;
end $check$;

-- ROLLBACK
--   drop function if exists public.admin_delete_event_draft(uuid);
--   drop function if exists public.admin_end_event_campaign(uuid, text);
--   drop function if exists public.admin_publish_event_campaign(uuid);
--   drop function if exists public.admin_validate_event_campaign(uuid);
--   drop function if exists public.admin_compose_event_cards(uuid, int, jsonb);
--   drop function if exists public.admin_create_event_campaign(uuid, text, text, text, timestamptz, timestamptz, uuid, text, timestamptz);
--   drop function if exists public.admin_list_event_campaigns();
--   drop function if exists public._event_campaign_problems(uuid);
--   -- open_event_card 는 20260906b 의 정의를 그대로 다시 실행하고
--   --   revoke all on function public.open_event_card(text, int) from public, anon;
--   --   grant execute on function public.open_event_card(text, int) to authenticated, service_role;
--   -- 두 컬럼은 **지우지 않는다**(발급된 이용권의 원천 참조가 사라진다). 꼭 되돌려야 한다면:
--   --   alter table public.store_vouchers drop column if exists event_card_idx;
--   --   alter table public.store_vouchers drop column if exists event_campaign_id;


-- ========================================================================
-- [6/6] 20260912d_event_visibility_and_menu.sql
--        이벤트 숨기기 축(hidden_at) + 기간 경계를 [starts_at, ends_at) 로 정정  ⚠ c 다음
-- ========================================================================

-- ============================================================================
-- 20260912d — 캠페인 공개/숨김을 lifecycle 과 **분리**한다 (§8-2·§8-3)
--
-- APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened.
-- Activation and campaign data are separate; do not re-run this file on production.
--    선행: `20260912c_admin_event_ops.sql`(이 파일이 그 RPC 를 재정의한다). 파일명 순서대로 돌린다.
--
-- ── 왜 필요한가 ──────────────────────────────────────────────────────────────
--   관리자에게 세 가지가 있는데 저장 자리가 둘뿐이었다:
--     ① 사이트 이벤트 메뉴 표시 → `app_settings.event_menu_visible` (이 파일은 건드리지 않는다.
--        기존 set_app_setting RPC 를 그대로 쓴다 — 새 저장소를 만들지 않는다)
--     ② 개별 캠페인 공개/숨김 → **저장할 곳이 없었다** ← 이 파일이 만든다
--     ③ 행사 종료        → `status = 'ended'` (20260912c)
--   ②를 `live → draft` 로 구현하면 안 된다. draft 는 '카드 배치를 아직 바꿀 수 있는 상태'라
--   (20260912c 의 admin_compose_event_cards 가 draft 에서만 동작한다) **공개했던 판의 배치가
--   다시 편집 가능**해진다 — 이미 열린 결과가 있는 판에서 그건 결과 조작 경로다.
--   그래서 공개 여부는 lifecycle 과 **다른 축**(`hidden_at`)에 둔다.
--
-- ── 숨김의 계약 (문서가 지정한 그대로) ────────────────────────────────────────
--   · 일반 이용자에게 비공개 — event_board 가 NULL 을 준다(다른 캠페인으로 보내지 않고,
--     재고·등급·제목 어느 것도 흘리지 않는다).
--   · **새 참여 일시중지** — 카드 열기 거절 + 출석 시 참여권 미지급.
--   · 관리자 미리보기 가능.
--   · **기존 이력 보존** — 카드·참여권·발급된 이용권·감사기록을 한 줄도 지우지 않는다.
--     ⚠ store_vouchers 에는 아무 것도 하지 않는다. '내 당첨·내 이용권' 화면은 이 파일 전후가 같다
--     (자가검사 ⑨가 authenticated 의 store_vouchers select 권한이 남아 있는지 확인한다).
--   · A매장을 숨겨도 B/C/D 매장 캠페인은 그대로 — 판정이 전부 **캠페인 행 단위**다.
--
-- ── 시간 경계를 서버·앱이 같게 맞춘다 (§8-3) ──────────────────────────────────
--   **시작 시각 포함, 종료 시각 미포함.** 20260906b 는 `now() > ends_at` 이라 종료 시각 **정각에**
--   한 번 더 열 수 있었고, 참여권 지급은 `now() <= ends_at` 이었다. 앱의 판정(`src/lib/eventState.ts`)은
--   `now >= end` 를 종료로 본다 — 어긋나면 화면은 '끝났다' 는데 서버는 받아 준다(또는 그 반대).
--   이 파일에서 서버를 `>=` / `<` 로 맞춘다.
--
-- ── 호환 순서 (문서 §1-5) ────────────────────────────────────────────────────
--   전부 **추가**다. 지우는 컬럼·함수·정책이 없다. 미적용 상태의 앱은 `hiddenAt` 이 없는 응답을
--   받고 그것을 '공개' 로 읽으며(undefined ≠ 숨김), 숨기기 RPC 는 PGRST202 로 실패해
--   화면이 '서버 미적용' 이라고 말한다(src/api/adminEvents.ts 의 EventAdminRpcMissingError).
--   반대로 이 파일만 적용되고 앱이 옛 코드여도 동작이 같다 — 새 컬럼을 안 읽을 뿐이다.
--
-- 멱등: add column if not exists / create or replace / drop policy if exists. 두 번 실행해도 같다.
-- 롤백: 파일 맨 아래 ROLLBACK 절.
-- ============================================================================

-- ── 선행 확인 — 20260912c 가 먼저 적용됐는가 ────────────────────────────────
-- ⚠ 2026-09-13 격리 컨테이너(postgres:17) 실측으로 드러난 구멍을 막는다.
--   이 파일을 c 없이 단독 실행하면 **ABORT 없이 조용히 EXIT 0 으로 성공**했다.
--   아래 ⑤ open_event_card 가 `store_vouchers(…, event_campaign_id, event_card_idx)` 에
--   INSERT 하는데, plpgsql 본문은 **생성 시점에 이름 해석을 하지 않아** Postgres 가 안 잡는다.
--   맨 아래 자가검사도 못 잡는다 — `strpos(v_src, 'event_campaign_id, event_card_idx')` 는
--   **이 파일이 방금 써 넣은 함수 소스 문자열**만 보기 때문이다(항상 참).
--   결과: 마이그레이션은 성공한 것처럼 보이고, **첫 손님이 카드를 여는 순간** 런타임에 터진다.
--   그래서 문자열이 아니라 **카탈로그**를 본다.
do $order_guard$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'store_vouchers'
                    and column_name = 'event_campaign_id') then
    raise exception 'ABORT: 20260912c 를 먼저 적용해야 한다(store_vouchers.event_campaign_id 없음).';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'store_vouchers'
                    and column_name = 'event_card_idx') then
    raise exception 'ABORT: 20260912c 를 먼저 적용해야 한다(store_vouchers.event_card_idx 없음).';
  end if;
end $order_guard$;

-- ── ⓪ 공개 여부 축 (비파괴, nullable) ───────────────────────────────────────
alter table public.event_campaigns
  add column if not exists hidden_at timestamptz;
alter table public.event_campaigns
  add column if not exists hidden_reason text;
alter table public.event_campaigns
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null;

comment on column public.event_campaigns.hidden_at is
  '손님에게 숨긴 시각. NULL = 공개. status 와 **별도 축**이다 — 숨겨도 status 는 live 그대로라 카드 배치가 다시 열리지 않는다. (20260912d)';
comment on column public.event_campaigns.hidden_reason is
  '숨긴 사유(관리자 입력, 감사기록과 짝). (20260912d)';

-- ── ① 테이블 읽기 정책 — 숨긴 판은 관리자만 ────────────────────────────────
-- 20260906b:84-86 은 `status <> 'draft'` 하나였다. 지금은 앱이 이 테이블을 직접 select 하지 않지만
-- (`grep -rn event_campaigns src/` 실측 0건), 정책이 곧 마지막 벽이라 여기서도 닫는다.
-- ⚠ NULL-safe: 비로그인은 my_role() 이 NULL 이라 `is not distinct from` 이 false → 닫힌다.
--    `=` 로 쓰면 NULL 이 되어 `hidden_at is null or NULL` = NULL, 행이 안 나온다(닫히긴 하지만
--    의도가 아니라 우연이다). 의도를 코드로 적는다.
drop policy if exists event_campaigns_read on public.event_campaigns;
create policy event_campaigns_read on public.event_campaigns
  for select using (
    status <> 'draft'
    and (hidden_at is null or public.my_role() is not distinct from 'admin'::user_role)
  );

-- ── ② 보드 조회 — 숨긴 판은 손님에게 NULL ──────────────────────────────────
-- 20260906b:128-176 정의 + 숨김 게이트 + 응답에 공개 여부 한 칸.
-- 나머지 한 줄도 바꾸지 않는다(등급 비공개·확률 표 근거값·참여권 집계 전부 그대로).
create or replace function public.event_board(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_c record; v_cards jsonb; v_tickets int := 0; v_left jsonb; v_total jsonb; v_vc jsonb;
begin
  select * into v_c from public.event_campaigns where slug = p_slug and status <> 'draft';
  if v_c is null then return null; end if;

  -- 숨긴 판은 관리자에게만. 손님에게는 **없는 것처럼** 보인다 — 제목·재고·등급 어느 것도 나가지 않고,
  -- 다른 캠페인으로 돌려보내지도 않는다(§8-4).
  if v_c.hidden_at is not null and public.my_role() is distinct from 'admin'::user_role then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'idx', idx,
           'opened', opened_at is not null,
           -- 등급·장수·연 사람은 **연 카드에 한해서만**. 안 연 카드는 키 자체가 없다.
           'tier', case when opened_at is not null then tier end,
           'count', case when opened_at is not null then voucher_count end,
           'by', case when opened_at is not null then opened_name end
         ) order by idx), '[]'::jsonb)
    into v_cards
    from public.event_cards where campaign_id = v_c.id;

  select coalesce(jsonb_object_agg(t::text, n), '{}'::jsonb) into v_left from (
    select tier as t, count(*) as n from public.event_cards
     where campaign_id = v_c.id and tier is not null and opened_at is null group by tier
  ) s;
  select coalesce(jsonb_object_agg(t, n), '{}'::jsonb) into v_total from (
    select coalesce(tier::text, 'none') as t, count(*) as n, max(voucher_count) as vc
      from public.event_cards where campaign_id = v_c.id group by tier
  ) s2;
  select coalesce(jsonb_object_agg(t, vc), '{}'::jsonb) into v_vc from (
    select coalesce(tier::text, 'none') as t, max(voucher_count) as vc
      from public.event_cards where campaign_id = v_c.id group by tier
  ) s3;

  if auth.uid() is not null then
    select count(*) into v_tickets from public.event_tickets
     where campaign_id = v_c.id and user_id = auth.uid() and used_at is null;
  end if;

  return jsonb_build_object(
    'slug', v_c.slug, 'title', v_c.title, 'subtitle', v_c.subtitle, 'status', v_c.status,
    -- 여기까지 온 손님에게는 늘 false 다(숨김이면 위에서 NULL 로 끝났다). 관리자 미리보기만 true 를 본다.
    'hidden', v_c.hidden_at is not null,
    'venueId', v_c.venue_id, 'startsAt', v_c.starts_at, 'endsAt', v_c.ends_at,
    'voucherTitle', v_c.voucher_title,
    'cards', v_cards, 'myTickets', v_tickets,
    'remainByTier', v_left, 'totalByTier', v_total, 'voucherByTier', v_vc);
end $function$;

-- create or replace 는 ACL 을 PUBLIC 기본 GRANT 로 되돌린다 → 20260906b:181-182 를 그대로 다시 쓴다.
-- (읽기 함수라 anon 을 남긴다 — 비로그인도 보드를 본다.)
revoke all on function public.event_board(text) from public;
grant execute on function public.event_board(text) to anon, authenticated;

-- ── ③ 출석 → 참여권 — 숨긴 판에는 주지 않는다 ───────────────────────────────
-- 20260907d 의 최신 본문(오늘 첫 출석 가드) + 20260906c 의 재고 가드 + 숨김 가드 + 종료 경계 정정.
-- ⚠ 20260906b 본문으로 되돌아가지 않게 조심할 것 — 그 사이에 두 번 재정의됐다.
create or replace function public._grant_event_tickets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 같은 회원·매장·KST 날짜의 동시 출석을 한 줄로 세운다. 뒤 트랜잭션은 앞 커밋 뒤에
  -- 오늘 출석을 다시 조회하므로 EXISTS 검사와 INSERT 사이의 경합으로 참여권이 두 장 생기지 않는다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.user_id::text || ':' || new.venue_id::text || ':' ||
    ((new.created_at at time zone 'Asia/Seoul')::date)::text,
    0
  ));

  -- 그 매장에 **오늘 이미 출석 기록이 있으면** 참여권을 주지 않는다(KST 기준, 방금 들어온 행은 제외).
  if exists (
    select 1 from public.checkins c
     where c.user_id = new.user_id
       and c.venue_id = new.venue_id
       and c.id <> new.id
       and (c.created_at at time zone 'Asia/Seoul')::date
           = (new.created_at at time zone 'Asia/Seoul')::date
  ) then
    return new;
  end if;

  insert into public.event_tickets(campaign_id, user_id, checkin_id)
  select c.id, new.user_id, new.id
    from public.event_campaigns c
   where c.status = 'live'
     -- 숨김 = 새 참여 일시중지. 쓸 수 없는 표를 쥐여 주지 않는다.
     and c.hidden_at is null
     and (c.ticket_venue_id is null or c.ticket_venue_id = new.venue_id)
     and (c.starts_at is null or now() >= c.starts_at)
     -- 종료 시각 **미포함** — 앱(src/lib/eventState.ts)과 같은 경계다.
     and (c.ends_at is null or now() < c.ends_at)
     and exists (
       select 1 from public.event_cards ec
        where ec.campaign_id = c.id and ec.opened_at is null
     )
  on conflict do nothing;
  return new;
exception when others then
  -- 이벤트 때문에 출석이 실패하면 안 된다 — 지급 실패는 삼키고 출석은 살린다(종전 동작 유지).
  return new;
end $$;

revoke all on function public._grant_event_tickets() from public, anon, authenticated;

-- ── ④ 카드 열기 — 숨김 거절 + 종료 경계 정정 ────────────────────────────────
-- 20260912c 의 본문(구조적 참조 두 컬럼 포함) + 숨김 가드 + `>=` 경계. 나머지 불변식은 그대로다:
-- 참여권 잠금(skip locked) · 본인인증 게이트 · 카드 행 잠금 · 발급 한도 차감 · 알림 실패 무시.
create or replace function public.open_event_card(p_slug text, p_idx int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_c record; v_card record; v_ticket uuid; v_name text; v_quota int; v_vname text;
begin
  if auth.uid() is null then raise exception '로그인 후 참여할 수 있습니다'; end if;

  select * into v_c from public.event_campaigns where slug = p_slug;
  if v_c is null or v_c.status <> 'live' then raise exception '진행 중인 이벤트가 아닙니다'; end if;
  -- 숨긴 판은 관리자에게도 참여를 열지 않는다 — 미리보기는 보는 것까지다.
  if v_c.hidden_at is not null then
    raise exception '지금은 참여할 수 없는 이벤트입니다';
  end if;
  if (v_c.starts_at is not null and now() < v_c.starts_at)
     or (v_c.ends_at is not null and now() >= v_c.ends_at) then
    raise exception '이벤트 기간이 아닙니다';
  end if;

  -- ⚠ 본인인증 게이트는 **카드를 열기 전에** 본다. 열고 나서 발급 단계에서 막으면
  --   참여권과 카드만 사라지고 손님은 아무것도 못 받는다(되돌릴 방법이 없다).
  if public.identity_gate_on() and not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '본인인증을 완료해야 참여할 수 있습니다 — 내 정보 > 보안에서 인증을 마쳐 주세요';
  end if;

  select id into v_ticket from public.event_tickets
   where campaign_id = v_c.id and user_id = auth.uid() and used_at is null
   order by created_at limit 1 for update skip locked;
  if v_ticket is null then
    raise exception '참여권이 없습니다 — 매장 출석 QR을 찍으면 1장 지급됩니다';
  end if;

  select * into v_card from public.event_cards
   where campaign_id = v_c.id and idx = p_idx for update;
  if v_card is null then raise exception '없는 카드입니다'; end if;
  if v_card.opened_at is not null then
    raise exception '이미 열린 카드예요 — 다른 카드를 골라 주세요';
  end if;

  select coalesce(nickname, name) into v_name from public.profiles where id = auth.uid();

  update public.event_cards
     set opened_by = auth.uid(), opened_name = v_name, opened_at = now()
   where campaign_id = v_c.id and idx = p_idx;
  update public.event_tickets set used_idx = p_idx, used_at = now() where id = v_ticket;

  if v_card.voucher_count > 0 then
    select voucher_quota into v_quota from public.venues where id = v_c.venue_id for update;
    if coalesce(v_quota, 0) < v_card.voucher_count then
      raise exception '매장 발급 한도가 부족합니다 — 매장에 문의해 주세요';
    end if;
    update public.venues set voucher_quota = voucher_quota - v_card.voucher_count
     where id = v_c.venue_id;

    insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name,
                                      title, note, expires_at, issue_reason,
                                      event_campaign_id, event_card_idx)
    select v_c.venue_id, v_c.issued_by, auth.uid(), v_name,
           v_c.voucher_title,
           format('%s 당첨 · %s번 카드', v_c.title, p_idx),
           v_c.voucher_expires_at, 'event',
           v_c.id, p_idx
      from generate_series(1, v_card.voucher_count);

    begin
      select name into v_vname from public.venues where id = v_c.venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (auth.uid(), 'system', '🎉 이벤트 당첨!',
              format('%s에서 ''%s'' %s장을 받았어요. 지갑에서 확인하세요',
                     coalesce(v_vname, '매장'), v_c.voucher_title, v_card.voucher_count),
              '🎉', '#FFD100', '/wallet');
    exception when others then null;   -- 알림 실패가 당첨을 되돌리면 안 된다
    end;
  end if;

  return jsonb_build_object('idx', p_idx, 'tier', v_card.tier,
                            'voucherCount', v_card.voucher_count,
                            'voucherTitle', v_c.voucher_title);
end $function$;

revoke all on function public.open_event_card(text, int) from public, anon;
grant execute on function public.open_event_card(text, int) to authenticated, service_role;

-- ── ⑤ 숨기기 / 다시 공개 ────────────────────────────────────────────────────
-- lifecycle 을 건드리지 않는다 — status 는 'live' 그대로다. 그래서 다시 공개해도
-- 카드 배치·개봉 결과가 그대로 이어지고, draft 로 내렸을 때처럼 배치가 다시 열리지 않는다.
create or replace function public.admin_set_event_campaign_hidden(
  p_campaign_id uuid, p_hidden boolean, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_rows int; v_reason text; v_hidden_at timestamptz;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트 공개 여부를 바꿀 수 있습니다';
  end if;
  if p_hidden is null then raise exception '숨김 여부를 지정해 주세요'; end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status = 'draft' then
    raise exception '아직 공개하지 않은 초안입니다 — 숨길 대상이 아닙니다';
  end if;
  if v_c.status = 'ended' then
    raise exception '이미 종료된 행사입니다 — 숨김 설정은 진행 중인 행사에만 씁니다';
  end if;

  v_reason := nullif(left(btrim(coalesce(p_reason, '')), 500), '');

  update public.event_campaigns
     set hidden_at     = case when p_hidden then coalesce(hidden_at, now()) end,
         hidden_reason = case when p_hidden then v_reason end,
         hidden_by     = case when p_hidden then auth.uid() end
   where id = p_campaign_id and status = 'live';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '설정을 저장하지 못했습니다 — 상태가 방금 바뀌었습니다. 목록을 새로고침해 주세요';
  end if;

  perform public._audit('admin_set_event_campaign_hidden', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'hidden', p_hidden, 'reason', v_reason));

  select hidden_at into v_hidden_at from public.event_campaigns where id = p_campaign_id;
  return jsonb_build_object('id', p_campaign_id, 'slug', v_c.slug,
                            'hidden', v_hidden_at is not null,
                            'hiddenAt', v_hidden_at);
end $fn$;

revoke all on function public.admin_set_event_campaign_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_event_campaign_hidden(uuid, boolean, text) to authenticated, service_role;

-- ── ⑥ 목록에 공개 여부를 싣는다 ─────────────────────────────────────────────
-- 20260912c 의 정의 + 두 칸. 나머지는 한 글자도 바꾸지 않는다(집계만 내려보내는 성질 포함 —
-- 자리별 등급은 여전히 어떤 경로로도 나가지 않는다).
create or replace function public.admin_list_event_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v_out jsonb;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트 목록을 조회할 수 있습니다';
  end if;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r."createdAt" desc), '[]'::jsonb)
    into v_out
  from (
    select
      c.id, c.slug, c.title, c.subtitle, c.status,
      c.hidden_at     as "hiddenAt",
      c.hidden_reason as "hiddenReason",
      c.created_at as "createdAt",
      c.starts_at   as "startsAt",
      c.ends_at     as "endsAt",
      c.venue_id    as "venueId",
      v.name        as "venueName",
      c.ticket_venue_id as "ticketVenueId",
      tv.name       as "ticketVenueName",
      c.voucher_title as "voucherTitle",
      c.voucher_expires_at as "voucherExpiresAt",
      c.issued_by   as "issuedBy",
      coalesce(ip.nickname, ip.name) as "issuedByName",
      coalesce(v.voucher_quota, 0)   as "venueQuota",
      coalesce(v.voucher_issue_approved, false) as "venueApproved",
      coalesce(cc.total, 0)          as "totalCards",
      coalesce(cc.opened, 0)         as "openedCards",
      coalesce(cc.total, 0) - coalesce(cc.opened, 0) as "remainCards",
      coalesce(cc.prize, 0)          as "prizeCards",
      coalesce(cc.prize_left, 0)     as "remainPrizeCards",
      coalesce(cc.vouchers, 0)       as "totalVouchers",
      coalesce(cc.vouchers_won, 0)   as "wonVouchers",
      coalesce(tk.issued, 0)         as "ticketsIssued",
      coalesce(tk.used, 0)           as "ticketsUsed",
      coalesce(sv.issued, 0)         as "vouchersIssued",
      coalesce(sv.used, 0)           as "vouchersUsed"
    from public.event_campaigns c
    left join public.venues   v  on v.id  = c.venue_id
    left join public.venues   tv on tv.id = c.ticket_venue_id
    left join public.profiles ip on ip.id = c.issued_by
    left join lateral (
      select count(*) as total,
             count(*) filter (where opened_at is not null) as opened,
             count(*) filter (where tier is not null) as prize,
             count(*) filter (where tier is not null and opened_at is null) as prize_left,
             coalesce(sum(voucher_count), 0) as vouchers,
             coalesce(sum(voucher_count) filter (where opened_at is not null), 0) as vouchers_won
        from public.event_cards where campaign_id = c.id
    ) cc on true
    left join lateral (
      select count(*) as issued, count(*) filter (where used_at is not null) as used
        from public.event_tickets where campaign_id = c.id
    ) tk on true
    left join lateral (
      select count(*) as issued, count(*) filter (where used_at is not null) as used
        from public.store_vouchers where event_campaign_id = c.id
    ) sv on true
  ) r;

  return v_out;
end $fn$;

revoke all on function public.admin_list_event_campaigns() from public, anon;
grant execute on function public.admin_list_event_campaigns() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── 자가검사 ─────────────────────────────────────────────────────────────────
-- 존재·ACL 만 보면 핵심 동작이 빠져도 통과한다 → prosrc 를 **strpos** 로 본다.
-- (LIKE 는 '_' 가 단일문자 와일드카드라 의도보다 느슨해진다.)
-- ⚠ 여기서 찾는 문자열이 각 함수의 **본문 주석에 없는지** 확인해 두었다 — prosrc 에는 주석도 들어가서,
--    주석이 검사를 대신 통과시켜 주면 검사가 무의미해진다(20260912c 에서 실제로 2종이 그렇게 통과했다).
-- ⚠ 함수는 **이름으로만** 찾는다. pg_get_function_identity_arguments 는 파라미터 이름까지 돌려주므로
--    타입만 적어 비교하면 영원히 불일치라 '함수가 없다' 로 오탐한다(20260911k 가 그 버그로 막혀 있었다).
do $check$
declare
  v_oid oid; v_cfg text[]; v_acl aclitem[]; v_src text; v_n int; v_qual text;
begin
  -- ① 공개 여부 컬럼
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'event_campaigns'
                    and column_name = 'hidden_at') then
    raise exception 'ABORT: event_campaigns.hidden_at 이 없습니다';
  end if;
  -- lifecycle 을 건드려 숨김을 흉내내지 않았는가 — status 체크 제약이 그대로여야 한다.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.event_campaigns'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%draft%live%ended%'
  ) then
    raise exception 'ABORT: event_campaigns.status 의 3개 상태 제약이 사라졌습니다(숨김을 lifecycle 에 섞은 흔적)';
  end if;

  -- ② 숨김 RPC: 존재 · 단일 · SECURITY DEFINER · search_path · ACL · NULL-safe 가드
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_event_campaign_hidden';
  if v_n = 0 then raise exception 'ABORT: admin_set_event_campaign_hidden 이 생성되지 않았습니다'; end if;
  if v_n > 1 then raise exception 'ABORT: admin_set_event_campaign_hidden 오버로드가 %개입니다', v_n; end if;

  select p.oid, p.proconfig, p.proacl, p.prosrc into v_oid, v_cfg, v_acl, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_event_campaign_hidden';
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'ABORT: admin_set_event_campaign_hidden 이 SECURITY DEFINER 가 아닙니다';
  end if;
  if v_cfg is null or not exists (select 1 from unnest(v_cfg) c where c like 'search_path=%pg_temp%') then
    raise exception 'ABORT: admin_set_event_campaign_hidden 의 search_path 가 고정되지 않았습니다';
  end if;
  if v_acl is null then
    raise exception 'ABORT: admin_set_event_campaign_hidden 이 PUBLIC 기본 GRANT 상태입니다(REVOKE 누락 — from anon 만으로는 무효)';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'ABORT: anon 이 admin_set_event_campaign_hidden 을 실행할 수 있습니다';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: authenticated 가 admin_set_event_campaign_hidden 을 실행할 수 없습니다(관리자 화면이 죽는다)';
  end if;
  if strpos(v_src, 'my_role() is distinct from ''admin''::user_role') = 0 then
    raise exception 'ABORT: 숨김 RPC 의 관리자 가드가 NULL-safe 가 아닙니다(비로그인에서 가드가 열린다)';
  end if;
  if v_src ~ 'my_role\(\)\s*<>\s*''admin''' then
    raise exception 'ABORT: 숨김 RPC 에 `my_role() <> ''admin''` 가 남아 있습니다';
  end if;
  -- lifecycle 을 바꾸지 않는다 — status 에 쓰는 순간 '숨김 = draft' 구현으로 되돌아간 것이다.
  if v_src ~ 'set\s+status\s*=' then
    raise exception 'ABORT: 숨김 RPC 가 status 를 바꿉니다 — 공개 여부는 lifecycle 과 별도 축이어야 합니다';
  end if;
  if strpos(v_src, 'get diagnostics v_rows = row_count') = 0 then
    raise exception 'ABORT: 숨김 RPC 가 조건부 UPDATE 의 행 수를 확인하지 않습니다(동시 수정이 조용히 성공한다)';
  end if;
  if strpos(v_src, '_audit(''admin_set_event_campaign_hidden''') = 0 then
    raise exception 'ABORT: 숨김 RPC 에 감사기록이 없습니다';
  end if;
  -- 이력을 지우는 경로가 생기지 않았는가
  if v_src ~* 'delete\s+from' then
    raise exception 'ABORT: 숨김 RPC 에 삭제 구문이 있습니다 — 숨김은 이력을 보존해야 합니다';
  end if;

  -- ③ 보드: 숨긴 판이 손님에게 나가지 않는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'event_board';
  if strpos(v_src, 'v_c.hidden_at is not null and public.my_role() is distinct from') = 0 then
    raise exception 'ABORT: event_board 가 숨긴 캠페인을 손님에게 그대로 내려보냅니다';
  end if;
  if strpos(v_src, 'case when opened_at is not null then tier end') = 0 then
    raise exception 'ABORT: event_board 재정의에서 미개봉 등급 비공개가 사라졌습니다';
  end if;
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'event_board';
  if not has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'ABORT: anon 이 event_board 를 못 읽습니다(비로그인 손님 화면이 죽는다)';
  end if;

  -- ④ 카드 열기: 숨김 거절 + 종료 경계 미포함 + 20260906b/c 불변식 유지
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'open_event_card';
  if strpos(v_src, 'v_c.hidden_at is not null then') = 0 then
    raise exception 'ABORT: open_event_card 가 숨긴 판의 참여를 막지 않습니다';
  end if;
  if strpos(v_src, 'now() >= v_c.ends_at') = 0 then
    raise exception 'ABORT: 종료 시각 경계가 미포함(>=)이 아닙니다 — 앱 판정과 어긋나 종료 정각에 한 번 더 열린다';
  end if;
  if strpos(v_src, 'for update skip locked') = 0
     or strpos(v_src, 'identity_gate_on()') = 0
     or strpos(v_src, 'voucher_quota = voucher_quota - v_card.voucher_count') = 0
     or strpos(v_src, 'event_campaign_id, event_card_idx') = 0
     or strpos(v_src, '이미 열린 카드예요') = 0 then
    raise exception 'ABORT: open_event_card 재정의에서 기존 불변식(참여권 잠금·본인인증·한도 차감·구조적 참조·중복 개봉 차단)이 사라졌습니다';
  end if;

  -- ⑤ 참여권 지급: 숨김 중단 + 오늘 첫 출석 + 재고 가드가 모두 살아 있는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_grant_event_tickets';
  if strpos(v_src, 'c.hidden_at is null') = 0 then
    raise exception 'ABORT: 숨긴 판에도 참여권이 나갑니다(쓸 수 없는 표가 쌓인다)';
  end if;
  if strpos(v_src, 'now() < c.ends_at') = 0 then
    raise exception 'ABORT: 참여권 지급의 종료 경계가 미포함(<)이 아닙니다';
  end if;
  if strpos(v_src, 'at time zone ''Asia/Seoul''') = 0
     or strpos(v_src, 'ec.opened_at is null') = 0 then
    raise exception 'ABORT: _grant_event_tickets 재정의에서 20260907d(오늘 첫 출석)·20260906c(재고) 가드가 사라졌습니다';
  end if;
  if strpos(v_src, 'pg_advisory_xact_lock') = 0 then
    raise exception 'ABORT: 동시 출석이 오늘 첫 출석 검사를 함께 통과해 참여권을 중복 지급할 수 있습니다';
  end if;

  -- ⑥ 목록이 공개 여부를 싣는가 (앱이 '확인 불가' 를 벗어나는 조건)
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_list_event_campaigns';
  if strpos(v_src, 'as "hiddenAt"') = 0 then
    raise exception 'ABORT: 관리자 목록이 공개 여부를 내려보내지 않습니다';
  end if;

  -- ⑦ 읽기 정책이 숨김을 반영하는가 (NULL-safe 형태까지)
  select pg_get_expr(polqual, polrelid) into v_qual from pg_policy
   where polrelid = 'public.event_campaigns'::regclass and polname = 'event_campaigns_read';
  if v_qual is null then raise exception 'ABORT: event_campaigns_read 정책이 없습니다'; end if;
  if strpos(v_qual, 'hidden_at') = 0 then
    raise exception 'ABORT: event_campaigns_read 가 숨김을 보지 않습니다 — 현재: %', v_qual;
  end if;
  -- ⚠ Postgres 는 `a is not distinct from b` 를 `NOT (a IS DISTINCT FROM b)` 로 되돌려준다
  --    (컨테이너 실측 — 처음엔 'IS NOT DISTINCT FROM' 을 찾다가 정상 정책에서 ABORT 했다).
  --    두 형태를 모두 통과시키되, NULL-safe 가 아닌 `= 'admin'` 은 걸리게 'IS DISTINCT FROM' 으로 본다.
  if strpos(upper(v_qual), 'IS DISTINCT FROM') = 0 then
    raise exception 'ABORT: event_campaigns_read 의 관리자 판정이 NULL-safe 가 아닙니다 — 현재: %', v_qual;
  end if;

  -- ⑧ 등급 유출 표면이 넓어지지 않았는가
  if has_table_privilege('anon', 'public.event_cards', 'select')
     or has_table_privilege('authenticated', 'public.event_cards', 'select') then
    raise exception 'ABORT: event_cards 가 클라이언트 롤에 열렸습니다(미개봉 등급 위치가 샌다)';
  end if;

  -- ⑨ **'내 당첨·내 이용권' 을 막지 않았는가**(문서 §8-4). 이벤트 공개를 조이다가 지갑을 닫는 것이
  --    이 배치에서 가장 있을 법한 사고다.
  if not has_table_privilege('authenticated', 'public.store_vouchers', 'select') then
    raise exception 'ABORT: authenticated 가 store_vouchers 를 못 읽습니다 — 내 이용권 화면이 죽습니다';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.store_vouchers'::regclass) then
    raise exception 'ABORT: store_vouchers 의 정책이 사라졌습니다';
  end if;
  -- 숨김이 발급된 이용권을 건드리지 않는다 — 이 파일 어디에도 store_vouchers 쓰기가 없어야 한다
  -- (open_event_card 의 당첨 insert 는 예외 — 그건 손님이 카드를 열 때의 정상 발급이다).
end $check$;

-- ROLLBACK
--   -- 함수 3종은 20260912c(open_event_card·admin_list_event_campaigns)와
--   -- 20260907d(_grant_event_tickets)·20260906b(event_board)의 본문을 다시 실행하고
--   -- 각 파일의 REVOKE/GRANT 두 줄을 다시 쓴다.
--   drop function if exists public.admin_set_event_campaign_hidden(uuid, boolean, text);
--   drop policy if exists event_campaigns_read on public.event_campaigns;
--   create policy event_campaigns_read on public.event_campaigns
--     for select using (status <> 'draft');
--   -- 컬럼은 **지우지 않는다**(숨김 이력과 감사기록의 짝이 끊긴다). 꼭 되돌려야 한다면:
--   --   alter table public.event_campaigns drop column if exists hidden_by;
--   --   alter table public.event_campaigns drop column if exists hidden_reason;
--   --   alter table public.event_campaigns drop column if exists hidden_at;

-- ── PART 1 끝 ───────────────────────────────────────────────────────────────
commit;
