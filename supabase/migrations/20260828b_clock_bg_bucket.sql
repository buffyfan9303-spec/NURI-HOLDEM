-- 2026-08-28 클락 배경 이미지 — 전용 공개 버킷 clock_bg
--
-- 왜 새 버킷인가(기존 재사용을 검토한 결과):
--   · community_images  INSERT = "로그인한 사용자면 누구나" — 경로(어느 매장 폴더인가)를 보지 않는다.
--   · posters           INSERT = "역할이 venue_owner/admin" — 역시 경로를 보지 않아 남의 매장 폴더에 쓸 수 있다.
--   클락 배경은 매장 TV 에 상시 송출되는 자산이라 '업주가 본인 매장 폴더에만 쓴다'가 필요하다.
--   그 조건을 기존 버킷에 덧붙이면 지금 잘 돌고 있는 포스터·커뮤니티 업로드 정책까지 건드리게 되므로 분리한다.
--
-- 경로 계약: <venue_id>/<timestamp>.webp  →  (storage.foldername(name))[1] = venue_id
--   업로더(clockBgImage.ts)와 이 정책이 같은 규칙을 공유한다. 경로가 바뀌면 여기도 바뀌어야 한다.
--
-- 읽기: 이미지 표시는 public 버킷의 getPublicUrl(CDN, RLS 우회)로 나가므로 '누구나 SELECT' 정책은 두지 않는다
--   (20260623b — 공개 버킷의 광범위 SELECT 제거 규약 유지: 아무나 객체 목록을 훑을 수 없다).
--   대신 **본인 매장 폴더에 한정한** SELECT 를 연다. 이유는 보여주기가 아니라 지우기다 —
--   storage 의 remove() 는 지울 대상을 먼저 SELECT 하는데, RLS 로 안 보이면 조용히 0건 삭제로 성공한다.
--   그러면 배경을 교체할 때마다 옛 파일이 영원히 남는다(무료 한도 5GB 를 갉아먹는 조용한 누수).
--
-- 멱등 → 재실행 안전. 기존 데이터에 대한 영향 0(신규 버킷·신규 함수·신규 정책만 추가).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clock_bg', 'clock_bg', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public            = true,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 판정은 함수 하나로 뽑는다. 정책식 안에 EXISTS 서브쿼리를 직접 쓰면
--   exists (select 1 from public.venues v where v.id::text = (storage.foldername(name))[1] ...)
-- 의 `name` 이 **바깥의 storage.objects.name 이 아니라 안쪽 venues.name 으로 결합된다**(내부 스코프 우선).
-- 그러면 매장 '이름'을 uuid 와 비교하게 되어 정책이 항상 거짓 → 본인 매장 업로드까지 403 이 된다.
-- (실제로 이 순서로 한 번 밟았다. 파라미터로 넘기면 이 결합 사고가 구조적으로 불가능해진다.)
--
-- SECURITY INVOKER: venues 의 RLS 도 호출자 기준으로 그대로 적용된다.
-- can_manage_pos = admin · 매장 owner · 승인된 venue_owners (그쪽이 SECURITY DEFINER STABLE).
create or replace function public.clock_bg_writable(p_name text)
returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.venues v
    where v.id::text = (storage.foldername(p_name))[1]
      and public.can_manage_pos(v.id)
  );
$$;
-- ACL: CREATE OR REPLACE 는 ACL 을 초기화하고, 그 뒤 Supabase 기본권한(ALTER DEFAULT PRIVILEGES)이
--   anon/service_role 에도 EXECUTE 를 붙인다. `revoke ... from public` 은 그렇게 붙은 **명시 롤 grant 를
--   지우지 못한다** — anon 은 따로 회수해야 한다(§ACL 규칙: FROM PUBLIC 만으로는 무효).
revoke all on function public.clock_bg_writable(text) from public;
revoke all on function public.clock_bg_writable(text) from anon;
grant execute on function public.clock_bg_writable(text) to authenticated;

-- 본인 매장 폴더 한정 SELECT — remove() 가 실제로 지울 수 있게 하는 최소 권한(공개 목록 열람 아님).
drop policy if exists "clock_bg_owner_read" on storage.objects;
create policy "clock_bg_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'clock_bg' and public.clock_bg_writable(name));

-- 쓰기 3종(INSERT/UPDATE/DELETE) — 본인이 관리하는 매장 폴더만.
drop policy if exists "clock_bg_insert" on storage.objects;
create policy "clock_bg_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clock_bg' and public.clock_bg_writable(name));

drop policy if exists "clock_bg_update" on storage.objects;
create policy "clock_bg_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'clock_bg' and public.clock_bg_writable(name))
  with check (bucket_id = 'clock_bg' and public.clock_bg_writable(name));

drop policy if exists "clock_bg_delete" on storage.objects;
create policy "clock_bg_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clock_bg' and public.clock_bg_writable(name));
