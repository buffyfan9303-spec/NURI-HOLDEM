-- 20260911n — 서버 제재 게이트를 댓글·쪽지·구인글까지 넓힌다 (E-댓글제재, 2026-09-11)
--
-- 무엇이 문제였나
--   20260820e 가 만든 게이트는 세 테이블에만 붙어 있다 — community_posts · venue_reviews ·
--   marketplace_listings. comments 의 insert 정책(baseline 4893줄)은 "로그인했고 user_id = auth.uid()"
--   만 본다. status='banned'/'suspended' 인 회원도 유효 JWT 만 있으면 댓글을 계속 남긴다.
--   comments 에는 금칙어(trg_block_ugc)와 5초 쿨다운(trg_rl_comments)이 이미 걸려 있지만
--   '이 계정이 제재 중인가'는 아무도 보지 않는다.
--
-- 함수를 새로 만들지 않는 이유
--   require_active_author 는 NEW 의 어떤 컬럼도 읽지 않는다 — auth.uid() 로 profiles 의
--   status·suspended_until 만 본다(둘 다 baseline profiles 에 실재, NOT NULL / default 'active').
--   20260827c 가 지운 profiles.ci 의존 없음. CREATE OR REPLACE 를 한 번도 하지 않으므로
--   기존 두 함수의 ACL·본문이 그대로 유지된다.
--
-- ⚠ 누가 막히는가 — '제재'만이 아니다
--   is_account_active() 는 status = 'active' 만 통과시킨다. user_status enum 에는 'pending' 이 있고
--   handle_new_user(20260602e)가 **venue_owner 가입자를 'pending' 으로 만든다**. 승인 대기 업주는
--   지금도 글·후기·매물을 못 쓰는데, 이번 변경으로 댓글·매장 채팅·딜러 구인글·쪽지까지 못 쓰게 된다.
--   관리자 승인 버튼은 status='active' 와 approved=true 를 함께 바꾸므로(UserManagementTab.tsx:200)
--   영업 중인 업주는 영향이 없다. 다만 approveOwner()·admin_decide_venue_owner() 는 approved 만
--   바꾸므로, **적용 전에 아래를 1회 조회해 0 인지 확인할 것**:
--     select count(*) from public.profiles where role='venue_owner' and approved and status <> 'active';
--
-- 막는 것 (BEFORE INSERT 9개 추가)
--   comments · live_wall · dealer_posts · dealer_applications · group_posts · group_messages
--   · venue_messages · listing_messages · user_messages
--   + comments 만 BEFORE UPDATE OF content, post_id
--
-- 막지 않는 것 (의도적)
--   support_inquiries — 1:1 문의는 제재 이의제기 창구다(카테고리에 '신고/제재' 존재: src/api/support.ts:5).
--   reports          — 신고는 피해자의 방어 수단이다.
--   user_blocks      — 상대 차단은 자기 보호다.
--   spot_reviews     — '내 스팟'(비공개, 작성자만 읽고 쓴다) — 노출이 없어 도배가 성립하지 않는다.
--   예약·좋아요/투표/응원/체크인·community_shouts
--                    — 전부 SECURITY DEFINER RPC 경유라 트리거 안에서 current_user 가 함수 소유자가
--                      되어 게이트 조건(authenticated/anon)이 거짓이 된다. 트리거로는 못 막는다.
--   업주·관리자 운영 테이블(venues·schedules·공지·배너·미션·쿠폰) — 범위가 다른 정책 결정이다.
--
-- UPDATE 를 comments 에만 거는 이유 · 그리고 그것만으로는 부족한 이유
--   기존 3개가 insert 만 거는 것은 UPDATE 호출자가 실재하기 때문이다(매물 판매완료·글 블라인드·후기 수정).
--   comments 는 저장소 전체에 UPDATE 호출자가 0건이다(src 는 select/insert/delete 뿐, supabase/ 에
--   `update comments` 0건). 그래서 컬럼을 content·post_id 로 못박은 트리거를 걸어도 잃는 기능이 없다.
--   ⚠ 다만 트리거는 **제재 계정만** 막는다. 20260726c 머리말이 지적한 진짜 구멍 —
--   comments_update_self 에 WITH CHECK 이 없어 user_id 를 남의 것으로 바꿔 남이 쓴 댓글로 둔갑시킬 수
--   있는 것 — 은 정상 회원 전원에게 열려 있다. 호출자가 0건이므로 아래 ④ 에서 그 한 줄을 같이 닫는다.
--
-- 비파괴 확인
--   · 순수 additive: 트리거 10개 + 정책 WITH CHECK 1개 + ACL 1건. 기존 행 변경 **0행**.
--   · CREATE OR REPLACE FUNCTION 0회 · DROP TABLE / TRUNCATE / 컬럼 삭제 / UPDATE / DELETE 없음.
--   · SELECT 정책은 손대지 않는다 — realtime 구독·비로그인 조회 영향 0.
--   · 정상 회원·업주·관리자·service_role·엣지함수·크론은 종전과 문자 그대로 같이 동작한다.
--
-- 배포 순서
--   앱이 먼저 배포되고 DB 가 나중이다. 새 RPC 를 만들지 않으므로 PGRST202 가 생길 자리가 없다.

