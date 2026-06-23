-- 2026-06-23 보안 (감사 #11): public 버킷의 광범위 SELECT(list) 정책 제거.
-- avatars/community_images/listings/posters 는 모두 public 버킷이라 이미지 표시는 getPublicUrl
-- (공개 CDN, RLS 우회)로 동작하고, 앱은 .list()/.download() 를 쓰지 않음 → 객체목록 열람만 차단.
-- rank 인증 이미지용 verif_admin_read(관리자 전용 SELECT)는 유지.
drop policy if exists avatars_read on storage.objects;
drop policy if exists community_images_read on storage.objects;
drop policy if exists listings_read on storage.objects;
drop policy if exists posters_read on storage.objects;
