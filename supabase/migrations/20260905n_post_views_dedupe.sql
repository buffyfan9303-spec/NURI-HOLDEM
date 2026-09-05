-- ============================================================================
-- 20260905n — 게시글 조회수 dedupe (모바일 점검 확정 결함 #12, 2026-09-05)
--
-- 문제: increment_post_view 가 PUBLIC/anon 에 열려 있고 중복·빈도 판정이 없어(하드닝 20260902b/c 에서
--   이 함수만 누락) 누구나 반복 호출로 view_count 를 부풀려 HOT 1위(6시간 고정)를 만들 수 있었다.
-- 수정: (글, 열람자, KST 날짜) 원장 post_views 에 `insert … on conflict do nothing` 한 뒤 실제로 새 행이
--   들어갔을 때만 view_count +1. 열람자 = 로그인 uid, 비로그인은 cf-connecting-ip(엣지가 채우는 값).
--   자기 글은 집계하지 않는다. anon 실행권은 **유지**한다 — 20260817e(bump_schedule_view) 와 같은
--   '비로그인 열람도 집계하는 의도된 공개 RPC'. 오너 결정 ④-3: uid·IP 일일 1회.
--
-- 라이브 정합 근거(브리프 스냅샷 2026-09-05, 프로젝트 idsxiqspecrucvfvtgbw):
--   · 라이브 본문(LANGUAGE sql, SECURITY DEFINER, ACL PUBLIC·anon·authenticated·service_role):
--       update public.community_posts set view_count = view_count + 1 where id = p_id;
--     → 같은 시그니처 increment_post_view(p_id uuid) returns void 를 plpgsql 로 CREATE OR REPLACE(반환 타입 동일).
--     증가 문장은 라이브 그대로 옮기고 그 앞에 원장 판정만 붙였다. 클라(community.ts incrementPostView) 변경 없음.
--   · 헤더 파싱은 20260902b consume_ai_quota 와 같은 KST 하루 기준(now() at time zone 'Asia/Seoul').
--
-- ⚠ 적용 전 1회 실측(필수): 이 함수는 비로그인 열람자 키로 **cf-connecting-ip 만** 신뢰한다.
--   x-forwarded-for 는 클라이언트가 값을 고를 수 있어(헤더만 바꿔 호출하면 PK 가 매번 새 행) 조작을 막지 못한다.
--   그래서 신뢰 가능한 키가 없으면 집계를 건너뛴다 — 이 프로젝트에 cf-connecting-ip 가 오지 않으면
--   **비로그인 조회수가 늘지 않는다**. 적용 전에 아래를 PostgREST 경유로 한 번 확인할 것:
--     create function public._hdr_probe() returns json language sql security definer
--       set search_path = public, pg_temp as $$ select current_setting('request.headers', true)::json $$;
--     revoke all on function public._hdr_probe() from public; grant execute on function public._hdr_probe() to anon;
--     -- curl -s "$URL/rest/v1/rpc/_hdr_probe" -H "apikey: $ANON" -X POST | jq 'keys'
--     drop function public._hdr_probe();
--   결과에 cf-connecting-ip 가 없으면 이 마이그레이션을 적용하지 말고 열람자 키 정책을 다시 정한다.
--
-- 소급: 데이터 변경 0(기존 view_count 유지). 원장은 7일 초과분을 함수 안에서 1% 확률로 삭제(크론 추가 없음).
-- 롤백:
--   create or replace function public.increment_post_view(p_id uuid) returns void language sql security definer
--     set search_path = public, pg_temp as $$ update public.community_posts set view_count = view_count + 1 where id = p_id; $$;
--   revoke all on function public.increment_post_view(uuid) from public;
--   grant execute on function public.increment_post_view(uuid) to anon, authenticated, service_role;
--   drop table if exists public.post_views;
-- ============================================================================

-- ── ① 조회 원장 — 정책 없음(= 클라이언트 직접 접근 불가, definer 함수만) ──────────
create table if not exists public.post_views (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  viewer  text not null,
  day     date not null,
  primary key (post_id, viewer, day)
);
alter table public.post_views enable row level security;
revoke all on table public.post_views from public, anon, authenticated;

-- ── ② 조회수 RPC — 원장에 새로 들어갔을 때만 +1 ──────────────────────────────
create or replace function public.increment_post_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_hdr    json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_day    date := (now() at time zone 'Asia/Seoul')::date;
  v_viewer text;
begin
  select user_id into v_owner from public.community_posts where id = p_id;
  if not found then return; end if;                       -- 없는 글: 라이브와 같이 조용히 무시(FK 예외 방지)
  if v_owner = v_uid then return; end if;                  -- 자기 글은 집계하지 않는다

  -- 열람자 키: 로그인 uid → 없으면 cf-connecting-ip.
  -- ⚠ x-forwarded-for 를 쓰면 안 된다. **클라이언트가 값을 고를 수 있어** 헤더만 바꿔 가며 호출하면
  --   PK 가 매번 새 행이 되어 조회수·HOT 순위를 무제한 부풀릴 수 있다(2026-09-06 리뷰).
  --   cf-connecting-ip 는 엣지가 항상 덮어써 위조되지 않는다. XFF 의 '맨 오른쪽'도 대안이 아니다 —
  --   Supabase 호스티드는 엣지와 PostgREST 사이에 게이트웨이 홉이 더 있어 방문자 전원이 한 키로 뭉친다.
  -- 신뢰할 수 있는 키가 없으면(헤더 없는 SQL 에디터 호출 등) **집계하지 않는다** —
  --   'ip:unknown' 한 칸에 뭉치면 비로그인 조회가 글당 하루 1건으로 사라진다.
  v_viewer := coalesce(v_uid::text, 'ip:' || nullif(v_hdr->>'cf-connecting-ip', ''));
  if v_viewer is null then return; end if;

  insert into public.post_views(post_id, viewer, day) values (p_id, v_viewer, v_day)
  on conflict do nothing;
  if found then
    update public.community_posts set view_count = view_count + 1 where id = p_id;
  end if;

  -- 오래된 원장 청소(크론 없음): 호출의 1% 에서 7일 초과분 삭제
  if random() < 0.01 then
    delete from public.post_views where day < v_day - 7;
  end if;
end;
$$;

-- CREATE OR REPLACE 는 ACL 을 초기화하므로 다시 쓴다. anon 유지(비로그인 집계 의도).
revoke all on function public.increment_post_view(uuid) from public;
grant execute on function public.increment_post_view(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
