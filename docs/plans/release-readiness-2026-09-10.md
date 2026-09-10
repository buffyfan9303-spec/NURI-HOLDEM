# NURI HOLDEM — 출시 준비 점검 · 오너 체크리스트 (2026-09-10)

> 이 문서는 2026-09-09~10 전체 점검(개인정보 격리 · 1T 정책 · 캘린더 ROI · 로그인/본인인증/Play 정책 · 기능 연결 · 공지 UI · 클락 테마 · 모션/로딩 · 접근성 · 운영 안정성)의 **오너 작업 목록**이다.
> 코드 변경·테스트 결과는 같은 날 세션 보고에 있다. 여기에는 **오너만 할 수 있는 것**과 **아직 검증되지 않은 것**만 적는다.
> 값(비밀·키·지문)은 이 문서에 절대 적지 않는다 — 이름만.

## 0. 지금 해야 할 일 (P0 → 순서대로)

### 0-0. 실측 상태 (2026-09-10 오전 · 읽기 전용 확인 · 값은 적지 않음)

| 항목 | 실측 | 근거 |
|---|---|---|
| 백업 | **main 의 backup.yml 은 아직 '스킵=성공' 판**(실패로 바꾼 수정본은 작업 트리 미커밋). 09-10 05:29 KST 실행 34401324183 도 9초 success | `gh run list --workflow=backup.yml` |
| GitHub secret | 11개 있음(`R2_*` 5 · `E2E_*` 4 · `VITE_SUPABASE_*` 2) · **`SUPABASE_DB_URL` 없음** | `gh secret list`(이름만) |
| main 보호 | 브랜치 보호 없음 · 룰셋 0 | `gh api …/branches/main/protection` 404 · `/rulesets` `[]` |
| Vercel | 팀 `nuridream`(Pro) · 프로젝트 `nuri-holdem` · GitHub 연동 · 최신 프로덕션 READY(09-07) | Vercel MCP `get_project` |
| Deployment Checks | 공식 절차 확인: **Settings → Build and Deployment → Deployment Checks → Add Checks → GitHub** → 잡 이름 `build-and-e2e` · `security` · `semgrep` 선택. CI 가 push 트리거라 워크플로 수정 불필요. 프로덕션 환경의 automatic aliasing 켜져 있어야 함. 우회 = 배포 상세의 **Force Promote** | vercel.com/docs/deployment-checks (2026-08-11판) |
| 20260909a | 미적용. **소셜 가입자 = 카카오 1명**(09-09 가입 · `agreed_to_terms=true` · `legal_consents` 0건 · `consented_legal_version` 있음) · Google 0 · 이메일 7(전원 true, 이력 0건) | `list_migrations` · 집계 SQL |
| 20260909b | 미적용. `bankroll_entries` **0행 · 0명** → 제약 교체의 데이터 위험 0 | 집계 SQL |
| 엣지 함수 | 운영 7종 배포본 09-01~09-03 · 로컬 수정본 09-10 → **6종 미배포** | `list_edge_functions` |
| Sentry · env | 값·설정 여부 확인 불가(MCP 에 env 조회 없음, `vercel` CLI 미설치) | — |

**Claude 가 도구로 직접 할 수 있는 것(오너 "실행" 한마디 뒤)**: `apply_migration`(a · b) · `deploy_edge_function` 6종 · `gh workflow run backup.yml` · GitHub 룰셋 생성.
**못 하는 것**: secret 값 등록(값을 모름·다루지 않음) · Vercel 대시보드 설정(Deployment Checks · 환경변수 · 시스템 env 노출 — MCP 에 쓰기 도구 없음) · 외부 모니터 계정 · Play Console.

