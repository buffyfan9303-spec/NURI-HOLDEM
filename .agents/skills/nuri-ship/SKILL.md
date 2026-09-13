---
name: nuri-ship
description: NURI HOLDEM 코드 변경을 "완료"라고 선언하기 전, 커밋/PR 전에 반드시 실행하는 검증 게이트. 정해진 순서로 lint → vitest → build(타입체크 포함) → Playwright 스모크를 돌리고, DB를 건드렸으면 Supabase 어드바이저까지 확인한다. "무오류" 요구를 자동화한다. UI/로직/DB 어떤 변경이든 마무리 직전에 호출하라.
---

# nuri-ship — 배포 전 검증 게이트

라이브 서비스다. "됐다"고 말하기 전에 **아래를 순서대로** 통과시켜라. 하나라도 실패하면 완료가 아니다.

## 실행 순서 (프로젝트 루트에서)

1. **린트** — `npm run lint`  (eslint . / 0 경고 목표)
2. **단위 테스트** — `npm test`  (vitest run — 장부·머니·클락·레인지 로직)
3. **빌드 = 타입체크 포함** — `npm run build`  (`gen-sitemap → tsc -b → vite build`. tsc -b가 타입 게이트라 별도 tsc 불필요)
4. **E2E 스모크** — `npm run test:e2e`  (main + boot. Playwright)

> 빠른 피드백이 필요하면 3번 전에 `npx tsc -b --noEmit`만 먼저 돌려도 되지만, 최종 게이트는 위 4개 전부다.

## E2E gotcha (반드시 기억)
- E2E는 **프로덕션 빌드(포트 4173)** 를 검사한다. dev(5173) 아님 — 빌드 스킵하면 옛 번들을 검사하는 함정.
- 미리보기 환경은 pushState 직후 가짜 popstate를 쏴 모달이 즉시 닫힘 → 캡처/모달 테스트는 `history.pushState/back` no-op override 필요(프로덕션 무관).
- AuthModal 폼 마지막 submit은 Enter용 숨김 버튼 → 클릭 말고 password 필드에서 Enter.
- 탭 클릭은 `button:visible` 필터 필수(숨김 PC 탭바에 매칭 방지).
- test1 계정 비번은 회전됨 — 실패 시 auth.users crypt 재설정 확인.

## DB를 건드렸다면 추가
- Supabase 어드바이저 **보안 ERROR 0** 확인(get_advisors). 새 함수/RLS/트리거는 `nuri-migration` 스킬의 ACL·search_path 규칙을 따랐는지 재확인.
- 라이브 마이그레이션 적용 결과를 메모리(launch-state)에 리포.

## 완료 정의(DoD) 원칙
- 변경마다 회귀 방지 테스트가 있는가? (버그 수정은 반드시 재현 테스트 동반)
- 빈/로딩/에러 상태를 다뤘는가?
- 폴백=현행값을 확인했는가? (클락·리플레이 등 송출/공유 경로)

## 보고
게이트 결과를 정직하게 보고하라 — 통과는 "lint 0 / vitest N / build OK / E2E N 그린"처럼 수치로, 실패는 출력과 함께. 스킵한 단계가 있으면 명시.
