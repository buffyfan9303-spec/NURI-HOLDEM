-- 20260913b — `post_spots.analysis` 를 공개 GRANT 에서 뺀다 (스팟 스포일러 차단)
--
-- ✅ **라이브 적용 완료** — 2026-09-22 read-only 재측정으로 확인했다(적용 날짜 자체는 기록이 없다).
--    2026-09-13 작성 당시 머리말은 "오너 승인 대기 / 운영 DB 쓰기 0건" 이라는 **미적용 표기**였는데 stale 이었다.
--    그 표기를 믿고 재적용하면 안 된다 — 2026-09-22 에 재적용 없이 기록만 바로잡았다.
--
--    2026-09-22 실측 (project idsxiqspecrucvfvtgbw · PG 17.6.1.127):
--      public.post_spots 테이블 ACL : anon=awdm / authenticated=awdm  → **SELECT(r) 가 테이블 수준에 없다**
--      컬럼 수준 SELECT 화이트리스트 8개:
--        post_id, spot, coverage_kind, source_label, dataset_version, reveal_villain, reveal_result, created_at
--      → `analysis` · `hero_action` · `hidden_villain` · `hidden_result` · `hidden_action` 은 **모두 제외돼 있다.**
--    즉 이 파일이 의도한 상태가 라이브에 이미 반영돼 있다. `src/api/spotPrivacy.migration.test.ts` 가
--    이 머리말이 다시 stale 해지지 않도록 고정한다.
--
-- 무엇이 문제인가
--   `20260911d_nuri_spot.sql:98-101` 이 테이블을 통째로 회수한 뒤 화이트리스트로 다시 부여하는데,
--   그 목록에 **`analysis` 가 들어 있다.** 같은 파일이 `hidden_villain`·`hidden_result`·`hidden_action`·`hero_action` 을
--   애써 잠그고 `spot` jsonb 에서 `villain`·`result`·`heroAction` 을 빼내는데,
--   **그 정보가 파생돼 들어가는 `analysis` 는 그대로 공개**다.
--
--   `src/api/spots.ts` 의 `analysisSnapshot` 이 싣는 것: `verdict`·`notes`·`math`
--   (+ 차트 적중 시 `mix`·`heroFreq`). 스팟 글 상세를 여는 **누구나(anon 포함) REST 한 번으로 글쓴이의 선택**을 얻는다.
--     · `mix` 와 `heroFreq` 가 나란히 오면 역산된다(차트 데이터가 공개라 mix 를 누구나 재계산할 수 있다)
--     · `heroAction` 이 `check` 면 `notes` 에 **문자 그대로** 들어간다
--     · `verdict` 하나만으로도 갈래가 특정된다
--     · `math.heroEquityPct` 는 상대 카드가 2장 있을 때만 계산되므로 **가려진 상대 콤보 후보를 크게 좁힌다**
--   → **투표를 무의미하게 만드는 제품 무결성 결함**이다. 개인정보·금액 사고는 아니고, 화면에 그리지도 않았다 —
--     **응답 페이로드에 실려 왔을 뿐**이다. 그래서 심각도는 P1 이다.
--
--   ⚠ `20260911d:92` 의 주석은 *"클라이언트는 이 컬럼을 쓰기만 하고 읽지 않는다"* 라고 적고 있는데 **사실과 달랐다** —
--     `fetchPostSpot` 이 실제로 `analysis` 를 select 하고 있었다(화면에서 쓰는 곳은 없었다). 그 주석도 이 파일이 대체한다.
--
-- ⚠ **값은 지우지 않는다.** `analysis` 의 존재 이유가 '엔진이 바뀌어도 옛 글의 결론이 변하지 않는다' 이고,
--   지우면 되돌릴 값이 없어 `CLAUDE.md` 3번(데이터 소실)에 걸린다. **공개 GRANT 에서만 뺀다.**
--   글쓴이 본인·관리자가 볼 필요가 생기면 `hidden_*` 과 같은 수법(별도 컬럼 + reveal 시 복원)으로 나중에 열면 된다.
--
-- 적용 순서 — ⚠ **클라이언트가 먼저다**
--   1) `src/api/spots.ts` 가 `analysis` 를 **select 하지 않게** 한다 ← **2026-09-13 에 이미 반영했다**
--      (안 하고 DB 만 고치면 `fetchPostSpot` 이 권한 오류를 받아 `null` 을 돌려주고 **모든 글에서 스팟 카드가 조용히 사라진다**).
--   2) 그 앱이 배포된 뒤 이 마이그레이션을 적용한다.
--   3) 반대 순서(DB 먼저)는 **구버전 앱이 깨진다.** `CLAUDE.md` 의 '호환 가능한 추가 → 새 코드 전환 → 확인 → 이전 구조 정리' 와 같은 이유다.

begin;

-- ── 1) 공개 GRANT 재선언 — `analysis` 만 뺀다 ──────────────────────────────────
-- 20260911d 와 같은 방식: 테이블 통째 회수 → 읽어도 되는 컬럼만 부여(화이트리스트).
-- ⚠ 컬럼만 revoke 하는 방식은 '테이블 수준 GRANT 가 이미 있다' 는 전제에 기대는데 그 전제는 프로젝트마다 다르다.
revoke select on public.post_spots from public, anon, authenticated;
grant select (post_id, spot, coverage_kind, source_label, dataset_version,
              reveal_villain, reveal_result, created_at)
  on public.post_spots to anon, authenticated;

-- ── 2) 자가검사 ────────────────────────────────────────────────────────────────
-- ⚠ 저장소 텍스트가 아니라 **라이브 카탈로그**(`information_schema.column_privileges`)를 본다.
do $_check$
declare
  leaked text;
  missing text;
begin
  -- (a) anon·authenticated 가 `analysis` 를 읽을 수 있으면 실패.
  select string_agg(grantee, ', ') into leaked
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'post_spots'
     and column_name = 'analysis' and privilege_type = 'SELECT'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if leaked is not null then
    raise exception 'ABORT: analysis 가 아직 공개다 — %', leaked;
  end if;

  -- (b) 20260911d 가 잠근 네 컬럼도 여전히 잠겨 있는지(이 파일이 되돌리지 않았는지).
  select string_agg(column_name, ', ') into leaked
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'post_spots'
     and column_name in ('hidden_villain', 'hidden_result', 'hidden_action', 'hero_action')
     and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if leaked is not null then
    raise exception 'ABORT: 20260911d 가 잠근 컬럼이 열렸다 — %', leaked;
  end if;

  -- (c) ⚠ 반대 방향도 본다 — 화이트리스트를 **너무 좁혀** 스팟 카드가 사라지지 않는지.
  --     `fetchPostSpot` 이 실제로 읽는 컬럼들이다. 하나라도 빠지면 전 글에서 카드가 조용히 없어진다.
  select string_agg(c.col, ', ') into missing
    from (values ('post_id'),('spot'),('coverage_kind'),('source_label'),
                 ('dataset_version'),('reveal_villain'),('reveal_result')) as c(col)
   where not exists (
     select 1 from information_schema.column_privileges p
      where p.table_schema = 'public' and p.table_name = 'post_spots'
        and p.column_name = c.col and p.privilege_type = 'SELECT' and p.grantee = 'anon');
  if missing is not null then
    raise exception 'ABORT: anon 이 읽어야 할 컬럼이 빠졌다 — % (스팟 카드가 전 글에서 사라진다)', missing;
  end if;

  raise notice '[자가검사] 통과 — analysis 비공개, 잠근 컬럼 유지, 필요한 컬럼 열림';
end
$_check$;

commit;
