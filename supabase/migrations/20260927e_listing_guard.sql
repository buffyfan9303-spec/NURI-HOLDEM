-- ✅ 적용 완료 2026-09-27 (nuri-lead, MCP execute_sql). community-team 리허설(DO+RAISE 롤백)을 리드가 검토 후 적용.
-- community-team 2026-09-27. 장터 매물 위조 차단. 적용은 nuri-lead(장터 화면 소유: home-team 에 통보).
-- 현재 guard_listing_seller(BEFORE INSERT OR UPDATE)는 판매자 표시(seller_id·인증뱃지·닉네임·거래수)만 덮는다.
-- 리허설(운영, DO + 끝 RAISE 롤백)로 확인한 두 구멍:
--   ① 판매자가 INSERT/UPDATE 로 like_count(찜)·view_count(조회)·comment_count·created_at(미래 = 최신순 맨 위 고정)을 마음대로 쓴다.
--   ② UPDATE 마다 seller_id := auth.uid() 로 덮는다 → 운영자(listings_update 허용)가 남의 매물을 고치면 **판매자가 운영자로 바뀐다**
--      (판매자의 '내 판매목록'에서 사라지고, 문의 스레드의 seller 판정·RLS lm_select 가 운영자 쪽으로 넘어간다).
-- 고침: INSERT 는 서버 값으로 시작(카운터 0·지금 시각), UPDATE 는 판매자·카운터·작성시각을 옛 값에 고정(표시 이름·뱃지·거래수는 원 판매자 기준으로 갱신).
--   찜·조회 RPC(toggle_listing_like · increment_listing_view)는 SECURITY DEFINER(소유자 postgres)라 이 분기를 타지 않는다(확인: prosecdef=true).
--   ⚠ 이 함수는 SECURITY DEFINER 로 만들지 않는다 — current_user 판정이 죽는다(20260927b ①과 같은 함정).
-- CREATE OR REPLACE 는 ACL 을 보존한다. 트리거는 그대로(BEFORE INSERT OR UPDATE).
create or replace function public.guard_listing_seller() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
declare v_sid uuid; v_ci_ok boolean; v_nick text;
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if TG_OP = 'INSERT' then
    v_sid := auth.uid();
    new.like_count := 0; new.view_count := 0; new.comment_count := 0;
    new.created_at := now(); new.updated_at := now();
  else
    v_sid := old.seller_id;
    new.like_count := old.like_count; new.view_count := old.view_count; new.comment_count := old.comment_count;
    new.created_at := old.created_at; new.updated_at := now();
  end if;
  select (ci_hash is not null), nickname into v_ci_ok, v_nick from public.profiles where id = v_sid;
  new.seller_id          := v_sid;
  new.seller_verified    := coalesce(v_ci_ok, false);            -- 인증뱃지는 CI 인증 여부로만
  new.seller_name        := coalesce(v_nick, new.seller_name);
  new.seller_trade_count := coalesce(
    (select count(*) from public.marketplace_listings where seller_id = v_sid and status = 'sold'), 0);
  return new;
end $f$;
