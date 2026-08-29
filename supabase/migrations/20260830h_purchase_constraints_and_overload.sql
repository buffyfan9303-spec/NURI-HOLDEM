-- 20260830h — 20260830e/f 를 실제로 돌려 보고 나온 세 가지를 닫는다(프로브가 잡았다).
--   ① point_purchases.duration_hours > 0 : 슬롯 외침·영구 마크는 '시간'이 없어 0 이 정상값이다.
--   ② point_purchases.kind 화이트리스트에 'mark_own'(영구 소장)이 없었다.
--   ③ buy_shout 2인자 판이 남아 3인자 판과 **오버로드가 모호**해졌다
--      (PostgREST 도 'is not unique' 로 실패한다). 구판을 내린다 — 신판이 기본값으로 완전히 대체한다.
--
-- 적용 후 실측(봇 계정, 전량 원복):
--   하이라이트+파랑 구매 → color=blue · 슬롯 20초 ✅ / 기본에 색 지정 → 거절 ✅ /
--   전광판(판매중지) → 거절 ✅ / 마크 영구구매 → 소장 1건·자동장착·사용액 2,000 ✅ /
--   표시 경로·보유 목록 정상 ✅ / 잔존 외침0 소장0 구매0 ✅

alter table public.point_purchases drop constraint if exists point_purchases_duration_hours_check;
alter table public.point_purchases add constraint point_purchases_duration_hours_check
  check (duration_hours >= 0);

alter table public.point_purchases drop constraint if exists point_purchases_kind_check;
alter table public.point_purchases add constraint point_purchases_kind_check
  check (kind = any (array['shout'::text, 'mark_rent'::text, 'mark_own'::text]));

drop function if exists public.buy_shout(text, text);
