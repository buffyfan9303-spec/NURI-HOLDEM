# 홈 배너 개수 불일치 — 독립 검증 (verifier, 2026-09-29)

요구 키: 오너 채팅 2026-09-29 "배너가 메인에서는 3개인데 설정하는 것은 1개야". 대상: home-team 보고
banner-fix-report.md, HEAD 69a7b81b + 미커밋 diff.

## 1. 단일 원천 — PASS

- `src/lib/homeCarousel.ts` 가 유일한 조립 함수(`homeCarouselPlan`)다. `PosterCarousel.tsx` 는
  `plan.flatMap(...)` 로 받은 순서를 그대로 그리고, 자체 정렬/필터 로직이 없다
  (`git diff -- src/components/features/PosterCarousel.tsx` 로 옛 `useMemo` 블록 전체가 삭제되고
  `plan` prop 하나로 대체된 것을 확인).
- `HomeTab.tsx`: `carouselPlan = useMemo(() => homeCarouselPlan(...))` (38번째 줄대 diff), 옛
  `bannerCoversEvent(...)` 직접 호출과 `remainCardsOf`/`eventStateOf`/`totalCardsOf` 로컬 정의가
  삭제되고 `homeCarousel.ts` 에서 import. `grep -n bannerCoversEvent src/components/features/HomeTab.tsx`
  → 0건(계약 테스트 `homeCarousel.test.ts:97` 도 같은 단언).
- 삭제된 diff 확인 결과 옮겨진 규칙 4가지 전부 `homeCarouselPlan`/`homeCarouselPreview` 안에 있음:
  - 브랜드 슬라이드 위치(live 이벤트면 등록 배너 바로 뒤·브랜드 앞, 아니면 맨 뒤) →
    `homeCarousel.ts:47` `return p.event.live ? [...posters, ...events, ...brands] : [...posters, ...brands, ...events];`
    (구 PosterCarousel 의 동일 삼항식과 글자 그대로 일치, `homeDensity.contract.test.ts` 가 이 정확한
    문자열을 새 파일에서 찾도록 옮겨졌음을 diff 로 확인)
  - 이벤트 중복 제거(`?event=`) → `homeCarousel.ts:42` `bannerCoversEvent(p.banners.map((b) => b.linkUrl), p.event.slug, p.event.pending)` (원래 HomeTab 에 있던 호출과 인자 동일)
  - 기간·이미지 없음 제외 → `homeBannerFeed`(api/homeBanners, 미변경)가 여전히 걸러 `homeCarouselPlan` 에는
    "게재 중" 배너만 들어간다(HomeCarouselInput 주석 24번째 줄에 명시, `homeCarouselPreview` 는 `homeBannerFeed`
    를 통해 이 필터를 다시 태움 — `homeCarousel.ts:61`).
  - 브랜드 슬라이드 제목 문자열(`BRAND_SLIDE_TITLES`)도 새 파일로 이동, PosterCarousel 이 상수만 참조.
- 관리자(`HomeBannersCard.tsx`)는 `homeCarouselPreview(rows, today, {showEvent, showBrand, eventMenu}, ev)`
  를 호출하며 내부적으로 `homeBannerFeed → homeCarouselPlan` 을 그대로 탄다(`homeCarousel.ts:56-67`).
  스위치 상태는 `useSlideSetting` 훅 하나로 올려 두 토글(`SlideSwitch`)과 미리보기가 같은 state 를 씀
  — `evSw`/`brSw`/`menuSw` 세 인스턴스, `sw.toggle` 이 SlideSwitch 의 onClick 과 미리보기 행의 "끄기"
  버튼 둘 다에 연결됨 확인.
- App.tsx 쪽 배선도 맞음: `showEventSlide={homeBanners.showEvent !== false && eventMenuOn}` (App.tsx:4160),
  `homeCarouselPreview` 안 `feed.showEvent && sw.eventMenu` 와 같은 AND 조합. `EVENT_MENU_KEY` 는
  `src/api/settings.ts:60` 에 실존.

## 2. 기능 보존 — PASS

`HomeBannersCard.tsx` 에 등록·수정·삭제·▲▼ 이동·정리(purge)·두 SlideSwitch 토글 함수가 모두 그대로 남아
있음(`grep`: `toggle`(127행) · `remove`(134행) · `move`(145행) · `purge`(164행) · ▲▼ 버튼(250-253행)).
diff 는 이 함수들의 바디를 건드리지 않고 새 미리보기 블록만 추가했다(diff에 `- const toggle` 같은 삭제 없음).
기간(startsAt/endsAt) 로직은 `homeBannerFeed`(미변경)가 그대로 담당.

## 3. e2e 셀렉터 — PASS(영향 없음)

