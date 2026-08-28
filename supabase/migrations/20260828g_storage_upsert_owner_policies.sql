-- ============================================================================
-- 업로드 전면 차단 해소 (2026-08-28, 라이브 장애 수정)
--
-- 증상: 2026-06-20 이후 storage 에 올라온 객체가 0건. 포스터·아바타·커뮤니티 사진·장터
--       이미지 업로드가 전부 조용히 실패하고 있었다.
--
-- 원인(실측): 앱의 uploadToStorage 는 모든 버킷에 upsert:true 를 쓴다. upsert 는
--   INSERT ... ON CONFLICT DO UPDATE 경로라 **기존 행을 읽고(SELECT) 갱신(UPDATE)** 할 수
--   있어야 하는데, 20260623b 가 avatars/community_images/listings/posters 의 SELECT 정책을
--   전부 드롭하면서(광범위 공개 목록 제거 목적) upsert 가 RLS 에 걸렸다.
--   실측: 같은 계정·같은 파일로 upsert:true → 403 "new row violates row-level security
--   policy", upsert:false → 200. SELECT 정책이 있는 clock_bg 는 upsert:true 도 성공.
--
-- 처방: 드롭했던 '전체 공개 목록'을 되살리는 게 아니라, **본인이 올린 객체만** 보이는
--   좁은 SELECT 와 UPDATE 를 연다(clock_bg 선례와 같은 문법). 남의 파일 목록은 여전히
--   보이지 않으므로 20260623b 의 의도는 유지된다.
--   ⚠ 공개 읽기(이미지 표시)는 이 정책과 무관하다 — 네 버킷 모두 public 이라 getPublicUrl
--     경로는 CDN 이 처리한다(정책 없이도 지금까지 이미지가 보이던 이유).
--   verifications(비공개·민감)는 건드리지 않는다 — 기존 admin 전용 유지.
-- ============================================================================

-- 본인 객체만 조회 — upsert 의 충돌 확인에 필요
drop policy if exists avatars_read_own on storage.objects;
create policy avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

drop policy if exists posters_read_own on storage.objects;
create policy posters_read_own on storage.objects for select to authenticated
  using (bucket_id = 'posters' and owner = auth.uid());

drop policy if exists community_images_read_own on storage.objects;
create policy community_images_read_own on storage.objects for select to authenticated
  using (bucket_id = 'community_images' and owner = auth.uid());

drop policy if exists listings_read_own on storage.objects;
create policy listings_read_own on storage.objects for select to authenticated
  using (bucket_id = 'listings' and owner = auth.uid());

-- 본인 객체만 갱신 — upsert 의 DO UPDATE 에 필요(avatars 는 이미 avatars_update 보유)
drop policy if exists posters_update_own on storage.objects;
create policy posters_update_own on storage.objects for update to authenticated
  using (bucket_id = 'posters' and owner = auth.uid())
  with check (bucket_id = 'posters' and owner = auth.uid());

drop policy if exists community_images_update_own on storage.objects;
create policy community_images_update_own on storage.objects for update to authenticated
  using (bucket_id = 'community_images' and owner = auth.uid())
  with check (bucket_id = 'community_images' and owner = auth.uid());

drop policy if exists listings_update_own on storage.objects;
create policy listings_update_own on storage.objects for update to authenticated
  using (bucket_id = 'listings' and owner = auth.uid())
  with check (bucket_id = 'listings' and owner = auth.uid());

-- ── 덤: INSERT 가 경로를 안 보고 있었다(발견) ───────────────────────────────
-- posters/avatars/listings 의 INSERT 정책은 '로그인했는가'(+포스터는 역할)만 보고
-- **경로를 검사하지 않아** 남의 폴더에도 파일을 넣을 수 있었다(실측: 200).
-- 남의 기존 파일을 덮어쓰진 못하지만(UPDATE 는 owner 한정) 쓰레기 투입은 가능했다.
-- 세 버킷의 앱 경로는 전부 `<auth.uid()>/…` 이므로(호출부 전수 확인) verifications 와
-- 같은 문법으로 첫 폴더를 잠근다. community_images 는 경로가 `venues/<id>/…`,
-- `community/<uid>/…` 로 이질적이라 이번 범위에서 제외(별도 카드).
drop policy if exists avatars_upload on storage.objects;
create policy avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists listings_upload on storage.objects;
create policy listings_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'listings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists posters_upload on storage.objects;
create policy posters_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'posters'
              and (storage.foldername(name))[1] = auth.uid()::text
              and my_role() = any (array['venue_owner'::user_role, 'admin'::user_role]));
