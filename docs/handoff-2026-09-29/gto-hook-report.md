# 홈 첫 줄 GTO 후킹 문구 (2026-09-29, home-team, claude-sonnet-5)

요구 키: 오너 채팅 2026-09-29 "맨위 GTO 도구 22개 → 후킹 문구 · 모든 유저 · 개인화(가 본 매장 1곳) 빼고 강조". 커밋 없음.

## diff 요약
- src/components/features/HomeTab.tsx — 첫 줄(home-today-line)을 **항상** GTO 진입 버튼(home-gto-entry)으로. 로딩/실패/개인화(personal) 분기 삭제.
  문구 "프로처럼 치는 무료 GTO {GTO_TOOL_COUNT}개 ›" (숫자 하드코딩 없음). 앞 문구 font-extrabold, "무료 GTO N개" 네온+확대(모바일 20px, md 24px, lg 22px).
  죽은 코드 정리: Nums · personal · visitsByVenue · todayLine import · visitedVenues/myTodayRes 구조분해 삭제.
  (lib/homeRail.todayLine 은 자체 단위테스트가 있어 남김. 호출부는 이제 0.)
- 계약 갱신(느슨하게 풀지 않음): homeLiveFreshness.contract(개인화 게이트 단언 → "첫 줄에 분기 없음·personal/todayLine 없음·새 문구" 로 **뒤집음**),
  homeDensity.contract(새 문구 2줄 추가), e2e/home-flow-fit.spec.ts(무료 GTO 도구 N개 → 프로처럼 치는 무료 GTO N개).
  ⚠ 정책 변경: 개인화 문장을 요구/허용하던 계약은 "항상 GTO" 로 바뀜.

## 폭 실측 (guest, 목킹, p=home-today-line, b=버튼)  scrollWidth ≤ clientWidth
| 폭 | p 가용 | 버튼 폭 | 한 줄 | 높이 | docX |
|---|---|---|---|---|---|
| 320 | 286 | 260 | O | 44 | 0 |
| 360 | 326 | 260 | O | 44 | 0 |
| 375 | 341 | 260 | O | 44 | 0 |
| 390 | 356 | 260 | O | 44 | 0 |
| 768 | 720 | 307 | O | 44 | 0 |
| 1024 | 284 | 284 (여유 0, 통과) | O | 44 | 0 |
| 1100 | 309 | 284 | O | 44 | 0 |
| 1280 | 344 | 284 | O | 44 | 0 |
| 1440 | 344 | 284 | O | 44 | 0 |
- 1024(lg 진입, 4칸 열)에서 처음 24px 로 303>286 넘쳐 home-flow-fit 1024 두 건이 빨개졌다 → lg 에서 20/22px 로 낮춰 해결(자르지 않고 줄임).
- 로딩/실패(supabase 500) 상태에서도 같은 문구·같은 44px (CLS 0). 이전(HEAD) 빌드는 실패 시 "오늘 대회 정보를 불러오지 못했어요" 라 진입이 아예 없었음.
- 대비(surface-base 기준): 다크 강조 9.4 / 앞 문구 18.5 · 라이트 강조 6.91 / 앞 문구 17.46 → AA 통과.

## 캡처
scratchpad\hf\gto\before-390-dark.png · before-390-light.png · before-320-dark.png
scratchpad\hf\gto\after-390-dark.png · after-390-light.png · after-320-dark.png · after-1280-dark.png · after-1280-light.png

## 명령 / 결과
- npx tsc -p tsconfig.app.json --noEmit → 0 · tsc.e2e → 0 — PASS
- npx vitest run(전량) → 3837 pass / 5 fail(community.searchPosts 기존 5건만) — PASS(기존 실패 동일)
- npm run lint → 오류 0 (초기에 내가 만든 제어문자 정규식 1건 no-control-regex 는 고침)
- 격리 빌드(hf/rebuild.sh, wt 사본) + 프리뷰 4201(after)/4202(before): e2e home-flow-fit + home-cls 25/25 PASS (E2E_BASE_URL 지정, 운영 sitemap 안 건드림)
- 번들 예산(wt 사본, bundle-budget.mjs) → 통과(첫 화면 265.9/267KB, 여유 0%; 경고만)
- sitemap sha256 전/후 동일 3ed60a7a…28ff — PASS
- 음성 대조: HomeTab 에 `const personal` + 렌더를 되살리면 homeLiveFreshness 새 단언이 빨개짐(FAIL 확인) → 복원, git hash-object 동일(dccac3d4…) — PASS
- 띄운 프리뷰 4201/4202 종료.

## 남은 것 / 제안(리드)
- App.tsx 가 아직 visitedVenues·myTodayRes 를 HomeTab 에 넘긴다(타입에는 남아 무시됨). 공용 파일이라 미수정 — 정리하려면 nuri-lead 가 편집자 지정.
- 정적 셸(index.html) 첫 줄 스켈레톤 폭 230px 는 그대로(새 버튼 260px 이라 도착 시 오른쪽만 30px 늘 뿐 높이 CLS 0).
- 워크트리에 내 것이 아닌 untracked: supabase/migrations/20260929a_reservation_message_no_identity.sql
