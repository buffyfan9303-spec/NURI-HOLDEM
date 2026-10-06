select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용 — 초안(community-team, 2026-10-07 재작업). 라이브 롤백 리허설만 했다. 적용 판단·실행은 리드.
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다. 리허설: supabase/tests/20261007d_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)
-- 20261007d — 딜러 게시판: 작성자가 자기 글을 지울 수 없던 결함(PR #202 리허설 중 발견, 리드 지시 2026-10-07)
--
-- 증상: DealerCommunity '삭제' → deleteDealerPost = `update dealer_posts set deleted = true …` 가 작성자 권한에서 라이브 42501.
-- 원인: UPDATE 의 새 행은 SELECT 정책(dealer_posts_read)도 지나야 하는데, 그 정책이 작성자에게 `deleted = false` 행만 보여 준다.
--
-- 재작업(critical-reviewer pr202-review.md P1): 1차 판은 읽기 정책에 `OR author_id = auth.uid()` 를 더했다. 그러자
--   R1 운영자가 지운 글에 온 지원서(이름·연락처)를 작성자가 계속 읽고(dealer_app_read 의 EXISTS 가 이 정책을 탄다),
--   R2 작성자가 운영자 삭제를 `update set deleted = false` 로 되돌리고(쓰기 정책·_guard_ugc_client_cols 가 deleted 를 안 막는다),
--   R3 되살린 글이 남의 목록에 다시 나왔다. → **정책은 건드리지 않는다.** 지운 글은 지금처럼 작성자에게도 안 보인다.
-- 수정: 삭제만 SECURITY DEFINER RPC 로 옮긴다. 작성자 본인 또는 admin 이 살아 있는 글을 지울 때만 deleted = true.
--   되살리는 길은 만들지 않는다(앱에 기능 없음). 남의 글·이미 지운 글·없는 글·비로그인은 사용자 문장(P0001)으로 거절한다.
--
-- 되돌리기: drop function if exists public.delete_dealer_post(uuid);  (앱은 이 RPC 를 부르므로 클라이언트도 함께 되돌린다)

-- 출발점 게이트 — 이 수정은 '지운 글은 작성자에게도 안 보인다' 는 지금 읽기 정책에 기대어 R1·R3 을 막는다.
do $gate$
begin
  if (select md5(coalesce(pg_get_expr(polqual, polrelid), '')) from pg_policy
       where polrelid = 'public.dealer_posts'::regclass and polname = 'dealer_posts_read') is distinct from 'bdf5500f13606ec5860ef7df78c8e9d7' then
    raise exception '20261007d: dealer_posts_read 라이브 정의가 작성 때와 다르다 — 다시 떠서 합쳐라';
  end if;
  if to_regprocedure('public.delete_dealer_post(uuid)') is not null then
    raise exception '20261007d: delete_dealer_post 가 이미 있다 — 라이브 정의를 확인하라';
  end if;
end $gate$;

create function public.delete_dealer_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_deleted boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  select author_id, deleted into v_author, v_deleted from public.dealer_posts where id = p_id for update;
  if not found then
    raise exception '글을 찾을 수 없습니다';
  end if;
  -- 권한을 먼저 본다 — 남에게는 그 글이 지워졌는지도 알려 주지 않는다.
  if v_author is distinct from v_uid and my_role() is distinct from 'admin'::user_role then
    raise exception '이 글을 삭제할 권한이 없습니다';
  end if;
  if v_deleted then
    raise exception '이미 삭제된 글입니다';
  end if;
  update public.dealer_posts set deleted = true, deleted_at = now() where id = p_id;
end
$fn$;

revoke all on function public.delete_dealer_post(uuid) from public, anon;
grant execute on function public.delete_dealer_post(uuid) to authenticated, service_role;

-- 자가검사 — 정책은 그대로이고, 함수는 DEFINER·search_path 고정·authenticated 만 실행한다.
do $check$
declare v_oid oid := 'public.delete_dealer_post(uuid)'::regprocedure;
begin
  if (select md5(coalesce(pg_get_expr(polqual, polrelid), '')) from pg_policy
       where polrelid = 'public.dealer_posts'::regclass and polname = 'dealer_posts_read') is distinct from 'bdf5500f13606ec5860ef7df78c8e9d7' then
    raise exception '20261007d: dealer_posts_read 가 바뀌었다';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid)
     or not ('search_path=public, pg_temp' = any (coalesce((select proconfig from pg_proc where oid = v_oid), '{}'))) then
    raise exception '20261007d: delete_dealer_post 가 SECURITY DEFINER·search_path 고정이 아니다';
  end if;
  if (select proacl from pg_proc where oid = v_oid) is null
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = v_oid and a.grantee = 0) then
    raise exception '20261007d: delete_dealer_post 에 PUBLIC 실행권이 남았다';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') or not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception '20261007d: delete_dealer_post 실행권이 anon 불가·authenticated 가능이 아니다';
  end if;
end $check$;
