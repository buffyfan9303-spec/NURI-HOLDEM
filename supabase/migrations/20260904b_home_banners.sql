-- 20260904b — 홈 상단 배너 관리(오너 지시 2026-09-04):
--   "관리자설정에 배너 관리도 추가. 배너는 이미지, 클릭시 링크, 제목, 순서, 날짜가 되면 삭제되는 등의 기능"
--
-- 왜 새 테이블인가(community_ads 확장을 검토한 뒤 기각):
--   community_ads 는 slot 이 PK 이고 CHECK(1..5) 라 **행이 영구히 5개로 고정된** 커뮤니티 게시판의
--   '텍스트 한 줄' 광고다. 여기에 이미지 배너를 끼우려면 PK 의미(고정 슬롯 → 가변 목록)를 바꿔야 하고,
--   그건 라이브 관리자 UI(5칸 편집기)와 게시판 렌더를 동시에 건드린다 — 더 작은 변경이 아니다.
--   두 면은 모양도 다르다(텍스트 줄 vs 960x448 이미지 캐러셀). 테이블은 새로 만들고
--   패턴(RLS 형태·storage 업로드 헬퍼·정렬 컬럼)만 재사용한다.
--
-- 파이프라인 위치: **노출** — 사슬의 첫 칸. 지금 홈 캐러셀 고정 배너는 PosterCarousel.tsx 소스에
--   하드코딩돼 있어 배너 한 장 바꾸려면 배포가 필요했다. 이 테이블이 그걸 운영 가능하게 만든다.
--
-- 롤백:
--   drop function if exists public.purge_expired_home_banners();
--   drop table if exists public.home_banners;

-- ── §1 테이블 ────────────────────────────────────────────────────────────────
create table if not exists public.home_banners (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null default '',          -- 카드에 겹쳐 쓰는 제목
  subtitle    text        not null default '',          -- 보조 한 줄(일시·매장 등)
  image_url   text        not null default '',          -- storage 공개 URL(960x448 권장 — 캐러셀 규격)
  link_url    text        not null default '',          -- 클릭 시 이동. 외부 URL 또는 앱 내부 경로(/?tab=...)
  sort_order  int         not null default 0,           -- 작을수록 앞
  starts_at   date,                                     -- null = 즉시
  ends_at     date,                                     -- null = 무기한. 지나면 노출 중단(+ 정리 함수가 삭제)
  active      boolean     not null default true,        -- 내용은 두고 노출만 끄는 스위치
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.home_banners is
  '홈 상단 캐러셀 배너. 읽기 공개(노출 조건은 클라이언트가 아니라 아래 인덱스·필터로 좁힌다), 쓰기 관리자 전용.';
create index if not exists home_banners_order_idx on public.home_banners (sort_order, created_at);

-- ── §2 RLS — 읽기 공개 / 쓰기 관리자 (community_ads 와 같은 형태) ──────────────
alter table public.home_banners enable row level security;
drop policy if exists home_banners_read on public.home_banners;
create policy home_banners_read on public.home_banners
  for select to anon, authenticated using (true);
drop policy if exists home_banners_admin_write on public.home_banners;
create policy home_banners_admin_write on public.home_banners
  for all to authenticated
  -- NULL-safe: my_role() 이 null(비로그인)이면 = 비교가 null 이라 정책이 통과하지 않는다.
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── §3 만료 자동 삭제 ────────────────────────────────────────────────────────
-- 노출은 ends_at 필터로 이미 멈춘다. 이 함수는 '지난 배너가 관리 목록에 계속 쌓이는 것'을 막는다.
-- 유예 7일 — 만료 당일에 지워버리면 오너가 실수로 날짜를 잘못 넣었을 때 복구할 방법이 없다.
create or replace function public.purge_expired_home_banners()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare n integer;
begin
  -- ⚠ SECURITY DEFINER 는 RLS 를 우회한다 — GRANT 만 authenticated 로 열면
  --   로그인한 아무 유저나 배너를 지울 수 있다. 권한은 함수 안에서 다시 강제한다.
  --   `is distinct from` 을 쓰는 이유: 비로그인이면 my_role() 이 null 이고 `<> 'admin'` 은
  --   null 로 평가돼 if 를 건너뛴다 = 가드가 열린다(CLAUDE.md 보안 §2 fail-open 함정).
  if public.my_role() is distinct from 'admin' then
    raise exception '관리자만 실행할 수 있습니다.' using errcode = '42501';
  end if;
  delete from public.home_banners
   where ends_at is not null and ends_at < current_date - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $function$;
comment on function public.purge_expired_home_banners() is
  '만료 후 7일 지난 홈 배너 정리. 크론 또는 관리자 화면에서 호출. 노출 중단은 이 함수와 무관하게 ends_at 필터가 담당.';

-- ACL 표준(CLAUDE.md 보안 §3): CREATE OR REPLACE 는 기본 GRANT 를 되돌리므로 다시 회수한다.
revoke execute on function public.purge_expired_home_banners() from public, anon;
grant  execute on function public.purge_expired_home_banners() to authenticated, service_role;

-- ── §4 갱신 시각 자동 유지 ────────────────────────────────────────────────────
create or replace function public._home_banners_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin new.updated_at := now(); return new; end $function$;
revoke execute on function public._home_banners_touch() from public, anon, authenticated;  -- 트리거 전용
drop trigger if exists home_banners_touch on public.home_banners;
create trigger home_banners_touch before update on public.home_banners
  for each row execute function public._home_banners_touch();

notify pgrst, 'reload schema';
