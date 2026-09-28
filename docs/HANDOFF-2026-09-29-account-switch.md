# 인수인계 — 2026-09-29 계정 전환 (중단 시점 전체 기록)

> 작성: nuri-lead (실행 모델 `claude-opus-5-5`, 세션 로그 관찰) · 2026-09-29
> 이유: 오너 지시 — "지금 하던 작업들을 정지하고 다른 계정에서 사용할 예정이니 중지한 부분 포함해서 전체 아주 상세하게".
> 이 문서는 **상태 기록**이다. 정책 정본은 `CLAUDE.md` · `AGENTS.md` · `.claude/rules/nuri-team-capabilities.md` 이고,
> 반복 실패 정본은 `docs/HANDOVER-2026-09-23.md`, 현재 상태 정본은 `docs/HANDOFF.md` 다(이 문서를 그 절에 연결할 것).

---

## 0. 새 세션이 제일 먼저 할 일 (순서대로)

1. **작업 위치를 정한다.** 중단된 편집은 아래 두 곳에 **같은 내용**으로 있다.
   - 로컬 작업트리(미커밋): `C:\Users\buffy\OneDrive\바탕 화면\누리홀덤\.claude\worktrees\pos-system-defect-fixes-938532`
     (브랜치 `NURI/pos-system-defect-fixes-938532`, HEAD `ed09bbf8`, 미커밋 46개 파일)
   - 원격 보관 브랜치: `NURI/wip-handoff-20260929` = 커밋 `bd77e539` (HEAD `ed09bbf8` + 위 46개 파일)
   - 다른 컴퓨터/새 작업트리면 `git fetch origin NURI/wip-handoff-20260929` 로 받는다. **이 커밋은 미검증 — 그대로 main 에 병합·배포 금지.**
2. **PR #29 를 먼저 끝낸다** — https://github.com/buffyfan9303-spec/NURI-HOLDEM/pull/29 (head `ed09bbf8`, 열림).
   CI 에서 `e2e (1)` 1건만 실패: `e2e/admin-exposure.spec.ts:104` "배너가 정말 없을 때의 안내가 홈 캐러셀의 실제 동작과 일치한다"
   → `getByText(/브랜드 슬라이드/)` 가 **2개 요소**에 걸림(strict mode). 원인: 관리자 배너 패널에 '지금 홈에 뜨는 순서' 목록을 새로 넣어
   '브랜드 슬라이드' 문구가 두 곳에 생겼다(`src/components/features/HomeBannersCard.tsx`). **셀렉터를 느슨하게 풀지 말고** 새 목록 줄에
   `data-testid` 를 주거나 스펙을 `getByRole`/testid 로 좁혀라(CLAUDE.md "라벨 결합 셀렉터" 규칙). 고친 뒤 PR #29 CI 통과 → 병합 → 배포 확인.
3. 그다음 §6 의 중단 작업을 **§6 표의 순서**로 재개한다. 각 항목은 원인 보고서(§10 사본)와 재현 하네스가 있다.
4. 새 팀 구성(§2)을 적용한다 — 브랜치 `NURI/handoff-20260929` 에 파일이 있다.

---

## 1. 계정·도구 환경 (이 컴퓨터, 2026-09-29 실측)

