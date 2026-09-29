# home-team 수정 보고 — 모바일 점검 D1·D2·D3·D4·D5·D6·D8 + 참가비 gameType 표시

- 요구 키: 오너 채팅 2026-09-28 "전체 제대로 잘 되는지" → `scratchpad/audit-mobile.md#D1~D8`(D7 제외) + 같은 문서 '발견 2'(참가비 "300,000 · gtd")
- 작업 위치: `.claude/worktrees/pos-system-defect-fixes-938532` (HEAD abe47223 위 미커밋 변경 · 커밋 안 함)
- 측정 방식: **A/B 격리 빌드** — 수정본 `scratchpad/hf/wt` → `vite preview :4193`, HEAD 원본(`git archive HEAD src index.html`) `scratchpad/hf/base` → `:4194`. 두 빌드 모두 운영 Supabase 를 읽기만 한다(쓰기형 RPC 204·테이블 쓰기 403 차단 — `hf/m/common.cjs`).
  하네스: `scratchpad/hf/m/` (cls.cjs · clsd.cjs · d2.cjs · hits.cjs · rankfade.cjs · cfirst.cjs · d6.cjs · hdrsweep2.cjs · probe.cjs), 원자료 `before-*.txt`·`after-*.txt`·`shots/`.
- 🔴 `public/sitemap.xml` 해시 5b5953aa… — 작업 전후 동일(워크트리에서 빌드·`npm run test:e2e` 를 돌리지 않았다).

## 결함별 전/후

| 결함 | 전(HEAD :4194) | 후(수정 :4193) | 판정 |
|---|---|---|---|
| D1 `?tab=browse` CLS (390, 중앙값 3회) | **0.7678** (푸터 y776 → 화면 밖, 목록 +38px) | **0.0001** | PASS |
| D1 `?tab=calendar` CLS | **0.2703** (푸터 765 → 364) | **0.0000** | PASS |
| (대조) home / live / community / tools | 0.0061 / – / 0.0672 / – | 0.0061 / 0.0097 / 0.0672 / 0.0537 | 변화 없음 |
| D2 카드 기하 중심에 떨어지는 요소 (home·browse × 390·360) | 매장 버튼 글자(`SPAN IN-VENUE-BTN`, 버튼 x 93~227) · 카드 안 중첩 버튼 있음 | 카드 자신(`in-card`) · 중첩 0 · 매장 버튼 56×56 (x 31~87) | PASS |
| D2 카드 가운데 CDP 터치(110ms) → (home 390) | 매장 페이지 열림 | 대회 상세 열림 | PASS |
| D3 참가 신청 / 찜 / 공유 링크 누름 높이 | 40.8 / 36 / 36 | 44 / 44 / 44 | PASS |
| D4 헤더 '홈으로' (390 / 360) | 81×30 / 26×26 | 81×45 / 45×45 | PASS |
| D4 헤더 테마·알림 폭 | 40 / 40 | 44 / 45 | PASS |
| D4 일정 탐색 검색·지역·등급·예산·GTD·MTT·대회 | 39×39 · 68×38 ×3 · 38~39 높이 | 44×46 · 68×44 ×3 · 46 높이 | PASS |
| D4 공지사항 / 지난 대회 행 | 34 / 40 | 44 / 44 | PASS |
| D4 라이브 빈 상태 '대회 일정 보기' | 상자 42.5 | 44 | PASS |
| D4 캘린더 '로그인하기' / GTO '도구 검색' / GTO '전체' 폭 | 43 / 42 / 40 | 44 / 44 / 44 | PASS |
| D4 매장 페이지 하위 탭 / CoachMark '확인' | 상자 42.5 / 34 | 44 / 44 | PASS |
| D5 순위 레일 390·360 처음 | 가림 2칸('순위 인증'·'상점'), 흐림 없음 | 같은 2칸 + 오른쪽 흐림(scroll-fade-r) | PASS |
| D5 레일 끝까지 민 뒤 | 흐림 없음, 왼쪽 '입상'이 '상'으로 잘림 | 오른쪽 흐림 해제 · 왼쪽 흐림(scroll-fade-l) | PASS |
| D8 커뮤니티 첫 방문(y=221) 장터·게시판·순위·딜러 | 판 윗변 −34 vs 레일 밑변 87 (**121px 가림**) | 판 윗변 91 ≥ 레일 87 (scrollY 221 → 96) | PASS |
| D6 홈 날짜 띠 글자 (루트 17px) | 11px / 9px | 11px / 9px (디자인 불변) | PASS |
| D6 루트를 20px 로 바꿨을 때 | 11 / 9 (안 따라감) | 12.94 / 10.59 (따라감) | PASS |
| 참가비 줄 | "30,000 · entry" | "30,000 · 엔트리 게임" (gtd → "GTD (보장)") | PASS |

