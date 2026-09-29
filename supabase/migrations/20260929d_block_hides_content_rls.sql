-- ⏸ 초안 — 리드가 리허설 후 적용 (community-team 작성 2026-09-29, 라이브 쓰기 0회 · SELECT 조회만 함)
--
-- 요구: 오너 결정 #15 "차단: 서버에서도 막는다(글·댓글 조회)"
--   (.claude/agent-memory-local/nuri-lead/project_owner_decisions_0929.md:11 ·
--    docs/HANDOFF-2026-09-29-results.md 표 15 · critical-reviewer scratchpad/final-server.md §3 사실 3).
-- 왜: 글·댓글 조회 정책 중 user_blocks 를 보는 것이 0개였다 — 차단은 화면(lib/postVisible)만 가렸다.
--   화면 필터가 빠진 곳(매장 채팅 VenuePage VenueChat, 서버 이어받기 serverExtra 부류)에서 차단한 사람 글이 그대로 나왔다.
-- 어떻게: 호출자 본인의 차단 목록을 배열로 돌려주는 SECURITY DEFINER 헬퍼 my_blocked_ids() 를 만들고,
--   조회(SELECT) 정책 6개를 ALTER POLICY 로 좁힌다(정책 이름·대상 롤·명령은 그대로 — ALTER POLICY 는 USING 만 바꾼다).
--   클라이언트 필터(lib/postVisible)는 그대로 둔다(이중 방어 · 차단 직후 이미 받아 둔 행을 즉시 가리는 역할).
--
-- ── 대상 전수(라이브 pg_policies SELECT, 2026-09-29) ─────────────────────────────────────────────
--   | 표                | 정책          | 롤                  | 적용 전 USING (라이브 원문)                                              | 이 파일 |
--   | community_posts   | posts_select  | public              | (blinded = false) OR (user_id = (select auth.uid())) OR (my_role() = 'admin') | 변경 |
--   | comments          | comments_select | public            | true                                                                     | 변경 |
--   | community_shouts  | shouts_read   | anon,authenticated  | ((hidden = false) AND (expires_at > now())) OR (user_id = (select auth.uid())) OR (my_role() = 'admin') | 변경 |
--   | dealer_posts      | dealer_posts_read | public          | (deleted = false) OR (my_role() = 'admin')                               | 변경 |
--   | group_messages    | gmsg_read     | authenticated       | is_group_member(group_id) OR is_group_manager(group_id)                  | 변경 |
--   | venue_messages    | vmsg_select   | public              | true                                                                     | 변경 (매장 채팅 — 화면 필터가 없던 곳) |
--   손대지 않은 것(보고만):
--   | group_posts       | gpost_read    | 화면도 차단 필터가 없다 — 새 동작이 되므로 오너 결정 없이 넣지 않음 |
--   | owner_posts       | owner_posts_read | 업주 게시판 — 화면 필터 없음, 같은 이유                        |
--   | marketplace_listings | (장터 매물) | '글·댓글' 범위 밖. 화면 필터는 있다                              |
--   | post_hands / post_polls / post_poll_options / post_spots | EXISTS(community_posts) 로 읽는다 → 글이 가려지면 첨부도 같이 가려진다(자동, 변경 불필요) |
--   | community_ads_public() (SECURITY DEFINER, anon 실행) | RLS 를 우회해 광고 슬롯 글을 준다 — 차단한 사람의 광고 글은 여전히 나온다(화면도 광고엔 필터 없음). 별건 |
--
-- ── ④ 정책 안 서브쿼리가 호출자 권한으로 자기 차단 행을 볼 수 있나 ────────────────────────────────
--   user_blocks_select = (blocker_id = (select auth.uid())) · anon/authenticated SELECT 권한 true(has_table_privilege 실측)
--   → 인라인 서브쿼리도 **본인 행은 보인다**(필요한 것은 '내가 차단한 행' 뿐이라 쪽지 0건 부류와 다르다).
--   그래도 헬퍼를 쓰는 이유: 인라인이면 user_blocks 의 GRANT/RLS 에 커뮤니티 전체 읽기가 묶인다 — 누가 anon 의
--   user_blocks SELECT 를 회수하면(비로그인은 차단 행이 없으니 그럴듯한 강화다) 모든 비로그인 글 조회가 42501 로 죽는다.
--   헬퍼(definer)는 그 결합을 끊는다.
--   이름에 `_` 를 붙이지 않은 이유: 정책이 부르는 함수는 **호출자 롤이 EXECUTE 권한을 가져야** 한다(my_role()·is_group_member 와 같다).
--   `_` 내부 함수 규칙(anon·authenticated 회수)을 따르면 비로그인 글 조회가 permission denied 로 깨진다.
--   노출 평가: RPC 로 직접 불러도 **호출자 본인의 차단 id** 만 나온다(= user_blocks 를 직접 select 한 것과 같다). anon 은 '{}'.
--
-- ── ⑤ 성능(라이브 EXPLAIN ANALYZE, postgres 롤로 같은 식을 인라인해 측정) ─────────────────────────
--   식 `not coalesce(user_id = any(<내 차단 배열>), false)` 은 **InitPlan 1회**(loops=1)로 user_blocks_pkey(blocker_id, blocked_id)
--   Bitmap Index Scan → 행마다는 배열 비교만 한다. 새 인덱스 불필요(PK 선두 열이 blocker_id).
--   헬퍼를 `(select public.my_blocked_ids())` 로 감싸 InitPlan 으로 만든다(행마다 함수 호출 방지).
--   ⚠ `any((select …))` 는 ANY(서브쿼리)로 파싱돼 uuid = uuid[] 오류가 난다(실측 42883) → coalesce(…) 로 감싸 배열 식으로 만든다.
--   NULL 안전: venue_messages.user_id 는 NULL 허용이다. `null = any(비어있지 않은 배열)` = NULL → NOT NULL = NULL 이면 행이 사라진다
--   → coalesce(…, false) 로 '차단 아님' 처리.
--
-- ── ⑥ 실시간(Realtime) ────────────────────────────────────────────────────────────────────────
--   realtime.apply_rls 라이브 본문 확인: INSERT/UPDATE 는 구독자 롤·request.jwt.claims 를 set_config 한 뒤
--   prepared statement(walrus_rls_stmt)로 **SELECT 정책을 그대로 평가**한다 → 새 정책이 실시간에도 적용된다.
--   DELETE 는 RLS 를 못 걸고 PK 만 보낸다(기존과 같음 — 삭제 id 만 새는 것은 이 파일과 무관).
--   publication 대상: community_posts·comments·group_messages·venue_messages (shouts·dealer_posts 는 publication 밖).
--   헬퍼 EXECUTE 가 anon/authenticated 에 있어야 walrus 평가가 권한 오류로 떨어지지 않는다(아래 GRANT).
--
-- ── 필수 조건 ─────────────────────────────────────────────────────────────────────────────────
--   ① 본인 글은 항상 보인다: 각 정책에 `user_id = (select auth.uid())` 분기(user_blocks 에 자기 차단 금지 CHECK 가 없다 — 실측).
--   ② 관리자는 차단과 무관: 기존에 admin 분기가 있던 정책(posts·shouts·dealer)은 admin 분기를 차단 조건 밖에 둔다.
--      comments·venue_messages 는 원래 true 였으므로 admin 분기를 새로 둔다(관리자 모더레이션이 차단 때문에 막히지 않게).
--      group_messages 는 원래 admin 분기가 없다(그룹 멤버 전용) — 그대로 둔다(권한 확대 안 함).
--   ③ 비로그인: my_blocked_ids() = '{}' → 차단 조건은 항상 참 → 기존과 같은 행.
--
-- ── 클라이언트 영향 ─────────────────────────────────────────────────────────────────────────
--   · 무한 스크롤(searchPosts): 필터가 LIMIT **앞**(DB)에서 걸리므로 페이지가 꽉 찬다. nextCursor 는 rows.length === limit
--     기준(src/api/community.ts:689)이라 오히려 정확해진다. 화면 isPostVisible 은 서버가 이미 뺀 행에 대해 no-op.
--   · 차단 해제 후 다시 보임: 서버가 빼 두었으므로 해제 뒤 **재조회**가 있어야 화면에 돌아온다 → 같은 묶음의 클라이언트 커밋
--     (BlockContext 가 차단/해제 후 'nuri:blocks-changed' 를 쏘고 App 이 글·댓글을 다시 읽는다)과 함께 배포한다.
--     DB 를 먼저 적용해도 깨지는 것은 없다(해제 직후 목록에 없다가 커뮤니티 탭 복귀·새로고침 시 돌아온다).
--   · 게시글 comment_count 등 카운트 열은 차단 댓글을 포함한 수 그대로다(표시 수 ≠ 보이는 댓글 수가 될 수 있음 — 기존 화면 필터와 같음).
--
-- ── 리허설 시나리오(리드, begin; … rollback; 라이브) ─────────────────────────────────────────────
--   계정(2026-09-29 profiles 실측): A=708de904-913e-4082-8803-8a2766b342f9 (user, 댓글 1)
--     B=7f985240-486c-4731-a166-109a52bea487 (user, 글 1·댓글 1·매장채팅 1) · C=fd14c2dc-d994-46e4-8f12-b6cf38104983 (user, 글 1)
--     ADM=f5d305f2-0f30-4d61-91ce-51f3332e5193 (admin, 글·댓글 0 — 관리자 분기만 시험하도록 콘텐츠 없는 관리자)
--   준비: 이 파일 적용 → insert user_blocks (A→B), (ADM→B). shouts·dealer_posts·group_messages 는 라이브 행이 0/적으므로
--     B 명의 합성 행(외치기 hidden=false·expires_at=now()+1h, 딜러글 deleted=false)을 트랜잭션 안에서 만든다.
--   각 표(posts·comments·shouts·dealer·venue_messages)마다 B 행 수를 센다:
--     P1 B 본인: 기존과 같음(>0)                                  ← ①
--     P2 ADM(B 를 차단했음에도): 기존과 같음(>0)                     ← ②
--     P3 anon(claims 빈 문자열, role anon): 기존과 같음(>0)            ← ③ fail-open/fail-closed 둘 다 확인
--     P4 C(차단 없음): 기존과 같음                                   ← 제3자 영향 없음
--     P5 A 의 차단 해제(delete user_blocks A→B) 뒤 A: 기존과 같음(>0)  ← 해제 후 복귀
--     N1 A(차단 중): B 행 0 · A 자신의 댓글은 1(①)                   ← 핵심 음성
--     N2 A 의 B 글 첨부(post_hands/post_polls/post_spots) 0 — B 글에 첨부가 없으면 NOT_RUN 으로 적는다
--   group_messages: A·B 가 같은 그룹 멤버인 그룹이 없으면 합성(그룹·멤버 2행·메시지 1행) 또는 NOT_RUN.
--   ACL: has_function_privilege('anon'|'authenticated','public.my_blocked_ids()','EXECUTE') = true · PUBLIC 회수 확인 ·
--        prosecdef=true · proconfig 에 search_path=public, pg_temp.
--   기존 행 불변: 이 파일은 데이터를 안 바꾼다 — 적용 전후 `select md5(string_agg(id::text,',' order by id))` 를 표마다 비교.
--   성능: set local role authenticated + claims(A) 로 `explain analyze select id from community_posts order by created_at desc limit 30`
--        → InitPlan loops=1 확인.
--   (결과는 롤백 뒤 따로 조회해 user_blocks 0행·합성 행 0행 확인)
--
-- ── 되돌리기 ───────────────────────────────────────────────────────────────────────────────
--   파일 끝 주석의 ALTER POLICY 6줄(적용 전 원문)로 복원 → drop function public.my_blocked_ids().

