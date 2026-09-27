-- ✅ 적용 완료 2026-09-27 (nuri-lead, MCP execute_sql)
-- 리드 리허설(begin…raise 롤백): ① 정지 회원 댓글 before=ALLOWED → after=DENY P0001, 활성 회원 ALLOWED
--   ② 일반 회원 위조 글(pin·like 9999·2099·admin) → pin null·like 0·오늘·user, 댓글 수정 이름 위조 무시, 업주 자기 매장 댓글 is_owner=true, admin_set_post_pinned 정상
--   ③ community-team 리허설: 차단 관계 알림 1→0, 비차단 1 유지
-- 대상: profiles 7명 전원 status=active(잠김 없음), status 기본값 active

-- community-team 2026-09-27 점검 초안을 리드가 검토·적용.
-- 세 결함 모두 운영에서 begin…rollback(DO + 끝 RAISE) 리허설로 전(FAIL)·후(PASS)를 확인했다. 잔재 0 확인.

-- ── ① 제재 게이트가 한 번도 작동하지 않았다(CRITICAL) ─────────────────────────────
-- require_active_author() 가 SECURITY DEFINER 라 함수 안의 current_user 가 소유자(postgres)다.
--   → `if current_user in ('authenticated','anon') and not is_account_active()` 가 **항상 거짓**.
--   2026-08-20(20260820e) 부터 13개 테이블(글·댓글·장터·후기·라이브 한 줄·딜러 글/지원·그룹 글/채팅·매장 채팅·장터/유저 쪽지)의
--   정지 회원 작성 차단이 무력했다. 리허설: 정지(A) 댓글·글 ALLOWED → invoker 로 바꾸면 DENY P0001, 활성(B) 댓글 ALLOWED.
--   is_account_active() 는 따로 SECURITY DEFINER 라 invoker 에서도 profiles 를 읽는다.
alter function public.require_active_author() security invoker;

-- ── ② 클라이언트가 서버 전용 컬럼을 마음대로 싣는다(HIGH) ─────────────────────────
-- 리허설(현재): 일반 회원이 글 INSERT 에 pinned_at(관리자 고정)·bumped_until(100점 끌올 1년)·like/view 9999·created_at 2099·
--   user_role 'admin'(= 화면 '· 운영자' 배지) 을 실어 그대로 저장됐다. 댓글은 user_role admin·is_owner(업주 배지)·미래 시각,
--   UPDATE 로 다른 글로 이동(post_id)·표시 이름('관리자2') 변경까지 됐다. live_wall 역할 위조, 딜러글 author_name·created_at 변경도.
-- 고침: 클라이언트 역할(authenticated/anon)일 때만 서버 값으로 덮는다. SECURITY DEFINER RPC(고정·끌올·조회수·좋아요·SPOT 공유)는
--   current_user 가 소유자라 건드리지 않는다(리허설: admin_set_post_pinned 여전히 pinned=t).
--   ⚠ 이 함수는 **SECURITY DEFINER 로 만들지 않는다** — ①과 같은 이유로 current_user 판정이 죽는다.
create or replace function public._guard_ugc_client_cols() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if TG_TABLE_NAME = 'community_posts' then
    new.pinned_at := null; new.bumped_until := null; new.bump_count := 0; new.blinded := false;
    new.like_count := 0; new.comment_count := 0; new.view_count := 0; new.cheer_count := 0;
    new.badbeat_count := 0; new.goodrun_count := 0;
    new.created_at := now(); new.user_role := public.my_role();
  elsif TG_TABLE_NAME = 'live_wall' then
    new.created_at := now(); new.user_role := public.my_role();
  elsif TG_TABLE_NAME = 'comments' then
    if TG_OP = 'INSERT' then
      new.created_at := now(); new.user_role := public.my_role();
      -- 화면 계약과 같다: 매장 댓글=그 매장 주인, 포스터 문의=그 포스터 주인, 게시판=업주 역할(PostDetailModal.tsx:81 · App.tsx:3296·3317)
      new.is_owner := case
        when new.venue_id is not null then exists (select 1 from public.venues v where v.id = new.venue_id and v.owner_id = auth.uid())
        when new.schedule_id is not null then exists (select 1 from public.schedules s where s.id = new.schedule_id and s.owner_id = auth.uid())
        else public.my_role() = 'venue_owner' end;
    else
      new.user_id := old.user_id; new.user_name := old.user_name; new.user_role := old.user_role;
      new.is_owner := old.is_owner; new.created_at := old.created_at;
      new.post_id := old.post_id; new.venue_id := old.venue_id; new.schedule_id := old.schedule_id; new.parent_id := old.parent_id;
    end if;
  elsif TG_TABLE_NAME = 'dealer_posts' and TG_OP = 'UPDATE' then
    new.author_id := old.author_id; new.author_name := old.author_name; new.created_at := old.created_at;
  end if;
  return new;
end $f$;
revoke execute on function public._guard_ugc_client_cols() from public, anon, authenticated;

drop trigger if exists trg_guard_client_cols on public.community_posts;
create trigger trg_guard_client_cols before insert on public.community_posts for each row execute function public._guard_ugc_client_cols();
drop trigger if exists trg_guard_client_cols on public.live_wall;
create trigger trg_guard_client_cols before insert on public.live_wall for each row execute function public._guard_ugc_client_cols();
drop trigger if exists trg_guard_client_cols on public.comments;
create trigger trg_guard_client_cols before insert or update on public.comments for each row execute function public._guard_ugc_client_cols();
drop trigger if exists trg_guard_client_cols on public.dealer_posts;
create trigger trg_guard_client_cols before update on public.dealer_posts for each row execute function public._guard_ugc_client_cols();
-- (장터 marketplace_listings 의 like/view/created_at 위조는 guard_listing_seller 소관 — 장터 담당에게 따로 보고)

-- ── ③ 차단한 사람의 댓글 알림이 온다(MEDIUM · 제품 판단 필요 시 리드 확인) ──────────────
-- 리허설(현재): B 가 A 를 차단해도 A 가 B 글에 단 댓글 알림이 B 에게 1건. 고친 뒤 0건, 차단 없는 경우 1건(양성).
create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_owner uuid; v_title text; v_link text;
begin
  if new.schedule_id is not null then
    select owner_id into v_owner from public.schedules where id = new.schedule_id;
    v_title := '내 포스터에 새 문의가 등록되었습니다'; v_link := '/schedules/' || new.schedule_id;
  elsif new.venue_id is not null then
    select owner_id into v_owner from public.venues where id = new.venue_id;
    v_title := '내 매장 커뮤니티에 새 댓글이 등록되었습니다'; v_link := '/community/' || new.venue_id;
  elsif new.post_id is not null then
    select user_id into v_owner from public.community_posts where id = new.post_id;
    v_title := '💬 내 글에 댓글이 달렸어요'; v_link := '/posts/' || new.post_id;
  else
    return new;
  end if;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  if exists (select 1 from public.user_blocks b where b.blocker_id = v_owner and b.blocked_id = new.user_id) then return new; end if;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link, read)
  values (v_owner, 'comment', v_title, left(coalesce(new.content, ''), 80), left(coalesce(new.user_name, '?'), 1), '#5A6175', v_link, false);
  return new;
end $f$;
revoke execute on function public.notify_on_comment() from public, anon, authenticated;