## 무엇을 바꿨나 (diff 요약 — 20파일 +179/−69, 신규 2)

- **D1** `src/App.tsx` 일정 탐색 판에 `.pane-reserve`(LazyFallback 과 같은 한 화면 예약) + 로딩 중에도 '대회 N' 줄을 `invisible` 로 세워 38px 예약. `CalendarPanel.tsx` 비로그인 카드에 `.pane-reserve`.
- **D2** `ScheduleCard.tsx` TimetableCard: 매장 이동 버튼을 카드(article)의 **형제**로 옮겨 로고(56×56) 위에 겹침(`data-testid="schedule-venue-link"`, 접근 이름 "{매장명} 매장 페이지"). 카드 안 매장명 줄은 글자. 래퍼 `div[data-card-cell]`. → `HomeTab.tsx` `HOME_LIST_GRID` 선택자 `&>article` → `&>[data-card-cell]`, `homeDensity.contract.test.ts` 동기화. **매장 이동 기능 보존**: 로고 탭 + 상세 안 매장명 링크.
- **D3** `ScheduleDetailModal.tsx` 찜·공유 링크·꾹 눌러 참가 신청 `min-h-[44px]`.
- **D4** `IntegratedSearchBar.tsx` 칩 `tap-44`(위로만) · select 가 자기 누름면을 위로 넓힘 · 검색 칩 `before:-left-[6.75px]`. `App.tsx` 헤더: 로고 `min-h-[44px]`+의사요소 가로 확장, 테마·알림·이용권 `before:-left-[5.75px]`, 알림·이용권 `ml-[3.625px]`, 아바타 46.75→44px, **워드마크 접힘 문턱 372→376**, 공지 머리 줄 44px. `PastTournaments`·`LiveGamesTab`·`CalendarPanel`·`ToolsPanel`(입력칸 44 · 레인 칩 min-w 44)·`VenuePage` 탭 `min-h-[44px]` · `atoms/CoachMark` '확인' 의사요소 ±5px.
- **D5** `TierLeaderboard.tsx` 레일 스크롤 위치에 따라 `scroll-fade-r|l|x` (ResizeObserver 로 숨김→표시 전환도 잰다). `index.css` 에 `.scroll-fade-l`·`.scroll-fade-x` 추가.
- **D6** `HomeTab.tsx` 날짜 띠, `ScheduleCard.tsx` Metric 라벨·값: `text-[9px]` 등 → `text-[calc(9rem/17)]` (루트 17px 에서 같은 크기).
- **D8** `CommunityTab.tsx` 첫 방문 분기에서 판 윗변이 레일 밑으로 말려 있으면 레일 바로 밑까지만 올림(0 으로 튕기지 않음 — UI-06 의도 유지).
- **gameType** 신규 `src/lib/gameTypeLabel.ts`(+test) — `gtd`/`entry` 만 장부 버튼과 같은 말('GTD (보장)'·'엔트리 게임')로, 자유 입력은 그대로. 상세 참가비 줄 · GridCard 메타 줄에 적용.
- e2e 셀렉터(같은 변경): `schedule-card-touch`(D2 새 테스트 2종 추가: 카드 가운데 → 상세 · 중첩 0 / 로고 → 매장 ≥44), `schedule-card-fit`(매장 버튼 위치·44·카드 중심 침범), `schedule-card-clicks`, `connectivity-chain` H2, `mobile-tab-transition` R2 — 전부 **접근 이름**(`getByRole(name)`)으로 대상 확인.

