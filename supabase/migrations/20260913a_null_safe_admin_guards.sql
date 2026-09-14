-- 20260913a — 관리자 가드를 NULL-safe 로 (fail-open 방지)
--
-- ⛔⛔ 은퇴(2026-09-15). **적용하지 않는다. 적용할 것도 없다 — 대상 집합이 비었다.**
--
--   이 파일이 고치려던 것을 2026-09-14 의 20260914c·20260914d 가 **직접 손으로** 전부 고쳤다
--   (admin_grant_points · admin_point_summary · admin_shout_refunds · hide_shout, 그리고
--    create_my_venue 3인자 오버로드는 죽은 함수라 DROP). admin_grant_voucher_quota 는 라이브가
--   이미 IS DISTINCT FROM 이었다.
--
--   2026-09-15 라이브 전수 스캔 — 주석(--·/* */)과 문자열 리터럴을 지운 **코드**에서만 판정:
--     · public plpgsql 함수  `my_role() <>|!=`  → **0건**
--     · public sql 함수                          → **0건**
--     · RLS 정책(qual + with_check)              → **0건**
--
--   그래서 이 파일을 돌려도 바뀌는 것이 없고, 남는 것은 **판정기 위험뿐**이다.
--   이 파일의 위험은 전부 '판정기'(주석·문자열·CASE 식을 코드와 가르는 정규식)에 있었고
--   nuri-migration §5-2 가 "판정기 자체의 결함은 파일이 스스로 못 본다"고 적어 두었다.
--   실제로 전 판이 SQL CASE **식**의 필터를 가드로 오인해 읽기 범위를 1행→5행으로 넓힌 전례가 있다.
--   0개를 고치려고 그 위험을 지는 것은 거래가 성립하지 않는다.
--
--   재발 방지는 **소스 계약**으로 옮겼다 → src/api/nullSafeAdminGuard.contract.test.ts
--   (새 마이그레이션이 `my_role() <>` 를 들이면 그 테스트가 빨개진다. 과거 파일은 면제 목록으로 동결.)
--
--   ⚠ 이 파일은 기록으로 남긴다 — 지우면 "왜 안 했나"가 사라진다. 아래 원문은 그대로 둔다.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- (아래는 은퇴 전 원문)
--
-- ⚠⚠ 아직 **적용하지 않았다(오너 승인 대기)**. `supabase db push` 를 돌리지 않았고 운영 DB 쓰기 0건이다.
--
-- 무엇이 문제인가
--   `my_role() <> 'admin'` 은 `profiles` 행이 없는 세션에서 **NULL** 이 된다.
--   plpgsql 의 `if NULL then` 은 거짓처럼 **건너뛴다** → 가드가 통째로 열린다(fail-open).
--   `CLAUDE.md` 보안 표준 2번이 `IS DISTINCT FROM` 을 요구하는 이유이고, 2026-08-20 에 실제로 사고가 났던 자리다.
--
-- 도달 경로(저장소 안에 실재한다)
--   `profiles_id_fkey … ON DELETE CASCADE` 때문에 Supabase 대시보드에서 사용자를 지우면 **프로필이 연쇄 삭제**되고,
--   그 사용자의 액세스 토큰은 **만료까지 계속 통과**한다. 그 창에서 아래 함수들의 가드가 열린다.
--   대상 함수 모두 `anon` EXECUTE 는 이미 회수돼 있어 2026-08-20(비로그인 통과)보다는 좁다.
--   쓰기는 `admin_grant_points`(활동점수 무제한 지급/회수)와 `admin_grant_voucher_quota`(이용권 한도) 둘,
--   나머지는 읽기 노출·외침 1건 숨김이다.
--
-- 대상 — 저장소 전수 스캔 기준 **12개**(2026-09-13 재스캔: 주석·문자열을 뺀 **코드**에서 `my_role() <>/!=` 가 한 번이라도 있었던 함수 전부)
--   (a) 저장소 최종 정의가 아직 취약한 5개 — 실제로 고쳐질 것으로 예상
--     admin_grant_points        20260830a_point_sink_economy.sql
--     admin_grant_voucher_quota 20260614b_voucher_quota.sql
--     admin_point_summary       20260830c_refund.sql
--     admin_shout_refunds       20260830d_refund_hardening.sql
--     hide_shout                20260829j_community_shouts.sql
--   (b) 이후 파일이 `is distinct from` 으로 다시 정의한 7개 — 라이브가 저장소와 같다면 자동 0건으로 **건너뛴다**(멱등이라 비용 0)
--     accrue_voucher              20260817a/d·20260818f → 최종 20260829c
--     admin_decide_voucher_credit 20260614b → 최종 20260826b
--     admin_list_purchases        20260830c → 최종 20260830n
--     admin_refund_purchase       20260830c/d → 최종 20260830n
--     cancel_ledger_buyin         20260818f → 최종 20260911c
--     delete_ledger_player        20260818g → 최종 20260911i
--     issue_voucher               20260614b·20260817b/d → 최종 20260905i
--   ⚠ 왜 (b) 를 넣는가 — 전 판(5개)은 `admin_grant_voucher_quota` 를 "8/20 스윕(20260820a)이 라이브에서 고쳤을 것" 이라는 **추론** 대신
--     실측으로 판정하려고 넣으면서, 같은 논리가 걸리는 `20260817a/b/d`·`20260818f/g` 의 함수들은 "뒤 파일이 고쳤을 것" 이라고 **추론**해 뺐다.
--     라이브 정의는 저장소와 다를 수 있고(아래 라이브 전용 핫픽스 전례), 판정기는 라이브 `pg_get_functiondef` 를 읽어 0건이면 건너뛰므로
--     이름을 넣는 비용이 0 이다. **이름을 넓히는 것이지 판정을 넓히는 것이 아니다** — 자동 치환 조건은 아래 §0 그대로다.
--   대상 밖의 public plpgsql 함수는 1) 미리보기에서 **읽기 전용으로 보고만** 한다(`[대상 밖]`). 이 파일은 손대지 않는다.
--
-- 왜 정의를 손으로 옮겨 적지 않는가
--   ⚠ 라이브 정의가 저장소와 다를 수 있다(`20260830d` 머리말에 **라이브 전용 핫픽스** 전례가 기록돼 있다).
--   저장소 텍스트를 그대로 다시 심으면 그 핫픽스를 **조용히 되돌린다.**
--   그래서 **라이브의 `pg_get_functiondef` 를 읽어 비교 연산자 하나만 바꿔 다시 심는다.**
--   본문·시그니처·`SECURITY DEFINER`·`SET search_path` 는 원본 그대로 보존된다.
--
-- ACL
--   ⚠ 2026-09-12 실측: **`CREATE OR REPLACE` 는 ACL 을 보존한다**(초기화하는 것은 `DROP` + 재생성이다).
--   그래도 아래에서 REVOKE/GRANT 를 다시 쓴다 — 어떤 이유로 함수가 **새로 만들어지는 경우**의 PUBLIC 기본 GRANT 를 막기 위해서다.
--
-- 적용 전에 할 것
--   1) 아래 **0) 판정기 + 1) 미리보기** 블록을 함께 먼저 돌려 라이브에서 몇 개가 **자동**이고 몇 개가 **검토**인지 확인한다(쓰기 없음).
--      미리보기는 히트마다 **원문 줄**을 찍는다 — 적용하는 사람이 눈으로 가드/필터를 가를 수 있게. 판정기는 `pg_temp` 임시 함수라 세션 밖에 남지 않는다.
--   2) ⚠ **검토(review) 건이 하나라도 있으면 미리보기가 EXCEPTION 으로 멈춘다.** NOTICE 는 Supabase SQL 편집기에서 안 보일 수 있어서
--      "멈추는 것" 으로 알린다. 원문 줄을 보고 사람이 판단한 뒤 계속하려면 `begin;` 다음 줄에
--        set local nuri.ack_review = 'on';
--      을 넣고 다시 돌린다(psql/CLI 는 `PGOPTIONS='-c nuri.ack_review=on'` 도 된다). **ack 를 해도 검토 건은 손대지 않는다** — 자동 건만 고친다.
--   3) ⚠ **`select version();` 을 먼저 확인한다.** 판정기가 쓰는 `regexp_instr` 는 **PG 15+** 에서만 있다(`regexp_matches`·`regexp_split_to_array` 는 옛 버전에도 있다).
--      (이 파일을 만든 세션은 운영 DB 를 조회하지 않았다 — 운영 버전은 **확인하지 않은 값**이다. 추정으로 적용하지 마라.)
--   4) 어드바이저 보안 ERROR 0 을 확인한다.
--
-- ⚠⚠ 판정기가 **자동으로 고치는 것 / 검토로만 보고하는 것 / 아예 못 보는 것** — 적용하는 사람이 "이게 전부를 잡는다" 고 믿으면 안 된다.
--   자동(auto)으로 고치는 것은 **딱 한 형태**다:
--     `if` / `elsif` / `elseif` 의 조건식 안에서 AND·OR·NOT·괄호만 거쳐 닿는 자리에 있는 `my_role() <> …` / `!=` 이고,
--     조건식이 `;` 를 건너지 않고 `then` 으로 끝나며, `then` 바로 뒤 첫 문장이 `raise` 또는 `return` 인 것. (근거는 §0 "왜 이 위치만 안전한가")
--   **검토(review)** — 보고만 하고 손대지 않는다. 진짜 가드여도 그렇다:
--     ① SQL `CASE WHEN my_role() <> 'admin' THEN …` — 조건 판정 위치이면서 **동시에 값이자 필터**다. `where (case when … then 1 else 0 end) = 1` 은 필터이고,
--        치환하면 NULL 세션의 행이 **넓어진다**(격리 컨테이너 실측 0행→2행, 극성이 반대면 2행→0행). plpgsql `case when … then raise` **문**(statement)도
--        정규식으로는 CASE **식**(expression)과 가를 수 없으므로 같이 검토로 보낸다. (전 판은 `when` 을 자동 치환했고, 2026-09-13 독립 검증이 이 회귀를 잡았다.)
--     ② `if` 조건식 안이라도 **CASE 식 안**·**서브쿼리 안**(`exists (select … where …)`)·**함수 호출 괄호 안**(`coalesce(…)`)·
--        **괄호 뒤에 후위 연산이 붙은 것**(`(…) is true`, `(…) = v`, `(…)::int`)·`<> any(...)`/`all(...)` — 3치 논리 단조성이 깨지는 자리라 방향을 보장 못 한다.
--        **괄호 없는 후위 술어**도 같다: `my_role() <> 'admin' is not true` — PG 에서 `IS` 는 `<>` 보다 우선순위가 **낮아** `(…) is not true` 로 파싱된다.
--        치환하면 `is distinct from … is not true` 가 되어 IS 급 nonassoc 둘이 붙는 **문법 오류** → `execute` 에서 터져 트랜잭션 전체 롤백.
--        그래서 히트 연산자 뒤 피연산자 구간(다음 and/or/not 전까지)에 `is`/`isnull`/`notnull` 이 있으면, 또 피연산자가 괄호 그룹이면 그 괄호 뒤 후위도, 검토로 내린다.
--        (2차 독립 검증 N2 — 전 판은 괄호 있는 경우만 막았다.)
--     ③ `while … loop`, `exit/continue when … ;`
--     ④ `then` 뒤 첫 문장이 **거부 형태가 아닌** 분기 — 자동은 `raise exception …`(기본 레벨 `raise 'msg'`·`raise sqlstate`·`raise using` 포함)과
--        값 없는/리터럴 `return`(`return;` `return null/true/false/숫자/'문자열';`)뿐이다. **`return query …`·`return next …` 는 행을 방출하는 허용 분기**라
--        거부가 아니고(2차 독립 검증 N1 — 전 판은 `return` 이면 전부 거부로 봐서 `if my_role() <> 'admin' then return query select * from t` 를
--        자동 치환해 NULL 세션의 읽기를 1행→5행으로 **넓혔다**), `return <식>`·`raise notice/warning/…`·`then v := …` 도 판정기는 모른다 → 전부 검토(`if:branch`).
--        미리보기는 히트 줄과 함께 **`then` 뒤 첫 문장의 원문 줄**(⤷)을 찍는다 — 사람이 "이 분기가 거부인가" 를 볼 수 있어야 한다.
--     ⑤ 어느 조건식에도 속하지 않은 자리 — `where … my_role() <> 'admin'`(순수 필터), `v_ok := my_role() <> 'admin'`, `return my_role() <> …`.
--     ⑥ 조건식 끝을 못 찾거나 괄호·`case … end` 균형이 깨진 것 → `unparsable` 로 보고하고 그 조건식의 히트는 전부 검토.
--        (전 판은 `if (case when p = 'a' then 1 else 2 end) = 1 and my_role() <> 'admin' then` 에서 CASE 안의 `then` 에 조건식이 잘려
--         가드를 통째로 놓친 채 `[자가검사] 통과` 를 찍었다 — 지금은 `case … end` 를 균형 있게 건너뛰어 잡고, 못 가르면 시끄럽게 보고한다.)
--   **아예 못 보는 것**(자동도 검토도 아님 — 보고되지 않는다):
--     ⑦ 함수가 **오른쪽**인 비교 `'admin' <> my_role()`, `my_role() = 'admin'` 역형(`if … = 'admin' then … else raise`), `my_role() in (…)`,
--        캐스트가 낀 `my_role()::text <> …`, `coalesce(my_role()::text, '') <> 'admin'` — 패턴이 `my_role\s*\(\s*\)\s*(<>|!=)` 뿐이다.
--     ⑧ **중첩 달러 인용**(동적 SQL) 안 — 마스킹돼 보이지 않는다(보수적: 손대지 않는다).
--     ⑨ `public."my_role"()` 인용 식별자 호출 — 마스킹된다.
--     ⑩ `my_role` 이 아닌 다른 권한 함수(`can_manage_venue` 등)·`profiles.role` 직접 조회 — 범위 밖.
--   그리고
--     ⑪ **자동 치환의 의미 보장은 "그 조건식의 진릿값이 NULL/FALSE→TRUE 한 방향으로만 바뀐다" 까지다.** 즉 "건너뛰던 분기가 실행된다" 이고,
--        그 분기가 **허용**이면 결과가 넓어진다 — 필터를 안 건드려도 피해 경로는 같다. 그래서 분기 첫 문장을 ④의 거부 형태로 제한하고 원문 줄(⤷)을 찍지만,
--        `raise exception` 뒤에 무엇이 오든 확인하지 않으며(예외는 실행을 끊으므로 뒤는 무관), `return 0;` 같은 리터럴 return 이 "허용" 인 설계도 이론상 가능하다.
--        저장소 대상 12개는 전부 `then raise exception` 이지만 **판정기는 라이브 정의를 읽으므로 단정할 수 없다** — 라이브에 다른 형태가 있으면 검토로 떨어져 미리보기가 멈춘다.
--     ⑫ **자가검사가 치환과 같은 판정기를 쓴다.** 판정기 결함은 이 파일이 스스로 못 본다 — 음성 대조에서 실증했다
--        (`case` 깊이 추적을 끄면 ⑥ 형태의 가드를 놓친 채 건너뛰고, `when` 을 자동에 넣으면 ① 의 필터를 치환한다).
--        **판정기를 고치면 격리 컨테이너 하네스를 반드시 다시 돌려라.**
--     ⑬ NOTICE/WARNING 은 Supabase SQL 편집기에 안 보일 수 있다. 그래서 검토 건은 EXCEPTION 으로 멈추고, `[대상 밖]` 은 NOTICE 뿐이다(psql 로 돌려야 보인다).