1. **[P0] DB 백업이 0건이다.** `.github/workflows/backup.yml` 이 2026-08-24 이후 매일 03:00 KST 에 초록불이었지만, `SUPABASE_DB_URL` 이 한 번도 설정되지 않아 첫 단계에서 스킵하고 success 로 보고했다(실행 34276700212 로그 `DB_URL:` 빈 값). 이번 변경으로 **누락 시 실패**하도록 바꿨으므로, 오늘 밤부터는 빨간불이 뜬다.
   - 접속 문자열 secret 이름은 **`SUPABASE_DB_URL` 또는 `SUPABASE_URI` 둘 다** 받는다(2026-09-10 수정). 오너는 `SUPABASE_URI` 로 등록해 두었는데 워크플로가 `SUPABASE_DB_URL` 만 보고 있어 등록해도 계속 스킵됐다. 값은 Supabase 대시보드 → **Connect → Direct → Session pooler(5432) URI**. (6543 트랜잭션 풀러는 pg_dump 가 실패한다 — 경고를 띄운다.)
   - 가드가 `postgres://` 로 시작하지 않으면 실패시킨다 — 프로젝트 API 주소(`https://xxx.supabase.co`)를 붙여 넣는 실수를 첫 단계에서 잡는다.
   - 이미 있는 것: `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_ENDPOINT` `R2_BUCKET` `R2_ACCOUNT_ID` (2026-08-24 등록) · `SUPABASE_URI`. (선택) `HEALTHCHECK_BACKUP_URL`.
   - 그다음 순서: ① Actions → "DB Backup to R2" → Run workflow(수동) ② 로그의 "R2 객체 크기: N bytes / 로컬: N bytes" 확인 ③ Cloudflare R2 콘솔에서 `db/nuri-<날짜>.dump.gz` 객체 확인 ④ **격리된 일회용 DB**(새 Supabase 프로젝트 또는 로컬 Postgres 17)에 `pg_restore --no-owner --no-privileges -d <disposable>` 로 복구 드릴 — 운영 DB 에는 절대 restore 하지 않는다.
   - Storage 객체(포스터·장터·아바타·커뮤니티 이미지·클락 배경·본인인증 신분증 임시)는 pg_dump 에 담기지 않는다. 최소안: 주 1회 `supabase storage` CLI 또는 service_role 키로 버킷 6종을 R2 에 증분 복사하는 스크립트 — service_role 키를 GitHub Secrets 에 둘지 **오너 결정**이 먼저다(둘 때까지 미착수).

2. **[P0] CI 가 실패해도 프로덕션에 배포된다.** main 브랜치 보호·룰셋이 **없고**, Vercel Git 연동은 push 마다 즉시 배포한다. 실제로 2026-09-07 CI 실패 커밋 2건(b438cee · cbbb2e5)이 그대로 프로덕션에 나갔다(Vercel 배포 dpl_7t7mSw… · dpl_ANxtKQ… READY/production).
   - Vercel: 프로젝트 `nuri-holdem` → Settings → Build and Deployment → **Deployment Checks** → Add Checks → GitHub → `build-and-e2e` · `security` · `semgrep` 3개 선택. (프로덕션 환경 설정에서 automatic aliasing 이 켜져 있어야 한다 — 현재 켜져 있음.) 이렇게 하면 배포는 만들어지되 체크가 통과할 때까지 nuriholdem.com 에 승격되지 않는다. 우회는 Force Promote.
   - GitHub: Settings → Rules → Rulesets → main 에 "Require status checks to pass"(같은 3개) + "Require a pull request before merging"(선택). 현재 오너 워크플로가 main 직접 push 라 PR 강제는 작업 방식 변경이 필요하다 — Deployment Checks 만으로도 사용자 노출은 막힌다.

3. **[P0 · 개인정보] 20260909a 마이그레이션 적용 결정** — 소셜(Google·카카오) 신규 가입자가 만 19세·약관·사행성 서약 **동의 없이** `agreed_to_terms=true` 로 저장되고 있었다(`handle_new_user` 의 소셜 폴백). 새 파일 `supabase/migrations/20260909a_social_signup_consent_gate.sql` 은 메타데이터에 동의 플래그가 있을 때만 true 로 둔다. 파일 주석의 적용·검증·롤백 절차(nuri-migration)대로 적용하고 어드바이저 ERROR 0 을 확인한다.
   - **오너 결정**: 이미 true 로 저장된 기존 소셜 가입자를 되돌려 재동의 게이트를 태울지(법적 판단 + 데이터 변경 → BLOCKED).

4. **[P1] 20260909b 마이그레이션 적용 결정(개인 ROI)** — `bankroll_entries` 에 참가비·재진입·애드온·매장·게임 컬럼 추가. **클라이언트가 먼저 배포돼도 읽기는 깨지지 않고**, 새 필드를 입력하면 "서버 업데이트 중" 안내 후 금액·메모만 저장된다. 적용 순서는 아무 쪽이나 되지만 적용 전에는 ROI 입력이 반쪽이다. 파일 주석 ③ 의 합성 검증은 실제 `profiles.id` 하나를 `:uid` 에 넣어 돌린다.

5. **[P1] `/api/health` 모니터 등록** — 배포 후 `https://nuriholdem.com/api/health` 가 JSON 200(`status:"ok"`) 을 주는지 확인하고 UptimeRobot 등에 루트 `/` 와 `/api/health` 2종 등록(503 = DB 프로브 실패/타임아웃 3초). 지금까지는 SPA HTML 200 이라 어떤 모니터도 장애를 못 봤다.

6. **[P1] 엣지 함수 6종 재배포** — 오류 응답에서 DB·예외 원문을 제거했다(보안 표준 §6). `supabase functions deploy gemini gto-explain notify-sanction send-push verify-identity weekly-email-digest`.

