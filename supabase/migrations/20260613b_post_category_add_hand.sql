-- 게시판 '핸드' 카테고리 — 글쓰기 모달에 있던 카테고리가 enum에 없어 게시 400(22P02) 나던 버그 수정
alter type post_category add value if not exists 'hand';

-- '대회 후기' 카테고리도 enum 누락 — hand와 동일 버그 예방
alter type post_category add value if not exists 'tourney';
