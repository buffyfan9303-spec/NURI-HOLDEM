# NURI HOLDEM — 마스터 실행 계획 (Fable 5 핸드오프)

> **계획 = Opus 4.8 / 실행 = Fable 5(claude-fable-5) 별도 세션.**
> 이 문서는 대화 맥락이 없는 Fable 5 세션이 **그대로 집어 들고 구현**하는 execution-ready 소스입니다.
> 작성 2026-08-25 · 검증 판정 **ship-with-fixes**(근본 재설계 불필요, 아래 확정 수정 반영 후 착수 가능).
> 조사·명세·검증 = 3개 워크플로우 22개 에이전트 종합. 코드 대조 결과 **허위 파일/함수/컬럼 앵커 사실상 0건**, 라이브 DB 무접속·REVOKE/RLS/search_path·framer-motion 금지·Tailwind v3·Icon.tsx 단일소스·keep-alive 애니 규약 일관 준수 확인.

관련 계획: APIS 기능 이식 로드맵(아티팩트 a37511d9) · 5화면 리디자인(아티팩트 b94d3202). 본 문서는 그 **바깥의 인프라·법규·성장·제품 58개 항목**을 다룬다.

---

## 0. 실행 재량 (Execution Latitude) — 먼저 읽어라

**이 계획은 최저선(baseline)이지 상한(ceiling)이 아니다.** Fable 5는 4.8보다 사고적 실행이 강하므로, 실행 중 reasoning으로 **더 나은 접근 — 특히 유저가 보는 UI/UX — 을 발견하면 계획을 맹종하지 말고 개선하고, 계획을 수정하라.** 계획은 살아있는 문서다.

- **개선 권장(계획=출발점):** 레이아웃 · 정보 계층 · 인터랙션 · 마이크로인터랙션 · 카피 · 빈/로딩/에러 상태 · 모바일 인체공학 · 비주얼 디테일. 접근이 더 나으면 데이터 모델·컴포넌트 구조도(검증 통과 전제).
- **개선 대상이 아닌 불변 3가지:**
  1. **하드 제약** — framer-motion 금지(SlidingPill FLIP/CSS)·Icon.tsx PATHS 단일소스·Tailwind v3.4·keep-alive 애니 규칙(index.css:283/384-385)·순수 SVG·새 라이브러리 금지
  2. **법적/안전 가드레일** — 비현금·환전금지(§28)·PIPA·라이브 DB 안전수칙·책임게임·앱스토어 프레이밍
  3. **검증 관문** — `nuri-ship`(lint·vitest·build·e2e·어드바이저) + 착수 전 적대적 자기검증
- **개선 시 규칙:** (a) 무엇을 왜 바꿨는지 계획 대비 **deviation 기록**, (b) 검증 관문 통과. → *"계획을 벗어나는 게 아니라 계획 위에서 더 잘하는 것."*

---

## 1. 마스터 실행 순서 (P1 → P5)

법규·데이터안전(되돌릴 수 없는 것)을 먼저 봉쇄 → 저위험 $0 quick-win → 공유 인프라 → 법적 게이트 성장 → 큰 베팅 제품. 각 Phase는 `nuri-ship` 스모크 통과를 게이트로 하나씩.

### P1 — 법규·데이터안전 게이트 (critical-now / legal-must)
**카드:** OBS-1, OBS-2, OBS-5, OBS-12, LAW-1 ~ LAW-9
백업·복구·JWT 로테이션·법규 준수 텍스트/게이트. **OBS-2 하트비트는 OBS-1 백업의 관측 전제**라 함께. **OBS-5·OBS-12는 두 곳(20260603e:20·20260818e:12)에 박힌 anon JWT를 반드시 동시 처리**(안 하면 push 전면 중단). LAW 9종은 PIPA §37의2·정통망법 2년 재확인(LAW-5 backfill)·게임산업법/전상법 고지 등 라이브 서비스의 법적 게이트. **전 DB 카드는 CI ephemeral DB만, 라이브 무접속.**

### P2 — Quick-win (저위험 · $0)
**카드:** AXP-7, AXP-1, AXP-3, AXP-4, AXP-5, AXP-9, GRW-4, GRW-5, OBS-8, OBS-10, DEV-9
단일 파일/헤더/환경변수 수준 즉효. **AXP-7(Pretendard가 실제로 system-ui로 렌더 중 — grep 0건으로 입증된 유일 성능 critical)** 최상단. **DEV-9는 환경변수 1개(VITE_SENTRY_DSN)만 남은 착수**(오해 정정 필요). GRW-4/5 SEO·OG, OBS-8 킬스위치·OBS-10 무료한도 모니터.

### P3 — 공유 인프라 (CI · 플래그 · 분석 · 관측 · CSP)
**카드:** DEV-1 ~ DEV-8, DEV-10 ~ DEV-13, OBS-3, OBS-4, OBS-6, OBS-7, OBS-9, OBS-11, GRW-1, GRW-2, AXP-2, AXP-6
이후 모든 카드가 딛는 토대. **GRW-1 PostHog는 피처플래그·행동트리거의 선행 의존**이라 P4/P5보다 앞. **OBS-7 CSP 정정은 FEAT-6·FEAT-8이 의존하므로 반드시 선행.**

### P4 — 법적 게이트 성장·라이프사이클
**카드:** GRW-3, GRW-6, AXP-8
동의·계측 전제가 갖춰진 뒤 굴리는 알림톡/이메일. **GRW-3·GRW-6은 P1 마케팅 동의(LAW-5)와 P3 PostHog를 동시 전제.** AXP-8 오프라인 아웃박스는 **콘텐츠성 쓰기만 큐잉(장부·이용권·정산·checkIn 제외).**

### P5 — 큰 베팅 제품기능 (big-bet)
**카드:** FEAT-1 ~ FEAT-9
가장 위험·고비용이라 안정된 법규·인프라 위에서 마지막. **FEAT-6/8은 P3 OBS-7 CSP·전역 XFO 정정에 의존.** FEAT-4/5/7/9는 재사용 앵커가 전부 실재해 재추론 없이 착수 가능.

---

## 2. ⚠️ 검증 확정 수정 16건 — 아래 카드보다 **우선**한다

Fable 5는 해당 카드를 실행하기 전 이 수정을 먼저 적용하라. (🔴 critical / 🟠 major / 🟡 minor)

| # | 카드 | 심각도 | 무엇이 틀렸나 → 어떻게 고치나 |
|---|---|---|---|
| 1 | **OBS-5** | 🔴 | 하드코딩 anon JWT가 `20260818e:12` **뿐 아니라 `20260603e:20`(notifications AFTER INSERT 트리거, 고빈도)에도** 존재 → legacy 키 revoke 시 push 전면 중단. **두 net.http_post 사이트를 `secret_settings.EDGE_INVOKE_KEY`로 모두 교체 확인 후에만 legacy revoke.** |
| 2 | **FEAT-6** | 🔴 | enforced CSP에 `frame-src` 화이트리스트 신설 시 무제한 허용 중인 **PortOne·Kakao·AdSense iframe 차단** 위험. **기존 report-only 출처(googlesyndication·doubleclick·google·kakao·portone) 전체 + youtube 포함**, Report-Only 1주 관찰 후 enforced 전환. enforced에 script/connect-src 신설 금지. |
| 3 | **OBS-7** | 🟠 | 실제 enforced CSP는 최소 지시자뿐, 전체 allowlist는 **Report-Only 5개 블록**(카드는 3개로 오인). enforced에 script-src 추가하면 GA/카카오/PortOne 스크립트가 새로 차단. **Turnstile 도메인은 5개 블록 전부에 추가, enforced엔 신설 금지.** OBS-7·FEAT-6·FEAT-8을 단일 CSP 변경으로 조율. |
| 4 | **FEAT-8** | 🟠 | `vercel.json:30-32`의 `X-Frame-Options: SAMEORIGIN`이 전역(`/(.*)`)이라 임베드 경로에도 붙어 3rd-party 프레이밍 차단. **임베드 경로 전용 규칙으로 XFO 제거 + frame-ancestors 완화**(둘 다 경로 한정 오버라이드). |
| 5 | **OBS-1** | 🟠 | pg_dump 대상을 pooler **6543(transaction 모드)**로 지정 → 세션 필요해 실패. **세션 풀러 5432 또는 직접 연결로 정정.** 복구 대조 테이블명도 `ledger`가 아니라 `ledger_sessions·ledger_players·ledger_buyins`. |
| 6 | **OBS-3** | 🟠 | `/api/health` 200을 @boot e2e로 확인 불가(vite preview는 정적 dist만, api/*.js 미실행). **vitest 핸들러 직접 호출 또는 프로덕션 URL 스모크로 이동**, @boot 200 단정 제거. |
| 7 | **GRW-1** | 🟠 | 탭 전환이 URL을 안 바꿔 `capture_pageview:'history_change'`론 pageview 0건(자기모순). **activeTab 변경 시 명시적 `posthog.capture('$pageview')`(또는 tab_view)**, '수동 capture 불필요' 철회, 딥링크는 cleaned URL에서 1회만. |
| 8 | **GRW-2** | 🟠 | `NextResponse.rewrite` 지시했으나 **Next.js 의존성 없음(Vite)**. **`@vercel/edge`로 작성**(default export + `config={matcher:'/'}`), 봇+파라미터에만 프리렌더 함수 실행(미들웨어 자체는 홈 요청마다 엣지 호출 소비). |
| 9 | **GRW-3** | 🟠 | `profiles.phone`은 **이미 존재하는 보호 컬럼**(verify-identity로만 채워짐, guard 트리거 `20260623n:22`가 클라 UPDATE 차단). **'phone 신설' 전제 삭제, verified 사용자 기존 phone 재사용.** opt_in/opt_out만 클라 갱신(같은 UPDATE에 phone 미혼합). |
| 10 | **FEAT-1** | 🟠 | 앵커 `listMyPlayHistory` 부재 → 실제는 **`myPlayHistory()`(vouchers.ts:233)**. 프리필 소스가 금액(totalAmount·prize 만원)을 담아 §28 가드레일과 충돌 → **금액 필드 제외, 등수·입상횟수·비현금 지표만.** |
| 11 | **FEAT-2** | 🟠 | Realtime 예산 근거 '탭 숨기면 채널 해제'가 **실재하지 않음**(subscribeRunningClocks는 상시 구독). **'기존 게이트 재사용'을 '신규 구현'으로 정정** — active&&레일열림에만 open, cleanup에서 removeChannel. |
| 12 | **AXP-4** | 🟠 | `isIOS()`가 **이미 `calendar.ts:128`에 존재**(ScheduleDetailModal 사용). 신규 platform.ts 중복 금지 → **재사용**, isStandalone/iosVersion만 추가, iPadOS(Mac+ontouchend) 감지 유지. 라인 앵커 enablePush 726·pushNudge 649로 정정. |
| 13 | **LAW-5** | 🟠 | 2년 재확인이 레거시 동의자(`marketing_agreed_at` NULL)에 미작동 → 정통망법 §62조의3 의무 영구 미이행. **backfill 추가:** `update profiles set marketing_agreed_at = coalesce(terms_agreed_at, created_at) where agreed_to_marketing is true and marketing_agreed_at is null`. |
| 14 | **DEV-1** | 🟠 | vanilla `postgres:17` CI 컨테이너로는 `20260603e:7 create extension pg_net`을 무해화 못 함(컨트롤 파일 없어 replay 에러). **pg_cron·pg_net 번들 이미지 사용 또는 replay 프리스텝에서 해당 DDL 치환/주석.** |
| 15 | **OBS-12** | 🟡 | gitleaks allowlist를 '20260818e의 JWT'로만 한정하면 `20260603e:20`의 동일 JWT를 히스토리 스캔이 탐지 → DoD 깨짐. **allowlist를 값 정규식으로 등록(두 occurrence 커버).** service_role 패턴은 절대 예외 금지. |
| 16 | **DEV-9** | 🟡 | `@sentry/react`는 **이미 설치·initMonitoring 호출 완비**. 유일 블로커는 `VITE_SENTRY_DSN` 미설정뿐 → **'주석해제/npm i' 문구 제거, 'DSN 환경변수만 설정하면 활성'으로 정정.** OBS-4와 단일 DSN으로 조율(이중 초기화 방지). |

---

## 3. 교차 주의 (여러 카드에 걸침 — 한 작업으로 조율)

1. **하드코딩 anon JWT 단일 값**이 `20260603e:20`(트리거)·`20260818e:12`(cron) 두 곳 → OBS-5·OBS-12·DEV-5가 같은 자산. `secret_settings.EDGE_INVOKE_KEY`로 두 사이트 교체 확인 후에만 legacy revoke, allowlist는 값 정규식(service_role 절대 예외 금지).
2. **vercel.json 전역 보안 헤더**는 OBS-7·FEAT-6·FEAT-8 공유 단일 자산. enforced=최소 지시자, allowlist=Report-Only 5블록, XFO=전역. 세 카드를 **단일 CSP/헤더 변경으로 묶어** 처리(enforced에 script/connect-src 신설 금지, frame-src 신설 시 기존 출처 보존, 임베드 경로만 XFO 제거+frame-ancestors 완화).
3. **§28 금액 미표시**가 FEAT-1·FEAT-3·LAW-4·vouchers 관통. 프리필·랭킹·머니리스트 어디서도 만원 금액 저장/표시 금지, 등수·입상횟수·비현금 점수만. FEAT-3 머니리스트는 산식(placementPoints vs 만원합) 확정.
4. **profiles.phone**은 verify-identity 전용 guard 보호컬럼(20260623n). phone 쓰는 어떤 카드도 클라 직접 UPDATE 불가 → SECURITY DEFINER RPC/verify-identity 경로, opt_in/opt_out만 클라(같은 UPDATE에 phone 미혼합).
5. **PostHog(GRW-1)는 피처플래그·행동트리거의 하드 의존** → P3에서 먼저 세우고 P4/P5가 소비. 계측은 main.tsx 유휴 주입(tpAfterIdle) 경로를 훼손하지 않음(부팅 레이스 교훈).
6. **마케팅 동의는 성장의 법적 게이트:** LAW-5 2년 재확인 backfill + agreed_to_marketing + 야간(21-08) 금지 + 수신거부가 GRW-3·GRW-6 발송의 선행 조건.
7. **Sentry:** OBS-4 스캐폴드 + DEV-9(DSN)가 같은 대상. 이미 설치·호출 완비 → 이중 초기화 금지, VITE_SENTRY_DSN 한 지점으로 수렴.
8. **isIOS()** calendar.ts:128 재사용(AXP-4), iPadOS 감지 유지 — Icon.tsx PATHS와 같은 DRY 원칙.
9. **keep-alive 진입 애니 무효화**(index.css:283) — 탭 내부 새 진입 애니 클래스마다 목록 추가. 새 전환은 SlidingPill/CSS(framer-motion 금지) 재확인.
10. **CI replay·백업(DEV-1·OBS-6·OBS-1)은 전부 ephemeral CI DB/세션 URL만, 라이브(idsxiqspecrucvfvtgbw) 무접속.** supazod↔zod4(DEV-4)·Vite8↔Ladle(DEV-13) 호환은 import 전 package.json 선확인.

---

## 4. Fable 5 착수 방법 (핸드오프)

1. 메모리 `[[model-handoff-execution-ready]]`·`[[apis-feature-port-plan]]`·`[[nuri-holdem-launch-state]]`가 자동 상기됨 — execution-ready 6원칙 + 실행 재량 + 검증 관문.
2. **P1부터 순서대로.** 한 카드 = 한 관심사 = 한 커밋. 카드 실행 전 위 §2의 해당 수정을 먼저 적용.
3. **스킬 사용:** UI 작업은 `nuri-ui`로 시작 → DB는 `nuri-migration` → 마무리는 `nuri-ship` 게이트.
4. **가드 훅**(`.claude/hooks/nuri-guard.mjs`)이 framer-motion·새 아이콘 라이브러리·Tailwind v4 import를 차단한다.
5. **실행 재량(§0)** 적용 — 특히 유저가 보는 UI/UX는 이 카드를 출발점으로 삼아 더 낫게, deviation 기록.
6. **오너 결정 대기 항목**(R2 vs B2 · Healthchecks/UptimeRobot 계정 · PostHog/Sentry DSN · 위치정보법 신고 vs 위치 미사용 · 알림톡 SOLAPI/SENS 등)은 각 카드 dependencies에 표기 — 미해결 시 해당 카드 착수 보류.

---

## 5. 58개 실행 카드 전문

> 각 카드는 6영역 조사·명세 워크플로우 산출이며, §2 확정 수정이 우선한다. 필드: 우선순위 · effort · impact · 비용 · 파일 앵커 · 데이터 모델 · 접근 · DoD · 의존성 · 가드레일.


### 영역 · 관측성·운영 안전망 (OBS)

#### OBS-1 — 무료티어 DB·스토리지 백업 자동화 + 분기 복구 리허설
`critical-now` · effort **M** · impact **high** · 비용: 무료 (GitHub Actions 2,000분/월 · Cloudflare R2 10GB 또는 Backblaze B2 10GB 무료 티어 내). pg_dump 대상 DB 20.9MB → 실행 수초, 산출물 수 MB.

- **파일 앵커:** 신규 .github/workflows/backup.yml (GitHub Actions 스케줄, cron '0 18 * * *' = KST 03:00). 신규 scripts/backup-db.mjs (Supabase pooler 접속 → pg_dump --format=custom, package.json devDep 'supabase ^2.102.0' 또는 postgres client 재사용). 신규 scripts/backup-storage.mjs (Storage API로 버킷 community_images·verifications·포스터·장터 객체 미러). 신규 docs/ops/backup-restore-runbook.md. 참조: docs/ops/supabase-plan-policy.md(Free는 자동백업 없음, Pro만 7일). Edge 런타임은 pg_dump 바이너리 불가 → 반드시 CI 러너에서 실행. 프로젝트 ref idsxiqspecrucvfvtgbw, region ap-northeast-2, PG17.
- **데이터 모델:** none (백업 산출물은 외부 R2/B2). 선택: public.backup_runs(id uuid pk default gen_random_uuid(), kind text, ok bool, bytes bigint, at timestamptz default now())를 CREATE TABLE IF NOT EXISTS + ALTER TABLE ENABLE RLS + REVOKE ALL FROM anon,authenticated (service_role/admin만). 성공 시 OBS-2 Healthchecks ping.
- **접근:** 1) GitHub Secrets 등록: SUPABASE_DB_URL(pooler 6543 connection string, sslmode=require), R2_ACCESS_KEY/R2_SECRET/R2_BUCKET(또는 B2 S3-compat). 2) backup.yml: 매일 03:00 KST + workflow_dispatch. 3) scripts/backup-db.mjs: pg_dump -Fc → gzip → 파일명 nuri-YYYYMMDD.dump.gz → aws-sdk S3 PutObject(R2 endpoint). 4) scripts/backup-storage.mjs: supabase-js service_role로 각 버킷 list+download → S3 미러(증분: ETag 비교). 5) R2 라이프사이클: 30일 일간, 12주 주간 보존. 6) 성공 후 Healthchecks ping(OBS-2). 7) 분기 1회 복구 리허설: 최신 dump를 Supabase 브랜치/로컬 supabase start에 pg_restore, 행수·주요 RPC 스모크, docs 러너북에 결과 기록.
- **DoD:** ① backup.yml 수동 실행 시 R2에 .dump.gz + 스토리지 미러 생성 확인. ② pg_restore가 로컬/브랜치에서 오류 없이 복원, schedules·profiles·ledger 행수 원본과 일치. ③ 실패 시 Actions 실패 + Healthchecks 알림 발화. ④ 러너북에 복구 절차·최근 리허설 일자 기재. 테스트: Playwright 불필요. CI 검증은 backup.yml의 dry-run job(pg_dump --schema-only)로 접속·권한 확인. 분기 리허설 체크리스트를 docs에 고정.
- **의존성:** 오너 결정: R2 vs B2 선택 + 버킷 생성 + 크레덴셜 발급. OBS-2(Healthchecks) 선행 시 ping 연동. OBS-5(키 로테이션)와 SUPABASE_DB_URL 공유.
- **가드레일:** 백업 크레덴셜은 GitHub Secrets에만(리포 커밋 금지, .gitignore가 .env* 제외 유지). 백업 산출물에 PII(본인인증 CI·전화·실명) 포함 → R2/B2 버킷 비공개 + 저장 암호화(SSE) 필수, 접근 최소권한. Egress: pg_dump는 pooler egress 유발하나 21MB·야간 1회 → 무료 5GB에 무의미. 앱 UI 변경 없음(framer-motion/Icon.tsx/keep-alive 무관). 법적: 개인정보 국외이전 고지 필요 시 R2 리전(APAC) 선택 검토.

#### OBS-2 — pg_cron/Edge 잡 dead-man's-switch 하트비트 (Healthchecks.io)
`quick-win` · effort **S** · impact **high** · 비용: 무료 (Healthchecks.io 20 checks 무료). net.http_post 호출은 잡당 1회 → egress 무시 가능.

- **파일 앵커:** 신규 supabase/migrations/2026XXXX_cron_heartbeats.sql. 기존 pg_net(net.http_post) 재사용 — 이미 20260818e_weekly_email_digest_cron.sql·20260603e_auto_push_on_notification.sql에서 사용 중. 대상 잡(live 6+개): owner_posts_expire, weekly-venue-reports, tournament-reminders, expire-buyin-requests, end-expired-seasons, purge-client-errors, weekly-email-digest, season-deadline-notify, weekly-follow-digest, free-plan-limit-check. secret_settings(20260818d)에 HC ping base URL 저장.
- **데이터 모델:** 기존 public.secret_settings 재사용: INSERT ... (key,value) VALUES ('HC_PING_BASE','https://hc-ping.com/<uuid>') ON CONFLICT DO NOTHING. 신규 함수 public._hc_ping(p_slug text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' — secret_settings에서 base 읽어 net.http_post(base||'/'||p_slug). REVOKE EXECUTE ON FUNCTION public._hc_ping(text) FROM PUBLIC; GRANT EXECUTE TO service_role. (cron은 postgres 소유로 RLS 우회 → SECURITY DEFINER로 안전 읽기.)
- **접근:** 1) Healthchecks.io 프로젝트 생성, 각 잡별 check + 예상 주기/grace 설정(예: tournament-reminders 10분 주기·grace 20분). 2) 마이그레이션에서 _hc_ping 정의 + HC_PING_BASE는 라이브에만 수동 INSERT(리포 커밋 금지, secret_settings 관행). 3) 각 cron.schedule 본문 끝에 `; perform public._hc_ping('job-slug');` 추가하도록 재-schedule(기존 do$$ perform cron.unschedule(...) 패턴 유지). 4) Edge 크론(weekly-email-digest)은 함수 성공 반환 직전 ping. 5) HC에서 Slack/이메일 알림 채널 연결.
- **DoD:** ① 각 잡 성공 시 HC 대시보드 last-ping 갱신. ② 잡을 일부러 unschedule → grace 경과 후 HC 알림 발화. ③ secret_settings에 HC_PING_BASE 없으면 _hc_ping 무동작(잡 실패로 전이 금지). 테스트: vitest 불필요. 수동: `select public._hc_ping('tournament-reminders')` 실행 후 HC ping 확인 + `select cron.job_run_details` 최근 성공 확인.
- **의존성:** Healthchecks.io 계정(오너). secret_settings(20260818d) 존재 — 충족됨. OBS-1 백업 잡도 동일 HC 프로젝트에 check 추가.
- **가드레일:** 라이브 DB 안전수칙: 함수 CREATE OR REPLACE + REVOKE FROM PUBLIC + search_path 고정 + SECURITY DEFINER. ping URL은 secret(누구나 URL로 ping 가능) → secret_settings(정책 0개)만, app_settings(공개읽기) 금지. Realtime 무관. UI 변경 없음. net.http_post 타임아웃 짧게(5s) 설정해 잡 지연 방지.

#### OBS-3 — /api/health 엔드포인트 + 외부 업타임 (UptimeRobot)
`quick-win` · effort **S** · impact **high** · 비용: 무료 (UptimeRobot 50 monitors·5분 간격 무료 · Vercel Hobby 함수 무료). /api/health는 초경량 → Supabase egress 극소.

- **파일 앵커:** 신규 api/health.js (Vercel 서버리스, Node 런타임 — 기존 api/s.js·api/p.js와 동일 패턴). 선택: vercel.json rewrites에 명시 불필요(/api/health 기본 동작). 신규 RPC는 supabase/migrations로. UptimeRobot는 https://nuriholdem.com/ 루트 + /api/health 2종 모니터.
- **데이터 모델:** 신규 마이그레이션 2026XXXX_healthz.sql: CREATE OR REPLACE FUNCTION public.healthz() RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$ select true $$; REVOKE ALL ON FUNCTION public.healthz() FROM PUBLIC; GRANT EXECUTE TO anon, authenticated. (무거운 free_plan_usage 재사용 금지 — egress·부하 유발.)
- **접근:** 1) api/health.js: process.env.VITE_SUPABASE_URL/ANON로 healthz RPC 또는 rest HEAD 1건 호출(타임아웃 3s). 2) 성공 → 200 {ok:true, db:'up', ts}. 실패/타임아웃 → 503 {ok:false, db:'down'}. 3) Cache-Control: no-store. 4) UptimeRobot에 두 모니터 등록 + 다운 시 이메일/Slack. 5) 응답에 내부 상세(스택·버전) 노출 금지.
- **DoD:** ① curl /api/health → 정상 시 200 ok:true. ② Supabase 일시 차단 시 503(사이트 다운 오탐 방지 위해 root 모니터와 분리). ③ UptimeRobot 다운 알림 수신. 테스트: e2e/에 @boot 태그 스모크로 /api/health 200 확인 스펙 추가(playwright.config 기존 활용) — CI에서 VITE_SUPABASE_* 없으면 skip.
- **의존성:** UptimeRobot 계정(오너). OBS-11 상태페이지가 이 모니터를 소스로 사용.
- **가드레일:** health는 인증 불필요 공개 → 절대 PII·내부 지표·버전 문자열 노출 금지(정보수집 표면 최소화). Supabase 장애가 곧 사이트 다운은 아님 → 별도 판정, 503은 DB만. Egress: RPC 1건·5분 간격 → 월 egress 무시. UI/애니 무관. api/health.js는 메인 앱과 격리(api/s.js 주석 관행).

#### OBS-4 — Sentry 소스맵 업로드 (@sentry/vite-plugin, sourcemap:'hidden')
`quick-win` · effort **S** · impact **medium** · 비용: 무료 (Sentry Developer 무료 티어 5k errors/월 · @sentry/vite-plugin 오픈소스). tracesSampleRate 0.1 이미 설정 → 쿼터 여유.

- **파일 앵커:** vite.config.ts (build 블록에 sentryVitePlugin 추가 + build.sourcemap='hidden'). package.json devDependencies에 '@sentry/vite-plugin'(현재 미설치 — node_modules 확인 완료). 기존 src/lib/monitoring.ts(Sentry init 스캐폴드, @sentry/react ^10.58.0 설치됨) + src/main.tsx:23 initMonitoring() 재사용. CI/Vercel env: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT. CSP는 vercel.json에 이미 https://*.sentry.io connect-src 허용.
- **데이터 모델:** none.
- **접근:** 1) npm i -D @sentry/vite-plugin. 2) vite.config.ts: build.sourcemap='hidden', plugins에 process.env.SENTRY_AUTH_TOKEN 있을 때만 sentryVitePlugin({org,project,authToken,sourcemaps:{filesToDeleteAfterUpload:['./dist/**/*.map']},release:{name: git sha}}) 추가(토큰 없으면 로컬 빌드 무영향). 3) Vercel 프로젝트 env에 SENTRY_* 등록 → 배포 빌드가 소스맵 생성·업로드·삭제. 4) monitoring.ts의 release를 동일 sha로 맞춤. 5) 릴리즈-소스맵 매칭 검증.
- **DoD:** ① Vercel 배포 후 Sentry에 릴리즈+아티팩트(소스맵) 업로드 확인. ② 프로덕션 에러의 스택이 원본 TS 라인으로 해석됨. ③ dist에 .map 미배포(hidden + filesToDeleteAfterUpload). ④ 토큰 미설정 로컬 `npm run build` 정상. 테스트: CI build 스텝(ci.yml:44)에서 토큰 없이도 빌드 성공 회귀 확인.
- **의존성:** Sentry 프로젝트 + VITE_SENTRY_DSN(런타임) + SENTRY_AUTH_TOKEN(빌드) 발급(오너). OBS-9 로그와 상호보완.
- **가드레일:** 소스맵은 hidden(//# sourceMappingURL 주석 제거) + 업로드 후 삭제 → 공개 배포에 원본 노출 금지. 스택 6.0 typescript·vite 8·React 19 조합 유지(스택 변경 금지). tracesSampleRate 0.1/replays 0 유지(비용·프라이버시). 번들 비대화 없음(@sentry/react는 이미 동적 import 청크). Tailwind v3·framer-motion 금지 무관.

#### OBS-5 — 신규 publishable/secret 키 무중단 로테이션 런북
`nice-to-have` · effort **M** · impact **medium** · 비용: 무료 (Supabase 키 발급 무료). 다운타임 0 목표.

- **파일 앵커:** .env.example(VITE_SUPABASE_ANON_KEY 등 키 목록). Vercel env(VITE_SUPABASE_URL/ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). Edge 함수 7종(supabase/functions/*/index.ts)은 Deno.env SUPABASE_SERVICE_ROLE_KEY 자동주입. ⚠ 하드코딩된 anon JWT: supabase/migrations/20260818e_weekly_email_digest_cron.sql:12(net.http_post Authorization Bearer) — 로테이션 시 재-schedule 필요. 신규 docs/ops/key-rotation-runbook.md. api/s.js:35·api/p.js:37(process.env로 읽음 — 안전).
- **데이터 모델:** none. 단, cron에 박힌 anon JWT 제거 개선안: secret_settings에 EDGE_INVOKE_KEY 저장 + cron 본문에서 함수로 헤더 구성(하드코딩 JWT 대신). 신규 마이그레이션으로 해당 cron 재-schedule(do$$ cron.unschedule ... $$ 패턴).
- **접근:** 1) Supabase 신규 API 키 포맷(sb_publishable_… / sb_secret_…) 발급 — 기존 legacy anon/service_role와 병존. 2) 무중단 순서: (a) 신규 키 생성 → (b) Vercel env에 신규 publishable를 VITE_SUPABASE_ANON_KEY로 교체 + service_role→secret 교체 → (c) 재배포 → (d) /api/health·핵심 RPC 스모크 → (e) cron 하드코딩 JWT를 신규 키로 재-schedule → (f) 24~48h 관찰 후 legacy 키 revoke. 3) 롤백: legacy 키 유지 상태로 env만 되돌림. 4) 런북에 순서·검증·롤백 고정.
- **DoD:** ① 런북 절차대로 스테이징(Supabase 브랜치)에서 리허설 완료. ② 로테이션 중 사용자 세션·결제(PortOne)·본인인증 무중단 확인. ③ cron net.http_post가 신규 키로 성공(cron.job_run_details). ④ legacy 키 revoke 후에도 앱 정상. 테스트: 로테이션 후 npm run test:e2e(인증 스모크 포함, ci.yml:55) 통과.
- **의존성:** OBS-1(SUPABASE_DB_URL 공유), OBS-12(로테이션은 유출 대응의 마지막 단계). 오너: legacy 키 revoke 타이밍 결정.
- **가드레일:** 법적/보안 최우선(PII 서비스): service_role/secret 키는 절대 리포 커밋 금지 — .gitignore .env* 유지. anon/publishable는 공개 설계(클라 노출 정상)라 유출 아님. 다운타임 0: 반드시 병존→검증→revoke 순서, 역순 금지. cron JWT 교체 누락이 가장 흔한 사고점 → 체크리스트 강제. UI/애니 무관.

#### OBS-6 — Squawk CI 마이그레이션 린트 (위험 스키마 차단)
`quick-win` · effort **S** · impact **high** · 비용: 무료 (Squawk 오픈소스 · GitHub Actions 무료 분).

- **파일 앵커:** .github/workflows/ci.yml(신규 job 'migration-lint' 추가, 기존 build-and-e2e와 병렬). 대상 supabase/migrations/*.sql(97개, PR 변경분만). 신규 .squawk.toml(룰 설정). 참조 관행: 기존 마이그레이션이 이미 IF NOT EXISTS·REVOKE FROM PUBLIC·DROP POLICY IF EXISTS·SET search_path 사용(20260611a 등) → Squawk 룰과 정합.
- **데이터 모델:** none (CI 정적 분석).
- **접근:** 1) migration-lint job: actions/checkout → git diff origin/main...HEAD --name-only로 변경된 supabase/migrations/*.sql 추출. 2) sbdchd/squawk-action 또는 `npx squawk --config .squawk.toml <changed files>`. 3) .squawk.toml: 위험 룰 활성(prefer-robust-stmts, adding-not-nullable-field, disallowed-unique-constraint, ban-drop-column, require-concurrent-index-creation, adding-field-with-default). 4) 초기엔 advisory(continue-on-error) → 1~2 PR 관찰 후 required check로 승격. 5) main 브랜치 보호규칙에 status check 추가(ci.yml 주석의 게이트 방식과 동일).
- **DoD:** ① 위험 마이그레이션(예: non-concurrent CREATE INDEX on 큰 테이블, DROP COLUMN) PR이 Squawk에서 경고/실패. ② 기존 관행(IF NOT EXISTS 등) 준수 마이그레이션은 통과. ③ 변경 없는 PR은 lint 스킵. 테스트: 샘플 위험 SQL로 job 실패 재현 + 정상 SQL 통과 확인.
- **의존성:** 없음(독립). 오너: required check 승격 시점 결정 + main 브랜치 보호규칙.
- **가드레일:** 라이브 DB 보호가 목적 — 락 유발(ACCESS EXCLUSIVE), 볼륨 큰 테이블 rewrite 차단. 프로젝트 관행(REVOKE FROM PUBLIC·search_path·IS DISTINCT FROM)과 충돌하는 오탐은 .squawk.toml exclude로 조정, 강제화 전 advisory 기간 필수. 앱 코드/UI 무관. CI만 변경(배포·런타임 영향 0).

#### OBS-7 — 고위험 write에 Cloudflare Turnstile + Vercel Attack Challenge Mode
`big-bet` · effort **L** · impact **high** · 비용: 무료 (Turnstile 무제한 무료 · Vercel Attack Challenge Mode는 Hobby에서 수동 토글 가능).

- **파일 앵커:** supabase/config.toml:213-216([auth.captcha] provider='turnstile' 주석 해제 → 가입/로그인 봇 차단). Edge: supabase/functions/verify-identity/index.ts(본인인증 — siteverify 추가), send-push·notify-sanction는 대상 아님. 신규 client Turnstile 위젯(순수 스크립트 로드, 새 라이브러리 설치 금지). 고위험 RPC: check_in(20260611a), redeem_voucher(20260816a), 예약/장부 RPC. Icon.tsx PATHS(방패 아이콘 1줄 추가 필요 시). secret_settings에 TURNSTILE_SECRET. vercel.json CSP 갱신.
- **데이터 모델:** 기존 secret_settings 재사용: INSERT (key,value) VALUES ('TURNSTILE_SECRET','…') — 라이브만, 리포 커밋 금지. Supabase Auth captcha는 config.toml로 활성(스키마 변경 없음). 앱 자체 고위험 RPC 보호는 Edge 프록시 또는 RPC 인자로 토큰 전달 후 siteverify.
- **접근:** 1) Cloudflare Turnstile 사이트키/시크릿 발급. 2) config.toml [auth.captcha] enabled/provider=turnstile → 가입·로그인에 위젯(supabase-js signUp options.captchaToken). 3) 본인인증(verify-identity): 요청 바디에 turnstile_token 추가 → Edge에서 challenges.cloudflare.com/turnstile/v0/siteverify(secret from secret_settings) 검증 후 진행, 실패 403. 4) 순수 script 로드 유틸(new lib 금지) + 위젯 렌더(Tailwind v3 클래스). 5) vercel.json CSP: script-src/frame-src에 https://challenges.cloudflare.com, connect-src 동일 추가(2군데 CSP-Report-Only 블록 + 실 CSP). 6) Vercel Attack Challenge Mode: 공격 시 대시보드 토글하는 런북(docs/ops).
- **DoD:** ① 봇/무토큰 가입·본인인증 요청 차단(403), 정상 사용자 통과. ② Edge siteverify 실패 경로 반환코드 검증. ③ CSP 갱신 후 위젯 로드·앱 정상(콘솔 CSP 위반 0). ④ Attack Challenge Mode 토글 런북 존재. 테스트: e2e에 가입 플로우 Turnstile 위젯 렌더 확인(테스트 키 사용). Edge는 siteverify mock 단위 확인.
- **의존성:** Cloudflare 계정(오너) + Turnstile 키. OBS-8(공격 시 킬스위치 병행). CSP 변경은 결제(PortOne)·카카오맵 도메인 유지 주의.
- **가드레일:** CSP에 challenges.cloudflare.com 정확히 추가하되 기존 PortOne/카카오/구글 도메인 보존(vercel.json 3개 CSP 블록 모두). 새 애니 라이브러리·framer-motion 금지 — 위젯은 CSS/순수 스크립트. Icon 필요 시 Icon.tsx PATHS 1줄(라이브러리 설치 금지). Realtime 200연결·egress 무관. 법적: Turnstile는 개인정보 최소수집(privacy-friendly) — 본인인증 PII 흐름과 분리 유지.

#### OBS-8 — 피처 플래그 / 글로벌 킬스위치 (native app_settings)
`quick-win` · effort **M** · impact **high** · 비용: 무료 (기존 app_settings 재사용 — 외부 SaaS·egress 증가 0). PostHog/Vercel Flags는 선택적 대안.

- **파일 앵커:** 기존 src/api/settings.ts(getAppSetting/setAppSetting, set_app_setting RPC) 확장. 기존 public.app_settings(20260611b — 공개읽기·admin쓰기 RLS 이미 정합). 신규 src/lib/flags.ts(부팅 시 로드+캐시). src/App.tsx(TabId 게이팅: 'market'/'community'/'tools' 등 기능 토글). 관리자 설정 UI(StoreDashboard.tsx/관리자 화면). Icon.tsx PATHS. ⚠ 기존 src/components/features/KillSwitch.tsx는 '매장 영구삭제'용(무관) — 본 카드는 별개의 기능 플래그.
- **데이터 모델:** 기존 public.app_settings 재사용(스키마 추가 없음): INSERT (key,value) VALUES ('flag_marketplace','on'),('flag_live_wall','on'),('flag_community','on'),('flag_tools','on') ON CONFLICT (key) DO NOTHING. RLS·set_app_setting RPC 그대로(공개읽기/admin쓰기). 새 테이블 불필요.
- **접근:** 1) flags.ts: 부팅 시 app_settings에서 flag_* 일괄 로드(1쿼리) → 메모리 캐시 + 기본값 'on'(fail-open, 단 위험기능은 fail-closed 선택). 2) App.tsx tab 렌더/네비에서 flag 확인해 기능 숨김·비활성. 3) 관리자 설정 화면에 토글(setAppSetting). 4) 즉시성: Realtime app_settings 구독(선택) 또는 '변경 시 새로고침 안내' — keep-alive 탭 특성상 런타임 전파 주의. 5) 대안 문서화: PostHog(무료 1M events)·Vercel Flags SDK — 단 egress/3rd-party 증가로 native 우선 권장.
- **DoD:** ① 관리자가 flag_marketplace='off' → 재접속 시 장터 탭 비노출, 배포 없이 즉시. ② 기본값 없거나 로드 실패 시 안전 동작(핵심 탭 browse 항상 노출). ③ 캐시로 추가 쿼리 없음. 테스트: vitest로 flags 파서(on/off/누락) 단위 + e2e로 off 시 탭 미노출 스모크.
- **의존성:** 없음(app_settings·settings.ts 기존). OBS-7(공격 시 기능 차단 병행), OBS-10(비용 급증 시 무거운 기능 킬).
- **가드레일:** keep-alive 구조(App.tsx visitedTabs Set + display 토글) — 플래그 변경 런타임 반영엔 Realtime 구독 또는 리로드 필요(문서화). 진입 애니 무효화 규칙(index.css:283 .tab-pane :is(.animate-*)) 충돌 없음 — 탭 자체 표시/숨김만. framer-motion 금지·SlidingPill 패턴 유지. Tailwind v3. Icon 필요 시 PATHS 1줄. Realtime 채널 추가 시 200연결 예산 고려(app_settings 1채널·저빈도).

#### OBS-9 — 구조적 로그 파이프라인 (Axiom, Hobby 무료)
`nice-to-have` · effort **M** · impact **medium** · 비용: 무료 (Axiom 무료 0.5GB/월·30일 보존 · Vercel Log Drain 연동). PII 마스킹 시 볼륨 소.

- **파일 앵커:** api/health.js·api/s.js·api/p.js(구조적 로그 추가). 신규 api/_axiom.js(경량 전송 헬퍼, @axiomhq/js 또는 fetch). Edge 함수 7종(supabase/functions/*/index.ts)은 선택적 이벤트 전송. 기존 client_errors(20260611a)·src/lib/errorLog.ts는 인앱 관리자 뷰로 유지(중복 아닌 보완). Vercel↔Axiom은 대시보드 Log Drain 통합.
- **데이터 모델:** none (외부 로그 스토어). client_errors 테이블 스키마 변경 없음.
- **접근:** 1) Axiom 데이터셋 'nuri-prod' 생성 + AXIOM_TOKEN(Vercel env). 2) Vercel Axiom 통합으로 함수/엣지 로그 자동 드레인. 3) api/*.js에 구조적 로그(JSON: {evt, code, ms, status}) — _axiom.js가 비동기 전송(실패 무시, 앱 영향 0 — errorLog.ts 관행). 4) Edge 함수 실패 시 구조적 이벤트 전송(secret_settings에 AXIOM_TOKEN). 5) Axiom 대시보드: 5xx율·본인인증 실패율·크론 실패 쿼리 + 임계 알림. 6) 보존 30일 내 관리.
- **DoD:** ① Vercel 함수 로그가 Axiom에서 검색됨. ② 5xx·본인인증 실패 이벤트 쿼리 가능. ③ 전송 실패해도 요청 정상 응답(비차단). ④ 로그에 PII 없음(마스킹 검증). 테스트: _axiom.js에 PII 마스킹 단위(vitest) — CI/전화/실명/이메일 필드 제거 확인.
- **의존성:** Axiom 계정(오너). OBS-4(Sentry는 에러 상세, Axiom은 요청/구조 로그 — 역할 분리). OBS-3(health 로그).
- **가드레일:** 법적/프라이버시: 본인인증 CI·전화·실명·이메일 절대 로그 금지 — 전송 전 마스킹 필수(PIPA). 비차단 전송(fire-and-forget)로 앱 지연 0. Egress: Vercel 로그는 Vercel egress(무료 100GB)·Supabase egress 무관. 무료 0.5GB/월 초과 방지 위해 샘플링·필드 최소화. UI/애니/Icon 무관.

#### OBS-10 — 비용/쿼터 하드캡 + 알림 (Vercel Spend Mgmt · Resend · 함수호출)
`quick-win` · effort **M** · impact **high** · 비용: 무료 (기존 free_plan 감시 재사용 · Resend 무료 · Vercel Spend Management 무료 기능).

- **파일 앵커:** 기존 라이브 자산 재사용: RPC free_plan_usage()·check_free_plan_limits()·cron free-plan-limit-check(매일 09:10 KST) — src/api/adminStats.ts:18에서 free_plan_usage 호출, docs/ops/supabase-plan-policy.md에 문서화. Resend 발송은 supabase/functions/weekly-email-digest/index.ts 패턴 + secret_settings(RESEND_API_KEY). Vercel Spend Management(대시보드). 신규 docs/ops/cost-cap-runbook.md.
- **데이터 모델:** 기존 free_plan_usage()/check_free_plan_limits() 재사용(70% 알림 이미 존재). 확장: 임계·수신자를 app_settings에 저장(INSERT ON CONFLICT DO NOTHING, 공개읽기 무해한 값만; 이메일 주소는 secret_settings). 신규 함수 필요 시 CREATE OR REPLACE + REVOKE FROM PUBLIC + search_path 고정.
- **접근:** 1) Vercel Spend Management: 예산 한도 + 초과 시 알림/일시정지 정책 설정(Hobby 사용량 캡 확인) — 런북화. 2) Supabase: 기존 check_free_plan_limits(70%)를 Resend 이메일로도 발송하도록 확장(현재 in-app notifications → 엣지/RPC로 이메일 추가, weekly-email-digest 발송 코드 재사용). 3) 함수호출/Resend 쿼터: Axiom(OBS-9) 또는 카운터로 일일 집계 → 임계 알림. 4) Egress 추세: supabase-plan-policy.md 기준(일 242~700회) 초과 감지 시 경고. 5) 운영자 이메일 알림 채널 확정.
- **DoD:** ① Vercel 예산 초과 알림 수신(테스트 임계). ② Supabase 사용률 70%+ 시 in-app + 이메일 발송(중복방지 하루 1회 유지). ③ Resend 무료 쿼터 근접 시 경고. ④ 런북에 캡·대응(최적화 우선→상향) 절차. 테스트: check_free_plan_limits 임계를 낮춰 알림 발화 재현 + 이메일 발송 mock.
- **의존성:** 기존 free_plan 감시(충족). Resend 도메인 인증(nuriholdem.com SPF/DKIM — 미인증 시 소유자 주소만 도달, 20260818e 주석). OBS-8(비용 급증 시 무거운 기능 킬), OBS-2(알림 채널).
- **가드레일:** 재정 안전망이나 '하드캡=서비스 중단' 트레이드오프 인지 — Vercel 자동 pause는 라이브 아웃티지 유발하므로 알림 우선·일시정지는 신중(런북 명시). Free 원칙(supabase-plan-policy.md: 70% 최적화 먼저, 90%/2개월연속 초과 시에만 Pro). Resend 무료 레이트(2/s, 발송 간 600ms 관행) 준수. 이메일 주소는 secret_settings. UI 무관.

#### OBS-11 — 공개 상태페이지 (Instatus 또는 OpenStatus)
`nice-to-have` · effort **S** · impact **low** · 비용: 무료 (Instatus 무료 티어 · OpenStatus 오픈소스 무료).

- **파일 앵커:** 외부 서비스 + DNS(status.nuriholdem.com CNAME). 소스: OBS-3의 UptimeRobot 모니터(/api/health·root) 연동. 앱 연결: 푸터/관리자 화면에 상태페이지 링크(신규 아이콘 필요 시 Icon.tsx PATHS 1줄). 앱 코드 변경 최소.
- **데이터 모델:** none.
- **접근:** 1) Instatus(또는 OpenStatus) 프로젝트 생성 → 컴포넌트(웹앱·DB·결제·본인인증) 정의. 2) UptimeRobot 연동으로 상태 자동 반영(다운 시 자동 인시던트). 3) status.nuriholdem.com 서브도메인 CNAME. 4) 앱 푸터에 '서비스 상태' 링크(순수 링크, 새 라이브러리 없음). 5) 인시던트 수동 게시·복구 템플릿(런북).
- **DoD:** ① status 서브도메인에서 상태페이지 접근. ② 모니터 다운 시 컴포넌트 자동 degraded + 구독자 알림. ③ 앱 푸터 링크 동작. 테스트: e2e 스모크로 푸터 링크 존재 확인(외부 URL은 검증 제외).
- **의존성:** OBS-3(모니터 소스) 선행. 오너: 서브도메인 DNS + 상태페이지 계정.
- **가드레일:** 공개 페이지 — 내부 지표·PII·트래픽 수치 노출 금지, 컴포넌트 상태(up/degraded/down)만. 무료 티어 한도 내. 앱 변경은 링크 1개 → framer-motion/Icon.tsx 단일소스/keep-alive 무관, Tailwind v3 링크 스타일. 외부 도메인은 vercel.json CSP와 무관(별도 호스팅).

#### OBS-12 — 시크릿 유출 차단 (GitHub Push Protection + gitleaks)
`legal-must` · effort **S** · impact **high** · 비용: 무료 (GitHub Secret Scanning + Push Protection 전 리포 무료 · gitleaks 오픈소스).

- **파일 앵커:** 리포 github.com/buffyfan9303-spec/NURI-HOLDEM. .github/workflows/ci.yml(신규 job 'secret-scan' 또는 신규 .github/workflows/gitleaks.yml). 신규 .gitleaks.toml(allowlist). 기존 .gitignore(.env* 제외 — 정합). ⚠ 알려진 공개키: supabase/migrations/20260818e_weekly_email_digest_cron.sql:12에 anon JWT 커밋됨(공개 설계 — 유출 아님, allowlist 대상). 실 위험: service_role/PORTONE_V2_API_SECRET/RESEND_API_KEY는 secret_settings(라이브)·Deno env로 리포 미커밋 — 스캔으로 회귀 방지.
- **데이터 모델:** none.
- **접근:** 1) GitHub 리포 Settings → Code security: Secret Scanning + Push Protection 활성(2025년부터 전 리포 무료). 2) gitleaks CI job: gitleaks/gitleaks-action 또는 `docker run zricethezav/gitleaks detect` on PR + push. 3) .gitleaks.toml allowlist: 20260818e의 anon JWT 정규식(공개키)만 예외 등록 — service_role 패턴은 절대 allowlist 금지. 4) 전체 히스토리 1회 스캔(gitleaks detect --log-opts=--all)으로 과거 유출 점검. 5) 발견 시 OBS-5 로테이션 트리거. 6) 선택: pre-commit gitleaks 훅.
- **DoD:** ① service_role/PortOne/Resend 형태 시크릿을 커밋 시도 → Push Protection/gitleaks 차단. ② anon JWT(공개키)는 allowlist로 통과(오탐 억제). ③ 히스토리 전수 스캔 클린(또는 발견 키 로테이션 완료). 테스트: 더미 'sb_secret_test' 커밋으로 차단 재현 + 정상 커밋 통과.
- **의존성:** OBS-5(유출 발견 시 무중단 로테이션으로 대응). 오너: 리포 보안설정 활성 권한.
- **가드레일:** 법적 최우선(PIPA): 본인인증 서비스라 service_role 키 유출=본인인증 CI·전화·실명 전면 노출=중대 개인정보 유출 → 차단이 법적 안전망. anon/publishable는 공개 설계라 유출 아님(allowlist로 오탐 억제, 단 service_role 패턴은 절대 예외 금지). 개발 차단 오탐 최소화(advisory→enforce 단계). CI/보안설정만 — 앱 런타임·UI·애니 영향 0.

### 영역 · 한국 법규·컴플라이언스 (LAW)

#### LAW-1 — 자동화된 결정 고지·거부·설명권 + 섀도우밴 인적 재검토 경로
`legal-must` · effort **M** · impact **medium** · 비용: 코드/문서 변경만 — 인프라 $0. 신규 테이블 1개(행 수 미미, egress 무관). 관리자 재검토는 수동이라 크론/실시간 연결 불필요.

- **파일 앵커:** 고지문 2소스 동시 수정 필수: (1) C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\pages\legal\PrivacyPolicy.tsx (Article n={5} '정보주체의 권리' 뒤에 신규 Article 추가) — AuthModal.tsx:101-103 뷰어가 렌더. (2) src\components\features\LegalDocsModal.tsx 의 PRIVACY 상수(75-113행)에 '자동화된 결정' 항목 추가 — BusinessFooter 경유. 대상 자동화 결정 3곳: contains_blocked_ugc/block_ugc_trigger(supabase\migrations\20260623q_consent_log_ugc_filter_audit.sql:4-25, UGC 자동차단), supabase\functions\gemini\index.ts(순위 인증 이미지 자동판정), profiles.shadowbanned/get_activity_leaderboard/admin_set_shadowban(supabase\migrations\20260820g_shadowban_activity_ranking.sql). 재사용: audit_log + public._audit()(20260623q:58-70), 아이콘은 src\components\atoms\Icon.tsx PATHS(신규 'shield'/'scale' 필요 시 한 줄 추가). 이의신청 진입 UI는 src\components\features\ProfileModal.tsx(설정) 또는 BusinessFooter onOpenSupport.
- **데이터 모델:** 신규 append-only 테이블. 라이브 안전수칙 준수. create table if not exists public.automated_decision_appeals (id uuid pk default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, decision_type text not null check (decision_type in ('ugc_block','shadowban','rank_image_reject')), context text, status text not null default 'open' check (status in ('open','reviewing','upheld','overturned')), admin_note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz not null default now()); alter table ... enable row level security; policy ada_select_own for select using (user_id=(select auth.uid()) or coalesce((select public.my_role())::text,'')='admin'). 쓰기는 RPC(security definer set search_path='public')로만: request_decision_review(p_type,p_context)=본인 insert, admin_resolve_appeal(p_id,p_status,p_note)=admin_set_shadowban 과 동일 NULL-safe 게이트(my_role() is distinct from 'admin' 거부)+perform _audit(...). revoke all ... from public,anon; grant execute to authenticated.
- **접근:** 1) 근거: 개인정보보호법 제37조의2(자동화된 결정에 대한 정보주체의 권리, 2023.3.14 개정·2024.3.15 시행) — 완전히 자동화된 결정이 정보주체 권리·의무에 중대한 영향을 미치면 거부·설명·검토 요구권 및 시행령 §44조의2~의4 기준·절차. 2) UGC 자동차단(block_ugc_trigger)·순위 이미지 자동판정(gemini)은 완전자동화라 재검토 경로 필수. 섀도우밴은 admin_set_shadowban 이 관리자 수동이라 인적개입이 있으나 자동 어뷰즈플래그(20260820c_abuse_guards)가 하드 제재로 이어지기 전 인적 재검토 게이트 명문화. 3) 처리방침 2소스에 신규 조문: 자동화 결정의 종류·기준·효과 요약, 거부/설명/재검토 요구 방법(고객센터+앱내 이의신청 버튼), 처리기한(접수 30일 내 서면 통지). 4) DB: automated_decision_appeals + request_decision_review/admin_resolve_appeal RPC(둘 다 _audit 기록). 5) UI: 자동차단 toast에 '부당하다고 판단되면 재검토 요청' 링크, ProfileModal 설정에 '자동화 결정 재검토 요청' 진입. 6) AdminTab에 open appeals 목록+처리 액션.
- **DoD:** (a) PrivacyPolicy.tsx·LegalDocsModal PRIVACY 두 곳에 자동화 결정 조문이 동일 문안. (b) 비관리자가 admin_resolve_appeal 직접 호출 시 '권한 없음' 예외(vitest 또는 SQL 테스트). (c) request_decision_review 호출→appeals 1행 insert + audit_log 1행. (d) status='overturned' 처리 시 audit_log 기록. Playwright: 로그인 사용자 이의신청 버튼→성공 toast, 재방문 상태 표시. vitest: request_decision_review 인자 검증(enum 밖 값 거부).
- **의존성:** 없음(독립 실행). 문안 법적 정확성은 오너(대표) 최종 확인 권장. gemini/abuse-guard를 완전자동화로 볼지는 오너 판단 — 보수적으로 모두 포함 권장.
- **가드레일:** framer-motion 금지·Tailwind v3·Icon.tsx 단일소스(신규 아이콘 PATHS 한 줄). 신규 진입 애니메이션 클래스 만들면 index.css:283(.tab-pane :is(...) 무효화)·384-385(reduced-motion) 목록에 반드시 추가. DB: IF NOT EXISTS·RLS enable·security definer set search_path='public'·REVOKE FROM PUBLIC/anon 후 authenticated 재부여·관리자 게이트 my_role() IS DISTINCT FROM 'admin'(anon=NULL 우회 차단, 20260820g 패턴). 무료 한도: 추가 실시간 구독 없음. 법적: 고지문은 실제 운영 자동화만 기재(허위 고지 금지).

#### LAW-2 — 개인정보 국외이전 처리방침 표 (Supabase-AWS·Sentry·Resend·Vercel + PortOne CI/DI)
`critical-now` · effort **S** · impact **high** · 비용: 문서 변경 중심 — 인프라 $0. 리전 확인(Supabase 대시보드) 1회. 각 사 DPA/소재국 확인(무비용).

- **파일 앵커:** 현재 처리방침에 국외이전 표 전무 — 위탁 항목만 플레이스홀더: C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\components\features\LegalDocsModal.tsx PRIVACY 상수 5항(95-96행 '수탁자:[클라우드/인프라 제공사], 본인인증:[본인확인기관]'). 두 번째 소스: src\pages\legal\PrivacyPolicy.tsx(국외이전 조문 없음 → Article 신설). 이전처 근거: 프로젝트 ref idsxiqspecrucvfvtgbw.supabase.co(supabase\migrations\20260818e_weekly_email_digest_cron.sql:11) — 리전 확인 필요. Sentry: package.json '@sentry/react' + src\lib\monitoring.ts. Resend: supabase\functions\weekly-email-digest\index.ts(api.resend.com). PortOne: supabase\functions\verify-identity\index.ts(api.portone.io, ci·real_name·phone·birth_date·gender·carrier 저장 69-77행). Vercel: vercel.json. 아이콘 필요 시 Icon.tsx PATHS 'globe'.
- **데이터 모델:** none(문서/UI만). 국외이전 '동의' 방식 채택 시 consent_logs(20260623q:28-35) 재사용 가능 — doc_type='overseas_transfer'로 이력화(신규 컬럼 불필요, doc_type text 자유값). 표는 정적 데이터 배열로 컴포넌트 하드코딩.
- **접근:** 1) 근거: 개인정보보호법 §28조의8(국외 이전) 및 §28조의9(중지 명령), 시행령 §29조의9. 처리위탁·보관 포함 국외이전 시 (이전받는 자, 국가, 항목, 목적, 보유·이용기간, 방법, 거부방법)을 처리방침에 공개하면 별도 동의 없이 이전 가능(§28-8①3호). 2) 표 컬럼: [이전받는 자 | 국가/리전 | 이전 항목 | 목적 | 보유·이용기간 | 이전 방법]. Supabase(AWS): DB/스토리지/Realtime, 리전(대시보드 확인 — ap-northeast-2 서울이면 국내로 표기·이전 아님, 그 외 국외), 항목=계정·프로필·장부·이용권·게시물, 방법=API/TLS 전송·저장. Sentry: 에러스택·브라우저·IP, 미국, 목적=오류모니터링(tracesSampleRate 0.1·replay 0). Resend: 이메일·닉네임, 미국, 목적=다이제스트. Vercel: 접속 IP·요청로그, 미국, 목적=호스팅. PortOne: 본인인증 경유 CI/DI·실명·생년·성별·통신사, 국내, 목적=1인1계정·만19 게이트. 3) CI/DI 명시: '주민등록번호 미수집, 본인확인기관 발급 연계정보(CI)·중복가입확인정보(DI)만 처리·저장'을 처리방침·처리항목에 반영. 4) 두 소스(LegalDocsModal PRIVACY, pages/legal/PrivacyPolicy)에 동일 표/조문. 5) 표는 overflow-x-auto 컨테이너. 6) Supabase 리전이 국외면 국외이전, 국내(서울)면 위탁으로 표기하되 Sentry/Resend/Vercel은 국외이전 확정.
- **DoD:** (a) 두 처리방침 소스에 6컬럼 국외이전 표가 동일 내용으로 존재하고 '[클라우드/인프라 제공사]' 플레이스홀더가 실상호로 대체. (b) CI/DI·주민번호 미수집 문구가 verify-identity 저장 컬럼과 모순 없음. (c) 표가 모바일에서 가로 스크롤로 넘치지 않음(overflow-x-auto). (d) Supabase 리전 값이 대시보드 값과 일치(근거 메모). Playwright: BusinessFooter '개인정보처리방침' 클릭→표 렌더.
- **의존성:** Supabase 리전 확인(대시보드 — 오너). 각 벤더 소재국/DPA 근거 1회 확인(Resend·Sentry·Vercel 미국, PortOne 국내 가정 검증). 상호·주소는 BusinessFooter/LegalNotice 확정값(엔에이치홀딩스, 525-20-02937) 재사용.
- **가드레일:** Tailwind v3(surface 토큰·border-default 재사용, LegalNotice PenaltyTable 스타일 참고). 표는 순수 HTML table+overflow-x-auto. Icon.tsx 단일소스. 사업자정보는 BusinessFooter BIZ_ROWS(525-20-02937)와 동일값 유지(3소스 정합). 법적: 이전 국가·리전을 추정 말고 실제 확인값만 기재(허위 기재 시 과태료). 무료 한도 무관(정적).

#### LAW-3 — 위치정보법 대응 — '개인위치정보 미저장' 설계 명문화 + 필요시 LBS 신고 판단
`legal-must` · effort **M** · impact **high** · 비용: 코드 중심 $0. 사용자 위치 미저장 → 서버비용/egress 증가 없음. LBS 사업자 신고(방통위) 채택 시 행정절차(무료, 서류)만.

- **파일 앵커:** 위치 사용 지점: C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\App.tsx:806-810(toggleNearSort → navigator.geolocation.getCurrentPosition, 1회·미저장, setMyPos 로컬 state), App.tsx:1448-1467(haversineKm 정렬·표기), src\lib\geo.ts(순수계산·저장없음), src\lib\geo.test.ts. 매장좌표(개인위치 아님): venues.lat/lng+set_venue_coords(supabase\migrations\20260817b_columns_expiry_grade_geo.sql:15-33). 위치약관 이미 존재: src\components\features\LegalDocsModal.tsx LOCATION 상수(115-137행, '실시간 개인위치정보 상시 수집·보관하지 않음' 명시)+BusinessFooter '위치기반서비스 이용약관' 링크(29행). 아이콘 'map-pin' 필요 시 Icon.tsx PATHS.
- **데이터 모델:** none — 개인위치정보를 DB에 저장하지 않는 것이 핵심(profiles/기타 테이블에 사용자 lat/lng 컬럼 신설 금지). myPos는 App.tsx useState 로컬(휘발)만 유지. 감사 가드: 사용자 좌표를 supabase.from().insert/update/RPC 인자로 보내는 코드가 0건임을 CI에서 검증(테스트 고정).
- **접근:** 1) 근거: 위치정보의 보호 및 이용 등에 관한 법률 — 위치기반서비스사업자는 방통위 신고(§9), 개인위치정보 수집·저장·제공 위치정보사업자는 허가(§5). 개인위치정보를 수집·저장·제3자제공하면 신고/허가·이용약관 신고·즉시파기 의무 발생. 2) NURI 설계 진단: getCurrentPosition 결과는 서버전송·DB저장 안 하고 정렬·거리표기 후 폐기(로컬 state), 매장좌표만 저장(개인위치 아님) → 개인위치정보 미수집 회피 설계 해당 여지. 3) 실행: (A) 회피 설계 명문화 — LOCATION 약관(존재)을 근거로 코드 주석/README에 '사용자 좌표 비저장' 불변식 기록, 위치권한 요청 직전 목적·즉시폐기 고지(toast/모달) 추가, 거부 시 지역필터 폴백(App.tsx:808 존재) 유지. (B) 보수적 판단 시 위치기반서비스사업자 '신고'(개인위치 미저장이어도 위치기반 서비스 제공 시 신고 대상 유권해석 상이) — LOCATION 약관 정비, 방통위 신고(오너). 4) LOCATION 약관에 8세 이하 아동·피성년후견인 보호(§26), 이용·제공사실 확인자료 열람권(제4조), 분쟁조정(방통위/개인정보분쟁조정위) 문구 확인. 5) 위치권한 남용 방지: near 재요청 최소화(myPos 캐시), 자동 상시요청 금지.
- **DoD:** (a) 사용자 좌표가 어떤 supabase insert/update/RPC 인자로도 전달되지 않음 — grep 기반 CI 가드가 'pos.coords'·'myPos'가 network 계층으로 흐르지 않음 고정. (b) 위치권한 요청 전 목적·미저장 1회 고지 UI 노출(Playwright: near 토글→고지→허용/거부 폴백). (c) LOCATION 약관이 BusinessFooter·LegalDocsModal에서 열람 가능·'상시 수집·보관하지 않음' 문구 유지. (d) 오너가 '신고 vs 회피' 결정 문서화. geo.test.ts haversine 정확도 회귀 유지.
- **의존성:** 오너 결정: 위치기반서비스사업자 신고 여부(법무 검토 권장 — 개인위치 미저장만으로 신고 면제 여부 유권해석 상이). 매장좌표 라이트백(set_venue_coords)은 개인위치 아니라 무관.
- **가드레일:** framer-motion 금지(고지 모달은 기존 Modal atom+CSS). Tailwind v3. keep-alive: near 토글 UI가 탭 내부면 index.css:283 규칙 확인. 무료 한도: 위치 서버 미전송으로 egress·Realtime 무관(설계 이점). 법적: '저장하지 않는다'는 약관과 실제 코드가 100% 일치해야 함(불일치 시 허위). navigator.geolocation은 https(Vercel)에서만 동작.

#### LAW-4 — 시드지갑 환전·선불수단 코드차원 배제 가드레일 + 회귀 테스트 고정
`quick-win` · effort **S** · impact **high** · 비용: 코드/테스트만 $0. UGC 필터는 이미 트리거로 동작(추가 비용 0).

- **파일 앵커:** 이용권(비금전) 코어: C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\api\vouchers.ts(발급 issueVoucher·회수 redeem*·양도 find_user_for_transfer), supabase\migrations\20260817b_columns_expiry_grade_geo.sql(issue_voucher:124-164/redeem_my_voucher — status active/used/취소만, 현금필드 없음; issue_voucher:140-144 본인인증 보유자 게이트), supabase\migrations\20260816a_redeem_voucher_issuing_venue_guard.sql, supabase\migrations\20260614b_voucher_quota.sql. 환전 차단 필터: contains_blocked_ugc/block_ugc_trigger(supabase\migrations\20260623q_consent_log_ugc_filter_audit.sql:4-25). 정책 문서: LegalDocsModal.tsx REFUND 상수(139-166행, '매장이용권=현금가치 없는 비금전 포인트, 환불·환전 대상 아님'), TermsOfService.tsx 제4조. 장터 게임머니 미노출: src\api\marketplace.ts:5-7. 기존 테스트: src\api\ledger.money.test.ts, src\api\marketplace.like.test.ts.
- **데이터 모델:** none(신규 스키마 금지 — 이용권에 현금/잔액/충전금액 컬럼 추가 금지가 가드레일). store_vouchers는 1건=1장 토큰 모델 유지(액면가·잔액 필드 없음). '시드지갑'(충전식 잔액) 개념이 코드에 도입되지 않았음을 information_schema 테스트로 고정. voucher_quota(매장 발급한도)는 B2B 발급쿼터일 뿐 사용자 환금성 잔액이 아님 — 주석으로 구분 명확화.
- **접근:** 1) 근거: 게임산업진흥법 §32조①⑧(게임머니·아이템 환전·알선·재매입 금지), 형법 §247(도박개장), 전자금융거래법 §2(선불전자지급수단 — 충전·잔액이전 구조 회피). 이용권이 충전잔액/환금포인트가 되면 선불수단·환전 규제에 걸림. 2) 코드 불변식 3종 고정: (a) store_vouchers 에 금액·잔액·충전 필드 부재(1토큰=1사용, expires_at·status만) — 스키마 회귀 테스트. (b) 사용자↔사용자 양도(find_user_for_transfer)가 '대가/현금'과 무관(발급매장 귀속·본인인증 보유자 한정). (c) UGC 환전표현 서버차단(block_ugc_trigger)이 community_posts/comments/live_wall에 붙음. 3) 가드레일 테스트(vitest) 신설: contains_blocked_ugc 정규식이 '칩 환전/시드 현금화/게임머니 거래/계좌번호'를 참으로, 정상물품('포커칩 세트 판매')은 거짓으로 판정(오탐 회귀). marketplace 카테고리에서 gameMoney가 신규 작성 UI에 없음(marketplace.ts 타입 유지·UI 미노출) 단언. 4) REFUND/Terms 문구와 코드 일치 검증: 이용권 환불·환전 요청 경로가 코드에 없음(RPC 부재) 문서화. 5) 신규 기능 리뷰 게이트: '이용권에 금액/충전/출금' 추가 PR을 막는 CLAUDE.md 규약 한 줄 제안.
- **DoD:** (a) vitest — contains_blocked_ugc 미러(또는 SQL 테스트)로 환전성 표현 12+ 차단, 정상물품 5+ 통과(오탐 0). (b) store_vouchers 스키마에 (amount|balance|charge|cash|krw) 유사 컬럼 없음을 information_schema 테스트 고정. (c) issue_voucher가 미인증(real_name 공백) 보유자 지정 시 예외(20260817b:140-144) 회귀 테스트. (d) 장터 신규작성 UI에 '게임머니' 옵션 부재(Playwright 또는 컴포넌트 테스트). (e) REFUND 약관 '환전 불가' 문구 유지.
- **의존성:** 없음. 이용권 유료충전(voucher_quota 구매)은 매장 B2B 발급쿼터며 사용자 환금성과 무관 — 오너가 이 구분 유지 전제.
- **가드레일:** framer-motion 금지·Tailwind v3·Icon.tsx 단일소스. DB: 신규 RPC는 security definer set search_path='public'·REVOKE FROM PUBLIC/anon. block_ugc_trigger는 marketplace_listings 제외(물리 칩판매 정상, 20260623q:3) 유지 — 오탐 방지. 무료 한도: 트리거 기반이라 추가 연결 0. 법적: 이용권을 절대 환전/현금성으로 마케팅 금지(문구·코드). CLAUDE.md '작고 리뷰 가능한 변경' 준수.

#### LAW-5 — 마케팅 수신동의 2년 재확인 + '(광고)' 표기 + 야간 전송 제한 (정보통신망법 §50)
`critical-now` · effort **M** · impact **high** · 비용: 코드/문구 $0. Resend 무료 2/s 한도 내(기존 600ms sleep 유지). 재확인 발송은 연 1회성 소량. 야간 홀딩은 크론 시각 조정으로 비용 0.

- **파일 앵커:** 마케팅 채널 2곳(현재 '(광고)' 표기·야간게이트·동의확인 없음): C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\supabase\functions\weekly-email-digest\index.ts(subject/digestHtml 33-66행), supabase\functions\send-push\index.ts(title/body 41-53행). 크론: supabase\migrations\20260818e_weekly_email_digest_cron.sql:8('30 1 * * 5'=금 10:30 KST — 야간 아님, OK)+supabase\migrations\20260603e_auto_push_on_notification.sql(알림 INSERT→push webhook, 시각 무제한 → 야간게이트 필요). 대상 집계 RPC: weekly_email_digest_rows(20260818d/e). 동의 저장: profiles.agreed_to_marketing+terms_agreed_at(supabase\migrations\20260529_add_consent_fields.sql), 동의 UI src\components\features\ConsentGateModal.tsx:61 + src\components\features\AuthModal.tsx(marketing 체크). 동의 이력: consent_logs doc_type='marketing'(20260623q:48-49) + log_consent_changes 트리거.
- **데이터 모델:** profiles 컬럼 추가(전부 nullable, 기존행 무영향): alter table public.profiles add column if not exists marketing_agreed_at timestamptz; add column if not exists marketing_reconfirm_due timestamptz(=marketing_agreed_at + interval '2 years'). 발송 대상 SQL 술어에 (agreed_to_marketing is true and (marketing_reconfirm_due is null or marketing_reconfirm_due > now())) 추가. 야간 판정은 now() at time zone 'Asia/Seoul' 기반(테이블 불필요). log_consent_changes(20260623q:41-53)에 marketing 변경 시 marketing_agreed_at=now() 세팅 추가.
- **접근:** 1) 근거: 정보통신망법 §50조 — ①영리목적 광고성 정보 사전동의(옵트인), ③야간(21:00~익일 08:00) 전송 별도동의, ④전송 시 '(광고)' 표기 및 발신자명칭·수신거부방법 명시, §50조의8, 시행령 §61조·§62조의3(2년마다 수신동의 여부 확인 의무). 위반 과태료(3천만원 이하). 2) '(광고)' 표기: 이메일 subject를 '(광고) [NURI HOLDEM] …'로, 본문에 발신자(엔에이치홀딩스)·무료거부방법(프로필 팔로우 해제/수신거부) 명시 — digestHtml 하단(64행) 강화. 푸시 title은 '(광고)' prefix+tag='ad'. 3) 야간 제한: send-push/auto_push 경로에서 광고성(tag/type=marketing) KST 21:00~08:00이면 보류·익일 08:00 이연. 다이제스트 크론은 금 10:30(주간) 적합. 거래·운영성 알림(예약·제재·장부)은 광고 아니므로 tag로 분리해 야간·표기·동의 규제 제외. 4) 옵트인 게이트: 발송 대상 SQL(weekly_email_digest_rows·푸시 대상)에 agreed_to_marketing is true 조건 추가(현재 팔로우만으로 발송하면 팔로우≠광고동의 → 위반). 5) 2년 재확인: marketing_reconfirm_due 경과자에게 연1회 '수신동의 유지 확인' 안내(재동의 없으면 광고 중단, 정보성 유지), 확인 시 consent_logs 재적재. 6) ConsentGateModal/AuthModal 마케팅 라벨에 '(광고성 정보 수신 — 이메일·푸시)' 명확화.
- **DoD:** (a) 다이제스트 subject가 '(광고)'로 시작하고 본문에 발신자+무료수신거부방법 포함(테스트: digestHtml 반환 문자열 정규식). (b) 발송 대상 쿼리가 agreed_to_marketing=true AND 재확인 유효자만 반환(SQL 테스트: 동의 false/만료 사용자 0행). (c) 광고성 푸시가 KST 21:00~08:00 보류(단위 테스트: 야간 mock→skip, 주간→발송). (d) 정보성 알림(제재·예약)은 야간에도 발송·'(광고)' 미표기(회귀). (e) marketing 동의 토글 시 consent_logs append+marketing_agreed_at 갱신. (f) 2년 경과자 재확인 대상 산출 SQL 동작. Playwright: 마케팅 미동의 계정은 다이제스트 후보 제외.
- **의존성:** Resend 도메인 인증(nuriholdem.com SPF/DKIM) 완료 시 RESEND_FROM 교체(20260818e:4 주석) — 미완료면 실사용자 발송 안 되지만 규제 로직 선반영 가능. 오너: 팔로우 기반 발송을 광고동의 기반으로 전환하는 제품 결정.
- **가드레일:** framer-motion 금지·Tailwind v3·Icon.tsx 단일소스. DB: 컬럼 add if not exists(nullable)·발송 RPC search_path 고정·서비스롤 전용. 야간 판정은 반드시 KST(Asia/Seoul). 무료 한도: Resend 2/s(기존 600ms sleep). 법적: 정보성/광고성 오분류 금지(거래·안전에 '(광고)' 붙이면 혼선). 크론 Authorization anon Bearer 관행 유지(20260818e).

#### LAW-6 — 책임게임 고지 + 도박문제 상담(1336) + 자기제한 + 19세 게이트 강화
`legal-must` · effort **M** · impact **medium** · 비용: 코드/문서 $0. 자기제한은 profiles 플래그+클라 게이트(경량). 신규 인프라 없음.

- **파일 앵커:** 19세 게이트 현황(이중): 자기신고 — C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\components\features\AuthModal.tsx:200-201·449·527('만 19세 이상 성인…청소년보호법'), src\components\features\ConsentGateModal.tsx:57. 하드 게이트 — supabase\functions\verify-identity\index.ts:60-63(birthDate→ageFrom<19 fail-closed 403). 사행성 배제 고지: src\pages\legal\LegalNotice.tsx('📞 신고 및 문의' Section 117-130행 — 게임물관리위 1488·경찰 ecrm 있으나 도박중독 1336 없음 → 추가), src\components\features\LegalDocsModal.tsx. 상시 노출: src\components\features\BusinessFooter.tsx(사행성 배제 47-50행). 아이콘 'info' 이미 존재(Icon.tsx). 자기제한 UI: src\components\features\ProfileModal.tsx 설정.
- **데이터 모델:** profiles 자기제한 플래그(nullable): alter table public.profiles add column if not exists self_exclusion_until timestamptz; add column if not exists responsible_gaming_ack_at timestamptz. set_self_exclusion(p_days int) RPC(security definer, 본인만, search_path 고정): self_exclusion_until=now()+p_days*interval '1 day'. 해제는 설정 기간 경과 후에만(즉시 해제 불가) — 게이트는 클라에서 활동랭킹 참여·이용권 수령 등 사행유사 유인 축소. REVOKE FROM PUBLIC/anon, GRANT authenticated.
- **접근:** 1) 근거: 사행산업통합감독위원회법(한국도박문제예방치유원 헬프라인 1336), 청소년보호법 §2·연령확인, 게임산업진흥법 §12조의3(과몰입·중독 예방조치). NURI는 도박이 아닌 마인드스포츠 정보플랫폼이나 도메인 민감성상 책임게임 고지가 신뢰·규제 방어에 유효. 2) 책임게임 고지 섹션 신설(LegalNotice.tsx에 '🔞 건전이용·도박문제 상담' Section, BusinessFooter에 1줄 링크): '19세 미만 이용불가', '베팅·환전 없는 정보 서비스', '도박문제 상담 한국도박문제예방치유원 1336(24시간·무료)', 게임물관리위 1488. 3) 자기제한: 설정에서 냉각기간(7/30/90일) 선택→self_exclusion_until 저장, 기간 중 활동랭킹·이용권 수령 유인 UI 축소·안내. 4) 19세 게이트 정합성: 자기신고(AuthModal age19) 유지하되 verify-identity 하드 게이트(만19 fail-closed)가 실질 방어임을 문서화, 미인증 사용자의 사행유사 기능(이용권 지급 대상은 이미 real_name 필요) 제한 유지. 5) 과몰입 안내: 장시간 이용/야간접속 시 건전이용 배너(선택). 6) 고지 확인(responsible_gaming_ack_at)은 최초 1회 표시 후 기록.
- **DoD:** (a) LegalNotice.tsx·BusinessFooter에 1336/1488·19세불가·베팅없음 고지 노출. (b) set_self_exclusion 을 본인만 호출 가능(타인 uid 지정 불가 — auth.uid() 고정), 만료 전 해제 불가(SQL 테스트). (c) self_exclusion_until 유효 사용자에게 자기제한 상태 UI 표시(Playwright). (d) verify-identity 만19 거부 로직 회귀(생년 null 또는 <19→403). (e) 고지 문구가 도박/베팅 서비스로 오인되지 않게 마인드스포츠 프레이밍 유지. vitest: ageFrom 경계값(만19 생일 당일).
- **의존성:** 1336(한국도박문제예방치유원)·1488(게임물관리위) 번호 최신 확인(오너). 자기제한 UX 범위(제한 기능) 오너 결정. PortOne 미설정(PORTONE_CONFIGURED=false)에서 하드게이트 미작동 — 프로덕션 PortOne 키 설정 전제.
- **가드레일:** framer-motion 금지(배너는 CSS/기존 Modal). Tailwind v3(danger/accent 토큰, LegalNotice BanList 스타일 재사용). 신규 진입 배너가 탭 내부면 index.css:283·384-385 확인. Icon.tsx 단일소스. DB: 컬럼 add if not exists·RPC search_path='public'·REVOKE/GRANT. 법적: '도박·베팅' 표현 금지(마인드스포츠 일관), 상담번호는 실제 운영번호만. 무료 한도 무관.

#### LAW-7 — 앱스토어 실사 대응 — 19+/GRAC 등급·'정보 서비스' 프레이밍·웹보드 규제 회피
`big-bet` · effort **L** · impact **high** · 비용: 심사 대응 문서·메타데이터 중심 $0. GRAC 자체등급분류 절차(무료~소액). 앱 리젝 리스크가 큰 항목이라 사전 정지작업 가치 높음.

- **파일 앵커:** 서비스 성격 근거(심사 진술 재료): C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\pages\legal\LegalNotice.tsx(마인드스포츠·사행성배제·금지행위·제재표), src\components\features\LegalDocsModal.tsx TERMS 제4조(도박·환전 미제공)·REFUND, src\components\features\BusinessFooter.tsx(상시 사행성 배제). 환전차단 증거: contains_blocked_ugc/block_ugc_trigger(20260623q). 연령: verify-identity 만19 하드게이트+AuthModal age19. PWA/설치: src\components\atoms\InstallBanner.tsx, public\sw.js, vercel.json. GTO=교육 프레이밍 자산: src\components\features\gto\*(gto.data.ts·GtoDeepModal). 산출물은 문안·근거 번들(코드 아닌 문서, 단 앱내 고지 3소스와 문구 일치).
- **데이터 모델:** none — 제품 메타데이터/심사진술/스크린샷 정책. DB 변경 없음. 산출물=심사 대응 팩(서비스 정의문·연령정책·환전차단 근거·GRAC 등급 판단메모).
- **접근:** 1) 근거·리스크: 게임산업진흥법 §21(등급분류)·§28, 웹보드게임(고스톱·포커류) 시행령 별표 규제(월 결제한도·1회 베팅한도·상대선택 제한)는 '게임물' 내 베팅·게임머니 작동 시 적용. NURI는 (a)베팅·게임플레이 미제공, (b)토너먼트 일정정보·커뮤니티·매장운영도구 제공 → '게임물'이 아닌 '정보 서비스/유틸리티'로 포지셔닝. GTO는 확률학습(교육). 2) 스토어 심사 진술: (i)실제 금전 도박 없음, (ii)18/19+ 연령제한, (iii)UGC 환전표현 자동차단(block_ugc_trigger) 증거, (iv)사행성 배제 상시고지(BusinessFooter/LegalNotice) 스크린샷. Google Play '실제 도박' 정책·'게임' vs '유틸리티' 카테고리 근거 문서화. 3) GRAC 자체등급분류: 앱이 '게임물'로 분류 소지 시 자체등급분류사업자 경유 등급(청소년이용불가 등), 정보 서비스로 인정되면 비대상 — 오너/법무 유권 확인 후 택1. 4) '교육' 프레이밍: GTO/핸드리플레이어를 '포커 전략 학습·통계 도구'로 설명(실전 베팅 없음), 사행성 오인 표현 제거. 5) 웹보드 규제 회피 불변식: 칩베팅 UI·실시간 머니게임·월 결제 도박한도 부재를 코드로 증명(장터 gameMoney 미노출·이용권 비금전). 6) 산출: 심사 리젝 대비 Q&A(도박 아님 근거 6종)+앱 등록정보 연령/설명 초안.
- **DoD:** (a) 심사 대응 팩 문서 존재(서비스 정의·연령정책·환전차단 근거·게임물 해당성 메모·웹보드 회피 불변식). (b) 앱내 3소스(LegalNotice/LegalDocsModal/BusinessFooter) '도박·환전 미제공' 문구 일치·심사 진술과 모순 없음. (c) 코드에 실시간 머니게임·칩베팅·도박 결제한도 기능 없음 증명(grep 체크리스트). (d) GTO/리플레이어 설명이 '학습·통계' 프레이밍. (e) 오너가 GRAC 자체등급분류 필요 여부 결정·기록. 테스트: 기존 사행성 배제 문구 스냅샷 회귀.
- **의존성:** 오너/법무: 게임물 해당성·GRAC 자체등급분류 유권 판단(핵심 의존). Apple Developer/Google Play 계정·심사정책 최신본. PortOne 연령확인 프로덕션 설정. 현재 PWA — 네이티브 래핑 시 스토어 정책 재검토.
- **가드레일:** 제품·문서 작업이라 애니/DB 영향 적으나 문구 수정 시 3소스 정합 유지. framer-motion 금지·Tailwind v3·Icon.tsx 단일소스. 법적: 심사 진술과 실제 기능이 100% 일치(허위 진술 시 계정 정지). '교육' 프레이밍이 실제 기능(GTO=확률학습)과 부합·사행 조장 표현 금지. 무료 한도 무관.

#### LAW-8 — 전자상거래법 통신판매중개자 고지 + 사업자정보 표시 완결성
`quick-win` · effort **S** · impact **medium** · 비용: 문서/UI $0. 통신판매업 신고(관할 구청)는 해당 시 소액 등록면허세.

- **파일 앵커:** 중개자 고지(부분 존재): C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\pages\legal\TermsOfService.tsx 제3조2항(중개자·당사자 아님)·제7조(게시물 칅임), src\components\features\LegalDocsModal.tsx TERMS 제8조(중고장터 거래책임 한계)·REFUND. 사업자정보 표시: src\components\features\BusinessFooter.tsx BIZ_ROWS(6-12행: 상호·대표·사업자번호 525-20-02937·소재지·고객센터 — 통신판매업신고번호·유선전화 누락), src\pages\legal\LegalNotice.tsx '🏢 사업자 정보'(148-164행). 장터: src\api\marketplace.ts(회원간 직거래 중개), src\components\features\MarketplaceFormModal.tsx.
- **데이터 모델:** none — 정적 사업자정보. 통신판매중개 거래마다 '중개자이며 당사자가 아니다' 개별고지를 장터 상세/작성 화면에 노출(상수/컴포넌트). BIZ 정보는 LegalDocsModal.BIZ·BusinessFooter.BIZ_ROWS·LegalNotice 3소스 단일값 유지.
- **접근:** 1) 근거: 전자상거래법 §10(사업자 신원정보 표시), §13·§20(통신판매중개자 고지·정보제공 의무), §20조의2(중개자 책임). 통신판매중개자는 '자신이 당사자가 아니라는 사실'을 소비자가 쉽게 알 수 있도록 거래 이전에 고지. 2) 사업자정보 완결: BusinessFooter/LegalNotice에 (상호·대표자·사업자등록번호·주소·전화번호·이메일·통신판매업신고번호[해당시]·호스팅제공자[Vercel]) 표기. 현재 전화번호·통신판매업신고번호 누락 → 오너 확인 후 보완. 3) 중개자 개별고지: 장터 상세·거래문의(listing_messages)·작성 화면 상단에 '본 거래는 회원 간 직거래이며 NURI(엔에이치홀딩스)는 통신판매중개자로서 거래 당사자가 아니고 상품·거래에 책임지지 않음' 고지 배너 상시 노출(약관 제8조를 거래 지점으로). 4) 소비자분쟁: 청약철회·환불은 유료부가서비스(광고)에만 적용(REFUND 약관 유지), 회원간 중고거래는 중개 면책 명확화. 5) 3소스 사업자정보 정합 테스트.
- **DoD:** (a) BusinessFooter·LegalNotice·LegalDocsModal.BIZ 사업자정보가 동일값(스냅샷 테스트)·법정 필수항목(상호·대표·사업자번호·주소·연락처) 충족. (b) 장터 상세/작성 화면에 통신판매중개자 개별고지가 거래 전 노출(Playwright: 장터 상세→고지 배너). (c) TermsOfService/LegalDocsModal 중개 면책 조문과 UI 고지 일치. (d) 통신판매업신고 필요 여부를 오너가 판단·기록(중개만 하고 직접판매 없으면 면제 가능 확인). 테스트: BIZ 상수 3소스 일치 단언.
- **의존성:** 오너: 통신판매업신고번호 유무·유선 연락처 공개 여부 결정. 사업자등록증(525-20-02937) 기준값 유지. 유료 광고 결제(PortOne) 도입 시 청약철회·표시의무 범위 확대 검토(LAW-2/LAW-4와 연결).
- **가드레일:** framer-motion 금지·Tailwind v3(고지 배너는 accent/surface 토큰). keep-alive: 장터 탭 내부 고지 배너는 진입 애니메이션 index.css:283 확인(정적 배너 권장). Icon.tsx 단일소스. 사업자정보 3소스 단일값 불변식 유지(불일치=허위표시 리스크). 무료 한도 무관. 법적: 개인사업자라 대표자명·주소 공개와 법정 표시의무 균형.

#### LAW-9 — 웹 접근성 KWCAG 2.2 자가감사 (장애인차별금지법 §21)
`big-bet` · effort **L** · impact **medium** · 비용: 감사·수정 공수 중심 $0(axe 무료). 광범위 컴포넌트 수정이라 L. 접근성은 단계적 PR 권장.

- **파일 앵커:** 전역 진입점·공통 원자: C:\Users\buffy\OneDrive\바탕 화면\홀덤 캘린더\src\App.tsx(탭네비 476-590행·aria-pressed 일부 2162행·하단탭 585-590행), src\components\atoms\Icon.tsx(aria-hidden 처리), src\components\atoms\Modal.tsx(포커스 트랩·esc·aria-modal), src\components\atoms\Toast.tsx(role=status/aria-live), src\components\atoms\SlidingPill.tsx(FLIP — reduced-motion 정합), src\components\atoms\ThemeToggle.tsx. 색대비 토큰: tailwind.config.js(surface 스케일·accent-300 #5E6AD2), src\index.css:388~(라이트모드 가독 오버라이드). 폼 라벨: AuthModal.tsx·ConsentGateModal.tsx(input+label 연결). reduced-motion 이미 존재: src\index.css:380-385 + main.tsx 흔적. 이미지 alt: VenueThumb.tsx·Avatar.tsx.
- **데이터 모델:** none — 프론트엔드 마크업/ARIA/대비/포커스 개선. DB 무관. 산출물=KWCAG 2.2 24검사항목 체크리스트(위반→파일·라인)+우선순위 수정.
- **접근:** 1) 근거: 장애인차별금지법 §21(정보통신·의사소통 정당한 편의제공) 및 국가표준 한국형 웹 콘텐츠 접근성 지침(KWCAG) 2.2(인식의 용이성·운용의 용이성·이해의 용이성·견고성 4원칙 24검사항목). 2) 자동+수동 자가감사: (A)자동 — axe-core를 Playwright(@axe-core/playwright, 무료)로 주요 탭(browse/community/market/tools/my-store)·핵심 모달에 주입해 위반 수집. (B)수동 — 키보드 온리 순회(포커스 순서·가시 포커스링·모달 포커스 트랩/복원), 스크린리더(대체텍스트·폼라벨·랜드마크·헤딩위계), 명도대비 4.5:1(accent-300 #5E6AD2 on surface, 라이트/다크 양쪽), 터치타깃 24px(2.2 신규 2.5.8), 접근성 인증 문자열/드래그 대체수단(2.2 신규 2.5.7 — 순위/일정 dnd-kit 드래그에 버튼 대체). 3) 우선수정(저위험순): 이미지 alt·아이콘 aria-hidden → 폼 label 연결 → 버튼/링크 접근가능 이름(aria-label) → 포커스 가시성·순서 → 명도대비 토큰 → 모달 포커스 트랩/esc → 헤딩/랜드마크 → 드래그 대체·타깃크기. 4) reduced-motion: index.css:380-385 유지, 신규 애니메이션은 이 목록·283 목록에 등록. 5) 회귀 방지: axe 스모크를 test:e2e에 편입(위반 0 게이트, 점진 허용목록).
- **DoD:** (a) @axe-core/playwright 스모크가 browse·community·market·tools·my-store·주요모달에서 critical/serious 위반 0(초기 baseline 허용목록으로 시작·목표 0). (b) 키보드만으로 로그인→탭이동→장터상세→모달 열기/닫기 전 구간 조작 가능(가시 포커스). (c) accent-300·본문텍스트 명도대비 4.5:1(라이트/다크). (d) dnd-kit 드래그 UI(순위/정렬)에 키보드/버튼 대체수단(2.5.7). (e) 모달 포커스 트랩·복원·esc 동작. (f) KWCAG 2.2 24항목 자가감사 체크리스트 문서화. vitest/axe: 공통 원자(Modal·Toast·Icon) 접근성 단위 스냅샷.
- **의존성:** @axe-core/playwright 추가(devDependency — package.json 신규 import 전 확인, CLAUDE.md 규약). 대비 토큰 조정은 redesign-skill '컬러' 단계와 조율(taste-skill 금지). 광범위 → 단계적 PR 권장(오너 우선순위).
- **가드레일:** redesign-skill 사용(홀덤 데이터/운영 UI — taste-skill 범위 밖). framer-motion 금지 — reduced-motion은 index.css:380-385 + SlidingPill FLIP 정합 유지, 신규 진입 애니메이션 클래스는 index.css:283·384-385 두 목록에 등록. Tailwind v3(surface 스케일·accent-300 유지, v4 금지). Icon.tsx 단일소스(장식 아이콘 aria-hidden·의미 아이콘 aria-label). 대비 수정은 tailwind.config.js 커스텀 토큰 보존(임의 색 하드코딩 금지). 무료 한도: axe 로컬 실행(egress 무관). 키보드/스크린리더 대체수단이 기존 keep-alive 마운트 유지 구조와 충돌하지 않게 확인.

### 영역 · 그로스·계측·배포 (GRW)

#### GRW-1 — PostHog EU 제품분석 — SPA 페이지뷰·리버스프록시·identified_only·lazy 청크
`big-bet` · effort **M** · impact **high** · 비용: 무료(PostHog EU Free 100만 이벤트/월). posthog-js는 lazy 동적 청크라 초기 번들 증가 0. 리버스프록시는 Vercel rewrite(런타임 비용 0). GA(G-9T7JZNEQE8)와 병행(중복 아님: GA=획득/광고, PostHog=제품 퍼널).

- **파일 앵커:** NEW src/lib/analytics.ts — src/lib/monitoring.ts:12-27 의 'DSN 게이트 + import() 동적 청크' 패턴을 그대로 복제(VITE_POSTHOG_KEY 없으면 no-op). export: initAnalytics()/track(event,props)/identify(id,props)/resetIdentity(); init 전 호출은 내부 큐로 버퍼링. | src/main.tsx:60-111 — 서드파티 idle 주입부. initAnalytics() 를 loadThirdParty() 와 동일한 tpAfterIdle 게이트(nuri:first-data-requested + window load 둘 다 도착 후 유휴)에서 호출 — head 직접 로드 금지(main.tsx:85-92 레이스 교훈). | src/main.tsx:23 initMonitoring() 옆에 initAnalytics() 배치하되 내부에서 idle 게이트 사용. | src/App.tsx:1143,1183 window.dispatchEvent(new Event('nuri:first-data-requested')) — 로드 신호 재사용. | src/App.tsx:1514-1544 딥링크 라우팅(?s/?v) + applyScheduleSeo/applyVenueSeo/resetSeo 지점 — $pageview 를 history_change 자동캡처로(수동 capture 불필요). | src/contexts/AuthContext(main.tsx:5,49) — 로그인 성공 시 identify(user.id,{role}), 로그아웃 시 resetIdentity(). | vite.config.ts:25-32 manualChunks — posthog-js 를 eager vendor(vendor-react/vendor-supabase)에 넣지 말 것(catch-all 금지 주석 준수); 동적 import 로 자동 분리. | vercel.json rewrites(3-12) + CSP(43,80,117,154,191) — /ingest 리버스프록시 rewrite 추가(아래).
- **데이터 모델:** none — 제품분석 데이터는 PostHog Cloud EU에 저장. 서버 키 불필요(클라이언트 공개키 phc_*). 리버스프록시는 vercel.json rewrite로만 처리(DB/마이그레이션 무변경). 선택: analytics.ts에 이벤트명 상수 테이블(오타 방지).
- **접근:** 1) npm i posthog-js. Vercel env: VITE_POSTHOG_KEY=phc_*, VITE_POSTHOG_HOST=/ingest. 2) vercel.json rewrites에 리버스프록시 2줄 추가: {source:'/ingest/static/:path*', destination:'https://eu-assets.i.posthog.com/static/:path*'}, {source:'/ingest/:path*', destination:'https://eu.i.posthog.com/:path*'} — posthog 트래픽이 first-party(nuriholdem.com/ingest)로 나가 광고차단·CSP connect-src 확장 회피. 3) src/lib/analytics.ts: monitoring.ts 구조 복제. init 옵션 = {api_host:'/ingest', ui_host:'https://eu.posthog.com', person_profiles:'identified_only', capture_pageview:'history_change', autocapture:false, capture_pageleave:true, disable_session_recording:true}. 4) main.tsx tpAfterIdle 안에서 loadThirdParty() 직후 initAnalytics() 호출. 5) AuthContext 로그인/로그아웃 훅에 identify/resetIdentity. 6) 핵심 이벤트 계측(track): schedule_view(App.tsx openSchedule), reserve_click, venue_follow, signup_complete, invite_link_created(referrals.inviteUrl 호출부), tool_used(tools 탭). 이벤트명 상수화. 7) CSP report-only(vercel.json 43 등)는 리버스프록시라 'self'로 이미 커버 — 도메인 추가 불필요 재확인.
- **DoD:** 빌드 후 dist/assets에 posthog 별도 청크 존재(vendor-react/vendor-supabase에 미포함) — npm run build로 확인. | 키 미설정(로컬)에서 네트워크 0·no-op(부팅/빌드 안전). | 로그인 후 PostHog EU에 person(distinct_id=user.id) 1명 생성, 익명 세션은 person 미생성(identified_only). | SPA 탭전환·딥링크 진입마다 $pageview 1건. | vitest: init 전 track() 호출이 큐잉→init 시 flush, 키 없을 때 no-op, PII(email 등) property 미포함 유닛테스트. | Playwright @boot: PostHog 유무와 무관하게 부팅 통과(첫 페인트 회귀 없음).
- **의존성:** PostHog EU 프로젝트 생성 + 공개키 발급(오너 결정). GRW-6(Resend 라이프사이클)의 코호트 트리거가 이 계측에 의존 → GRW-1 선행. GA와 공존(제거 아님).
- **가드레일:** framer-motion·Icon.tsx·Tailwind v3 규약 무관(로직 모듈). autocapture:false + capture_pageview:history_change 로 무료 이벤트 한도(100만/월) 절약·노이즈 억제. 리버스프록시로 CSP connect-src 확장 불필요(있어도 report-only). 개인정보: person_profiles=identified_only, IP는 PostHog EU 기본 마스킹, property로 email/전화 등 PII 전송 금지(user.id만). idle 주입 유지 — main.tsx head 직접 로드 금지(부팅 레이스). 세션리플레이 off(비용/프라이버시, monitoring.ts:23 정책 일치).

#### GRW-2 — 봇 UA 엣지 프리렌더 — 루트 딥링크(/?s /?v)를 스크래퍼·Yeti에 데이터 채운 정적 HTML로
`quick-win` · effort **M** · impact **high** · 비용: 무료(기존 Vercel 서버리스/미들웨어 확장). 봇 요청당 Supabase REST 1건, s-maxage=600 캐시로 egress 억제. 사람 트래픽엔 함수 실행 0(미들웨어 matcher를 봇+파라미터로 좁힘).

- **파일 앵커:** 현 상태: api/s.js(매장 /s/:code)·api/p.js(대회 /p/:id)는 '공유 링크'만 프리렌더. 하지만 seo.ts와 navigator.share/복사가 실제로 뿌리는 루트 딥링크 nuriholdem.com/?s=<id>·/?v=<code> 는 봇에게 index.html 기본 메타만 노출(구멍 — seo.ts:9-10 주석이 명시한 '후속 작업'). | NEW api/_prerender/meta.js — api/p.js:47-63(schedule fetch+제목/desc)·api/s.js:44-55(venue) 로직을 순수함수 buildScheduleMeta/buildVenueMeta/renderHtml 로 이관(중복 제거·정본화). src/lib/seo.ts:78-100(clip·제목 포맷) 규칙과 1:1 동일하게. | api/p.js·api/s.js 를 meta.js 재사용하도록 리팩터(동작 불변). | NEW middleware.ts(repo root, Vercel Edge, config.matcher=['/']) — req UA 봇 정규식 + ?s/?v 존재 시에만 /api/prerender 로 rewrite. | NEW api/prerender.js(Node) — s/v 파라미터로 Supabase fetch→meta.js 로 완결 HTML(리다이렉트 없이 콘텐츠 자체 노출) + canonical + JSON-LD. | index.html:58-79 홈 JSON-LD(WebSite+Organization) 를 봇 홈 응답에도 포함. | vercel.json rewrites(3-12) 는 UA 분기 불가라 미들웨어로.
- **데이터 모델:** none. Supabase REST 읽기는 anon key(api/p.js:37-38 process.env.VITE_SUPABASE_URL/ANON_KEY 패턴 재사용).
- **접근:** 1) api/_prerender/meta.js 신설: buildScheduleMeta(row)/buildVenueMeta(row)/renderHtml({title,desc,image,url,jsonLd}) 순수함수. seo.ts:93-100(제목 'title | where | NHoldem', desc 155자 clip)·109-135(Event LD)·150-166(LocalBusiness LD) 포맷 복제. 봇 UA 정규식 상수(googlebot, yeti, daumoa, facebookexternalhit, kakaotalk-scrap, twitterbot, slackbot, telegrambot). 2) api/p.js/s.js 를 meta.js 재사용으로 리팩터(회귀 없이). 3) middleware.ts: const ua=req.headers.get('user-agent'); 봇 && (url.searchParams has s|v) 이면 NextResponse.rewrite('/api/prerender'+search); 아니면 통과(정적 index.html). 4) api/prerender.js: ?s(uuid, api/p.js:26 정규식)·?v(code, api/s.js:23) 검증→Supabase fetch→meta.js 로 og:title/description/image + canonical + Event/LocalBusiness JSON-LD 포함 HTML. 사람 오도달 대비 클라 리다이렉트 fallback script. 5) Cache-Control s-maxage=600(api/p.js:86 동일).
- **DoD:** curl -A 'Yeti' https://…/?s=<id> → 데이터 채운 og + Event JSON-LD(200, 리다이렉트 없음). | curl -A 일반브라우저 …/?s=<id> → 기존 index.html(앱) 그대로(개입 0). | Google Rich Results Test/네이버 웹마스터에서 개별 대회 Event 인식. | 카카오톡 공유 디버거에서 루트 /?s= 원문 링크도 카드 노출(현재 /p/ 만 됐던 것 커버). | api/p.js·api/s.js 회귀 없음(Playwright: /p/<id> 응답 og 태그 유지). | vitest: 미들웨어 UA 매처가 사람 UA엔 false·봇+파라미터엔 true(봇 오탐으로 사람에게 프리렌더 누출 없음).
- **의존성:** 없음(기존 인프라 확장). GRW-4(JSON-LD 확대)·GRW-5(@vercel/og)와 meta.js 를 정본으로 공유 — 함께 관리.
- **가드레일:** framer-motion·Icon·Tailwind 무관. 무료 한도: Edge Middleware가 모든 '/' 통과 → matcher='/' 로 좁히고 봇+파라미터일 때만 rewrite(사람 트래픽 함수 실행 0). Supabase egress: 봇 요청만 REST 1건 + s-maxage 600 캐시. 클로킹 아님(봇·사람 동일 콘텐츠, 메타만 서버 프리렌더) → 구글 정책 준수. 500 금지: 오류 시 폴백 메타(api/s.js:55 패턴). CSP는 서버 HTML이라 무관.

#### GRW-3 — 카카오 알림톡 라이프사이클 — SOLAPI/SENS, 고가치 트리거만, 정보성 템플릿
`big-bet` · effort **L** · impact **medium** · 비용: 알림톡 건당 유료 ~8~15원(SOLAPI/NHN SENS). 고가치 트리거(예약확정·대회리마인더·추천보상)만 → 월 소액. 카카오 비즈채널 개설 무료. 친구 아니면 SMS 대체(건당 추가).

- **파일 앵커:** NEW supabase/functions/send-alimtalk/index.ts — supabase/functions/weekly-email-digest/index.ts 구조 복제(Deno.serve, secret_settings 키 로드 12-17, send 헬퍼 19-27, cron anon Bearer 진입). SOLAPI HMAC-SHA256 서명은 함수 내부(_shared 없음). | supabase/migrations/20260818d_secret_settings_and_digest_rows.sql:5-11 secret_settings(RLS 잠김·service_role 전용) — SOLAPI_API_KEY/API_SECRET/ALIMTALK_PFID(플친ID)/ALIMTALK_SENDER 저장소 재사용. | supabase/migrations/20260611c_tournament_reminder_cron.sql — '고가치 트리거' 정본(대회 50~70분 전 리마인더, reminder_sent_at 멱등). 이 in-app notifications INSERT 지점에 알림톡 http_post 훅 추가. | supabase/migrations/20260818e_weekly_email_digest_cron.sql:8-15 — pg_cron+net.http_post+anon Bearer Edge 호출 패턴 복제. | supabase/migrations/20260529_add_consent_fields.sql:16 profiles.agreed_to_marketing — 광고성 게이트(정보성은 예외이나 분류 주의). | profiles 전화번호 없음(20260601b:104 는 auth.users.raw_user_meta_data->>'phone', venues.contact_phone 만) → phone 컬럼 신설. | src/App.tsx 회원설정 — 전화번호 인증 + 수신 토글 UI.
- **데이터 모델:** alter table public.profiles add column if not exists phone text; -- E.164 정규화
alter table public.profiles add column if not exists alimtalk_opt_in boolean not null default false; -- 정보성 수신
alter table public.profiles add column if not exists alimtalk_opt_out_at timestamptz;
create table if not exists public.alimtalk_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  template_code text not null,
  trigger text not null, -- 'reservation_confirmed'|'tournament_reminder'|'referral_rewarded'
  ref_id uuid, status text not null default 'queued', provider_msg_id text,
  created_at timestamptz not null default now(),
  unique (trigger, ref_id, user_id)); -- 멱등: 같은 트리거·대상 1회
alter table public.alimtalk_log enable row level security;
revoke all on table public.alimtalk_log from anon, authenticated; -- service_role 전용
(IF NOT EXISTS·REVOKE FROM PUBLIC·접근은 security definer RPC·search_path 고정)
- **접근:** 1) SOLAPI(또는 NHN SENS) 가입→카카오 비즈채널 연동→정보성 템플릿 3종 심사(예약확정/대회리마인더/추천보상; 변수 #{닉네임}#{대회명}#{시간}; 광고문구·과도한 이모지·외부링크 규정 준수). 2) 승인 template_code 상수화; 키(API_KEY/SECRET/PFID)는 secret_settings INSERT(라이브만, 리포 미커밋 — 20260818d 규약). 3) send-alimtalk Edge: SOLAPI /messages/v4/send, HMAC 서명 헤더, kakaoOptions{pfId,templateId,variables}, type 'ATA', 정보성만 SMS 대체 허용. 4) 트리거 배선(고가치만): (a)예약확정 RPC 성공 후, (b)20260611c 리마인더 cron 알림 루프, (c)referral 보상 지급(20260820d) 시. 각 지점 alimtalk_log 멱등 INSERT 후 pg_net 으로 Edge 호출. 5) 수신 게이트: phone 有 + alimtalk_opt_in + (광고성일 때만 agreed_to_marketing) + 야간(21~08시) 광고성 금지. 6) 회원설정 UI: 전화번호 입력/인증 + 수신 토글(정보성/광고성 분리 문구).
- **DoD:** 정보성 템플릿 3종 카카오 심사 승인. | 예약확정 1건→해당 유저 알림톡 1건(친구 아니면 SMS 대체)+alimtalk_log status='sent'. | 동일 예약 재트리거→멱등키(unique)로 2번째 차단. | opt_in=false/phone 없음→발송 0. | 리마인더 경로: reminder_sent_at 세팅과 알림톡 정확히 1회 동기. | vitest: 수신 게이트(정보성 vs 광고성×야간×동의) 순수함수 분기 테이블 테스트. Playwright: 설정 전화번호/토글 저장 스모크.
- **의존성:** SOLAPI/SENS 계정·카카오 비즈채널·템플릿 심사(오너, 수일 소요). 전화번호 수집 UX 선행. GRW-6 이메일과 이벤트 이중발송(예약확정 등) 채널 정책 조율.
- **가드레일:** framer-motion·Icon·Tailwind 무관. 법적(정통망법): 광고성 정보는 사전동의(agreed_to_marketing)+야간(21-08) 발송금지+수신거부 명시; 정보성(거래·리마인더)은 사전동의 예외이나 템플릿에 광고문구 혼입 시 반려·과태료. 무료 한도: 알림톡 건당 과금 → 고가치 트리거만, 대량 마케팅 발송 금지. 키는 secret_settings(코드 하드코딩 금지). egress: Edge→SOLAPI만, Realtime 200연결 무관. 멱등 unique로 중복 과금 차단.

#### GRW-4 — JSON-LD 확대 — Organization/WebSite(정적) + LocalBusiness AggregateRating/Review + BreadcrumbList + ItemList
`quick-win` · effort **S** · impact **medium** · 비용: 무료(클라 head 조작 + 봇 프리렌더 HTML). 코드 외 비용 0. LocalBusiness 별점 집계는 공개 읽기 RPC 1건(선택, 캐시).

- **파일 앵커:** index.html:58-79 홈 정적 JSON-LD(WebSite+Organization 이미 존재) — WebSite에 potentialAction:SearchAction, Organization에 sameAs(SNS)·contactPoint 추가. | src/lib/seo.ts:51-61 setJsonLd() — 현재 단일 obj만 지원 → @graph 다중노드 배열 허용하도록 소폭 확장(</script 이스케이프 60행 유지). | src/lib/seo.ts:150-166 applyVenueSeo(LocalBusiness) — venue_reviews 집계로 aggregateRating{ratingValue,reviewCount}+상위 review[](최대 3)+priceRange+geo(위경도 有시)+BreadcrumbList(홈>지역>매장). | src/lib/seo.ts:109-135 applyScheduleSeo(Event) — BreadcrumbList(홈>매장>대회) 추가. 단 Event엔 aggregateRating 미부여(대회 후기 없음 — 아래 데이터 주의). | NEW seo.ts applyBrowseListSeo(list) — browse 탭 목록 진입 시 ItemList(itemListElement position+url). src/App.tsx:1541-1544 상세 없을 때(resetSeo 대신) 호출. | supabase/migrations/20260611h_venue_reviews.sql:3-13 venue_reviews(rating 1-5, anon SELECT true 공개) — LocalBusiness 별점 소스. | api/_prerender/meta.js(GRW-2) — 봇용 프리렌더 HTML에 동일 JSON-LD 포함(정본 공유; 봇이 실제로 보는 건 프리렌더).
- **데이터 모델:** none(기존 venue_reviews 재사용). 선택: 매장별 avg(rating)·count(*) 집계 뷰/RPC 추가(security definer, search_path 고정) — 실시간 계산이 무거우면. Event(대회)엔 후기 테이블 없음 → aggregateRating 미출력.
- **접근:** 1) index.html 홈 JSON-LD 확장: WebSite에 potentialAction SearchAction(검색 UI 있으면 target '?q={query}'), Organization에 sameAs(카카오채널·인스타)·contactPoint. 2) seo.ts setJsonLd 를 @graph 다중노드 허용(배열 입력 → {'@context','@graph':[...]}). 3) applyVenueSeo: LocalBusiness에 venue_reviews 집계로 aggregateRating(후기 有시만)+review[](최대 3, author/reviewRating/reviewBody)+priceRange+BreadcrumbList. 4) applyScheduleSeo: Event에 @id·BreadcrumbList. 5) applyBrowseListSeo: 목록 상위 N개 ItemList. 6) meta.js(GRW-2)도 동일 노드 생성.
- **DoD:** Google Rich Results Test: LocalBusiness=aggregateRating/review, Event=offers, Breadcrumb, ItemList 유효(경고 0 목표). | 후기 없는 매장은 aggregateRating 생략(빈 값 출력 금지 — 구글 반려 방지). | setJsonLd @graph 다중노드 직렬화 정상(</script 이스케이프 유지). | 상세 닫으면 resetSeo로 JSON-LD 제거(누수 없음). | vitest: buildLd 순수함수가 후기 유무·필드 결측에 안전(빈 rating 미출력) 스냅샷 테스트.
- **의존성:** GRW-2와 JSON-LD 정본(meta.js) 공유 — 함께. venue_reviews 집계 성능 확인(무거우면 캐시 RPC).
- **가드레일:** framer-motion·Icon·Tailwind 무관(head 조작만, keep-alive 애니 index.css:283 무관). SEO 정책: aggregateRating은 실제 사용자 후기(venue_reviews) 있을 때만 — 허위/조작 별점은 구조화데이터 스팸 수동조치 위험. 빈 배열/undefined 필드는 출력 제외(seo.ts clip/조건부 패턴 유지). Event에 별점 붙이지 말 것(데이터 없음).

#### GRW-5 — @vercel/og 딥링크 OG 이미지 자동생성 — 대회/매장 동적 카드(1200×630)
`nice-to-have` · effort **M** · impact **medium** · 비용: 무료~저가(Vercel Edge 함수 실행수). s-maxage=86400 강캐시로 재생성 억제. 한글 폰트 서브셋 embed(에셋 1회).

- **파일 앵커:** NEW api/og.js — Edge runtime(export const config={runtime:'edge'}), @vercel/og ImageResponse. ?s(대회)/?v(매장) 파라미터로 동적 카드(제목·where·일시·바이인·GTD·포스터 썸네일). | api/p.js:47-59(schedule 필드)·api/s.js:44-53(venue 필드) — 데이터 fetch 로직 재사용(GRW-2 meta.js 경유). | api/p.js:73/api/s.js:65 og:image — 현재 poster_url|icon-512 → og:image 를 ${ORIGIN}/api/og?s=<id> 로(포스터 없거나 저해상도일 때 브랜드 카드). | src/lib/seo.ts:71,102,148 setProp('og:image') — 클라 동적 OG도 /api/og?... 로. | index.html:54 twitter:card 'summary' → 'summary_large_image' 승격(자동 OG 이미지 사용 시); seo.ts twitter 태그 동일. | vercel.json CSP img-src(43) 이미 https: 허용. | package.json deps — @vercel/og 추가.
- **데이터 모델:** none. Supabase REST 읽기(anon key, api/p.js:37-38 패턴).
- **접근:** 1) npm i @vercel/og(또는 Vercel 자동). api/og.js Edge: ImageResponse(JSX, 1200×630). 한글 폰트(Pretendard 서브셋) fetch+embed. 배경=surface #08090A(다크 토큰), accent #5E6AD2(Linear 인디고). 2) 파라미터 검증(?s uuid api/p.js:26 / ?v code api/s.js:23)→Supabase fetch(meta.js)→카드에 제목·where·일시·바이인·GTD·(포스터 有시 우측 썸네일). 3) og:image 배선: api/p.js/s.js·seo.ts 의 og:image 를 /api/og?s=|?v= 로. 정책결정: 항상 브랜드 카드(일관성) vs 고품질 포스터 우선(권장: 항상 생성카드). 4) twitter:card summary_large_image(index.html:54, seo.ts). 5) 캐시 Cache-Control s-maxage=86400, stale-while-revalidate.
- **DoD:** https://…/api/og?s=<id> → 1200×630 PNG, 한글 안깨짐, 제목/바이인/일시 렌더. | 카카오/트위터/슬랙 공유 시 대형 카드(summary_large_image). | 잘못된 id → 브랜드 기본 카드(500 없음). | 빌드/Lighthouse 회귀 없음(Edge 함수는 앱 번들 무관). | Playwright: /api/og 200 + content-type image/png; 폰트 로드 실패 시 시스템폰트 폴백.
- **의존성:** 한글 웹폰트 서브셋 에셋(public 또는 fetch). GRW-2 meta.js(데이터 fetch 공유) 선행 권장. 정책결정: 포스터 우선 vs 항상 생성카드(오너).
- **가드레일:** framer-motion·Icon·Tailwind 무관(서버 이미지, @vercel/og는 satori JSX — 앱 순수SVG 아이콘 규약과 별개). 무료 한도: Edge 함수 실행수 → s-maxage 86400 강캐시로 재생성·egress·호출수 억제. 폰트 embed 크기 주의(서브셋 필수). CSP img-src https 이미 허용. 500 금지(폴백 카드).

#### GRW-6 — Resend 행동트리거 라이프사이클 — 온보딩 드립 + 휴면 윈백(PostHog 코호트/last_active 트리거)
`big-bet` · effort **L** · impact **high** · 비용: 무료(Resend Free 3,000/월·100/일). 초과 시 유료. 도메인 인증(SPF/DKIM) 무료. last_active_at 갱신은 rate-limit(1일 1회)로 쓰기 폭증 방지.

- **파일 앵커:** supabase/functions/weekly-email-digest/index.ts — Resend send 헬퍼(19-27)·secret_settings 키(12-17)·digestHtml(57-66) 정본 재사용. NEW supabase/functions/lifecycle-email/index.ts 로 온보딩/윈백 분기. | supabase/migrations/20260818e_weekly_email_digest_cron.sql:8-15 — pg_cron+net.http_post+anon Bearer 패턴 복제(온보딩 D+1/D+3/D+7, 윈백 D+14/D+30 스캔 cron 5종). | supabase/migrations/20260818d…:15-37 weekly_email_digest_rows() — 대상집계 security definer 패턴 복제. | profiles: email(digest RPC:34)·status·created_at(가입경과)·agreed_to_marketing(20260529:16, 마케팅 동의 게이트) + 신설 last_active_at·lifecycle_state. | GRW-1 PostHog 코호트 — 휴면판정을 PostHog cohort webhook 또는 자체 last_active_at 로(무PostHog 폴백). | src/lib/analytics.ts(GRW-1) 또는 src/App.tsx:1143(첫 데이터 지점) — 앱 활동 시 touch_last_active() RPC(rate-limited).
- **데이터 모델:** alter table public.profiles add column if not exists last_active_at timestamptz;
alter table public.profiles add column if not exists lifecycle_state text not null default 'new'; -- new|onboarding|active|dormant|winback
create table if not exists public.lifecycle_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  step text not null, -- 'onboard_d1'|'onboard_d3'|'onboard_d7'|'winback_d14'|'winback_d30'
  sent_at timestamptz not null default now(),
  unique (user_id, step)); -- 각 단계 1회
alter table public.lifecycle_email_log enable row level security;
revoke all on table public.lifecycle_email_log from anon, authenticated;
create or replace function public.lifecycle_email_candidates(p_step text)
returns table(email text, nickname text, user_id uuid)
language sql stable security definer set search_path to 'public' as $$
  select p.email, p.nickname, p.id from public.profiles p
  where p.email is not null and btrim(p.email)<>''
    and coalesce(p.status::text,'active')='active'
    and p.agreed_to_marketing = true
    and not exists(select 1 from public.lifecycle_email_log l where l.user_id=p.id and l.step=p_step)
    and case p_step
      when 'onboard_d1' then p.created_at < now()-interval '1 day' and p.created_at > now()-interval '2 day'
      when 'winback_d14' then p.last_active_at is not null and p.last_active_at < now()-interval '14 day' and p.last_active_at > now()-interval '15 day'
      else false end; $$;
revoke all on function public.lifecycle_email_candidates(text) from public, anon, authenticated;
grant execute on function public.lifecycle_email_candidates(text) to service_role;
(IF NOT EXISTS·REVOKE·security definer·search_path 고정·IS DISTINCT FROM 준수)
- **접근:** 1) last_active_at 갱신: touch_last_active() RPC(1일 1회 rate-limit) 를 App.tsx:1143 첫 데이터 지점 또는 analytics init 에서 호출. 2) lifecycle-email Edge: {step} 받아 lifecycle_email_candidates RPC→Resend send(weekly-digest 헬퍼 재사용)→lifecycle_email_log 멱등 INSERT. 온보딩(프로필완성·첫 매장팔로우·도구소개 드립), 윈백(이번주 근처 대회·놓친 소식). 3) cron 5종(net.http_post, 20260818e 패턴): onboard_d1/d3/d7, winback_d14/d30 각기 다른 시각. 4) PostHog 연동(선택·상위): cohort→webhook 으로 dormant 마킹; 없으면 last_active_at 폴백으로 우선 출시(독립 가능). 5) 수신거부: 이메일 하단 unsubscribe(서명 토큰→agreed_to_marketing=false). 라이프사이클은 marketing 동의자 한정. 6) digestHtml 브랜드 톤 재사용, 단계별 CTA 딥링크(?s/?v).
- **DoD:** 가입 D+1 동의자 1명→onboard_d1 1건+log(unique로 재발송 없음). | last_active 14일 경과 동의자→winback_d14 1건. | agreed_to_marketing=false→발송 0(법적). | Resend 무료 레이트(2/s) 준수(digest 600ms 슬립 재사용, weekly-email-digest:52). | 미동의/무이메일/정지회원 제외. | vitest: candidates 분기(단계별 경과일·멱등·동의) 순수함수 미러링 or pgTAP. Playwright: unsubscribe→agreed_to_marketing off 스모크.
- **의존성:** GRW-1(PostHog 코호트) — 상위 트리거가 의존(없으면 last_active_at 폴백으로 독립 출시 가능). Resend 도메인 인증(SPF/DKIM, nuriholdem.com) — 20260818e:3 주석대로 미인증 시 계정 소유자에게만 도달 → 실사용 전 필수(secret_settings.RESEND_FROM 교체). GRW-3 과 예약확정 등 이벤트 이중발송 정책 조율.
- **가드레일:** framer-motion·Icon·Tailwind 무관. 법적(정통망법): 광고성 이메일은 사전동의(agreed_to_marketing)·제목 (광고) 표기·수신거부 명시·야간(21-08) 발송 금지. 무료 한도: Resend Free 3,000/월·100/일 → 단계별 상한·배치 슬립(600ms). 키는 secret_settings(코드 하드코딩 금지). last_active_at 갱신 rate-limit(쓰기 폭증·egress 방지). cron은 pg_cron·net.http_post(Realtime 200연결 무관). 멱등 unique로 중복 발송 차단.

### 영역 · 개발 자동화·DevEx (DEV)

#### DEV-1 — Supabase 스키마 CI 게이트 — db lint + 임시DB 마이그 적용 + gen types 드리프트
`big-bet` · effort **L** · impact **high** · 비용: 무료(GitHub Actions 러너 분 + Postgres17 서비스 컨테이너). 라이브 DB 무접속.

- **파일 앵커:** 신규 .github/workflows/db-ci.yml (기존 .github/workflows/ci.yml:18 build-and-e2e 와 별 job). 재사용: devDep `supabase`^2.102.0(npx supabase), supabase/config.toml([db] major_version=17, project_id=nuri-holdem), supabase/baseline/2026-07-20-live-snapshot.sql, supabase/migrations/*.sql(97개). 신규 생성: src/lib/database.types.ts(gen types 산출물, 최초 PR에서 커밋) → src/lib/supabase.ts:11-14 createClient 를 createClient<Database> 로 승격.
- **데이터 모델:** none(스키마 변경 아님, 검증 전용). 단 CI 재현을 위해 baseline 스냅샷→migrations 순 적용. 주의: pg_cron/pg_net 확장이 vanilla postgres:17 에 없어 cron.schedule/net.http_post 호출 마이그(20260610f·20260611c·20260818a·20260818c·20260818e·20260603e·20260623o·20260818f)가 실패 → job 프리스텝에서 `CREATE SCHEMA IF NOT EXISTS cron; CREATE SCHEMA net;` + no-op 스텁 함수(cron.schedule/cron.unschedule/net.http_post 시그니처) 주입 또는 `CREATE EXTENSION IF NOT EXISTS` 시도 후 폴백.
- **접근:** 1) job: services 로 postgres:17 기동(POSTGRES_PASSWORD, 5432). 2) 확장/크론 스텁 SQL 주입(위 data_model). 3) psql 로 baseline/2026-07-20-live-snapshot.sql 적용. 4) migrations 를 파일명 정렬 순으로 psql 일괄 적용(⚠ 네이밍이 20260820g_ 형식이라 supabase migration up 표준 파서와 불일치 — 직접 psql \i 루프 권장). 5) `supabase db lint --db-url postgres://…` (또는 sqlfluff) 로 스키마 린트, ERROR 시 fail. 6) `supabase gen types typescript --db-url … > /tmp/db.types.ts` 후 `git diff --no-index src/lib/database.types.ts /tmp/db.types.ts` → 차이 시 fail(드리프트=미커밋 스키마 변경 감지). 7) PR 코멘트에 lint 요약.
- **DoD:** AC: (a) 신규 마이그 추가 PR 이 baseline+전체 적용에 성공해야 그린. (b) database.types.ts 미갱신 채 스키마 바꾼 PR 은 드리프트로 레드. (c) db lint ERROR 0. 테스트: 의도적으로 컬럼 추가 마이그만 넣고 types 미갱신한 브랜치가 레드가 되는지 1회 검증. vitest N/A. 기존 ci.yml 게이트와 병렬 통과.
- **의존성:** 선행: 최초 PR 에서 src/lib/database.types.ts 를 실 스키마로 1회 생성·커밋(오너가 라이브 db-url 또는 baseline 기반 생성). SUPABASE 라이브 접속 없이 baseline 로만 재현할지(권장) vs SUPABASE_DB_URL 시크릿 사용할지 오너 결정. DEV-4(zod supazod)가 이 types 파일에 의존.
- **가드레일:** 라이브 DB 절대 미접속(ephemeral 컨테이너만). service_role/DB 비번 시크릿 로그 미노출. 하드코딩 anon JWT(20260818e:12 등 2건)는 스텁 net.http_post 로 무해화. 표준 supabase migrations 네이밍 미준수 인지 — 파서 대신 정렬 psql 적용. 무료 한도 무관(CI 로컬 DB).

#### DEV-2 — Claude Code PR 리뷰봇 — claude-code-action@v1, CLAUDE.md 규약 프롬프트
`quick-win` · effort **S** · impact **medium** · 비용: Anthropic API 사용량(PR당 토큰). ANTHROPIC_API_KEY 시크릿 필요.

- **파일 앵커:** 신규 .github/workflows/claude-review.yml (anthropics/claude-code-action@v1, SHA 핀). 프롬프트 소스: CLAUDE.md 하드 규칙 + .claude/hooks/nuri-guard.mjs:23-36 banned 목록(framer-motion/motion, lucide·phosphor·react-icons 등 아이콘 라이브러리, @tailwindcss/vite v4) + .claude/skills/nuri-ui/SKILL.md(keep-alive index.css:283/384-385, Icon.tsx PATHS, SlidingPill FLIP) + nuri-migration/SKILL.md(REVOKE FROM PUBLIC·IS DISTINCT FROM·search_path).
- **데이터 모델:** none.
- **접근:** 1) on: pull_request(types opened/synchronize) + issue_comment(@claude). 2) permissions: contents:read, pull-requests:write, id-token:none. 3) claude-code-action@v1 를 SHA 핀, anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}. 4) 커스텀 프롬프트: '이 diff 를 CLAUDE.md 규약으로 검토 — framer-motion/motion import 금지, 새 아이콘 라이브러리 금지(Icon.tsx PATHS 만), Tailwind v4 마이그 금지, 신규 진입 애니 클래스는 index.css:283 :is()+384-385 reduced-motion 동시등록, DB 변경 시 nuri-migration ACL/search_path, 개인정보(이메일/실명/금액) 공개 prop 노출'. 5) 라벨/경로 필터로 노이즈 억제(docs-only skip). 6) 리뷰는 코멘트만(자동 머지·푸시 금지).
- **DoD:** AC: (a) framer-motion import 를 추가한 데모 PR 에서 봇이 규약 위반 코멘트. (b) 정상 PR 은 승인성 요약. (c) 봇 권한이 pull-requests:write 로 한정. 테스트: 위반/정상 2 PR 로 수동 검증. 기존 ci.yml 게이트에 영향 없음.
- **의존성:** 선행: 리포 시크릿 ANTHROPIC_API_KEY 등록(오너). 포크 PR 은 시크릿 미노출 → pull_request_target 미사용(보안), 내부 브랜치 PR 우선.
- **가드레일:** 액션 SHA 핀 필수(공급망). 최소권한 permissions. 봇은 어드바이저리(자동 커밋/머지 금지). 프롬프트에 시크릿·PII 미포함. nuri-guard 훅과 규칙 중복은 의도(로컬=훅, 원격=봇 이중망). 무료 아님(API 과금) — 경로/라벨 게이팅으로 비용 억제.

#### DEV-3 — Dependabot — 그룹+cooldown, 보안 즉시, 확정 스택 메이저 잠금
`quick-win` · effort **S** · impact **medium** · 비용: 무료.

- **파일 앵커:** 신규 .github/dependabot.yml. 대상 매니페스트: 루트 package.json(npm), .github/workflows/*.yml(github-actions). 확정 스택 참조: CLAUDE.md '스택(확정—변경 금지)' + package.json(tailwindcss ^3.4.19, vite ^8, react ^19, typescript ~6.0).
- **데이터 모델:** none.
- **접근:** 1) updates: ecosystem npm(directory /) weekly, ecosystem github-actions weekly. 2) groups: `minor-patch`(update-types minor+patch) 단일 PR 묶음, `dev-deps`(dependency-type development) 별도. 3) cooldown: default-days 7(신규 릴리스 즉시 채택 방지). 4) ignore: tailwindcss [version-update:semver-major](v4 금지), vite/react/react-dom/typescript major 잠금(확정 스택). 5) 보안 업데이트는 Dependabot security updates(리포 Settings 토글)로 그룹/쿨다운 무시하고 즉시. 6) open-pull-requests-limit 5, labels: deps.
- **DoD:** AC: (a) 첫 주기 후 minor/patch 그룹 PR 1개 생성. (b) tailwindcss v4·vite v9 등 메이저 PR 미생성. (c) 보안 권고 시 즉시 PR. 테스트: dependabot.yml 스키마 유효성(GitHub Insights>Dependency graph>Dependabot 로그 확인). 기존 CI 가 dependabot PR 에도 돌아 게이트.
- **의존성:** 선행: 리포 Settings→Code security→Dependabot security updates ON(오너). 그룹 PR 은 DEV-5 SAST/DEV-1 게이트 통과 필요.
- **가드레일:** CLAUDE.md 확정 스택 위반 방지 — 메이저 ignore 명시(Tailwind v3.4 고정, framer-motion 재도입 불가). 자동 머지 미설정(사람 리뷰). github-actions 업데이트가 DEV-5 SHA핀과 충돌 않도록 Dependabot 이 SHA 핀 유지하며 코멘트로 버전 표기. 무료 한도 무관.

#### DEV-4 — zod v4 신뢰경계 검증 — Edge/RPC/PortOne 페이로드, supazod 자동파생
`big-bet` · effort **L** · impact **high** · 비용: 무료(zod OSS). 웹 번들 +~12KB(경계 전용, 트리셰이크).

- **파일 앵커:** 웹: 신규 src/lib/schemas.ts(zod), 적용처 src/api/identity.ts:5(verifyIdentity 인자), src/api/vouchers.ts·ledger.ts RPC 반환 파싱, PortOne 콜백(src/components/features/IdentityVerificationButton.tsx, App.tsx:2075 배너 경로). 엣지: 신규 supabase/functions/_shared/schemas.ts, 적용처 supabase/functions/verify-identity/index.ts:41-45(수기 typeof body.x 검증 → zod safeParse), gemini/gto-explain/send-push/weekly-* index.ts 의 req.json(). supazod 입력=DEV-1 src/lib/database.types.ts.
- **데이터 모델:** none. (검증 로직만; DB 스키마 불변)
- **접근:** 1) devDep zod@^4 + supazod. 2) supazod 로 database.types.ts → src/lib/db.zod.ts 자동생성(RPC args/returns·Row 스키마), package.json 스크립트 `zod:gen` + DEV-1 gen types 뒤 CI 드리프트 체크. 3) 엣지: _shared/schemas.ts 에 zod 를 `npm:zod@4`(Deno) import, 각 함수 진입부 `const p = Schema.safeParse(await req.json()); if(!p.success) return json({error},400)`. verify-identity:41-45 의 idv 다중키 폴백을 z.union 으로. 4) 웹: supabase.functions.invoke/rpc 결과를 schemas 로 parse 후 사용(런타임 계약 위반=Sentry 리포트 via monitoring.ts). 5) PortOne 결제/본인인증 응답 필드(status·verifiedCustomer.ci)를 zod 로 강제.
- **DoD:** AC: (a) verify-identity 에 잘못된 body 전송 시 400+명확 메시지(기존 수기검증 동치 이상). (b) RPC 반환 형상 변경이 웹에서 parse 에러로 조기 표면화. (c) supazod 산출물 미갱신 시 CI 드리프트 레드. 테스트: vitest src/lib/schemas.test.ts(정상/누락/타입불일치 케이스), 엣지는 로컬 supabase functions serve 로 400 스모크. e2e/auth-smoke 회귀 없음.
- **의존성:** 선행: DEV-1(database.types.ts) 존재해야 supazod 파생. 엣지함수는 eslint.config.js:11-12 에서 lint 제외라 @ts-nocheck 유지 가능.
- **가드레일:** 엣지는 esm.sh/npm: import 만(웹 번들과 분리) — zod 를 메인 청크에 eager 반입 금지(경계 모듈에서만 import, vite manualChunks 자연분할). PortOne CI 등 민감정보는 서버(verify-identity)에서만 취급, 스키마 에러 메시지에 PII 미노출. 무료 egress 무관(검증은 클라/엣지 로컬). Tailwind/아이콘/모션 규약 무관.

#### DEV-5 — CI 하드닝 + 무료 SAST — 액션 SHA핀·최소권한·osv-scanner·Semgrep·시크릿스캔
`critical-now` · effort **M** · impact **high** · 비용: 무료(osv-scanner·Semgrep OSS 엔진·gitleaks 전부 무로그인). 러너 분만.

- **파일 앵커:** 편집 .github/workflows/ci.yml — actions/checkout@v4(L26)·actions/setup-node@v4(L28)·actions/upload-artifact@v4(L63) 를 커밋 SHA 핀, 최상위 `permissions: contents: read` 추가(현재 블록 없음=기본 광범위 토큰). 신규 .github/workflows/security.yml(osv-scanner, semgrep, gitleaks). 시크릿 스캔 대상 예외: supabase/migrations/20260818e_weekly_email_digest_cron.sql:12 및 1건 더의 하드코딩 anon JWT.
- **데이터 모델:** none.
- **접근:** 1) ci.yml: 모든 3rd-party 액션 @vN → @<40hex SHA>(코멘트로 버전 병기), job/workflow permissions 최소화(build job 은 contents:read, upload-artifact 는 동일 토큰 충분). 2) security.yml on push/PR: google/osv-scanner-action(package-lock.json 취약점), semgrep OSS(`semgrep ci` p/typescript·p/react·p/owasp-top-ten, 무로그인), gitleaks 또는 trufflehog(시크릿). 3) gitleaks .gitleaks.toml allowlist 에 anon JWT 정규식 추가(공개키·RLS 보호 설계라 의도적). 4) SARIF 업로드→ code scanning 탭. 5) 초기 continue-on-error 로 관측 후 게이트 승격.
- **DoD:** AC: (a) ci.yml 액션 전부 SHA 핀. (b) 워크플로 토큰 read-only. (c) osv/semgrep/gitleaks 3잡 그린, 신규 실취약점은 레드. (d) anon JWT 오탐 억제. 테스트: 더미 secret(sk-…) 커밋한 브랜치가 gitleaks 레드가 되는지 1회. 기존 build-and-e2e 무회귀.
- **의존성:** 없음(독립). DEV-3 dependabot 이 SHA 핀을 유지·갱신하도록 config 정합.
- **가드레일:** anon JWT 는 공개·RLS 보호 설계 — 폐기 아닌 allowlist(단, 장기적으로 크론을 Vault/secret_settings 로 이전 권장 = 별도 티켓). Semgrep 은 OSS 엔진만(SaaS 로그인·유료 금지). SARIF public 리포 노출 주의. 라이브 DB 무접속. 무료 한도 무관.

#### DEV-6 — Knip 죽은코드/미사용 export·의존성 게이트
`quick-win` · effort **M** · impact **medium** · 비용: 무료(knip OSS). 러너 분만.

- **파일 앵커:** 신규 knip.json + package.json scripts 에 `knip`. 엔트리: src/main.tsx, api/{p,s,sitemap}.js(Vercel 서버리스), supabase/functions/*/index.ts(Deno), scripts/*.mjs, e2e/**/*.spec.ts, *.stories.tsx(DEV-13). 오탐 주의 자산: src/App.tsx(180KB 모놀리식·다수 내부 export), src/lib/nash.data.ts(99KB)·ranges.data.ts 데이터, src/mock/*, src/components/atoms/Icon.tsx(PATHS 동적참조), lazyWithReload.ts 지연 라우트.
- **데이터 모델:** none.
- **접근:** 1) devDep knip. 2) knip.json: entry/project 지정, ignore 에 dist·public·supabase/functions(별 툴체인)·nash.data/ranges.data(데이터 상수). ignoreDependencies 에 런타임 전용(@portone/browser-sdk 조건부, html5-qrcode lazy). 3) 최초 `--reporter compact` 로 베이스라인 수집(리포트만, 비게이트). 4) 명백한 죽은 export/미사용 devDep 정리 PR 후 CI 잡 추가(신규 미사용만 fail = `--no-exit-code` 제거). 5) Icon PATHS 처럼 문자열 키 동적참조는 knip ignore 로 화이트리스트.
- **DoD:** AC: (a) knip 그린 베이스라인. (b) 미사용 export 새로 추가 시 레드. (c) Icon PATHS/lazy 라우트 오탐 0. 테스트: 미사용 함수 추가 브랜치가 레드가 되는지 1회. 기존 lint/build 무회귀.
- **의존성:** DEV-13(*.stories.tsx) 도입 시 엔트리에 포함(Ladle 스토리가 아톰 export 를 살아있게 표시). 대형 정리 PR 은 DEV-2 봇 리뷰 권장.
- **가드레일:** Icon.tsx PATHS 단일소스 — 동적 키 참조 아이콘을 '미사용'으로 오판·삭제 금지(ignore 필수, CLAUDE.md 아이콘 규약). App.tsx 대수술 유발 금지(관심사 1개씩). framer-motion/모션 무관. 무료·라이브 DB 무관.

#### DEV-7 — Claude 서브에이전트 .claude/agents/ — rls-auditor·migration-reviewer·egress-watchdog
`quick-win` · effort **S** · impact **medium** · 비용: 무료(로컬 에이전트 정의). 호출 시 모델 토큰만.

- **파일 앵커:** 신규 .claude/agents/rls-auditor.md, migration-reviewer.md, egress-watchdog.md(프론트매터 name/description/tools). 규칙 소스 재사용: .claude/skills/nuri-migration/SKILL.md(§1 REVOKE FROM PUBLIC, §2 search_path=public,pg_temp, §3 IS DISTINCT FROM, §5 어드바이저 ERROR 0), nuri-ship/SKILL.md. 대상 코드: supabase/migrations/*.sql, 엣지함수, src/api/*.ts 의 실시간 구독. Supabase MCP get_advisors 연동.
- **데이터 모델:** none(어드바이저리 전용, 쓰기 없음).
- **접근:** 1) rls-auditor: 신규/변경 마이그의 RLS·GRANT 를 스캔 — CREATE OR REPLACE 후 REVOKE/GRANT 재명시 누락, FROM anon 만 쓴 곳(무효), NULL-safe 가드(<> vs IS DISTINCT FROM) 지적. tools: Read/Grep + supabase get_advisors. 2) migration-reviewer: IF NOT EXISTS·DROP IF EXISTS 멱등성, 반환타입 변경 시 DROP FUNCTION+ACL 복원, 기존 행 0영향(신규필드 optional·폴백=현행값) 확인. 3) egress-watchdog: src/api·컴포넌트의 신규 supabase.channel()/realtime 구독이 '보는 화면 게이팅' 없이 상시연결인지, unbounded select(.select('*') without limit)인지 플래그(무료 200연결·5GB egress). 4) 각 에이전트 description 에 자동위임 트리거 문구.
- **DoD:** AC: (a) fail-open(<> 'admin') 마이그 샘플에 rls-auditor 가 IS DISTINCT FROM 교정 제시. (b) 상시 realtime 구독 추가 시 egress-watchdog 경고. (c) 반환타입 변경 마이그에서 ACL 복원 누락 지적. 테스트: 3개 위반 스니펫으로 각 1회 수동 위임 검증(코드 변경 없음).
- **의존성:** 선행: Supabase MCP 인증(get_advisors 사용 시). nuri-migration/nuri-ship 스킬 존재(이미 있음).
- **가드레일:** 에이전트는 읽기·조언만(마이그 자동적용·라이브 쓰기 금지). nuri-migration 규약과 1:1 정합(중복 아닌 자동화). get_advisors 는 라이브 조회만(변경 없음). 무료 한도 인지 로직을 egress-watchdog 에 내장(Realtime 200연결·egress 5GB).

#### DEV-8 — 추가 훅 — PostToolUse eslint --fix + Stop tsc --noEmit
`quick-win` · effort **S** · impact **medium** · 비용: 무료. 로컬 에디트마다 eslint 1파일 + 세션 종료 시 tsc 1회(수초).

- **파일 앵커:** 편집 .claude/settings.json(현재 PreToolUse nuri-guard 만, L2-14). 유지: .claude/hooks/nuri-guard.mjs(PreToolUse Edit|Write|MultiEdit). 신규 훅 스크립트 .claude/hooks/post-eslint.mjs·stop-tsc.mjs(크로스플랫폼, Windows PowerShell 환경). 참조: eslint.config.js(supabase/functions·dist·public ignore), package.json build=tsc -b.
- **데이터 모델:** none.
- **접근:** 1) settings.json 에 PostToolUse(matcher Edit|Write|MultiEdit) 추가 → post-eslint.mjs: stdin JSON 의 tool_input.file_path 파싱, src/ 하위 .ts/.tsx 만 `npx eslint --fix <file>`(엣지/public 제외, nuri-guard 와 동일 경로필터). 2) Stop 훅 추가 → stop-tsc.mjs: `npx tsc -b --noEmit`(증분) 실행, 에러 시 exit 2 로 세션에 타입에러 표면화(비차단 경고 or 차단은 오너 선택). 3) node .mjs 로 작성(readFileSync(0) 패턴은 nuri-guard.mjs:7 재사용), 경로 정규화 \→/(nuri-guard.mjs:12 동일). 4) 성능: Stop tsc 는 tsc -b 증분캐시로 수초.
- **DoD:** AC: (a) src ts 저장 시 eslint --fix 자동적용(포맷/간단룰). (b) 타입에러 잔존 채 Stop 시 tsc 가 알림. (c) 기존 PreToolUse nuri-guard 정상 유지(금지 import 차단). 테스트: 미사용 변수 넣은 저장→자동수정, any 타입에러→Stop 알림 각 1회.
- **의존성:** 없음. DEV-1 database.types.ts 도입 후 tsc 가 <Database> 타입까지 검사(상호보완).
- **가드레일:** PreToolUse nuri-guard 절대 제거·약화 금지(framer-motion/아이콘/Tailwind v4 차단 유지). eslint --fix 는 src ts/tsx 한정(엣지함수 @ts-nocheck·public sw.js 제외 — eslint.config.js:9-15 정합). Stop tsc 가 매 Stop 느려지면 -b 증분 필수. Windows 경로 처리(replace \→/). 크로스플랫폼 node 실행.

#### DEV-9 — 스케줄 운영 다이제스트 — Supabase Advisors + Sentry → GH Issue 자동집계
`nice-to-have` · effort **M** · impact **medium** · 비용: 무료(GH Actions cron). SUPABASE_ACCESS_TOKEN·SENTRY_AUTH_TOKEN 시크릿.

- **파일 앵커:** 신규 .github/workflows/ops-digest.yml(on schedule cron 예: 매주 월 00:00 UTC). 데이터원: Supabase Advisors(get_advisors security/performance, project ref idsxiqspecrucvfvtgbw) via Management API 또는 supabase CLI, Sentry Issues API. 참조: src/lib/monitoring.ts(Sentry DSN 게이팅·현재 미활성), src/lib/errorLog.ts(인앱 수집). GH Issue 생성=actions/github-script(SHA핀).
- **데이터 모델:** none. 토큰은 secret_settings(RLS 전면잠금·service_role, nuri-migration §6) 아닌 GH Actions Secrets 에 보관(리포 시크릿).
- **접근:** 1) 주간 cron job. 2) Supabase advisors 조회(REST Management API `/v1/projects/{ref}/advisors` 또는 CLI), security ERROR·performance WARN 카운트. 3) Sentry API 로 최근 7일 미해결 이슈 top-N(레벨·빈도). 4) 마크다운 다이제스트 합성 후 github-script 로 라벨 `ops-digest` 붙은 이슈를 upsert(기존 열린 이슈 있으면 코멘트, 없으면 생성). 5) 임계치(security ERROR>0) 초과 시 이슈 제목에 🔴. 6) 실패해도 워크플로 비차단(운영 알림 목적).
- **DoD:** AC: (a) 주간 실행 시 advisors+Sentry 요약 이슈 1건 생성/갱신. (b) security ERROR>0 이 상단 강조. (c) 토큰 미설정 시 우아한 skip(레드 아님). 테스트: workflow_dispatch 수동트리거로 이슈 생성 1회 확인.
- **의존성:** 선행: Sentry 활성화(monitoring.ts:12 VITE_SENTRY_DSN 설정+주석해제, 현재 미가동) → 미가동이면 Advisors-only 로 축소 출시. SUPABASE_ACCESS_TOKEN(오너), SENTRY_AUTH_TOKEN(오너).
- **가드레일:** advisors 결과에 스키마 세부 노출 — public 리포면 이슈에 민감정보 redact 또는 private 리포 한정. 토큰 최소권한(read). issues:write 만. Sentry 무료 플랜 이벤트 쿼터 인지. 라이브 DB 는 조회만(Management API·변경 없음). get_advisors 결과=조언(자동조치 금지).

#### DEV-10 — 시각 회귀 — Playwright toHaveScreenshot (+선택 Argos)
`big-bet` · effort **M** · impact **medium** · 비용: 무료(로컬 스냅샷). Argos 채택 시 무료 티어(월 스크린샷 한도).

- **파일 앵커:** 신규 e2e/visual.spec.ts + e2e/visual.spec.ts-snapshots/(베이스라인 커밋). 재사용: playwright.config.ts(mobile-chromium Pixel 7 412px:24, 포트4173 prod빌드 webServer:37-46), 기존 e2e/design-tokens.spec.ts·motion.spec.ts·sliding-pill.spec.ts. 결정성: src/index.css:283(keep-alive 진입애니 무효화)·384-385(prefers-reduced-motion). CI: .github/workflows/ci.yml:47 이미 chromium 설치.
- **데이터 모델:** none.
- **접근:** 1) visual.spec.ts: 핵심 화면 스냅샷 — browse(기본탭 일정목록), tools(GTO 그리드·ACTION_COLORS/EQUITY_BANDS 밀도뷰), 장부(ledger), community. 2) 결정성 확보: playwright use 에 `reducedMotion:'reduce'`(index.css:384-385 애니 정지) + 폰트(Pretendard) 로드 대기 + 동적 시간/랜덤 마스킹(mask 옵션 또는 고정 시드). 3) `expect(page).toHaveScreenshot({maxDiffPixelRatio:0.01})`. 4) 스냅샷은 CI 와 동일 환경(ubuntu 러너 or Docker mcr.microsoft.com/playwright)에서 생성해 폰트 AA 드리프트 방지. 5) 별 프로젝트/그렙 태그 @visual 로 분리(main 스모크와 독립). 6) 선택: @argos-ci/playwright 로 클라우드 diff·PR 코멘트(무료 티어).
- **DoD:** AC: (a) 핵심 4화면 베이스라인 그린. (b) 의도적 색/여백 변경 시 diff 검출. (c) keep-alive 재방문·모션으로 인한 flaky 0(reducedMotion·마스킹). 테스트: 버튼색 1px 변경 브랜치가 레드가 되는지 1회. 기존 test:e2e main/boot 무회귀.
- **의존성:** 베이스라인은 CI 러너 환경에서 최초 생성·커밋(로컬 Windows 생성 금지 — 폰트 AA 상이). Argos 채택은 오너 결정(토큰).
- **가드레일:** keep-alive 진입 애니(index.css:283)·prefers-reduced-motion(384-385)로 스냅샷 안정화 필수 — 미적용 시 탭 재방문마다 애니 재생→flaky. framer-motion 무관(제거됨). 시맨틱 색 분리(ACTION_COLORS vs EQUITY_BANDS, nuri-ui) 회귀 감시에 유용. 스냅샷 OS/폰트 종속 → Docker 고정. 무료 한도 무관.

#### DEV-11 — size-limit 번들 예산 — PR 코멘트 게이트
`quick-win` · effort **S** · impact **medium** · 비용: 무료(size-limit OSS + andresz1/size-limit-action).

- **파일 앵커:** 신규 .size-limit.json + package.json scripts `size`. 청크 정의 재사용: vite.config.ts:25-33 manualChunks(vendor-react, vendor-supabase). 예산 대상: dist/assets 의 엔트리+vendor. 이미 존재하는 부팅예산 e2e/boot-budget.spec.ts(@boot)와 상보. 지연화 확인: src/lib/nash.data.ts(99KB)·ranges.data.ts, qrcode·kakao-maps lazy.
- **데이터 모델:** none.
- **접근:** 1) devDep size-limit + @size-limit/preset-app(또는 file). 2) .size-limit.json: 엔트리 청크(index-*.js)·vendor-react·vendor-supabase 각 gzip 예산 지정(현행 build 산출 측정 후 +여유). 3) CI: andresz1/size-limit-action(SHA핀)로 base 대비 PR delta 코멘트. 4) nash.data/ranges.data 가 eager 로 새면 예산초과로 표면화(지연 라우트 유지 강제). 5) 초기 warn(비차단)→안정 후 fail 승격.
- **DoD:** AC: (a) PR 에 번들 delta 코멘트. (b) nash.data 를 eager import 로 바꾼 브랜치가 예산초과 레드. (c) vendor 청크 예산 개별 추적. 테스트: 대형 상수 eager 반입 브랜치로 초과 1회 검증. build(ci.yml:44) 무회귀.
- **의존성:** 없음. DEV-6(knip) 와 함께 번들 위생 이중망. vite manualChunks(vite.config.ts) 구조 의존.
- **가드레일:** 지연 라우트 전용 대형자산(nash.data.ts 99KB·ranges.data.ts·qrcode·kakao-maps)을 eager 화 금지(vite.config.ts:29-32 catch-all 금지 주석 정합). 예산은 엔트리+안정 vendor 만(lazy 제외). 재방문 캐시(vendor 분리) 의도 보존. 무료·라이브 DB 무관.

#### DEV-12 — commitlint + git-cliff — 한국어 컨벤셔널 커밋·자동 체인지로그
`nice-to-have` · effort **S** · impact **low** · 비용: 무료.

- **파일 앵커:** 신규 commitlint.config.js + cliff.toml + .github/workflows(wagoid/commitlint-github-action, SHA핀) 또는 기존 ci.yml job 추가. 현행 커밋 스타일 참조: git log(feat(보안):·perf:·fix:·feat+fix: 한국어 subject, Co-Authored-By 트레일러). 훅 연동은 .claude/hooks(husky 부재) 또는 CI 검사만.
- **데이터 모델:** none.
- **접근:** 1) devDep @commitlint/cli+@commitlint/config-conventional. 2) commitlint.config.js: extends config-conventional, rules 완화 — subject-case off(한국어), type-enum 에 기존 feat/fix/perf/refactor/docs/chore/test 유지+한국어 scope 허용, header-max-length 100, body/footer 자유(Co-Authored-By 트레일러 허용). 3) CI: PR 커밋/제목 검사(wagoid action). husky 부재이므로 로컬 강제는 선택(commit-msg 훅 대신 CI 게이트 우선). 4) git-cliff: cliff.toml 로 conventional 커밋→CHANGELOG.md, 태그 시 워크플로로 생성. 5) 기존 라이브 커밋에 소급 안 함(신규만).
- **DoD:** AC: (a) 비컨벤셔널 커밋 PR 이 레드. (b) `git cliff` 로 CHANGELOG 생성. (c) 한국어 subject·Co-Authored-By 통과. 테스트: 'wip' 커밋 브랜치 레드 + 'feat: x' 그린 각 1회.
- **의존성:** 없음. git-cliff 는 릴리스 태깅 흐름 도입 시 유용(오너의 버전/릴리스 정책 결정).
- **가드레일:** 현행 한국어 scope(feat(보안))·Co-Authored-By 트레일러 규칙과 충돌 금지(rules 완화 필수). 라이브 히스토리 소급/리라이트 금지. 로컬 훅 도입 시 .claude PreToolUse nuri-guard 와 무간섭. 무료·라이브 DB 무관.

#### DEV-13 — Ladle 컴포넌트 카탈로그 — Storybook 대신(Vite 네이티브)
`nice-to-have` · effort **M** · impact **medium** · 비용: 무료(@ladle/react OSS). 정적 빌드 호스팅 선택.

- **파일 앵커:** 신규 devDep @ladle/react + .ladle/config.mjs + src/components/atoms/*.stories.tsx. 우선 대상 아톰: Icon.tsx(PATHS 글리프 전체), SlidingPill.tsx·SegmentedTabs.tsx·StatefulActionButton.tsx(FLIP), EmptyState·Skeleton·LoadErrorCard·TierBadge·Toast·ThemeToggle. 전역 스타일 로드: src/index.css(surface/accent 토큰), tailwind.config.js(darkMode:'class'). 참조: nuri-ui/SKILL.md 재사용 우선 목록.
- **데이터 모델:** none.
- **접근:** 1) devDep @ladle/react(Vite8 호환). 2) .ladle/config.mjs + .ladle/components.tsx 에서 src/index.css import(Tailwind v3 유틸·토큰 주입)·darkMode 클래스 토글 프로바이더(ThemeToggle 재사용). 3) 아톰별 *.stories.tsx: Icon 은 PATHS 키 맵핑 그리드(단일소스 시각확인), SlidingPill/SegmentedTabs 는 상태전환, EmptyState/Skeleton/LoadErrorCard/TierBadge 변형. 4) package.json `ladle serve`/`ladle build`. 5) 선택: ladle build 정적산출물 CI 아티팩트/미리보기. 6) DEV-6 knip 엔트리에 *.stories.tsx 등록(오탐방지·아톰 export 생존).
- **DoD:** AC: (a) ladle serve 로 아톰 카탈로그 렌더. (b) 라이트/다크 토글 정상(darkMode class). (c) Icon 스토리에 PATHS 전 글리프. (d) ladle build 성공. 테스트: 대표 5아톰 스토리 렌더 스모크(수동) + build 무에러. 기존 vite build(ci.yml:44) 무회귀.
- **의존성:** DEV-6(knip) 엔트리에 스토리 포함. Vite 8 + @ladle/react 버전 호환 확인(package.json 선확인 — CLAUDE.md 규칙).
- **가드레일:** Storybook(webpack) 도입 금지 — Ladle(Vite) 만(스택 정합). Icon.tsx PATHS 단일소스 유지(스토리는 소비만·새 아이콘 라이브러리 금지, nuri-guard 차단). framer-motion/motion 금지(FLIP·CSS 데모만). Tailwind v3.4 토큰만(임의 hex·신규 fontSize 금지). darkMode:'class' 정합. keep-alive 무관(격리 렌더).

### 영역 · 접근성·성능·PWA (AXP)

#### AXP-1 — 실사용자 CWV 수집 — web-vitals v5 attribution → GA4 (INP 우선)
`quick-win` · effort **S** · impact **medium** · 비용: web-vitals gzip ~2KB(별도 청크·유휴 로드). GA4 이벤트는 무료(비용 0). Supabase egress 무관(GA로만 전송).

- **파일 앵커:** 신규 src/lib/vitals.ts. 배선 src/main.tsx(하단 loadThirdParty/tpAfterIdle 블록 근처 — createRoot 이후, gtag id 'G-9T7JZNEQE8' 재사용). index.html:26-31 의 gtag 스텁+dataLayer 큐(스크립트 늦게 와도 유실 없음) 그대로 활용. 랩 지표 대조군은 docs/perf/lighthouse-2026-08-16.md(perf 90 / CLS 0.039 / LCP 2.8s). package.json devDependencies 에 web-vitals 미존재 → 신규 추가. 서드파티 레이스 로직(main.tsx 의 nuri:first-data-requested 게이트) 건드리지 말 것.
- **데이터 모델:** none. (원격 수집을 GA4 대신 자체 테이블로 받고 싶을 때만 후속: create table if not exists web_vitals(id uuid default gen_random_uuid() primary key, metric text, value double precision, rating text, nav_type text, path text, ua text, created_at timestamptz default now()); revoke all on web_vitals from public; grant insert on web_vitals to anon; — 이번 카드 범위 아님, GA4 경로만.)
- **접근:** 1) npm i web-vitals@^5. 2) src/lib/vitals.ts 작성: onINP·onLCP·onCLS·onFCP·onTTFB(각 attribution 진입점 web-vitals/attribution import)로 구독, 콜백에서 window.gtag('event', metric.name, {value: Math.round(name==='CLS'?value*1000:value), metric_id: id, metric_rating: rating, metric_delta, event_category:'Web Vitals', non_interaction:true, page_path: location.pathname}) 전송. attribution 필드(예 INP.attribution.interactionTarget, LCP.element)를 event params 에 요약 첨부. 3) INP 우선: onINP 를 {reportAllChanges:false} 기본 + durationThreshold 조정으로 확실히 켜고 문서 상단에 '우선 지표=INP' 주석. 4) main.tsx: 서드파티(GA)가 이미 유휴 주입되므로, vitals 초기화도 동일 유휴 창(tpAfterIdle 성공 후 또는 requestIdleCallback)에서 import('./lib/vitals').then(m=>m.initVitals()) 로 지연 로드 — 부팅 예산(boot-budget.spec) 위반 금지. 5) SPA 라우팅(탭/딥링크)에서 page_path 가 바뀌므로 GA config send_page_view 대신 수동 page_path 를 각 이벤트에 실어 경로별 분해 가능하게.
- **DoD:** 수용: (a) 프로덕션 빌드에서 실제 상호작용 후 GA4 DebugView 에 INP/LCP/CLS 이벤트 도달(value·rating·page_path 포함). (b) vitals 청크가 첫 화면 데이터(/rest/v1/schedules)보다 늦게 출발 — 기존 e2e/boot-budget.spec.ts @boot 회귀 미발생. (c) web-vitals 가 vendor-react/vendor-supabase 와 별도 청크로 분리(vite.config.ts manualChunks 정책상 lazy 기본 분할). 테스트: vitest src/lib/vitals.test.ts — gtag 를 스텁하고 onINP 콜백을 가짜 metric 으로 호출해 gtag 인자(name·rounded value·rating·non_interaction:true) 매핑을 값으로 고정. Playwright(선택) e2e/vitals.spec.ts — page.evaluate 로 window.dataLayer 에 'Web Vitals' 이벤트가 4초 유휴 후 1건 이상 쌓였는지.
- **의존성:** 선행 없음(GA 속성 G-9T7JZNEQE8 운영 중). 오너 결정: 원격 자체수집(web_vitals 테이블) 도입 여부 — 기본은 GA4 only 로 진행. AXP-6(Lighthouse 랩 게이트)과 상호보완(랩 vs 필드) — 순서 무관.
- **가드레일:** framer-motion 금지·Icon.tsx 단일소스·keep-alive(index.css:283) 무관(순수 계측). 서드파티 유휴 게이트(main.tsx nuri:first-data-requested) 훼손 금지 — vitals 를 <head>/동기 로드로 올리면 부팅 레이스 재발. 무료 한도: GA4 이벤트 수 사실상 무제한, Supabase egress 영향 0. 개인정보: attribution 에 selector/text 가 섞일 수 있으니 interactionTarget 등은 태그명·역할 수준으로만 잘라 전송(사용자 입력 원문 금지). CSP: 신규 외부 호스트 없음(googletagmanager 기존 허용).

#### AXP-2 — axe-core 접근성 CI 게이트 — @axe-core/playwright (KWCAG 2.2 / WCAG 2.2 AA)
`quick-win` · effort **M** · impact **high** · 비용: @axe-core/playwright devDep(런타임 0, CI 전용). CI 시간 +30~60s(스캔 몇 화면). 비용 증가 없음.

- **파일 앵커:** .github/workflows/ci.yml(build-and-e2e 잡 — 'E2E 스모크' 스텝 뒤에 a11y 스텝 추가 또는 test:e2e 에 편입). playwright.config.ts(projects: mobile-chromium=Pixel 7, webServer=vite build→preview:4173 자동기동, retries CI=1). 신규 e2e/a11y.spec.ts. 재사용: e2e/_session.ts 의 dismissOverlays(오버레이/온보딩 닫기), 기존 스펙 패턴(e2e/smoke.spec.ts·first-screen.spec.ts). package.json 에 @axe-core/playwright 미존재 → 추가. 탭 구조(App.tsx TabId: browse/live/community/market/tools/my-store/admin)로 스캔 대상 라우팅(?tab= 딥링크·manifest shortcuts 참고).
- **데이터 모델:** none.
- **접근:** 1) npm i -D @axe-core/playwright. 2) e2e/a11y.spec.ts: AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']) 로 핵심 라우트 순회 — 홈(browse), live, community, tools, 로그인 모달(AuthModal), 매장대시(my-store, 자격 있을 때만). 각 진입마다 dismissOverlays 후 스캔. 3) 초기 도입은 '신규 위반 차단' 전략: 현재 위반을 1회 스캔해 baseline JSON(허용 목록: rule+target)으로 고정하고, baseline 외 violation 이 있으면 fail. baseline 은 AXP-5 수동 리메디로 점진 축소. 4) color-contrast 는 실제 surface 토큰(index.css --ink-secondary #A0A6B0 등, 이미 AA 목표로 상향됨)으로 검증되게 다크·라이트 양쪽(html.light 토글) 스캔. 5) CI 스텝 분리(a11y)로 실패 원인 가시화 + playwright-report 아티팩트 업로드 재사용.
- **DoD:** 수용: (a) npm run test:e2e 흐름에 a11y 스펙 포함, baseline 위반 0 신규. (b) 의도적 위반(빈 alt img, 대비 미달 텍스트)을 임시 삽입하면 CI 레드. (c) 다크/라이트 두 테마 모두 스캔. 테스트 케이스: e2e/a11y.spec.ts — ['browse','live','community','tools'] 각 critical/serious violation 0(baseline 제외); AuthModal 오픈 상태 스캔(모달 포커스트랩·label); html.light 토글 후 color-contrast 재스캔. mobile-chromium(412px) 기준.
- **의존성:** AXP-5(수동 리메디)와 짝 — 게이트가 baseline 을 만들고 AXP-5 가 baseline 을 비운다(선 게이트 후 리메디 권장). 오너 결정: '신규만 차단' vs '전량 차단' 시작 강도. 자격 필요한 my-store/admin 스캔은 E2E_EMAIL/E2E_PASSWORD 시크릿 존재 시에만(ci.yml 기존 조건부 패턴 준수).
- **가드레일:** 프레임워크 마이그레이션 금지(Tailwind v3 유지). Icon.tsx 단일소스·SlidingPill 규약 무관(테스트 전용). keep-alive: display:none 탭은 axe 가 hidden 으로 건너뛰므로 activeTab 을 실제 전환(changeTab)해 가시화 후 스캔할 것 — 숨은 탭 스캔은 위음성. 법적: 한국 장애인차별금지법·KWCAG 2.2(웹접근성) 대응의 자동화 하한선(자동 스캔은 WCAG의 ~30-40%만 커버 → 수동 AXP-5 병행 필수, CI 통과를 '완전 준수'로 오표기 금지). 무료 한도 무관.

#### AXP-3 — 이미지 업로드 최적화 파이프라인 강화 — 클라 canvas(현행) + 서버변환 일원화
`quick-win` · effort **M** · impact **medium** · 비용: 클라 canvas 경로는 비용 0(기존). sharp Edge Function 도입 시 Deno Edge 에 sharp 미탑재라 wasm(@jsquash/webp) 또는 이미 존재하는 Storage /render/image 변환(imageUrl.ts)로 대체 권장 → 신규 인프라 0. Egress 절감이 핵심 이득(무료 5GB/월 수명 연장).

- **파일 앵커:** src/lib/storage.ts — resizeImage()(maxW/H·adaptive quality 0.5 하한·targetBytes 500KB), decodeImage()(createImageBitmap EXIF from-image), toWebp(), uploadToStorage()(cacheControl 31536000=1년), uploadPoster/uploadAvatar/uploadListingImages/uploadVenueImages/uploadCommunityImages. src/lib/imageUrl.ts — thumbUrl()/thumbSrcSet()(/render/image 변환, width+quality+format=webp, 변환캐시 max-age 3600). scripts/gen-icons.mjs — sharp devDep(빌드타임, 이미 존재). 업로드 진입 UI: AvatarCropper.tsx, 마켓/커뮤니티/매장 이미지 첨부. 재사용: src/lib/imageUrl.test.ts 패턴.
- **데이터 모델:** none(경로·파일명 규칙 유지: {ownerId}/{ts}.webp 등, 내용 바뀌면 경로 바뀜 → 1년 캐시 안전).
- **접근:** 1) 인코딩 품질/포맷: toWebp 를 유지하되 브라우저 AVIF 인코딩 지원 탐지(canvas.toBlob 'image/avif') 시 AVIF 우선, 미지원 WebP 폴백 — 파일 20~30%↓(단 디코드 호환성 확인, 실패 시 WebP). 2) 메인스레드 부하: 대형 사진 다중 업로드(uploadListingImages 최대5·uploadVenueImages 최대8) 시 resize 를 Promise.all 로 동시 실행 중 → OffscreenCanvas + Web Worker 로 옮겨 UI 잔킹 제거(미지원 폴백=현행). 3) 목록 표시 egress: 리스트 카드가 thumbUrl/thumbSrcSet(imageUrl.ts)로 400px webp 를 받는지 전 화면 감사 — 원본 직접참조 잔존처(VenueThumb·마켓 카드·포스터 목록) 색출해 교체(가장 큰 egress 절감). 4) 원본 재압축(선택): 이미 클라에서 webp 화하므로 sharp Edge 는 불필요 결론 — 대신 imageUrl.ts /render/image 파라미터(resize=cover 유지, quality 목록 70)로 서버변환 일원화. 5) 업로드 실패/취소 UX(디코드 실패·용량 초과) 토스트.
- **DoD:** 수용: (a) 동일 원본에서 AVIF 지원 브라우저 결과가 WebP 대비 파일 감소, 미지원은 WebP 로 정확 폴백. (b) 5장 동시 업로드 시 메인스레드 롱태스크 감소(worker 경로). (c) 리스트 카드가 원본 대신 thumbUrl(width) 로만 표시 — 원본 직접참조 0. 테스트: vitest src/lib/imageUrl.test.ts 확장(AVIF/WebP srcset·비대상 URL passthrough). storage 리사이즈는 canvas 의존이라 순수함수(치수 계산 ratio)만 추출해 단위화. Playwright: 마켓 등록 플로우에서 업로드 후 미리보기가 webp/avif blob 인지 network 검사.
- **의존성:** 선행 없음. 오너 결정: AVIF 도입 여부(구형 웹뷰 호환 트레이드오프). AXP-1 CWV(LCP)와 연결 — 목록 이미지 최적화가 LCP 개선에 직접 기여.
- **가드레일:** Tailwind v3·Icon.tsx·framer 무관. 무료 한도: Egress 5GB/월·Storage 1GB — cacheControl 1년(원본)·render 변환캐시(1h) 규약 유지, 변환 파라미터에 format=webp 필수(누락 시 JPEG 로 오히려 증가, imageUrl.ts 주석 근거). EXIF 회전 보정(decodeImage from-image) 회귀 금지. 개인정보: 업로드 전 클라 리사이즈가 EXIF GPS 를 제거(canvas 재인코딩)하는 이점 유지 — 원본 그대로 업로드로 되돌리지 말 것. CSP/외부호스트 추가 없음.

#### AXP-4 — iOS 설치 안내 + 제스처 게이트 웹푸시 UX (standalone 감지 · iOS 16.4+)
`quick-win` · effort **M** · impact **medium** · 비용: 0(클라 로직·기존 VAPID/Edge 재사용). Storage/egress 무관.

- **파일 앵커:** src/components/atoms/InstallBanner.tsx(beforeinstallprompt — Android/Chrome 전용, iOS 는 이 이벤트 미발생이라 현재 iOS 사용자에겐 설치 안내가 전혀 없음). src/App.tsx:749-760 pushNudge useEffect(matchMedia('(display-mode: standalone)') 게이트) + doEnablePush/dismissPushNudge(localStorage 'nuri:push-nudge-dismissed'). src/components/features/ProfileModal.tsx:568 PushNotificationSetting(수동 토글), ScheduleDetailModal.tsx:757 enablePush. src/api/push.ts — pushSupported()(serviceWorker+PushManager+Notification 존재), enablePush()(Notification.requestPermission → subscribe → push_subscriptions upsert), VAPID_PUBLIC_KEY. index.css:537 @media (display-mode: standalone). index.html:38-42 apple-mobile-web-app-* 메타. offline.html.
- **데이터 모델:** none(push_subscriptions 기존 테이블 재사용: user_id·endpoint·p256dh·auth·user_agent, onConflict endpoint).
- **접근:** 1) iOS 판별 유틸(push.ts 또는 신규 src/lib/platform.ts): isIOS(=/iP(hone|ad|od)/ && !MSStream), isStandalone(=matchMedia standalone || navigator.standalone===true — iOS 는 후자만), iosVersion 파싱. 2) iOS 설치 안내 시트: iOS Safari(비-standalone)에서 InstallBanner 대체 컴포넌트 노출 — '공유 아이콘 → 홈 화면에 추가' 3스텝 일러스트(순수 SVG, Icon.tsx PATHS 에 share/plus 아이콘 없으면 한 줄 추가). beforeinstallprompt 미지원이라 자동설치 불가 → 수동 안내가 유일 경로. 3) 푸시 게이트 정합: iOS 16.4+ 는 '홈 화면 추가(standalone) 이후'에만 Web Push 가능 → pushSupported() 를 보강해 iOS+비standalone 이면 '먼저 홈 화면에 추가' 안내로 분기(현재는 enablePush 호출이 조용히 실패). 16.3 이하 iOS 는 미지원 명시. 4) 제스처 게이트: Notification.requestPermission 은 사용자 제스처 필요 — 현행 doEnablePush/ProfileModal toggle 이 버튼 클릭 핸들러라 OK, 단 pushNudge 자동표시 시 권한요청은 반드시 명시 버튼(doEnablePush)에서만 발동(자동 호출 금지) 유지. 5) 재노출 억제 키(nuri:push-nudge-dismissed·nh-install-dismissed) iOS 안내에도 부여.
- **DoD:** 수용: (a) iOS Safari(비설치)에서 '홈 화면 추가' 안내가 뜨고 Android/데스크톱은 기존 beforeinstallprompt 배너 유지. (b) iOS standalone+16.4+ 에서만 푸시 활성 버튼 노출, 그 외 iOS 는 안내 문구로 분기(무음 실패 제거). (c) 권한 프롬프트가 사용자 클릭에서만 발동. 테스트: vitest src/lib/platform.test.ts — userAgent/navigator.standalone 스텁으로 isIOS·isStandalone·iosVersion·canWebPush 매트릭스(iOS16.3 false / iOS16.4 standalone true / iOS16.4 비standalone false / Android true) 값 고정. Playwright: Pixel(Android)에서 InstallBanner 경로 유지 회귀, iOS 에뮬(UA 오버라이드) 시 안내 시트 렌더.
- **의존성:** 기존 sw.js push 핸들러·Edge Function(VAPID_PRIVATE_KEY secret)·push_subscriptions 운영 중이어야(이미 존재). 오너 결정: iOS 미지원(≤16.3) 사용자 안내 카피. AXP-8(오프라인 아웃박스)과 sw 등록 경로 공유 — 충돌 없음.
- **가드레일:** Icon.tsx 단일소스(설치 안내 아이콘은 PATHS 에 추가, 라이브러리 설치 금지)·framer 금지(전환은 SlidingPill/CSS)·Tailwind v3. keep-alive(index.css:283): 안내 시트가 .tab-pane 밖 fixed 오버레이면 :not(.fixed) 제외로 애니 유지 — 탭 내부 인라인 배치 금지. 무료 한도: Realtime 200연결 무관(푸시는 Web Push, Realtime 아님). 법적: 알림 권한은 사용자 능동 동의만(스팸/기만 유도 금지), 야간 발송은 정보통신망법 광고성 정보 규정 고려(운영 정책). CSP 외부호스트 추가 없음.

#### AXP-5 — WCAG 2.2 수동 리메디 — 2.5.7 드래그 대체 · 2.5.8 24px 타깃 · 2.4.11 포커스 가림 · aria-live
`legal-must` · effort **M** · impact **high** · 비용: 0(마크업/CSS·소량 로직). 번들 영향 미미.

- **파일 앵커:** 2.5.7(드래그 이동 대체): src/components/features/DraggableList.tsx — DragHandle(순수 드래그만), useSortable, KeyboardSensor(coordinateGetter 존재하나 가시 컨트롤 없음), handleDragEnd/arrayMove→reorderSchedules. 위/아래 이동 버튼(non-drag 경로) 추가 대상. 2.5.8(최소 24px): DraggableList 의 프리미엄/대회/부스트 토글(px-1.5 py-1 text-2xs, 18px svg)·순서번호 옆 마이크로버튼, InstallBanner.tsx 닫기 버튼(px-1, 14px svg). 2.4.11(포커스 비가림): src/App.tsx sticky 헤더/하단 탭바·offline 배너 role=status:2034 z-[60]·모달 상단. aria-live 자산 재사용: Toast.tsx:78/98(aria-live polite·role=status), StatefulActionButton.tsx:98, UnreadBadge.tsx:60, LoadErrorCard.tsx:25(role=alert), IntegratedSearchBar.tsx:493. DraggableList SaveStatusBar('저장 중/저장됨/실패')는 현재 live 영역 아님 → 보강.
- **데이터 모델:** none.
- **접근:** 1) 2.5.7: DraggableList 각 행에 '위로/아래로' 아이콘 버튼(Icon.tsx PATHS chevron 재사용) 추가 → arrayMove(items,i,i±1) 후 기존 reorderSchedules 호출(드래그와 동일 저장경로). 드래그는 보조로 유지, 키보드 재정렬(KeyboardSensor)도 문서화. 2) 2.5.8: 마이크로 토글들의 히트영역을 최소 24×24 CSS 로직 픽셀 확보 — 시각크기 유지하되 ::before 확장 또는 min-w/min-h + 패딩(예외 'inline'·'essential' 아님 → 반드시 확대). InstallBanner 닫기·DraggableList 토글 전수 점검. 3) 2.4.11: sticky/fixed 상단·하단 바 존재 시 키보드 포커스 이동에서 대상이 바 뒤에 숨지 않게 scroll-margin-top/bottom(헤더·탭바 높이만큼) + focus-visible 시 scrollIntoView(block:'nearest'). safe-area(env(safe-area-inset-*)) 고려. 4) aria-live: DraggableList SaveStatusBar 를 role=status aria-live=polite 로(저장 결과 스크린리더 통지), 낙관적 실패 롤백도 통지. 전역 라우트 변경(탭 전환) 시 보조 통지(선택). 5) 드래그 핸들 aria-roledescription/키보드 안내 텍스트.
- **DoD:** 수용: (a) 마우스/터치 없이 키보드+버튼만으로 일정 순서 재배치 완결(2.5.7). (b) 모든 상호작용 타깃 히트영역 ≥24×24 CSS px(2.5.8) — axe/수동 확인. (c) Tab 순회 시 포커스 요소가 sticky 바에 가리지 않음(2.4.11). (d) 저장 상태가 aria-live 로 통지. 테스트: Playwright e2e/a11y-keyboard.spec.ts — DraggableList 에서 Tab→위/아래 버튼 Enter 로 순서 변경 확인, 각 토글 boundingBox width≥24 && height≥24 assert, sticky 헤더 높이보다 포커스 요소 top 이 아래인지. AXP-2 axe 스캔이 target-size 룰 통과. vitest: arrayMove 기반 순수 재정렬 헬퍼 단위.
- **의존성:** AXP-2(axe 게이트)가 baseline 을 만들고 이 카드가 위반을 해소 → baseline 축소. 오너 결정: 위/아래 버튼 노출 밀도(관리자 전용 화면이라 여백 여유). AXP-9(aria/lang)과 aria-live 규약 공유.
- **가드레일:** framer-motion 금지(신규 전환은 CSS/SlidingPill)·Icon.tsx PATHS 에만 아이콘 추가(라이브러리 설치 금지)·Tailwind v3. keep-alive(index.css:283 및 384-385 reduced-motion): 새 진입 애니 클래스 만들면 index.css:283 의 :is(...) 목록에 반드시 추가(탭 재방문 깜빡임 방지). prefers-reduced-motion(index.css:375) 존중 — scrollIntoView 는 behavior:auto. 법적: 한국 장애인차별금지법 제21조·KWCAG 2.2/WCAG 2.2 AA — 2.4.11·2.5.7·2.5.8 은 2.2 신규 성공기준이라 자동스캔만으론 커버 불가(수동 필수), 준수 문서화 권장.

#### AXP-6 — Lighthouse CI 임계 게이트 — CWV 랩 · 바이트 예산 · 접근성 하한
`quick-win` · effort **M** · impact **medium** · 비용: @lhci/cli devDep(CI 전용). CI 시간 +1~2분(빌드→preview→3회 실행 중앙값). 비용 0(temporary-public-storage 무료 업로드).

- **파일 앵커:** .github/workflows/ci.yml(build-and-e2e — 'Build' 스텝 뒤 lhci autorun 스텝 추가; 이미 npm run build 산출물 존재). 신규 lighthouserc.json(루트). playwright.config.ts 의 preview 패턴(vite build && npx vite preview --port 4173) 재사용 가능. 기준선 문서 docs/perf/lighthouse-2026-08-16.md(perf 90 / CLS 0.039 / LCP 2.8s / FCP 2.4s / TBT 160ms — 실행 커맨드까지 기록됨). 바이트 예산 근거 e2e/boot-budget.spec.ts(@boot: 앱 셸 ~839KB, 업주 청크 VenueManageTab 306KB·LedgerStatsPanel 155KB 손님 차단). vite.config.ts manualChunks(vendor-react/vendor-supabase).
- **데이터 모델:** none.
- **접근:** 1) npm i -D @lhci/cli. 2) lighthouserc.json: ci.collect{startServerCommand:'npx vite preview --port 4173 --strictPort', url:['http://localhost:4173/','http://localhost:4173/?tab=tools'], numberOfRuns:3, 기본 모바일 에뮬 유지(문서와 동일 조건)}. 3) assert: assertions 로 하한 고정 — categories:performance ≥0.85(문서 90 대비 여유), accessibility ≥0.90(하한), largest-contentful-paint ≤3000, cumulative-layout-shift ≤0.10(문서 0.039 회귀 방지), total-byte-weight maxNumericValue(앱 셸 예산 근거로 ~1.1MB), unused-javascript warn. 4) upload.target temporary-public-storage(무료, PR 코멘트 링크). 5) CI 실패 시 하드 게이트(assert error)로 배포 차단(README 의 브랜치 보호 규칙과 연동). 6) 서드파티 유휴 로드로 TTI/SI 가 흔들리는 특성(문서 해석)을 감안, TTI/SI 는 게이트에서 제외하고 CWV(LCP/CLS/TBT)+바이트만 임계.
- **DoD:** 수용: (a) PR 에서 lhci 실행, 임계 위반 시 레드 + 리포트 링크. (b) 의도적 회귀(대형 이미지 eager import)로 total-byte-weight/LCP 초과 시 fail. (c) 기존 boot-budget 예산과 모순 없음. 테스트: lighthouserc.json 자체가 게이트(별도 vitest 불필요). CI 검증: 워크플로 드라이런에서 3회 실행 중앙값 리포트 생성·assert 동작. 로컬 재현은 docs/perf 의 lighthouse 커맨드와 동일 조건.
- **의존성:** AXP-1(필드 CWV)과 랩/필드 상호보완. AXP-3(이미지)·AXP-7(폰트) 최적화가 임계 통과에 기여 → 임계 수치는 현 baseline 기준으로 두고 개선 후 조인다. 오너 결정: 하드 차단 강도(warn 시작 후 error 승격). CI 시간 예산.
- **가드레일:** 프레임워크 마이그레이션 금지(Tailwind v3). keep-alive/framer/Icon 무관(CI 도구). 측정 조건은 docs/perf 문서와 동일하게(프로덕션 build→preview, 모바일 에뮬) — dev 서버 측정 금지(StrictMode 이중실행·HMR 로 왜곡, playwright.config 주석 근거). 무료 한도: temporary-public-storage 사용(자체 LHCI 서버 불필요). 서드파티(GA) 유휴 주입이 SI/TTI 를 늦추는 구조를 게이트에 반영(해당 지표 제외) — 잘못된 실패 금지.

#### AXP-7 — Pretendard 폰트 실제 로드 정합 — 서브셋 self-host 또는 system-ui 확정
`critical-now` · effort **S** · impact **high** · 비용: self-host 택 시: Pretendard 서브셋 woff2(variable 1파일 ~100-300KB 또는 unicode-range subset) → 정적 public/ 서빙(Vercel CDN, 무료), sw.js 가 woff2 이미 캐시하므로 재방문 egress 0. system-ui 택 시 비용 0.

- **파일 앵커:** 핵심 결함: src/index.css:104 와 tailwind.config.js:72 가 font-family 로 'Pretendard Variable','Pretendard' 를 지정하지만 @font-face·CDN link·preload 가 리포지토리 어디에도 없음(grep 확인: index.html/public/src/index.css 통틀어 @font-face 0건) → 실제로는 거의 모든 기기에서 system-ui 로 렌더 중(브랜드 타이포 미적용). offline.html:10·public/guide/*.html 도 동일 스택. sw.js CACHEABLE 정규식에 (woff2?)$ 포함(woff2 캐시 준비됨). index.html <head>(preconnect supabase 만, 폰트 preconnect/preload 없음).
- **데이터 모델:** none.
- **접근:** 택1(권장, self-host 서브셋): 1) Pretendard 정적 서브셋 woff2 를 public/fonts/ 에 배치(라이선스 OFL — 재배포 허용, 라이선스 파일 동봉). 2) index.css @layer base 에 @font-face{font-family:'Pretendard Variable'; src:url('/fonts/…woff2') format('woff2'); font-weight:45 920; font-display:swap; unicode-range: 한글+라틴}. 3) index.html <head> 에 <link rel=preload as=font type=font/woff2 crossorigin href=/fonts/…woff2>(LCP 텍스트용 1개만, 과다 preload 금지). 4) font-display:swap 로 FOIT 방지(첫 페인트는 system-ui, 스왑) — CLS 방지 위해 size-adjust/ascent-override 로 시스템폴백과 메트릭 근사. 5) sw.js 캐시 확인(이미 woff2 매칭). 택2(system-ui 확정): index.css:104·tailwind.config.js:72 에서 Pretendard 제거하고 system-ui 스택 확정(-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic'…) → '있지도 않은 폰트를 기다리는' 착시 제거, 비용 0. 결정 근거: 브랜드 일관성 필요=택1, 성능/단순=택2. 어느 쪽이든 index.css·tailwind·offline.html·public/guide 스택을 한 값으로 통일.
- **DoD:** 수용(택1): (a) 네트워크 탭에 /fonts/*.woff2 200 + 화면 실렌더 폰트가 Pretendard(document.fonts.check). (b) font-display:swap 로 텍스트 즉시 표시, 폰트 스왑 시 CLS 증가 없음(size-adjust). (c) 재방문 시 sw 캐시 히트(egress 0). 수용(택2): index.css/tailwind 에서 Pretendard 문자열 제거, system-ui 확정, 시각 회귀 승인. 테스트: Playwright e2e/font.spec.ts — page.evaluate(()=>document.fonts.ready then document.fonts.check('16px "Pretendard Variable"')) 가 택1 true; 택2 는 getComputedStyle(body).fontFamily 에 Pretendard 부재 확인. AXP-6 Lighthouse CLS ≤0.10 유지 회귀 게이트.
- **의존성:** 오너 결정 필수: self-host vs system-ui(브랜드 vs 번들/단순). 택1 은 서브셋 woff2 자산 확보(디자인/빌드 산출). AXP-6(CLS·바이트 예산)과 직접 연동 — 폰트 추가가 예산 위반하지 않게 preload 최소화.
- **가드레일:** Tailwind v3 유지(tailwind.config.js:72 sans 값만 수정, 디자인시스템·surface 토큰 불변). Icon.tsx/framer/keep-alive 무관. 무료 한도: 폰트는 정적 CDN(Storage egress 아님), sw.js 캐시로 재전송 0. CSP/외부호스트: Google Fonts/jsdelivr 등 외부 폰트 호스트 사용 금지(self-host 만 — 개인정보·의존성·성능) → main.tsx 서드파티 지연 철학과 일치. font-display:swap 필수(FOIT 로 텍스트 숨김 금지=접근성). 라이선스: Pretendard OFL 고지 동봉.

#### AXP-8 — 오프라인 아웃박스 — IndexedDB 큐 + 재연결 flush
`big-bet` · effort **L** · impact **medium** · 비용: 0(브라우저 IndexedDB·기존 Supabase 경로 재사용). idb 래퍼(선택, ~2KB) 또는 native IDB. egress/Realtime 무관.

- **파일 앵커:** 신규 src/lib/outbox.ts(IndexedDB 큐). 큐잉 대상 쓰기 함수: src/api/community.ts addPost(:313)·addComment(:254)·addLiveMessage(:393), src/api/checkins.ts checkIn(:8). 재사용: src/lib/supabase.ts(IS_MOCK 분기·supabase client), src/lib/dbError.ts(에러 분류), src/components/atoms/Toast.tsx(큐잉/전송 통지). sw.js(선택 Background Sync — 현재 push/fetch 캐시만, sync 핸들러 없음). main.tsx sw 등록 + 'nuri:sw-update' 이벤트 패턴. App.tsx:2034 role=status 배너(오프라인/업데이트 표시 자리). 기존 IndexedDB 사용 0건(grep 확인) → 신규 도입.
- **데이터 모델:** IndexedDB(서버 아님): DB 'nuri-outbox' v1, objectStore 'ops'(keyPath 'id' autoIncrement, index by createdAt). 레코드: {id, kind:'addPost'|'addComment'|'addLiveMessage'|'checkIn', payload, createdAt, tries, client_op_id:uuid}. 서버 스키마 변경 none(기존 테이블 insert 재사용). 중복방지: flush 성공 시 큐에서 제거 + tries 상한(5)으로 완화, 서버 유니크 제약 필요 시 client_op_id 기반 멱등키는 후속.
- **접근:** 1) src/lib/outbox.ts: enqueue(kind,payload)→IDB put; flush()→createdAt 순 FIFO 순회하며 kind별 실제 api 호출(community.addPost 등) 재사용, 성공 시 delete, 실패면 tries++ (재시도 상한·지수백오프, 5회 초과 dead-letter 통지). 2) 쓰기 함수 래핑: 온라인이면 직접 호출, 오프라인(navigator.onLine=false)이거나 네트워크 오류(dbError 분류 'network')면 enqueue 후 낙관적 UI + '전송 대기' 토스트. 3) flush 트리거: window 'online' 이벤트 + document visibilitychange(visible) + 앱 부팅 시 1회. 4) 순서/원자성: 단일 flush 락(동시 flush 금지), FIFO. 5) 낙관적 표시: 큐 항목을 UI 에 'pending' 배지로(선택), 전송완료 토스트. 6) sw Background Sync 는 보조(지원 브라우저만) — 미지원(iOS)은 online 이벤트 경로가 주. 7) IS_MOCK 모드에선 큐 우회(기존 mock 반환).
- **DoD:** 수용: (a) 오프라인에서 댓글/체크인 작성 시 UI 반영 + '대기' 통지, IDB 에 op 적재. (b) 온라인 복귀 시 자동 flush → 서버 반영 + 성공 통지, 큐 비워짐. (c) flush 실패는 재시도·상한 후 dead-letter 통지(무한루프 없음). (d) FIFO 순서 보존·중복전송 없음. 테스트: vitest src/lib/outbox.test.ts(fake-indexeddb 로 enqueue/flush/재시도/락/순서 값 고정, api 모듈 목). Playwright e2e/outbox.spec.ts — context.setOffline(true)로 오프라인 작성→IDB 확인→setOffline(false)→flush 후 목록 반영. 기존 e2e/offline.spec.ts(오프라인 폴백)·cache-first.spec.ts 회귀 없음.
- **의존성:** AXP-4 와 sw 등록 경로 공유(충돌 없음). 오너 결정: 큐잉 대상 범위(댓글·체크인·라이브월 우선, 결제/장부 쓰기는 제외 — 금액 정합상 온라인 필수). 서버 멱등키 도입은 별도(중복 방지 강화 시).
- **가드레일:** framer 금지·Icon.tsx·Tailwind v3. keep-alive: 큐 상태 UI 를 탭 내부에 두면 index.css:283 진입애니 규칙 확인. 무료 한도: Realtime 200연결·egress 무관(HTTP insert). 금전 안전: 장부/이용권/정산 쓰기는 아웃박스 금지(오프라인 중 잔액·시각 불일치 위험) — 콘텐츠성 쓰기만. RLS: 큐된 op 도 서버 RLS(comments_delete·posts insert 정책)가 최종 권한 강제(클라 큐는 편의일 뿐). 데이터: IDB payload 에 세션토큰/비밀 저장 금지(payload 는 도메인 데이터만, 인증은 flush 시점 currentUser).

#### AXP-9 — i18n 구조 seam — t() 인다이렉션 · html lang · Intl (전면 번역 아님)
`nice-to-have` · effort **M** · impact **low** · 비용: 0(경량 자체 t() — react-intl/i18next 미도입). 번들 미미(사전 1개=ko). egress 무관.

- **파일 앵커:** 신규 src/lib/i18n.ts(t() + locale + 사전). html lang: index.html:2(lang=ko)·offline.html:2·public/manifest.webmanifest(lang ko). Intl 현황: 앱 전역 toLocaleString/toLocaleDateString/Intl 사용 225곳(금액·날짜·시간, 예 DraggableList buyIn.amount.toLocaleString()·item.date.slice) — 로케일 미고정(브라우저 기본). src/lib/seo.ts(문서 title/meta 동적 갱신 — lang 동기화 지점)·src/lib/calendar.ts(날짜)·useTitles.ts. tailwind future.hoverOnlyWhenSupported 무관.
- **데이터 모델:** none(사전은 코드 내 TS 객체).
- **접근:** 1) src/lib/i18n.ts: type Locale='ko'(현재 유일), 사전 dict:Record<Locale,Record<string,string>>, t(key, vars?) → 보간({name} 치환) + 미스키 폴백(key 반환·dev 경고). getLocale()/setLocale() 은 <html lang> 을 함께 갱신(document.documentElement.lang). 2) seam 만: 전면 번역 금지 — 신규/수정 UI 문자열부터 t() 경유로 점진 이관(하드코딩 한글 그대로 두되 상위 빈출·법적 문구 우선). 3) Intl 통일 헬퍼: fmtCurrency(n)=new Intl.NumberFormat(locale,{style:'currency',currency:'KRW',maximumFractionDigits:0}), fmtDate/fmtTime(Intl.DateTimeFormat, timeZone:'Asia/Seoul' 고정 — 서버/클라 시각 정합), fmtNumber. 산재한 toLocaleString 을 이 헬퍼로 수렴(우선 금액 표시 핵심 경로부터). 4) lang 정합: SPA 라우팅/상세 진입 시 seo.ts 가 lang 도 세팅(다국어 확장 대비 hreflang 자리만). 5) 방향성 dir=ltr 유지(manifest 이미 ltr). 확장 시 en 사전 추가만으로 열리는 구조.
- **DoD:** 수용: (a) t('key') 인다이렉션 동작 + 미스키 폴백/경고. (b) <html lang> 이 locale 과 동기(현재 ko 고정, setLocale 시 갱신). (c) 금액/날짜가 Intl 헬퍼(KRW·Asia/Seoul) 경유로 일관 표기 — 핵심 경로 회귀 없음. (d) 전면 번역 아님(기존 한글 유지, seam 만). 테스트: vitest src/lib/i18n.test.ts — t() 보간·폴백·setLocale 이 documentElement.lang 갱신; fmtCurrency(10000) KRW 포맷·fmtDate 타임존 고정 값 고정. Playwright: 문서 lang 속성 존재 확인(AXP-5 접근성과 연동 — lang 은 스크린리더 발음 필수).
- **의존성:** 오너 결정: 다국어 로드맵 유무(seam 만 vs 실제 en 추가) — 기본은 seam. AXP-5(aria/lang)와 <html lang> 규약 공유. AXP-2 axe(html-has-lang 룰)와 정합.
- **가드레일:** 경량 자체 구현 — i18next/react-intl 등 신규 대형 라이브러리 import 전 package.json 확인·도입 지양(번들·복잡도). framer/Icon.tsx/Tailwind v3 무관. keep-alive 무관(순수 유틸). 무료 한도 무관. 시각/시간: Intl timeZone 'Asia/Seoul' 고정으로 클라·일정 시각의 서버-클라 불일치 방지(홀덤 대회 시작시각 정확성). CSP/외부호스트 없음.

### 영역 · 신규 제품 기능 (FEAT)

#### FEAT-1 — 개인 성적 분석 심화 — 세션로그·분산 시뮬·시간당수익·리크 리포트·핸드히스토리 임포트 (전부 클라 계산)
`big-bet` · effort **L** · impact **high** · 비용: 서버 비용 0 — localStorage 전용, DB/egress/Realtime 무영향. 번들만 +약 15~25KB(도구 lazy 청크). 위험: HH 파서가 다양한 사이트 포맷을 못 읽으면 임포트 실패 체감.

- **파일 앵커:** 신규 도구로 편입. (1) 신규 `src/lib/sessionLog.ts` — `src/lib/trainerProgress.ts`의 localStorage+useSyncExternalStore+commit/emit 패턴을 그대로 복제(키 `nuri:sessionlog:v1`). (2) 신규 `src/components/features/tools/PerfAnalyzer.tsx`. (3) `src/components/features/ToolsPanel.tsx` — `ToolKey` 유니온(25행)에 `'perf'` 추가, `TOOLS` 배열(28행~, group `'player'`)에 항목 추가, `renderTool` switch(95행~)에 `case 'perf'` 추가, `QUIZ_KEYS`(83행)엔 넣지 않음(도구). (4) 재사용: 분산 시뮬은 `src/components/features/tools/StackCalcs.tsx`의 기존 `VarianceCalc`(ROI·표본→파산확률) 로직/공식 이식·확장, 계산 UI는 `src/components/features/tools/calcUi.tsx`. (5) 내 실적 시드: `src/api/rankings.ts:getMyRankingHistory(nickname)`(373행) + `src/api/vouchers.ts` `PlayHistory`(16행)·`listMyPlayHistory` RPC로 '실제 입상 이력' 프리필(로그인 시). (6) HH 임포트: 파일 텍스트 파싱 결과를 `src/lib/hand.ts:ReplayData`로 변환해 기존 `src/components/features/HandReplayer.tsx`로 재생, 승률/아웃츠는 `src/components/features/gto/equityEngine.ts:computeEquity/computeOuts`(145·257행). (7) CSV 내보내기 `src/lib/csv.ts:toCsv/downloadCsv`. (8) 아이콘: `src/components/atoms/Icon.tsx` PATHS에 `'chart-line'` 1줄 추가(IconName 유니온 13행에도 추가).
- **데이터 모델:** none — 전량 클라(localStorage). 세션로그 스키마(JSON): `{ id, date(YYYY-MM-DD), venue?, gameType('cash'|'tourney'), durationMin, buyinCount, resultPoints?(비현금 점수/등수), placement?, notes? }[]`. 금액(원) 저장 금지 — 사행성 회피 위해 '시간·세션수·등수·비현금 점수'만. '시간당수익'은 금액이 아니라 '시간당 세션/입상 빈도·평균 등수' 지표로 표기. HH 임포트 데이터는 메모리에서만 계산 후 파기(영속 저장 안 함, 개인정보/egress 0).
- **접근:** 1) `sessionLog.ts` 작성: trainerProgress.ts 구조 복제(load/persist/emit/commit + useSyncExternalStore 훅 `useSessionLog()`)로 CRUD+집계. 2) `PerfAnalyzer.tsx`에 SegmentedTabs(atoms/SegmentedTabs.tsx)로 4탭: [세션로그][분산][페이스][리크·HH]. 3) 세션로그 탭: 세션 추가/삭제 폼(순수 클라), 누적 요약(총 시간·세션수·평균 등수·입상률). 4) 분산 탭: VarianceCalc 공식 재사용해 몬테카를로(표본 N, ROI%, 표준편차) → 파산확률·신뢰구간 그래프(HandReplayer의 막대 그래프 스타일, 순수 SVG/div). 5) 페이스(시간당수익 대체) 탭: 세션로그+getMyRankingHistory 합산→'시간당 입상·평균 등수 추이'. 6) 리크·HH 탭: <input type=file accept='.txt'>로 HH 텍스트 로드→파서(정규식 best-effort)→equityEngine으로 스트리트별 승률·오답(폴드/콜 EV) 요약→'자주 지는 스팟' 리크 리스트. 실패 시 EmptyState(atoms/Skeleton.tsx). 7) 결과 먼저 원칙: 진입 시 데모 핸드로 즉시 결과(ToolsPanel gto 데모 패턴).
- **DoD:** 수용기준: (a) 세션 추가→새로고침 후 유지(localStorage), 삭제 동작. (b) 분산 시뮬 입력 변경 시 파산확률·그래프 실시간 갱신, 표본 10만 회 계산이 렌더 밖(setTimeout)으로 UI 프리즈 없음(HandReplayer setComputing 패턴). (c) HH 텍스트 붙여넣기→최소 1개 핸드가 HandReplayer로 재생. (d) 어떤 금액(원) 문자열도 저장/표시하지 않음. vitest: `src/lib/sessionLog.test.ts`(CRUD·집계 순수함수), 분산 몬테카를로 결정성(시드 고정), HH 파서 단위테스트(샘플→ReplayData). Playwright: 도구 탭→'성적 분석' 열기→세션 1건 추가→요약 숫자 노출.
- **의존성:** 선행 없음(독립). 로그인 프리필(getMyRankingHistory)은 nickname 필요 — 비로그인은 수동입력 폴백. HH 포맷 스펙은 오너 결정(우선 지원 사이트) — 미정 시 PokerStars 텍스트 기준.
- **가드레일:** 금액(원) 미저장·미표시(사행성/§28 회피) — '수익'은 비현금 점수·등수·빈도로만. framer-motion 금지(그래프는 순수 SVG/CSS). 무거운 몬테카를로/HH 계산은 반드시 렌더 밖(setTimeout+alive 플래그, HandReplayer:86)로. 도구는 `.tab-pane` 안 → 진입 애니 class는 index.css:283 무효화 대상이니 스크롤 리빌 추가 금지. Icon은 PATHS만(라이브러리 설치 금지). HH 파일은 로컬 파싱만, 서버 업로드 금지(egress/개인정보 0).

#### FEAT-2 — 라이브 이벤트 실시간 중계 피드 — 셀프 칩카운트·플레이어 팔로우·버스트/페이아웃·레일챗 (Realtime 예산 준수)
`big-bet` · effort **L** · impact **high** · 비용: Realtime 동시연결이 유일 리스크(무료 200연결). 대회당 별도 채널 생성 시 폭증 → '진행 게임·해당 탭 볼 때만' 구독 필수. egress: 칩카운트/챗 insert는 소량. DB: 신규 2테이블(경량).

- **파일 앵커:** (1) `src/components/features/LiveGamesTab.tsx` — 기존 `MyTournamentCard`(337행, 이미 셀프 스택 localStorage 저장)를 확장해 '셀프 칩카운트 공유(옵트인)' 버튼 추가; `LiveCard`(218행)에 '레일 보기' 진입. (2) 실시간: `src/api/clock.ts`의 `subscribeRunningClocks`(370행) 패턴 + 신규 `src/api/liveFeed.ts`(랜덤 채널+removeChannel+IS_MOCK 가드 표준). (3) 레일챗: `src/api/community.ts`의 live_wall 스택(`addLiveMessage` 393행·`subscribeLiveWall` 418행) 패턴을 게임 스코프로 복제, 또는 `src/api/chat.ts`(201행) 패턴. (4) 팔로우: 기존 venue_follows(20260603b) 유사 구조로 player_follows. (5) 버스트/페이아웃 소스: LiveGamesTab `liveStats`(eliminations/itm) + `src/api/leagues.ts:setLeagueStatus`(137행, ITM 스냅샷) 패턴. (6) Icon.tsx PATHS `'broadcast'`(App.tsx:442 live 아이콘 유사) 1줄. (7) 외부 호출 없음→vercel.json CSP 변경 불필요.
- **데이터 모델:** 신규 2테이블. `live_feed_events`(id uuid pk default gen_random_uuid(), venue_id uuid, game_seq int, kind text check in ('chip','bust','payout','note'), actor_user_id uuid, player_name text, payload jsonb, created_at timestamptz default now()). `live_rail_chat`(live_wall 미러: id, venue_id, game_seq, user_id, user_name, user_role, content text check char_length<=300, created_at). 안전수칙: create table if not exists; RLS enable; SELECT 공개, INSERT `auth.uid() is not null`+레이트리밋(20260603_reports_and_ratelimit.sql rate_limit 재사용); `revoke all ... from public; grant select to anon, authenticated; grant insert to authenticated`; `alter publication supabase_realtime add table ...`(20260623g 패턴); 트리거 search_path=public 고정. 셀프 칩카운트 payload `{stack:int, bb:numeric}` — 금액 아님(칩=비현금).
- **접근:** 1) 마이그레이션(위 2테이블·RLS·publication). 2) `liveFeed.ts`: getFeed(venueId,gameSeq)·postChip/postBust/postPayout·subscribeFeed(랜덤채널, filter=`venue_id=eq.X`), 레일챗 get/add/subscribe. 3) MyTournamentCard: 스택 입력 옆 '내 카운트 공유' 토글→live_feed_events insert(kind='chip'). 4) LiveCard 하단 '레일 보기'→인라인 확장 패널(모달 아님)에 피드 타임라인+레일챗. 5) 버스트/페이아웃은 운영자 클락 화면(ClockDisplay/TournamentClock) 탈락·ITM 확정 시 emit. 6) 팔로우: 닉네임 팔로우→그 사람 칩/버스트만 하이라이트. 7) 예산 가드: 구독은 active===true && 게임 진행 중일 때만 open, 숨김 시 removeChannel(LiveGamesTab:73 active 게이트); venue 단일 채널로 묶어 연결 최소화.
- **DoD:** 수용기준: (a) 운영자 탈락 확정→관전자 피드에 '버스트' 즉시(<2s). (b) 셀프 칩 공유→같은 게임 레일에 표시, 옵트아웃 시 미표시. (c) 레일챗 전송/수신 실시간, 300자·레이트리밋 동작. (d) 라이브 탭 숨기면 채널 해제(devtools websocket 종료 확인) — 200연결 방어. (e) 금액(원) 미표시(칩·등수만). vitest: liveFeed 매퍼·레이트리밋 순수함수. Playwright(@boot 제외): 라이브 탭→레일 열기→챗 전송→목록 반영. 부하: scripts/loadtest.mjs로 채널 연결 수 확인.
- **의존성:** 운영자 클락(ClockDisplay/TournamentClock)에서 버스트/페이아웃 emit하려면 클락 팀과 훅 지점 합의 필요(현 liveStats는 읽기전용 공개). 미합의 시 v1은 '셀프 칩카운트+레일챗+운영자 수동 페이아웃'만 출시 가능. Realtime 연결 상한 정책은 오너 결정.
- **가드레일:** Realtime 무료 200연결 — venue 단위 채널·탭/게임 게이트 필수(전역 상시 구독 금지). 비현금: 칩·BB·등수만, 상금은 '점수/시드' 비현금 표기(§28·환전 표현 금지). 레일챗은 src/lib/content-filter.ts 통과 + 신고(reports.ts targetType 'live' 기존) + 차단(blocks.ts) 연동. framer-motion 금지, 실시간 갱신 애니는 CSS pulse만. removeChannel 누수 방지(랜덤 채널명 표준).

#### FEAT-3 — 한국판 Hendon Mob — 선수 공개 프로필·POY·머니리스트, 매장 제출+검증, 비현금 기록만
`big-bet` · effort **M** · impact **high** · 비용: 저비용 — 기존 랭킹 인프라 대부분 재사용(venue_rankings·global_ranking_totals·rank_verifications). 신규는 공개 프로필 라우팅+POY 집계 RPC. egress: 프로필 조회 읽기공개(캐시). 실비용은 개인정보·명예훼손 리스크(마스킹·옵트아웃 필수).

- **파일 앵커:** 대부분 존재, 조립+공개화. (1) 랭킹: `src/api/rankings.ts` — `getGlobalRankingTotals`(321행, RPC global_ranking_totals)·`getMyRankingHistory`(373행)·`maskRealName/rankDisplay`(25·40행). (2) 검증: `src/api/rankverify.ts` 전체(제출·AI검사·승인·`get_domestic_rankings` RPC)·`src/api/identity.ts`. (3) 매장 제출: `src/api/rankings.ts:saveVenueRankings`(389행, RPC save_venue_rankings) — 이미 매장이 입상 명단 제출. (4) 공개 프로필 라우팅: `src/App.tsx` 쿼리 딥링크(?v=·?s=) 패턴에 `?player=<code>` 추가; SEO는 `src/lib/seo.ts`에 `applyPlayerSeo`(applyVenueSeo 148행 복제, schema.org Person). (5) 봇 프리렌더: `api/s.js`/`api/p.js` 복제해 `api/player.js`+vercel.json rewrites(`/player/:code`). (6) 신규 `src/components/features/PlayerProfilePage.tsx`(VenuePage.tsx 구조, lazyWithReload). (7) POY 위젯: `src/components/features/TierLeaderboard.tsx`(랭킹 허브) 또는 `WeeklyBestStrip.tsx` 패턴.
- **데이터 모델:** 신규 최소화. POY: `create or replace function public.player_of_the_year(p_year int) returns table(nickname text, points bigint, moneyins bigint, best_position int) language sql stable` — venue_rankings에서 연도 필터+placementPoints(10/7/5/3/2/1) 합산. `search_path=public` 고정, `revoke execute from public; grant execute to anon, authenticated`. 프로필 옵트아웃: `profiles`에 `public_profile boolean default true`(if not exists) — false면 리스트/프로필/POY 제외(섀도우밴 P27.3 패턴). 실금액 컬럼 신설 금지 — 프라이즈는 기존 '만원 텍스트/점수'만, 머니리스트는 '누적 프라이즈 점수'로 표기.
- **접근:** 1) player_of_the_year RPC+public_profile 컬럼 마이그레이션(if not exists·ACL·search_path). 2) applyPlayerSeo(seo.ts)+api/player.js(봇 OG)+vercel.json rewrite. 3) PlayerProfilePage: getMyRankingHistory(공개용 nickname 인자)·검증 배지(rankverify 승인분)·POY 순위·시즌 우승 수(seasons.ts:getMyChampionships 76행). 4) App.tsx: ?player= 라우팅 + 랭킹/리플레이에서 닉네임 탭→프로필. 5) TierLeaderboard에 'POY' 보드 추가. 6) 실명은 rankDisplay/maskRealName로 항상 마스킹, 공개 프로필은 닉네임 기준.
- **DoD:** 수용기준: (a) ?player=<code>→그 선수의 입상 이력·POY 순위·검증 배지 표시. (b) public_profile=false는 리스트/프로필/POY 제외. (c) 실명 노출 0(항상 마스킹). (d) 금액(원) 미표시 — '프라이즈 점수'·'입상 횟수'·'베스트 등수'만. (e) 카카오 공유 시 api/player.js OG 카드 수신. vitest: player_of_the_year 집계 동등성(placementPoints 재현), maskRealName 경계값(1·2·3+자). Playwright: 랭킹→선수 탭→프로필 렌더, 옵트아웃 계정 비노출.
- **의존성:** 옵트아웃 UX(프로필 공개 토글)를 ProfileModal에 추가 필요 — 동시 배포. 실명/개인정보 공개 범위는 오너 법무 결정(기본: 닉네임+마스킹실명). 검증 배지 신뢰도는 rank_verifications 운영자 승인 처리량에 의존.
- **가드레일:** 비현금 기록만 — '머니리스트'는 실화폐 상금이 아니라 '프라이즈 점수/시드 누적'임을 UI에 명시(§28·환전/사행 표현 금지). 개인정보: 실명 항상 마스킹·공개 프로필 옵트아웃 기본·신분증 등 민감정보 비공개 버킷 유지(rankverify.ts 즉시삭제 준수). 명예훼손 방지: 신고(reports 'user')·차단(blocks) 연동, 섀도우밴 계정 제외(P27.3). SEO는 seo.ts 동적+api/player.js 봇 프리렌더(SSR 없음 한계 문서화). Icon PATHS 단일소스.

#### FEAT-4 — 학습 허브 — 퀴즈/드릴·스터디 코호트·핸드 리뷰 스레드
`big-bet` · effort **L** · impact **medium** · 비용: 저~중. 퀴즈/드릴은 클라(localStorage). 스터디 코호트는 기존 group 인프라 재사용(신규 테이블 거의 없음). 핸드 리뷰 스레드는 기존 community_posts(category 'hand'/'study') 재사용. egress/Realtime 소량.

- **파일 앵커:** (1) 드릴/퀴즈: 기존 `src/components/features/tools/PreflopTrainer.tsx`·`PostflopTrainer.tsx`+진행/XP는 `src/lib/trainerProgress.ts`(getProgress/recordAnswer/useTrainerProgress). 신규 셸 `src/components/features/LearnHub.tsx`가 이들을 묶고 '오늘의 드릴' 제시. (2) 스터디 코호트: `src/api/community.ts` group 스택 재사용 — `createGroup`(739행, kind 'club')·`joinGroup`·`getGroupMembers`·`getGroupMessages/subscribeGroupMessages`(791·815행). UI는 `src/components/features/GroupPage.tsx`·`DealerCommunity.tsx` 패턴. (3) 핸드 리뷰: `PostCategory`(community.ts:66)에 이미 `'hand'`·`'study'` 존재→`addPost`(313행)+`encodeReplay`(hand.ts:55)+HandReplayer 재생. `CommentThread.tsx`·`CommunityTab.tsx`(section='board', cat 필터). (4) Icon.tsx PATHS `'academic'` 1줄. (5) 코호트 진척: trainerProgress.ts XP 공유.
- **데이터 모델:** 거의 none. 퀴즈/드릴 진행: localStorage(trainerProgress.ts 기존 키), 문제은행은 정적 데이터 `src/lib/nash.data.ts`·`ranges.data.ts` 재사용. 스터디 코호트: 기존 groups/group_members/group_messages 그대로(신규 테이블 0). 핸드 리뷰: community_posts(category='hand'/'study') 재사용, 신규 컬럼 0. 필요 시 코호트별 '주간 드릴 목표'만 groups에 `weekly_goal int`(if not exists) 추가(ACL/search_path 준수). 문제은행 확장은 DB 아닌 정적 JSON 권장.
- **접근:** 1) `LearnHub.tsx`: SegmentedTabs 3탭 [드릴][스터디][리뷰]. 2) 드릴 탭: 오늘의 드릴 큐(Pre/Postflop Trainer 결정적 셔플, ToolsPanel:pickDailyTool 87행 패턴)+trainerProgress 스트릭/XP/일일목표 위젯. 3) 스터디 탭: createGroup(kind='club')로 생성/가입(joinApproval), group_messages 실시간 토론. 4) 리뷰 탭: category='hand'/'study' 목록(CommunityTab board 재사용)→글 작성 시 PostFormModal에서 REPLAY 첨부→HandReplayer 단계별 재생 '너라면?' 토론. 5) 진입: App.tsx tools 탭 또는 community 'study' 섹션(오너 결정).
- **DoD:** 수용기준: (a) 드릴 정답→trainerProgress XP/스트릭 증가·새로고침 유지. (b) 스터디 코호트 생성→가입→그룹챗 실시간. (c) 핸드 리뷰에 REPLAY 첨부→HandReplayer 단계별 공개. (d) 코호트 진척 위젯. vitest: 드릴 큐 결정성(시드 고정), trainerProgress 기존 테스트 유지. Playwright: 학습 허브→드릴 1문제→XP 반영, 리뷰 글→'플랍 열기' 클릭.
- **의존성:** 스터디 코호트 배치 위치(tools vs community 'study' 섹션) 오너 결정. 문제은행 확장(정적 JSON) 콘텐츠 결정. 기존 group 인프라 재사용으로 백엔드 의존 최소.
- **가드레일:** framer-motion 금지(드릴 전환은 SlidingPill/CSS). 학습 허브가 tab-pane 내부면 진입 애니 index.css:283 무효화 대상 — 스태거 리빌 추가 금지. 그룹챗은 content-filter·신고·차단 연동. 비현금·학습 톤 유지(금액 표현 금지). Icon PATHS 단일소스, 새 라이브러리 import 전 package.json 확인. HandReplayer 재사용(hand.ts 마커 규격 준수).

#### FEAT-5 — 비현금 미션·업적·시즌 챌린지 — 명예 재화만(§28 회피)
`quick-win` · effort **M** · impact **medium** · 비용: 저비용 — 미션/업적/리그 인프라(loyalty.ts·claim_mission RPC·custom_missions) 이미 존재. 신규는 '시즌 챌린지' 집계+명예 재화(코스메틱) 확장. DB·egress 소량.

- **파일 앵커:** 대부분 존재, 확장. (1) `src/lib/loyalty.ts` 전체 — 주간 미션(getActiveMissions·getMissionProgress·claimMission 44·78·101행)·업적 BADGES(110행)·SHOP_MARKS 코스메틱(173행)·주간 리그 weekly_league·월간 명예의전당 getMonthlyHall(149행). (2) 렌더: `src/components/features/TierLeaderboard.tsx`(boards: overview/league/badges/missions/hall, 12~16행 import). (3) 운영자 커스텀 미션: `custom_missions` 테이블+adminSaveCustomMission(59행)·AdminTab.tsx. (4) 시즌 인프라: `src/api/seasons.ts`·`src/api/leagues.ts`. (5) 셀레브레이션: `LevelUpCelebration.tsx`·`TierCelebration.tsx`. (6) 신규 '시즌 챌린지'는 custom_missions에 기간(week→season) 축 추가.
- **데이터 모델:** 확장. 기존: mission_claims(user_id, mission_key, week_start PK)·custom_missions(id,title,goal_type,goal,reward,active). 신규: custom_missions에 `period text default 'week' check in ('week','season')`·`season_start date`(if not exists) + 신규 `challenge_claims`(user_id, challenge_key, period_start PK) — claim_mission RPC 분기 확장. reward는 활동점수(비현금)만. 명예 재화: SHOP_MARKS는 차감 없는 '도달 해금'(loyalty.ts:171 설계)—신규 마크 상수 추가+profiles.equipped_mark 재사용(신규 컬럼 0). 마이그레이션: if not exists·revoke/grant·search_path 고정·claim RPC는 SECURITY DEFINER 서버검증 유지(위조 지급 차단).
- **접근:** 1) claim RPC 서버검증 유지한 채 period='season' 분기 추가(체크인/입상/글 카운트를 season_start~now 집계 — getMissionProgress:84 로직 기간 파라미터화). 2) TierLeaderboard 미션 보드에 '시즌 챌린지' 섹션(주간과 분리). 3) 명예 재화: reward=활동점수(등급용 아님, 명예)+신규 SHOP_MARKS 코스메틱 해금(차감 없음). 4) 업적 BADGES에 시즌 완주 배지(자동 산출). 5) claim 성공 시 LevelUpCelebration. 6) 운영자 AdminTab에서 시즌 챌린지 CRUD(custom_missions 확장).
- **DoD:** 수용기준: (a) 시즌 챌린지 목표 달성→claim 시 서버검증 통과·중복 청구 거부(period_start PK). (b) 보상은 명예 재화(점수/코스메틱)만, 현금/환전 경로 0. (c) 코스메틱 해금은 차감 없음(등급 tierColor 불변). (d) 명예의전당/리그 기존 동작 유지. vitest: 시즌 기간 카운트 순수함수·claim 멱등(중복 키). Playwright: 랭킹 허브→미션 보드→시즌 챌린지 노출·claim 버튼 상태.
- **의존성:** claim_mission RPC 확장은 DB 마이그레이션 필요(운영자 배포). 시즌 챌린지 규칙(기간·목표·보상)은 오너 콘텐츠 결정. 기존 loyalty 보드 UI 재사용으로 프론트 의존 최소.
- **가드레일:** §28(사행성) 회피 핵심 — 모든 보상은 '명예 재화'(활동점수·코스메틱 마크·배지·칭호)뿐, 현금성 가치·환전·양도 금지. 코스메틱은 '도달 해금'(차감 없음)이라 등급/랭킹 영향 0(loyalty.ts 설계 준수). 미션 카운트/지급은 반드시 SECURITY DEFINER RPC 서버검증(클라 지급 금지, 위조 차단). framer-motion 금지(셀레브레이션은 기존 CSS confetti). Icon PATHS 단일소스.

#### FEAT-6 — 클립·하이라이트 보드 — 외부 임베드만(CSP·egress 안전)
`nice-to-have` · effort **M** · impact **medium** · 비용: 저비용(파일 호스팅 안 함 — 외부 링크만). 실비용은 CSP 확장 리스크(iframe 허용 도메인 화이트리스트). egress 0(영상은 유튜브/외부 스트림). 남용(부적절 링크) 관리 비용.

- **파일 앵커:** (1) CSP: `vercel.json` — 현 enforced CSP는 `frame-ancestors 'self'; object-src 'none'; base-uri 'self'`(느슨)이고 `Content-Security-Policy-Report-Only`에 `frame-src 'self' https://*.googlesyndication.com ... https://*.portone.io`(유튜브 없음). report-only frame-src에 `https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com` 추가, enforced CSP에도 명시적 `frame-src` 화이트리스트 추가(느슨한 현 상태를 이 기능 한정으로 조임). (2) 신규 `src/api/clips.ts`(community.ts 패턴)·`src/components/features/ClipsBoard.tsx`. (3) URL 파싱: 신규 `src/lib/embed.ts`(유튜브 videoId 추출) — 원시 SVG/이미지 썸네일. (4) 진입: CommunityTab.tsx 신규 섹션 'clips'(SectionTab 179행 패턴). (5) 신고/차단: reports.ts·blocks.ts·adminSetPostBlinded(community.ts:147). (6) Icon.tsx PATHS `'play-circle'` 1줄.
- **데이터 모델:** 신규 1테이블 `clips`(id uuid pk default gen_random_uuid(), user_id uuid, provider text check in ('youtube','vimeo'), video_id text, title text check char_length<=120, note text, region text, created_at timestamptz default now(), likes int default 0, blinded boolean default false). 원본 파일 저장 안 함 — video_id만(egress 0). 안전수칙: create table if not exists·RLS enable·SELECT 공개(blinded=false)·INSERT authenticated+레이트리밋(rate_limit 재사용)·revoke from public/grant select anon,authenticated/insert authenticated·트리거 search_path=public. 좋아요는 post_like_toggle(20260726d) 패턴 또는 clip_likes.
- **접근:** 1) vercel.json CSP frame-src 화이트리스트 확장(youtube-nocookie 우선, report-only→enforced 순차). 2) `embed.ts`: URL→{provider,videoId} 파싱(유튜브/비메오만 허용, 그 외 거부). 3) `clips.ts`: list/create(video_id만)/like/delete. 4) `ClipsBoard.tsx`: 카드 그리드, 클릭 시 youtube-nocookie iframe lazy 임베드(사용자 클릭 후에만 주입). 5) CommunityTab 'clips' 섹션 추가. 6) 등록 폼: URL 붙여넣기→썸네일 미리보기(img.youtube.com, img-src https: 기존 허용)→제목/지역. 7) 신고·차단·블라인드.
- **DoD:** 수용기준: (a) 유튜브/비메오 URL만 등록 가능(타 도메인 거부). (b) 클립 클릭→youtube-nocookie iframe 재생, CSP 위반 콘솔 에러 0. (c) 원본 파일 업로드 경로 없음(egress 0). (d) 신고/차단/블라인드 동작. (e) 클릭 전엔 iframe 미주입(썸네일만). vitest: embed.ts URL 파서(허용/거부). Playwright: 클립 등록→목록→클릭 재생(iframe src=youtube-nocookie 확인).
- **의존성:** CSP 변경은 배포 후 전 페이지 영향→신중 검증(report-only 먼저 관찰 후 enforced). 허용 임베드 provider 목록 오너 결정(유튜브만? 비메오/치지직 포함?). 저작권 정책('링크 임베드'만) 오너 확인.
- **가드레일:** 외부 임베드 전용 — 영상 파일 호스팅/재업로드 금지(egress·저작권 회피). CSP frame-src는 최소 화이트리스트만(와일드카드 남발 금지, youtube-nocookie 우선). iframe은 사용자 클릭 후 주입(자동재생 금지). 저작권: 링크 임베드만·신고 시 즉시 블라인드. content-filter/신고/차단 연동. framer-motion 금지. Icon PATHS 단일소스. 무료 egress 보호(썸네일도 외부 img.youtube.com, 자체 저장 금지).

#### FEAT-7 — 굿핸드/배드빗 명예의 벽 — 비현금 인정(주간·월간 롤링)
`quick-win` · effort **S** · impact **medium** · 비용: 매우 저비용 — 리액션(post_reactions badbeat/goodrun) 이미 존재. 집계 RPC 하나+위젯 하나. egress 소량(캐시), 신규 테이블 0.

- **파일 앵커:** 핵심 인프라 존재. (1) 리액션: `src/api/community.ts` — `ReactionType='badbeat'|'goodrun'`(83행)·`reactToPost`(1044행)·`getMyReaction`(1035행)·CommunityPost `badbeatCount/goodrunCount`(77·78행)·post_reactions 테이블. (2) 핸드 첨부: `src/lib/hand.ts`(encodeReplay/parseAttachments)·`HandReplayer.tsx`. (3) 명예의전당 패턴: `src/lib/loyalty.ts:getMonthlyHall`(149행, 지난달 TOP3 집계) 복제해 리액션 기준. (4) 렌더: `src/components/features/TierLeaderboard.tsx`(hall 보드 옆 '명예의 벽' 보드) 또는 `WeeklyBestStrip.tsx`(메인 상단 롤링) 패턴. (5) Icon.tsx PATHS `'trophy'`/`'flame'` 1줄. (6) 카테고리: PostCategory 'hand'(community.ts:66) 글 중 리액션 최다.
- **데이터 모델:** 신규 테이블 0. 집계 RPC: `create or replace function public.hall_of_hands(p_kind text, p_from date, p_to date) returns table(post_id uuid, author_name text, replay_excerpt text, cnt int) language sql stable` — community_posts join post_reactions where type=p_kind and created_at in range group by order by cnt desc limit 10. `search_path=public` 고정·`revoke execute from public; grant execute to anon, authenticated`. 블라인드(blinded=false)·섀도우밴 계정 제외(P27.3 패턴). 비현금: 순위=리액션 수(명예)뿐, 상금·금액 없음.
- **접근:** 1) hall_of_hands RPC(주간=이번주 월~, 월간=지난달) 마이그레이션. 2) community.ts에 getHallOfHands(kind, period) 추가. 3) '명예의 벽' 보드: 굿핸드(goodrun) TOP·배드빗(badbeat) TOP 두 열, 각 항목은 HandReplayer 미니 프리뷰+작성자(코스메틱 마크 markEmojiOf)·리액션 수. 4) 클릭→원 글(PostDetailModal). 5) 주간/월간 SlidingPill 토글(atoms/SlidingPill.tsx FLIP). 6) 수상 배지(선택): loyalty.ts BADGES에 '명예의 벽 등재' 자동 배지. 7) 롤링: WeeklyBestStrip처럼 메인 상단 노출(active 게이트).
- **DoD:** 수용기준: (a) 배드빗/굿런 리액션 최다 핸드가 주간/월간 명예의 벽에 랭크. (b) 블라인드/신고/섀도우밴 글 제외. (c) 항목 클릭→원 글 리플레이 재생. (d) 금액·현금 표기 0(리액션 수만). (e) 주간↔월간 토글. vitest: hall_of_hands 집계 동등성·기간 경계(월 시작/끝). Playwright: 랭킹 허브→명예의 벽→항목 클릭→PostDetailModal 열림.
- **의존성:** 선행 거의 없음(리액션·핸드 첨부 가동). 배치 위치(메인 롤링 vs 랭킹 허브 보드) 오너 결정. 섀도우밴 제외은 기존 P27.3 로직 재사용.
- **가드레일:** 비현금 인정만 — '명예의 벽' 순위는 커뮤니티 리액션(공감) 수, 상금/금액 절대 미표기(§28). 블라인드·신고(reports)·차단(blocks)·섀도우밴(P27.3) 반영해 부적절/부정 계정 제외. HandReplayer 재사용(hand.ts 마커 규격). framer-motion 금지(토글은 SlidingPill, 롤링은 CSS). tab-pane 내부 진입 애니 index.css:283 주의. Icon PATHS 단일소스.

#### FEAT-8 — 공개 데이터 레이어 — iCal 구독·임베드 위젯·읽기전용 API(레이트리밋)
`big-bet` · effort **M** · impact **high** · 비용: 중 — Vercel 서버리스 함수 3종(iCal/API/embed). egress 리스크가 핵심: 캐시(s-maxage) 필수, 응답 크기 상한. Supabase 요청은 anon 키로 서버측(REST) — 무료 한도 보호 위해 CDN 캐시·레이트리밋 필수.

- **파일 앵커:** 패턴 완비. (1) 서버리스: `api/s.js`·`api/p.js`·`api/sitemap.js`(전부 Supabase REST를 anon 키로 fetch→캐시 응답, 500 없이 폴백). 신규 `api/ical.js`·`api/venue.js`(읽기전용 JSON)·`api/embed.js`(임베드 위젯 HTML). (2) iCal 생성: `src/lib/calendar.ts:downloadIcs`(16행, VCALENDAR/VEVENT/TZID Asia/Seoul 로직)·`googleCalendarUrl`(71행) 서버로 이식. (3) 라우팅/헤더: `vercel.json` rewrites(`/ical/:code`→`/api/ical?code=:code`, `/api/venue`)·headers(CSP·Cache-Control). (4) 데이터: schedules(approved=eq.true)·venues(approved·status=active) — sitemap.js:24 필터 재사용. (5) 임베드 위젯 CSP: frame-ancestors 현 'self'→외부 임베드 허용은 위젯 응답에 완화 헤더(경로 한정). (6) 레이트리밋: 서버리스 IP 간이 제한 또는 Supabase rate_limit.
- **데이터 모델:** 신규 테이블 0(읽기전용 노출). 노출 필드 화이트리스트만: 일정=제목·매장·지역·일시·포맷·GTD·바이인(만원 텍스트)·승인여부; 매장=이름·지역·주소·영업시간·slug. 개인정보/장부/실금액(원 상세)/미승인 데이터 노출 금지. API 키 필요 시 `api_tokens`(token text pk, label, created_at, rate_limit int) — 단 v1은 무인증 공개 읽기(승인·활성만)+레이트리밋 권장. iCal은 상태 없는 공개 피드(코드=venue slug). 캐시: s-maxage=600~3600.
- **접근:** 1) `api/ical.js`: code(slug)→해당 매장 승인 일정 fetch→calendar.ts:downloadIcs 로직으로 VCALENDAR 문자열, Content-Type text/calendar, Cache-Control s-maxage=1800(sitemap.js 캐시 패턴). 전체 피드(code 없음)도 지원. 2) `api/venue.js`: 읽기전용 JSON, CORS `Access-Control-Allow-Origin: *`, 레이트리밋 헤더. 3) `api/embed.js`: 매장 일정 미니 위젯 HTML(자체완결 인라인 CSS, 외부 사이트 iframe용) — 별도 완화 CSP. 4) vercel.json rewrites/headers 추가. 5) VenuePage.tsx에 '구독/임베드/API' 안내 UI(iCal 링크 복사·임베드 코드 복사, googleCalendarUrl 재사용). 6) 레이트리밋+CDN 캐시로 원본 보호.
- **DoD:** 수용기준: (a) `/ical/<slug>` 구독→구글/애플 캘린더에 승인 일정 표시. (b) `/api/venue?code=<slug>`→화이트리스트 JSON, 미승인/개인정보 필드 부재. (c) 응답 CDN 캐시(s-maxage) 적중 — 원본 Supabase 요청 최소화. (d) 임베드 위젯이 외부 페이지 iframe에서 렌더. (e) 오류 시 500 없이 폴백(api/s.js 규약). vitest: iCal 문자열 생성기(VEVENT/DTSTART TZID) 단위테스트, 필드 화이트리스트 필터. 수동: ical 응답 헤더·캐시 확인, .ics를 캘린더 앱에 임포트.
- **의존성:** 레이트리밋/무인증 공개 범위 오너 결정(무인증 공개 vs 토큰 발급). 외부 임베드 허용은 CSP frame-ancestors 완화 필요(경로 한정). Supabase anon 키는 이미 서버리스 사용 중(api/s.js:35) — 추가 시크릿 불필요.
- **가드레일:** 무료 egress 보호가 최우선 — 모든 응답 s-maxage CDN 캐시·응답 크기 상한·레이트리밋 필수(무한 스크레이핑 방어). 노출은 '승인·활성 공개 데이터' 화이트리스트만(개인정보·장부·미승인·실금액상세 금지). 500 금지·폴백 필수(api/s.js 규약). iCal/JSON은 읽기전용(쓰기 엔드포인트 금지). 임베드 CSP 완화는 해당 경로만(전역 frame-ancestors 유지). 개인정보 URL 파라미터 금지. 법적: 공개 일정 정보만(사행성/환전 표현 없음).

#### FEAT-9 — 딜러/스탭 검증 마켓 — 중개 아닌 게시·매칭(구인·구직·검증 배지)
`quick-win` · effort **M** · impact **medium** · 비용: 저~중 — 딜러 구인/구직·지원서(dealer_posts·dealer_applications) 이미 가동. 신규는 '검증 배지'(경력/신원 옵트인 확인)+프로필. egress 소량. 신원 이미지 취급 시 개인정보 보관 최소화 비용.

- **파일 앵커:** 핵심 존재, 확장. (1) `src/api/community.ts` — `DealerPost`(603행, kind hiring/seeking/general·wage·workHours·region)·`createDealerPost`(647행)·`getDealerPosts`(636행)·`DealerApplication`(682행, RLS로 작성자/운영자만 열람)·`createDealerApplication`(692행). (2) UI: `src/components/features/DealerCommunity.tsx`(CommunityTab section='dealer' 248행). (3) 검증 파이프 재사용: `src/api/rankverify.ts`(비공개 버킷 'verifications'·서명URL·운영자 승인·신분증 즉시삭제 78행)·`src/api/identity.ts`·`IdentityVerificationButton.tsx`·`supabase/functions/verify-identity`. (4) 시프트/급여(운영자측): `src/api/dealerShifts.ts`·`StaffSchedule.tsx`·`StaffPayroll.tsx`. (5) 신고/차단: reports.ts·blocks.ts. (6) Icon.tsx PATHS `'badge-check'` 1줄. (7) 딜러 프로필: FEAT-3 PlayerProfilePage 패턴 또는 신규 DealerProfile.
- **데이터 모델:** 확장. 기존 dealer_posts/dealer_applications 유지. 신규 `dealer_profiles`(user_id uuid pk, display_name text, region text, experience text, cert_verified boolean default false, id_verified boolean default false, public boolean default true, created_at) — 신원/경력 증빙은 비공개 버킷 'verifications'(rankverify 패턴) 업로드→운영자 승인 시 cert_verified/id_verified=true, 증빙 이미지는 승인 후 즉시 삭제(개인정보 최소보관). 마이그레이션: create table if not exists·RLS(본인 쓰기·공개 SELECT는 public=true & 배지 필드만)·revoke/grant·search_path 고정·SECURITY DEFINER 승인 RPC(운영자만). 중개 아님: 매칭은 게시+지원서 전달까지만, 계약/급여정산 로직/수수료 컬럼 없음.
- **접근:** 1) dealer_profiles 마이그레이션(배지·옵트인·비공개 증빙). 2) `src/api/dealerVerify.ts`: 프로필 upsert·증빙 제출(rankverify.submitRankVerification 22행 업로드 패턴 복제)·운영자 승인 RPC. 3) DealerCommunity.tsx: 구인/구직 목록에 검증 배지(✔경력/✔신원), 프로필 카드. 4) 지원서 흐름 유지(createDealerApplication) — 연락처는 작성자/운영자만(RLS). 5) 운영자 검증 큐: AdminTab에 rankverify adminList/decide 패턴 복제(승인→배지 부여·증빙 삭제). 6) 딜러 프로필 공개 페이지(옵트인, 실명 미공개). 7) '중개 아님' 고지 배너(계약·급여는 당사자 간, 플랫폼은 게시판만).
- **DoD:** 수용기준: (a) 딜러 프로필 생성→구인글에 검증 배지 표시(승인 후). (b) 증빙 이미지는 비공개 버킷, 승인/거절 즉시 신분증 삭제(rankverify 규약). (c) 지원서 연락처는 작성자/운영자만 열람(RLS). (d) 플랫폼에 수수료/급여정산/계약체결 기능 부재. (e) public=false 프로필 비노출·신고/차단 동작. vitest: dealer_profiles 매퍼·배지 상태 전이. Playwright: 딜러 섹션→구인글→지원(로그인)→작성자만 열람 확인.
- **의존성:** 검증 승인 운영 인력(운영자 큐 처리량)에 배지 신뢰도 의존. 신원/경력 증빙 취급 범위·보관정책 오너 법무 결정(기본: 승인 후 즉시삭제). 기존 dealer_posts 재사용이라 백엔드 신규 최소.
- **가드레일:** 중개 아님 — 게시·지원서 전달·검증 배지까지만. 계약체결·급여정산·수수료·에스크로 기능 금지(직업소개/파견 규제·법적책임 회피). 개인정보: 증빙은 비공개 버킷+승인 후 즉시삭제(rankverify.ts:83 패턴), 연락처 RLS 게이트, 프로필 실명 미공개·옵트아웃 기본. 신고(reports)·차단(blocks) 연동. 비현금·합법 톤(인력 게시판). framer-motion 금지·Icon PATHS 단일소스·새 라이브러리 import 전 package.json 확인.

---

## 6. 추가 영역 · UI 정체성 / de-AI (DAI-1..6)

> 2026-08-25 사장님 지시로 추가. "AI 티" 제거 = 제네릭 기본값(다크+인디고 하나·둥근카드 도배·이모지·폴백폰트·중앙정렬)을 버리고 **포커 정체성(펠트·칩·카드·밤)** 에 커밋. redesign-skill 저위험 순서(폰트→컬러→hover→레이아웃→컴포넌트→상태→타이포)로, **5화면 리디자인의 디자인 스파인(아티팩트 b94d3202)보다 먼저/함께** 적용되는 횡단 작업. 실행 재량(§0) 최대 적용 대상 — Fable 5가 유저 UI/UX를 더 낫게 격상 권장.

### DAI-1 — 폰트 실렌더 + 디스플레이 페어링 (최우선 · 최대 레버 · 저위험)
`quick-win` · effort **S** · impact **high** · 비용: 무료(서브셋 self-host 첫방문 +수십KB, 캐시퍼스트 SW가 재방문 흡수)
- **파일 앵커:** tailwind.config.js:71-72(fontFamily.sans=['Pretendard Variable','Pretendard','system-ui','sans-serif']), src/index.css(현재 @font-face·preload **전무** → Pretendard가 미설치 기기에서 조용히 system-ui로 폴백 = AXP-7과 동일 이슈), offline.html도 Pretendard 지정. 제목 컴포넌트는 App.tsx AppHeader(:135)·각 화면 h1/h2.
- **데이터 모델:** none.
- **접근:** ①Pretendard 서브셋 woff2 self-host(@font-face + font-display:swap + <link rel=preload>, CSP font-src 'self' 유지) — 의도한 한글 타이포가 실제로 렌더되게. ②**디스플레이 폰트 페어링**: 제목/헤드라인·숫자 히어로용 캐릭터 있는 face 1종 추가(fontFamily.display 신규 토큰). 헤드라인은 크게·타이트(-tracking)·무겁게. ③숫자는 tabular-nums를 장부·스택·상금·카운트에 강제(리디자인 DAI/프리미엄 마감과 공유). AXP-7과 **한 작업으로 조율**(중복 금지).
- **DoD:** 미설치 기기에서도 Pretendard 실렌더(네트워크탭 woff2 200) · 제목이 body와 구별되는 목소리 · 숫자 열 정렬 · build/E2E 그린. 폰트 로드 스냅샷 테스트.
- **의존성:** AXP-7(Pretendard 정합)과 동일 대상 — 통합. 디스플레이 폰트는 Google Fonts self-host 가능 여부 확인(오너 결정 불필요, 라이선스 OSS만).
- **가드레일:** Tailwind v3 토큰(fontFamily 확장). 신규 fontSize 스케일 신설 금지(기존 스케일 사용). CSP font-src 'self' 유지(CDN 금지).

### DAI-2 — 포커 팔레트 확장 + 텍스처 (인디고 단독 탈피)
`quick-win` · effort **M** · impact **high** · 비용: 무료(순수 CSS, egress 0)
- **파일 앵커:** tailwind.config.js(surface 스케일·accent-300 #5E6AD2 정의부), src/index.css(:root CSS 변수), 상금/성공/라이브 사용처(ClockDisplay·ScheduleCard·WeeklyBestStrip·StoreDashboard).
- **데이터 모델:** none(디자인 토큰).
- **접근:** ①인디고(accent-300)는 상호작용/링크/활성/포커스용으로 유지. ②**세컨더리 hue 신규 토큰**: 펠트 그린(포커 테이블 → 성공/라이브/온라인/나이스런), 골드(gold-300 이미 있음 → 칩/상금/마일스톤/트로피에 정식화). 색 스토리 = 밤+펠트+칩. ③중립 그레이를 인디고 편향으로 통일(따뜻/차가움 혼용 금지). ④그림자를 검정 대신 배경 hue tint. ⑤**텍스처**: 미세 그레인/펠트(layered radial-gradient + 초소형 인라인 SVG noise data-uri, 이미지 에셋 0)를 히어로·클락 등 핵심 서피스에 절제 있게 → 플랫 다크의 sterile 제거. (클락 프리셋 '미드나잇 그린펠트'와 공유.)
- **DoD:** 액션색↔에퀴티밴드 토큰 분리 유지(검증 #01) · 텍스처 egress 0 · 대비 유지(WCAG AA) · reduced-motion 무관(정적 텍스처) · build 그린.
- **의존성:** 클락 개인화(surfaces 클락)·프리미엄 숫자 마감과 팔레트 공유. GTO 액션색 토큰(검증 #01)과 충돌 없게.
- **가드레일:** Tailwind v3 토큰 체계(rgb(var(--surface-*)/<alpha>)). 새 색은 토큰으로만(임의 hex 남발 금지). 순수 CSS(이미지 라이브러리 금지).

### DAI-3 — 이모지 → 커스텀 마크/아이콘 (수트·칩·카드)
`quick-win` · effort **M** · impact **high** · 비용: 무료
- **파일 앵커:** src/components/atoms/Icon.tsx(PATHS 레지스트리 — 유일 아이콘 소스), 이모지 사용처 전수(grep: 🎯🔥🏆🎲📕⏰🎫🕶 등, ScheduleCard·WeeklyBestStrip·StoreDashboard·CommunityTab·알림 등 다수).
- **데이터 모델:** none.
- **접근:** ①UI 마커로 쓰인 이모지를 Icon.tsx PATHS 글리프로 치환(리디자인 Phase 1 '이모지→Icon'과 동일 작업 — 통합). ②포커 시그니처 마크 신설: 수트(♠♥♦♣)·칩·카드·트로피를 Icon.tsx에 커스텀 PATH로 추가(Lucide 스타일 viewBox 24, 단 수트는 fill 허용). ③섹션 마커·상태 아이콘을 이 세트로 통일 → 이모지-as-마커(최대 AI-tell) 제거.
- **DoD:** 핵심 화면에 UI 마커 이모지 0(본문/사용자 콘텐츠 이모지는 무관) · 신규 글리프는 PATHS 한 줄씩 · 아이콘 stroke weight 통일 · build 그린.
- **의존성:** 리디자인 Phase 1 이모지→Icon 치환과 한 작업. 커스텀 마크는 Icon.tsx 단일 확장.
- **가드레일:** **새 아이콘 라이브러리 설치 절대 금지(가드 훅이 차단)** — 오직 Icon.tsx PATHS. 순수 SVG.

### DAI-4 — rounded 도배 탈피 + 여백 리듬 + 카드 절제
`nice-to-have` · effort **M** · impact **medium** · 비용: 무료
- **파일 앵커:** src/index.css(rounded-card·border-* 유틸), tailwind.config.js(borderRadius 스케일), 카드 컴포넌트 전반(공유 카드 문법은 리디자인 design_spine과 공유).
- **데이터 모델:** none.
- **접근:** ①반경 차등(안쪽 요소 타이트/컨테이너 소프트). ②모든 걸 'border+shadow+배경' 카드에 넣지 말고, **헤어라인(border-subtle)+여백**으로 계층 — 카드는 elevation이 실제로 의미 있을 때만. ③섹션 여백을 키워 숨쉬게(하단 패딩 광학적으로 약간 더). ④'accent 바/레일 붙은 둥근 카드' 반복 패턴 제거.
- **DoD:** 반경/카드 사용에 위계 존재 · 밀도 높은 목록(장부·매트릭스)은 판독정보 유지 · 회귀 없음(build/E2E) · 시각 회귀 스냅샷(있으면).
- **의존성:** 리디자인 design_spine(카드 문법)과 조율 — 중복 정의 금지.
- **가드레일:** Tailwind v3. keep-alive 진입 애니 새로 만들면 index.css:283/384-385 등록. framer-motion 금지.

### DAI-5 — 데스크톱 상단 GNB를 '프로덕트 헤더'로 격상 (Modelfy식)
`big-bet` · effort **M** · impact **high** · 비용: 무료
- **파일 앵커:** **App.tsx AppHeader(:135, sticky top-0 z-50 :193)** + **TabBar(:450, "상단 GNB는 PC(lg+) 전용" :478, accent-300 언더라인 인디케이터 :512)** — 렌더 :2038(AppHeader)·:2127(TabBar). MobileTabBar(:522, fixed bottom lg:hidden, 글래스 그라디언트 :575)는 렌더 :2129. **이미 PC 상단탭이 존재** → 신규 생성이 아니라 격상.
- **데이터 모델:** none.
- **접근:** ①데스크톱(lg+) 헤더를 **로고(좌) + 주요 탭(중앙, active=SlidingPill 언더라인 FLIP) + 우측 검색·알림·프로필/로그인 CTA** 의 응집된 프로덕트 헤더로 재구성(현재 AppHeader+TabBar를 시각적으로 하나로). ②스크롤 시 글래스 축소(backdrop-blur, 기존 sticky/글래스 패턴 재사용). ③active 탭 명확 표기(현 언더라인 :512 유지·강화). ④**모바일 하단 탭바(MobileTabBar)는 그대로 유지**(모바일 정답) — 반응형 분기(lg 기준) 명확히. ⑤"모바일 앱을 큰 창에 띄운 느낌"→"진짜 웹 프로덕트" 지향.
- **DoD:** 데스크톱에서 헤더가 프로덕트 내비로 읽힘 · active 인디케이터 SlidingPill FLIP(좌표 게이트) · 모바일 하단 탭 무변경 · --stack-top(App.tsx:1258) 재계산 정상 · 키보드 포커스·현재탭 표시 · build/E2E(sliding-pill·static-shell) 그린.
- **의존성:** DAI-1(폰트)·DAI-2(팔레트)·DAI-3(로고/마크) 선행 시 시너지. SlidingPill 패턴 재사용.
- **가드레일:** **framer-motion 금지 → SlidingPill FLIP**(가드 훅 차단). Tailwind v3. Icon.tsx 단일소스. keep-alive·정적셸(e2e/static-shell) 규칙 준수. z-index 스케일 유지(z-50 GNB).

### DAI-6 — 레이아웃 비대칭·깊이 + 한 곳의 대담함
`nice-to-have` · effort **M** · impact **medium** · 비용: 무료
- **파일 앵커:** browse 랜딩/히어로(App.tsx browse 섹션·WeeklyBestStrip·BrowseSideRail :2832), 주요 섹션 그리드.
- **데이터 모델:** none.
- **접근:** ①3-카드 균등 그리드(가장 generic) 대신 지그재그·비대칭·masonry. ②중앙정렬 도배 탈피(좌정렬 헤더 위 콘텐츠 등). ③겹침·음수 마진으로 깊이. ④**한 곳의 대담함**: 히어로에 펠트 텍스처 or 수트 워터마크 or 칩 스택 그래픽을 절제 있게(순수 SVG/CSS) → "designed" 시그니처. 데이터테이블·장부 등 밀도 UI는 대상 아님(scope 밖).
- **DoD:** 최소 1개 비대칭 레이아웃 + 1개 시그니처 디테일 · 모바일 회귀 없음 · CWV(CLS) 유지 · build 그린.
- **의존성:** DAI-2(텍스처)·DAI-3(수트 마크) 자산 재사용. 리디자인 마무리 단계.
- **가드레일:** 순수 SVG/CSS(라이브러리 금지). CLS 악화 금지(치수 예약). framer-motion 금지·Tailwind v3.

**DAI 실행 순서(리디자인 스파인에 편입):** Phase 0/1(스파인·저위험)에 DAI-1(폰트)→DAI-2(팔레트)→DAI-3(이모지→마크)를 최우선 편입 → Phase 2(공유 컴포넌트)에 DAI-4(카드/여백)·DAI-5(데스크톱 헤더 격상) → Phase 3 마무리에 DAI-6(비대칭·시그니처). 전부 5화면 리디자인보다 먼저/함께 가야 그 화면들이 새 정체성 위에 얹힘. **핵심 원칙: 제네릭 기본값을 버리고 포커에 특정하라.**

---

## 7. 오너 결정 확정 + GTO 탭 강화 (2026-08-25)

> 사장님이 오너 결정 4건(③④⑤⑥) 확정 + GTO 탭 강화 지시. "나머지는 Fable 5가 대한민국 사람들의 인식·UX를 전적으로 고려해 반영." → 실행 재량(§0) 최대 적용, 단 아래 확정 사항은 우선.

### 확정 결정 (카드보다 우선)
- **③ 반응 리네이밍 + 점수** — 억까/나이스런 → UI 라벨 **`리스펙`(멋진 플레이·goodrun)·`토닥`(위로·badbeat)** + 기존 `좋아요`. DB badbeat/goodrun 컬럼 유지(라벨만 교체). **반응 1개 = 작성자 +1점**(1인 1반응/게시물 유니크, 섀도우밴·레이트리밋 가드, 자기 게시물 제외). PostDetailModal '등급 점수 미반영' 문구 제거. 앵커: reactToPost 흐름·community.ts·활동점수(logActivity)·get_activity_leaderboard.
- **④ 프로필 성과 = T 단위** — 금액(원) 직접 표시 금지, **1T=10만원 '기록 단위'**로 누적 성과 + **입상 횟수** 병기(Hendon Mob식 커리어 기록). 시드지갑 요약(보유 N장·T)을 프로필에 노출(진입 링크만 아님). **지갑/환전/출금/정산 UI 절대 없음 + '비환전·기록·금전 지급 아님' 라벨** = §28 안전선. cross-cutting #3 갱신: totalAmount/prize를 원이 아니라 **T로 표시**(저장은 유지 가능, 표시·프레임만 T·비환전). 앵커: ProfileModal·FEAT-1(myPlayHistory)·FEAT-3(머니리스트)·vouchers.
- **⑤ 클락 개인화 진입점** — VenueCustomizePanel 외에 **①클락 러닝 시작 전 설정 화면 ②러닝 중 '수정' 버튼**에서 clockTheme를 연다(직관성). surfaces[0] 클락 카드 approach에 진입점 2개 추가. 앵커: TournamentClock(운영 컨트롤)·ClockDisplay·clockTheme(page_config).
- **⑥ GTO 탭 통합** — 커뮤니티 진입 아님. **기존 tools 탭 → 'GTO' 탭으로 재편**, 매장 운영 도구(ChipDistributor 칩분배·StructureSim 구조시뮬·BlindBuilder 블라인드생성·상금분배·종료시간)를 **my-store(VenueManageTab)로 이전**. 고아 GtoDeepWidget 삭제. GTO 탭 = 학습·분석·계산기 3레인. 앵커: ToolsPanel.tsx·App.tsx TabId('tools'→라벨 GTO)·VenueManageTab(도구 이관 대상).

### GTO 탭 강화 스펙 (surfaces[6] GTO IA 재설계 갱신 + 신규 도구)
**IA(3레인, 매장 도구 제외):** 상단 상시 ProgressStrip(스트릭·XP·오늘 목표) + **For You**(trainerProgress 약점 적응형 추천, 초보/고수 persona 자동+수동 override — 명시 토글보다 우선). ①학습=프리/포스트플랍 트레이너·오늘의 드릴·스팟 퀴즈·근접도 점수·약점 리포트 ②분석=GTO 핸드분석(핸드vsR·RvsR)·핸드 리플레이어(에퀴티/아웃츠)·레인지 가이드(13×13)·푸시폴드·스타팅핸드 ③계산기=팟오즈·아웃츠·EV·MDF·SPR·ICM·M존·뱅크롤·분산.

**UI/UX 개선:** GTO 명칭 단일화 · 고아 위젯 삭제 · 액션색↔에퀴티밴드 토큰 분리(검증 #01) · 제목 2중 제거 · CalcCard 통일 · 모바일 카드 desc 노출 · **결과 우선(전 계산기 ResultHero 예시 시드)** · 13×13 매트릭스 색각 이중 인코딩(명도+코너 글리프 R/C/4)·확대/라벨 토글·핀치 · de-AI 정체성(DAI 팔레트·수트 마크·폰트) 통합.

**신규 도구 (한국 유저 인식·UX 고려):**
1. 프리플랍 차트 브라우저 — 포지션×스택별 오픈/3벳/콜 열람(ranges.data.ts 재사용, 뷰 신규)
2. 실전 스팟 라이브러리 — 3벳팟·4벳·스퀴즈·C벳·체크레이즈 등 드릴
3. **ICM 딥 + 딜(deal) 계산기** — 파이널 ICM·버블팩터·칩 딜 분배(한국 토너 딜 문화)
4. 핸드 붙여넣기 분석 — 텍스트 핸드→GTO 분석+EV손실(FEAT-1 연계)
5. **한국어 GTO 용어 사전/툴팁** — 영어 용어 한글 병기(초보 진입장벽 해소)
6. 오늘의 핸드/드릴(약점 적응형) — 데일리 훅을 학습으로(미신 위젯 대체)
7. 빠른 에퀴티 계산기(핸드/레인지 vs 레인지) — GtoDeep 재사용

**한국 UX 원칙:** 영어 GTO 용어 한글 병기 · 딜 계산(한국 토너 문화) · 결과 우선(빠른 답) · 모바일 가독성 · 도박 조장 아닌 '실력 향상' 톤.

**가드레일:** framer-motion 금지(SlidingPill)·Icon.tsx 단일소스·Tailwind v3·순수 SVG·기존 인프라(trainerProgress·nash.data·ranges.data·calcUi) 재사용, 백엔드 변경 최소. 상태는 로컬(localStorage 즐겨찾기/최근). nuri-ship 게이트.

---

## 8. 무료 한국판 GTO Wizard 전략 (2026-08-25, 7각도 리서치 종합)

> 사장님 "GTO Wizard 한국판을 무료로" 지시. 리서치(GTO Wizard 해부·오픈솔버·알고리즘·저작권·한국시장·NURI코드매핑, 6/7 성공+종합) 결과. **핵심 결론: NURI는 이미 GTO Wizard의 '가벼운 절반'을 코드로 보유. 결정적 결손은 단 하나(포스트플랍 CFR 솔버). 전략 = 유료 솔버 군비경쟁이 아니라 '2026 무료 GTO 생태계'의 빈칸을 한국어로 선점.**

### ⚖️ 합법 데이터 전략 (하드 가드레일 — 위반 시 서비스 리스크)
**단일 규칙: 모든 전략값·레인지·차트 수치는 NURI 자체 엔진(equity-matrix.mjs 4만회 MC + nash-solve.mjs + 자체 DCFR)으로만 생성.**
- ✅ **자유(수학적 사실)**: Nash 균형·에퀴티·확률·ICM = 저작권/DB권 대상 아님(Feist·합체원칙). 13×13 그리드·푸시폴드 컷오프 형식도 아이디어 합체로 보호 불가.
- 🚫 **AGPL 솔버 코드 임베드 절대 금지**: TexasSolver·wasm-postflop·postflop-solver 전부 **AGPL-3.0 §13(네트워크 카피레프트)** → 라이브 웹에 임베드 시 **NURI 전체 소스공개 의무 발생.** 오직 오프라인 별도 프로세스의 **교차검증 레퍼런스로만.** 진짜 솔버는 **DCFR 논문(Brown&Sandholm 2019, arXiv:1809.04040) 알고리즘만 클린룸 자체 구현**(알고리즘·수학은 저작권 대상 아님).
- 🚫 **복사·스크래핑 금지**: GTO Wizard/Pio/PokerCoaching 솔루션 출력 재입력·재배포(ToS 7.4/7.5/8.1 계약책임), 전략서(MPT 등) 차트·표·본문 복제(어문·편집저작물), 무료 프리플랍 차트(Upswing/RedChip/RangeCraft)라도 통복사(All rights reserved).
- ⚠️ **한국법 특칙(미국보다 엄격)**: 저작권법 제93조 sui generis DB권(창작성 불요·투자 보호) + 부정경쟁방지법 (파)(카)목 중첩. **야놀자 판례(대법원 2021도1533): 반복·체계적 크롤링은 개별값이 사실이어도 침해 가능** → 한국 기준 준수.
- ✅ **Permissive 코드만 채용 가능(데이터 아님·코드/알고리즘 한정)**: pokersolver(MIT)·OMPEval(ISC)·OpenSpiel(Apache-2.0).
- 💬 **이게 곧 마케팅 메시지**: "남의 차트 복사 아님 — 직접 4만회 시뮬 계산."

### 🏗 기술 접근 (100% 클라이언트 연산 + 무료 Supabase 텍스트만)
3층: **(1) 프리플랍/수학 = 완전 무료 자체계산**(기존 equityEngine 플랍990·턴44·리버1 전수 + 프리플랍 MC, nash.data.ts, ranges.ts 위에 증축). **(2) 포스트플랍 = 두 경로**: (a)턴/리버 **단일노드 서브게임 CFR**(레인지·보드 고정이면 트리 작아 브라우저 수초 수렴, DCFR TypeScript 자체구현, 핫루프만 필요시 자체작성 단일스레드 WASM으로 COOP/COEP 회피→PortOne·Sentry 임베드 호환 유지) (b)**20~30 대표 캐노니컬 플랍**(수트 isomorphism 축약) 빌드타임 오프라인 자체솔브→압축 정적 JSON 번들. **(3) 성능**: MC ≤3000회 규칙, 무거운 루프 웹워커/setTimeout(0). 병목 시 OMPEval(ISC)만 선택적 WASM 가속. **스택 제약 절대 준수**(Tailwind v3·framer-motion 금지 SlidingPill·Icon.tsx 단일소스·새 라이브러리 import 전 package.json 확인).

### 🇰🇷 한국 로컬라이즈 (킬러)
- **1순위 용어 사전**: 영어 음차(쓰리벳·씨벳·팟오즈·에퀴티) 표기가 매장·방송마다 제각각(에퀴티/에쿼티) → **[영문표준·한국식발음·자체정의·도구딥링크] 4열 사전 + 전 도구 UI 밑줄 툴팁**. NURI가 표준표기 못박아 SEO·브랜딩 선점.
- **2순위 딜/칩찹 계산기**: 한국 토너 파이널 딜/칩찹/ICM딜 실무(2ace 앱 기본탑재 수준) → 남은스택 입력→ICM딜·칩찹·차액판정 한 화면. 커뮤니티 검색어 정확 일치=유입·바이럴.
- **전면**: 계산기마다 '이 숫자 뭐고 언제 쓰나' 2~3줄 한글, 트레이너 오답노트 한글 코칭, 수학개념(MDF/SPR/폴드에퀴티)은 슬라이더·13×13로 '읽기→보기' 전환(수학 울렁증 완화). 홀덤스쿨 커리큘럼(오픈레인지→디펜드→3벳→숏스택→사이징) 학습경로 무료 재현. **포지셔닝='교육·분석·계산 도구'로 못박아 규제(환전·사행성) 밖 유지.**

### 계층별 (정직한 선긋기)
**✅ 지금 무료 가능(기존 자산+폴리시)**: 무제한 프리플랍 레인지 뷰어 · 무제한 드릴 트레이너 · 용어사전+툴팁 · 딜/칩찹 계산기 · 커스텀 레인지 빌더 · 계산기 허브 한글설명 · HH 임포트+리플레이 · Nash 격자 촘촘화.
**🔨 작업하면 가능(무료·합법·저연산)**: 턴/리버 단일노드 CFR(DCFR 자체구현) · 20~30 대표 플랍 사전계산 팩 · 프리플랍 커버리지 확대(4벳/스퀴즈/중간스택) · EV손실 근사채점 · 토이게임 CFR 트레이너 · 대규모 MTT MC ICM · 레인지 형태론 · 스팟 라이브러리+커리큘럼.
**🚫 무료론 불가(정직히 고지)**: 풀 포스트플랍 실시간 솔브(노드 수천만~87M·RAM 660MB~2.8GB·20~290초) · 뉴럴넷 커스텀 솔버(GTO Wizard AI) · 수천~수만 스팟 통짜 라이브러리(연산·egress 초과+통짜확보 법적불가) · 상용출력/책차트/AGPL코드 임베드.

### 실행 순서
- **Phase 0(즉시·저위험)**: 무제한 프리플랍 뷰어·무제한 드릴·계산기 한글설명 — 기존 자산에 한글·툴팁만 얹어 '무료·한국어' 포지셔닝 확립.
- **Phase 1(한국 킬러)**: 용어사전+툴팁 → 딜/칩찹 계산기. 저비용 고효과 선점.
- **Phase 2(자체계산 확장)**: 커스텀 레인지 빌더 → Nash 격자 확장 → 프리플랍 커버리지 → EV손실 채점.
- **Phase 3(분석 흐름)**: HH 임포트+리플레이+에퀴티 → 스팟 라이브러리+커리큘럼+워크스페이스.
- **Phase 4(진짜 솔버·최대난이도)**: 토이게임 CFR로 DCFR 검증(OpenSpiel 대조) → 턴/리버 단일노드 CFR → 20~30 대표 플랍 팩. '정직한 소수 실계산'으로 신뢰 완성.
- 각 단계 nuri-ship(build+e2e) 게이트. **§7 GTO 탭 재편(3레인·For You)의 콘텐츠가 이 전략으로 채워짐.**

---

## 9. 무료 한국판 GTO Wizard — 실행 카드 (GKR-1..14)

> §8 전략의 execution-ready 편입. **전 카드 공통 하드 가드레일(위반=서비스 리스크):** ①모든 전략값·레인지·차트는 NURI 자체 엔진(equityEngine.ts·nash.data 파이프라인·자체 DCFR)으로만 생성 — 상용 솔버 출력·전략서 차트·남의 무료차트 복사/스크래핑/재입력 금지(저작권+한국 DB권 제93조+부정경쟁 파·카목). ②AGPL 솔버(TexasSolver/wasm-postflop/postflop-solver) **코드 임베드 절대 금지**(§13 네트워크카피레프트=NURI 전체 소스공개 의무) — 오프라인 검증 대조로만, DCFR은 논문(arXiv:1809.04040) 클린룸 자체 구현. ③permissive(pokersolver MIT·OMPEval ISC·OpenSpiel Apache)는 코드/알고리즘만(데이터 아님). ④스택 제약(Tailwind v3·framer-motion 금지 SlidingPill·Icon.tsx 단일소스·순수 SVG·새 라이브러리 import 전 package.json 확인). ⑤포지셔닝='교육·분석·계산 도구'(환전·머니플레이 배제, 규제 밖). 각 카드 마무리 nuri-ship(build+e2e) 게이트, 착수 시 적대적 자기검증 재적용.

### GKR-1 — 무제한 프리플랍 레인지 뷰어 (한글 근거)  `P0` · S · high
- **앵커:** src/lib/ranges.data.ts(자작 23종)·src/lib/ranges.ts(파서 buildFreq/rangeComboPct/expandFreqToCombos)·src/components/features/tools/RangeMatrix13.tsx·RangeGuide.tsx. src/lib/preflop.ts.
- **데이터 모델:** none(기존 정적 데이터). 뷰 상태 localStorage(즐겨찾기/최근).
- **접근:** 포지션×스택별 레인지를 13×13 혼합빈도로 무제한 열람 + '왜 이 레인지인가'를 자체 에퀴티/Nash 근거로 한글 설명하는 층 추가. GTO Wizard가 유료로 막은 무제한 열람을 무료화.
- **DoD:** 전 레인지 무제한 열람 · 한글 근거 노출 · 색각 이중 인코딩(명도+코너 글리프) · build/e2e 그린.
- **의존성:** §7 GTO 탭 3레인(분석). DAI-2 팔레트·DAI-3 수트 마크와 시너지.
- **가드레일:** 공통 ①(자작 레인지만). RangeMatrix13 팔레트 규약.

### GKR-2 — 무제한 드릴 트레이너 (한글 오답노트)  `P0` · S · high
- **앵커:** src/components/features/tools/PreflopTrainer.tsx·PostflopTrainer.tsx·src/lib/trainerProgress.ts(스트릭·XP·프리즈·오답노트).
- **데이터 모델:** trainerProgress 로컬(useSyncExternalStore) 재사용. 서버 무변경.
- **접근:** 프리/포스트플랍 즉답 드릴 무제한(경쟁 무료판 DTO 4스팟·GTO Wizard 하루10 대비 무제한이 최대 우위). 정답 소스=자체 Nash/자작 레인지. 오답노트에 한글 코칭 문구.
- **DoD:** 무제한 드릴 · 약점 추적 · 한글 코칭 · 결정 테스트(정답=Nash/레인지 기준) · build/e2e 그린.
- **의존성:** §7 For You(약점 적응형)와 연결. GKR-9(EV손실 채점)로 심화.
- **가드레일:** 공통 ①. framer-motion 금지.

### GKR-3 — 계산기 허브 한글 설명·툴팁  `P0` · S · medium
- **앵커:** src/components/features/ICMCalculator.tsx + tools/PotOddsCalc·OutsCalc·StackCalcs(M존)·MoreCalcs(뱅크롤·분산)·AdvancedCalcs(SPR·MDF). calcUi.tsx(CalcCard/Result).
- **데이터 모델:** none.
- **접근:** 계산기 9~12종마다 '이 숫자가 뭘 뜻하고 언제 쓰나' 2~3줄 한글 + 용어 툴팁(GKR-4 연결). 결과 우선(ResultHero 예시 시드).
- **DoD:** 전 계산기 한글 설명 · 결과 우선 · 모바일 desc 노출 · build 그린.
- **의존성:** GKR-4 용어 사전 툴팁. §7 GTO 탭 계산기 레인.
- **가드레일:** CalcCard 통일(중복 신설 금지). Tailwind v3.

### GKR-4 — 홀덤 용어 사전 + 전역 툴팁 (한국 킬러 1)  `P1` · S · high
- **앵커:** 신규 src/lib/glossary.data.ts([영문표준·한국식발음·자체정의·도구딥링크] 4열)·src/lib/glossary.ts. 신규 atoms/GlossaryTooltip.tsx(팝오버). 전 도구 UI 용어에 밑줄 연결.
- **데이터 모델:** 정적 glossary.data.ts(자체 서술). 서버 무변경.
- **접근:** 영어 음차 용어(쓰리벳·씨벳·팟오즈·에퀴티) 표기 표준화 + 도구 UI 용어에 밑줄 툴팁 팝오버. 정의는 전량 자체 서술.
- **DoD:** 핵심 용어 N개 사전 · 툴팁 팝오버 접근성(role·키보드·Escape) · SEO용 사전 페이지 · build 그린.
- **의존성:** GKR-1/2/3에서 소비. DAI(정체성).
- **가드레일:** 공통 ①(남의 용어집·번역 미사용, 순수 자체 텍스트). 새 라이브러리 없이 CSS 팝오버.

### GKR-5 — 딜/칩찹 계산기 (한국 킬러 2)  `P1` · M · high
- **앵커:** src/components/features/ICMCalculator.tsx(메모이제이션 1024상태 위에 실무 UI 증축). calcUi.
- **데이터 모델:** none(입력→계산). 최근 입력 localStorage.
- **접근:** 남은 스택 입력 → (1)ICM 딜 분배액 (2)칩찹(비례) 분배액 (3)차액·이득 판정을 한 화면. 공개 수학모델(ICM·칩찹) 자체 계산.
- **DoD:** ICM딜·칩찹·판정 3출력 · 결정 테스트(알려진 케이스) · 커뮤니티 검색어(딜/칩찹/ICM딜) 딥링크 · build 그린.
- **의존성:** GKR-3 계산기 허브. §7 GTO 탭.
- **가드레일:** 공통 ①⑤(환전·정산 UI 없음, 순수 계산). Tailwind v3.

### GKR-6 — 커스텀 레인지 빌더 (13×13 페인팅)  `P2` · M · high
- **앵커:** src/components/features/tools/RangeMatrix13.tsx(렌더러 편집가능화)·src/lib/ranges.ts(buildFreq/rangeComboPct/expandFreqToCombos=백엔드).
- **데이터 모델:** 사용자 레인지 localStorage(선택적 서버 동기화 텍스트).
- **접근:** 13×13 그리드 직접 페인팅→저장·에퀴티 분석·내보내기. 기존 파서가 사실상 백엔드라 편집 UI만 추가.
- **DoD:** 페인팅·저장·불러오기·'내 레인지 vs 상대' 에퀴티(자체 엔진) · build/e2e 그린.
- **의존성:** GKR-1 뷰어·equityEngine.ts.
- **가드레일:** 공통 ①. RangeMatrix13 규약. 순수 SVG/CSS.

### GKR-7 — Nash 푸시폴드 격자 확장 + 3인+ ICM-Nash  `P2` · M · medium
- **앵커:** src/lib/nash.data.ts. scratchpad 재생성 스크립트(equity-matrix.mjs·nash-solve.mjs) 파이프라인. src/components/features/tools/PushFoldChart.tsx.
- **데이터 모델:** nash.data.ts 재생성(169자리 문자열 양자화 유지). 정적.
- **접근:** 앤티/스택/포지션 격자 촘촘화 + 3인+ ICM-Nash(리프에 ICM 유틸 주입). 오프라인 재생성→정적 배포(egress 무관).
- **DoD:** 격자 확장 검증(문헌 대조 SB10bb≈58%) · 재생성 스크립트 기록(scratchpad) · build 그린.
- **의존성:** ICMCalculator(ICM 유틸). GKR-9(채점 기준).
- **가드레일:** 공통 ①(fictitious play 자체 산출). 재생성은 오프라인.

### GKR-8 — 프리플랍 커버리지 확대 (4벳/스퀴즈/중간스택)  `P2` · M · medium
- **앵커:** src/lib/ranges.data.ts·preflop.ts. Nash 파이프라인(중간스택 확장).
- **데이터 모델:** ranges.data.ts 증축(자작). 정적.
- **접근:** 4벳/5벳·스퀴즈·콜드콜·20~75bb 중간스택 차트 자작(Nash 파이프라인 다인/중간스택 확장). 15~100bb 공백 메움.
- **DoD:** 신규 스팟 커버 · 파서 테스트(합계≤1·단조성) · build 그린.
- **의존성:** GKR-1 뷰어·GKR-7 파이프라인.
- **가드레일:** 공통 ①(전부 자체 계산/자작).

### GKR-9 — 프리플랍 EV손실 근사 채점 드릴  `P2` · M · medium
- **앵커:** PreflopTrainer.tsx·PushFoldChart.tsx·nash.data.ts(기준값). trainerProgress.
- **데이터 모델:** 세션 리포트 localStorage.
- **접근:** 드릴 액션별 EV손실을 차트 빈도·Nash 기준으로 근사 채점 + '이만큼 손해봤어요' 한글 피드백. 솔버 없이 GTO Wizard식 bb 손실 근사(프리플랍/푸시폴드 한정).
- **DoD:** 채점 정확도(결정 테스트) · 세션 리포트 · build 그린. ⚠️일반 포스트플랍 채점은 GKR-13 선행.
- **의존성:** GKR-2 트레이너·GKR-7 기준값.
- **가드레일:** 공통 ①. 포스트플랍 채점 과대주장 금지.

### GKR-10 — HH 임포트 + 리플레이 + 에퀴티 오버레이  `P3` · L · high
- **앵커:** src/components/features/HandReplayer.tsx(computeEquity/computeOuts, gto/equityEngine.ts). 신규 src/lib/hhParser.ts(핸드히스토리 텍스트 파서).
- **데이터 모델:** 파싱된 핸드 localStorage(본인 데이터). 서버 선택적.
- **접근:** HH 텍스트를 클라이언트에서 파싱→스트리트별 리플레이, 승률추이·아웃츠 오버레이(기존 엔진). 본인 핸드 파싱은 합법(개인 데이터).
- **DoD:** 주요 사이트 HH 포맷 파싱 · 스트리트별 에퀴티/아웃츠 · '너라면?' 순차공개 · build/e2e 그린.
- **의존성:** FEAT-1(개인 성적 분석)과 연계. 결정별 솔버 채점은 GKR-13 의존.
- **가드레일:** 공통 ①. 본인 데이터만(타인 HH 대량 수집 금지).

### GKR-11 — 스팟 라이브러리 + 학습 커리큘럼 + 저장 워크스페이스  `P3` · M · medium
- **앵커:** 신규 src/lib/curriculum.data.ts(코스/레슨)·spots. ToolsPanel.tsx(허브). localStorage 워크스페이스.
- **데이터 모델:** 정적 커리큘럼 + 사용자 저장 스팟 localStorage(선택적 서버 동기화 텍스트).
- **접근:** 포지션/스택/스트릿/액션 필터형 스팟 라이브러리 + 홀덤스쿨식 학습경로(오픈레인지→디펜드→3벳→숏스택→사이징) 무료 재현 + 도구 간 '저장한 스팟' 공용 워크스페이스.
- **DoD:** 필터·커리큘럼 진행·저장/불러오기 · build 그린.
- **의존성:** GKR-1~10 도구를 엮음. §7 For You.
- **가드레일:** 공통 ①(커리큘럼 문구 자체 서술, 책 목차·본문 복제 금지). 저연산.

### GKR-12 — 토이게임 CFR 트레이너 (DCFR 검증)  `P4` · L · medium
- **앵커:** 신규 src/lib/cfr.ts(DCFR 자체 구현). 트레이너 UI(기존 패턴). OpenSpiel(Apache) 오프라인 대조.
- **데이터 모델:** none(라이브 계산).
- **접근:** Kuhn/Leduc/간이 리버 등 토이게임을 브라우저에서 라이브 CFR(수백ms) → GTO '왜'를 한글로 교육 + DCFR 구현을 OpenSpiel로 오프라인 검증.
- **DoD:** 토이게임 수렴(알려진 Nash와 일치, 결정 테스트) · 한글 해설 · build 그린.
- **의존성:** GKR-13 솔버의 검증 선행 단계.
- **가드레일:** 공통 ①②(DCFR 논문 클린룸, OpenSpiel은 오프라인 대조만, 코드 임베드 아님).

### GKR-13 — 턴/리버 단일노드 서브게임 CFR (진짜 자체 솔버)  `P4` · L · high
- **앵커:** src/lib/cfr.ts(GKR-12 확장)·gto/equityEngine.ts·GtoDeepPanel.tsx·useDeepGto.ts.
- **데이터 모델:** none(라이브). 무거운 루프 웹워커.
- **접근:** 레인지·보드 고정 시 턴/리버 서브게임을 브라우저에서 수초 내 자체 솔브→노드별 혼합전략·EV. DCFR TypeScript(핫루프만 필요시 자체작성 단일스레드 WASM, COOP/COEP 회피로 PortOne·Sentry 임베드 호환 유지). GtoDeep과 결합.
- **DoD:** 대표 스팟 수렴·수초 내 응답 · 웹워커로 렌더 밖 · '진짜 자체 솔버 출력' 1축 확보 · build/e2e 그린.
- **의존성:** GKR-12(검증). equityEngine.
- **가드레일:** 공통 ①②(자체 구현, AGPL 미접촉). MC ≤3000 규칙. framer-motion 금지.

### GKR-14 — 20~30 대표 플랍 사전계산 스팟 팩  `P4` · L · medium
- **앵커:** 신규 scripts/solve-flops.mjs(빌드타임 오프라인 자체 솔브)·신규 src/lib/spotpack.data.ts(압축 정적 JSON). GtoDeepPanel 열람.
- **데이터 모델:** 정적 압축 JSON 번들(nash.data.ts 방식, egress 경미).
- **접근:** 20~30 캐노니컬 플랍(수트 isomorphism 축약) 빌드타임 자체 솔브(AGPL 도구는 검증 대조에만, 배포 데이터는 자체 엔진 산출)→온디맨드 열람. '전 트리 브라우저' 흉내 대신 '정직한 대표 스팟 실계산'.
- **DoD:** 대표 플랍 팩 열람·자체 산출 검증 · 번들 크기 예산 · build 그린.
- **의존성:** GKR-13 솔버(같은 엔진).
- **가드레일:** 공통 ①②(자체 엔진 산출만 배포). 번들 예산(size-limit).

**GKR 실행 순서 = §8 Phase 0→4** (GKR-1/2/3 → 4/5 → 6/7/8/9 → 10/11 → 12/13/14). §7 GTO 탭 3레인의 콘텐츠를 이 카드들이 채운다. de-AI(DAI) 정체성과 한 시스템으로.

---

## 10. 법률 컴플라이언스 감사 (2026-08-25, 8각도 코드대조) — ⚠️ 변호사 자문 필수 항목 포함

> ⚠️ **이것은 리스크 식별(위험 지도)이며 법적 조언이 아님. 계층1(사행성)은 반드시 한국 변호사 유권해석 필요 — 코드로 못 풂, 사업 존폐급.** 실제 코드 대조로 확인. 8 finder 중 7 성공.

### 🔴 계층1 — 사업존폐급(형사·사행성), 변호사 필수·기능 재설계
코드가 금지 패턴과 기능적으로 일치. **매장 대규모 확장 전 변호사 유권해석 필수.**
1. **`voucherAccrualPerBin`(바인 1회당 이용권 자동적립, ledger.ts:73) + PaymentMethod `'ticket'`(이용권으로 참가 결제, ledger.ts:5)** = 문체부 2024 가이드가 명시 금지한 **'게임 적립 포인트→향후 입장료'** 패턴. 근거: 관광진흥법 §26의2(2024.2.27 시행, 7년/7천만원), 게임산업법 §32①7호. **fix 방향(변호사 확인 후): 바인 연동 자동적립 제거 또는 유료 참가와 완전 분리한 비환가 판촉으로. 'ticket'이 참가비를 갈음 못하게 서버 강제.**
2. **이용권 유저간 양도(`find_user_for_transfer` vouchers.ts:142) + 타매장 사용(`used_venue_id`) + 유상 발급쿼터(`request_voucher_credit`/`admin_grant_voucher_quota` p_amount)** = 'UI상 금전가치 없음' 선언과 달리 유통성·이전성·현물성·유상성 실재 → 재산상 가치 현물·선불전자지급수단 근접. **fix: 본인귀속·양도금지·발행매장 1곳 전용 소진 하드제한. 시상=비환가 명예. `loyalty.ts` 원칙(양도·환전·현물화 불가) 이식.**
3. **연합리그/시즌/순위 + 클락 TV송출 + 중앙 이용권 발급** = NURI가 '네트워크 조직자'로 도박장개설 방조/공동정범 포섭 소지. 근거: 형법 §247·§32·§30, **2024 부산 홀덤협회장 구속(가맹점 참가비 시상금 재분배→정범 포섭) 선례.** **fix: NURI를 '정보 중개·기록 도구'로만 포지셔닝, 참가비 집금·상금 재분배·매장간 정산 미관여. 입점계약에 '운영주체=매장, NURI=도구제공자' 명시.**
- ✅ **모범(근본 해소책): `loyalty.ts` 활동점수(차감·환전·양도 불가 코스메틱) — 이 설계를 이용권에 이식하면 환금성 리스크가 근본 해소됨.**

### 🟠 계층2 — 운영급(in-force 개인정보/마케팅 의무), 즉시 시정(코드+문구로 방어)
4. **CI 평문저장 미암호화**(verify-identity/index.ts:69-77, profiles.ci·real_name·phone·birth_date) — 방통위고시 2025-4호(CI 암호화·분리보관·연1회 점검, **2025.5.21 시행 in-force**). fix: Supabase Vault/pgsodium 컬럼암호화, CI는 암호문/해시, SECURITY DEFINER RPC 최소노출.
5. **처리방침(PrivacyPolicy.tsx)이 실제 수집 본인인증 6항목(CI·실명·전화·생년·성별·통신사)·신분증·위치·행태정보 미공개** — §30 필수기재. fix: 처리항목 추가+위탁/제3자/국외이전/자동화결정/쿠키 조문 신설, 저장컬럼=처리항목 정합 테스트. (LAW-1/2와 동시)
6. **`withdraw_my_account` 파기 불완전**(rank_verifications 신분증·venue_rankings 실명·push_subscriptions·auth.users 잔존) → '지체없이 파기' 문구와 코드 불일치 = **허위고지**(§21·§30). fix: 전 잔존 데이터 삭제/익명화 + 파기문구=코드 100% 일치 테스트.
7. **GA(G-9T7JZNEQE8)+AdSense가 로그인/연령게이트 이전 전 방문자에 무고지 행태광고·Google 국외이전**(main.tsx:69-101) — §22의2·§28의8. fix: 처리방침·국외이전표에 Google/Kakao 추가, AdSense 로그인 후 지연 or 비맞춤(npa), 옵트아웃 조문. (LAW-2 확장)
8. **마케팅 발송(send-push·weekly-email-digest)에 '(광고)'·야간(21-08)·수신동의 게이트 부재** — 정통망법 §50(과태료 3천만원). fix: LAW-5 실행(발송 켜기 전 필수 선행).
9. **장터 이용권/시드권 2차거래 서버차단 구멍**(content-filter BLOCKED_PATTERNS 칩·현금 위주, block_ugc_trigger가 marketplace_listings 제외). fix: `(이용권|시드권|시트권|좌석권|참가권)\s*(판매|양도|삽니다|팝니다|거래)` 패턴 추가, 전 경로 적용, gameMoney 카테고리 제거.
+ 유출통지·신고 체계(§34) 전무 · 신분증 이미지 무기한 보존·미고지 · 매장 CRM 위탁계약 부재.

### 🟡 계층3 — 콘텐츠급, 저비용 문구·필터
GTD 보장상금 단정문구 플랫폼 직접 렌더(ScheduleDetailModal:335→표시광고법 §3) · 약관 관할(§14)·포괄면책(§7)·사전통보없는 삭제(§11) 불공정조항 → 표준약관 · 후기 대가성 미표시(2024.12 추천·보증지침) · 이미지 alt 누락(G마켓 판례) · 연령문구 만18/19 불일치 · withdrawn_identities md5→salted SHA-256.

### 🌏 국외 — 과잉대응 금지(저위험)
- **GDPR/CCPA 미적용**: 한국어·KRW·EU/US 미겨냥 → 타겟팅 기준 미충족. **EU 대리인·DPO·SCC·'Do Not Sell' 도입 금지(비용만).**
- **앱스토어**: **PWA 유지가 곧 방어책** — Apple 5.3/IAP 충돌 비이슈. 네이티브 전환 결정 시에만 검토.
- **UGC 초상권**: 베른협약상 국내서도 필요 → notice-and-takedown 절차 + '업로더 책임' 약관(저비용·고효율).
- **지오블로킹**: 법적 의무 아님. 약관에 준거법·관할(한국)·'도박 미운영' 명시가 더 실효적.
- 폰트 Pretendard(SIL OFL 1.1) 안전. Icon.tsx의 Lucide path 차용 여부만 1회 확인.

### ⚖️ 변호사 자문 필수 목록(코드로 못 풂)
①이용권 적립→참가결제 적법 경계 ②이용권 양도·타매장·유상쿼터의 현물/선불수단 해당 ③연합리그 네트워크 조직자 방조 포섭 ④현금바이인 전자장부 도박개장 조력 ⑤위치정보법 §9 신고 요부 ⑥본인인증 최소수집(CI vs DI·과잉수집) ⑦매장 CRM 컨트롤러/프로세서 ⑧신분증 §24 고유식별정보 ⑨withdrawn_identities 보존기간 ⑩네이티브 전환 시 IAP ⑪섀도우밴 §37의2 은밀제재 비례성.

### 실행 순서
**계층2 즉시(대부분 LAW 카드+신규 CI암호화·탈퇴파기·GA고지) → 계층3 문구·필터 스프린트 → 계층1은 병렬로 변호사 자문 개시(기능 변경 전 유권해석).** 계층2/3은 Fable 5 실행 가능, **계층1은 변호사 결론 전 기능 재설계 착수 금지(방향만 loyalty.ts 이식으로 준비).**

---

## 11. T&S(트러스트&세이프티) + B2B 매장 운영주 (2026-08-25, 6각도 리서치)

> 핵심 통찰: **NURI는 '기능 부재'가 아니라 '마지막 1cm 연결 미완'이 격차.** 부품(신고·차단·섀도우밴·CI중복차단·체크인후기·KillSwitch·StoreDashboard·CustomerAnalytics·PortOne)이 다 있는데 (1)신고 큐가 실제 제재로 안 이어짐 (2)리텐션 수단이 손님에 도달할 발송채널 0 (3)수익화가 PortOne 자동결제 미연결로 수동 병목. 원칙: 신규 인프라 최소·기존 부품 재사용·경량 파생계산·주1회 배치. T&S는 법적 '의무' 아닌 비낙인 '제품 기능'으로, B2B는 supply-first 플라이휠.

### ⚠️ 교차 충돌 — 법률 감사(§10 계층1)와 B2B 수익화의 정면 충돌
**B2B가 '이용권 충전 자동결제·셀프서브 부스트 결제(PortOne)'를 최우선 수익 레버로 제안하지만, §10 계층1은 바로 그 이용권 메커니즘(적립→참가결제·양도·유상쿼터)을 최상위 사행성 리스크로 지목했다.** → **이용권 유상 결제·양도·타매장 사용의 수익화 가속은 §10 계층1 변호사 유권해석 + loyalty.ts 원칙 재설계 이후로 보류.** 부스트(매장 광고 상단고정) 결제는 이용권과 무관하므로 먼저 진행 가능. **수익화는 '이용권'이 아니라 '부스트 광고 + 상위 운영 구독'으로 먼저 열 것.**

### T&S — 신고→제재 배선 (A) · 책임게임 (B) · 19세 (C)
**(A) 신고→실제 제재 (최저비용·최고효과, 부품 다 있음, 배선만):**
- 신고 큐 → 대상 단위 케이스 + 실행 액션: reports에 resolution_action·case_id, 대상 GROUP BY RPC, ReportQueue에 숨김/경고/섀도우밴/정지 버튼(soft-delete·strike·admin_set_shadowban·is_account_active 트리거 호출).
- N명 자동숨김 + 사유 택소노미: reason 자유텍스트→select(스팸·욕설/혐오·사기/현금화·음란·개인정보), hidden_pending_review, **본인인증 실계정 K명만 카운트(신고폭탄 차단)**.
- 스트라이크 원장(progressive discipline): user_strikes(severity·reason_code·expires_at), 누적 임계 자동 에스컬레이션(경고→섀도우밴→정지), 만료 배치는 weekly-report 엣지.
- 사유고지+이의제기: 정지(is_account_active=false)만 사유코드+규칙+기간+이의버튼(support.ts 별도 큐), **섀도우밴은 통지 제외 유지**(§10 LAW-1 은밀성 vs 고지의무 충돌은 변호사 정리).
- 콘텐츠 필터 서버 이전: filterContent→moderate-content Edge, NFKC 정규화+공백/반복 붕괴로 '현 금 화'류 우회 차단, WARN은 차단 대신 auto-report.
- 운영주 레벨 모더레이션: my-store에 매장 문제손님 신고/차단(reports target_type 재사용), 상습 미수·노쇼 표시.
- KillSwitch 안전장치: 민감작업(마감봉인·정산·명의변경) 재인증, 영구삭제 전 CSV export + moderation_actions 감사로그(actor·action·target·reason·ts).

**(B) 책임게임 (비현금 → 과금제한 아닌 시간인지·자원연결·비낙인 톤):**
- 플레이 시간 리얼리티 체크: 몰입 화면(리플레이어/툴)에 localStorage 세션 타이머+간격(15/30/60분) **무시 불가 CSS 모달(.fixed로 index.css:283 회피)**, **시간만 표시(비현금이라 손익 금액 금지)**. weekly-report에 주간 리플렉션.
- 1336 헬프라인 상시 + CPGI 9문항 자가진단: 푸터/설정 tel:+넷라인, **CPGI 로컬 채점(서버 전송 0=프라이버시)**, 중위험↑ 부드럽게 1336. Icon.tsx에 라이프링 1줄.
- 자발적 쿨오프 계단: is_account_active/KillSwitch 재사용해 스스로 N일 휴면(1일/1주/1달), 해제 하루 대기.
- ⚠️ **메시지 톤이 성패** — 도덕적 훈계('한도 정하세요') 금지, 비낙인 담백('잠깐 쉬어갈까요?', '필요하면 1336').

**(C) 19세 리스크 기반 레이어드 게이트 (2024.5.17 홀덤펍 청소년 출입금지 고시 → 법적 필수):**
- 탐색·가입=저마찰 자기신고(연나이 19), **오프라인 유입·거래·사행성모사 도구=PortOne 본인인증 just-in-time 하드게이트** + CI salted hash 캐시·재가입차단.
- 데이터 최소화(19+ 불리언+검증시각+CI해시만, Sentry PII 스크럽). 매장 QR·프로필에 1336·19세 배지 토글(운영주 규제 대응 대신 충족 = B2B 부수가치).

### B2B — 공급측 먼저 잠그는 SaaS-이네이블드 마켓플레이스 플라이휠
- **가치제안**: 무료 운영툴(NuriPos 장부·클락·이용권·직원·시즌/리그)로 사장을 먼저 락인 → 운영 데이터를 browse 발견 노출로 전환 → 손님 유입(OpenTable·Fresha·Treatwell 검증). 손님 0이어도 종이/엑셀 대체 이유 제공.
- **수익화 3축(비현금이라 결제수수료 레버 없음)**: (1)상위 운영 구독 (2)~~이용권 float/수수료~~(§10 계층1 해소 후) (3)Fresha형 신규손님 발견 과금. **재방문·직접방문 무과금 원칙**(인센티브 정렬). **'코어 영구 무료' 공개 약속**(Fresha 기습과금 백래시 방어).
- **확보/리텐션**: 지역/세그먼트 밀도부터(콜드스타트), 온보딩 활성화 마일스톤(첫 마감봉인·첫 이용권·첫 QR체크인 5분 내 아하 → 90일 70% 이탈 방어), 멀티프로덕트 부착 복리(1개 30%→4개 80% 2년 리텐션). **최대 격차=연결 미완**(리텐션 수단 있는데 손님 도달 발송 0 StoreDashboard:953, 수익화 수단 있는데 PortOne 자동결제 미연결 vouchers:240).
- **대시보드 고도화(9)**: 재방문율 헤드라인 · RFM 자동세그먼트(CustomerAnalytics recency/frequency/monetary 위 임계규칙) · 이탈 win-back 원탭 · 이상탐지 배너(dowStats.avg ±1.5σ, ML 불필요) · 미수 aging+상습 플래그 · 월 목표 페이싱+인건비율 · 멀티매장 포트폴리오 · 플라이휠 가시화('NURI 발견 유입 N명') · 비슷한매장 벤치마크(표본 쌓인 후).

### Top 우선순위 (effort·impact)
- **[T&S·M·high] 신고 큐→제재 배선** (부품 다 있음, 배선만)
- **[B2B·M·high] 셀프서브 부스트 결제(PortOne)** — 매장 광고=1차 수익, 이용권과 무관해 §10 충돌 없음
- **[B2B·M·high] 단골 세그먼트 푸시/알림 + 쿠폰·생일 회원연결**(alias 통합) — 도달 0 격차 해소
- **[T&S·M·high] 19세 리스크 기반 게이트**(자기신고+PortOne 하드게이트)
- **[B2B·M·high] 리텐션 대시보드 콤보**(재방문율+RFM+win-back, 신규수집 0)
- **[T&S·M·high] N명 자동숨김+사유 택소노미**
- **[T&S·S·high] 플레이시간 리얼리티 체크**(비낙인)
- **[T&S·S·high] 1336+CPGI 자가진단**(로컬 채점)
- **[B2B·S·med] 이상탐지 배너 · 온보딩 마일스톤 · 재방문율 카드**
- **[T&S·M·med] 스트라이크 원장 · 장터 안전거래 배너+운영주 모더레이션**
- ⛔ **[보류] 이용권 충전 자동결제** — §10 계층1 변호사 유권해석·재설계 후

### Quick wins (며칠)
1336 상시 링크+Icon 1줄 · 장터 안전거래 배너 1개 · 신고 reason select+reason_code · 이상탐지 배너(±1.5σ) · QR 1336·19세 배지 토글 · 재방문율 카드 · 온보딩 3-마일스톤 · AI 주간요약에 재방문율/휴면단골 주입.

**가드레일**: framer-motion 금지(SlidingPill/CSS)·Icon.tsx 단일소스·Tailwind v3·무료 Supabase(경량 파생계산·주1회 배치)·nuri-ship 게이트. T&S는 §10 법률감사(19세·1336·섀도우밴)와 짝, B2B 이용권 수익화는 §10 계층1 종속.

---

## 12. 최종 정비 — 오늘 20:00 실행 전 (⚠️ 이전 섹션보다 우선. 충돌 시 §12가 이김)

> 사장님 최종 지시(2026-08-25). 오늘 20:00 Fable 5 실행. 아래 결정·원칙을 전 카드에 소급 적용.

### A. 계층1 사행성 결정 반영 (§10 override — 리스크 대폭 해소)
1. **연합리그 제거** — leagues·LeaguePanel·league RPC·league_event_status 전량 폐기(§10 계층1 #3 '네트워크 조직자 방조' 리스크 제거). 시즌·매장 내 순위는 유지 가능(매장 단독). FEAT/카드에서 연합리그 의존 제거.
2. **이용권 = 발행매장 전용·무양도(타매장)·무유상**:
   - **발행매장에서만 사용 가능**(used_venue_id 교차매장 사용 서버 하드차단, redeem RPC에 발행매장==사용매장 강제).
   - **양도(전송)는 발행매장 내에서만** 가능, **타매장 양도 불가**(find_user_for_transfer를 발행매장 동일 범위로 제한 또는 무상 한정).
   - **유상 발급쿼터 폐지**(request_voucher_credit·admin_grant_voucher_quota p_amount 제거 — 이용권이 '상금 재원' 성격 갖지 않게).
   - → §10 계층1 #2(현물화·선불수단·환전) 리스크 대폭 해소. loyalty.ts 원칙(비환전·범위잠금) 이식.
3. **이용권 발급·사용 모델 재정의**(§10 계층1 #1 override):
   - **바인 1회당 자동적립(voucherAccrualPerBin) 폐지.**
   - 이용권 발급 = **머니인(게임 성적) 보상**으로 발행매장이 발급.
   - 이용권 사용 = **그 발행매장의 바이인 결제**(예: 10만원 바이인 게임 → 현금 10만원 or 그 매장에서 머니인해 받은 이용권으로 참가).
   - ledger.ts PaymentMethod 'ticket'은 유지하되 발행매장 전용·비환전 프레임.
   - ⚠️ **잔여 변호사 확인(1건만 남음)**: 위 변경으로 네트워크·현물화·선불수단·타매장·양도·유상 리스크는 해소되나, **"게임 보상 이용권 → 같은 매장 바이인"이 문체부 '적립→입장료' 가이드에 여전히 걸리는지**는 변호사 유권해석 필요. 발행매장 전용·무양도·무유상으로 방어력이 크게 올랐으나 최종 판단은 변호사. **이 1건 결론 전까지 이용권 유상 수익화(§11 B2B)·자동결제 착수 금지.**

### B. 플랫폼 분리 원칙 (전 카드 횡단 — 가장 중요한 재조준)
**유저 = 모바일 99% · 매장 운영주 = PC 99%.**
- **유저 화면(browse·live·community·GTO·profile·마켓·검색·알림) = 모바일 퍼스트(사실상 모바일 전용)**: 하단 탭바(MobileTabBar) 중심, 엄지 도달 영역, 큰 터치 타깃(44px+), 세로 스크롤, **모바일 13×13 매트릭스 가독성 최우선**, PC는 최소 대응.
- **매장/운영주 화면(my-store·NuriPosLedger 장부·클락 설정·StoreDashboard·직원/딜러·CRM·이용권 관리) = PC 퍼스트(사실상 PC 전용)**: 상단/사이드 나브, 밀도 높은 데이터 테이블·다열 대시보드, 키보드·마우스 워크플로, 넓은 화면 활용. 모바일은 최소 대응.
- **DAI-5 재조준**: Modelfy식 '프로덕트 상단 헤더'는 **유저 PC가 아니라 "매장 운영주 PC 대시보드"** 에 적용(로고+운영 메뉴+매장 전환+알림). 유저 모바일은 하단 탭바 유지.
- **클락 TV송출 = 대형 스크린**(별도).
- 전 카드의 effort·DoD에 '주 타깃 플랫폼(유저=모바일/매장=PC)'을 명시하고 그 플랫폼 우선 검증(Playwright 뷰포트).

### C. de-AI = world-class 강조 (DAI 트랙 최우선)
"**전세계에서 가장 능력 있는 풀스택 개발자가 만든 것처럼 — AI 티가 절대 안 나게.**" DAI-1~6(폰트·팔레트·이모지→마크·rounded 탈피·헤더·비대칭)을 최우선으로, 5화면 리디자인보다 먼저. 제네릭 다크+인디고·이모지·폴백폰트를 포커 정체성으로 대체. 실행재량 최대.

### D. GTO 탭 = 누구나 무료로 쓰는 극단적 사용성 (GKR 트랙)
"**사용성 아주 좋고 무료지만 누구나 사용 가능할 정도.**" 진입장벽 0 — 영어 GTO 용어 전량 한글 병기(GKR-4), 결과 우선(열자마자 답), **모바일 13×13 극단 가독성**(색각·확대·핀치), 초보 온보딩 큐레이션, 무제한. 홀덤 처음 하는 사람도 3초 안에 뭔가 배우게.

### E. 실행 재량 재강조 (§0)
**4.8보다 Fable 5가 더 잘할 수 있는 모든 부분은, Fable 5가 다시 생각해서 더 낫게 개발하라.** 특히 유저가 보는 UI/UX·모바일 인체공학·GTO 사용성·de-AI 정체성. 계획은 최저선일 뿐 — 불변 3가지(하드제약·법적/안전 가드레일·검증 관문) 안에서 격상하고, 바꾼 건 기록.

### 실행 순서 (오늘 20:00 이후)
연합리그 제거·이용권 재설계(§12-A, 변호사 잔여 1건 병행) → de-AI(DAI) → 계층2 법률(CI암호화·처리방침·탈퇴파기·GA고지·마케팅) → GTO 탭(GKR, 모바일 극단 사용성) → T&S 신고큐 배선·19세·1336 → B2B(부스트결제·단골푸시·리텐션 대시보드, 이용권 수익화는 변호사 후). 전 단계 nuri-ship + 플랫폼(유저 모바일/매장 PC) 뷰포트 검증.

---

## 13. 하단 탭바 충돌 + 매장 파이프라인·IA 간소화 (2026-08-25, 4각도 분석)

> 사장님 신규 지시 2건. **핵심 반전: 탭바 문제의 원인은 삼성이 아니라 NURI 자동숨김 코드. 프리셋은 이미 존재하나 파이프라인에 미배선.**

### A. 탭바 충돌 — 근본 원인
3층으로 겹친 문제이며, 실제로 고칠 수 있는 층은 하나뿐이다.

[층1 — 손댈 수 없음] 삼성 인터넷 '맨 위로' 버튼은 WebView 위에 그려지는 네이티브 컴포지터 오버레이다. DOM에 노드가 없어 querySelector·CSS·MutationObserver로 감지 불가, 뷰포트를 리사이즈하지 않아 visualViewport로도 간접 탐지 불가. env(safe-area-inset-*)·dvh/svh/lvh·interactive-widget·Virtual Keyboard API 중 이 오버레이를 위해 공간을 예약해 주는 표준은 하나도 없다(전부 시스템 인셋 또는 키보드 전용). 얻을 수 있는 유일한 신호는 UA의 'SamsungBrowser/' 토큰 = '이 사용자가 삼성 인터넷을 쓴다'만 알 수 있고 '지금 버튼이 떠 있다'는 알 수 없다. → '탐지해서 피한다' 계열은 전량 폐기.

[층2 — 기하학, 회피 불가] 폭 400px 기준 탭바 내부폭 380px(mx-2.5) ÷ 5칸 = 한 칸 76px. 삼성 원형 버튼 지름 약 48~56px로 중앙 칸 폭의 약 74%를 덮는다. 세로도 겹친다 — 탭바는 바닥에서 약 8~65px 구간(mb-2 8px + 알약 높이 pt-2(8)+h-7(28)+gap-0.5(2)+라벨 11px+pb-1.5(6)+border ≈ 57px), 삼성 버튼은 약 16~72px 구간. 완전 회피에 필요한 상시 리프트는 약 72px(mb-2 0.5rem → 5rem)이고 그러면 하단에 72px 죽은 띠 + 커튼 그라데이션 아래로 콘텐츠가 비친다. 칸 순서 변경·노치·4칸화·중앙 FAB 전부 무의미(무엇을 중앙에 두든 중앙이 가려지고, 4칸은 칸 경계가 중앙에 와 두 칸을 동시에 먹는다).

[층3 — 실제 버그, 유일한 수정 지점] src/App.tsx:535-547 자동 숨김이 문서 끝에서 네 가지로 고장나 있다.
(1) 속도 의존: `dy > 14`가 단일 scroll 이벤트 델타를 본다. 손가락으로 천천히 끌면 이벤트당 5~10px라 dy>14도 dy<-8도 아닌 무판정 구간에 머물러 탭바가 한 번도 숨지 않은 채 바닥에 도달한다 — 재현 경로 1순위.
(2) 바닥 감지 부재: 문서 끝 판정 코드가 아예 없다. index.css:428의 `main { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)) !important }`가 문서 끝에 88px 빈 공간을 만들어 사용자를 최하단으로 유도한다(= 삼성 버튼 소환 조건).
(3) 8px 임계 즉시 복귀: 삼성 버튼은 뜨면 머무는데 탭바는 `dy < -8` 한 번에 복귀한다. 바닥에서 탭바를 만지려고 살짝 튕기는 동작(20~80px)이 매번 겹침 구간을 만든다. 게다가 iOS 고무줄 되튐과 Chromium 툴바 개폐 시 scrollY 클램프가 최대 -56px의 '가짜 음수 dy'를 만들어, 손을 뗐는데 탭바가 저절로 튀어나온다(리스너에 resize 리싱크가 없어 다음 실제 스크롤에서 한 번 더 오계산).
(4) 탭 복원 오작동(별건 기존 버그): App.tsx:703-705가 behavior:'instant'로 스크롤을 복원하면 단일 이벤트 dy가 수백~수천 px가 되어 dy>14로 탭바가 사라진다 — '탭을 눌렀는데 내비가 증발'.

결론: 사용자가 말한 '맨 아래로 내리면 삼성 버튼이 뜬다'의 정확한 실체는 '맨 아래에서 탭바를 부르면 겹친다'이고, 원인은 삼성이 아니라 우리 쪽 자동 숨김이다.

### A-2. 확정 해법
확정안 = 타이밍 배타(timing exclusion). 삼성 버튼이 뜨는 조건(문서 끝)과 탭바가 보이는 조건을 상호 배타로 만든다. 두 요소가 같은 트리거(문서 끝 / 위로 튕김)를 공유하므로, 문서 끝에서 탭바를 확실히 치우면 겹침이 원천 소멸하고 위로 살짝 올리는 같은 제스처로 둘이 함께 정리된다. 레이아웃으로 공존시키려는 시도는 전부 기각.

3커밋 순서(전부 부작용 0 검증됨):
- P0a 하단 오프셋 단일화(무해 리팩터, 렌더 결과 동일): 4.75/5.5/5.75/6rem 네 상수가 8개 파일에 흩어져 있어 '조금 올려 보는' 실험조차 위험하다. `--tabbar-safe`(콘텐츠 회피 기준선) / `--tabbar-float`(탭바 위에 뜨는 fixed 요소 기준선) 두 변수로 통합. 이 커밋이 폴백 B를 한 줄로 만들어 준다.
- P0b ScrollTopButton safe-area 확정 버그 수정: 5.75rem 기준선을 쓰는 네 곳 중 App.tsx:2737만 env(safe-area-inset-bottom)이 빠져 iPhone standalone에서 탭바 상단 라운드를 약 7px 파고들고 Toast/InstallBanner와 34px 어긋난다.
- P1 자동 숨김 재작성(핵심): 누적 델타 + 명시적 바닥 감지 + 오버스크롤 클램프 + 짧은 화면 가드 + 탭 복원 억제창 + rAF 스로틀 + resize 리싱크.

기각한 후보와 근거: (b) 상시 탭바 리프트 = 72px 죽은 띠 + 커튼 누수 + 8곳 동시 수정, 그 미만은 가려지는 위치만 바꿈. (c) 중앙 칸 회피 레이아웃 = 중앙 칸 폭 74% 피격, 회피가 아니라 칸 삭제. (f) visualViewport 탐지 = 오버레이가 리사이즈를 유발하지 않아 원리적으로 불가. 삼성 버튼 탐지 로직 = 반드시 실패하므로 코드 어디에도 넣지 않는다.

에스컬레이션 폴백 B(기본 미배포, 실기기 실측 후에만): 짧은 콘텐츠 탭(최대 scrollY < 200)에서는 탭바를 숨길 수 없다(스크롤 없는 페이지에서 내비가 영구 소멸하므로). 이 케이스만 남으면 `/SamsungBrowser\//.test(navigator.userAgent)`로 html에 `ua-samsung` 클래스를 심고 `html.ua-samsung[data-at-bottom] { --tabbar-lift: 4.5rem }` 조건부 리프트를 건다(상시 아님, 바닥에서만). P0a 덕분에 CSS 한 줄 + 커튼 pb 보정으로 끝나고 롤백도 한 줄. 값은 반드시 갤럭시 실기기에서 {주소창 상단/하단} × {스크롤 시 툴바 숨기기 ON/OFF} 4조합의 버튼 중심 Y 오프셋·지름을 실측한 최댓값으로. 추정치 코딩 금지 — One UI 8.5에서 삼성 인터넷 하단 UI가 플로팅 방식으로 전면 개편 중이라 상수는 반드시 한 곳(--tabbar-lift)에만 둔다.

보조 수단(주 해법 아님): PWA 설치는 standalone에서 브라우저 크롬이 통째로 사라지므로 유일한 완전 해결이다. manifest는 이미 display:standalone이므로 start_url에 ?source=pwa를 넣어 삼성 인터넷의 display-mode 오보고를 우회하고, 기존 InstallBanner 문구를 이 문제에 맞춰 바꾼다. 브라우저 설정 안내(설정 → 웹페이지 보기 및 스크롤 방식 → '맨 위로 이동 버튼 표시' 해제)는 대다수가 따라오지 않으므로 접힌 보조 안내로만.

### A-3. 구현
[P0a] src/index.css :root 에 추가 —
  --tabbar-safe: calc(5.5rem + env(safe-area-inset-bottom));
  --tabbar-float: calc(5.75rem + env(safe-area-inset-bottom));
치환 8곳(lg: 오버라이드는 전부 그대로 유지):
  src/index.css:428 main padding-bottom → var(--tabbar-safe)
  src/components/features/VenuePage.tsx:248, GroupPage.tsx:118 → pb-[var(--tabbar-safe)] lg:pb-0
  src/components/atoms/Toast.tsx:79, InstallBanner.tsx:37 → bottom-[var(--tabbar-float)] (lg:bottom-4 / lg:bottom-3 유지)
  src/App.tsx:2737 → bottom-[var(--tabbar-float)] lg:bottom-5  ← P0b 버그 수정이 여기서 동시에 끝난다
  src/components/features/NuriPosLedger.tsx:1152 정산바 → bottom-[calc(var(--tabbar-safe)-0.75rem)] lg:bottom-0 (기존 4.75rem 유지, 의도 주석 필수 — 탭바 상단에서 약 11px 위, 여유가 가장 적은 요소)
  src/components/features/BusinessFooter.tsx:16 → pb-[calc(var(--tabbar-safe)+0.5rem)] lg:pb-8
Tailwind v3 arbitrary value는 공백 불허 — 기존처럼 공백 없는 표기 유지.

[P1] src/App.tsx:534-547 MobileTabBar 스크롤 리스너 전체 교체 —
  const suppressUntil = useRef(0);
  useLayoutEffect(() => { suppressUntil.current = performance.now() + 300; }, [active]);
  useEffect(() => {
    let lastY = window.scrollY, acc = 0, raf = 0;
    const apply = () => {
      raf = 0;
      if (performance.now() < suppressUntil.current) { lastY = window.scrollY; acc = 0; return; }
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max < 200) { setHidden(false); lastY = window.scrollY; acc = 0; return; }   // 짧은 화면 — 깜빡임 방지
      const cy = Math.min(Math.max(window.scrollY, 0), max);                          // 고무줄/클램프 흡수
      const dy = cy - lastY; lastY = cy;
      if (cy >= max - 4) { setHidden(true); acc = 0; return; }                        // 문서 끝 — 무조건 숨김(삼성 버튼과 배타)
      if (cy < 80) { setHidden(false); acc = 0; return; }
      acc = (dy > 0) === (acc > 0) ? acc + dy : dy;                                   // 방향 바뀌면 리셋되는 누적
      if (acc > 48) { setHidden(true); acc = 0; }
      else if (acc < -24) { setHidden(false); acc = 0; }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const resync = () => { lastY = window.scrollY; acc = 0; };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resync);
    window.visualViewport?.addEventListener('resize', resync);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', resync); window.visualViewport?.removeEventListener('resize', resync); };
  }, []);
핵심 포인트: 억제창은 |dy| 크기 추정이 아니라 active prop의 useLayoutEffect로 연다 — 자식 레이아웃 이펙트가 부모(App.tsx:703)보다 먼저 실행되므로 복원 스크롤 이벤트 도착 전에 창이 열려 순서가 보장된다. |dy| 추정은 빠른 플링(프레임당 200px+)을 진짜 스크롤로 오인해 삼킨다.

검증: npm run build + npm run test:e2e. 실기기 필수 3종 — (1) 손가락으로 천천히 끌어 바닥까지 내리기(탭바가 반드시 숨어야 함) (2) 바닥에서 위로 살짝 튕겨 복귀 (3) 깊은 위치가 저장된 탭으로 전환 시 탭바가 사라지지 않는지. QA 매트릭스: {삼성 인터넷, Chrome Android, iOS Safari} × {주소창 상단/하단} × {툴바 자동숨김 ON/OFF} × {짧은 페이지/긴 페이지}.

### A-4. 부작용 검토
[다른 fixed 요소 5곳 — 전부 무영향 확인] Toast(z-120, --tabbar-float) / InstallBanner(z-60, --tabbar-float) / ScrollTopButton(z-40, --tabbar-float, P0b에서 정렬 복구) / NuriPosLedger 정산바(z-30, --tabbar-safe - 0.75rem) / BusinessFooter(정적 패딩). P0a는 계산 결과가 기존 값과 완전히 동일한 무해 치환이라 렌더 diff가 0이다 — 리뷰어가 '변화 없음'을 근거로 승인할 수 있는 커밋. P1은 nav의 transform만 건드리므로 이 5곳을 아예 만지지 않는다(탭바가 숨어도 Toast/InstallBanner는 제자리 유지 — 기존 동작과 동일).

[safe-area] env(safe-area-inset-bottom)은 두 변수 안에 그대로 보존되므로 iPhone standalone·제스처바 회피가 유지된다. iOS 툴바 접힘 시 env가 0을 반환하는 알려진 함정에 대비해 `max(env(safe-area-inset-bottom), 12px)` 하한선을 --tabbar-safe/--tabbar-float 정의에 넣는 것을 P0a에서 함께 적용 권장(현재는 잠재 버그로 깔려 있음).

[별건 — 이번 커밋에 넣지 말 것] index.html:35에 viewport-fit=cover가 있는 상태에서 nav에 paddingBottom: env(safe-area-inset-bottom)(App.tsx:571)을 쓰는 것은 Chrome 135+ 엣지투엣지 공식 안티패턴이다(레이아웃 스래싱 유발, Chrome이 이 패턴을 감지하면 chin 애니메이션을 아예 끔). 다만 nav에 이미 transition-transform + translate-y-[120%]가 걸려 있어 bottom 계산식 도입이 숨김 전환과 상호작용할 위험이 있고 실기기 검증 없이는 롤백 비용이 크다 — 라이브 서비스 원칙에 따라 P1과 분리한 별도 카드(TB4)로 실측 후 처리.

[PC 영향 = 0, 3중 차단] MobileTabBar 자체가 lg:hidden(App.tsx:569) / index.css:428은 @media (max-width: 1023.5px) 안 / 모든 fixed 요소가 lg: 오버라이드로 모바일 값을 덮는다. 매장 PC 99% 환경은 이 변경의 사정권 밖이다.

[회귀 위험 밖 화면] VenuePage:248·GroupPage:118·Modal:208은 내부 overflow-y-auto 스크롤이라 window scroll이 발화하지 않는다 — 그 화면들에서는 자동 숨김이 원래부터 죽어 있고 브라우저도 문서 스크롤을 보지 않아 삼성 버튼이 뜨지 않는다. P1은 이들을 건드리지 않는다.

[남는 사각지대 1건 — 명시적으로 인정] 짧은 콘텐츠 탭(max scrollY < 200)에서는 탭바를 숨길 수 없으므로 겹침이 남을 수 있다. 이 경우만 폴백 B(UA 게이트 조건부 리프트)로 처리하며, 실기기 실측 전에는 배포하지 않는다.

[규약 준수] framer-motion 미사용(기존 transition-transform 재활용, SlidingPill 무관) / 새 진입 애니메이션 클래스 없음(index.css:283의 .tab-pane :is(...) 목록 수정 불필요) / Tailwind v3 arbitrary value + CSS 변수만 사용(v4 마이그레이션 없음) / Icon.tsx 무관. 다만 MobileTabBar ME_ICON(App.tsx:562-566)과 ScrollTopButton 화살표(App.tsx:2739-2741)가 PATHS 레지스트리를 거치지 않은 인라인 SVG인 점은 규약 위반이므로 별도 정리 항목으로 남긴다(이번 diff에 섞지 않음).

### B. 파이프라인 — 중복 입력 실태
18개 논리 항목이 4단계에서 43개 물리 입력 컨트롤로 흩어져 재입력이 25회 발생한다(폼별 고정 필드: 포스터 25 / 장부 22 / 클락 14 / 순위 2+N행).

중복 지도: 게임 제목 4곳(포스터 title / 장부 title / 클락 cfg.title / 순위 eventName 칩) · 스타팅·리바인·애드온 스택 각 3곳 · 얼리 4종(더블보너스·1얼리보너스·더블레벨·1얼리레벨) 각 2곳(SessionForm ↔ ClockSettings, 완전 동일 값) · 블라인드 구조 2~3곳 · 순위별 상금 3곳 · 레지마감 2곳(포스터 문자열 regCloseTime / 클락 숫자 regCloseLevel) · 바이인 2곳 · GTD·엔트리 2곳 · 스타트 시각 2곳 · 애드온 여부 2곳 · 듀레이션 3곳.

문제의 정체는 '입력이 많다'가 아니라 **한 게임 정의가 4개 저장소에 4벌로 존재한다**는 것이다: ①game_presets(GamePresetData) ②clock_presets(ClockConfig 전체, 최대 50개) ③getLedgerPresets()(과거 세션에서 title 중복제거로 파생, 저장 개념 없음) ④pastPosters(과거 schedules 파생, 최근 12개). '불러오기' 진입점이 이미 4곳에 있는데 각각 다른 것을 보므로, 사장님이 '데일리 6만'의 스택 하나를 바꾸려면 네 곳을 고쳐야 하고 어느 것이 최신인지 화면상 구분이 없다.

결정적으로 재입력은 노동이 아니라 **사고 원인**이다. 같은 돈 값이 단계마다 단위가 뒤바뀐다 — 포스터 바이인=원, 장부 현금단가=만원(manVal/parseMan), 포스터 보장상금=만원 입력 후 DB 저장 시 ×10,000, 클락 프라이즈=원, 순위 입력 프라이즈=만원. GamePresetData 자체도 혼재다(buyIn·addonCost=원, prizeAmount=만원). 코드에 남은 방어 주석들이 이게 가설이 아님을 말한다: PosterFormModal.tsx:513-527의 실시간 환산 경고 2개, TournamentClock.tsx:1259-1264의 '순위 초안이 만원 환산을 amount>=10000로 추측해 1/10,000로 기록되는 일이 있었다', VenueManageTab.tsx:944의 '원 단위로 치면 순위 점수가 1만 배로 잘못 쌓입니다'. → 프리셋 도입의 1순위 가치는 노동 절감이 아니라 오기록 차단이다.

### B-2. 확정 접근
확정: **'각 단계 불러오기 임베드'로 통일하되, 그 임베드가 읽는 정의 소스는 프리셋 탭 하나로 단일화한다.** 프리셋 탭 '강화'는 기각 — 필드를 24개 더 붙이면 PresetManager가 사장님이 이미 길다고 느낀 SessionForm(22필드)보다 긴 폼이 되어, 반복 입력을 없애려다 한 번의 거대 입력을 만드는 전형적 자충수가 된다.

3계층으로 역할을 고정한다:
- L1 정의(authoring) = 게임 프리셋. 유일한 정의 소스. game_presets를 승격하고 clock_presets는 신규 저장을 막은 뒤 1회 변환 버튼('클락 프리셋 N개를 게임 프리셋으로 가져오기')으로 흡수. getLedgerPresets·pastPosters는 지우지 말고 '프리셋 만들 재료'로 재배치(프리셋 없는 매장의 온보딩 경로로 여전히 유효).
- L2 적용(apply) = 각 단계 최상단 1줄 PresetPicker. 이미 4곳에 서로 다른 UI(셀렉트/아코디언/검색+스크롤/셀렉트)로 존재하므로 새로 만들지 말고 `<PresetPicker scope="poster"|"ledger"|"clock" />` 하나로 통일해 학습 비용을 1회로.
- L3 전파(inherit) = schedule_id 링크. **사람이 프리셋을 3번 고르게 하면 안 된다.** 1번 고르면 나머지가 자동 상속.

구현 우선순위는 명확히 **L3 > L2 > L1**이다. 이유: 전파 배관이 이미 절반 프로덕션에 깔려 있다. SessionForm.submit()이 진행 중이 아닌 클락의 ClockConfig를 비파괴 병합으로 이미 저장하고 있다(NuriPosLedger.tsx:1707-1714 — earlyBonus·doubleEarlyBonus·earlyDoubleLevel·earlySingleLevel·startStack·rebuyStack). 문제는 상속 폭이 너무 좁다는 것뿐이다: 포스터→장부는 title·buyIn.amount·guaranteed 3필드만 가져오고(1780-1785, 1622-1636) structure.levels·스택 3종·rankingPrizes는 포스터에 있는데도 무시된다.

가장 작은 최고 ROI 변경 2곳(이 둘만으로 클락 설정 단계가 일상 운영에서 사실상 사라진다):
① NuriPosLedger.tsx:1780-1785 포스터→장부 상속을 3필드 → 전체로 확대.
② NuriPosLedger.tsx:1709 cfg 비파괴 병합에 levels·regCloseLevel·maxLevel·isAddon·prizes 추가.

부수 확정: TournamentClock.tsx:982-993 applyGamePreset이 levels+스택 3종 4개만 적용하고 title조차 적용하지 않으며, 드롭다운이 접힌 '블라인드 구조' 섹션 안쪽 + blindLevels 있는 프리셋이 없으면 렌더조차 안 되는 곳에 숨어 있다(발견 불가). → clock 네임스페이스 전체 적용으로 확장하고 접힌 섹션 밖으로 올린다. 그리고 NuriPosLedger.tsx:1624-1636의 당일 포스터 자동연동이 `todays.length === 1`일 때만 동작해 사이드 게임을 함께 여는 날 통째로 침묵하고 실패 신호조차 없다 → 2개 이상이면 '오늘 포스터 2개 — 어느 게임의 장부인가요?' 선택 칩을 즉시 띄운다(자동화는 항상 되거나, 왜 안 되는지 보이거나 둘 중 하나여야 신뢰를 얻는다).

### B-3. 이상적 흐름
[0회차성] 게임 프리셋 1회 정의 + 정기 시리즈 규칙 1회 설정.

[매일 — 원탭 상한선은 '오늘 게임 열기'까지]
① 대시보드 '오늘 게임 열기' 1탭 = 포스터 게시(예약 생성분) + 장부 세션 생성(프리셋 전체 상속 완료) + 클락 config 적재 + 대기 상태. 사람은 담당직원만 확인.
② 클락 START 1탭 — **사람 필수, 자동화 금지**. START가 tournamentStart를 확정하고 그 시각 기준으로 장부 바인이 더블얼리/1얼리로 자동 분류된다(clock.ts:380-391 deriveClockCounts). 실제 시작보다 이르거나 늦게 자동 시작되면 얼리 판정이 통째로 어긋나 손님 스택이 틀어진다.
③ 운영 중 바인 입력만.
④ 마감 1탭 — 사람 필수(장부 확정 행위).
⑤ 순위: '전체 추가' 1탭(addAllFromLedger, 이미 원탭) + 등수 정렬 후 저장 — 사람 필수. save_venue_rankings가 (날짜+게임) 단위 **전체 교체**라 자동 확정이 위험하다.

즉 '원탭으로 어디까지'의 정답은 **장부 시작까지**이며, 그 이후 3번의 탭(START·마감·순위 확정)은 의도적으로 사람에게 남긴다. 이 자동화 경계선을 문서에 명시해 이후 요구사항이 이 선을 넘으려 할 때 근거로 쓴다.

새 화면은 필요 없다. StoreDashboard.tsx:685-725의 '지금 할 일' 카드가 이미 파이프라인 척추다(미마감 장부 → 순위 미입력 → 진행 중·클락 꺼짐 → 오늘 게임 있음·장부 미시작 → 포스터 없음 → 운영 완료 6분기가 정확히 4단계 전이에 대응).

[정기 게임] 현재 repeatWeeks는 '반복'이 아니라 12개 독립 row 일괄 생성이다(App.tsx:1979-1985 `Promise.all(dates.map(createSchedule))`). series_id/rrule이 없어 '3주차부터 바이인 변경'이면 개별 row를 하나씩 고쳐야 하고, 매주 같은 요일만 가능하며, 업주 등록분 12개가 한꺼번에 승인 큐에 쌓인다. → game_series(venue_id, preset_id, rrule jsonb {freq, byweekday[], interval, startTime, until}) + rolling materialize(앞으로 N주분만 실체화, 매장 탭 진입 또는 주간 cron으로 창을 굴림) + Google Calendar식 편집 스코프('이 회차만 / 이후 전체 / 전체', 개별 수정은 override로 분리) + '시리즈 1회 승인 → 그 시리즈 회차는 자동 승인'. 시리즈에 preset_id를 붙이면 '매주 화 8시 = 데일리 6만'을 시스템이 알게 되어 위 원탭이 자동으로 성립한다.

[안전 가드 3개 — 협상 대상 아님] ①discounts 자동 채움은 mode==='open' + 바인 0건일 때만(바인이 discountIndex 1-based 자리번호로 참조하므로 덮어쓰면 과거 바인 금액이 바뀐다 — NuriPosLedger.tsx:1666-1673, 1722-1725). ②clock 네임스페이스 적용은 !running일 때만, running이면 '진행 중이라 적용하지 않았습니다' 명시 안내(현행 1707 가드 유지·확장 금지). ③순위 단계는 프리셋 자동 채움 대상에서 제외, '장부 명단 전체 추가'까지만. 자동 채움의 가치는 '틀린 값을 빠르게 채우지 않는 것'까지 포함한다.

### B-4. 프리셋 데이터 모델
[커버리지] 현재 GamePresetData 16필드의 실질 커버리지는 25/55 = 45%(포스터 14/25, 장부 7/22, 클락 4/14 — 회차 고유값 6개 date/repeatWeeks/operators/scheduleId/tournamentStart/voucherIssued 제외). 약 24개 필드를 추가하면 50/55 = 91%가 된다.
부족분 — [포스터 9] grade, startTime, regCloseLevel+regCloseTime, region, paymentMethods, partners, seats(시상), promotions, posterUrl. [장부 7] cardAmount, targetEntries, maxEntries, discounts[5], dealers, eventMemo, voucherAccrualPerBin. [클락 8] isAddon, maxLevel, earlyBonus, doubleEarlyBonus, earlyDoubleLevel, earlySingleLevel, mysteryBounty, prizes[](원).

[구조 — 플랫 금지, 3 네임스페이스] `GamePresetData { …공용…, poster?: {...}, ledger?: {...}, clock?: {...} }`. data가 jsonb이고 presets.ts:29에서 `(r.data ?? {}) as GamePresetData`로 캐스팅하므로 **마이그레이션 없이 하위호환**된다. 이점 셋: ①어댑터 3개(applyToPoster/applyToLedger/applyToClock)가 각자 자기 네임스페이스만 읽어 코드가 갈리지 않음 ②'이 프리셋이 채우는 곳: 포스터 ✓ 장부 ✓ 클락 ✓' 배지를 데이터로 계산 가능 ③3단 아코디언으로 자연스럽게 접힘. 공용 필드(title/buyInWon/스택 3종/blindLevels)는 최상위 유지.

[단위 — 전부 원(KRW) 정규형으로 확정] 프리셋이 '정답 한 벌'이 되려면 프리셋 자신이 단위를 정규화해야 한다. 환산은 각 단계 어댑터에서만 표시 단위로. 신규 필드는 이름에 단위를 박는다(prizeAmountWon, buyInWon). 기존 prizeAmount(만원)는 건드리지 말고 `prizeAmountWon ?? prizeAmount * 10000` 폴백으로 읽어 라이브 데이터 무손상 통과.

[죽은 필드 복구] presets.ts:21의 rankingPrizes({rank, amount, unit}[])는 타입에만 있고 PresetManager 어디에도 편집 UI가 없으며 EMPTY 상수에도 빠져 있어 새 프리셋 data에는 키조차 생기지 않는다. 상금표 에디터를 프리셋에 1개만 두고(원 정규형) 포스터=만원+단위, 클락 prizes=원, 순위 입력=등수별 초기값(만원)으로 환산 주입. 매장이 가장 자주 재입력하면서 가장 자주 틀리는 항목이라 ROI 최상위.

[부분 프리셋 허용] 빈 네임스페이스는 그 단계에서 자동 채움을 시도하지 않는다. 프리셋은 부분만 채워도 유효해야 한다.

[생성 경로 역전 — 채택의 유일한 조건] 지금 PresetManager는 '+ 새 프리셋 → 완전히 빈 14칸 폼'이 유일한 생성 경로다(PresetManager.tsx:22, 94-98). 이미 20번 연 게임을 빈 폼에 다시 치는 건 반복 입력을 줄이려다 하나 더 만드는 셈이고, 이게 프리셋 탭이 방치되는 구조적 이유다. → 기본 경로를 '**지난 게임에서 프리셋 만들기**'로 뒤집는다(최근 포스터/장부 회차 리스트 → 클릭하면 24필드가 채워진 채 열려 이름만 짓게). 빈 폼은 2차 진입점으로. 추가로 장부 마감 직후·포스터 등록 직후 '이 설정을 프리셋으로 저장' 인라인 버튼을 두면 프리셋이 별도 작업이 아니라 **운영의 부산물**로 쌓인다 — 템플릿 시스템이 실제로 채택되는 유일한 방식.

[회차 스냅샷] 장부 마감(closed) 시점에 (schedule + ledger_session + clock_config)를 한 덩어리 JSON으로 캡처한다(그때가 이 게임 설정이 완성된 유일한 순간 — 운영 중 수정이 모두 반영된 상태). 같은 캡처로 ①'지난 게임 그대로 열기 — 8/24 데일리 6만' 1탭 4단계 동시 프리필 ②프리셋 authoring 재료가 동시에 해결된다. 기존 applyPast(PosterFormModal.tsx:173-204)·applyCopyMain(NuriPosLedger.tsx:1687-1701)은 지우지 말고, 스냅샷이 있으면 우선 후보로 올리는 방식으로 얹는다.

[PC 99% 활용] 프리셋 편집 폼은 좌측 스텝 네비(포스터/장부/클락) + 우측 폼 2단 레이아웃으로 두고, 오른쪽에 '이 프리셋을 적용하면 이렇게 채워집니다' 미리보기(포스터 카드/장부 요약/클락 레벨 수)를 붙인다 — 긴 폼의 체감이 줄고 검증도 된다.

### C. 매장탭 IA 14→5
14개 → **5개 최상위 + 3그룹**. 기능 제거는 연합 리그 1개뿐이고 나머지 13개는 전부 살아남되 깊이가 1단계 내려간다.

■ 그룹 A '오늘'(매일)
 ① 오늘의 운영 — 허브. 기존 dashboard 개편.
 ② 게임 진행 — 포스터·장부·클락·순위를 4단계 스테퍼로 통합. **핵심 발명.**
■ 그룹 B '분석'(주간)
 ③ 매출·손님 — 기존 stats 승격·개명. 통계 + 고객 분석 + 단골 CRM + 퍼널.
■ 그룹 C '관리'(가끔)
 ④ 직원·근무 — 구성원·권한 · 출근 스케줄 · 인건비 · 딜러 로테이션 · **내 근무**(구 attendance).
 ⑤ 매장 설정 — 하위탭 5개: 매장 페이지(구 page + venueRank 병합) / 게임 프리셋 / POS·결제(구 settings 개명) / 이용권·QR(canIssue일 때만) / 위험 구역(KillSwitch).

■ '게임 진행' 스테퍼 상세 — 섹션의 단위가 '기능'이 아니라 **게임 하나**다.
상단: 게임 선택 칩 바(오늘 메인 / 오늘 사이드1 / 내일 / 지난 미마감).
아래: 4단계 스테퍼가 실시간 상태를 달고 — ①게임 만들기 ✅등록·예약 12 → ②장부 ●진행중·엔트리 34·미수 3만 → ③클락 ●레벨 7·12:34 → ④순위 ○마감 후.
단계를 눌러도 **섹션을 떠나지 않고 작업판만 교체**된다. 진입 시 착지 단계는 StoreDashboard.tsx:686-707의 '지금 할 일' 상태머신을 그대로 재사용(미마감→②, 마감+순위없음→④, 진행중+클락꺼짐→③, 포스터없음→①).
효과: ledgerSeed·clockSeed·rankingDraft가 **크로스 섹션 텔레포트에서 한 섹션의 내부 state로 강등**되고 VenueManageTab의 useCallback 핸들러 6개가 사라진다. PC ≥1280px에서 좌(게임리스트+스텝)/우(작업판) 2열 분할 — 전면 교체가 아니라 부분 교체가 되어 PC 밀도가 산다.
자식(MyPostersTab·NuriPosLedger·TournamentClock·RankingEditor)은 **props 시그니처 무변경**으로 마운트만 옮긴다. 스테퍼 인디케이터는 framer-motion 금지 규약에 따라 src/components/atoms/SlidingPill.tsx 패턴 사용, 신규 진입 애니메이션 클래스를 만들면 src/index.css:283의 `.tab-pane :is(...)` 목록에 반드시 추가.

■ 점진적 공개 — 초보 3개 → 성장 → 전체 5개
초보 모드(기본): 오늘의 운영 · 게임 진행 · [⚙ 설정] 3개. 성장 모드: 조건 충족 시 매출·손님, 직원·근무가 자동 등장. 해금 조건은 전부 기존 API로 측정 가능해 **신규 테이블 불필요** — 직원·근무 ← getMyVenueStaff(venueId).length > 0 / 매출·손님 ← 장부 마감 3회(getLedgerRange sessions.closed) / 랭킹보드 설정 ← getVenueRankings 1회 이상 / 이용권 ← canIssue / 프리셋 유도 ← 포스터 2회 등록. 등장 시 nav에 NEW 점 + 첫 진입 1회 안내(무엇이 왜 지금 열렸는지). 파워유저 탈출구로 nav 하단 '고급 기능 모두 보기' 토글(localStorage `nuri:nav-mode:${venueId}`).
**권한 게이팅(ledgerOk/manageOk/canPosters)과 성숙도 게이팅은 반드시 분리한다.** 지금은 권한 하나로 노출을 결정해 '권한은 있지만 아직 쓸 일 없는' 항목이 1일차부터 다 보인다. 성숙도로 숨긴 항목은 잠금 아이콘이 아니라 **아예 비노출**(잠금은 '언젠가 열림'을 약속하지만 성숙도는 저절로 열리므로 설명이 필요 없다).

■ PC 밀도(매장 PC 99%)
사이드바 lg:w-44 → lg:w-52, 그룹 헤더 3개 + 항목별 라이브 배지('게임 진행 ●진행중·엔트리 34', '직원·근무 ②미승인'). 더 큰 기회는 **상시 게임 바** — 지금은 통계·직원 화면에 있으면 대기 바인 요청이 와도 모른다(라이브 위젯이 대시보드에만 있다). 라이브 구독(getVenueClocks·getPendingBuyinRequests·subscribeBuyinRequests, StoreDashboard.tsx:161-196)을 VenueManageTab 레벨로 승격해 어느 섹션에서도 엔트리·레벨·남은시간·대기요청 n건이 보이는 얇은 상단 바로. 데이터·구독·성능 가드(active일 때만 구독, 라이브+보이는 탭일 때만 1초 틱)는 이미 전부 구현돼 있다.

### C-2. 섹션 운명표
14개 전량 확정표 — 제거 1 / 통합 4 / 이동 6 / 유지 3.

① dashboard 대시보드 → **유지(개편)**. '오늘의 운영' 허브. 순수 링크 카드 5개 제거.
② posters 포스터·예약 → **통합**. 게임 진행 ①단계.
③ presets 게임 프리셋 → **이동(2곳 분리)**. 사용=게임 진행 ①의 '프리셋으로 시작' 칩, 관리=매장 설정 하위탭.
④ ledger 장부 → **통합**. 게임 진행 ②단계.
⑤ stats 통계 → **유지(승격·개명)**. '매출·손님'.
⑥ ranking 순위 입력 → **통합**. 게임 진행 ④단계. ⑦과의 이름 충돌이 여기서 자동 소멸.
⑦ venueRank 매장 랭킹 → **이동**. 매장 설정 → 매장 페이지(⑫와 한 폼 병합). 성격이 '매일 운영'이 아니라 '표시 설정'.
⑧ league 연합 리그 → **제거 확정**. 유일한 기능 삭제.
⑨ clock 클락 → **통합**. 게임 진행 ③단계. 손님용 전체화면 송출은 별도 창 모드로 분리 유지.
⑩ attendance 출근 관리 → **이동 + 게이팅 버그 수정**. 직원·근무 → '내 근무' 탭. 현재 `if (ledgerOk) available.push({id:'attendance'})`(VenueManageTab.tsx:206)라 '내 출퇴근 기록'이 **장부 권한**에 묶여 있어 장부 권한 없는 직원은 자기 출퇴근을 못 본다 → '소속 직원이면 누구나'로 수정. StaffHub에 '직원 출근일지'·'딜러 출근 스케줄'이 따로 있어 3중 분산이던 것도 한 곳으로.
⑪ voucher 매장이용권/QR → **조건부 노출**. 현재 권한과 무관하게 항상 push하고 잠금만 표시하는데(:207), 발행 권한은 `isAdmin || (venue_owner && user.venueId === venueId)`라 발행매장이 아니면 **영원히 안 열린다**. 잠금은 '권한 받으면 열림'을 암시하므로 거짓 약속 + 순수 노이즈 → canIssue일 때만 매장 설정 하위탭으로 렌더, 그 외 완전 비노출. 잠금 패턴은 '업주가 부여 가능한 권한'(장부·순위)에만 남긴다.
⑫ page 매장 꾸미기 → **이동**. 매장 설정 → 매장 페이지. ⑦과 병합.
⑬ staff 직원 관리 → **유지(확장·개명)**. '직원·근무'.
⑭ settings 설정 → **이동 + 개명**. 매장 설정 → 'POS·결제'. 현재 이름이 '무엇의 설정인지' 답하지 않는데 실체는 POS 비밀번호·결제수단·할인 프리셋.

[부수 — 즉시 가능한 최저위험 개선 1건] KillSwitch(매장 전체 영구 삭제)가 섹션 스위치 **바깥**(VenueManageTab.tsx:369)에 렌더돼 대시보드 포함 **모든 섹션 하단에 상시 노출** 중이다. 매일 여는 화면 아래에 복구 불가능한 파괴 액션이 있다. 매장 설정 → '위험 구역'으로 옮기면 접근에 2단계가 생기고 매일 화면에서 완전히 사라진다 — IA 정리가 곧 안전성 개선이 되는 지점이며 단독 커밋으로 즉시 처리 가능.

[중복 4건이 통합으로 자동 해소] (1) venueRank↔page가 같은 venue_page_config를 두 문에서 각자 로드/저장(한쪽에서 저장하면 다른 쪽 상태가 낡음) → cfg 로드 1회·저장 1회. (2) '순위 입력'(매일 운영, venue_rankings 기록) ↔ '매장 랭킹'(1회성 표시 설정) 이름 충돌 → 소멸. (3) attendance 오게이팅 → 수정. (4) '설정' 라벨 → 'POS·결제'.

[★ 즐겨찾기 전량 삭제] VenueManageTab.tsx:132-147의 favs/toggleFav(최대 5, localStorage `nuri:fav-sections:${venueId}`) + :254-257 정렬 + :271-296·:433-442 모바일·PC 양쪽 어포던스. 5개가 되면 무의미해지므로 코드 순감. 기존 localStorage 값은 읽지 않고 방치(마이그레이션 불필요).

### C-3. 근거
복잡함의 원인은 **기능 수가 아니라 14개가 전부 동등한 평면 형제**라는 것이다. VenueManageTab.tsx:197-210의 available 배열에는 그룹·빈도·계층 정보가 전혀 없다. 실제 사용 빈도는 극단적으로 갈린다 — 매일 4개(장부·클락·순위·포스터), 주간 1개(통계), 분기~1회성 8개(프리셋·매장랭킹·매장꾸미기·POS설정·직원·출근·이용권), 사실상 안 씀 1개(연합리그). 8:4 비율의 희소 항목이 매일 항목과 같은 픽셀을 차지한다. 즐겨찾기 ★는 이 문제의 해결이 아니라 **자백**이다 — 제품이 '무엇이 중요한지'를 정하지 못해 사장님에게 정렬을 외주 준 흔적. 5개로 줄이면 그 기능 자체가 무의미해진다.

두 번째 원인은 파이프라인(포스터→장부→클락→순위)이 **4개의 별도 최상위 문**으로 쪼개져 있다는 것. 코드에는 이미 연결이 배선돼 있는데(VenueManageTab.tsx:95-111 onMakeRankingDraft·onOpenClockFromLedger·onOpenLedgerFromPosters) 내비게이션이 그 순서를 표현하지 않아 사용자가 4개 문의 존재와 순서를 스스로 기억해야 한다. 순차 운영 제품은 객체형이 아니라 **워크플로형 내비게이션**이어야 한다.

세 번째는 대시보드가 **허브가 아니라 런처**라는 것. DashCard 15개 중 5개는 데이터가 0이고 문장 한 줄 + 화살표뿐인 순수 링크 카드다(StoreDashboard.tsx:948·975·981·987·993 — 딜러 관리/고객 분석/예약·방문 체크/⚡부스트/매장 꾸미기). 카드 옷을 입은 내비게이션 링크라서 허브가 메뉴만큼 길어졌다. 반대로 정말 잘 만들어진 두 요소 — '지금 할 일'(시간·상태 인지형 다음 행동)과 '라이브 운영 현황'(클락 + 대기 바인요청 인라인 ✓/✕ 승인, 길게 누르면 결제수단·분할결제까지 그 자리에서, :523-597) — 이 15개 카드 벽에 묻힌다. '라이브 운영 현황'은 이미 진짜 커맨드센터고, 대시보드가 허브가 될 수 있다는 증거다. 규칙 하나로 정리한다: **'그 자리에서 끝내거나, 게임 스텝으로 보내거나. 순수 링크 카드는 없다.'** 기본 6카드(지금 할 일 / 라이브 운영 현황 / 오늘 장부 / 최근 7일+AI / 다가오는 예약 / 단골 TOP) + 더 보기. 운영 가이드 배너(:450-469)는 베테랑 매장에도 영구 노출 중이므로 초보 모드 전용 + 닫기 가능으로.

그리고 '기입할 게 너무 많다'의 진짜 원인은 필드 수가 아니라 **계보 부재**다. 상속은 코드에 있는데 화면에 안 보여서 사장님은 자기가 방금 넣은 값이 흘러갔는지 알 수 없고 매번 확인·재입력한다. 각 단계에 '바인 3만 · 포스터에서 상속', '블라인드 12레벨 · 포스터에서 상속 [수정]' 배지를 달면 새 기능 없이 체감 입력량이 줄어든다.

[최대 실행 리스크 — 반드시 동시 처리] 알림 딥링크가 `deepSection` prop으로 섹션 id를 **유효성 검사 없이** 그대로 setState한다(VenueManageTab.tsx:125-130). 섹션 id를 5개로 재정의하면 서버·알림이 보내는 'ledger'/'clock'/'ranking'/'posters'가 존재하지 않는 값이 되어 무음 실패한다. 컴포넌트 이동보다 이쪽이 사고 확률이 높다. 레거시 매핑 테이블을 P3와 **같은 커밋**에 심는다: ledger|clock|ranking|posters → {section:'game', step:'ledger'|'clock'|'rank'|'poster'}, presets|page|venueRank|voucher|settings → {section:'settings', tab:…}, stats → 'insights', attendance|staff → 'team', league → 'home', 알 수 없는 값 → 홈 폴백. 백스택(useBackClose, :113)은 스텝 → 섹션 → 탭 3단으로 한 겹 추가.

[적용 순서 — 라이브 서비스 '작고 리뷰 가능한 변경' 원칙] P1 nav만(컴포넌트 이동 0: 연합리그 제거 + group 필드 + 그룹 헤더 + ★ 제거 + 이용권 조건부 + KillSwitch 이동) → P2 대시보드 다이어트 → P3 게임 진행 통합 + 딥링크 매핑 → P4 설정 통합·점진적 공개. **P1이 컴포넌트 이동 없이 체감의 절반을 가져온다.** 각 단계 후 npm run build + npm run test:e2e. 부수 이득: 섹션이 5개가 되면 visited 상한 8(:114-122)이 무의미해져 전량 keep-alive 유지 가능, 메모리 가드 로직이 단순해진다.

### 실행 카드 (TB1·TB2 / PL1·PL2·PL3 / IA1·IA2·IA3)

#### TB1 — 하단 오프셋 매직넘버 8곳 → --tabbar-safe/--tabbar-float 단일화 + ScrollTopButton safe-area 버그 수정
 effort **S** · impact **high**

- **앵커:** src/index.css:428(5.5rem, @media max-width:1023.5px 안) · src/App.tsx:2737(5.75rem, env 누락 = 확정 버그) · src/components/atoms/Toast.tsx:79(5.75rem+env) · src/components/atoms/InstallBanner.tsx:37(5.75rem+env) · src/components/features/BusinessFooter.tsx:16(6rem+env) · src/components/features/GroupPage.tsx:118(5.5rem+env) · src/components/features/VenuePage.tsx:248(5.5rem+env) · src/components/features/NuriPosLedger.tsx:1152(4.75rem+env, 여유 최소 요소)
- **접근:** src/index.css :root에 --tabbar-safe: calc(5.5rem + max(env(safe-area-inset-bottom), 12px)) / --tabbar-float: calc(5.75rem + max(env(safe-area-inset-bottom), 12px)) 정의(12px 하한선은 iOS 툴바 접힘 시 env가 0을 반환하는 알려진 함정 대비). 8곳을 pb-[var(--tabbar-safe)] / bottom-[var(--tabbar-float)]로 치환하고 lg: 오버라이드는 전부 그대로 유지. 정산바만 값이 다르므로 bottom-[calc(var(--tabbar-safe)-0.75rem)]로 파생하고 의도를 주석에 남긴다. App.tsx:2737은 치환과 동시에 누락된 safe-area가 채워져 Toast/InstallBanner와 기준선이 34px 어긋나던 버그가 해소된다. Tailwind v3 arbitrary value는 공백 불허 — 기존처럼 공백 없는 표기 유지.
- **DoD:** npm run build 통과 · npm run test:e2e 통과 · 12px 하한선을 제외한 모든 계산 결과가 기존 값과 동일(렌더 diff 0) · iPhone standalone에서 ScrollTopButton이 탭바 상단을 침범하지 않고 Toast/InstallBanner와 같은 기준선에 정렬 · PC(lg) 레이아웃 변화 0 · 이후 어떤 하단 리프트 실험도 CSS 한 줄로 가능해짐

#### TB2 — 탭바 자동 숨김 재작성 — 누적 델타 + 문서끝 감지 + 오버스크롤 클램프 + 탭복원 억제창
 effort **M** · impact **high**

- **앵커:** src/App.tsx:534-547(현행 리스너, dy>14/dy<-8 이벤트 델타 임계) · src/App.tsx:569-571(transition-transform + translate-y-[120%] + lg:hidden) · src/App.tsx:678, 703-705(탭 스크롤 저장/behavior:'instant' 복원 — 거대 dy 발생원) · src/index.css:362(overscroll-behavior-y: contain)
- **접근:** 리스너 전체 교체. ①rAF 스로틀로 scrollHeight 레이아웃 읽기를 프레임당 1회로 ②짧은 화면 가드 `if (max < 200) { setHidden(false); return; }` ③오버스크롤 클램프 `const cy = Math.min(Math.max(window.scrollY,0), max)` — iOS 고무줄과 Chromium 툴바 개폐 클램프가 만드는 가짜 음수 dy를 0으로 흡수 ④문서끝 감지 `if (cy >= max - 4) { setHidden(true); return; }` — 삼성 버튼과 시간축 배타 ⑤방향 전환 시 리셋되는 누적 델타 `acc = (dy>0)===(acc>0) ? acc+dy : dy`, 아래 48px 숨김 / 위 24px 복귀로 속도 의존성 제거 ⑥active prop useLayoutEffect 억제창 300ms(자식 레이아웃 이펙트가 부모 App.tsx:703보다 먼저 실행되므로 복원 스크롤 도착 전 창이 열려 순서 보장 — |dy| 크기 추정은 빠른 플링을 삼키므로 금지) ⑦window resize + visualViewport resize에서 lastY 리싱크. 삼성 버튼 탐지 로직은 절대 넣지 않는다.
- **DoD:** 실기기(갤럭시) 3종 통과 — (1) 손가락으로 천천히 끌어 바닥까지 내리면 탭바가 반드시 숨는다 (2) 바닥에서 위로 살짝 튕기면 복귀하고 삼성 버튼과 겹치지 않는다 (3) 깊은 위치가 저장된 탭으로 전환해도 탭바가 사라지지 않는다 · iOS Safari에서 바닥 되튐 시 숨김↔표시 튐 없음 · 짧은 페이지에서 탭바가 항상 표시(깜빡임 0) · npm run build + npm run test:e2e · framer-motion 미사용, index.css:283 무효화 목록 수정 불필요, PC 영향 0

#### PL1 — 포스터→장부→클락 자동 상속 전면 확대 (최소 변경·최대 ROI)
 effort **M** · impact **high**

- **앵커:** src/components/features/NuriPosLedger.tsx:1774-1793(포스터 선택 시 title·buyIn.amount·guaranteed 3필드만 프리필) · :1622-1636(당일 포스터 자동연동, todays.length===1일 때만) · :1707-1714(진행중 아닌 클락 ClockConfig 비파괴 병합 — 이미 프로덕션) · src/components/features/clock/TournamentClock.tsx:982-993(applyGamePreset이 levels+스택3종 4개만) · :1187-1199(드롭다운이 접힌 블라인드 섹션 안 + blindLevels 없으면 미렌더) · src/api/schedules.ts:29-31(structure.levels)
- **접근:** ①1780-1785 포스터→장부 상속을 3필드에서 전체로 확대(structure.levels·스택 3종·rankingPrizes·regClose·GTD/엔트리 포함). ②1709 cfg 비파괴 병합 대상에 levels·regCloseLevel·maxLevel·isAddon·prizes 추가 — 이 둘만으로 클락 설정 단계가 일상 운영에서 사실상 사라진다. ③applyGamePreset을 clock 네임스페이스 전체 적용으로 확장하고 드롭다운을 접힌 섹션 밖(클락 설정 최상단)으로 올린다. blindLevels 유무 가드를 없애고 '블라인드 없는 프리셋'은 비활성 옵션 + 이유 표시. ④당일 포스터 2개 이상이면 침묵하지 말고 '오늘 포스터 2개 — 어느 게임의 장부인가요?' 선택 칩 즉시 표시(gameSeq>1이면 사이드 포스터 우선 정렬). ⑤각 단계에 '바인 3만 · 포스터에서 상속' 배지 노출. 안전 가드 3개 준수: discounts 자동 채움은 mode==='open' + 바인 0건일 때만, clock 적용은 !running일 때만(running이면 '진행 중이라 적용하지 않았습니다' 명시), 순위 단계 자동 채움 제외.
- **DoD:** 포스터 등록 → 장부 시작 시 재입력이 3필드 확인에서 0회로 · 클락 진입 시 대회명·블라인드·레지마감·최대레벨·애드온·프라이즈가 이미 채워져 있음 · 오늘 포스터 2개인 날 자동연동이 침묵하지 않고 선택 칩이 뜸 · 진행 중 클락에 config가 절대 쓰이지 않음(E2E 케이스 추가) · 바인 1건 이상 세션에 discounts가 덮이지 않음 · npm run build + npm run test:e2e

#### PL2 — GamePresetData 3 네임스페이스 확장 + 원(KRW) 정규형 + rankingPrizes 에디터 + PresetPicker 통일
 effort **L** · impact **high**

- **앵커:** src/api/presets.ts:6-23(현행 16필드, buyIn=원/prizeAmount=만원 혼재) · :21(rankingPrizes — 타입만 있고 편집 UI 없는 죽은 필드) · :29(`(r.data ?? {}) as GamePresetData` jsonb 캐스팅 = 마이그레이션 불필요 근거) · src/components/features/PresetManager.tsx:8-11(EMPTY), :54-82(편집 폼) · 단위 사고 흔적: PosterFormModal.tsx:513-527, TournamentClock.tsx:1259-1264, VenueManageTab.tsx:944, App.tsx:1966(prizeAmount*10_000)
- **접근:** GamePresetData에 poster?/ledger?/clock? 3개 네임스페이스를 추가하고 약 24필드를 배치(포스터 9 · 장부 7 · 클락 8) — 커버리지 45%→91%. 공용 필드(title/buyInWon/스택3종/blindLevels)는 최상위 유지. 단위는 전부 원 정규형으로 확정하고 신규 필드명에 단위를 박는다(prizeAmountWon, buyInWon); 기존 prizeAmount는 건드리지 말고 `prizeAmountWon ?? prizeAmount*10000` 폴백으로 읽어 라이브 데이터 무손상. 어댑터 3개(applyToPoster/applyToLedger/applyToClock)에서만 표시 단위로 환산. rankingPrizes 편집 UI를 프리셋에 1개만 신설(원 단위)하고 EMPTY에도 추가. 4곳의 서로 다른 불러오기 UI를 `<PresetPicker scope="poster"|"ledger"|"clock" />` 하나로 통일. 편집 폼은 3단 아코디언 기본 접힘 + '채워진 필드 n개' 배지, 부분 프리셋 허용(빈 네임스페이스는 그 단계에서 자동 채움 미시도), PC 99%를 살려 좌측 스텝 네비 + 우측 적용 미리보기 2단 레이아웃.
- **DoD:** 기존 프리셋이 마이그레이션 없이 그대로 열리고 저장됨 · 프리셋 1개 적용으로 포스터/장부/클락 3폼이 91% 채워짐 · 상금표를 프리셋에서 1회 입력하면 포스터(만원+단위)·클락(원)·순위(만원)에 올바른 단위로 주입됨(1/10,000 오기록 회귀 테스트 포함) · 부분 프리셋(clock만 있는 프리셋)이 포스터 폼을 건드리지 않음 · PresetManager 편집 폼이 기본 접힘 상태에서 화면 1스크롤 이내 · npm run build + npm run test:e2e

#### PL3 — 회차 스냅샷 + '지난 게임 그대로 열기' 1탭 + 프리셋 생성 경로 역전
 effort **M** · impact **medium**

- **앵커:** src/components/features/PresetManager.tsx:22(startNew — 빈 14칸 폼이 유일 생성 경로), :94-98(진입점 1개 + 빈 상태 안내) · src/components/features/PosterFormModal.tsx:169-204, 271-289(applyPast — 세 복제 구현 중 완성도 최고) · src/components/features/NuriPosLedger.tsx:1687-1701(applyCopyMain 9필드) · src/api/ledger.ts:462-499(getLedgerPresets — 파생 암묵 프리셋) · src/api/clock.ts:38-43, 283-309(clock_presets, PRESET_LIMIT=50)
- **접근:** 장부 마감(closed) 시점에 (schedule + ledger_session + clock_config)를 한 덩어리 JSON 회차 스냅샷으로 캡처한다 — 그때가 이 게임 설정이 완성된 유일한 순간(운영 중 수정 전부 반영). 같은 캡처를 두 곳에 쓴다: ①대시보드/장부 시작 화면의 '지난 게임 그대로 열기 — 8/24 데일리 6만' 버튼 1개로 4단계 동시 프리필 ②'이 게임을 프리셋으로 저장할까요?' 한 줄 유도로 authoring 재료. PresetManager의 기본 생성 경로를 '빈 폼'에서 '지난 게임에서 프리셋 만들기'(최근 포스터/장부 회차 리스트)로 뒤집고 빈 폼은 2차 진입점으로 강등. 장부 마감 직후·포스터 등록 직후 '이 설정을 프리셋으로 저장' 인라인 버튼을 두어 프리셋이 별도 작업이 아니라 운영의 부산물로 쌓이게 한다. clock_presets는 신규 저장을 막고 '클락 프리셋 N개를 게임 프리셋으로 가져오기' 1회 변환 버튼으로 흡수. applyPast·applyCopyMain·getLedgerPresets는 지우지 않고 스냅샷을 우선 후보로 올리는 방식으로 얹는다.
- **DoD:** 어제 연 게임을 오늘 1탭으로 재현(포스터+장부+클락 프리필 완료, 사람 입력은 날짜·담당직원만) · 프리셋 신규 생성의 기본 동선이 '지난 게임에서'이고 실제 편집량이 2~3칸 · clock_presets 신규 저장 진입점 0개, 변환 버튼으로 기존 50개 이하 전량 이관 가능 · 기존 applyPast/applyCopyMain 동작 회귀 없음 · npm run build + npm run test:e2e

#### IA1 — 매장 탭 nav 골격 14→5 (컴포넌트 이동 0) — 연합리그 제거·그룹 헤더·★ 삭제·이용권 조건부·KillSwitch 격리
 effort **M** · impact **high**

- **앵커:** src/components/features/VenueManageTab.tsx:197-210(14개 평면 배열) · :132-147(favs/toggleFav, localStorage nuri:fav-sections) · :254-257(favs 정렬) · :271-296, :433-442(모바일·PC ★ 어포던스) · :207(voucher 무조건 push + 잠금) · :369(KillSwitch가 섹션 스위치 바깥 = 전 화면 상시 노출) · :375-390(SECTION_DESC) · :302-308(PC 사이드바 lg:w-44 sticky)
- **접근:** available을 `{ id, label, group: '오늘'|'분석'|'관리', badge? }` 구조로 바꾸고 그룹 헤더 3개를 렌더. league 제거(유일한 기능 삭제). ★ 즐겨찾기 전량 삭제(favs·toggleFav·정렬·양쪽 어포던스·localStorage 키 — 기존 값은 읽지 않고 방치, 마이그레이션 불필요). voucher는 canIssue일 때만 노출(발행매장이 아니면 영원히 안 열리는 잠금 = 거짓 약속). KillSwitch를 매장 설정 '위험 구역'으로 이동. 사이드바 lg:w-44 → lg:w-52 + 항목별 라이브 배지 자리 확보. 이 단계에서는 **어떤 컴포넌트도 마운트 위치를 바꾸지 않는다** — 라벨·그룹·노출 규칙만 바꿔 리뷰 diff를 최소화한다.
- **DoD:** nav 항목이 그룹 헤더 3개 아래 정렬되고 매일 쓰는 항목이 상단에 고정 · 연합 리그 진입 경로 0개 · ★ 관련 코드 순감(라인 수 감소 확인) · 비발행 매장에서 이용권 항목이 아예 보이지 않음 · KillSwitch가 대시보드 포함 매일 화면에서 사라지고 매장 설정 하위에서만 접근 가능 · 기존 섹션 id는 그대로라 딥링크 무영향 · npm run build + npm run test:e2e

#### IA2 — '게임 진행' 4단계 스테퍼 통합 + 알림 딥링크 레거시 매핑(동시 필수)
 effort **L** · impact **high**

- **앵커:** src/components/features/VenueManageTab.tsx:95-97(onMakeRankingDraft) · :98-100(onOpenClockFromLedger) · :105-111(onOpenLedgerFromPosters) · :113(useBackClose) · :125-130(deepSection 유효성 검사 없이 setState = 최대 리스크) · :331-361(box() 섹션별 마운트) · src/components/features/StoreDashboard.tsx:686-707('지금 할 일' 상태머신 — 착지 로직 원본) · src/components/atoms/SlidingPill.tsx(framer-motion 대체 패턴) · src/index.css:283(.tab-pane 진입 애니메이션 무효화 목록)
- **접근:** GameFlowSection 한 컴포넌트로 감싸고 자식(MyPostersTab·NuriPosLedger·TournamentClock·RankingEditor)은 props 시그니처 무변경으로 마운트만 이동. 상단에 게임 선택 칩 바(오늘 메인/사이드1/내일/지난 미마감), 아래에 4단계 스테퍼(각 단계에 실시간 상태 배지). 단계 전환은 섹션 내부 state이므로 ledgerSeed·clockSeed·rankingDraft가 크로스 섹션 텔레포트에서 내부 state로 강등되고 useCallback 핸들러 6개가 사라진다. 착지 단계는 StoreDashboard의 상태머신을 그대로 재사용. PC ≥1280px 좌(게임리스트+스텝)/우(작업판) 2열. 인디케이터는 SlidingPill(framer-motion 금지), 신규 진입 애니메이션 클래스를 만들면 index.css:283 목록에 추가. **같은 커밋에 딥링크 레거시 매핑 테이블 필수**: ledger|clock|ranking|posters → {section:'game', step:…}, presets|page|venueRank|voucher|settings → {section:'settings', tab:…}, stats→'insights', attendance|staff→'team', league→'home', unknown→홈 폴백. 백스택은 스텝→섹션→탭 3단.
- **DoD:** 포스터→장부→클락→순위 이동 시 섹션 재마운트 없이 작업판만 교체 · 진입 시 '지금 할 일'과 동일한 단계에 착지 · 기존 알림 딥링크 5종(ledger/clock/ranking/posters/stats)이 전부 올바른 스텝으로 착지(무음 실패 0, E2E 케이스 추가) · 안드로이드 백버튼이 스텝→섹션→홈 순으로 닫힘 · framer-motion 미사용 확인 · npm run build + npm run test:e2e

#### IA3 — 대시보드 다이어트 + 상시 게임 바(라이브 구독 승격) + 매장 설정 하위탭 통합
 effort **M** · impact **medium**

- **앵커:** src/components/features/StoreDashboard.tsx:948-951, 975-978, 981-984, 987-990, 993-996(순수 링크 카드 5개) · :450-469(운영 가이드 배너 상시 노출) · :523-597(바인요청 인라인 승인 — 유지할 성공 패턴) · :161-162, :188-196, :237, :253-257(라이브 구독·성능 가드) · src/components/features/VenueManageTab.tsx:351-356(venueRank/page 분리 마운트) · :206(attendance가 ledgerOk에 묶인 게이팅 버그) · VenueCustomizePanel.tsx:26,35 / VenueRankHub 167,179(같은 venue_page_config 이중 로드)
- **접근:** ①순수 링크 카드 5개 제거하고 기본 6카드(지금 할 일/라이브 운영 현황/오늘 장부/최근 7일+AI/다가오는 예약/단골 TOP) + '더 보기'. 규칙: '그 자리에서 끝내거나, 게임 스텝으로 보내거나'. 딜러 관리·예약방문체크는 모달 유지하되 라이브 위젯/직원 섹션의 액션으로, 고객분석·손님유형은 매출·손님으로, 매장 꾸미기는 nav로만, 부스트는 하단 유틸 한 줄. 운영 가이드 배너는 초보 모드 전용 + dismissible. ②라이브 구독(getVenueClocks·getPendingBuyinRequests·subscribeBuyinRequests)을 VenueManageTab 레벨로 승격해 어느 섹션에서도 보이는 얇은 상단 게임 바로 공급(모바일은 1줄 스트립). 기존 active 게이팅·1초 틱 조건은 그대로 유지. ③매장 설정 하위탭 5개 구성 + venueRank/page를 venue_page_config 로드 1회·저장 1회 단일 폼으로 병합 + settings→'POS·결제' 개명 + attendance 게이팅을 ledgerOk에서 '소속 직원이면 누구나'로 수정. ④점진적 공개(초보 3개 → 성숙도 해금, 권한 게이팅과 분리, 숨김은 잠금이 아니라 비노출, nav 하단 '고급 기능 모두 보기' 토글).
- **DoD:** 대시보드 기본 노출 카드 6개, 순수 링크 카드 0개 · 통계·직원 화면에서도 대기 바인 요청 건수가 보임(상시 게임 바) · 구독이 탭 비활성 시 정지(기존 성능 가드 회귀 없음) · 매장 페이지 설정을 한 폼에서 저장 후 랭킹 보드 상태가 낡지 않음 · 장부 권한 없는 직원이 자기 출퇴근 기록을 볼 수 있음 · 신규 매장 첫 진입 시 최상위 3개만 노출, 직원 1명 초대 시 '직원·근무'가 NEW와 함께 등장 · npm run build + npm run test:e2e


---

## 14. 이미지·시각자산 전략 (2026-08-25, 3각도) — "이미지를 구하지 말고 브랜드를 그린다"

### 전략
"이미지를 구하지 말고 브랜드를 그린다." 3각도가 서로 다른 경로로 같은 결론에 도달했다 — 감사(레포에 SVG 0개, PNG 9장 62.3KB), 법무(스톡 라이선스는 상표를 면책하지 않고, 포커 사진은 저작권보다 규제/스토어 톤 리스크가 먼저 터진다), 생성전략(자체 생성은 미학이 아니라 egress 예산 이전이다). 따라서 NURI의 이미지 전략은 "무료 스톡 소싱 계획"이 아니라 자체 벡터 브랜드 시스템 구축 계획이다.

핵심 진단 3가지.
(1) 벡터 원본이 없어서 색이 갈라졌다. 워드마크가 1118x660 PNG 2장뿐이라(첫 페인트에 26.9KB 이중 다운로드, 28~32px로 축소 렌더) 파생 자산이 전부 색을 하드코딩했고, 그 결과 앱 안(accent-300 #5E6AD2 / surface-base #08090A)과 앱 밖(PWA 아이콘 #FFD100/#0E1116, offline.html #FCD535/#0A0C0F, manifest #0A0C0F, profileCard #FFD100, recordCard #FCD535, EmptyState #FCD535)이 두 개의 브랜드로 분열돼 있다. 홈 화면 골드 아이콘 -> 인디고 앱으로 색이 튄다. 골드는 폐기가 아니라 tailwind 정의대로 "상금·트로피·랭킹 전용"으로 역할을 좁힌다.
(2) 포커 정체성을 담을 그릇이 비어 있다. Icon.tsx 38개가 전부 범용 Lucide 경로 복제이고 칩·카드·수트·딜러버튼 글리프가 0개다. 그래서 이모지 331개(55파일, `📅 대회 일정 보기` 같은 primary CTA 포함), 온보딩 🏆📍🎯, ToolsPanel 22개 로컬 기하도형이 갈 곳 없이 계속 샌다. 글리프 세트가 모든 후속 작업의 선행 조건이다.
(3) 비어 보이는 곳은 정확히 4곳 — 공유 미리보기(투명배경 워드마크 + twitter:card=summary), 포스터 없는 대회/매장 히어로(♠♥♦♣ 시스템 텍스트 글리프 격자 + `#0a0c0f` 하드코딩으로 라이트 테마 검정 타일), 중고장터 목록 썸네일 0개(판매자는 5장 업로드), PWA manifest screenshots 부재.

실행 원칙: 형태 어휘(워드마크 SVG -> 글리프 세트)를 먼저 확정하고 -> 앱 밖 표면을 그 어휘로 재도장 -> 그다음 화면 안 폴백/빈상태로 내려온다. 1~3번 카드는 UI 변경이 아니라 자산 교체라 회귀 위험이 거의 없다. 스톡 사진과 unDraw 계열 일러스트 팩은 라이선스 부담 이전에 그 스타일 자체가 de-AI가 지우려는 "제네릭 티"이므로 채택하지 않는다.

### 소스 정책(계층)
계층 1 — 자체 제작 SVG/CSS (기본값, 95%를 여기서 해결). 라이선스 0, 상표 0, egress 0, currentColor로 다크/라이트 자동 대응. 워드마크·아이콘·파비콘·알림 배지·OG 카드·빈상태·뱃지·온보딩·도구 아이콘·포스터 폴백·배경 전부 이 계층.

계층 2 — 유저 업로드 (실사진이 필요한 유일한 프로덕션 경로). 포스터·매장 갤러리·중고장터·아바타·커뮤니티. src/lib/storage.ts 파이프라인(EXIF 보정 -> 캔버스 리사이즈 -> webp -> 적응형 품질 -> cacheControl 1년)이 이미 완비되어 있으므로 새 업로드 경로를 즉흥 추가하지 않는다.

계층 3 — 자사 화면 캡처. PWA manifest screenshots, 업주 가이드 문서. 반드시 src/mock/data.ts 목업으로 촬영(실 닉네임·아바타·매출·상호 노출 금지). 목업의 'ROTI ARENA'는 실재 상호이므로 캡처에 쓰려면 사전 동의 필요.

계층 4 — 외부 소스: 원칙적으로 쓰지 않는다. 불가피하면 CC0 기관(Met Open Access, Smithsonian Open Access, Getty Museum Open Content)만. 귀속 불필요 + 재배포/개작 제한 없음 + 상표 만료로 3중 안전. 19세기 트럼프 판화·고전 문양이 실제로 있고 NURI 팔레트로 재도장까지 합법이다.

명시적 금지 목록:
- Pixabay 포커/카지노 사진 — "인식 가능한 상표 포함 시 상업 사용 불가" 조항에 정면으로 걸림(Bicycle 덱·카지노 칩 인레이가 프레임에 거의 반드시 들어감).
- 브랜드 덱이 찍힌 모든 포커 사진 — 스페이드 에이스·조커·카드 뒷면·턱박스는 USPCC 등록 상표 보호 대상이고, 스톡 라이선스는 저작권만 다루지 상표를 면책하지 않는다.
- Storyset 무료 티어(귀속 필수), Hero Patterns(CC BY 4.0 귀속 필수), SVG Backgrounds 무료(귀속 필수) — 모바일 다크 UI에 크레딧 블록을 심는 비용 > 자작 비용.
- unDraw — MIT가 아니라 자체 라이선스이고 AI 학습·팩 재배포·스크래핑 금지. 무엇보다 그 스타일이 제네릭 AI 티의 대표 시그니처.
- Blush — 수정해도 소유권이 아티스트에게 남아 브랜드 자산 부적합.
- Unsplash API — 귀속 UI 강제 + 핫링크 강제(웹 개별 다운로드 경로는 귀속 불필요라 허용).
- AI 생성 이미지 — 한국(문체부·저작권위 2025.6 안내서)·미국(Thaler v. Perlmutter, 2026.3.2 확정) 모두 저작권 불인정. 경쟁 앱이 복제해도 막을 수 없으므로 브랜드 자산에 절대 금지.
- Haikei 등 외부 SVG 생성기 — 조건 불명확, 확인 전 채택 금지.
- Gravatar/DiceBear/UI-Avatars — 외부 요청 + 이메일 해시 국외이전 + 일부 CC BY 귀속 의무.

톤 금지 목록(규제/스토어): 현금 다발, 칩 산더미, 룰렛, 슬롯머신, 다이스, 황금빛 카지노 조명, "잭팟/대박/한방" 카피. Google Play는 아이콘·스크린샷이 실제 콘텐츠 및 IARC(한국 GRAC) 등급과 일치할 것을 요구하고, 2023.10.17부터 홀덤펍 청소년 출입·고용이 금지됐다. 커밋할 톤은 펠트·칩·카드·밤을 도박이 아니라 경기(sport)와 커뮤니티의 기호로 재해석하는 것.

### 이미지 필요 지점(코드 매핑)
- 브랜드 워드마크 — public/2.png + public/nuri-logo.png (1118x660 PNG 2장, 첫 페인트 26.9KB 이중 다운로드). NuriHoldemLogo.tsx:18, index.html:89-98(4개 img + display:none CSS), TournamentClock.tsx:764 TV 송출 워터마크
- PWA 아이콘·파비콘 7장 — scripts/gen-icons.mjs가 sharp로 생성. BG #0E1116 / GOLD #FFD100 구 팔레트 + Arial 텍스트 워드마크(빌드 비재현성)
- 웹 푸시 알림 — public/sw.js:68-69가 48px favicon.png를 icon/badge 둘 다에 사용. badge는 알파만 추출되는데 불투명 사각형이라 안드로이드 상태바에 회색 네모가 뜬다
- 오프라인 폴백 — public/offline.html:31이 /icon-192.png를 참조하나 sw.js:12는 offline.html 하나만 프리캐시 -> 미설치 방문자는 깨진 이미지. 색도 #0A0C0F/#FCD535 구 팔레트
- 공유 미리보기(OG/Kakao) — index.html:50,52,57 og:image가 투명배경 검은글자 워드마크 1118x660(1.69:1) + twitter:card=summary. lib/seo.ts:18,83,143 폴백, lib/kakao.ts:39, api/p.js:59가 Supabase 원본 포스터를 스크래퍼에 그대로 전달
- 포스터 없는 대회 카드/상세 — ScheduleCard.tsx:59,93,97 및 ScheduleDetailModal.tsx:41,96,124 (♠♥♦♣ 문자 리터럴 격자 + #0a0c0f 하드코딩 -> 라이트 테마 검정 타일)
- 사진 없는 매장 히어로 — VenuePage.tsx:577,586-590,596-604 (동일 문제 + 이니셜 타일 중복 구현). VenueThumb.tsx는 같은 문제를 이미 잘 풀어둔 선례
- 중고장터 목록 썸네일 0개 — MarketplaceTab.tsx:365-455 ListingRow에 img/thumbUrl 0건. 반면 storage.ts:112-126이 5장까지 업로드하고 ListingDetailModal·MyMarketModal에서는 표시 중. CommunityTab.tsx:726-736이 동일 문제의 해결 선례
- 빈 상태 마스코트 — EmptyState.tsx (#181A20/#2B3139/#FCD535/#848E9C 하드코딩, 라이트 테마 미대응). 전역 18곳 재사용, Skeleton.tsx:34-38이 재래핑
- 활동 뱃지 8종 — ActivityBadges.tsx:7-19 전부 텍스트 칩. '획득 뱃지 N'이라는 수집 메타포인데 수집할 그림이 없다
- 온보딩 첫인상 — OnboardingSheet.tsx:43-47,57 페르소나 카드 3장이 시스템 이모지 🏆📍🎯
- 도구 탭 22개 아이콘 — ToolsPanel.tsx:28-74 Icon.tsx를 우회한 로컬 인라인 SVG. endtime/pot/Icon.tsx clock이 사실상 동일 도형
- 이모지 331개 / 55파일 — LiveGamesTab.tsx:155 `📅 대회 일정 보기`, TournamentClock.tsx:710 `📺 TV 송출`, BusinessFooter.tsx:21 `📖 사용설명서`, App.tsx 36개 등 primary CTA와 매장 PC 운영 화면까지 침투
- PWA manifest screenshots 부재 — public/manifest.webmanifest에 screenshots 키 없음 -> 안드로이드 리치 설치 다이얼로그를 못 받음(InstallBanner.tsx가 띄우는 시스템 시트가 초라해짐)
- 업주 가이드 3종 스크린샷 0장 — public/guide/manual.html(176KB), owner.html(18.8KB), owner.pdf(1.5MB) 전부 img 0개. 매장은 PC 99%인데 다단계 운영 절차를 글로만 설명
- 캔버스 공유 카드 2종 — lib/profileCard.ts(640x880), lib/recordCard.ts(1080x1080). 앱이 외부로 내보내는 유일한 자체 이미지인데 구 골드 팔레트 + Arial 하드코딩(한글은 시스템 폴백 -> 한 장 안에서 두 활자가 섞임)
- 단일 테넌트 매장 로고 — RotiArenaLogo.tsx(195줄)가 실재 상호 로고를 재현해 번들에 상주, VenuePage.tsx:171,593이 venue.id==='v_roti' 하드코딩 분기로 호출

### 자체생성 vs 실사진
자체 생성(SVG/CSS/캔버스/빌드타임 sharp) — 위 목록 18개 중 15개. 워드마크, PWA 아이콘·파비콘, 알림 아이콘/배지, offline.html 마크, OG 카드, 포스터 폴백 3곳, 빈상태 4~6종, 뱃지 8종, 온보딩 3종, 도구 22종, 이모지 331개 대체 글리프, 배경 그라디언트, 아바타/매장 해시 타일, 공유 카드 2종. 근거: egress 0(번들 인라인 또는 Vercel 정적), 라이선스 0, 상표 0, currentColor로 테마 자동 대응, 그리고 도메인 기표(수트·칩·13x13 그리드)는 원리적으로 스톡이 도달할 수 없는 지점이다.

실사진 — 정확히 3곳뿐.
(a) 유저 업로드(포스터·매장 갤러리·중고장터·아바타) — 이미 storage.ts 파이프라인이 완비. "슬롯만 뚫으면" 된다.
(b) PWA manifest screenshots — 스토어 다이얼로그의 목적이 "들어가면 뭐가 보이는지"이므로 일러스트가 아니라 진짜 캡처가 맞다. 모바일 3~4장 1080x1920(narrow) + 데스크톱 2장 1920x1080(wide).
(c) 업주 가이드 문서 캡처 — 절차 설명은 화면 없이는 따라갈 수 없다. 단 개념 설명(대회 상태 전이, 바인 승인 흐름)은 캡처 대신 SVG 플로우 다이어그램이 낫다(UI가 바뀌어도 안 낡음).

외부 소싱 — 0건 채택. 유일한 예외 후보는 CC0 기관 소스의 빈티지 카드 판화이며, 그마저도 "필수"가 아니라 "톤이 맞으면 고려"다.

명확한 판단 기준: 브랜드 정체성을 지시하는 것은 전부 자작(저작권이 우리에게 남아야 함), 콘텐츠의 실제 모습을 보여주는 것만 실사진.

### egress 예산
Supabase 무료 5GB/월에 이 전략이 추가하는 순증은 사실상 장터 썸네일 하나뿐이다. 나머지는 전부 번들(0바이트) 또는 Vercel 정적으로 빠진다. public/sw.js는 `url.origin !== self.location.origin`이면 즉시 return하므로 Supabase 이미지는 SW 캐시가 안 되고, 동일 출처 자산만 CACHEABLE 정규식(png|jpg|svg|webp|woff2 포함)을 탄다 — 즉 자산을 동일 출처로 옮기는 것 자체가 예산 이전이다.

절감(-):
- 워드마크 SVG화: 첫 페인트 26.9KB -> 0(요청 2건 -> 0건, 인라인 gzip 약 1KB). 정적 셸의 4개 img + display:none CSS도 소멸.
- OG를 브랜드 카드로 고정: api/p.js:59가 지금 공유될 때마다 Supabase 원본 포스터(평균 165KB)를 스크래퍼에 전송 -> 정적 1200x630 PNG(약 60KB, Vercel CDN)로 대체하면 Supabase egress 0.
- 포스터 폴백 SVG pattern화: DOM 노드 24개 -> 1개(egress 영향은 0이나 저가 안드로이드 렌더 비용 절감).

순증(+):
- 장터 목록 썸네일: thumbUrl(images[0], 96) webp 약 4KB/행, 100행 스크롤 400KB. 이미 커뮤니티가 같은 규모로 돌고 있어 5GB 대비 유의미하지 않다. 다만 imageUrl.ts:19의 render/image 변환 엔드포인트가 유료 플랜 기능이므로 활성 여부 확인이 선행 조건 — 비활성이면 "실패 요청 1건 + 원본 풀사이즈"가 되어 절감이 아니라 순증이다.
- PWA screenshots 5장 x 150KB 이하 = 750KB 이하, Vercel 정적(월 대역 100GB) — Supabase 무관.
- 가이드 문서 캡처 12장 x 약 80KB webp = 약 1MB, /guide/img/*.webp 분리 + loading=lazy. base64 인라인 금지(manual.html이 이미 176KB).
- 신규 SVG 자산(글리프 14종 + 일러스트 6종 + 뱃지 8종 + 도구 22종): path 합계 gzip 후 6KB 미만 번들 증가.

운영 규칙(CLAUDE.md 명문화 권장): (1) 새 시각 자산을 만들 때 "이걸 Supabase에 올릴 이유가 있나"를 먼저 묻는다 — 유저 업로드 콘텐츠만 Supabase, 브랜드/장식/플레이스홀더/OG는 번들 또는 /public. (2) 목록에 이미지를 노출할 땐 원본이 아니라 thumbUrl(url, 렌더폭x2). (3) format=webp를 절대 빠뜨리지 않는다(빠지면 JPEG로 변환돼 원본보다 커진다).

### ⚖️ 법적 가드레일(즉시 조치 포함)
- Lucide ISC 고지 누락 — 즉시 조치. Icon.tsx의 settings/share/trash/refresh/send 등 다수 path가 Lucide 원본과 문자 단위로 동일한데 레포에 저작권 고지가 0건이다. ISC는 재배포 시 저작권 고지 유지를 요구하므로 형식 요건 미충족. 한 줄로 해결: 'Portions derived from Lucide (lucide.dev) — ISC, (c) 2022 Lucide Contributors; fork of Feather Icons, MIT, (c) 2013-2022 Cole Bemis.' 신규 글리프는 Lucide를 재참조하지 말고 자체 도안으로 그려 고지 범위를 기존 38개로 한정한다.
- Arial(Monotype 상용) 렌더 결과물 배포 — gen-icons.mjs:23-25, EmptyState.tsx, profileCard.ts:52-57, recordCard.ts가 Arial로 렌더한 PNG를 배포하거나 유저가 SNS에 공유하게 한다. 폰트 파일 재배포는 아니지만 렌더 결과물의 상업적 배포는 회색지대. Pretendard(SIL OFL 1.1, 상업 이용·수정·임베딩 허용, 폰트 단독 판매만 금지)로 교체하면 소멸하고 앱 본문 폰트와도 일치한다. OFL.txt 사본 동봉 필수, 서브셋 파일명은 예약 이름을 피해 중립적으로(og-font.woff 등).
- ROTI ARENA 상표 재현 — RotiArenaLogo.tsx(195줄)가 실재 매장 상호 로고를 SVG로 재현해 번들에 상주하고 VenuePage.tsx:171,593이 venue.id 하드코딩으로 호출한다. 모든 매장 사용자가 남의 매장 로고를 다운로드하는 구조이며 계약 종료 시 자동 정리되지 않는다. 서면 사용 허락 범위(앱 내 표시 한정인지 목업/마케팅/스크린샷까지인지)를 확인하고, 코드가 아니라 venue.logoUrl 업로드 데이터로 옮긴다. 왕관·방패 등 헤럴드리 일반 형태는 퍼블릭 도메인이지만 특정 업체 로고 재현은 상표권 대상.
- 스톡 라이선스는 상표를 면책하지 않는다 — Getty IP 가이드 기준 스페이드 에이스·조커·카드 뒷면·턱박스가 보호 대상이고 BICYCLE/BEE/AVIATOR/HOYLE/Rider Back Design은 USPCC 등록 상표다. Pexels 라이선스를 통과한 Bicycle 덱 사진도 상표는 그대로 살아 있다. Pixabay는 아예 '인식 가능한 상표 포함 시 상업 사용 불가' 조항이 있어 포커 사진 대부분이 라이선스 밖이다. 결론: 브랜드 덱이 찍힌 사진은 전량 배제, 카드/칩 그래픽은 자작 SVG.
- 규제/스토어 톤 — 저작권보다 먼저 터진다. 2023.10.17부터 홀덤펍 청소년 출입·고용 금지, 게임산업진흥법이 사행성 조장 금지, Google Play는 아이콘·스크린샷 등 시각 요소가 실제 콘텐츠 및 IARC(한국 GRAC) 등급과 일치할 것을 요구한다. 금지 톤을 CLAUDE.md에 명문화 권장: 현금 다발·칩 산더미·룰렛·슬롯머신·다이스·황금빛 카지노 조명·'잭팟/대박/한방' 카피. 라이선스와 상표가 모두 깨끗해도 이건 별도로 걸린다.
- AI 생성 이미지 — '못 쓴다'가 아니라 '써도 우리 것이 안 된다'. 한국(문체부·저작권위 2025.6 안내서: 창작적 기여 없는 산출물 등록 불가, 단순 색상 변경은 기여 불인정)과 미국(Thaler v. Perlmutter, 2026.3.2 상고 기각으로 확정) 모두 인간 저작자 요건을 확인했다. 경쟁 앱이 NURI의 AI 배경을 복제해도 저작권으로 막을 수 없으므로 로고·앱 아이콘·마스커블·OG·시그니처 배경 등 브랜드 자산에 절대 금지. 별개로 Getty v. Stability(영국 2025.11 상표 침해 인정, 미국 Lanham Act 청구 각하 기각 2026.4.23) 등 침해 리스크도 진행 중.
- 유저 업로드 콘텐츠 — 우리 저작물이 아니라 게시물이다. 이용약관에 '게시물의 서비스 내 노출 및 공유 미리보기 사용 허락' 조항이 있는지 확인(포스터를 og:image로 재배포 중). 장터 목록 썸네일 도입은 타 쇼핑몰 상품 이미지 무단 전재 매물의 확산 범위를 키우므로, ReportModal/ReportQueue의 통지-삭제 경로가 이미지에도 걸리는지 확인할 것.
- 스크린샷·캡처의 개인정보/영업비밀 — PWA screenshots와 가이드 문서 캡처는 반드시 목업 데이터로 촬영. 실 닉네임·프로필 사진·전화번호는 개인정보, 매장 장부·매출 수치는 영업비밀에 해당할 수 있다. 부수 효과로 플랫폼 이모지 글리프(Apple Color Emoji는 재배포 불가) 문제도 함께 해소되므로, 캡처 전에 이모지 이관(IMG-6)을 끝내는 것이 순서상 안전하다.
- 에셋 대장 운영 — 외부 자산을 채택하는 경우(현 전략상 CC0 기관 소스뿐)마다 출처 URL·라이선스명·확인 일자·사용 위치를 docs/asset-license-ledger.md에 기록한다. Openverse는 개별 저작물의 라이선스를 검증하지 않는다고 스스로 명시하므로 발견용으로만 쓰고 원본 기관에서 재확인. 이 기록이 분쟁 시 선의(good faith) 입증 자료가 된다.
- 면책 — 본 정리는 공개 라이선스 원문·판례·규제 자료 기준의 리서치이며 법률 자문이 아니다. 특히 USPCC 덱·카지노 브랜드 상표 판단과 국내 사행성 규제 적용은 실행 전 전문가 확인을 권한다.

### 실행 카드 IMG-1~7

#### IMG-1 — 워드마크 벡터화 — 브랜드 단일 소스 확보 + 첫 페인트 26.9KB 회수
 effort **S**

- **앵커:** src/components/atoms/NuriHoldemLogo.tsx:17-33 / index.html:89-98 / src/components/features/clock/TournamentClock.tsx:764 / src/App.tsx:212,217 / public/2.png, public/nuri-logo.png(삭제 대상)
- **접근:** 1) 현재 PNG 워드마크의 원본 폰트를 먼저 확인하고 해당 EULA의 logo/outline 조항을 체크한다(불명확하면 Pretendard 기반으로 재레터링 — 앱 본문 폰트와 일치하고 SIL OFL이라 안전). 2) NuriHoldemLogo.tsx를 인라인 <svg><path fill="currentColor">로 재작성하고 useTheme() 의존을 제거한다 — 다크/라이트가 CSS 상속으로 자동 해결. variant는 mark/wordmark/lockup 3종. 3) index.html 정적 셸의 4개 <img>와 `html.light .shell-dark{display:none}` 인라인 CSS를 <svg> 하나로 축약. 4) TournamentClock TV 송출 워터마크를 같은 컴포넌트로 교체(현재 저해상 래스터를 빔프로젝터 크기로 늘리는 중). 5) public/2.png, public/nuri-logo.png 삭제 후 sw.js CACHEABLE 정규식의 `nuri-logo|2` 토큰 정리. 6) 이 SVG path를 scripts/ 에 상수로 export해 이후 gen-icons/OG 카드가 같은 소스에서 파생하도록 한다.
- **DoD:** npm run build 성공 + npm run test:e2e 통과. 네트워크 탭에서 첫 페인트 시 /2.png와 /nuri-logo.png 요청 0건. 다크/라이트 토글 시 로고 색이 즉시 따라옴(FOUC 없음). 정적 셸(JS 실행 전)에서도 로고가 올바른 색으로 보임. public/에 두 PNG 부재. TV 송출 화면 전체화면에서 워터마크가 벡터로 선명.

#### IMG-2 — 포커 도메인 글리프 세트 — Icon.tsx PATHS 확장 + Lucide ISC 고지
 effort **M**

- **앵커:** src/components/atoms/Icon.tsx:7-13(IconName), :16-54(PATHS) / src/components/atoms/VenueThumb.tsx:13,50 / scripts/gen-icons.mjs:19-27(스페이드 path 기준선)
- **접근:** 1) 법무 선처리 — Icon.tsx 상단 또는 레포 NOTICE에 고지 추가: 'Portions derived from Lucide (https://lucide.dev) — ISC License, Copyright (c) 2022 Lucide Contributors. Lucide is a fork of Feather Icons, MIT, Copyright (c) 2013-2022 Cole Bemis.' (settings/share/trash/refresh/send 등 다수 path가 원본과 문자 단위로 동일한데 고지가 없다). 2) PATHS에 도메인 글리프 12~14종 추가: spade/heart-suit/diamond/club(수트), chip, chip-stack, cards(2장 겹침), dealer-button, blinds, trophy, all-in, felt-table, timer-poker. 수트는 채움 도형이므로 기존 star-fill/heart-fill의 `fill="currentColor" stroke="none"` 선례를 그대로 따른다. 3) 스페이드는 gen-icons.mjs의 512 좌표계 path를 24 viewBox로 스케일(÷21.33) 재사용 — 아이콘·PWA·OG가 하나의 형태를 공유하게 만드는 것이 de-AI의 핵심. 4) IconName 유니온 타입 갱신 필수. 5) VenueThumb.tsx:13의 유니코드 SUITS 배열을 Icon으로 교체 — iOS/일부 안드로이드가 ♥♦를 컬러 이모지로 승격시켜 text-white/10 워터마크 색 제어를 무력화하는 실제 렌더 버그 수정. 6) 신규 아이콘을 그릴 때 Lucide/Feather 원본을 다시 참조해 복제하지 말 것(고지 범위를 기존 38개로 한정).
- **DoD:** IconName 유니온과 PATHS 키가 일치(타입 에러 0). 신규 글리프가 24 viewBox / stroke 2 / currentColor 규약을 지켜 기존 38개와 시각적으로 섞임. VenueThumb에서 ♥♦가 어떤 기기에서도 회색 워터마크로 렌더(이모지 승격 없음). Icon.tsx 또는 NOTICE에 ISC/MIT 고지 존재. npm run build + test:e2e 통과. 새 라이브러리 의존성 0개(package.json 무변경).

#### IMG-3 — 앱 밖 표면 팔레트 통일 — PWA 아이콘·manifest·offline·푸시 배지
 effort **M**

- **앵커:** scripts/gen-icons.mjs:6-7,23-26,32-41 / public/manifest.webmanifest:12-13 / public/offline.html:5,12,19,31 / public/sw.js:12,68-69 / tailwind.config.js:33,35 / src/index.css:30
- **접근:** 1) gen-icons.mjs의 BG를 #08090A(surface-base 실값), 마크 색을 #5E6AD2(accent-300)로 교체. 2) `<text font-family="Arial">NURI</text>`를 path 아웃라인으로 고정 — sharp/librsvg가 시스템 폰트로 해석해 빌드 환경마다 글자가 달라지는 비재현 빌드 결함이자 Arial(Monotype 상용) 렌더 결과물 배포라는 라이선스 회색지대다. IMG-1의 벡터 워드마크를 소스로 삼는다. maskable pad=92(안전영역 76%)는 정확하므로 유지. 3) sw.js push 핸들러를 `icon: '/icon-192.png', badge: '/badge-96.png'`로 분리하고, gen-icons에 badge job 추가 — 배경 rect 없이 마크 실루엣만 흰색 + 나머지 완전 투명 96x96(안드로이드가 알파만 추출하므로 현재는 상태바에 정체불명 회색 사각형이 뜬다). 4) manifest의 background_color/theme_color를 #08090A로 통일(PWA 스플래시와 앱 첫 페인트 색 불일치 동시 해결). 5) offline.html의 <img src="/icon-192.png">를 인라인 <svg>로 교체 — 오프라인 폴백은 정의상 외부 참조가 0이어야 한다(현재 sw.js:12는 offline.html 하나만 프리캐시하므로 미설치 방문자는 깨진 이미지를 본다). 배경 #08090A, 버튼 #5E6AD2/흰 글자. 6) 골드(#FCD535)는 폐기하지 말고 tailwind.config.js:35 주석대로 상금·트로피·랭킹 전용으로 역할만 한정.
- **DoD:** node scripts/gen-icons.mjs를 두 대의 다른 머신(또는 폰트 없는 컨테이너)에서 실행 시 산출 PNG 바이트가 동일(재현성). icon-512.png 중앙 픽셀이 인디고 계열, 코너가 #08090A. badge-96.png의 알파 채널이 마크 부분만 불투명(전체 255 아님). 안드로이드 실기기에서 푸시 알림 상태바 배지가 실루엣으로 표시. 네트워크를 끊고 새 시크릿 창으로 접속 시 offline.html에 깨진 이미지 아이콘 없음. PWA 설치 후 스플래시와 첫 페인트 배경색이 동일.

#### IMG-4 — 공유 표면 재구축 — OG 브랜드 카드 1200x630 + 캔버스 카드 2종 리브랜드 + Pretendard self-host
 effort **M**

- **앵커:** index.html:50,52,57 / src/lib/seo.ts:18,83,143 / src/lib/kakao.ts:39 / api/p.js:59 / src/lib/profileCard.ts:9,16-29,52-57 / src/lib/recordCard.ts:3,7-12,29 / src/index.css:104 / tailwind.config.js:72 / scripts/(신규 gen-og.mjs)
- **접근:** 0) 선행 — Pretendard가 index.css:104와 tailwind.config.js:72에 지정돼 있으나 @font-face·CDN 링크·npm 패키지·woff2 파일이 전부 없어 실제로는 system-ui로 폴백 중이다(모바일 99% 유저 대부분이 의도한 폰트를 못 보는 상태). 한글 subset woff2를 public/fonts/에 두고 @font-face + <link rel=preload> 연결. sw.js:7 CACHEABLE이 이미 woff2를 포함하므로 캐싱은 공짜. OFL 준수를 위해 OFL.txt 사본 동봉. 1) scripts/gen-og.mjs 신설 — sharp로 1200x630 불투명 PNG 생성. 내용은 실사진 아닌 브랜드 씬: #08090A 딥 배경 + 인디고 글로우 + IMG-1 워드마크 + 서브카피 1줄 + 코너 칩/카드 실루엣(IMG-2 글리프 재사용). 투명도 절대 금지(카톡 다크모드에서 검은 글자가 사라지는 현행 문제의 원인). 2) index.html:52의 twitter:card를 summary_large_image로 승격, og:image/twitter:image를 새 카드로 교체. kakao.ts:39 기본 이미지도 동일. 3) api/p.js:59는 현재 Supabase 원본 포스터(평균 165KB)를 스크래퍼에 그대로 전달한다 — 브랜드 카드 고정으로 바꾸면 공유 미리보기 일관성과 Supabase egress 0을 동시에 얻는다(세로 1200x1600 포스터가 가로 카드에서 잘리는 문제도 소멸). 4) profileCard.ts/recordCard.ts의 색 상수를 실토큰으로 교체(배경 #08090A, 라인 #24282E, 강조 #5E6AD2) 하되 상금·전적 수치는 골드 #FCD535 유지 — 인디고 프레임에 골드 숫자가 오히려 대비가 좋다. 5) 두 파일의 'Arial' 하드코딩을 Pretendard 스택으로 바꾸고, 캔버스는 폰트 로드를 기다려야 하므로 그리기 직전 `await document.fonts.ready`를 넣는다(안 넣으면 폴백으로 그려진 뒤 폰트가 도착). profileCard의 손으로 찍은 베지어 스페이드(:29-40)를 IMG-2의 수트 path와 동일 도안으로 통일.
- **DoD:** 카카오톡 다크모드/라이트모드 대화방, 페이스북 디버거, 트위터 카드 검증기에서 큰 카드가 잘림 없이 표시되고 글자가 배경에 묻히지 않음. og:image 응답이 image/png 불투명 1200x630. 대회 상세 공유 시 Supabase 포스터 URL이 og:image로 나가지 않음. 전적 카드를 다운로드해 열었을 때 영문과 한글이 같은 활자(Pretendard)로 렌더. 앱 본문 폰트가 실제로 Pretendard로 렌더됨(DevTools Computed > Rendered Fonts로 확인). public/fonts/ 에 OFL.txt 동봉.

#### IMG-5 — 빈 이미지 슬롯 4곳 — 포스터 폴백 SVG pattern화(라이트 테마 버그 동시 수정) + 장터 목록 썸네일
 effort **M**

- **앵커:** src/components/features/ScheduleCard.tsx:59,93,97 / src/components/features/ScheduleDetailModal.tsx:41,96,124 / src/components/features/VenuePage.tsx:171,577,586-590,593,596-604 / src/components/features/MarketplaceTab.tsx:365-455 / src/components/features/CommunityTab.tsx:726-736(선례) / src/components/atoms/VenueThumb.tsx:4-21(해시 팔레트 선례) / src/lib/imageUrl.ts:19
- **접근:** 0) 선행 검증(5분) — imageUrl.ts:19가 쓰는 /storage/v1/render/image/ 는 Supabase 유료 플랜 기능이다. 대시보드에서 플랜과 Image Transformations 활성 여부를 먼저 확인. 비활성이면 장터 썸네일이 '실패 요청 + 원본 풀사이즈'가 되므로, 업로드 시점에 storage.ts resizeImage로 96px 썸네일을 별도 객체로 생성하는 방식으로 대체한다. 1) 포스터 폴백 3곳의 문자 리터럴 ♠♥♦♣ 격자(span 12~24개)를 SVG <pattern> 한 장으로 교체 — DOM 노드 24개가 1개로 줄고 렌더가 픽셀 단위로 결정론적이 된다(현재는 폰트 렌더러에 따라 기기마다 다른 그림). 2) 하드코딩 `#0a0c0f`를 `rgb(var(--surface-base))`/bg-surface-low 토큰으로 교체 — 라이트 테마에서 포스터 없는 카드가 검정 타일이 되는 버그 수정(ScheduleCard:93, ScheduleDetailModal:96, VenuePage:577,1496 네 곳). 3) posterColor 원색 대신 VenueThumb.tsx:4-11의 채도 낮춘 6색 해시 팔레트를 재사용해 일관성 확보(그 주석이 이미 '원색을 그대로 쓰면 조잡해 보인다'는 판단 근거를 기록해 뒀다). 4) VenuePage:171의 `venue.id === 'v_roti'` 하드코딩 분기와 RotiArenaLogo.tsx(195줄, 실재 매장 상표를 재현해 번들 상주) 제거 — 히어로 폴백 순서를 images[0] -> logoUrl -> 해시 타일로 정리하고, VenuePage:596-604의 중복 이니셜 타일 구현도 흡수. logoUrl 컬럼 추가와 업로드는 별도 티켓으로 분리 가능. 5) MarketplaceTab의 ListingRow에 44~48px 썸네일 슬롯 추가 — CommunityTab.tsx:726-736의 h-11 패턴을 그대로 복제(thumbUrl + thumbSrcSet + 다장 카운터). 사진 없는 매물 폴백은 카테고리별 SVG 글리프(IMG-2 세트).
- **DoD:** 라이트 테마에서 포스터 없는 대회 카드/상세/매장 히어로가 검정 타일이 아니라 해당 테마 톤으로 렌더(4곳 전부). iOS/안드로이드/윈도우에서 폴백 무늬가 동일하게 보임. 장터 목록에 썸네일이 표시되고 Lighthouse에서 CLS 증가 없음(고정 크기 박스). RotiArenaLogo.tsx 삭제 및 venue.id 하드코딩 분기 0건. npm run build + test:e2e 통과. Supabase 변환 플랜 확인 결과가 커밋 메시지 또는 코드 주석에 기록됨.

#### IMG-6 — 정체성 표면 시리즈 — 빈상태 4~6종·뱃지 8종·온보딩 3종·도구 22종 + 이모지 이관 1차
 effort **L**

- **앵커:** src/components/atoms/EmptyState.tsx:9-25 / src/components/atoms/Skeleton.tsx:34-38 / src/components/atoms/ActivityBadges.tsx:7-37 / src/components/features/OnboardingSheet.tsx:43-47,57 / src/components/features/ToolsPanel.tsx:28-74,215 / src/components/atoms/Avatar.tsx:29-33 / src/components/atoms/VenueThumb.tsx / src/index.css:283 / src/App.tsx, StoreDashboard.tsx, CustomerDashboardPage.tsx
- **접근:** 1) 그래머 확정 — src/components/atoms/illustrations/ 신설, 96 viewBox / 2px 스트로크 / 색 3단계(ink-muted 라인 + surface-high 면 + 강조 1점)라는 단일 문법을 정한다. '강조 1점' 규칙이 핵심 de-AI 장치다(전부 회색이면 밋밋, 여러 색이면 스톡 일러스트처럼 보인다). 2) EmptyState의 하드코딩 hex를 CSS 변수/currentColor로 토큰화(라이트 테마 대응)하고, 일러스트 4~6종으로 시리즈화: 졸린 카드(기록 없음)/접힌 카드 2장(검색 결과 없음)/빈 칩 트레이(장부 없음)/멈춘 클럭(진행 중 대회 없음)/빈 좌석 링(라이브 없음). 신규 애니메이션 클래스를 만들면 index.css:283의 :is(...) 목록에 반드시 추가(keep-alive 탭 재방문 깜빡임 방지). 3) ActivityBadges 8종을 24~28px 마크 시리즈로 — 방문은 '문->의자->펠트->왕관', 랭킹은 '말풍선 1->3->겹침->왕관 말풍선'처럼 같은 모티프가 성장하는 형태로 잡으면 8개를 따로 디자인하는 것보다 싸고 진행감이 잘 읽힌다. 미획득은 자물쇠를 겹치지 말고 마크 자체를 저채도 실루엣으로. 최상위 #FFD700을 gold-300 #FCD535로 통일. 4) OnboardingSheet의 🏆📍🎯을 40~48px 커스텀 마크로 — 트로피 대신 포스터+캘린더 격자, 핀 대신 펠트 테이블 위 핀, 과녁 대신 13x13 레인지 격자. '카테고리 상징'이 아니라 '실제로 뭐가 나오는지의 예고편'이 되어 선택 정확도도 올라간다. 5) ToolsPanel 22개를 Icon.tsx PATHS로 이관(단일 소스 규약 회복)하면서 최소 8개를 도메인 형태로 재도안 — 특히 endtime/pot/clock 3중 중복 해소. 6) Avatar.tsx의 단색 폴백을 VenueThumb의 해시 로직으로 승격(src/lib/hashTile.ts 추출, 매장=수트 워터마크 / 유저=동심 링). 시드는 반드시 불변 user_id를 쓸 것(현재 name을 받고 있어 닉네임 변경 시 아바타가 바뀐다). color-mix 미지원 구형 웹뷰(카톡 인앱)용 flat 폴백 필요. 7) 이모지 331개는 파일 단위 저위험 배치로 — App.tsx(36) -> StoreDashboard/CustomerDashboardPage(46, 매장 PC 화면) -> VoucherManageModal(23) 순. 이미 대응 아이콘이 있는 ✅⚠🔒📅🔔👤부터 단순 치환. PostflopTrainer 등의 ♠♥♦♣는 이모지가 아니라 포커 표기이므로 제거 대상이 아니다(SVG 글리프로 통일만).
- **DoD:** 라이트/다크 양쪽에서 빈 상태·뱃지·온보딩·아바타가 모두 성립(다크에서만 되는 자산 0건). ToolsPanel 22개가 전부 Icon.tsx PATHS 경유(로컬 인라인 SVG 0건), 도구 그리드에서 서로 구분 가능. primary/ghost 버튼 라벨 안의 이모지 0건. 아바타가 닉네임 변경 후에도 동일. 신규 진입 애니메이션 클래스가 있다면 index.css:283 목록에 포함. npm run build + test:e2e 통과 + 포트 5173에서 테마 토글 육안 검증.

#### IMG-7 — 실사진 3곳 — PWA screenshots + 업주 가이드 캡처(목업 데이터 촬영)
 effort **L**

- **앵커:** public/manifest.webmanifest / src/components/atoms/InstallBanner.tsx / public/guide/manual.html(176KB), owner.html(18.8KB), owner.pdf(1.5MB) / src/components/features/StoreDashboard.tsx:456,460,464 / src/components/features/VenueManageTab.tsx:1163 / src/components/features/BusinessFooter.tsx:21 / src/mock/data.ts / tests(Playwright)
- **접근:** 1) 캡처 생성을 Playwright 스펙으로 자동화(npm run test:e2e 인프라 재사용) — UI가 바뀌면 갱신이 따라온다. 반드시 src/mock/data.ts 목업 상태로 촬영하고, mock에 실재 상호 'ROTI ARENA'(data.ts:20,35)와 '로티 아레나/남양주'(:97)가 있으므로 캡처용 가명 픽스처를 별도로 두거나 해당 매장 동의를 받는다. 2) manifest에 screenshots 배열 추가 — narrow(모바일 1080x1920) 3~4장: 일정 탐색 목록 / 대회 상세 포스터 / 라이브 클락 / 도구 그리드. wide(데스크톱 1920x1080) 2장: 매장 대시보드 / 클락 TV 송출. form_factor 지정 필수(없으면 안드로이드가 미니 인포바로 떨어진다). WebP로 굽고 각 150KB 이하. Vercel 정적이라 Supabase egress와 무관. 3) 가이드 문서에 핵심 절차 8~12개 캡처 추가(클락 시작, 블라인드 구조 등록, 바인 승인, 장부 마감, 이용권 QR 발행, TV 송출). 클릭 대상은 캡처 위에 SVG 오버레이(인디고 사각 테두리 + 번호 원)로 표시 — 문구를 고칠 때 캡처를 다시 안 찍어도 된다. 4) 개념 설명(대회 상태 전이, 바인 승인 흐름)은 캡처 대신 SVG 플로우 다이어그램 — UI가 바뀌어도 안 낡는다. 5) manual.html이 이미 176KB이므로 base64 인라인 금지, /guide/img/*.webp로 분리 + loading="lazy". owner.pdf(1.5MB, 이미지 0장인 텍스트 PDF)는 HTML판을 정본으로 삼고 인쇄용으로만 남긴다.
- **DoD:** 안드로이드 Chrome에서 InstallBanner를 눌렀을 때 스크린샷 캐러셀이 있는 리치 설치 다이얼로그가 뜸(미니 인포바 아님). 데스크톱 Chrome에서도 wide 스크린샷 표시. 캡처 이미지에 실 유저 닉네임·아바타·전화번호·매출 수치·실재 상호 0건(리뷰 체크리스트로 확인). manual.html 최종 전송량이 이미지 지연 로딩 포함 초기 200KB 이하. 가이드 절차 8개 이상에 캡처 또는 다이어그램 존재. npm run build 통과.