create or replace function public.my_blocked_ids()
 returns uuid[]
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select coalesce(array_agg(b.blocked_id), '{}'::uuid[])
    from public.user_blocks b
   where b.blocker_id = auth.uid();
$function$;

comment on function public.my_blocked_ids() is
  '호출자 본인이 차단한 사용자 id 배열(비로그인 = 빈 배열). 조회 RLS 정책(글·댓글·외치기·딜러·그룹채팅·매장채팅)이 InitPlan 으로 한 번 부른다. 20260929d';

-- 정책 평가가 호출자 롤로 이 함수를 부르므로 anon·authenticated EXECUTE 가 필요하다(없으면 비로그인 글 조회가 42501).
revoke all on function public.my_blocked_ids() from public;
grant execute on function public.my_blocked_ids() to anon, authenticated, service_role;

-- 게시글 — 숨김(blinded) 규칙은 그대로, 차단 조건을 '일반 공개' 분기에만 건다.
alter policy posts_select on public.community_posts using (
  ((blinded = false) and not coalesce(user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[])), false))
  or (user_id = (select auth.uid()))
  or (my_role() = 'admin'::user_role)
);

-- 댓글(게시글·일정·매장 댓글 공용 표) — 원래 true.
alter policy comments_select on public.comments using (
  not coalesce(user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[])), false)
  or (user_id = (select auth.uid()))
  or (my_role() = 'admin'::user_role)
);

