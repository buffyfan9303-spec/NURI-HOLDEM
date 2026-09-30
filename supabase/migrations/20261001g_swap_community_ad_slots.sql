-- ⏳ 미적용 초안(2026-10-01 · 서버 초안 담당). 적용은 리드가 MCP execute_sql 로 한다. 적용 뒤 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꿔라.
--    롤백 리허설: 이 파일 본문 + 맨 아래 REHEARSAL 블록을 한 트랜잭션으로 돌려 REHEARSAL_OK(raise 로 되돌림) 확인 — admin-srv-report.md 참고.
--    ⚠ 적용만으로는 결함이 닫히지 않는다 — 화면 쪽 src/api/ads.ts swapAdSlots 가 이 RPC 한 번으로 바뀌어야 한다.
-- 20261001g — A-13: 커뮤니티 광고 순서 교환이 두 요청(비우기 → upsert)이라 둘째가 실패하면 첫 슬롯이 '해제·꺼짐'으로
--             남아 광고가 내려가던 것(src/api/ads.ts:137-159 주석이 스스로 인정한 결함).
--
-- 무엇을 바꾸나: swap_community_ad_slots(p_slot_a, p_slot_b) 한 트랜잭션.
--   옮기는 칸은 기존 클라이언트와 같다: post_id·active·starts_at·expires_at (title·link_url·advertiser 는 자리에 남는다 — 현행 동작 보존).
--   부분 유니크 인덱스 community_ads_active_post_uidx 때문에 '한쪽 비우기 → 두 행 채우기' 순서는 그대로 두되, 함수 안이라
--   중간에 실패하면 전부 되돌아간다. 행이 없는 슬롯(라이브 2번)은 빈 행(active=false)으로 만든 뒤 교환한다.

-- 적용 전 게이트
do $$
begin
  if exists (select 1 from pg_proc where proname = 'swap_community_ad_slots' and pronamespace = 'public'::regnamespace) then
    raise exception '20261001g 게이트: swap_community_ad_slots 가 이미 있다';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'community_ads_active_post_uidx') then
    raise exception '20261001g 게이트: 부분 유니크 인덱스가 없다 — 교환 순서 전제가 바뀌었다';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'community_ads'
        and column_name in ('slot','post_id','active','starts_at','expires_at','updated_at')) <> 6 then
    raise exception '20261001g 게이트: community_ads 칸 구성이 초안 작성 때와 다르다';
  end if;
end $$;

create or replace function public.swap_community_ad_slots(p_slot_a int, p_slot_b int)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare ra public.community_ads; rb public.community_ads;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '운영자만 가능합니다';
  end if;
  if p_slot_a is null or p_slot_b is null or p_slot_a = p_slot_b
     or p_slot_a not between 1 and 5 or p_slot_b not between 1 and 5 then
    raise exception '교환할 두 슬롯(1~5, 서로 다름)이 필요합니다';
  end if;

  insert into public.community_ads (slot, post_id, active) values (p_slot_a, null, false), (p_slot_b, null, false)
  on conflict (slot) do nothing;
  -- 두 행을 슬롯 순서로 잠근다(동시 교환끼리 교착하지 않게).
  perform 1 from public.community_ads where slot in (p_slot_a, p_slot_b) order by slot for update;
  select * into ra from public.community_ads where slot = p_slot_a;
  select * into rb from public.community_ads where slot = p_slot_b;

  -- 같은 글이 잠깐이라도 두 활성 행에 있으면 부분 유니크 인덱스가 막으므로 a 를 먼저 비운다(같은 트랜잭션 — 실패하면 전부 되돌아간다).
  update public.community_ads set post_id = null, active = false, updated_at = now() where slot = p_slot_a;
  update public.community_ads
     set post_id = ra.post_id, active = ra.active, starts_at = ra.starts_at, expires_at = ra.expires_at, updated_at = now()
   where slot = p_slot_b;
  update public.community_ads
     set post_id = rb.post_id, active = rb.active, starts_at = rb.starts_at, expires_at = rb.expires_at, updated_at = now()
   where slot = p_slot_a;