## 명령 · 종료 코드

| 명령 | 결과 |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 0 |
| `npx tsc -p tsconfig.e2e.json --noEmit` | 0 |
| `npx vitest run` | 3823 통과 · **5 실패 = community.searchPosts(원래 실패)** · 339 파일 중 1 실패 |
| `npm run lint` | 0 (오류 0 · 경고 2515) |
| `node scripts/bundle-budget.mjs` (격리 빌드) | 통과 — 첫 화면 265.5→**266**/267 KB · CSS 33.7→**33.9**/34 · 최대 청크 118.1/119 · JS 합계 1009.1→**1009.8**/1014 (여유 0~1%, 넘은 항목 없음) |
| e2e 전체 `E2E_BASE_URL=:4193 npx playwright test --workers=4` | 921 통과 · 36 skip · 37 실패 → 그중 **내 변경 2건**(schedule-card-clicks:112, mobile-tab-transition R2 — 옛 셀렉터 `card.locator('button').first()`) 고친 뒤 재실행 통과. 나머지 **35건은 HEAD 빌드(:4194)에서도 같은 테스트가 실패**(가짜 로그인 세션 계열 timeout — account-isolation·aura-led·voucher-sheet-open·store-destination 등, 재확인 실행 기록 있음) |
| 영향 스펙 재실행 `schedule-card-touch/fit/clicks`·`connectivity-chain`·`mobile-tab-transition` | 52 + 21 + 2 통과 |
| 음성 대조: 새 D2 테스트를 HEAD(:4194)로 | **FAIL**(중첩 버튼 있음 · 로고 버튼 없음) — 수정 빌드에서 PASS |

## 남는 것 / 리드 판단 필요

1. **워드마크 문턱 372→376 (디자인 변화)**: 헤더 버튼 누름 폭을 44로 넓히며 로그인 클러스터가 +4.5px. 종전 로그인 '일정 탐색' 여유가 373px 에서 +0.86px 뿐이라, 373~376px(iPhone mini·SE 375)에서 **워드마크가 접힌다**. 로그인 상태는 하네스로 못 재서 **비로그인 실측 + 폭 차 계산**이다(NOT_RUN: 로그인 실측). 원치 않으면 헤더 폭 확장 3줄만 되돌리면 된다(높이 44는 유지됨). '관리자 설정'(관리자 전용)은 HEAD 에서도 373~383px 에서 잘려 있었다(범위 밖 기록).
2. **D2 발견성**: 카드의 매장명 점선 밑줄이 사라졌다(이제 글자). 매장 이동은 로고 탭(누름면 56) + 상세의 매장명 링크. 로고에 시각 단서가 필요한지는 디자인 판단(NOT_RUN).
3. **D6 한계**: `html { font-size: 17px }` 고정이라 사용자의 브라우저 글자 크기 설정은 rem 에도 전달되지 않는다. 이번 변경은 "루트를 따르는 단위"까지다. 루트를 `106.25%` 로 바꾸면(기본 설정에서 17px 동일) 실제로 먹는다 — 전 화면 영향이라 **리드 결정**으로 남긴다. 그 밖의 9px 사용처(AdminTab·TournamentClock·EventPage·MyPostersTab 등, 비담당 파일)는 손대지 않았다.
4. D2 는 TimetableCard(홈·일정 탐색)만 고쳤다. 라이브 탭 ListCard·그리드 카드의 매장명 버튼(카드 안 중첩)은 그대로다 — 점검 보고서가 그 배치의 중심 누름 결함을 재지 않았다(NOT_RUN).
5. D8 정착 후 판 윗변이 레일 밑변보다 4px 아래(91 vs 87) — 맞춘 직후 새 판 내용이 5px 자라서다. 가림은 0.
6. 실기기(S26·삼성 인터넷·iOS)·주소창 접힘: NOT_RUN(headless Chromium).