begin;

-- ── 0) 판정기 — 비코드 마스킹 → 조건식 구조 스캔 → 오프셋 치환 (임시 함수, 아래 블록이 공유) ──────
-- 왜 정규식만으로는 안 되는가 — 2026-09-13 격리 컨테이너(postgres:16) 실측
--   정규식은 **코드와 주석·문자열 리터럴을 가르지 못한다.** 그래서 전전 설계(`pg_get_functiondef` 에 직접 정규식)는
--   ① 이미 NULL-safe 인데 그 문구를 **주석에** 적어 둔 함수가 대상에 들어와 치환 0건 → ABORT → 트랜잭션 전체 롤백
--   ② `then` 직후 첫 문장이 문자열이면 `if` 와 문자열 사이에 `;` 가 없어 `[^;]*?` 가 **문자열 안까지 오염**
--      (저장소 실재 관용구: 20260912c 719~725행, 20260912d 452~457행)
--   ③ 취약 가드 **와** RAISE 메시지에 같은 문구가 둘 다 있으면, 치환은 옳은데 자가검사가 문자열을 잡아 **정상 수정을 롤백**
--   ④ `if` + `elsif` 혼재 시 `elsif` 가드는 fail-open 으로 남긴 채 `[자가검사] 통과` — `\mif\M` 은 `elsif` 를 못 본다
--   그리고 전 설계(마스킹 + 첫 `then` 까지 조건식)는
--   ⑤ `when` 을 조건 판정 위치로 보고 자동 치환해 **`where (case when … end) = 1` 필터를 넓혔고**(읽기 노출)
--   ⑥ 조건식 안에 CASE 식이 있으면 CASE 의 `then` 에서 조건식이 잘려 **그 뒤의 가드를 통째로 놓쳤다**(조용히 통과).
--   근본 원인은 "문자열/주석/조건식 경계를 정규식으로 가를 수 없다" 이므로, 비코드를 먼저 마스킹하고 그 위에서 **구조를 추적**한다.
--
-- 설계
--   nuri_targets()            — 대상 함수 이름(단일 출처). 미리보기·교체·ACL·자가검사가 같은 목록을 쓴다.
--   nuri_mask_noncode(src)    — `pg_get_functiondef()` 텍스트를 문자 단위로 훑어 비코드 구간을 **같은 길이의 공백**으로 바꾼다
--     (줄바꿈은 남긴다 → 오프셋 보존 → 마스킹본에서 찾은 위치를 원본에 그대로 쓴다). 상태:
--     `--` 줄주석 · `/* */` 블록주석(중첩) · `'…'`(`''` 이스케이프) · `E'…'`(백슬래시 이스케이프) · `"…"` 인용 식별자 ·
--     달러 인용. ⚠ 가장 바깥 달러 인용(`$function$ … $function$`)은 **본문 그 자체**라 투명하게 지나가고,
--     그 **안에 중첩된** 달러 인용(동적 SQL 등)만 마스킹한다(보수적 — 그 안의 가드는 손대지 않는다).
--   nuri_guard_hits(src)      — 마스킹본에서 코드 안의 **모든** `my_role() <>` / `!=` 를 찾아 `auto` 또는 `review` 로 분류한다.
--     시작 토큰 `if` `elsif` `elseif` `while` `when` 뒤의 조건식을 스캔하되 `case … end` 깊이·괄호 종류 스택·서브쿼리 깊이를 추적한다.
--     조건식 끝은 `then`(while 은 `loop`, when 은 `;` 도) — **`case` 깊이 0 에서만**. `;`·EOF·짝 없는 `)`/`end` → `unparsable`.
--     `auto` = if/elsif/elseif 조건식 안 · case 깊이 0 · 서브쿼리 밖 · 감싼 괄호가 전부 bare(and/or/not/`(`/조건식 시작 바로 뒤) ·
--              그 괄호들(피연산자 괄호 포함) 뒤에 후위 연산 없음 · 피연산자 구간에 `is/isnull/notnull` 없음 · `any/all/some(` 아님 ·
--              `then` 뒤 첫 문장이 `raise exception`(기본 레벨·sqlstate·using 포함) 또는 값 없는/리터럴 `return` 인 것.  그 밖은 전부 `review`.
--     반환에 then 뒤 첫 문장의 (br_no, br_line) 도 실어 미리보기가 ⤷ 로 찍는다.
--     어느 조건식에도 속하지 않은 히트도 `review('other')` 로 낸다 — 코드 안의 히트는 빠짐없이 둘 중 하나로 보고된다.
--     반환: (kind, ctx, pos, op, line_no, src_line). pos 는 **원본 오프셋**, src_line 은 그 자리의 **원문 한 줄**(미리보기용).
--     토큰화는 한 번(regexp_matches + regexp_split_to_array) — 피크(다음 토큰·사이 조각 확인)는 배열 조회라 사이의 마스킹된 주석 길이에 무관.
--   nuri_src_line(src, pos)   — 오프셋 → (줄 번호, 원문 한 줄).
--   nuri_fix_guards(src)      — `auto` 히트의 연산자(2글자)만 원본에서 `is distinct from` 으로 바꾼다(뒤에서부터 → 오프셋 불변).
--   미리보기·교체 건너뛰기 게이트·교체·자가검사 **넷이 같은 판정기(nuri_guard_hits)를 쓴다.** 복붙하면 ③④ 가 그대로 재발한다.
--
-- 왜 이 위치만 안전한가 (자동 치환의 근거)
--   `<>` → `is distinct from` 은 my_role() 이 NULL 일 때만 결과가 다르다: **NULL → TRUE**. (NULL 이 아니면 두 연산자는 같다.)
--   3치 논리(AND·OR·NOT)는 정보 순서(NULL ⊑ TRUE, NULL ⊑ FALSE)에 대해 **단조**다 — 잎 하나가 NULL 에서 TRUE 로 올라가면
--   전체는 NULL 에 머물거나 TRUE/FALSE 로 정해질 뿐, TRUE 였던 것이 FALSE 로, FALSE 였던 것이 TRUE 로 뒤집히지 않는다.
--   plpgsql `if` 는 NULL 과 FALSE 를 똑같이 "건너뜀" 으로 다루므로, 관찰 가능한 변화는 **"건너뛰던 분기가 실행된다" 한 방향**뿐이고,
--   그 분기의 첫 문장이 raise/return 이면 그것은 "열려 있던 가드가 닫힌다" 이다.
--   단조성이 깨지는 자리 — CASE 식(then/else 값이 임의), 서브쿼리(`where NULL` 은 행 제외·`where TRUE` 는 포함 → 결과가 **넓어진다**),
--   함수 호출 인자(`coalesce(…)`, 임의 함수), `is [not] true/false/null` 등 후위, `= v_bool` 비교, `any/all` — 는 전부 검토로 보낸다.
--   `when` 은 시작 토큰으로 잡되 **항상 검토**다: SQL CASE 식의 when 과 plpgsql CASE 문의 when 은 정규식으로 가를 수 없고 전자는 필터일 수 있다.
--   그래서 **필터가 자동 치환될 가능성은 구조적으로 0** 이다 — 자동은 if/elsif/elseif 조건식(`;` 를 건너지 않고 `then` 까지) 안에서만 나오고,
--   그 안에 `where` 가 들어올 수 있는 유일한 길은 서브쿼리 괄호인데 서브쿼리 안은 검토다. `when` 은 자동이 아니다.
--   ⚠ 그러나 "필터를 안 건드린다" 가 "결과가 안 넓어진다" 는 아니다 — 건너뛰던 분기가 **허용 분기**(`return query …`)면 같은 피해가 난다(N1).
--   그래서 분기 첫 문장을 거부 형태(`raise exception`·값 없는/리터럴 `return`)로 제한하고, 그 밖은 검토로 보낸다.
--   ⚠ 후위 술어: PG 우선순위는 `<>` > `IS` 라 `a <> b is not true` = `(a <> b) is not true` 다. `is distinct from` 은 IS 급이라 치환하면 nonassoc 충돌(문법 오류)이고
--   단조성도 깨진다(`IS NOT TRUE` 는 NULL→TRUE 를 TRUE→FALSE 로 뒤집는다).
--   ⚠⚠ **2026-09-13 3차 독립 검증 정정** — 여기 원래 "괄호가 있든 없든 검토(N2)" 라고 적혀 있었는데 **사실이 아니다.**
--     피연산자가 **함수 호출 괄호**면 후위 검사 세 그물이 전부 비껴가 **자동으로 분류된다**(실측):
--         if my_role() <> coalesce(v_x,'admin') is not true then …   → auto/if  (review/if:postfix 여야 한다)
--         if my_role() <> lower(v) is null        then …             → auto/if
--     이유: `pown` 은 직전 조각이 `" <> coalesce"` 라 연산자 패턴에 안 맞고, `pstack` 은 `'other'` 가 되며,
--           `opnd` 는 다음 토큰 `(` 에서 잘려 `is` 가 구간 밖으로 나간다.
--     **손해 범위(실측)**: 읽기 확대가 **아니다.** 치환 결과 `is distinct from … is not true` 가 PG 문법 오류라
--     `execute v_new` 에서 터지고 **트랜잭션 전체가 롤백**된다(정의 전부 원본 유지 확인). 즉 아래 ④(`<> any()`)와 같은 등급 —
--     **조용히 틀리는 것이 아니라 시끄럽게 멈춘다.** 그래서 판정기를 고치지 않고 여기에 공시한다.
--     고치려면 `opnd` 를 토큰 경계가 아니라 **괄호 균형**으로 재야 한다.
--   판정기의 이 모든 분류는 마스킹된 텍스트 위의 토큰 추적이지 파서가 아니다 — 못 가르면 자동이 아니라 검토(또는 unparsable)로 떨어지게 짰다.

