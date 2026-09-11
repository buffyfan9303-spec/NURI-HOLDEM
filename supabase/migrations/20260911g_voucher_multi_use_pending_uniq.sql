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
-- 이번에 **일부러 안 닫는** 인접 구멍 (알고 남긴다)
--   · lbr_insert_self 는 status 를 여전히 열어 둔다 — 로그인 유저가 임의 venue_id 로 status='approved' 행을
--     꽂아 그 매장의 승인율·평균대기(getBuyinReqStats, src/api/ledger.ts:1300)를 위조할 수 있다.
--     같은 정책에 `and status = 'pending'` 한 조각이면 닫히지만 M1 범위 밖이라 별건으로 둔다.
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
  with check (user_id = (select auth.uid()) and voucher_id is null);

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
  if lower(v_def) not like '%auth.uid()%' then raise exception 'ABORT: lbr_insert_self 의 본인 확인이 사라졌다 — %', v_def; end if;

  raise notice 'M1 OK — 대기 유니크는 이용권 요청을 비켜간다 · request_buyin 두 술어 · lbr_insert_self voucher_id 차단';
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
