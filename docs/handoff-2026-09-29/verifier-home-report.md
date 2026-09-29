# verifier 독립 검증 — home-team 모바일 점검 D1·D2·D3·D4·D5·D6·D8 + gameTypeLabel

대상: 미커밋 diff(HEAD abe47223 위) — `git status --short` 20개 파일(수정 18 + e2e 5) + 신규 2(`src/lib/gameTypeLabel.ts`·`.test.ts`).
원천: `scratchpad/home-fix-report.md`, `scratchpad/audit-mobile.md`(D1~D9).

## 1. 기능 보존 — D2 매장 이동 경로 PASS

- `src/components/features/ScheduleCard.tsx` TimetableCard: 매장 이동 버튼이 카드(`<article role="button">`)의
  **형제**(`<div data-card-cell><article>…</article><button data-testid="schedule-venue-link">…</button></div>`)로 옮겨졌다.
  실제 diff 확인(line 855~987): `venueId &&` 가드된 `<button type="button" aria-label={\`${schedule.pubName} 매장 페이지\`}>` 로,
  진짜 `<button>` 요소라 **키보드 포커스 가능**(Tab 으로 도달, `focus-visible:ring-2`), 스크린리더는 aria-label 전체를 읽는다.
- 삭제된 diff 확인 — VenueLink 의 `onClick`·`hitCls="relative z-10 mt-[-3.25px]…"` 두 prop 이 TimetableCard 호출부에서만 빠졌다.
  `VenueLink` 함수 정의 자체(207~232행)는 두 prop 모두 옵셔널로 유지, **ListCard**(506행)·**GridCard**(777행) 호출부는
  `onClick={schedule.venueId ? () => onVenueClick(schedule.venueId) : undefined}` 그대로 — 다른 두 레이아웃은 회귀 없음.
- 매장 이동 경로가 **카드(로고 자리 새 버튼) + 상세** 양쪽에 있는지: `ScheduleDetailModal.tsx` grep 확인 —
  295~298행(헤더 매장명 버튼)·728~729행·1267~1268행(예약완료 매장 버튼) 세 곳이 diff 밖에서 그대로 살아 있다. **경로 소실 없음.**
- `HomeTab.tsx` `HOME_LIST_GRID` 선택자 `article:nth-of-type` → `[data-card-cell]:nth-of-type` 로 소스와 정확히 동기화(936행 TimetableCard 호출부만 이 그리드를 쓰고, 735·759행의 다른 두 HOME_LIST_GRID 사용처는 `<button>` 직계 자식이라 이전에도 이후에도 이 선택자와 매치되지 않음 — 회귀 없음).
- `homeDensity.contract.test.ts` 정규식도 같은 문자열로 1:1 동기화(계약 약화 아님, 대상만 바뀜).

**판정: PASS.**

## 2. e2e 셀렉터 — 느슨화 없음, `getByRole(name)` 로 좁힘 PASS

5개 e2e 파일 전부 확인(`schedule-card-clicks/fit/touch.spec.ts`, `connectivity-chain.spec.ts`, `mobile-tab-transition.spec.ts`):
- 종전 `card.locator('button').first()` / `.filter({ hasText })` 부류(부분일치, CLAUDE.md 가 경고한 패턴) →
  전부 `card.locator('xpath=..').getByRole('button', { name: /…매장 페이지/ })` + `toHaveCount(1)`/`toHaveAccessibleName` 로 대체.
  이전보다 **더 엄격**(접근 이름 전체 일치 + 개수 단언 추가)해졌다 — 계약 약화 아님, 강화.
- `schedule-card-touch.spec.ts` 신규 테스트 2종은 D2 수정 전 빌드에서 실제로 FAIL 하는지 별도 확인(§6 참고).

**판정: PASS.**

## 3. 헤더 폭/높이 — 리드 결정대로 폭 확장 되돌림, 높이 44 유지 PASS

- `src/App.tsx` diff 재확인 — 남은 변경은 로고 `min-h-[44px]`(높이만) + 일정탐색 `pane-reserve`(D1) + 공지 헤더 `min-h-[44px]` 뿐.
- 보고서가 되돌렸다고 주장한 항목(테마/알림 `before:-left-[5.75px]`·`ml-[3.625px]`, 아바타 `w-[44px] h-[44px]`, 워드마크 문턱 376) —
  현재 diff에 **존재하지 않음**(HEAD 와 동일). `grep -n "372\|376" src/App.tsx` → `[@media(max-width:372px)]:hidden` 만 확인,
  372(원래 값) 유지, 376 문자열 0건.