-- ── ① 댓글 (이번 항목) ─────────────────────────────────────────────────────
drop trigger if exists trg_require_active_comment on public.comments;
create trigger trg_require_active_comment before insert on public.comments
  for each row execute function public.require_active_author();

-- 내용 바꿔치기·글 이동 차단. 컬럼을 못박아 두어야 훗날 생길 시스템 UPDATE 가 오폭되지 않는다.
drop trigger if exists trg_require_active_comment_edit on public.comments;
create trigger trg_require_active_comment_edit before update of content, post_id on public.comments
  for each row execute function public.require_active_author();

-- ── ② 같은 구멍이 남아 있던 나머지 8개 ─────────────────────────────────────
drop trigger if exists trg_require_active_live on public.live_wall;
create trigger trg_require_active_live before insert on public.live_wall
  for each row execute function public.require_active_author();

drop trigger if exists trg_require_active_dealer_post on public.dealer_posts;
create trigger trg_require_active_dealer_post before insert on public.dealer_posts
  for each row execute function public.require_active_author();

-- 지원서에는 unique 제약이 없다(PK(id) 뿐) — 같은 구인글에 무한 지원이 가능했다.
drop trigger if exists trg_require_active_dealer_app on public.dealer_applications;
create trigger trg_require_active_dealer_app before insert on public.dealer_applications
  for each row execute function public.require_active_author();

drop trigger if exists trg_require_active_group_post on public.group_posts;
create trigger trg_require_active_group_post before insert on public.group_posts
  for each row execute function public.require_active_author();

drop trigger if exists trg_require_active_group_msg on public.group_messages;
create trigger trg_require_active_group_msg before insert on public.group_messages
  for each row execute function public.require_active_author();

drop trigger if exists trg_require_active_venue_msg on public.venue_messages;
create trigger trg_require_active_venue_msg before insert on public.venue_messages
  for each row execute function public.require_active_author();

drop trigger if exists trg_require_active_listing_msg on public.listing_messages;
create trigger trg_require_active_listing_msg before insert on public.listing_messages
  for each row execute function public.require_active_author();

drop trigger if exists trg_require_active_user_msg on public.user_messages;
create trigger trg_require_active_user_msg before insert on public.user_messages
  for each row execute function public.require_active_author();

-- ── ③ 트리거 함수 직접 호출 차단 ───────────────────────────────────────────
-- 20260902b(:94)가 이미 같은 3롤에서 회수했다 — 여기서는 재확인(멱등)이고 service_role grant 만 새로 붙는다.
-- EXECUTE 권한은 CREATE TRIGGER 시점에만 검사되고 발화 때는 검사하지 않는다
-- (20260603d:8~10 이 rl_posts·rl_comments·rl_live 에 같은 처리를 했고 그 트리거들은 지금도 돈다).
-- is_account_active() 는 건드리지 않는다(e2e/_fixtures.ts 읽기 RPC 허용목록에 들어 있다).
revoke execute on function public.require_active_author() from public, anon, authenticated;
grant execute on function public.require_active_author() to service_role;

comment on trigger trg_require_active_comment on public.comments is
  '제재(banned/suspended/pending/기간 미만료) 계정의 댓글 작성 차단 — 20260911n. '
  '글·후기·매물만 막혀 있어 댓글이 유일하게 열린 도배 경로였다.';

-- ── ④ 댓글 UPDATE 의 진짜 구멍 — 정책에 WITH CHECK 이 없다 ─────────────────
-- 위 트리거는 제재 계정만 막는다. 정상 회원은 지금도 자기 댓글의 user_id 를 남의 것으로 바꿔
-- '그 사람이 쓴 댓글'로 둔갑시킬 수 있다(baseline 4899줄 정책에 WITH CHECK 부재, 20260726c 가 지적).
-- comments UPDATE 호출자가 저장소 전체에 0건이라 WITH CHECK 을 붙여도 잃는 기능이 없다.
-- USING 은 손대지 않는다 — SELECT·DELETE·realtime 과 무관하다.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_update_self'
  ) then
    raise exception 'ABORT: comments_update_self 정책이 없다 — 이름이 바뀌었는지 확인하고 다시 설계해라';
  end if;
  execute 'alter policy comments_update_self on public.comments with check (user_id = (select auth.uid()))';
