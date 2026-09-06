-- ============================================================================
-- 상한이 없던 스토리지 버킷 2개를 나머지와 같은 기준으로 맞춘다 (2026-09-07 보안 점검)
--
-- 무엇이 열려 있었나
--   avatars·clock_bg·listings·posters 는 5MB + 이미지 3종으로 묶여 있는데
--   community_images(공개)와 verifications(비공개)만 file_size_limit·allowed_mime_types 가
--   둘 다 null 이었다. 업로드 정책은 `auth.uid() is not null` 이라 비로그인은 못 올리지만,
--   로그인 사용자라면 용량·형식 제한 없이 올릴 수 있었다.
--   공개 버킷인 community_images 는 무료 티어 egress 5GB/월 천장을 직접 갉아먹고,
--   임의 MIME 이 공개 오리진에서 그대로 서빙된다.
--
-- 왜 이 값인가
--   클라이언트는 두 경로 모두 캔버스 재인코딩 후 image/webp 한 종류만 올린다
--   (src/lib/storage.ts:82 uploadToStorage · src/api/rankverify.ts:65). 형제 버킷과
--   같은 5MB·(jpeg|png|webp) 면 실사용에 닿지 않는다.
--
-- 적용 시점 두 버킷 모두 objects 0건 — 기존 파일이 규칙에 걸릴 일이 없다.
-- 멱등: 이미 상한이 있으면 건드리지 않는다.
-- ============================================================================

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id in ('community_images','verifications')
   and file_size_limit is null;
