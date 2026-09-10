-- ============================================================================
-- 입상자 실명(venue_rankings.real_name) 서버 마스킹 (2026-09-10, 런칭 전 보안 점검)
--
-- ⚠ 운영 미적용. **오너 결정이 필요하다** — 적용하면 비로그인 방문자에게 보이는 화면이 바뀐다.
--
-- 무엇이 문제인가
--   · 읽기 정책이 `for select to public using (true)`(20260603h_venue_rankings.sql:18) 이고
--     실명은 동의 여부와 무관하게 저장된다(20260905i_ranking_reward_hardening.sql:58-60).
--   · 화면은 동의한 사람만 실명을 보여 준다(src/api/rankings.ts rankDisplay → wantsRealName).
--     그런데 그 판정이 **클라이언트에만** 있다. 서버는 전원의 실명을 그대로 내려보낸다.
--   · 즉 anon 키 하나로 누구나 매장별 입상자 실명을 통째로 긁을 수 있다.
--     CLAUDE.md 보안 표준 §2("인가는 서버가 한다")·§6("응답에 민감 컬럼을 싣지 않는다") 위반이다.
--   · 신규 회귀는 아니다(이미 라이브인 동작). 다만 성격상 런칭 전에 닫는 것이 맞다.
--
-- 왜 컬럼 REVOKE 하나로 끝내지 않는가
--   `revoke select (real_name) … from anon` 만 하면 클라이언트의 select 가 **에러**로 떨어져
--   비로그인 방문자에게 순위표가 통째로 안 보인다(PostgREST 는 컬럼 권한 부족을 42501 로 낸다).
--   그래서 '동의한 행만 실명을 내보내는 뷰'로 읽기 경로를 바꾸고, 원본 테이블은 관리자·본인 경로에만 남긴다.
--
-- 적용 순서(nuri-migration 절차)
--   ① 아래 뷰 생성 → ② 클라이언트를 venue_rankings_public 로 전환(src/api/rankings.ts 의
--      from('venue_rankings') 두 곳) → ③ 배포 확인 뒤 원본 테이블의 public SELECT 정책 축소.
--   ②까지 끝내기 전에 ③을 먼저 하면 순위표가 비로그인에게 사라진다. 순서가 중요하다.
--
-- 롤백: drop view public.venue_rankings_public;  (정책은 ③ 전이라면 손대지 않았다)
-- ============================================================================

-- 동의 여부는 이미 서버에 있다 — venue_ranking_real_name_optins 가 그 단일 출처다.
-- 이 뷰는 그 판정을 **서버에서** 적용해, 동의하지 않은 행의 real_name 을 아예 NULL 로 내보낸다.
create or replace view public.venue_rankings_public
with (security_invoker = true) as
select
  r.venue_id,
  r.ranking_date,
  r.position,
  r.nickname,
  case
    when exists (
      select 1 from public.profiles p
      where lower(btrim(p.nickname)) = lower(btrim(r.nickname))
        and p.public_ranking_consent is true
    ) then r.real_name
    else null
  end as real_name,
  r.prize,
  r.event_name
from public.venue_rankings r;

comment on view public.venue_rankings_public is
  '순위표 공개 읽기 경로. 실명은 공개 동의(profiles.public_ranking_consent)한 닉네임에만 실린다. 원본 venue_rankings 는 관리자·매장 운영 경로 전용.';

-- 읽기 전용 뷰이므로 읽기 롤에만 준다. 변이는 기존 RPC(save_venue_rankings)가 계속 담당한다.
revoke all on public.venue_rankings_public from public;
grant select on public.venue_rankings_public to anon, authenticated, service_role;

-- ── ③ 단계(클라이언트 전환 배포가 끝난 뒤에만) ────────────────────────────────
-- 원본 테이블의 전체 공개 읽기를 걷는다. 이 블록은 지금 실행하지 않는다.
--
--   drop policy if exists "vr_read" on public.venue_rankings;
--   create policy vr_read_scoped on public.venue_rankings for select to authenticated
--     using (
--       public.my_role() = 'admin'
--       or exists (select 1 from public.venues v where v.id = venue_id and public.can_manage_venue(v.id))
--     );
--
-- 검증(적용 후):
--   -- ① 동의하지 않은 닉네임의 실명이 뷰에서 NULL 인가
--   select count(*) filter (where real_name is not null) as shown,
--          count(*)                                      as total
--     from public.venue_rankings_public;
--   -- ② 원본과 행 수가 같은가(행이 사라지면 안 된다 — 가려지는 것은 컬럼뿐)
--   select (select count(*) from public.venue_rankings) = (select count(*) from public.venue_rankings_public) as same_rows;
--   -- ③ 어드바이저 보안 ERROR 0 유지.