- 리드 결정 3(D6 루트 106.25%)은 미적용 — HTML 루트 폰트 크기 변경 diff 없음(확인).

**판정: PASS.**

## 4. JSX 조건부 주석 · CRLF 통짜 변환 없음 PASS

- 20개 파일 diff 전수 확인 — `//` 라인 주석은 전부 JSX 표현식 밖이거나 `{/* */}` 형태, `{}` 조건부 블록 안에
  `//` 라인 주석이 섞여 파싱을 깨는 패턴 0건.
- `git diff --stat` 비정상적으로 큰 변경 줄 수 없음(최대 App.tsx +31/-8, 나머지 전부 한 자릿수~20대).
  `git ls-files --eol` 로 App.tsx·ScheduleCard.tsx·CommunityTab.tsx 확인 — `i/lf w/crlf`(index LF·작업트리 CRLF, 이 저장소 기본값)
  그대로, diff 통계도 실제 바뀐 줄 수와 일치 — **파일 전체 LF 재기록 아님.**
- 신규 파일 `src/lib/gameTypeLabel.ts` 바이트 검사: CRLF 0 · LF-only 11 — 새 파일이라 내부 일관(문제 없음).

**판정: PASS.**

## 5. 명령 실행 결과 — 독립 재실행, 보고서 수치와 일치

| 명령 | 종료코드 | 결과 |
|---|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 0 | PASS |
| `npx tsc -p tsconfig.e2e.json --noEmit` | 0 | PASS |
| `npx vitest run` | (5 fail) | 338/339 파일 통과 · **3823 통과 · 5 실패(전부 `src/api/community.searchPosts.test.ts` N06)** · 보고서 수치와 정확히 일치. 이 실패는 기존 결함(내 memory `project_ledger_addon_verify_2026-09-28.md` 등 다수에서 반복 확인된 원래 실패) — 이번 diff 와 무관 |
| `npm run lint` | 0 | 오류 0 · 경고 2515 |
| 번들 예산(격리 빌드, 독립 방법) | 0 | 아래 §5-1 |

### §5-1 번들 예산 — 독립 격리 빌드(보고서와 다른 방법으로 재확인)

보고서의 `scratchpad/hf/*` 세션 스크립트를 그대로 쓰지 않고, **직접 새 격리 사본**을 만들어 검증했다(같은 결론에 두 번째 경로로 도달):
- `cp -r src/public/scripts/index.html/vite.config.ts/tsconfig*.json/package.json` → scratchpad 임시 폴더
- `node_modules` 정션은 **main 체크아웃**(`…\누리홀덤\node_modules`, 실제 vite 8.2.2 설치)을 가리키게 함
  — 이 worktree 자체의 `node_modules` 는 사실상 빈 폴더(.tmp·.vite·.vite-temp 뿐, 실제 패키지 0개)라 `npx vite build` 가
  npm 전역 npx 캐시의 **다른 메이저 버전**(rolldown-vite 8.3.1)으로 엉뚱하게 빠지는 것을 확인했다(1차 시도 실패, 원인 규명 뒤 재시도).
- `postcss.config.js`(main 의 미추적 파일)를 복사했더니 `autoprefixer` 모듈이 **main 에도 설치돼 있지 않아** 실패 —
  Tailwind v4(`@tailwindcss/vite` 플러그인)는 이 파일 없이도 정상 빌드된다(확인: 2629 모듈 변환, 867ms, 빌드 성공).
  → CLAUDE.md 의 "main 의 미추적 postcss.config.js 가 없어서 깨진다" 서술은 **이번 실측과 다르다**(postcss.config.js 유무는
  무관했고, 진짜 원인은 npx 가 로컬 미설치 상태에서 다른 버전을 끌어온 것이었다) — nuri-lead 에게 별도 보고할 사항.
