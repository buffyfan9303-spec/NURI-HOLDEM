-- 20260915b — 20260911a 의 §5: community_ads 원본 테이블 공개 읽기 축소
--
-- ⚠ 2026-09-15 라이브 적용 완료(오너 승인). 아래는 적용된 SQL 그대로다.
--
-- 왜 이제야 하는가 (20260911a 머리말의 순서 계약)
--   §5 는 "앱 배포가 프로덕션에 오른 뒤에" 실행하라고 적혀 있었다. 먼저 좁히면 옛 번들의
--   `select *` 가 빈 배열을 받아 **광고가 조용히 사라지기** 때문이다.
--   그 조건은 2026-09-14 배포로 충족됐다 — 손님 읽기는 community_ads_public() RPC 하나다.
--
-- 적용 전 실측
--   · anon 이 원본 테이블을 그대로 읽었다: **4행**(꺼진 옛 문구형 광고의 title·link_url·advertiser 포함).
--   · anon RPC 결과 0건(게시글 미연결이라 노출 대상이 없는 것 — 정상).
--   · 클라이언트 전수 확인: 손님 경로는 `src/api/ads.ts:51` 의 RPC 한 번뿐이고,
--     `:71 getAdSlots` 의 직접 SELECT 는 **관리자 화면(AdSlotsAdmin)** 전용이다(코드 주석도 "관리자 RLS").
--
-- 적용 후 실측 — 좁힌 쪽만 보고 넘어가지 않는다
--   anon 직접 읽기 4 → **0** · anon RPC 노출 0 → **0 불변** · 관리자 4행 **그대로**(관리 화면 무손상).
--
-- ⚠ community_ads_public() 는 SECURITY DEFINER 라 RLS 를 지나지 않는다 — 손님 노출은 영향 없다.
-- ⚠ 조건식은 기존 admin 정책 3종과 같은 문장(`(select auth.uid())` initplan · `'admin'::user_role`).
--   EXISTS 라 행이 없으면 false = fail-closed 다.
--
-- 롤백
--   drop policy if exists community_ads_read_admin on public.community_ads;
--   create policy community_ads_read on public.community_ads
--     for select to anon, authenticated using (true);

drop policy if exists community_ads_read on public.community_ads;
drop policy if exists community_ads_read_admin on public.community_ads;
create policy community_ads_read_admin on public.community_ads
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'admin'::user_role
  ));

comment on policy community_ads_read_admin on public.community_ads is
  '원본 테이블 읽기는 관리자만. 손님 노출은 community_ads_public() RPC(SECURITY DEFINER)가 담당한다 — 꺼진·만료된 광고 문구가 anon 에게 내려가던 것을 막는다(20260911a §5, 2026-09-15 적용).';

notify pgrst, 'reload schema';

-- ── 자가검사 ─────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_q text;
begin
  -- ① SELECT 정책이 정확히 하나이고 관리자 조건인가 (permissive OR 로 옛 정책이 살아 있으면 무효가 된다)
  select count(*) into v_n from pg_policies
   where schemaname='public' and tablename='community_ads' and cmd in ('SELECT','ALL') and permissive='PERMISSIVE';
  if v_n <> 1 then raise exception 'ABORT: community_ads 의 SELECT 정책이 %개다(1이어야 한다)', v_n; end if;

  select qual into v_q from pg_policies
   where schemaname='public' and tablename='community_ads' and policyname='community_ads_read_admin';
  if v_q is null then raise exception 'ABORT: community_ads_read_admin 이 없다'; end if;
  if strpos(v_q, 'admin') = 0 then raise exception 'ABORT: 관리자 조건이 없다 — %', v_q; end if;

  -- ② 쓰기 정책 3종은 그대로 살아 있는가(관리자 화면이 죽으면 안 된다)
  select count(*) into v_n from pg_policies
   where schemaname='public' and tablename='community_ads' and cmd in ('INSERT','UPDATE','DELETE');
  if v_n <> 3 then raise exception 'ABORT: 관리자 쓰기 정책이 %개다(3이어야 한다)', v_n; end if;

  -- ③ 손님 노출 통로가 살아 있는가 — 이게 죽으면 광고가 통째로 사라진다
  if to_regprocedure('public.community_ads_public()') is null then
    raise exception 'ABORT: community_ads_public() 이 없다 — 손님 노출 통로가 없다';
  end if;
  if not has_function_privilege('anon', 'public.community_ads_public()', 'execute') then
    raise exception 'ABORT: anon 이 community_ads_public() 을 실행할 수 없다 — 비로그인 손님에게 광고가 안 보인다';
  end if;
  if not (select prosecdef from pg_proc where oid='public.community_ads_public()'::regprocedure) then
    raise exception 'ABORT: community_ads_public() 이 SECURITY DEFINER 가 아니다 — 좁힌 RLS 에 스스로 걸린다';
  end if;
end
$chk$;