7. **[P1] Vercel 환경변수** — `VITE_SENTRY_DSN`(런타임 오류 추적 활성화 · 지금은 미설정이라 Sentry 는 **꺼져 있다**), Project Settings → Environment Variables → "Automatically expose System Environment Variables" 켜기(→ `VITE_VERCEL_GIT_COMMIT_SHA` 로 release 식별). 소스맵 업로드(`SENTRY_AUTH_TOKEN` + `@sentry/vite-plugin` 도입)는 별도 승인.
   - **오너 결정**: 처리방침이 Sentry 를 "오류 발생 시 전송" 으로 고지하는데 `tracesSampleRate 0.1` 은 오류 없는 세션 10% 도 보낸다. DSN 을 켜기 전에 ① 샘플링 0 으로 두거나 ② 처리방침 문구를 고치고 legalVersion 을 올려 재동의를 받는다.

8. **[Play 출시 차단] `public/.well-known/assetlinks.json`** — `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE` 그대로다. Play Console → 앱 무결성 → **앱 서명 키 인증서 SHA-256** 과 **업로드 키 인증서 SHA-256** 두 값을 배열에 넣고 배포 → `https://nuriholdem.com/.well-known/assetlinks.json` 200 확인 → Digital Asset Links 검증(`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://nuriholdem.com&relation=delegate_permission/common.handle_all_urls`) → 실기기 TWA 에서 주소창이 사라지는지 확인. 값은 추측하지 않았다.

9. **[Play 정책] 카카오 로그인 — 2026-09-10 오너 지시로 코드 삭제.** 로그인 모달·비로그인 랜딩의 카카오 버튼, `loginWithKakao`, `VITE_KAKAO_LOGIN` 스위치, 카카오 전용 오류 문구(KOE205)를 걷어냈다(소셜은 Google 하나). 카카오 **공유·지도**는 로그인과 무관하므로 그대로다. 되살리려면 git 이력에서 가져온다.
   - **오너**: Supabase → Authentication → Providers → Kakao 를 **끄는** 것을 권장(코드에 진입점이 없어도 제공자가 켜져 있으면 OAuth 주소로 직접 가입은 가능). 카카오 개발자 콘솔 앱은 공유·지도 키가 쓰므로 지우지 않는다.
   - 기존 카카오 가입자 **1명**(09-09 가입, `agreed_to_terms=true`·동의 이력 0건)은 앱에서 로그인할 길이 없어진다 — 테스트 계정이면 삭제, 실제 유저면 이메일 계정 안내가 필요하다(오너 확인).

10. **[Play 정책] 홈 배너 폴백 스위치** — 관리자가 배너를 전부 끄면 예전엔 손님에게 코드 내장 기본 배너(지난 8/27 홍보 포함)가 되살아났다. 이제 `app_settings.home_banner_fallback` 이 `'off'` 면 아무것도 안 보인다. 배포와 함께 `'off'` 투입 여부 결정(미설정 = 기존 동작).

## 1. 실기기·외부에서만 검증되는 것 (아직 미검증)

| 흐름 | 왜 여기서 못 했나 | 확인 방법 |
|---|---|---|
| Google 로그인 신규/기존 동일 이메일/취소/로그아웃 후 다른 계정(`prompt=select_account` 추가됨)/TWA 복귀 | 실제 OAuth 제공자 왕복 | 안드로이드 Chrome · Samsung Internet · TWA 에서 각 1회 |
| PortOne(KCP) 본인확인 모바일 리다이렉트 복귀(`redirectUrl` + `identityVerificationId` 1회 소비 추가됨) | 프로덕션 채널 키 + 킬스위치 ON 필요 | 킬스위치 ON 후 PASS 앱 왕복 → 상단 배너 내려감 · 프로필>보안 "본인인증 완료" |
| 매장 카운터 공용 PC: A 로그아웃 → 같은 탭 B 로그인 → 내 정보·쪽지 패널에 A 의 수치·대화가 한 프레임도 안 보이는가 | e2e 는 가짜 세션으로 재현했지만 실제 GoTrue 세션 교체 타이밍은 다르다 | 두 테스트 계정으로 1회 |
| 장부 오버레이(세션 수정·정산 마감·결제 수단)가 Modal 원자로 바뀌며 z-순서·여백·첫 포커스가 달라짐 | 운영주 PC 화면 | 내 매장 → 장부에서 각 오버레이 1회 |
| 클락 TV: 옛 번들이 켜져 있는 TV 가 새 프리셋(black-marble-gold)을 만나면 사진·강조색을 잃을 수 있음 | 배포 창 문제 | 배포 직후 매장 TV 새로고침 안내 |
| 푸시 알림 진입 · 오프라인→온라인 복구 · 화면 회전·safe area · 딥링크 | 실기기 | 내부 테스트 트랙 체크리스트 |
| R2 백업 객체·복구 드릴 · Deployment Checks 실제 차단 | 시크릿·외부 설정 | 위 0-1·0-2 |

