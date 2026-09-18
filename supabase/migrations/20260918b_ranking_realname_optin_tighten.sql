-- 20260918b — 랭킹 실명 옵트인이 **제3자(워크인 손님) 실명**을 공개하던 것을 막는다.
--
-- ✅ 적용 완료 2026-09-18 (오너 승인) — 라이브 실측
--   영향 범위 사전 확인: 지금 실명 공개(ranking_name_pref='real_name')를 켠 활성 계정 **0명** →
--     적용해도 실명 표시가 꺼지는 사용자가 없다. 쓰이기 전에 구멍을 닫았다.
--   대조 3종(임시 랭킹 행 + 임시 프로필, 전부 rollback):
--     ① 미인증 + 실명 불일치            → false (차단)
--     ② 본인확인 + 실명 일치            → true  (양성 — 정상 사용자는 그대로 열린다)
--     ③ 본인확인했어도 실명 불일치      → false (제3자가 섞이면 닉네임 전체를 닫는다)
--
-- ── 무엇이 문제인가 (2026-09-18 보안 감사 · 라이브 실측) ─────────────────────
-- `venue_rankings` 에는 user_id 가 없다 — **nickname 이 유일한 연결**이다(업주가 손으로 적는 표라
-- 계정 없는 워크인 손님도 들어간다). `venue_rankings_public`(anon 실행 가능)은
--   case when v.can_see or public._ranking_real_name_opted_in(r.nickname) then r.real_name ... end
-- 로 실명을 푼다. 그런데 옵트인 판정이 "그 nickname 을 가진 active 프로필이 정확히 1명이고
-- ranking_name_pref='real_name'" 뿐이었다.
--
-- 공격: `is_nickname_available`(anon) 로 **아직 아무 계정도 안 쓰는 닉네임**을 찾고,
--   `set_my_nickname`(소유 검사 없음) 으로 그 닉네임을 차지한 뒤 `set_my_ranking_name_pref('real_name')`
--   를 부르면, 그 닉네임으로 적혀 있던 **남의 랭킹 행의 real_name** 이 anon 에게 공개된다.
--   내 실명이 아니라 그 손님의 실명이 열린다.
--
-- ── 고치는 방법과 그 이유 ───────────────────────────────────────────────────
-- 함수 시그니처를 바꿔 행의 real_name 을 넘기는 안은 호출부 5개(season_results ·
-- venue_rankings_public · venues_season_leaders · current_season_standings · venue_hall_of_fame)를
-- 전부 다시 써야 해서, 운영 중에 한 번에 갈아끼우기엔 위험이 크다.
-- 대신 **판정 함수 안에서** 같은 결론을 낸다:
--   ① 본인확인을 마친 계정만(ci_hash is not null) 실명 공개를 켤 수 있다.
--   ② 그 닉네임으로 적힌 랭킹 행들의 real_name 이 **전부** 그 계정의 real_name 과 같을 때만 연다.
--      하나라도 다르면(= 남이 섞여 있으면) 그 닉네임 전체를 닫는다. fail-closed 다.
-- 시그니처가 그대로라 호출부 5개는 손대지 않는다.
--
-- ⚠ 부작용(알고 받아들이는 것): 업주가 표에 실명을 조금 다르게 적어 둔 계정은 실명 표시가 꺼진다.
--   '남의 실명이 열리는 것' 보다 '내 실명이 안 열리는 것' 이 훨씬 가벼운 실패다.
--   근본 수정(랭킹 행에 user_id 를 두고 소유를 확인)은 별도 과제로 남긴다.
--
-- ⚠ CREATE OR REPLACE 라 ACL 보존(2026-09-12 실측). 반환 타입·인자 동일이라 DROP 불필요.

create or replace function public._ranking_real_name_opted_in(p_nickname text)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    -- ① 그 닉네임을 쓰는 active 프로필이 **정확히 하나**이고, 본인확인을 마쳤고, 실명 표시를 켰다
    (select count(*) = 1
       from public.profiles p
      where lower(btrim(p.nickname)) = lower(btrim(coalesce(p_nickname, '')))
        and coalesce(p.status::text, 'active') = 'active'
        and p.ranking_name_pref = 'real_name'
        and p.ci_hash is not null
        and nullif(btrim(coalesce(p.real_name, '')), '') is not null)
    -- ② 그 닉네임으로 적힌 랭킹 행의 실명이 **전부** 그 계정의 실명과 같다
    --    (하나라도 다르면 남이 섞인 것이므로 닫는다)
    and not exists (
      select 1
        from public.venue_rankings r
        join public.profiles p
          on lower(btrim(p.nickname)) = lower(btrim(coalesce(p_nickname, '')))
         and coalesce(p.status::text, 'active') = 'active'
       where lower(btrim(r.nickname)) = lower(btrim(coalesce(p_nickname, '')))
         and nullif(btrim(coalesce(r.real_name, '')), '') is not null
         and lower(btrim(r.real_name)) is distinct from lower(btrim(coalesce(p.real_name, '')))
    );
$function$;

-- ── 적용 후 반드시 돌릴 대조 (음성 + 양성) ──────────────────────────────────
-- 음성: 같은 닉네임에 실명이 다른 랭킹 행이 하나라도 있으면 `_ranking_real_name_opted_in` = false.
-- 양성: 본인확인 + 실명 일치인 계정은 여전히 true → venue_rankings_public 에 실명이 그대로 나온다.
--       (양성을 같이 안 보면 '아무도 통과 못 하는 고장' 을 못 잡는다 — 2026-09-15 교훈)
-- 영향 범위 미리보기(적용 전에 라이브에서 읽기만 해 보면 몇 명이 꺼지는지 나온다):
--   select p.nickname from public.profiles p
--    where p.ranking_name_pref='real_name' and coalesce(p.status::text,'active')='active'
--      and not public._ranking_real_name_opted_in(p.nickname);