end $function$;

revoke all on function public.swap_community_ad_slots(int,int) from public, anon;
grant execute on function public.swap_community_ad_slots(int,int) to authenticated, service_role;

-- 자가검사
do $$
begin
  if has_function_privilege('anon', 'public.swap_community_ad_slots(int,int)', 'execute') then
    raise exception '20261001g: anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.swap_community_ad_slots(int,int)', 'execute') then
    raise exception '20261001g: authenticated 에 닫혔다';
  end if;
  if pg_get_functiondef('public.swap_community_ad_slots(int,int)'::regprocedure) !~ 'search_path TO ''public'', ''pg_temp''' then
    raise exception '20261001g: search_path 고정 누락';
  end if;
end $$;

/* REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문>; <아래 블록>` 을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정: ADMIN c8e3734d(admin) · OWNER 7e435684(venue_owner, 비관리자). 라이브 community_ads: 슬롯 1·3·4·5 행(전부 빈 칸·꺼짐), 2 행 없음.
   글 P1 = 1d703654-9260-4fe6-a2f1-c04c0c62a85c · P2 = dddd0000-0000-4000-8000-000000000903
-- ▼REHEARSAL
do $$
declare
  c_admin uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  p1 uuid := '1d703654-9260-4fe6-a2f1-c04c0c62a85c';
  p2 uuid := 'dddd0000-0000-4000-8000-000000000903';
  r1 public.community_ads; r2 public.community_ads; r3 public.community_ads;
begin
  update public.community_ads set post_id = p1, active = true, starts_at = date '2026-10-01', expires_at = date '2026-10-31' where slot = 1;
  update public.community_ads set post_id = p2, active = true, starts_at = null, expires_at = null where slot = 3;

  perform set_config('request.jwt.claims', '', true);
  begin perform public.swap_community_ad_slots(1, 3); raise exception 'FAIL: 비로그인 교환 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  begin perform public.swap_community_ad_slots(1, 3); raise exception 'FAIL: 업주 교환 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  -- 양성 1: 1↔3 맞바뀌고 둘 다 활성 유지, 날짜도 따라간다
  perform public.swap_community_ad_slots(1, 3);
  select * into r1 from public.community_ads where slot = 1;
  select * into r3 from public.community_ads where slot = 3;
  if r1.post_id is distinct from p2 or not r1.active or r1.starts_at is not null
     or r3.post_id is distinct from p1 or not r3.active or r3.expires_at is distinct from date '2026-10-31' then
    raise exception 'FAIL: 교환 결과 % / %', r1, r3;
  end if;
  -- 양성 2: 행이 없는 슬롯 2 와 교환 → 2 에 광고, 1 은 빈 칸
  perform public.swap_community_ad_slots(1, 2);
  select * into r1 from public.community_ads where slot = 1;
  select * into r2 from public.community_ads where slot = 2;
  if r2.post_id is distinct from p2 or not r2.active or r1.post_id is not null or r1.active then
    raise exception 'FAIL: 빈 슬롯 교환 % / %', r1, r2;
  end if;
  -- 음성: 잘못된 슬롯 → raise, 기존 행 불변
  begin perform public.swap_community_ad_slots(3, 9); raise exception 'FAIL: 범위 밖 슬롯 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%교환할 두 슬롯%' then raise exception 'FAIL: 엉뚱한 오류(기대: 교환할 두 슬롯): %', sqlerrm; end if; end;
  begin perform public.swap_community_ad_slots(3, 3); raise exception 'FAIL: 같은 슬롯 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%교환할 두 슬롯%' then raise exception 'FAIL: 엉뚱한 오류(기대: 교환할 두 슬롯): %', sqlerrm; end if; end;
  select * into r3 from public.community_ads where slot = 3;
  if r3.post_id is distinct from p1 or not r3.active then raise exception 'FAIL: 실패한 교환이 행을 바꿨다'; end if;

  raise exception 'REHEARSAL_OK 20261001g';
end $$;
-- ▲REHEARSAL
*/