- `node scripts/bundle-budget.mjs`(worktree 의 `bundle-budget.json` 기준선 복사) 결과:
  CSS 33.8/34 KB gz(여유 1%) · 최대 청크(VenueManageTab) 116.1/119 KB gz(여유 2%) · JS 합계 922.5/1014 KB gz(여유 9%) ·
  **✓ 번들 예산 통과**(경고 2건은 스크립트 자체가 "통과" 로 분류하는 여유부족 경고, 초과 아님).
  `.env.local` 없이 빌드해 supabase 클라이언트가 빠진 mock 빌드라 첫 화면 임계경로는 스크립트가 자체적으로 판정 제외했다 —
  보고서 수치(CSS 33.9/34, 최대청크 118.1/119, JS 1009.8/1014)와 **CSS·청크는 오차 0.1~2KB 안에서 근접**, JS 합계 차이(~87KB)는
  mock 빌드로 supabase(~70KB) 가 빠진 것과 정확히 부합 — 보고서 주장과 모순 없음.
- 정리: 격리 사본(`scratchpad/vwt/`) 전체 삭제, `node_modules` 정션 `.Delete()`(정션만 제거, 실물 확인:
  main `node_modules\vite\package.json` 존재 그대로), 어떤 개발 서버도 띄우지 않았다(전부 1회성 `vite build`).

### §5-2 sitemap.xml — 무변경 확인

`git hash-object public/sitemap.xml` → `5b5953aaa81bda5e325b28bb84f02f50594ef711`, 보고서 값과 **정확히 일치**.
`git status --short public/sitemap.xml` 빈 출력 — 내 검증(격리 사본 빌드만 사용)이 실물 sitemap 을 전혀 건드리지 않았다.

## 6. 음성 대조 — `gameTypeLabel.ts` 직접 실행, 원복 hash 대조

1. `git hash-object src/lib/gameTypeLabel.ts` = `c056e19e8d34cc139bfb0345f74c7617325e2ae1`(변경 전).
2. `GAME_TYPE_LABEL.gtd` 값을 `'GTD (보장)'` → `'BROKEN'` 으로 한 줄만 깨서 `npx vitest run src/lib/gameTypeLabel.test.ts` 실행
   → **8건 중 2건 FAIL**(`gtd → GTD (보장)`, `GTD → GTD (보장)`, 기대값 불일치로 정확히 그 두 케이스만 빨개짐 — 나머지 6건은 영향 없어 그대로 통과, 테스트가 실제로 그 값을 검사하고 있다는 증거).
3. 원복(`'BROKEN'` → `'GTD (보장)'`) 뒤 `git hash-object` 재확인 → `c056e19e8d34cc139bfb0345f74c7617325e2ae1` **완전 동일**.
4. 재실행 `npx vitest run src/lib/gameTypeLabel.test.ts` → **8/8 통과** 확인.

**판정: PASS.** (D2 e2e 음성 대조는 home-team 보고서가 이미 자체 A/B 빌드로 수행·기록했고, 이번 회차는 gameTypeLabel 쪽을 직접 재현했다 — 두 항목 중 하나만 하면 된다는 지시에 따름.)

## 종합 판정

| 항목 | 판정 |
|---|---|
| 1. D2 기능 보존(카드·상세 양쪽 경로, 키보드/SR 접근) | PASS |
| 2. e2e 셀렉터 느슨화 없음(getByRole(name)) | PASS |
| 3. 헤더 폭 되돌림 · 높이 44 유지 | PASS |
| 4. JSX 주석·CRLF 통짜 변환 없음 | PASS |
| 5. tsc(app/e2e)·vitest·lint·번들예산·sitemap 무변경 | PASS (전부 독립 재실행) |
| 6. 음성 대조(gameTypeLabel) | PASS |

**NOT_RUN(건너뜀, 이유 명시):**
- 실기기(S26·iOS Safari)·주소창 접힘 dvh 재현 — headless/CLI 환경 한계(보고서와 동일 한계, 이번 회차도 재현 불가).
- 로그인 상태에서의 워드마크 문턱 375 실측 — 하네스가 비로그인 전용(보고서와 같은 한계).
- D2 발견성(로고에 매장 이동 단서 필요 여부)·D6 루트 폰트 사용자 설정 반영 여부 — 디자인 판단 영역, 리드/디자인 리뷰 몫으로 보고서에 이미 넘겨져 있음.

**띄운 프로세스·사본 정리:** 격리 빌드용 scratch 사본(`scratchpad/vwt/`) 및 `node_modules` 정션 전부 삭제·확인 완료.
개발 서버(vite dev/preview)는 이번 회차에서 하나도 띄우지 않았다(전부 1회성 `vite build`/`vitest run`).
`gameTypeLabel.ts` 음성 대조는 실제 소스를 수정했다가 **hash-object 로 원본과 바이트 동일함을 확인**하고 복원했다.
