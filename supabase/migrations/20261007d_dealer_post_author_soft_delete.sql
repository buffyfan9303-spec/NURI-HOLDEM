select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용 — 초안(community-team, 2026-10-07). 라이브 롤백 리허설만 했다. 적용 판단·실행은 리드.
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다. 리허설: supabase/tests/20261007d_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)
-- 20261007d — 딜러 게시판: 작성자가 자기 글을 지울 수 없던 결함(PR #202 리허설 중 발견, 리드 지시 2026-10-07)
--
-- 증상: DealerCommunity '삭제' → deleteDealerPost = `update dealer_posts set deleted = true, deleted_at = now() where id = …`
--   작성자 권한이면 라이브에서 42501 'new row violates row-level security policy for table "dealer_posts"'.
-- 원인: UPDATE 의 새 행은 SELECT 정책(dealer_posts_read)도 통과해야 하는데(UPDATE 가 WHERE 로 행을 읽으므로),
--   그 정책이 `deleted = false` 인 행만 작성자에게 보여 준다 → 지운 결과 행이 작성자에게 안 보여 거절된다. 관리자만 지울 수 있었다.
-- 수정(가장 작게): 읽기 정책에 '작성자 본인은 자기 행을 본다' 한 갈래를 더한다. 쓰기 정책(dealer_posts_update)은 그대로 —
--   남의 글을 지우는 길은 새로 열리지 않는다. 지운 글이 새로 보이는 사람은 **그 글의 작성자 본인뿐**이다
--   (목록 getDealerPosts 는 `deleted=eq.false` 로 거르므로 화면에는 다시 안 뜬다).
--   부수 효과: 작성자는 지운 자기 구인글에 온 지원서도 계속 읽는다(dealer_app_read 의 EXISTS 가 이 정책을 탄다 — 자기 글에 온 자기 수신 데이터).
--
-- 되돌리기:
--   alter policy dealer_posts_read on public.dealer_posts using ((((deleted = false) AND ((NOT COALESCE((author_id = ANY (COALESCE(( SELECT my_blocked_ids() AS my_blocked_ids), '{}'::uuid[]))), false)) OR (author_id = ( SELECT auth.uid() AS uid)))) OR (my_role() = 'admin'::user_role)));

-- 출발점 게이트 — 작성 때(2026-10-07 ro.mjs) 라이브 정책과 같아야 한다. 정책 수·쓰기 정책도 그대로여야 한다.
do $gate$
begin
  if (select md5(coalesce(pg_get_expr(polqual, polrelid), '')) from pg_policy
       where polrelid = 'public.dealer_posts'::regclass and polname = 'dealer_posts_read') is distinct from 'bdf5500f13606ec5860ef7df78c8e9d7' then
    raise exception '20261007d: dealer_posts_read 라이브 정의가 작성 때와 다르다 — 다시 떠서 합쳐라';
  end if;
  if (select md5(coalesce(pg_get_expr(polqual, polrelid), '')) from pg_policy
       where polrelid = 'public.dealer_posts'::regclass and polname = 'dealer_posts_update') is distinct from '13e49e0f70cd686289a44c0e8709d939'
     or (select count(*) from pg_policy where polrelid = 'public.dealer_posts'::regclass) <> 3 then
    raise exception '20261007d: dealer_posts 정책 구성이 작성 때와 다르다(쓰기 정책 또는 정책 수)';
  end if;
end $gate$;

alter policy dealer_posts_read on public.dealer_posts
  using (
    ((deleted = false) AND ((NOT COALESCE((author_id = ANY (COALESCE((SELECT my_blocked_ids() AS my_blocked_ids), '{}'::uuid[]))), false))
                            OR (author_id = (SELECT auth.uid() AS uid))))
    OR (author_id = (SELECT auth.uid() AS uid))            -- 20261007d: 작성자 본인은 지운 자기 글도 본다(소프트 삭제의 새 행 검사)
    OR (my_role() = 'admin'::user_role)
  );

-- 자가검사 — 새 갈래가 들어갔고 쓰기 정책은 그대로다.
do $check$
begin
  -- 원래 1곳(차단 예외 안) → 2곳(최상위 갈래 추가)
  if (select count(*) from regexp_matches(
        (select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.dealer_posts'::regclass and polname = 'dealer_posts_read'),
        'author_id = \( SELECT auth\.uid\(\) AS uid\)', 'g')) <> 2 then
    raise exception '20261007d: dealer_posts_read 에 작성자 갈래가 없다';
  end if;
  if (select md5(coalesce(pg_get_expr(polqual, polrelid), '')) from pg_policy
       where polrelid = 'public.dealer_posts'::regclass and polname = 'dealer_posts_update') is distinct from '13e49e0f70cd686289a44c0e8709d939' then
    raise exception '20261007d: dealer_posts_update 가 바뀌었다';
  end if;
end $check$;
