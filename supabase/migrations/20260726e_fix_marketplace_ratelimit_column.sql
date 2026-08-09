-- 🔴 장터 매물 등록이 100% 실패하고 있었다.
--
-- rl_marketplace_listings() 가 new.user_id 를 참조하는데 marketplace_listings 에는 그 컬럼이 없다
-- (seller_id 만 존재). BEFORE INSERT 트리거라 모든 등록이 '42703 column does not exist' 로 죽었다.
-- 라이브 marketplace_listings 0행 = 한 번도 성공한 적이 없다는 뜻이다.
--
-- 왜 아무도 몰랐나: 실패가 화면에서 '아직 매물이 없네'로 보였다(빈 상태와 실패 상태가 같은 화면).
--
-- ⚠ 자기검증에 '실제 INSERT 프로브'를 넣지 않은 이유: 프로브를 롤백하려고 raise 하면
--    같은 트랜잭션의 DDL 까지 되돌아간다. 여기서는 정적 불변식만 검사하고, 실제 등록 성공 여부는
--    적용 직후 별도 트랜잭션에서 확인했다(등록 성공 + 30초 레이트리밋 정상 동작 확인).

create or replace function public.rl_marketplace_listings()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- ⚠ 컬럼명은 seller_id 다. user_id 로 쓰면 테이블에 없는 컬럼이라 등록이 통째로 막힌다.
  if exists (select 1 from public.marketplace_listings where seller_id = new.seller_id and created_at > now() - interval '30 seconds') then
    raise exception '매물 등록은 30초에 한 번만 가능합니다.';
  end if;
  if (select count(*) from public.marketplace_listings where seller_id = new.seller_id and created_at > now() - interval '1 day') >= 20 then
    raise exception '하루 매물 등록 한도(20건)를 초과했습니다.';
  end if;
  return new;
end $function$;

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rl_marketplace_listings';
  if v_src is null              then raise exception 'ABORT: 함수가 없다'; end if;
  if v_src ~ 'new\.user_id'     then raise exception 'ABORT: 본문에 new.user_id 가 남아 있다'; end if;
  if v_src !~ 'new\.seller_id'  then raise exception 'ABORT: 본문에 new.seller_id 가 없다'; end if;
  -- 이 사고의 근본 원인(존재하지 않는 컬럼 참조)을 직접 검사한다
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'marketplace_listings' and column_name = 'seller_id') then
    raise exception 'ABORT: marketplace_listings.seller_id 가 없다';
  end if;
end $$;