## 2. 오너 결정이 필요한 것 (BLOCKED)

- §28 해석: 캘린더 뱅크롤 카드의 **'수입·손익'** 라벨(오너가 직접 요구한 3칸)을 '수익 계열 배제' 카피 원칙에 맞춰 '플러스·마이너스·합계' 로 바꿀지.
- 포스터 **게시 내리기/복원** — `schedules` 에 상태 컬럼이 없다(approved 뿐, 삭제=CASCADE 물리 삭제 + 5초 실행취소). 숨김 컬럼 + RLS + 목록 필터가 필요한 DB 변경이라 결정 후 nuri-migration 으로.
- 이미지 카드 공유(전적·챔피언·프로필카드 PNG 저장 폴백)를 '외부 반출' 로 볼지 — 이번엔 유지.
- 마스터 플랜 FEAT-8(공개 iCal 구독·임베드)·PerfAnalyzer 'CSV 내보내기' 항목이 이번 제거 방침과 충돌 — 플랜/BLOCKED.md 갱신 여부.
- GA Consent Mode(옵트인) 전환 — 현재 처리방침(브라우저 차단 옵트아웃)과 코드가 **일치**하므로 제품·법무 결정 사항.
- legacy anon JWT 로테이션(OBS-5) 순서: 하드코딩 anon JWT 를 새 키로 교체·재배포한 뒤에만 legacy revoke — 어기면 send-push·weekly-email-digest 가 401.

## 2-1. 이번 변경의 게이트 결과 (2026-09-10 새벽, 로컬 Windows · 프로덕션 빌드)

| 게이트 | 결과 |
|---|---|
| `npm run lint` | 0 error · 43 warning (기준선 35 + 새 테스트 파일 2개의 보안 플러그인 오탐 8) |
| `npm test` (vitest) | 81 파일 · **792/792** (기준선 72 파일 · 729) |
| `npm run build` (tsc -b 포함) | 통과 |
| `npm run bundle:budget` | 통과 — 첫 화면 임계 경로 254.5/255 KB gz(기준선 254.2, +0.3 KB) · JS 921.5/1000 · CSS 29.3/32 · 최대 청크 104.7/114 |
| `npm run test:e2e` | 메인 218건: **207 통과 · 11 skip · 0 실패** · 부팅 2 통과 (기준선 173: 163 통과 · 10 skip) |
| `npm audit --omit=dev` | 0건 (dev 포함도 0건 — sharp 0.35.4 · hyperid→uuid ^11.1.1 override) |
| secretlint `**/*` | 0건 |
| Supabase 어드바이저(보안) | ERROR 0 · WARN 3종·INFO 1종(258 findings — anon 실행 SECURITY DEFINER 51 중 변이형은 조회수 카운터 3개, 의도된 허용) |

e2e skip 11건: 자격증명·운영 DB 쓰기 차단(클락 3) · 라이브 데이터 의존(오늘 일정 카드 0건 등 7) · 목킹 세션에서 정산 단계 부재(1). 코드 회귀 아님.

실측(8장, `scratchpad/perf/before.json·after.json` — CPU 4×·1.6Mbps/150ms·cold/warm 3회 중앙값): 홈 콜드 진입은 변경 전후 **동일**(m360 CLS 0.069 / m412 0.111 / pc1366 0.026 · LoAF 4 · 클릭→첫 피드백 57~66ms). 최대 이동 원인은 둘 다 푸터 래퍼 `div.reveal`(0→680px, 기존 항목). `perf.spec` 상한은 5회 실측(CLS 0.190·롱프레임 1·탭전환 0·스크롤 CLS 0.015)에 맞춰 0.35→0.25 · 40→8 · 15→6 · 0.15→0.05 · 20→8 로 강화.

## 3. Play 내부/비공개 테스트 체크리스트

Chrome · Samsung Internet · Android TWA 각각: 화면 회전·safe area(하단 시트·탭바) · 시스템 뒤로가기(모달 한 겹씩) · 딥링크(`/p/<id>` `/s/<slug>` `?post=` `?event=`) · Google OAuth · PortOne 본인확인 · 푸시 알림 탭 진입 → 정확한 게시글/예약/대화 · 비행기 모드 켰다 끄기 → 목록 자동 복구 · 320px 폭 리플로우 · 확대 200%.
