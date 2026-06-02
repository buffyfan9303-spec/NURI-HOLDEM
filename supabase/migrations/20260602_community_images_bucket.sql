-- ============================================================================
-- Task 1: 커뮤니티 글쓰기 전용 스토리지 버킷 'community_images' 생성
--  기존엔 listings 버킷을 community/ 경로로 재사용했으나, 요구사항 명세에 맞춰
--  전용 공개 버킷을 분리한다. 정책은 listings 버킷과 동일 패턴:
--   - read   : 누구나 공개 읽기(public SELECT)
--   - upload : 로그인 사용자만 업로드(INSERT, auth.uid() not null)
--   - delete : 업로더 본인만 삭제(owner = auth.uid())
--  모두 멱등 → 재실행 안전.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('community_images', 'community_images', true)
on conflict (id) do update set public = true;

-- 공개 읽기
drop policy if exists "community_images_read" on storage.objects;
create policy "community_images_read" on storage.objects
  for select to public
  using (bucket_id = 'community_images');

-- 로그인 사용자 업로드
drop policy if exists "community_images_upload" on storage.objects;
create policy "community_images_upload" on storage.objects
  for insert to public
  with check (bucket_id = 'community_images' and auth.uid() is not null);

-- 업로더 본인 삭제
drop policy if exists "community_images_delete" on storage.objects;
create policy "community_images_delete" on storage.objects
  for delete to public
  using (bucket_id = 'community_images' and owner = auth.uid());
