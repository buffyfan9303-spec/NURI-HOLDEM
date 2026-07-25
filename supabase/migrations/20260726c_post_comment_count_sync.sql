--
-- 왜: community_posts.comment_count 를 올려주는 주체가 DB(트리거·RPC)에도 앱에도 전혀 없어
--     목록의 [n] 배지가 영구히 0 이었다. 한국 게시판에서 [n]은 "어떤 글을 열지" 고르는 신호라
--     0으로 고정되면 반응 있는 글이 묻힌다.
-- 왜 앱이 아니라 트리거인가: 댓글 생성/삭제 경로가 늘어날 때마다 카운터를 빠뜨릴 수 있고,
--     RLS 상 클라이언트는 community_posts 를 UPDATE 할 수도 없다. 단일 소스로 DB에 둔다.
-- 왜 실시간 count(*) 조인이 아닌 비정규화 카운터인가: getPosts() 가 50건을 한 번에 읽는 경로라
--     행마다 count(*) 는 비싸다. like_count(toggle_post_like)·view_count(increment_post_view) 와
--     같은 기존 관행을 그대로 따른다.
-- 왜 SECURITY DEFINER 인가(가장 중요): community_posts 에는 UPDATE 정책이 단 하나도 없다
--     (posts_select/posts_insert/posts_delete 뿐). 일반 로그인 사용자 권한으로 도는 트리거는
--     RLS에 막혀 "0행 갱신 + 에러 없음" 으로 조용히 실패한다. 기존 like_count/view_count 를
--     전부 SECURITY DEFINER RPC 로만 올리는 이유가 같다.
-- 왜 UPDATE OF post_id 까지 보는가: comments_update_self 정책에 WITH CHECK 이 없어
--     본인 댓글의 post_id 를 다른 글로 옮기는 것이 막혀 있지 않다. 이동 시 양쪽 카운터를 맞춘다.
-- 삭제 처리: comments 는 하드 딜리트(soft-delete 컬럼 없음)라 AFTER DELETE 로 충분하다.
--     글 삭제 시에는 ON DELETE CASCADE 로 댓글이 따라 지워지는데, 그때 부모 글은 이미 사라져
--     update 가 0행이 되므로 별도 방어가 필요 없다.

create or replace function public._sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if TG_OP = 'INSERT' then
    if new.post_id is not null then
      update public.community_posts
         set comment_count = coalesce(comment_count, 0) + 1
       where id = new.post_id;
    end if;

  elsif TG_OP = 'DELETE' then
    if old.post_id is not null then
      update public.community_posts
         set comment_count = greatest(0, coalesce(comment_count, 0) - 1)
       where id = old.post_id;
    end if;

  elsif TG_OP = 'UPDATE' and old.post_id is distinct from new.post_id then
    -- 댓글이 다른 글로 옮겨간 경우: 이전 글은 -1, 새 글은 +1
    if old.post_id is not null then
      update public.community_posts
         set comment_count = greatest(0, coalesce(comment_count, 0) - 1)
       where id = old.post_id;
    end if;
    if new.post_id is not null then
      update public.community_posts
         set comment_count = coalesce(comment_count, 0) + 1
       where id = new.post_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_post_comment_count on public.comments;
create trigger trg_post_comment_count
  after insert or delete or update of post_id on public.comments
  for each row execute function public._sync_post_comment_count();

-- 내부 전용(트리거에서만 발화) — 신규 함수는 기본 ACL 이 PUBLIC EXECUTE 라 명시 revoke 한다.
-- 트리거 함수의 EXECUTE 권한은 CREATE TRIGGER 시점에만 검사되므로 revoke 해도 발화는 정상이다
-- (같은 DB의 award_comment_points·rl_comments·fill_user_avatar 가 이미 이 ACL 로 잘 돌고 있다).
revoke all on function public._sync_post_comment_count() from public, anon, authenticated;
grant execute on function public._sync_post_comment_count() to service_role;

-- ── 기존 데이터 1회 백필 ──────────────────────────────────────────────────────
-- 실제 댓글 수와 다른 글만 갱신(댓글 0건인데 값이 남아 있는 글도 0으로 정리된다).
update public.community_posts p
   set comment_count = x.n
  from (
    select p2.id,
           (select count(*)::int from public.comments c where c.post_id = p2.id) as n
      from public.community_posts p2
  ) x
 where x.id = p.id
   and p.comment_count is distinct from x.n;

-- ── 자기검증 (하나라도 어긋나면 전체 롤백) ────────────────────────────────────
do $$
declare
  v_secdef  boolean;
  v_trigdef text;
  v_anon    boolean;
  v_drift   int;
  v_oid     oid;
begin
  select p.oid, p.prosecdef into v_oid, v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_sync_post_comment_count';

  -- VERIFY 1: 함수 존재
  if v_oid is null then
    raise exception 'COMMENT_COUNT ABORT: public._sync_post_comment_count() 가 생성되지 않았다';
  end if;

  -- VERIFY 2: SECURITY DEFINER (community_posts 에 UPDATE 정책이 없어 이게 아니면 조용히 실패)
  if v_secdef is not true then
    raise exception 'COMMENT_COUNT ABORT: _sync_post_comment_count 가 SECURITY DEFINER 가 아니다 → community_posts 에 UPDATE 정책이 없어 RLS 에 막혀 0행 갱신으로 조용히 실패한다';
  end if;

  -- VERIFY 3: 트리거가 comments 에 붙어 있고 이벤트가 의도대로인지
  select pg_get_triggerdef(t.oid) into v_trigdef
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'comments'
     and t.tgname = 'trg_post_comment_count' and not t.tgisinternal;
  if v_trigdef is null then
    raise exception 'COMMENT_COUNT ABORT: trg_post_comment_count 트리거가 public.comments 에 없다';
  end if;
  if v_trigdef !~* 'AFTER INSERT OR DELETE OR UPDATE OF post_id' then
    raise exception 'COMMENT_COUNT ABORT: 트리거 이벤트가 기대와 다르다 → %', v_trigdef;
  end if;

  -- VERIFY 4: 내부 전용 함수에 anon EXECUTE 가 남아 있지 않은지(리포 규칙)
  select has_function_privilege('anon', v_oid, 'EXECUTE') into v_anon;
  if v_anon then
    raise exception 'COMMENT_COUNT ABORT: 내부 전용 함수인데 anon 에 EXECUTE 가 남아 있다';
  end if;

  -- VERIFY 5: 백필 후 저장값 == 실제 댓글 수 (드리프트 0)
  select count(*) into v_drift
    from public.community_posts p
   where p.comment_count is distinct from
         (select count(*)::int from public.comments c where c.post_id = p.id);
  if v_drift <> 0 then
    raise exception 'COMMENT_COUNT ABORT: 백필 후에도 실제 댓글 수와 어긋난 글 %건', v_drift;
  end if;
end $$;