-- 외치기
alter policy shouts_read on public.community_shouts using (
  ((hidden = false) and (expires_at > now())
     and not coalesce(user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[])), false))
  or (user_id = (select auth.uid()))
  or (my_role() = 'admin'::user_role)
);

-- 딜러 구인·구직 — 작성자 열은 author_id. 원래 본인 분기가 없다(삭제 안 된 글은 누구나 봄) → 본인은 차단 조건만 면제.
alter policy dealer_posts_read on public.dealer_posts using (
  ((deleted = false)
     and (not coalesce(author_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[])), false)
          or author_id = (select auth.uid())))
  or (my_role() = 'admin'::user_role)
);

-- 그룹 채팅 — 멤버십 조건은 그대로(관리자 분기는 원래 없다 · 권한 확대 안 함).
alter policy gmsg_read on public.group_messages using (
  (is_group_member(group_id) or is_group_manager(group_id))
  and (not coalesce(user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[])), false)
       or user_id = (select auth.uid()))
);

-- 매장 채팅 — 원래 true(공개 열람). user_id 는 NULL 허용 → coalesce 가 '차단 아님'으로 둔다.
alter policy vmsg_select on public.venue_messages using (
  not coalesce(user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[])), false)
  or (user_id = (select auth.uid()))
  or (my_role() = 'admin'::user_role)
);

