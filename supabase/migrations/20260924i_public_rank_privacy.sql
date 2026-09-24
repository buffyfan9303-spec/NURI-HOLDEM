-- 20260924i — 공개 순위 경로 개인정보 (STORE-CHAIN-AUDIT ② F5, 1단계).
-- ✅ 2026-09-24 라이브 적용 완료 · venue_player_counts md5 554054c1ffc12d97b86256d67685e072
--   리허설(anon, 순위 지표 켠 테스트 매장): 괄호 이름 0건 · '홍길동(리허설닉)'+'리허설닉' → 리허설닉 바인 2 · anon score_entries 쓰기 false.
-- A. 장부 이름 '실명(닉네임)' → 닉네임만 돌려준다(splitLedgerName 과 같은 규칙). 부수 효과: moneyin_rate 의
--    buyinCounts[t.nickname](VenuePage:1173) 짝이 이제 맞는다. 한계: 괄호 없이 실명만 적은 이름은 못 거른다.
-- B-1. venue_score_entries 의 anon 쓰기 표 권한 회수(RLS 가 막고 있었다).
-- ⏳ B-2(미적용 — 클라이언트 먼저): anon 의 reason·created_by SELECT 회수. 공개 매장 페이지(VenuePage:1080)의
--    getScoreEntries(rankings.ts:361-369)가 reason 을 읽으므로 먼저 막으면 비로그인 수동 포인트가 조용히 사라진다.
--    authenticated 컬럼 회수는 mustAffect(.select()) 삭제를 깨므로 금지. 클라 redactForCache 에 playerCounts 추가 필요.
create or replace function public.venue_player_counts(p_venue_id uuid)
returns table(name text, buyin_count bigint, visit_count bigint)
language sql stable security definer set search_path = public, pg_temp as $fn$
  with b as (
    select coalesce(nullif(case when btrim(b0.player_name) ~ '^[^(]+\(.*\)$'
                                then btrim(substring(btrim(b0.player_name) from '^[^(]+\((.*)\)$'))
                                else btrim(b0.player_name) end, ''), '회원') as nick,
           b0.session_date
      from public.ledger_buyins b0
     where b0.venue_id = p_venue_id
       and ( public.can_access_ledger(p_venue_id) or public.can_manage_venue(p_venue_id)
             or exists (select 1 from public.venues v where v.id = p_venue_id
                          and (v.page_config->'rankMetrics') ?| array['moneyin_rate','buyin_count','visit_count']) )
  )
  select nick, count(*)::bigint, count(distinct session_date)::bigint from b group by nick
$fn$;
revoke all on function public.venue_player_counts(uuid) from public;
grant execute on function public.venue_player_counts(uuid) to anon, authenticated, service_role;
revoke insert, update, delete on public.venue_score_entries from anon;