end $$;

-- ── 자가검사 — 어긋나면 이 마이그레이션 전체가 롤백된다 ─────────────────────
-- (prosrc 를 훑지 않고 pg_trigger·pg_policies 카탈로그를 본다 — 주석이 검사를 통과시키는 착시가 없다.)
do $$
declare
  v_gap text;
begin
  -- ① 제재 게이트(BEFORE INSERT)가 붙어 있어야 하는 12개 전수. 기존 3개까지 함께 확인한다.
  select string_agg(t.tbl, ', ' order by t.tbl) into v_gap
  from (values
      ('community_posts'::text), ('venue_reviews'), ('marketplace_listings'),
      ('comments'), ('live_wall'), ('dealer_posts'), ('dealer_applications'),
      ('group_posts'), ('group_messages'), ('venue_messages'),
      ('listing_messages'), ('user_messages')
    ) as t(tbl)
  where not exists (
    select 1
      from pg_trigger g
      join pg_class     c on c.oid = g.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc      p on p.oid = g.tgfoid
     where n.nspname = 'public'
       and c.relname::text = t.tbl
       and p.proname = 'require_active_author'
       and not g.tgisinternal
       and (g.tgtype & 2) <> 0    -- BEFORE
       and (g.tgtype & 4) <> 0    -- INSERT
  );
  if v_gap is not null then
    raise exception 'ABORT: 제재 게이트(작성)가 빠진 테이블 — %', v_gap;
  end if;

  -- ② 댓글 바꿔치기 게이트(UPDATE)
  if not exists (
    select 1
      from pg_trigger g
      join pg_class     c on c.oid = g.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc      p on p.oid = g.tgfoid
     where n.nspname = 'public' and c.relname = 'comments'
       and p.proname = 'require_active_author' and not g.tgisinternal
       and (g.tgtype & 16) <> 0   -- UPDATE
  ) then
    raise exception 'ABORT: comments 내용 바꿔치기 게이트(UPDATE)가 없다';
  end if;

  -- ③ 판정 함수 두 개가 실재 · SECURITY DEFINER · search_path 고정인가
  if (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('require_active_author', 'is_account_active')
         and p.prosecdef
         and array_to_string(coalesce(p.proconfig, '{}'), ',') like '%search_path=%') <> 2 then
    raise exception 'ABORT: 제재 판정 함수가 없거나 SECURITY DEFINER·search_path 고정이 아니다';
  end if;

  -- ④ 막으면 안 되는 곳까지 막히지 않았는가 — 이의제기·신고·차단은 제재 회원도 써야 한다
  select string_agg(distinct c.relname::text, ', ') into v_gap
    from pg_trigger g
    join pg_class     c on c.oid = g.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc      p on p.oid = g.tgfoid
   where n.nspname = 'public'
     and c.relname in ('support_inquiries', 'reports', 'user_blocks')
     and p.proname = 'require_active_author'
     and not g.tgisinternal;
  if v_gap is not null then
    raise exception 'ABORT: 이의제기·신고·차단 경로까지 막혔다 — %', v_gap;
  end if;

  -- ⑤ 댓글 UPDATE 정책의 WITH CHECK 이 실제로 붙었는가(작성자 위조 차단)
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'comments'
       and policyname = 'comments_update_self' and with_check is not null
  ) then
    raise exception 'ABORT: comments_update_self 에 WITH CHECK 이 없다 — 작성자 위조가 열려 있다';
  end if;
end $$;

-- ROLLBACK (데이터 무관)
-- drop trigger if exists trg_require_active_comment on public.comments;
-- drop trigger if exists trg_require_active_comment_edit on public.comments;
-- drop trigger if exists trg_require_active_live on public.live_wall;
-- drop trigger if exists trg_require_active_dealer_post on public.dealer_posts;
-- drop trigger if exists trg_require_active_dealer_app on public.dealer_applications;
-- drop trigger if exists trg_require_active_group_post on public.group_posts;
-- drop trigger if exists trg_require_active_group_msg on public.group_messages;
-- drop trigger if exists trg_require_active_venue_msg on public.venue_messages;
-- drop trigger if exists trg_require_active_listing_msg on public.listing_messages;
-- drop trigger if exists trg_require_active_user_msg on public.user_messages;
-- WITH CHECK 회수는 권장하지 않는다(되돌리면 작성자 위조가 다시 열린다).