-- 자가검사 — 정책 6개가 헬퍼를 참조하고, 헬퍼 ACL·definer·search_path 가 의도대로인지. 어긋나면 멈춘다.
do $$
declare v_n int; v_missing text;
begin
  select count(*) into v_n from pg_policies
   where schemaname = 'public'
     and (tablename, policyname) in (('community_posts','posts_select'),('comments','comments_select'),
          ('community_shouts','shouts_read'),('dealer_posts','dealer_posts_read'),
          ('group_messages','gmsg_read'),('venue_messages','vmsg_select'))
     and qual like '%my_blocked_ids()%';
  if v_n <> 6 then raise exception '20260929d 자가검사: 차단 조건이 걸린 정책 %/6', v_n; end if;

  if not has_function_privilege('anon', 'public.my_blocked_ids()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_blocked_ids()', 'EXECUTE') then
    raise exception '20260929d 자가검사: anon/authenticated 가 my_blocked_ids 를 실행할 수 없다 — 정책 평가가 42501 로 깨진다';
  end if;

  select string_agg(x, ',') into v_missing from (
    select 'secdef' x where not (select prosecdef from pg_proc where oid = 'public.my_blocked_ids()'::regprocedure)
    union all
    select 'search_path' where not exists (
      select 1 from pg_proc p, unnest(p.proconfig) c
       where p.oid = 'public.my_blocked_ids()'::regprocedure and c like 'search_path=%public%pg_temp%')
  ) s;
  if v_missing is not null then raise exception '20260929d 자가검사: %', v_missing; end if;

  -- 비로그인(uid NULL)에서 빈 배열 — NULL 이면 coalesce 가 막지만 계약으로 고정한다.
  perform set_config('request.jwt.claims', '', true);
  if public.my_blocked_ids() is distinct from '{}'::uuid[] then
    raise exception '20260929d 자가검사: 비로그인 my_blocked_ids() 가 빈 배열이 아니다';
  end if;
end $$;

-- ── 되돌리기(적용 전 라이브 원문) ──
-- alter policy posts_select on public.community_posts using (((blinded = false) OR (user_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));
-- alter policy comments_select on public.comments using (true);
-- alter policy shouts_read on public.community_shouts using ((((hidden = false) AND (expires_at > now())) OR (user_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));
-- alter policy dealer_posts_read on public.dealer_posts using (((deleted = false) OR (my_role() = 'admin'::user_role)));
-- alter policy gmsg_read on public.group_messages using ((is_group_member(group_id) OR is_group_manager(group_id)));
-- alter policy vmsg_select on public.venue_messages using (true);
-- drop function if exists public.my_blocked_ids();
