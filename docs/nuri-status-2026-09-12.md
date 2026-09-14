> ⛔ **낡은 문서(2026-09-12 기준). 마이그레이션 상태를 여기서 읽지 마라.**
> 여기 '미적용 12개'로 적힌 것은 **2026-09-14~15 에 전부 적용됐다**(총 17건). `BLOCKED.md` #20 도 닫혔다.
> 현재 상태는 **`docs/HANDOFF.md`** 가 정본이다.

# NURI HOLDEM — 현재 진행상황 (2026-09-12 실측)

> 이 문서는 저장소·git·문서를 **실제로 열어서** 만든 정본이다. 추측 없음.
> 마스터 플랜(`docs/plans/nuri-master-execution-plan.md`, 2736줄)의 요약이 아니라 **지금 상태**다.

## 한 줄 요약

앱은 앞서 나가 있고 **서버가 못 따라왔다.** `main` 에 배포된 기능 중 여러 개가 운영 DB 에 마이그레이션이 안 올라가서
조용히 죽어 있거나 404 다. 코드 작업보다 **DB 적용 결정(BLOCKED #20)이 지금 가장 큰 막힌 곳**이다.

## 규모

> 소스 421 TS/TSX · 단위 테스트 106 파일(+ api/health.test.js) · it/test 블록 약 1092 · e2e 69 스펙 약 296 블록(마지막 기록 실행 2026-09-10: main 218 = 207 통과·11 skip, boot 2 통과 / vitest 81 파일 792 통과) · 마이그레이션 200(로컬)/201(origin) · 엣지 함수 8 · Vercel api 함수 4 · 워크플로 3(ci.yml 안에 build-and-e2e·security·semgrep 3잡) · 계획 문서 5(마스터 플랜 2736줄) · 커밋 1100(2026-09-05 기준선 32bcf3f 이후 169) · 로컬 main 은 origin 보다 9커밋 뒤 · 미커밋 5파일(+158/-18)

## 🔴 지금 막혀 있는 것 — 오너 결정 필요

- #20 (2026-09-11 실측, 최신·최대 건) — **운영 DB 미적용 마이그레이션 12개 + 엣지 함수 2건.** 앱은 main 에 배포됐는데 서버가 안 따라가 새 기능이 조용히 죽어 있거나 404 다. 미적용: 20260911a_community_ads_promoted_posts(🔴 배포된 앱이 없는 RPC community_ads_public 을 불러 커뮤니티 탭마다 404 — auth-smoke e2e 가 이걸로 실패) · e_home_banners_kst_window · f_kst_date_defaults_and_season_window · g_voucher_multi_use_pending_uniq · h_ledger_player_search_venue_scope · i_bulk_delete_voucher_restore · j_ranking_member_search_venue_scope · k_admin_withdraw_user(🔴 강제 탈퇴가 개인정보·세션 파기와 재가입 차단을 안 한다 — 제재 메일의 '재가입 제한' 문장이 거짓) · l_admin_update_venue_revoke_owner · m_suspended_venue_hides_schedules · n_sanction_gate_comments · o_schedule_reject_reason_and_notice
- #20 엣지 함수 — tda-assist **미배포**(앱의 TDA 규칙 질의가 없는 함수를 부름 = 기능 사망) · gemini 는 저장소가 410 스텁인데 **배포본은 옛 범용 프록시**(마지막 배포 ~2026-09-02): 로그인한 아무 유저나 우리 키로 임의 프롬프트·이미지를 넣을 수 있다. gto-explain 은 ACTIVE
- #1 변호사 유권해석 — '머니인 보상 이용권 → 같은 매장 바이인' 이 문체부 '적립→입장료' 가이드에 걸리는지. 기본값: 제한부(양도·유상쿼터·자동적립 차단)만 실행, 모델 재정의 착수 금지
- #3 SUPABASE_DB_URL(세션 풀러 5432) 등록 — W2 DB 변경 전체의 하드 선행조건. 오너가 SUPABASE_URI 로 넣어 둬 워크플로가 못 보던 것은 코드로 해소(둘 다 수용)했으나, 백업 자체는 R2 업로드 TLS 실패로 아직 0건
- #4 R2 버킷 nuri-backups · #5 VITE_SENTRY_DSN(현재 Sentry 꺼져 있음) · #6 SENTRY_AUTH_TOKEN · #7 PostHog 프로젝트 키(없으면 피처플래그·행동트리거·W7 재계획 전부 연쇄 파킹) · #8 Healthchecks.io · #10 알림톡 provider(심사 수일, 이번 사이클 밖) · #13 Supabase Image Transformations 활성 여부 · #14 로티아레나 상표 사용 허락
- #2 Vercel Hobby 상업사용 판단(부스트 결제 도입 시 계정 정지 리스크 — 현재 팀은 nuridream Pro 라 재확인 필요) · #15 PR #4 머지 여부
- #16 TDA 룰 한국어 번역 게시 — 무단 전문 번역 게시 금지. 정식 경로는 TDA 포럼 board 51 번역 기여(한국어본 아직 없음). 오너가 의사를 밝혀야 이식 가능
- #17 순위 등수 점수를 활동 등급(비소비)에 계속 반영할지 · #18 클락 TV 의 순위별 프라이즈 표시 유지(법률) · #19 이미 지급된 순위 유래 활동점수 회수 여부 — 셋 다 현행 유지 중
- #11 위치정보법 신고 · #12 통신판매업 신고 = 신고 예정 확정. 번호 나오면 BusinessFooter BIZ_ROWS·LegalNotice·LegalDocsModal 3소스에 동시 추가(legalConsistency.test.ts 가 감시)
- 출시 준비(release-readiness) — [P0] main 브랜치 보호·룰셋 0 + Vercel Git 연동이라 **CI 실패 커밋도 프로덕션에 나간다**(2026-09-07 b438cee·cbbb2e5 실제 사례). 조치: Vercel Deployment Checks 에 build-and-e2e·security·semgrep 3개 등록(대시보드 쓰기는 MCP 로 불가 = 오너 몫)
- 출시 준비 — Play 출시 차단: public/.well-known/assetlinks.json 이 REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE 그대로. 앱 서명 키·업로드 키 SHA-256 두 값이 필요
- 출시 준비 — 기존 소셜 가입자 재동의 게이트 소급 적용 여부(20260909a) · Sentry tracesSampleRate 0.1 이 처리방침 문구와 불일치(샘플링 0 또는 문구 개정+legalVersion 상향) · Storage 버킷 6종 백업을 위해 service_role 키를 GitHub Secrets 에 둘지 · 카카오 provider 를 Supabase 에서 끌지 + 기존 카카오 가입자 1명 처리 · 홈 배너 폴백 'off' 투입 여부
- 출시 준비 §2 — §28 해석(캘린더 뱅크롤 '수입·손익' 라벨 교체 여부) · 포스터 게시 내리기/복원(schedules 에 상태 컬럼 없음 = DB 변경 필요) · 이미지 카드 공유를 '외부 반출' 로 볼지 · GA Consent Mode 옵트인 전환 · legacy anon JWT 로테이션 순서(어기면 send-push·weekly-email-digest 401)
- dependabot PR 7건(#6~#12) — 마이너·액션 범프는 저위험이나 Tailwind v4(#11)·TypeScript 7(#10)·@types/node 26(#12)은 메이저(색 회귀 경고). 자동 머지하지 않음

## 진행 중 / 미커밋

- ⚠ 로컬 체크아웃이 origin/main 보다 **9커밋 뒤**다(main...origin/main = behind 9, ahead 0). 밀린 것: 46a54e5·03cd8bb·935086b·9071008·f35d6d6·903f8e3·569eabc·e8012ad·aacfd0b (2026-09-11~12, 23파일 +1716/-928) + **새 마이그레이션 supabase/migrations/20260911p_co_owner_can_manage_schedules.sql**. 이어받는 사람은 작업 전에 반드시 pull 하고 아래 미커밋분과의 충돌을 확인해야 한다
- 미커밋 작업 = NURI SPOT 프리플랍 차트 조회 버그 3건 수정(게이트 미실행). C:/Users/buffy/OneDrive/바탕 화면/누리홀덤/src/lib/spotEvaluate.ts — 경계 변환 `export const toTablePos = (p: SpotPosition): TablePos => (p === 'UTG1' ? 'UTG+1' : p);` 신설. 스팟은 'UTG1', 차트는 'UTG+1' 로 적는데 9개 중 8개가 겹쳐 TS 가 === 비교를 못 막았고, 그 한 자리만 어떤 입력으로도 표에 안 걸려 math_only 로 떨어지고 있었다. 'UTG1' 쪽을 안 바꾸는 이유는 post_spots.spot jsonb·spot_reviews 에 이미 저장돼 있어서
- 같은 수정 2 — src/lib/ranges.data.ts 에 `baseTableSize?: 6 | 9` 필드 추가하고 bbVsEarly·sbVsEarly(얼리 오픈 수비 표)에 9 를 박았다. 기존 코드가 defend 표를 전부 6인으로 단정해 9인 입력에 '없는 차이'를 적고 정확 일치를 유사 스팟으로 끌어내리고 있었다
- 같은 수정 3 — defend 조회에 `x.hero === 'BB'` 조건 추가. defend 그룹에 같은 vs 의 BB 표와 SB 표가 나란히 있어 지금까지는 배열 순서에 기대 우연히 맞고 있었다(데이터 순서 의존 정답)
- 미커밋 테스트 — src/lib/spotEvaluate.test.ts +81줄(vitest), e2e/nuri-spot.spec.ts +38줄('🔴 UTG+1 오픈이 수학 참고가 아니라 그 자리의 표에 걸린다', 412×915, chart_nash 배지 + 이웃 표로 때웠는지까지 단언)
- public/sitemap.xml 변경은 빌드 생성물(lastmod 2026-09-10→09-11). 기능 변경 아님 — `npm run build` 가 매번 갱신한다
- 미추적 파일: AGENTS.md(CLAUDE.md 와 같은 내용의 Codex 용 사본) · .codex/(config.toml·hooks.json·hooks/nuri-guard.mjs) · .agents/skills(nuri-ship·nuri-migration·security-audit 사본). wholeness 문서가 '다른 작업자 흔적 보존' 으로 미추적 유지를 지시했다 — 지우지 말 것
- 미추적 산출물: docs/bugshots/(버그 전후 스크린샷 20여 장) · docs/nuri-bm-01-core.png, nuri-bm-02-pricing(.v2).png, nuri-bm-03-premium-package-v2.png, nuri-bm-03-report.png(BM 검토 이미지)

## 운영 DB 상태

- 운영 프로젝트는 하나뿐이다(idsxiqspecrucvfvtgbw). 격리 스테이징이 없어 프런트 .env.local 과 E2E 가 **운영 DB 를 직접 가리킨다** — e2e/_fixtures.ts 가드가 읽기·STABLE RPC 만 통과시키고 쓰기는 네트워크 단에서 차단한다. Free 티어라 자동 백업은 0
- 저장소 마이그레이션은 로컬 200개 · origin 201개(로컬에 없는 20260911p_co_owner_can_manage_schedules.sql 포함). **적용 여부는 파일 존재로 판단하면 안 된다** — BLOCKED.md '20번 상세' 의 표가 정본
- 🔴 미적용 12개(2026-09-11 list_migrations 실측): 20260911a_community_ads_promoted_posts · e_home_banners_kst_window · f_kst_date_defaults_and_season_window · g_voucher_multi_use_pending_uniq · h_ledger_player_search_venue_scope · i_bulk_delete_voucher_restore · j_ranking_member_search_venue_scope · k_admin_withdraw_user · l_admin_update_venue_revoke_owner · m_suspended_venue_hides_schedules · n_sanction_gate_comments · o_schedule_reject_reason_and_notice. 서로 의존하지 않아 파일명 순서대로 돌리면 된다. 20260911p 는 그 실측 이후에 올라온 파일이라 문서에 상태 기록이 없다 — 미적용으로 보고 확인할 것
- ⚠ 2026-09-11 은 **두 세션이 d·e·f 접두사를 각각 써서 파일명이 겹친다**. letter 만 보고 적용 여부를 판단하면 틀린다(예: 20260911d_buyin_value 와 20260911d_nuri_spot 은 둘 다 적용, 20260911e_co_owner_can_manage_staff 는 적용인데 20260911e_home_banners_kst_window 는 미적용)
- 적용 완료(다시 돌리지 말 것): 20260911b_voucher_restore_and_reject_guard · c_buyin_request_link_and_cancel_restore · d_buyin_value_payment_method_neutral · d_nuri_spot · e_co_owner_can_manage_staff · f_staff_schedule_update_scope · 20260910b_ranking_real_name_server_mask · 20260909a_social_signup_consent_gate · 20260909b_bankroll_roi_columns(09-10 세션에서 3개 적용) · 20260906a_dedupe_roti_0828_schedule · 20260905g·h·i(법적위험완화 v3) · 20260905o_table_privilege_hygiene(anon·authenticated TRUNCATE/REFERENCES/TRIGGER 561건 회수, DML 무변경)
- 엣지 함수 8종(gemini · gto-explain · notify-sanction · send-push · tda-assist · verify-identity · weekly-email-digest · weekly-report). tda-assist 는 **미배포**(앱이 없는 함수를 부름), gemini 는 저장소가 410 스텁인데 **배포본은 옛 범용 프록시**(~2026-09-02) — 로그인 유저가 우리 키로 임의 프롬프트를 넣을 수 있는 상태. 09-10 점검 때도 6종 로컬 수정본 미배포로 기록됨(`supabase functions deploy gemini gto-explain notify-sanction send-push verify-identity weekly-email-digest`)
- 상태를 다시 재는 읽기 전용 SQL 3줄(BLOCKED.md 에 정본): `select proname from pg_proc where proname in ('community_ads_public','admin_withdraw_user');` / `select to_regclass('public.spot_reviews'), to_regclass('public.post_spots');` / `select version, name from supabase_migrations.schema_migrations order by version desc limit 10;`
- 적용 절차: `nuri-migration` 스킬 선행 → 적용 후 어드바이저 **보안 ERROR 0** 확인. **`supabase db push` 금지**. DDL 과 앱코드는 다른 커밋으로 나누고, 마이그레이션 하단에 `-- ROLLBACK:` 블록(편집 전 pg_get_functiondef() 로 라이브 현재 정의를 떠서 역방향 CREATE OR REPLACE). 기존 마이그레이션은 전부 forward-only 라 down 경로가 없다
- wholeness 문서의 '승인 대기 j·k·l·m·n'(바인 요청 영업일 · 출석 적용 공유 함수 · 방문=체크인 · 숨김 글 RLS · 조회수 dedupe)는 이후 BLOCKED.md '이미 해소된 것' 에서 운영 규칙 확정으로 기록됐다 — **문서 두 곳의 상태 어휘가 엇갈리므로 위 SQL 로 실측하고 판단할 것**
- 백업: backup.yml 이 매일 03:00 KST 에 돌지만 오래 '스킵=성공' 이었고, 지금은 pg_dump 까지는 되나 **R2 업로드 TLS 핸드셰이크 실패**(계정 ID 값 교정이 오너 몫)로 실객체 0건. secret 은 SUPABASE_DB_URL·SUPABASE_URI 둘 다 수용하고 세션 풀러 5432 여야 한다(6543 트랜잭션 풀러는 pg_dump 실패). Storage 버킷 6종은 pg_dump 에 안 담긴다
- 보안 계약(코드 생성 기본값): 인가는 RLS/SECURITY DEFINER RPC 의 auth.uid()·my_role() 로, NULL-safe 비교는 IS DISTINCT FROM. 변이 RPC 는 `revoke execute … from public, anon` + `grant … to authenticated, service_role`(from anon 만으로는 PUBLIC 기본 GRANT 때문에 무효). SECURITY DEFINER 는 `set search_path = public, pg_temp`. `CREATE OR REPLACE` 는 ACL 을 초기화하므로 REVOKE/GRANT 재기술

## 검증 게이트 (이게 "끝"의 정의다)

- 정본 게이트 = `nuri-ship` 스킬 순서 그대로 4개(.claude/skills/nuri-ship/SKILL.md): `npm run lint` → `npm test` → `npm run build` → `npm run test:e2e`. 하나라도 실패하면 완료가 아니다
- `npm run lint` = `eslint .` (기준선: **0 error · 경고 126**). 2026-09-12 실측으로 기준선을 고쳤다 —
  옛 기준선 "35~43"은 보안 플러그인 도입(dc2d366, 09-02) 시점 수치이고, 그 뒤 **09-05~09-11 에 추가된
  fs 기반 정적 계약·마이그레이션 테스트 약 30개가 96건을 더했다**(기존 파일분은 여전히 30건).
  미추적 디렉터리(`.cursor/` · `.agents/` · `AGENTS.md` · `docs/`) 기여는 **0건** — md/png/json 은 eslint 대상이 아니다.
  내역: `security/detect-non-literal-fs-filename` 97 · `detect-non-literal-regexp` 15 ·
  `detect-unsafe-regex` 6 · `react-hooks/exhaustive-deps` 4 · 불필요한 eslint-disable 2 · 기타 2.
  앞 둘(112건)은 **테스트가 빌드타임 소스 경로를 읽는 것에 대한 오탐**이라 테스트 전용 오버라이드로 끄면 약 14건이 된다 —
  다만 보안 룰을 끄는 판단이라 **오너 승인 전까지 적용하지 않았다**. `detect-unsafe-regex` 6건
  (`src/lib/ranges.ts` · `tdaSearch.ts`)은 실제 ReDoS 후보라 개별 검토가 남아 있다.
- `npm test` = `vitest run` — vitest.config.ts include 가 `src/**/*.test.ts(x)` + `api/**/*.test.js`, exclude `e2e/**`, environment node. e2e 를 vitest 가 집으면 'Playwright Test did not expect test.describe()' 로 터진다
- `npm run build` = `node scripts/gen-sitemap.mjs && node scripts/gen-thumbs.mjs && tsc -b && node scripts/gen-legal.mjs && vite build`. **tsc -b 가 타입 게이트라 별도 tsc 불필요**
- `npm run test:e2e` = `npm run test:e2e:main`(`playwright test --grep-invert @boot`) + `npm run test:e2e:boot`(`playwright test --grep @boot --workers=1`). playwright.config.ts 가 `npm run build && npx vite preview --port 4173 --strictPort` 를 띄운다 — **프로덕션 빌드 4173 검사, dev 5173 아님**. reuseExistingServer:false(켜면 build 를 통째로 건너뛰어 옛 dist 를 검사한다). 뷰포트는 Pixel 7 단일 프로젝트, CI 는 retries 2
- 번들 예산: `npm run bundle:budget` (CI 에서 강제. 첫 화면 임계 경로 255KB gz · JS 1000 · CSS 32 · 최대 청크 114 상한. `--update` 로 기준선 갱신)
- 보안 게이트: `npm run secrets`(secretlint `**/*`) · `npm audit --omit=dev --audit-level=high` · gitleaks(이력) · `semgrep scan --config p/typescript --config p/react --config p/secrets --error`
- pre-commit 훅(.githooks/pre-commit) — 스테이징 파일을 `npx --no-install secretlint --format compact` 로 검사. `npm install` 의 prepare 가 `git config core.hooksPath .githooks` 를 잡는다(husky 없음). 우회는 --no-verify 대신 .secretlintrc.json allows 에 사유와 함께
- CI 잡 이름(.github/workflows/ci.yml) = `build-and-e2e` · `security` · `semgrep`. Vercel Deployment Checks 에 등록할 이름이 이 셋이다. 별도 워크플로: backup.yml(DB Backup to R2, 매일 03:00 KST) · mutation.yml(`npm run test:mutation`)
- DB 를 건드렸으면 추가: `nuri-migration` 스킬 선행 → 적용 후 Supabase 어드바이저 **보안 ERROR 0** 확인. `supabase db push` 는 쓰지 않는다
- 기타 스크립트: `npm run legal:check`(법적 문구 정합) · `npm run dev`(5173, .claude/launch.json 의 holdem-dev) · `npm run test:e2e:ui` / `:headed`
- 라벨·이모지에 결합된 e2e 셀렉터가 남아 있다. 그 텍스트를 바꾸면 **같은 커밋에서** data-testid 로 교체할 것 — 셀렉터를 느슨하게 푸는 것은 게이트 무력화라 금지
- Playwright 의 click/tap 은 누름이 0ms 라 `:active`/transform 부류(알약 첫 칸)를 원리적으로 재현 못 한다. 실제 손가락 조건은 CDP `Input.dispatchTouchEvent` 로 touchStart→(100ms+)→touchEnd (e2e/pill-press.spec.ts)

## 이미 나간 것

- NURI SPOT(구조화 한 판 복기 + 스팟 토론 게시판화) — f511890 · 3f0e461 '올리는 문' · c86f6f8 토론축 분리 · 246562b '비슷한 스팟 풀기'(#spot= URL 공유는 삭제). DB 는 20260911d_nuri_spot 적용 완료
- 관리자 기능 실배선 — 7a8f918 '관리자가 바꾼 것이 손님 기기에 닿지 않던 것 외 47건(연동 전수 점검)' · 1424821 관리자 조치 DB 5건+클라 3건 · e87bd6a 기능 스위치(SQL 로만 켜던 본인인증·이용권을 관리자 화면으로)
- 장부·급여·권한 — 67a2d78 분납 검증 부활/인건비 0원 위장/딜러 급여 누락 · 74faf16 근무표 UPDATE 권한 축소 + 결제안내·저장금액 불일치 · 0e834a7 공동 사장 '직원 관리' 3벌 구현 단일화 · 53c988e 직원 권한 RPC 1회 실패가 내 매장 전체를 닫던 것 · f35d6d6(origin) 공동 사장에게 포스터·예약 개방
- 클락/TV 계열 — 46a54e5 매장 TV 1열 고착 · 03cd8bb 보드를 ClockStage 한 벌로(두 벌 마크업 제거) · 935086b 프라이즈 15줄 자동 장 넘김 · 903f8e3 보드 단일화가 떨어뜨린 3건+렌더 크래시 · e008b02 레이아웃 판정을 스테이지 크기로 · acff818 전체화면 = 읽기 전용 보드 · 4a7295c/31463b5/8b2382b 테마 적용 결함 · 51df045 세로 타이머 관통
- 금액·날짜 정합 — 050bfb8 바이인 횟수/엔트리/얼리 3개념 분리(10만 게임·5만 할인·더블얼리 = 1회·0.5·2) · 417d33c 날짜 판정 KST 통일(UTC current_date 로 9시간 어긋나 있었다) · d99e3f2 대시보드 전주 대비 척도 통일
- 개인정보·범위 하드닝 — d941152 순위표 실명 서버 마스킹(venue_rankings_public RPC, 20260910b 적용) · 218a5ef 순위 입력 회원 조회 매장 범위 · 6378e15/484a5ed 장부 손님검색·닉네임 칸 실명 유출 · 349c1ef DB 원문이 손님 화면에 새던 것
- SlidingPill 근본 원인 — b6ab8b3 프레스 transform 이 offsetParent 를 바꿔 offsetLeft=0(3일간 4번 고쳐도 재발하던 '알약 첫 칸') · 4e719e6 숨겨진 사이 활성 변경 · a984368 글자는 제자리·알약만 미끄러짐 · c0cc564 게이트가 이름 삭제를 통과시키던 것
- 로그인/계정 — 3fcb932 로그인 화면 재설계·자동 로그인·공지 시트 · 0ea077a 카카오 로그인 코드 삭제(소셜=Google 단일) · Google 로그인은 PR #5 로 이미 배포
- GTO 축소 — cd620a1 생성형 AI 기능 제거, '근거 있는 도구'만 유지
- 커뮤니티 — f148edf 광고/승격 글 결함(자리 없는 광고가 승격 글을 지움, 광고 행 추천·비추천 누락). 단 서버 RPC(20260911a)는 미적용이라 지금 404
- 법무·자산 — b438cee 공개 연락처 도메인 메일 전환 · 9e5b016 로티/마스터스 포스터·배너 전량 제거 · 법적위험완화 v3(20260905g·h·i 운영 적용): 순위→이용권/포인트 분리, 주간 리그 삭제, 전국 랭킹=대회 입상 경력, 이용권 발급 근거 issue_reason
- wholeness/2026-09-05 (49커밋, F01~F11 + 모바일 점검 27건 + UI/UX 정돈)는 main 에 병합 완료 — 5c2c4b2 가 origin/main 조상. 32bcf3f 이후 169커밋이 올라가 있다
- 백업 파이프라인 수정 연쇄 — aaf6335(secret 이름 SUPABASE_URI 미인식) · f7dc8de(IPv6 직접 호스트→세션 풀러) · 2288fde(pg_dump 17 직접 호출) · 7ced750/dcdbb39/b5c3829(R2 엔드포인트 후보 순차 시도). pg_dump 까지는 되지만 R2 업로드 TLS 는 여전히 실패(오너 몫)
- 테스트 인프라 — 1d6b3bc auth-smoke 를 '자격증명 없으면 경고 달린 skip' 으로(E2E 계정 은퇴) · 9071008 마이그레이션 텍스트 단언 줄끝 정규화(Windows 16건) · 569eabc/e8012ad/aacfd0b 계정 없이 store-nav 5·owner-layout 4·tools 6건 복원 · bf13625 외치기 경계 전환 검증이 자기 픽스처에 지워지던 것

## 범위 밖으로 미뤄둔 것

- GKR-6~14 무료 GTO Wizard 심화(커스텀 레인지 빌더·Nash 격자 확장·프리플랍 커버리지·EV손실 채점·HH 임포트·스팟 라이브러리·토이게임 CFR·턴/리버 CFR 솔버·대표 플랍 사전계산) — GKR-1~5 만 유지. 해자는 솔버 깊이가 아니라 매장 운영 락인·일정 데이터 밀도
- FEAT-1~9 신규 제품 기능 전량(개인 성적분석·라이브 중계피드·한국판 Hendon Mob·학습허브·미션/업적·클립보드·명예의벽·공개 데이터 레이어·딜러 마켓). 특히 FEAT-8 공개 읽기 API 는 무료 5GB 에서 자기 DoS
- DEV 13장 중 11장(스키마 CI·Claude 리뷰봇·zod·Knip·서브에이전트·추가 훅·시각회귀·size-limit·commitlint·Ladle·OBS-6) — DEV-3 Dependabot · DEV-5 시크릿 스캔만 유지
- OBS-9 로그 파이프라인 · OBS-11 상태페이지 — OBS-3(UptimeRobot)만 유지(모니터링이 아니라 7일 무활동 pause 방지 장치라서)
- GRW-2~6 SEO·라이프사이클 전량(봇 프리렌더·알림톡·JSON-LD·@vercel/og·Resend 윈백). 대신 이미 켜진 무료 채널 send_tournament_reminders 크론을 쓴다
- LAW-9 전면 KWCAG 24항목 감사 → axe baseline 반나절 + 감사 산출물 문서로 축소
- §14 이모지 331개/55파일 전수 치환 → 핵심 CTA 20개 + 글리프 14종(ICON-1)으로 축소
- B2B 부스트 결제(조건부 이연) — Vercel Hobby 상업사용 + 노출 부족. 정렬 규칙만 W1-1 SORT-FIX 로 분리·완료
- DAI-4(카드/여백)·DAI-5(헤더)·DAI-6(비대칭) de-AI 레이아웃 계층 — 토큰 계층(폰트·팔레트·글리프)만 유지
- 이용권 '모델 재정의'(머니인 보상 → 같은 매장 바이인) — 변호사 회신 전 착수 금지. 제한부만 실행
- 카드가 없는 3덩어리: PL4(game_series/rrule 정기게임) · §11 T&S 7항목 · §11 B2B 9항목 — 앵커·DoD 없이 산문으로만 존재해 도달하면 라이브 DB 에 스키마를 즉흥 설계하게 된다. 다음 사이클에서 카드화
- 조직 정리: §1 P1~P5 순서표 폐기(§15 가 유일 큐) · §2 검증 16건 표를 카드 본문에 반영 후 삭제(현재 OBS-7 카드 본문은 'CSP 블록 3개', §2 #3 만 '5개' 로 정정 — 카드만 읽으면 틀린 명세를 구현한다) · §7 도구 7종 목록은 GKR 과 100% 중복 · 가드레일 보일러플레이트 80회 → G1~G8 1회
- 모바일 점검 잔여: 발현 조건 미충족 4건(게시판 50건 상한·머니인 0점 행·목록 밖 매장 id 등) · my_play_history 명칭 드리프트(라이브 정의를 마이그레이션으로 역반영 필요) · 머니인 탭 기간별 캐시 · 랭킹 TOP30 밖 '내 순위' 카드 위치 · 연합 리그 ITM 규칙 재정의(오너)