`admin-exposure.spec.ts` · `home-event-banner.spec.ts` · `event-entry.spec.ts` 세 파일을 grep 했으나
이번 diff 로 바뀐 문구("손님 홈에는 여기서 관리하는 배너 N장이 먼저 돌고…")나 새 testid
(`home-carousel-count`/`home-carousel-row`/`home-carousel-off`)를 참조하는 곳이 0건. 세 스펙이 쓰는
testid(`home-banner-viewport`·`home-event-menu`·`home-event-banner`·`home-banner-dots`·`home-banner-counter`)
는 `PosterCarousel.tsx` 에 문자 그대로 남아 있음(`grep` 확인). 라벨이 바뀐 곳은 관리자 카드 설명문뿐이고
그 문구를 쓰는 e2e 스펙이 없어 data-testid 교체가 필요한 자리가 없다.

## 4. 명령 결과

| 명령 | 종료 코드 | 비고 |
|---|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 0 | |
| `npx tsc -p tsconfig.e2e.json --noEmit` | 0 | |
| `npx vitest run` | 1(파일 기준) | 339 passed / 1 failed, **5개 실패는 전부 `src/api/community.searchPosts.test.ts`** — 이번 diff 와 무관한 기존 실패(report 의 주장과 동일 개수·동일 파일). 3837 passed / 6 skipped 도 report 와 일치. |
| `npm run lint` | 0 | 오류 0 · 경고 2525(기존 수준, report 와 동일 0 오류) |

## 5. 음성 대조 — PASS

`src/lib/homeCarousel.ts:42` 의 `&&` 를 `||` 로 한 글자 바꾸고
`npx vitest run src/lib/homeCarousel.test.ts` 실행 → **3개 실패**(중복 제거 케이스 · 전부 꺼지면 0장 케이스
2건 — `||` 로 바뀌면 `showEvent=false` 여도 이벤트가 계속 들어가 `['event']`/`[..., 'event']` 가 남음).
직후 원문으로 되돌리고 `git hash-object src/lib/homeCarousel.ts` = `fd63eec4b787debc3b7722c6a4e56912e8e8172f`
(수정 전 해시와 동일, 복원 확인). report 가 주장한 "FAIL 3 → 복원" 과 일치(다만 report 는 다른 줄
`p.showEvent && !bannerCoversEvent` → `||` 를 댔고, 나는 같은 줄에서 같은 방식으로 재현 — 표현식이
정확히 같은 줄이라 동일 결함 클래스임).

## 미검증 (NOT_RUN, 이유)

- `npm run test:e2e`(admin-exposure·home-event-banner·event-entry 스펙 실제 브라우저 실행): 이번 검증
  범위는 diff·계약·vitest·tsc·lint·음성 대조로 한정됐고, `npm run test:e2e`/`npm run build` 는
  `public/sitemap.xml` 을 덮어써 백업→빌드→복원 절차가 필요하다(CLAUDE.md 경고). 코드상 셀렉터
  충돌 가능성은 §3 grep 으로 0건 확인했으나 **실제 브라우저 렌더링·타이밍**까지는 확인하지 못했다.
  home-team 보고서는 격리 preview(4195)+목 관리자로 390·1280 두 해상도에서 카운터 일치를 확인했다고
  적었으나, 그 프로세스는 이미 종료돼 이 세션에서 재관찰할 수 없다 — home-team 의 캡처 파일
  (`scratchpad/hf/banner-admin-owner-390.png` 등)은 다른 세션의 scratchpad라 이 세션에서 열람 불가.
- 관리자 미리보기의 이벤트 live 판정 시차(관리자 기기 시각 vs 홈 접속 시각) — home-team 이 이미
  "미검증/참고"로 명시한 항목. 동의: `HomeBannersCard.tsx` 는 `eventStateOf(eventStateMod, b)` 를
  독립 호출하므로 홈과 별도 렌더 시점에 평가되어, 경계 순간에는 순서가 실제로 다를 수 있음(코드로 확인,
  실기기 재현은 안 함).

## 띄운 프로세스·사본

이번 검증에서 새로 띄운 서버·프로세스 없음(tsc/vitest/lint 는 1회성 CLI 실행, 종료됨). 음성 대조는
소스 파일을 직접 수정→복원(Edit 2회)했고 `git hash-object` 로 원본과 바이트 동일함을 확인했다 —
scratchpad 격리 사본은 쓰지 않았다(단일 파일 한 줄 되돌리기라 §1 방식 적용, memory `feedback_readonly_files.md`
의 로버코피 방식은 이번엔 불필요 판단).

## 결론

home-team 의 4가지 주장(단일 원천화·기능 보존·e2e 셀렉터 무영향·명령 결과) 모두 **PASS**.
새로 발견한 결함 없음. `npm run test:e2e` 실행만 리드가 커밋 전 별도로 돌려야 함(§ 미검증 참고).