| 항목 | 상태 | 근거·비고 |
|---|---|---|
| 데스크톱 앱 Claude Code 세션 | 기능 실행 확인 | 이 세션이 정상 동작. 리드 `claude-opus-5-5` |
| 독립 CLI `claude` | **설정·인증 필요** | `claude --version` = 2.1.280, `claude auth status` → `loggedIn:false, authMethod:none`. CLI 로 팀을 돌리려면 새 계정으로 로그인부터 |
| Supabase MCP(프로젝트 `idsxiqspecrucvfvtgbw`) | 기능 실행 확인 | `execute_sql` 읽기·리허설·적용 모두 사용. **`supabase db push`·브랜치 금지**(CLAUDE.md) |
| GitHub `gh` | 기능 실행 확인 | PR 생성·병합·CI 로그 조회 |
| Vercel | 연결 확인 | main 푸시 → CI 통과 후 배포("Wait for CI"). 반영 확인은 **운영 번들 문자열**로(§9) |
| 작업트리 `node_modules` | **비어 있음** | 작업트리 안 빌드·E2E 불가. 팀원들은 scratchpad 격리 사본 + main 체크아웃 node_modules 정션으로 빌드했다(§10 `hf\rebuild.sh`) |
| 작업트리 `.env.local` | 없음 | vitest 는 돌지만 로컬 빌드는 목(IS_MOCK) — 기억 `project_worktree_builds_are_mock.md` |
| main 체크아웃 | **오너 미커밋 변경 다수** | `.claude/agents/*`·`.claude/rules/*`(09-23 개편판), `.codex/config.toml`, `public/sw.js`, `src/**` 25개(09-28 멈춘 세션분 — 이미 작업트리로 옮겨 PR #25 로 배포됨, **중복 사본**). 덮어쓰지 말 것. 정리는 오너 확인 후 |

- 쓸 수 있는 스킬(이 저장소): `nuri-migration`(DB 전) · `nuri-e2e`(sitemap 백업→빌드→복원→해시) · `nuri-verify` · `nuri-single-source` · `nuri-async-guard` · `nuri-time` · `nuri-ship` · `click-path-audit` · `browser-qa` · `frontend-a11y` · `capability-router`. 본문은 `.claude/skills/<이름>/SKILL.md`.
- 🔴 `npm run build`·`npm run test:e2e` 는 오너 보호 파일 `public/sitemap.xml` 을 덮어쓴다 — 해시 대조 절차 필수. 이번 세션 기준 해시(작업트리) `5b5953aa…`.

---

## 2. 새 팀 구성 (2026-09-29 개편 — Sonnet 5.5 편입)

오너: "금일자로 Sonnet 5.5 가 생겼다 — 포함해서 팀을 새로 짜라. **Fable 사용량과 나머지의 비율이 지금 제일 좋다.**"

- **바뀐 것은 Sonnet 자리뿐이다.** `claude-sonnet-5` → `claude-sonnet-5-5` (verifier 기본값, "원인이 확정된 일반 구현" 행, home/community 의 "명확한 비시각 작업만 별도 Sonnet" 문구).
- Opus 5.5 배정, Fable 조건(정본 §3 — 리드만·조건부·개편/인벤토리 0회), Haiku 수집 역할은 **그대로**(비율 유지).
- **실측 근거**: 별칭 `sonnet` 으로 만든 하위 에이전트의 세션 로그에 `"model":"claude-sonnet-5-5"` (2026-09-29).
  반면 정의에 `claude-sonnet-5` 를 직접 적은 역할은 계속 Sonnet 5 로 돌았다 → 정의의 ID 를 바꿔야 반영된다.
- 파일: 브랜치 `NURI/handoff-20260929` 의 `.claude/rules/nuri-team-capabilities.md` 와 `.claude/agents/{verifier,home-team,community-team}.md`
  (나머지 8개 정의는 main 체크아웃의 09-23 판과 같다 — 이 브랜치에 함께 들어 있다).
  ⚠ main 체크아웃에는 같은 파일의 **09-23 판이 미커밋**으로 있다. 이 브랜치를 병합할 때 그 미커밋 변경과 충돌한다 —
  오너 확인 후 main 쪽 미커밋본을 이 브랜치 판으로 교체하라(내용은 09-23 판 + Sonnet 5.5 치환 + 머리말뿐).
- 정의를 바꿔도 **이미 실행 중인 팀원은 안 바뀐다**. 새 세션에서 새로 생성해야 한다(기억 `project_agent_model_not_hot_reloaded.md`).

| 역할 | 기본 모델(개편 후) | effort |
|---|---|---|
| nuri-lead | claude-opus-5-5 | medium |
| Explore · capability-steward | claude-haiku-4-5-20251001 | (없음) |
| home-team · community-team | claude-opus-5-5 | high (비시각 정형 작업만 Sonnet 5.5/medium 으로 따로) |
| store-team · gto-team | claude-opus-5-5 | medium |
| design-reviewer · root-cause-debugger · critical-reviewer | claude-opus-5-5 | high |
| verifier | **claude-sonnet-5-5** | medium |
| (조건부) 중대 미해결 쟁점 | claude-fable-5-1 | 리드만 |

---

## 3. Git·배포 상태

| 대상 | 커밋 | 상태 |
|---|---|---|
| main | `06f671eb` (PR #28 병합) | **운영 배포 확인**(index-ddFK4b4h, 2026-09-29) |
| PR #25 | `44d6fe10` | 병합·배포 완료 — 장부 애드온 행 + 내 매장 결함(영업일·얼리 기준·클락 서버시각·전환 경합·재연결) |
| PR #28 | `06f671eb` | 병합·배포 완료 — PC 매장 F1~F7 + 모바일 D1~D8 + server_now + e2e 약관 동의 목(_fixtures 경계) |
| **PR #29** | `ed09bbf8` | **열림, CI e2e(1) 1건 실패**(§0-2). 내용 아래 |
| `NURI/wip-handoff-20260929` | `bd77e539` | 중단 작업 보관(미검증) |
| `NURI/handoff-20260929` | (이 문서 커밋) | 인수인계서 + 새 팀 구성 + 보고서 사본 |

PR #29 커밋(오래된 것부터): `69a7b81b` 하단 탭 주석(D7) · `4f8d80b4` 관리자 배너 목록=홈 캐러셀(homeCarouselPlan) ·
`08ad5968` 계정 메뉴 '내 매장' 입구 · `98b7e55c` 이용권 시트 fillHeight · `8241385d` 홈 첫 줄 '프로처럼 치는 무료 GTO N개'(전원) +
20260929a 파일 · `ed09bbf8` 대회 예약 로그인만(본인인증 제거).

---

## 4. 운영 DB 에 적용한 것 (모두 라이브 적용 완료 — 파일 머리에 실측 기록)

| 파일 | 내용 | 검증 |
|---|---|---|
| `20260928f_closed_ledger_allow_poster_delete.sql` | 마감 장부 연결 포스터 삭제 허용(마감 장부 수정 차단 유지) | 리허설 |
| `20260928g_ledger_addon_payment.sql` | 애드온 칸 4개 + 서버가 금액 스냅샷하는 트리거 | R1·R2·R3·R6 PASS, 기존 행 소급 0 |
| `20260928h_server_now.sql` | `server_now()` 읽기 RPC(anon 허용) — 클락 서버 시각 보정이 404 로 꺼져 있던 것 | anon REST 200 |
| `20260929a_reservation_message_no_identity.sql` | 대회 예약·쪽지 본인인증 해제 + 쪽지 INSERT 정책 결함 수정(`_can_message` DEFINER) | 미인증 쪽지·예약 OK, 위조·자기·차단 42501, anon 실행권 false |
| **`20260929b_clock_atomic_stats.sql`** | **⏸ 초안 — 적용 안 됨.** 클락 K1 원자 ±RPC(WIP 브랜치에만 있음) | 미검증. 리드가 nuri-migration 절차로 리허설 후 적용 판단 |

운영 **데이터** 변경(오너 지시):
- `lj0327@naver.com`(닉네임 lj0327) → `role=admin`. 본인인증 미완료 상태.
- 관리자 '나누리' 시험 글 3개(`ㅇ`·`ㅎㅇ`·`d`) → `blinded=true`(되돌리기 가능, 삭제 아님).
- 'E2E검증업주' → `shadowbanned=true`(순위 제외, 되돌리기 가능).
- 더미 대회(누리 테스트 홀덤펍 · '[더미 2026-09-26 레이아웃 확인용]')·더미 계정 '도토리' 글 → **오너 지시로 보존**.
- main 체크아웃의 미추적 `postcss.config.js` → 삭제(사본: 이 세션 scratchpad `postcss.config.js.bak`).

---

## 5. 오너 결정 기록 (이 세션, 2026-09-28~29)

| 주제 | 결정 |
|---|---|
| 장부 애드온 | 결제 선택 칸 **맨 아래**(구현은 가려짐 문제로 수단 격자 바로 밑). **취소 비밀번호 없이** 수정·삭제 |
| 세로 TV | **없다 — 점검·수정 모두 제외**(K7 취소) |
| 하단 탭 복귀 | **항상 맨 위로**(D7). 뒤로가기일 때만 떠난 자리 복원 |
| 본인인증 범위 | **필요한 곳: 매장이용권 수령·사용, 이벤트 참여(무조건)**. 글쓰기·대회 예약·쪽지는 불필요. 한 번 인증하면 법적 재인증 외에는 다시 묻지 않음(서버는 이미 만료 없음) |
| 위쪽 본인인증 안내 띠 | **유지** |
| 작은 글씨(D6 루트 폰트) | 리드 판단 — **현상 유지**(루트 17px 변경은 전 화면 위험 대비 효과 미미) |
| 홈 첫 줄 | "프로처럼 치는 무료 GTO N개 ›" **모든 유저**, 개인화 문장 제거, 강조 |
| 시험 데이터 | 더미 대회는 **보존**, 나머지(시험 글·E2E 계정 노출·postcss 잔재) 정리 |
| 이용권 흐름 | '회수' 개념 없음. 손님 QR 로 3T 보내면 실시간 매장이용권 탭에 **"3T 사용 · 이름 · 시간"**, 애드온 5T 면 장부 "5T 애드온" + 실시간 5T 사용 |
| **이용권 용어** | 손님→매장 = **"사용"**, 매장→손님 = **"전송"**. 전 화면 통일(약관·법적 고지 문서는 제외 — 개정 절차 필요). 업주의 '일괄 회수'(잘못 보낸 것 되돌리기) **기능은 유지**(오너 추가 지시 없으면) |
| 관리자 계정 생성 | 리드가 대신 가입·본인인증 **불가**(운영 도메인 계정 생성·비밀번호 입력 금지, 본인인증은 명의자 휴대폰 필요). 오너가 가입 → 리드가 role 격상 |

---

## 6. 🔴 중단된 작업 — 어디까지 됐고 무엇이 남았나

모든 편집은 **미커밋 → `NURI/wip-handoff-20260929`(bd77e539)** 에 보관. 중단 시점 전체 상태:
`npx tsc -p tsconfig.app.json --noEmit` **오류 0**, `npx vitest run` **344 파일 / 3878 통과 / 6 skip / 실패 0** (2026-09-29 실측).
⚠ 통과는 "깨지지 않았다" 일 뿐 **각 결함이 고쳐졌다는 증거가 아니다** — 결함별 전/후 측정·음성 대조는 **아직 안 됐다**.

### 6-A. 클락 결함 K1~K12 수정 (store-team, Opus) — 중단: "기준(before) 세트 실행 중"
원인 보고서: `docs/handoff-2026-09-29/clock-deep.md` · 하네스: 이 세션 scratchpad `ck\specs\`(t0~t5·t1b, harness.ts, build.sh)
편집된 파일(WIP):
`src/api/clock.ts`(+195/−) · `src/api/clock.{cas,earlyFloor,remoteStats,saver}.test.ts` · 신규 `src/api/clock.deep0929.test.ts` ·
`src/components/features/clock/{ClockDisplay,ClockRemote,ClockStage,TournamentClock}.tsx` · `clock/remoteContract.test.ts` ·
`src/lib/{clockLevel,serverTime}.ts` + 테스트 · 신규 `src/lib/{clockTick,useServerTimeReady}.ts` ·
`src/components/features/{NuriPosLedger,StoreDashboard}.tsx` · `src/App.tsx`(K10 regNow=serverNow) · `src/lib/homeRail.ts`(K10) ·
`src/components/features/VenueManageTab.tsx`(K9 formatCountdown) · `homeLiveFreshness.contract.test.ts`(K10 단언) ·
신규 마이그레이션 초안 `supabase/migrations/20260929b_clock_atomic_stats.sql`(**미적용**).

| 결함 | 내용(보고서 수치) | 중단 시점 추정 |
|---|---|---|
| K1 (높음, 재발 7회) | 동시·잠든 기기의 탈락/엔트리 소실, TV 인원 굳음(참값 10/11 → TV 9/10, 35초 뒤도) | 코드+마이그레이션 초안 작성됨. **서버 RPC 미적용 → 동작 미검증** |
| K2 (높음) | 서버 시각 측정 전/실패 뒤 5분 빠른 PC 가 레벨 ~149초 일찍 넘김 | serverTime·useServerTimeReady 작성됨, 전/후 측정 안 됨 |
| K3 · K5 (중간) | 대시보드만 열려 있으면 TV 인원 멈춤 · 장부 연동 리모컨 인원 고정 | K1 묶음 |
| K4 (중간) | 클락 vs 장부 얼리·총칩 불일치(얼리 8/240,000 vs 0/200,000) | 불명 — diff 로 확인 필요 |
| K6 (중간) | 폰 리모컨만 쓸 때 대시보드 레벨1·TV 레벨2, [이전 레벨] 불가 | ClockRemote 변경 있음, 미검증 |
| **K7** | 세로 TV 상금표 없음 | **오너 결정으로 제외** — 변경 없음 확인(ClockStage diff 는 K9 뿐) |
| K8 | 켤 때 첫 ~1초 기기 시계 표시 | K2 와 함께 |
| K9 | 화면마다 초 최대 1초 어긋남 | 공용 틱 `clockTick`·`formatCountdown/formatElapsed` 로 교체됨 |
| K10 | 홈 카드 마감 시간이 기기 시계 | App.tsx·homeRail serverNow 로 교체됨 |
| K11 · K12 | 장부 클락 바 창 복귀 재조회 · PC 레벨 ± 기준 | 불명 |

**재개 방법**: store-team(Opus) 한 명에게 WIP diff 를 읽혀 항목별로 "완료/부분/미착수"를 먼저 판정 → 하네스로 **수정 전 코드(ed09bbf8) FAIL / WIP PASS** 전후 측정 →
20260929b 는 리드가 `nuri-migration` 절차(begin…rollback 리허설: 동시 ±2건 모두 반영 · 권한 양성/음성 · 기존 행 불변)로 적용 판단 → 적용 전에는 클라가 새 RPC 없을 때 오류를 보이게.

### 6-B. 커뮤니티 결함 C-1~C-12 (community-team, Sonnet 5) — 중단: "전체 하네스 재실행 직전"
원인 보고서: `docs/handoff-2026-09-29/community-deep.md` · 하네스: scratchpad `cm\*.cjs`(social·paging2 등)
편집된 파일(WIP): `src/components/features/{CommunityTab,CommunityShoutBar,DealerCommunity,GroupPage,PostDetailModal}.tsx` ·
`src/api/{community,reports}.ts` · `src/api/community.searchPosts.test.ts`(C-12 stubEnv — **이제 통과**) ·
신규 `src/api/{_gateError.ts, community.gateError.test.ts}` · 신규 `src/lib/{mergeLiveMessages,postVisible}.ts` + 테스트.

| 결함 | 내용 | 상태 |
|---|---|---|
| C-1 (중상) | 차단한 사람 글이 목록 끝·검색에 재등장(48번째) | postVisible 헬퍼 작성됨, 전/후 측정 미완 |
| C-2 (중상) | 무한 스크롤 30건에서 정지(IntersectionObserver deps) | 코드 변경됨, 미측정 |
| C-3 | 실시간 한 줄·딜러·그룹·외치기에 차단 누수 | 부분(GroupPage·ShoutBar 수정) |
| C-4 | 서버 사유(12초·제재·금칙어)가 '실패했습니다'로 뭉개짐 | _gateError 작성됨 |
| C-5 | 좋아요 연타 화면/서버 어긋남 | **미착수 — `App.tsx` handleLikePost(공용 파일)** |
| C-6 | PC 두 칸 이전 작성자 닉네임 색 | 미확인 |
| C-7 | 딜러 목록 실패를 '글이 없습니다'로 위장 | DealerCommunity 수정됨 |
| C-8~C-10 | 섹션 왕복 재조회 · 헤더 접힘 탭 39px · 탭 aria/포커스 | 미확인 |
| C-11 | 쪽지 실패 문구가 '본인인증' 언급 | **미착수 — `NotificationPanel.tsx`(home 소유)** |
| C-12 | searchPosts 테스트 5건(제품 결함 아님) | **완료**(vitest 통과) |
| A1(추가) | 외치기 시트 윗변 95.5px(390) | 지시만 전달, 상태 불명 |

### 6-C. 모션 결함 수정 (home-team, Sonnet 5) — 중단: 진행 로그 없음
원인 보고서: `docs/handoff-2026-09-29/bounce-sweep.md` · 하네스: scratchpad `bs\`
편집된 파일(WIP): `src/components/features/{ToolsPanel,CalendarToolsPanel,StoreToolsPanel,SupportInquiryModal,CustomerDashboardPage,MyVoucherSheet,VoucherWallet}.tsx` ·
`src/components/features/tools/OutsCalc.tsx`

| 결함 | 내용(실측) | 상태 |
|---|---|---|
| M1 (P2) | GTO 도구 닫을 때 검은 프레임(밝기 24.6→7.9→31.2) — 닫힘 중 내용 비움 | 3개 패널 수정됨, 미측정 |
| A4 (P2) | 고객센터 1:1 문의 시트 윗변 211px | 변경됨(2줄), 미측정 |
| 이용권 시트 내부 67px · 내 정보 '내 업적' 74px · GTO 아웃츠 lazy 429px | P3 | 변경됨, 미측정 |

### 6-D. 조사(읽기 전용) 3건 — 중단, 보고서 없음
| 조사 | 담당 | 중단 시점 | 재개 |
|---|---|---|---|
| 모든 이동·버튼 전수(click-path) | design-reviewer | 사용자 모바일 크롤 시작 직전. 하네스 scratchpad `cp\`(scen·crawl·notiflinks·sum) | `.claude/skills/click-path-audit/SKILL.md` 로 처음부터(인벤토리→CDP 터치→목적지 대조→뒤로가기) |
| 화면 열 때 멈칫 원인(성능 trace) | root-cause-debugger | 빌드 준비 중. scratchpad `st\` | 일정 상세·매장 페이지·GTO 도구 CPU×4 432~704ms Long Task 특정 |
| GTO 전체 재점검(22개 도구 + SPOT) | gto-team | 진행 로그 없음. scratchpad `gt\` | 계산 정확도(독립 기준값)·입력 경계·화면·드릴 — §8 에 포함 |

---

## 7. 🔜 미착수 대기열 (우선순위 순)

| # | 일 | 담당(모델) | 근거 |
|---|---|---|---|
| 1 | PR #29 e2e admin-exposure 셀렉터 → 병합·배포 | home-team(Sonnet 5.5) | §0-2 |
| 2 | 6-A 클락 마무리 + 20260929b 리허설·적용 | store-team(Opus) + 리드 | clock-deep.md |
| 3 | **이용권 용어 통일 '사용/전송'** + '오늘 사용' 숫자 한 벌(바인+애드온) + 실시간 탭 행에 이름·시간·T·용도(바인/애드온) + 장부 "5T 애드온" | store-team(Opus) | §5, store-deep.md D2·D3 |
| 4 | 내 매장 D1(통계 '당일'=영업일) · D5(행 합계 nowrap) · D7(390 고정 열 54%) · D8(재조회 실패 삼킴) · D9(일괄 회수 중복 사유) | store-team(Sonnet 5.5, D7 은 design 판정) | store-deep.md |
| 5 | M2 `index.css:2111` reduced-motion 목록에 `.animate-sheet-up` 추가(모든 바텀시트 검은 프레임, 운영 재현) | home-team | bounce-sweep.md M2 |
| 6 | A2 딜러 로테이션·급여(263px) · A3 단골 관리(232px) 시트 fillHeight + 딜러 로딩 중 '이번 달 없음' 위장 | store-team | bounce-sweep.md |
| 7 | D6 내 매장 사이드바 첫 방문 밀림 — 직원 관리 +730px(`VenueManageTab.tsx:2526-2527,2846,2894` 로딩 상태 없음) · 매출 87px(`LedgerStatsPanel.tsx:308-316` 필터 카드 누락) | store-team | bounce-sweep.md D6 |
| 8 | D4 연속 바인 되돌리기 토스트 누적 CLS(`Toast.tsx:86`) | home-team(공용) | store-deep.md |
| 9 | 6-B 커뮤니티 마무리 + C-5(App.tsx) + C-11(NotificationPanel) | community-team / home-team | community-deep.md |
| 10 | 6-C 모션 마무리 | home-team | bounce-sweep.md |
| 11 | 멈칫(Long Task) 원인 → 수정 | root-cause-debugger → 담당 | 6-D |
| 12 | 라이브 탭 카드의 버튼-안-버튼(D2 잔여) · 관리자 배너 줄 390 제목 '로…' 잘림 | home-team | audit-mobile.md, banner-fix-report.md |
| 13 | e2e R3 `mobile-tab-transition.spec.ts:368` 상한 여유 0(707/700ms) 플레이크 — 측정 근거로 기준 재산정 | root-cause-debugger | main CI 36475274740 |
| 14 | `App.tsx` 가 HomeTab 에 넘기는 `visitedVenues`/`myTodayRes` 죽은 prop 정리 | home-team | gto-hook-report.md |
| 15 | 번들 예산 여유 0~1%(첫 화면 265.9/267 · VenueManageTab 118.1/119 · JS 1011/1014) — **상한 올리지 말고 줄일 것** | 리드 판단 | bundle-budget.json |

---

## 8. 최종 전체 점검 (모든 수정 병합·배포 후) — 오너 지정 범위

오너: "다 끝나고 한번 더 검사해 — 지금보다 더 깊고 더 자세하고 더 모든 것을", "사이트의 **모든 기능 및 연동, 등록, 로그인 로그아웃, 프로필 등 전 메뉴 및 모든 콘텐츠**, GTO 쪽도".

| 축 | 범위 |
|---|---|
| 폭 | 360·375·390·412·768·1024·1280·1440·1920 (**세로 TV 제외**) |
| 테마 | 다크·라이트 |
| 계정 | 비로그인·일반·본인인증 회원·업주·직원(장부 권한 유/무)·관리자·제재 계정 (전부 목 세션 — 운영 쓰기 0) |
| 네트워크 | 빠름·3G·끊김→재연결·응답 순서 역전 |
| CPU | ×1·×4·×6 |
| 반복 | 5회 중앙값 |
| 기능 | 가입·로그인·로그아웃·동의·본인인증 게이트 범위(§5)·프로필·내 정보 전 하위 탭·알림·쪽지·홈·일정·캘린더·라이브·커뮤니티 전 섹션·장터·그룹·딜러·이벤트·매장 페이지·내 매장 전 단계(포스터→장부→클락→순위→정산·통계·이용권·직원·설정)·클락 TV/리모컨(가로만)·관리자 전 탭·GTO 22개+SPOT·드릴·용어집 |
| 연동 | 포스터→일정→장부→클락→TV, 바인 QR→실시간 이용권 탭→장부, SPOT 저장→커뮤니티, 알림 링크 각 종류, 딥링크 |
| 서버 | 역할별 RPC·RLS 양성/음성 대조(begin…rollback), 금액·수량 불변식 |
| 법적 표시 | 사업자 정보 전 화면 · 만 19세 · 1336 |
| 재발 | 이번에 고친 결함 전부 재측정 |

독립 검토자별로 나누고(design-reviewer: 모션·튐 / click-path / root-cause: 성능·경합 / critical: 권한·금액 / gto-team: 계산), 결과는 한 문서로. **실기기(S26·아이폰)·실제 매장 TV 는 NOT_RUN** — 오너 확인 목록으로 따로.

---

## 9. 배포 반영 확인법 (Vercel 이 옛 빌드에 머무는 함정 대비)

```bash
curl -s "https://nuriholdem.com/?v=$RANDOM" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1
```
index 파일명이 바뀌었는지 + 그 번들(또는 참조 청크)에 이번 변경의 고유 문자열이 있는지로 판정한다(예: `schedule-venue-link`, `프로처럼 치는`).
main CI 가 실패하면 배포되지 않는다 — `gh run list --branch main --limit 3`. 흔들리는 조각은 `gh run rerun <id> --failed`.

---

## 10. 보고서 사본 (원문은 세션 scratchpad — 임시 폴더라 지워질 수 있어 복사해 둠)

`docs/handoff-2026-09-29/` 에 복사: `clock-deep.md` · `community-deep.md` · `store-deep.md` · `bounce-sweep.md` · `audit-mobile.md` ·
`audit-pc-store.md` · `voucher-bounce-report.md` · `voucher-fix-report.md` · `staff-admin-report.md` · `home-fix-report.md` ·
`store-fix-report.md` · `store-addon-report.md` · `banner-fix-report.md` · `gto-hook-report.md` · `verifier-*.md`.

하네스(스크립트·격리 사본, 수 GB 가능)는 복사하지 않았다. 원래 위치:
`C:\Users\buffy\AppData\Local\Temp\claude\C--Users-buffy-OneDrive-------------claude-worktrees-pos-system-defect-fixes-938532\b6c90ef6-e627-4740-b331-0350f0a3a7a2\scratchpad\`
(`ck` 클락 · `cm` 커뮤니티 · `sd` 내 매장 · `bs` 모션 · `vb` 이용권 시트 · `cp` 클릭패스 · `hf` 빌드 스크립트 `rebuild.sh` · `m928` 모바일 · `pc` PC 매장 · `gt` GTO · `st` trace).
지워졌으면 보고서의 재현 절차로 다시 만든다.

---

## 11. 이 세션에서 확인된 함정 (다음 세션이 같은 곳에서 넘어지지 않게)

1. **날짜가 지나면 E2E 가 빨개진다** — 09-29 개정 약관 시행으로 가짜 로그인 목의 재동의 게이트가 탭을 가렸다. `e2e/_fixtures.ts` 가 `page.route` 를 감싸 profiles 목에 `consented_legal_version` 이 **없을 때만** 2 를 채운다. `_fixtures` 를 안 거치는 스펙(`post-detail-read`)은 직접 넣었다. 다음 약관 개정 때 버전을 올려라.
2. **RLS 정책 안의 EXISTS 는 호출자 권한으로 남의 행을 못 본다** — 쪽지가 출시 후 0건이었다. 정책 리허설은 **양성 대조** 필수. (리드 기억 `project_rls_subquery_invisible_rows.md`)
3. **`gh pr merge --auto`** 는 필수 검사가 없는 저장소에서 **즉시 병합**한다(PR #28 이 CI 중 병합됨 — 다행히 이미 통과). CI 확인 후 수동 병합하라.
4. **작업트리 빌드**: node_modules 가 비어 있어 `npx vite build` 가 전역 npx 캐시의 다른 vite 로 샌다. 격리 사본 + main node_modules 정션(`hf\rebuild.sh`)을 써라. autoprefixer 는 설치돼 있지 않다(Tailwind v4 는 불필요).
5. **`tsc -p .` 는 아무것도 검사하지 않는다**(루트 tsconfig `files: []`). `tsconfig.app.json`·`tsconfig.e2e.json` 으로.
6. **Git Bash `sed -i` 는 CRLF 파일을 LF 로 통째 바꾼다** — 여러 줄 편집은 Edit 도구나 줄끝을 보존하는 node 스크립트로.
7. **E2E 는 운영 데이터를 읽는다** — 코드 변경 없이 빨개지면 데이터 변경부터 의심(더미 대회·배너).
8. **팀원 보고는 파일로** — 결과가 길면 scratchpad 보고서 경로로 받고, 스스로 말한 모델명·PASS 는 diff·로그로 대조.

---

## 12. 재개 체크리스트 (복사해서 쓰기)

- [ ] `claude auth status` 로 새 계정 로그인 확인(CLI 쓸 경우), 데스크톱 앱이면 `/model` 로 Opus 5.5·Sonnet 5.5 노출 확인
- [ ] 작업트리 `git status --short` = 46개(§6) 또는 `NURI/wip-handoff-20260929` 체크아웃
- [ ] `NURI/handoff-20260929` 의 팀 구성 적용(오너 확인 후 main 미커밋본 교체)
- [ ] PR #29 셀렉터 수정 → CI → 병합 → §9 로 반영 확인
- [ ] §6-A → 6-B → 6-C 순서로 "diff 판정 → 전/후 측정 → verifier → 커밋"
- [ ] §7 대기열
- [ ] §8 최종 전체 점검 → 결과 문서 링크를 오너에게
- [ ] `docs/HANDOFF.md` 에 이 문서 링크 절 추가
