-- 2026-06-23 부하 점검(#1): getPosts 의 '내 좋아요'(RLS user_id=auth.uid())·toggle_post_like 가
-- user_id 로 필터하나 PK(post_id,user_id)의 2번째 컬럼이라 인덱스 미활용 → 좋아요 누적 시 느려짐.
create index if not exists post_likes_user_idx on public.post_likes(user_id);
