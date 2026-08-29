-- 20260830e — 오너 지시(2026-08-30): 기간 상품 폐지, 1회 구매 단위로 전환.
--
-- 무엇이 바뀌나
--   · 외치기 = **20초 방송 슬롯 1회**. 기간(6/12/24시간) 개념이 사라진다.
--     구매 시 서버가 plays_at(방송 시각)을 '앞사람 방송 끝'으로 찍는다 → 대기열이 말 그대로 대기열이다.
--     산 사람은 '내 차례가 몇 분 뒤인지'를 알 수 있고, 한 번 나가면 끝난다.
--   · 등급 = 기본(50) / 하이라이트(150, 색 선택). **전광판은 판매 중지**(행은 남긴다 — 삭제 금지 규약).
--   · 기간 마크(1일/7일/30일권) 판매 중지 → **영구 소장 꾸미기 마크 2,000점** 하나로.
--     이걸로 '마크를 갈아타면 남은 기간이 소멸'하던 구조적 함정이 **원인째 사라진다.**
--   · 1일 구매 한도 10회(상품 종류 무관 합산).
--
-- 가격 근거(실측): 지속 가능한 1일 최대 획득 = 50점
--   접속 +1 · 체크인 +3 x 매장3 = 9 · 글 30(상한) · 댓글 10(상한).
--   7일 연속 +10 과 주간 미션(20/10/30)은 매일 받을 수 없어 제외.
--   -> 외치기 1회 = 하루치(50) · 하이라이트 = 사흘치(150) · 마크 = 40일치(2,000).
--
-- 색은 새 팔레트를 만들지 않는다 — 앱이 이미 라이트/다크 양쪽으로 정의해 둔
-- --tier-{gold,blue,green,purple,rose}-vivid 를 그대로 쓴다(테마 안전성 검증 완료).

-- ── 제약 완화(삭제가 아니라 허용 범위를 넓히는 것) ─────────────────────────
-- duration_hours > 0 : 외치기가 초 단위가 되면서 0 이 정상값이 됐다.
alter table public.shop_skus drop constraint if exists shop_skus_duration_hours_check;
alter table public.shop_skus add constraint shop_skus_duration_hours_check
  check (duration_hours >= 0);
-- kind 화이트리스트에 영구 소장 마크('mark') 추가. 기존 두 값은 그대로 둔다.
alter table public.shop_skus drop constraint if exists shop_skus_kind_check;
alter table public.shop_skus add constraint shop_skus_kind_check
  check (kind = any (array['mark_rent'::text, 'shout'::text, 'mark'::text]));

-- ── 스키마(추가만) ──────────────────────────────────────────────────────────
alter table public.community_shouts add column if not exists plays_at timestamptz;
alter table public.community_shouts add column if not exists color text;

alter table public.community_shouts drop constraint if exists community_shouts_color_chk;
alter table public.community_shouts add constraint community_shouts_color_chk
  check (color is null or color in ('gold','blue','green','purple','rose'));

-- 이미 떠 있는 외침은 '지금 방송 중'으로 본다(과거 데이터를 지우지 않는다).
update public.community_shouts set plays_at = created_at where plays_at is null;
alter table public.community_shouts alter column plays_at set default now();

create index if not exists idx_shouts_plays_at on public.community_shouts (plays_at)
  where hidden = false;

alter table public.shop_skus add column if not exists duration_seconds int;

create table if not exists public.mark_unlocks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  mark_key    text not null references public.shop_marks(key),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, mark_key)
);
alter table public.mark_unlocks enable row level security;
drop policy if exists mark_unlocks_read on public.mark_unlocks;
create policy mark_unlocks_read on public.mark_unlocks for select to authenticated using (true);
-- 쓰기 정책 없음 — 구매는 SECURITY DEFINER RPC 로만.

-- ── 상품표 ─────────────────────────────────────────────────────────────────
update public.shop_skus
   set price = 50,  duration_seconds = 20, duration_hours = 0,
       label = '외치기', descr = '20초 1회 방송 · 대기열 순서대로'
 where key = 'shout_basic';

update public.shop_skus
   set price = 150, duration_seconds = 20, duration_hours = 0,
       label = '하이라이트', descr = '20초 1회 방송 · 색을 골라 눈에 띄게'
 where key = 'shout_gold';

-- 판매 중지(행 보존 — 과거 구매 내역이 이 키를 참조한다)
update public.shop_skus set active = false where key = 'shout_board';
update public.shop_skus set active = false where kind = 'mark_rent';

insert into public.shop_skus (key, kind, label, descr, price, duration_hours, duration_seconds, tier_rank, sort, active)
values ('mark_own', 'mark', '꾸미기 마크', '닉네임 앞에 영구 소장 · 언제든 바꿔 달 수 있어요', 2000, 0, 0, 1, 10, true)
on conflict (key) do update
  set kind = excluded.kind, label = excluded.label, descr = excluded.descr,
      price = excluded.price, active = true;

-- ── 공통: 1일 구매 한도 ────────────────────────────────────────────────────
create or replace function public.daily_purchase_count(p_user uuid)
returns integer
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::int from public.point_purchases
   where user_id = p_user
     and refunded_at is null
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
$function$;

revoke all on function public.daily_purchase_count(uuid) from public, anon;
grant execute on function public.daily_purchase_count(uuid) to authenticated, service_role;