## 다음 한 단계
verifier 가 이 보고서의 A/B 하네스(`hf/m/*.cjs`, `BASE=http://localhost:4194|4193`)로 D1·D2·D8 을 독립 재측정하고, design-reviewer 가 1(워드마크 문턱)·2(로고 발견성)를 판정.

---

## 추가분 — 리드 결정 반영 (2026-09-29)

요구: 리드 결정 1 — 헤더 버튼 **폭** 확장만 되돌리고 높이 44 유지 · 375 로그인에서 워드마크 유지. 결정 3(D6 루트 106.25%) 은 하지 않음(현상 유지).

**되돌린 것(`src/App.tsx` 만)**: 테마·알림·이용권의 `before:-left-[5.75px]` · 알림·이용권 `ml-[3.625px]` · 아바타 `w-[44px] h-[44px]` → 원래 `w-11 h-11` · 워드마크 문턱 376 → **372(원래 값)** · 로고 '홈으로' 의 가로 의사요소 확장. `index.html` 정적 셸은 이미 원상(`gap-0.5`, diff 0). ThemeToggle 은 원래부터 diff 0.
**남긴 것**: 로고 '홈으로' `min-h-[44px]`(높이 30 → 44) · 원형 버튼의 기존 `tap-44`(세로 44).
→ 헤더 클러스터 폭은 HEAD 와 같아졌다(132.30px) — 워드마크 문턱이 바뀔 이유가 없어졌다.

| 폭(로그아웃) | 워드마크 | 타이틀 잘림 | 홈으로 | 테마 | 알림 | 로그인 |
|---|---|---|---|---|---|---|
| 360 | 접힘(372 이하 원래 규칙 · HEAD 와 동일) | 없음 | 26×**45** (HEAD 26×26) | 40×45 | 40×45 | 52×45 |
| 375 | **표시** | 없음 | 81×**45** (HEAD 81×30) | 40×45 | 40×45 | 52×45 |
| 390 | **표시** | 없음 | 81×**45** (HEAD 81×30) | 40×45 | 40×45 | 52×45 |

- 워드마크 표시 시작 폭: 373px(HEAD 와 동일). 10개 탭 이름 × 355~430px 스윕 잘림 0(`hf/m/hdrsweep.cjs`).
- 로그인 375: 클러스터 폭이 HEAD 와 같으므로 HEAD 동작 그대로(워드마크 표시). 로그인 상태 직접 실측은 NOT_RUN(하네스 비로그인).
- D4 표의 '헤더 테마·알림 폭 44' 행은 **철회** → 폭 40(HEAD 동일), 높이 45 PASS. 가로 44 는 결정에 따라 미충족으로 남는다.
- 헤더 폭 관련 계약/테스트: 문턱 372 나 클러스터 폭을 단언하는 테스트는 없었다(grep). 헤더 계열 e2e `header-320`·`static-shell`·`first-screen`·`design-tokens` → **33 passed**.

명령: `bash hf/rebuild.sh` 0 · `npx tsc -p tsconfig.app.json --noEmit` 0 · `npm run lint` 0(오류 0) · 위 e2e 0.
정리: `:4193`·`:4194` preview(node 4개) 종료 · 두 포트 LISTEN 없음 · 남은 headless 브라우저/하네스 node 0. `public/sitemap.xml` 해시 5b5953aaa81bda5e325b28bb84f02f50594ef711 — 작업 시작과 동일. 커밋 안 함.