create or replace function pg_temp.nuri_targets()
returns text[]
language sql immutable
as $_t$
  select array[
    -- (a) 저장소 최종 정의가 취약한 5개
    'admin_grant_points', 'admin_grant_voucher_quota', 'admin_point_summary', 'admin_shout_refunds', 'hide_shout',
    -- (b) 이후 파일이 고친 7개 — 라이브 실측으로 판정(같으면 건너뜀)
    'accrue_voucher', 'admin_decide_voucher_credit', 'admin_list_purchases', 'admin_refund_purchase',
    'cancel_ledger_buyin', 'delete_ledger_player', 'issue_voucher'
  ]::text[]
$_t$;

create or replace function pg_temp.nuri_mask_noncode(src text)
returns text
language plpgsql immutable strict
as $_m$
declare
  -- ⚠ 문자 배열로 훑는다. UTF-8 에서 substr(src, i, 1) 은 O(i) 라 문자 단위 루프가 O(n²) 였다(격리 실측: 41KB 본문 14초).
  --   배열 인덱스는 O(1). 출력은 누적 버퍼(코드 구간은 원문 그대로, 비코드 구간은 줄바꿈만 남긴 공백) → 문자 수·오프셋 보존.
  ch        text[] := regexp_split_to_array(src, '');
  n         int  := coalesce(array_length(ch, 1), 0);
  i         int  := 1;
  st        text := 'code';   -- code · lc(-- 줄주석) · bc(/* */) · ss('…') · es(E'…') · qi("…") · dq(중첩 $tag$)
  depth     int  := 0;        -- 1 = 가장 바깥 달러 인용(본문) 안
  outer_tag text;             -- 본문을 감싼 태그(pg_get_functiondef 는 $function$, 충돌 시 $functionx$ …)
  dq_tag    text;             -- 지금 지나가는 중첩 달러 인용의 태그
  tag       text;
  bc_depth  int  := 0;
  sp        int;              -- 지금 지나가는 비코드 구간의 시작 오프셋
  c         text;
  c2        text;
  prev      text;
  prev2     text;
  csp       int;              -- 이번 회차에 닫힌 비코드 구간 [csp, cse)
  cse       int;
  out_txt   text := '';
  last      int  := 1;        -- 아직 out_txt 로 옮기지 않은 원문의 시작
