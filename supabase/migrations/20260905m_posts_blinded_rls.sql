-- ============================================================================
-- 20260905m — 숨김(blinded) 게시글 열람 RLS (모바일 점검 확정 결함 #11, 2026-09-05)
--
-- 문제: community_posts 의 posts_select 가 라이브 실측 `using (true)`(roles public) 라 신고 누적으로 숨김
--   처리된 글이 `?post=<id>` 공유 링크·알림 링크로 비로그인에게도 전문(제목·본문·사진) 노출됐다.
--   클라이언트 피드 필터(CommunityTab)만 가리고 있었고 getPostById 는 조건 없이 `.eq('id')` 였다.
-- 수정: posts_select → blinded 가 아니거나, 작성자 본인이거나, 운영자만. 첨부(post_hands·post_polls·
--   post_poll_options — 20260827h 의 읽기 정책 using(true))는 부모 글이 보일 때만(exists) 보이게 묶는다.
--   서브쿼리 안의 community_posts 접근에도 호출자의 posts_select 가 그대로 적용되므로 판정식은 한 곳뿐이다.
--
-- 라이브 정합 근거(브리프 스냅샷 2026-09-05, 프로젝트 idsxiqspecrucvfvtgbw):
--   · 라이브 pg_policies 실측 `posts_select: SELECT using (true)` = baseline 2026-07-20 4929행
--     `create policy posts_select on public.community_posts for select to public using (true)` → drop 후 재생성.
--   · 같은 표의 posts_delete 가 `my_role() = 'admin'::user_role` 로 운영자를 판정한다(baseline 4923행) — 같은 식.
--   · blinded 는 `boolean default false not null`(baseline 151행) 이라 coalesce 불필요.
--   · community_posts 를 읽는 함수(자동숨김·admin_set_post_blinded·끌올·댓글알림·rl_posts 등)는 저장소
--     마이그레이션·baseline 전수 스캔에서 전부 SECURITY DEFINER(invoker 0건) → 이 정책의 영향 없음.
--   · 첨부 3정책명은 20260827h 원문: post_hands_read · post_polls_read · post_options_read.
--
-- 소급: 데이터 변경 0. 현재 blinded 행 0건(잠복). 타인·비로그인에게 숨김 글은 0 rows 가 된다 —
--   클라 getPostById 는 maybeSingle → null → 기존 '삭제되었거나 찾을 수 없는 글이에요' 토스트가 안내한다.
-- 롤백:
--   drop policy if exists posts_select on public.community_posts;
--   create policy posts_select on public.community_posts for select using (true);
--   (첨부 3정책도 같은 이름으로 using (true) 재생성)
-- ============================================================================

-- ── ① 게시글 본문 ─────────────────────────────────────────────────────────────
drop policy if exists posts_select on public.community_posts;
create policy posts_select on public.community_posts for select
  using (blinded = false or user_id = (select auth.uid()) or my_role() = 'admin'::user_role);

-- ── ② 첨부(핸드 카드·투표) — 부모 글이 보일 때만 ──────────────────────────────
drop policy if exists post_hands_read on public.post_hands;
create policy post_hands_read on public.post_hands for select
  using (exists (select 1 from public.community_posts p where p.id = post_id));

drop policy if exists post_polls_read on public.post_polls;
create policy post_polls_read on public.post_polls for select
  using (exists (select 1 from public.community_posts p where p.id = post_id));

drop policy if exists post_options_read on public.post_poll_options;
create policy post_options_read on public.post_poll_options for select
  using (exists (
    select 1 from public.post_polls pl join public.community_posts p on p.id = pl.post_id
    where pl.id = poll_id));

notify pgrst, 'reload schema';
