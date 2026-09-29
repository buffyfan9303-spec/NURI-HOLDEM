# 홈 배너 개수 불일치 수정 — home-team 보고 (2026-09-29)

요구 키: 오너 채팅 2026-09-29 "배너가 메인에서는 3개인데 설정하는 것은 1개야 — 제대로 수정"
원천: 오너 스크린샷 images/1.png (등록 1장 '로티아레나 출석 이벤트' 꺼짐 + 이벤트/브랜드 스위치 켜짐)
작업트리: pos-system-defect-fixes-938532, HEAD 69a7b81b (커밋 안 함)

## 원인
홈 캐러셀 조립이 두 곳에 흩어져 있었다 — 이벤트 중복 제거는 HomeTab(bannerCoversEvent), 순서는 PosterCarousel.
관리자 카드는 등록 배너(꺼진 것 포함) 목록만 보여 줬다. 오너 상태: 등록 배너는 꺼져 홈에 0장, 홈 = 브랜드 2 + 이벤트 1 = 3장, 관리 목록 = 1행.

## 전 / 후
| | 전 | 후 |
|---|---|---|
| 목록 계산 | HomeTab + PosterCarousel 두 곳 | `src/lib/homeCarousel.ts` `homeCarouselPlan` 한 곳 (홈) · `homeCarouselPreview` = homeBannerFeed → homeCarouselPlan (관리자) |
| 관리자 화면 | 등록 배너 1행 + "먼저 돌고 뒤에 두 장" 설명 | "지금 홈에 뜨는 순서 · 홈에 지금 N장" + 줄마다 종류(등록 배너/이벤트/브랜드)·끄기, "홈에 안 뜸" 칸(꺼진·예약·만료 배너 + 꺼진 이벤트/브랜드, 켜기) |
| 실측 (오너 상태, 390·1280) | 홈 3 · 관리 1 | 홈 3 · 관리 3 (둘 다 같음) |
| 실측 (배너 켬, 390·1280) | — | 홈 4 · 관리 4 |

유지한 기능: 등록·수정·삭제·▲▼ 이동·기간·정리 버튼·두 SlideSwitch 토글(스위치 상태는 `useSlideSetting` 훅 하나로 올려 토글과 목록이 같은 상태를 씀). 이벤트 메뉴 표시(event_menu_visible) 꺼짐도 App 과 같게 반영(읽기만).

## diff 요약
- 새 파일 `src/lib/homeCarousel.ts`: `homeCarouselPlan`, `homeCarouselPreview`, `BRAND_SLIDE_TITLES`, `eventStateOf`·`remainCardsOf`(HomeTab 에서 옮김 — 관리자도 같은 live 판정을 씀). eventState 는 타입만 import(홈 임계 경로 변화 없음).
- `PosterCarousel.tsx`: props `banners`/`showBrand` 제거 → `plan` 을 받아 그대로 그림. 자체 순서 규칙 삭제.
- `HomeTab.tsx`: `carouselPlan = useMemo(homeCarouselPlan(...))`, eventSlide 에서 스위치·중복 제거 분기 삭제(plan 이 판정). bannerCoversEvent import 제거.
- `HomeBannersCard.tsx`: 미리보기 목록·장수 배지(`data-testid="home-carousel-count"` + `data-count`), 행 `home-carousel-row`/`home-carousel-off-row`(`data-kind`), 이벤트 보드 1회 조회(getEventBoard, 읽기).
- `homeDensity.contract.test.ts`: 순서 정규식 단언을 PosterCarousel → lib/homeCarousel.ts 로 옮김(같은 식 그대로, 느슨하게 하지 않음).
- EOL: HomeBannersCard 의 원래 이상 줄끝 2곳(CRCRLF 1·LF 1)을 복원해 전파일 churn 없음(diff 125줄).

## 명령 / 종료 코드
| 명령 | 결과 |
|---|---|
| `npx vitest run src/lib/homeCarousel.test.ts` (배선 전) | FAIL 3 (계약 3건: PC plan.flatMap · HomeTab homeCarouselPlan · 관리자 homeCarouselPreview) / 11 통과 |
| 같은 명령 (배선 후) | PASS 14/14 |
| 음성 대조: `p.showEvent && !bannerCoversEvent` → `||` 로 바꿈 | FAIL 3 → 복원, `git hash-object` 동일 확인 |
| `npx tsc -p tsconfig.app.json --noEmit` | 0 |
| `npx vitest run` | 5 실패(community.searchPosts 전부 — 기존 실패) / 3837 통과 |
| `npm run lint` | 0 (오류 0) |
| 격리 빌드 `scratchpad/hf/rebuild.sh` + `npm run bundle:budget` | 빌드 0, 예산 통과. 임계 266.2/267 · JS 합계 1011.2/1014 (여유 0% 경고, 초과 아님) |
| 격리 preview 4195 + `scratchpad/hf/banner.cjs` (supabase 전부 로컬 fulfill, 목 관리자) | PASS — 390·1280 둘 다 home-banner-counter N == home-carousel-count N, pageerror 0, 운영 요청 0 |

캡처: `scratchpad/hf/banner-admin-owner-390.png`, `banner-admin-owner-1280.png` (on 시나리오 `banner-admin-on-*.png`).
npm run test:e2e: NOT_RUN (지시 범위 밖. 공용 파일 App.tsx·index.css·atoms 는 건드리지 않음).

## 미검증 / 참고
- 관리자 미리보기의 이벤트 live 판정은 관리자 기기 시각으로 한다(홈과 같은 eventNow). 손님과 관리자 접속 시점 차이로 경계 순간에는 순서가 다를 수 있다.
- 390 캡처에서 기존 등록 배너 행(▲▼·썸네일·버튼)이 좁아 제목이 "로…" 로 잘린다 — 이번 변경 전부터 있던 배치. 필요하면 별도 작업.
- 띄운 프로세스: preview 4195 종료(PID 강제 종료 확인).

## 다음 한 단계
리드 커밋 전 `npm run test:e2e` 중 admin-exposure·home-event-banner·event-entry 스펙 실행(sitemap 백업 절차 필요).