begin
  while i <= n loop
    c  := ch[i];
    c2 := c || coalesce(ch[i + 1], '');
    csp := null;
    if st = 'code' then
      if c2 = '--' then
        st := 'lc'; sp := i; i := i + 2;
      elsif c2 = '/*' then
        st := 'bc'; bc_depth := 1; sp := i; i := i + 2;
      elsif c = '''' then
        prev  := coalesce(ch[i - 1], '');
        prev2 := coalesce(ch[i - 2], '');
        -- E'…' 는 앞 글자가 e/E 이고 그 앞이 식별자 글자가 아닐 때만 (case'x' 는 표준 문자열)
        st := case when lower(prev) = 'e' and prev2 !~ '[A-Za-z0-9_$]' then 'es' else 'ss' end;
        sp := i; i := i + 1;
      elsif c = '"' then
        st := 'qi'; sp := i; i := i + 1;
      elsif c = '$' and coalesce(ch[i - 1], '') !~ '[A-Za-z0-9_$]' then
        -- 식별자 뒤의 $ 는 식별자의 일부, $1 은 위치 파라미터 — 태그가 아니다
        tag := (regexp_match(array_to_string(ch[i:i + 79], ''), '^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$'))[1];
        if tag is null then
          i := i + 1;
        elsif depth = 0 then                      -- 본문 시작: 투명
          depth := 1; outer_tag := tag; i := i + length(tag);
        elsif tag = outer_tag then                -- 본문 끝: 투명
          depth := 0; i := i + length(tag);
        else                                      -- 중첩 달러 인용: 마스킹
          st := 'dq'; dq_tag := tag; sp := i; i := i + length(tag);
        end if;
      else
        i := i + 1;
      end if;
    elsif st = 'lc' then
      if c = E'\n' then
        csp := sp; cse := i; st := 'code';         -- 줄바꿈은 코드로 남긴다
      end if;
      i := i + 1;
    elsif st = 'bc' then
      if c2 = '/*' then
        bc_depth := bc_depth + 1; i := i + 2;
      elsif c2 = '*/' then
        bc_depth := bc_depth - 1; i := i + 2;
        if bc_depth = 0 then
          csp := sp; cse := i; st := 'code';
        end if;
      else
        i := i + 1;
      end if;
    elsif st = 'ss' then
      if c2 = '''''' then
        i := i + 2;
      elsif c = '''' then
        i := i + 1;
        csp := sp; cse := i; st := 'code';
      else
        i := i + 1;
      end if;
    elsif st = 'es' then
      if c = '\' then
        i := i + 2;
      elsif c2 = '''''' then
        i := i + 2;
      elsif c = '''' then
        i := i + 1;
        csp := sp; cse := i; st := 'code';
      else
        i := i + 1;
      end if;
    elsif st = 'qi' then
      if c2 = '""' then
        i := i + 2;
      elsif c = '"' then
        i := i + 1;
        csp := sp; cse := i; st := 'code';
      else
        i := i + 1;
      end if;
    elsif st = 'dq' then
      if array_to_string(ch[i:i + length(dq_tag) - 1], '') = dq_tag then
        i := i + length(dq_tag);
        csp := sp; cse := i; st := 'code';
      else
        i := i + 1;
      end if;
    end if;
    if csp is not null then
      out_txt := out_txt || array_to_string(ch[last:csp - 1], '')
                         || regexp_replace(array_to_string(ch[csp:cse - 1], ''), '[^\n]', ' ', 'g');
      last := cse;
    end if;
  end loop;
  -- 닫히지 않은 구간은 끝까지 비코드로 본다(보수적: 잡지 않는 쪽으로)
  if st <> 'code' then
    out_txt := out_txt || array_to_string(ch[last:sp - 1], '')
                       || regexp_replace(array_to_string(ch[sp:n], ''), '[^\n]', ' ', 'g');
    last := n + 1;
  end if;
  return out_txt || array_to_string(ch[last:n], '');
end
$_m$;

-- 원본 오프셋 → (줄 번호, 원문 한 줄). 미리보기가 히트마다 찍는다.
create or replace function pg_temp.nuri_src_line(src text, at_pos int, out line_no int, out src_line text)
language plpgsql immutable strict
as $_l$
begin
  line_no  := 1 + length(substr(src, 1, at_pos - 1)) - length(replace(substr(src, 1, at_pos - 1), E'\n', ''));
  src_line := btrim(split_part(src, E'\n', line_no), E' \t\r');
end
$_l$;

create or replace function pg_temp.nuri_guard_hits(src text)
returns table(kind text, ctx text, pos int, op text, line_no int, src_line text, br_no int, br_line text)
language plpgsql immutable strict
as $_h$
declare
  m        text := pg_temp.nuri_mask_noncode(src);
  -- ⚠ 토큰화를 **한 번만** 한다. 토큰마다 regexp_instr(m, …, 시작위치)/substr(m, 위치) 를 부르면 PG 는 호출마다 문자열 전체를
  --   다시 변환/세므로 호출 1회가 O(n) → 전체 O(n²) 였다(격리 실측: 41KB 본문 12초). 아래는 토큰·조각·위치 배열 위의 O(토큰 수) 스캔이다.
  k_tok    constant text := '\(|\)|;|\m(?:if|elsif|elseif|when|while|end|case|select|then|loop|my_role)\M';
  -- then 뒤 첫 문장이 "거부" 인 형태 — 이것만 auto. (N1: `return query`/`return next` 는 행 방출 = 허용 분기라 거부가 아니다.
  --   `raise notice/warning/…` 는 실행이 계속되므로 거부가 아니다. `return <식>` 은 무엇을 돌려주는지 판정기가 모른다.)
  k_br_raise  constant text := '^\s*raise(\s+(exception|sqlstate|using)\M|\s*(,|$))';              -- raise exception … · raise 'msg'(기본 레벨) · raise sqlstate/using
  k_br_return constant text := '^\s*return(\s+(null|true|false|-?[0-9]+(\.[0-9]+)?))?\s*$';         -- return; · return null/true/false/숫자/문자열(마스킹돼 공백)
  -- N2: 히트의 피연산자 뒤 괄호 없는 후위 술어. IS 는 `<>` 보다 우선순위가 낮아 `my_role() <> 'admin' is not true` 는 `(…) is not true` 다.
  --   치환하면 `is distinct from … is not true` — IS 급 nonassoc 둘 → 문법 오류 → 트랜잭션 전체 롤백. 단조성도 깨지는 자리라 검토.
  k_postfix   constant text := '\m(is|isnull|notnull)\M';
  tk       text[];                    -- 토큰(소문자), 순서대로
  pc       text[];                    -- 조각: pc[k] 는 토큰 k 앞의 텍스트, pc[nt+1] 은 꼬리 (마스킹돼 주석·문자열은 공백)
  tp       int[] := '{}';             -- 토큰 k 의 시작 오프셋(문자 단위 — 마스킹본과 원본이 같다)
  nt       int;
  si       int;                       -- 문장 스캔 커서(토큰 인덱스)
  tok      text;                      -- 조건식 시작 토큰: if · elsif · elseif · while · when
  cstart   int;                       -- 조건식 시작 오프셋(시작 토큰 바로 뒤)
  cend     int;                       -- 종결 토큰 인덱스
  j        int;                       -- 조건식 스캔 커서(토큰 인덱스)
  t        text;
  cdepth   int;                       -- `case … end` 중첩 깊이
  pstack   text[];                    -- 괄호 종류 스택 — 'bare'(조건식 시작/and/or/not/`(` 바로 뒤) · 'other'(함수 호출·비교 등 그 밖)
  pmark    int[];                     -- 괄호를 열 때까지의 히트 개수(닫을 때 그 안의 히트를 되짚는다)
  pown     int[];                     -- 이 괄호가 어떤 히트의 **피연산자**인지(`my_role() <> (…)`) — 닫힌 뒤 후위 검사용. 0 = 아님
  pd       int;
  sel_d    int;                       -- 서브쿼리(select)가 시작된 괄호 깊이(없으면 null)
  bare     boolean;
  has_pf   boolean;
  h_pos    int[];
  h_kind   text[];
  h_ctx    text[];
  hn       int;
  k        int;
  opos     int;
  cut      int;
  opnd     text;                      -- 히트 연산자 뒤 피연산자 구간(다음 and/or/not 전까지)
  bad      text;                      -- 판정 불가 사유(null = 정상 종결)
  bq       int;
  bpos     int;                       -- then 뒤 첫 문장의 시작 오프셋
  r_br_no  int;
  r_br_ln  text;
  emitted  int[] := '{}';
  p        int;
begin
  select coalesce(array_agg(lower(x[1]) order by o), '{}')
    into tk
    from regexp_matches(m, '(' || k_tok || ')', 'gi') with ordinality as r(x, o);
  pc := regexp_split_to_array(m, k_tok, 'i');
  nt := coalesce(array_length(tk, 1), 0);
  p := 1;
  for k in 1 .. nt loop
    p := p + length(pc[k]);
    tp[k] := p;
    p := p + length(tk[k]);
  end loop;

  si := 1;
  while si <= nt loop
    tok := tk[si];
    if tok = 'end' then
      -- `end if` / `end loop` / `end case` 의 뒤 키워드는 조건식 시작이 아니다(사이의 주석은 마스킹돼 공백이다)
      if si < nt and pc[si + 1] ~ '^\s*$' and tk[si + 1] in ('if', 'loop', 'case') then si := si + 2; else si := si + 1; end if;
      continue;
    end if;
    if tok not in ('if', 'elsif', 'elseif', 'when', 'while') then si := si + 1; continue; end if;

    -- 조건식 스캔: 시작 토큰 뒤부터 종결 토큰까지 — case 깊이·괄호 종류·서브쿼리를 추적하며 히트를 모은다
    cstart := tp[si] + length(tok); cend := null; bad := null;
    cdepth := 0; pstack := '{}'; pmark := '{}'; pown := '{}'; sel_d := null;
    h_pos := '{}'; h_kind := '{}'; h_ctx := '{}'; hn := 0;
    r_br_no := null; r_br_ln := null;
    j := si + 1;
    loop
      if j > nt then bad := 'eof'; cend := nt + 1; exit; end if;
      t := tk[j];
      pd := coalesce(array_length(pstack, 1), 0);
      if t = '(' then
        -- bare = and/or/not 뒤, 또는 공백만 사이에 두고 조건식 시작 토큰/`(` 바로 뒤. 그 밖(함수 이름·exists·=·select …)은 other
        bare := pc[j] ~* '(\mand|\mor|\mnot)\s*$' or (pc[j] ~ '^\s*$' and (j = si + 1 or tk[j - 1] = '('));
        pstack := pstack || (case when bare then 'bare' else 'other' end);
        pmark  := pmark || hn;
        -- 바로 앞이 히트 원자 `my_role ( ) <>` 면 이 괄호는 그 히트의 피연산자다
        pown   := pown || (case when hn > 0 and j >= 4 and tk[j - 1] = ')' and tk[j - 2] = '(' and tk[j - 3] = 'my_role'
                                     and pc[j] ~ '^\s*(<>|!=)\s*$' then hn else 0 end);
      elsif t = ')' then
        if pd = 0 then bad := 'paren'; cend := j; exit; end if;
        -- 괄호가 닫힌 뒤 and/or 가 오거나, 공백뿐이고 다음 토큰이 then/loop/`)`/`;`(또는 끝)이면 정상.
        -- 그 밖(is/=/::/in …)은 그 괄호의 결과에 후위 연산이 걸린 것 → 단조 위치가 아니다
        has_pf := not (pc[j + 1] ~* '^\s*(and|or)\M'
                       or (pc[j + 1] ~ '^\s*$' and (j = nt or tk[j + 1] in ('then', 'loop', ')', ';'))));
        if has_pf then
          if pstack[pd] = 'bare' then
            for k in pmark[pd] + 1 .. hn loop
              if h_kind[k] = 'auto' then h_kind[k] := 'review'; h_ctx[k] := tok || ':postfix'; end if;
            end loop;
          end if;
          if pown[pd] > 0 and h_kind[pown[pd]] = 'auto' then
            h_kind[pown[pd]] := 'review'; h_ctx[pown[pd]] := tok || ':postfix';
          end if;
        end if;
        pstack := pstack[1:pd - 1]; pmark := pmark[1:pd - 1]; pown := pown[1:pd - 1];
        if sel_d is not null and sel_d >= pd then sel_d := null; end if;
      elsif t = 'case' then
        cdepth := cdepth + 1;
      elsif t = 'end' then
        if cdepth = 0 then bad := 'end'; cend := j; exit; end if;
        cdepth := cdepth - 1;
      elsif t = 'select' then
        if sel_d is null then sel_d := pd; end if;
      elsif t = 'then' then
        if cdepth = 0 then                        -- cdepth > 0 이면 CASE 식의 then — 조건식은 계속된다
          if tok = 'while' then bad := 'then'; elsif pd > 0 then bad := 'paren-open'; end if;   -- 괄호가 열린 채 then 이면 구조를 잘못 읽은 것
          cend := j; exit;
        end if;
      elsif t = 'loop' then
        if cdepth = 0 and tok = 'while' then
          if pd > 0 then bad := 'paren-open'; end if;
        else
          bad := 'loop';
        end if;
        cend := j; exit;
      elsif t = ';' then
        if tok = 'when' then                      -- exit/continue when … ;
          if pd > 0 then bad := 'paren-open'; end if;
        else
          bad := 'semicolon';
        end if;
        cend := j; exit;
      elsif t = 'my_role' then
        -- 히트 원자 = 토큰 my_role ( ) 셋(사이는 공백뿐) + 바로 뒤 조각의 머리가 <> 또는 != . `my_role() = …` 같은 것은 히트가 아니다
        if j + 2 <= nt and tk[j + 1] = '(' and tk[j + 2] = ')'
           and pc[j + 1] ~ '^\s*$' and pc[j + 2] ~ '^\s*$' and pc[j + 3] ~ '^\s*(<>|!=)' then
          opos := tp[j + 2] + regexp_instr(pc[j + 3], '<>|!=');     -- `)` 다음 문자가 조각의 1번 문자
          -- 피연산자 구간 = 연산자 뒤부터 다음 and/or/not(또는 조각 끝)까지. 여기에 is/isnull/notnull 이 있으면 후위 술어가 이 비교에 걸린 것
          cut  := regexp_instr(pc[j + 3], '\m(and|or|not)\M', 1, 1, 0, 'i');
          opnd := case when cut > 0 then substr(pc[j + 3], 1, cut - 1) else pc[j + 3] end;
          hn := hn + 1;
          h_pos[hn] := opos;
          if tok not in ('if', 'elsif', 'elseif') then
            h_kind[hn] := 'review'; h_ctx[hn] := tok;                       -- when(CASE 식/문·exit when)·while
          elsif cdepth > 0 then
            h_kind[hn] := 'review'; h_ctx[hn] := tok || ':case';            -- CASE 식 안
          elsif sel_d is not null then
            h_kind[hn] := 'review'; h_ctx[hn] := tok || ':subquery';        -- 서브쿼리 안(필터일 수 있다)
          elsif 'other' = any (pstack) then
            h_kind[hn] := 'review'; h_ctx[hn] := tok || ':paren';           -- 함수 호출·비교 등 bare 가 아닌 괄호 안
          elsif pc[j + 3] ~* '^\s*(<>|!=)\s*(any|all|some)\s*$' and j + 3 <= nt and tk[j + 3] = '(' then
            h_kind[hn] := 'review'; h_ctx[hn] := tok || ':any';             -- is distinct from any( 은 문법 오류
          elsif opnd ~* k_postfix then
            h_kind[hn] := 'review'; h_ctx[hn] := tok || ':postfix';         -- 괄호 없는 후위 is/isnull/notnull (N2)
          else
            h_kind[hn] := 'auto';   h_ctx[hn] := tok;
          end if;
          j := j + 3; continue;
        end if;
        -- my_role() 가 다른 연산자와 쓰였거나 변수명이면 지나간다(뒤따르는 괄호는 'other' 로 스캔되지만 히트가 없어 무해)
      end if;
      j := j + 1;
    end loop;

    if bad is not null then
      -- 판정 불가: 이 조건식의 히트는 전부 검토로 내리고, 사유 행을 하나 더 낸다(히트가 없어도)
      for k in 1 .. hn loop h_kind[k] := 'review'; h_ctx[k] := tok || ':unparsable'; end loop;
      kind := 'review'; ctx := tok || ':unparsable:' || bad; pos := cstart; op := null; br_no := null; br_line := null;
      select l.line_no, l.src_line into line_no, src_line from pg_temp.nuri_src_line(src, cstart) l;
      return next;
    elsif tok in ('if', 'elsif', 'elseif') then
      -- then 뒤 첫 문장: 원문 줄을 미리보기에 같이 찍고(사람이 "거부 분기인가" 를 본다), 거부 형태가 아니면 auto 를 검토로 내린다
      bq   := regexp_instr(pc[cend + 1], '\S');
      bpos := case when bq > 0 then tp[cend] + 3 + bq when cend < nt then tp[cend + 1] else null end;
      if bpos is not null then
        select l.line_no, l.src_line into r_br_no, r_br_ln from pg_temp.nuri_src_line(src, bpos) l;
      end if;
      if not (pc[cend + 1] ~* k_br_raise
              or (pc[cend + 1] ~* k_br_return and cend < nt and tk[cend + 1] = ';')) then
        for k in 1 .. hn loop
          if h_kind[k] = 'auto' then h_kind[k] := 'review'; h_ctx[k] := tok || ':branch'; end if;
        end loop;
      end if;
    end if;
    for k in 1 .. hn loop
      kind := h_kind[k]; ctx := h_ctx[k]; pos := h_pos[k]; op := substr(src, pos, 2); br_no := r_br_no; br_line := r_br_ln;
      select l.line_no, l.src_line into line_no, src_line from pg_temp.nuri_src_line(src, pos) l;
      return next;
      emitted := emitted || pos;
    end loop;
    si := cend;   -- 종결 토큰부터 다시 스캔(조건식 안의 중첩 when 은 이미 같은 구간에서 봤다 → 중복 없음)
  end loop;

  -- 어느 조건식에도 속하지 않은 my_role() <>/!= — 대입·return·where 필터 등. 판정기는 이것이 무엇인지 모른다 → 검토
  for k in 1 .. nt - 2 loop
    if tk[k] = 'my_role' and tk[k + 1] = '(' and tk[k + 2] = ')'
       and pc[k + 1] ~ '^\s*$' and pc[k + 2] ~ '^\s*$' and pc[k + 3] ~ '^\s*(<>|!=)' then
      opos := tp[k + 2] + regexp_instr(pc[k + 3], '<>|!=');
      if opos <> all (emitted) then
        kind := 'review'; ctx := 'other'; pos := opos; op := substr(src, pos, 2); br_no := null; br_line := null;
        select l.line_no, l.src_line into line_no, src_line from pg_temp.nuri_src_line(src, opos) l;
        return next;
      end if;
    end if;
  end loop;
end
$_h$;

create or replace function pg_temp.nuri_fix_guards(src text)
returns text
language plpgsql immutable strict
as $_f$
declare
  r       record;
  out_txt text := src;
  ins     text;
begin
  for r in select h.pos, h.op from pg_temp.nuri_guard_hits(src) h where h.kind = 'auto' order by h.pos desc loop
    ins := 'is distinct from';
    if coalesce(nullif(substr(out_txt, r.pos - 1, 1), ''), ' ') !~ '\s' then ins := ' ' || ins; end if;
    if coalesce(nullif(substr(out_txt, r.pos + 2, 1), ''), ' ') !~ '\s' then ins := ins || ' '; end if;
    out_txt := overlay(out_txt placing ins from r.pos for 2);
  end loop;
  return out_txt;
end
$_f$;

-- ── 1) 미리보기(쓰기 없음) — 라이브에서 자동/검토가 몇 건인지, 히트마다 원문 줄 ─────────
-- 검토 건이 있으면 여기서 **멈춘다**(ack 없이는 2) 로 못 간다). ack 를 해도 검토 건은 손대지 않는다.
do $_preview$
declare
  r      record;
  h      record;
  n_fn   int := 0;
  n_auto int := 0;
  n_rev  int := 0;
  v_rev  text := '';
  v_ack  boolean := coalesce(current_setting('nuri.ack_review', true), '') = 'on';
  n_oa   int;
  n_or   int;
  v_br   text;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and p.proname = any (pg_temp.nuri_targets())
     order by 2
  loop
    n_fn := n_fn + 1;
    for h in select * from pg_temp.nuri_guard_hits(pg_get_functiondef(r.oid)) g order by g.pos loop
      -- ⤷ then 뒤 첫 문장의 원문 줄 — 사람이 "이 분기가 거부인가" 를 본다(히트와 같은 줄이면 그 줄에 이미 보인다)
      v_br := case when h.br_no is null then ''
                   when h.br_no = h.line_no then ' ⤷ then 뒤: (같은 줄)'
                   else format(' ⤷ then 뒤 L%s 「%s」', h.br_no, h.br_line) end;
      if h.kind = 'auto' then
        n_auto := n_auto + 1;
        raise notice '[자동] % — % L% 「%」%', r.sig, h.ctx, h.line_no, h.src_line, v_br;
      else
        n_rev := n_rev + 1;
        raise notice '[검토] % — % L% 「%」%', r.sig, h.ctx, h.line_no, h.src_line, v_br;
        v_rev := v_rev || format(E'\n  %s — %s L%s 「%s」%s', r.sig, h.ctx, h.line_no, h.src_line, v_br);
      end if;
    end loop;
  end loop;
  raise notice '[미리보기] 대상 이름 %개 중 라이브 존재 %개 · 자동 치환 %건 · 수동 검토 %건',
    array_length(pg_temp.nuri_targets(), 1), n_fn, n_auto, n_rev;

  -- 대상 밖 — 읽기 전용 보고. 이 파일은 손대지 않는다. 실패해도 마이그레이션을 막지 않는다.
  begin
    for r in
      select p.oid, p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace ns on ns.oid = p.pronamespace
        join pg_language  l  on l.oid  = p.prolang
       where ns.nspname = 'public' and p.prokind = 'f' and l.lanname = 'plpgsql'
         and p.proname <> all (pg_temp.nuri_targets())
       order by 2
    loop
      select count(*) filter (where g.kind = 'auto'), count(*) filter (where g.kind <> 'auto')
        into n_oa, n_or
        from pg_temp.nuri_guard_hits(pg_get_functiondef(r.oid)) g;
      if n_oa + n_or > 0 then
        raise notice '[대상 밖] % — 자동 후보 %건 · 검토 %건 (이 파일은 손대지 않는다 — 별도 마이그레이션 대상)', r.sig, n_oa, n_or;
      end if;
    end loop;
  exception when others then
    raise notice '[대상 밖] 스캔 실패(무시): %', sqlerrm;
  end;

  if n_rev > 0 and not v_ack then
    raise exception E'STOP: 수동 검토 %건 — 판정기가 가드인지 필터인지 가를 수 없는 자리다(아무것도 바꾸지 않았다). 원문 줄을 보고 판단한 뒤 계속하려면 begin; 다음 줄에  set local nuri.ack_review = ''on'';  을 넣고 다시 돌린다(그래도 검토 건은 손대지 않는다).%',
      n_rev, v_rev;
  end if;
end
$_preview$;

-- ── 2) 가드 교체 ───────────────────────────────────────────────────────────────
-- 라이브 정의를 읽어(pg_get_functiondef) 판정기가 auto 로 잡은 오프셋의 연산자만 바꿔 CREATE OR REPLACE 로 다시 심는다.
-- 건너뛰기 게이트(auto 0 → 손대지 않음) · 치환 · 치환 후 재판정이 전부 같은 판정기다. review 는 어떤 경우에도 손대지 않는다.
-- 멱등: 두 번째 실행에서는 모든 함수가 auto 0 → 전부 건너뜀, ABORT 없음.
do $_fix$
declare
  r          record;
  v_def      text;
  v_new      text;
  v_auto     int;
  v_rev      int;
  v_ctx      text;
  v_left     int;
  v_left_rev int;
  n_fixed    int := 0;
  n_skip     int := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and p.proname = any (pg_temp.nuri_targets())
     order by 2
  loop
    v_def := pg_get_functiondef(r.oid);

    select count(*) filter (where g.kind = 'auto'),
           count(*) filter (where g.kind <> 'auto'),
           string_agg(g.ctx || ' L' || g.line_no, ', ' order by g.pos) filter (where g.kind = 'auto')
      into v_auto, v_rev, v_ctx
      from pg_temp.nuri_guard_hits(v_def) g;

    if v_auto = 0 then
      raise notice '[건너뜀] % — 자동 치환 대상 0건(검토 %건은 손대지 않는다). 판정기가 아는 것은 "if/elsif 조건식의 단조 위치에 my_role() <>/!= 가 없다" 까지다 — 이미 NULL-safe 인지, 다른 형태의 가드인지는 모른다',
        r.sig, v_rev;
      n_skip := n_skip + 1;
      continue;
    end if;

    v_new := pg_temp.nuri_fix_guards(v_def);
    if v_new = v_def then
      raise exception 'ABORT: % — 판정기는 자동 %건(%)을 잡았는데 치환 결과가 원본과 같다(치환기와 판정기가 어긋났다)',
        r.sig, v_auto, v_ctx;
    end if;

    execute v_new;

    -- 다시 심은 라이브 정의로 재판정 — 자동은 0, 검토는 그대로여야 한다. 같은 판정기라 ⑫ 형태는 하네스로만 잡힌다.
    select count(*) filter (where g.kind = 'auto'), count(*) filter (where g.kind <> 'auto')
      into v_left, v_left_rev
      from pg_temp.nuri_guard_hits(pg_get_functiondef(r.oid)) g;
    if v_left > 0 or v_left_rev <> v_rev then
      raise exception 'ABORT: % — 치환 전 자동 %건·검토 %건 → 치환 후 자동 %건·검토 %건 (자동은 0, 검토는 그대로여야 한다)',
        r.sig, v_auto, v_rev, v_left, v_left_rev;
    end if;

    raise notice '[교체] % — 자동 %건(%) → 0건 · 검토 %건 그대로', r.sig, v_auto, v_ctx, v_rev;
    n_fixed := n_fixed + 1;
  end loop;
  raise notice '[가드 교체] 교체 % · 건너뜀 %', n_fixed, n_skip;
end
$_fix$;

-- ── 3) ACL 재선언 ──────────────────────────────────────────────────────────────
-- 새로 만들어지는 경우의 PUBLIC 기본 GRANT 를 막는다. 기존 함수는 ACL 이 보존되므로 무해하다.
do $_acl$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and p.proname = any (pg_temp.nuri_targets())
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end
$_acl$;

-- ── 4) 자가검사 ────────────────────────────────────────────────────────────────
-- ⚠ 저장소 텍스트가 아니라 **라이브 `pg_proc`** 를 본다.
--   저장소 grep 으로 만들면 2026-08-20 이전 파일 13곳이 즉시 오탐이고,
--   옛 파일을 재적용할 때 무관한 마이그레이션까지 죽인다(20260911k 자가검사가 5건을 막았던 실패 형태와 같다).
-- ⚠ 치환과 **같은 판정기**(nuri_guard_hits)를 쓴다. 전역 정규식으로 검사하면 보존해야 할 주석·문자열 리터럴
--   (예: RAISE 메시지에 적힌 `my_role() <> ''admin''`)을 결함으로 잡아 **정상 적용을 막는다**(실제로 그렇게 실패했다).
-- ⚠ 자동 위치가 남아 있으면 ABORT. 검토 건은 WARNING 으로 다시 나열한다(1) 에서 ack 로 지나온 것) — 사람이 봐야 한다.
do $_check$
declare
  bad   text;
  n     int;
  v_rev text;
  n_rev int;
begin
  select string_agg(p.oid::regprocedure::text, ', '), count(*)
    into bad, n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f'
     and p.proname = any (pg_temp.nuri_targets())
     and exists (select 1 from pg_temp.nuri_guard_hits(pg_get_functiondef(p.oid)) g where g.kind = 'auto');
  if coalesce(n, 0) > 0 then
    raise exception 'ABORT: 자동 치환 위치의 NULL-unsafe 가드가 남아 있다 — %', bad;
  end if;

  select string_agg(format('%s — %s L%s 「%s」%s', p.oid::regprocedure, g.ctx, g.line_no, g.src_line,
                           case when g.br_no is null or g.br_no = g.line_no then '' else format(' ⤷ then 뒤 L%s 「%s」', g.br_no, g.br_line) end), E'\n  '
                    order by p.oid::regprocedure::text, g.pos),
         count(*)
    into v_rev, n_rev
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral pg_temp.nuri_guard_hits(pg_get_functiondef(p.oid)) g
   where ns.nspname = 'public' and p.prokind = 'f'
     and p.proname = any (pg_temp.nuri_targets())
     and g.kind <> 'auto';
  if coalesce(n_rev, 0) > 0 then
    raise warning E'[자가검사] 수동 검토 %건이 손대지 않은 채 남아 있다(ack 로 통과) — 사람이 확인해야 한다:\n  %', n_rev, v_rev;
  end if;

  -- 대상 함수가 실제로 존재하고 anon 이 실행할 수 없는지.
  for bad in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and p.proname = any (pg_temp.nuri_targets())
  loop
    if has_function_privilege('anon', bad, 'execute') then
      raise exception 'ABORT: anon 이 % 를 실행할 수 있다', bad;
    end if;
  end loop;

  raise notice '[자가검사] 통과 — 자동 치환 위치 0건 · 검토 %건(손대지 않음) · anon 실행 불가', coalesce(n_rev, 0);
end
$_check$;

-- 판정기는 세션 밖에 남지 않지만, 같은 세션에서 다음 마이그레이션이 이어질 때를 위해 정리한다.
drop function if exists pg_temp.nuri_fix_guards(text);
drop function if exists pg_temp.nuri_guard_hits(text);
drop function if exists pg_temp.nuri_src_line(text, int);
drop function if exists pg_temp.nuri_mask_noncode(text);
drop function if exists pg_temp.nuri_targets();

commit;
