---
name: nuri-ship
description: NURI HOLDEM 코드 변경을 "완료"라고 선언하기 전, 커밋/PR 전에 게이트 **명령을 실제로 돌리는** 단계 — lint → vitest → build(타입체크) → bundle:budget 을 정해진 순서로 실행하고 수치로 보고한다. E2E 실행은 nuri-e2e, 그 초록불이 진짜인지 깨뜨려 보는 음성 대조는 nuri-verify 로 넘긴다(둘 다 나중 단계이지 대안이 아니다). DB를 건드렸으면 Supabase 어드바이저까지. UI/로직/DB 어떤 변경이든 마무리 직전에 호출하라.
---

# nuri-ship — 배포 전 검증 게이트

라이브 서비스다. "됐다"고 말하기 전에 **아래를 순서대로** 통과시켜라. 하나라도 실패하면 완료가 아니다.

## 실행 순서 (프로젝트 루트에서)

1. **린트** — `npm run lint`  (= `eslint .`. **게이트는 error 0**, warning 은 아래 기준선 참고)
2. **단위 테스트** — `npm test`  (= `vitest run` — 장부·머니·클락·레인지 로직. `npm run test` 도 같다)
3. **빌드 = 타입체크 포함** — `npm run build`
   실측(`package.json:8`, 2026-09-13): `gen-sitemap.mjs → gen-thumbs.mjs → tsc -b → gen-legal.mjs → vite build`.
   `tsc -b` 가 타입 게이트라 별도 tsc 불필요.
   ⚠ 이 문서에 예전에 `gen-sitemap → tsc -b → vite build` 로 적혀 있었는데 **`gen-thumbs`·`gen-legal` 이 빠져 있었다** — 빌드는 저 둘의 산출물도 다시 쓴다.
   ⚠⚠ **빌드는 순수하지 않다.** 첫 단계 `scripts/gen-sitemap.mjs` 가 `.env.local` 을 직접 파싱해 **운영 Supabase 로 읽기 요청**(`schedules`·`venues`)을 내고 **`public/sitemap.xml` 을 덮어쓴다**.
   → 빌드 뒤 `git status` 로 **의도치 않은 산출물 변경이 없는지 본다**. 누가 그 파일을 작업 중이면 빌드 자체가 사고다.
4. **번들 예산** — `npm run bundle:budget` (= `node scripts/bundle-budget.mjs`. **3번 직후에**, 같은 dist 로 잰다)
   ⚠ **이 줄은 예전 판에 통째로 빠져 있었다** — 그런데 `ci.yml:62-63` 이 "번들 예산" 스텝으로 실제로 돌린다.
   즉 여기까지 초록이어도 **푸시하면 CI 가 빨개질 수 있었다.** 게이트가 CI 보다 느슨하면 게이트가 아니다.
   2026-09-13 실측(읽기 전용 실행, `--update` 아님) — **통과이지만 여유가 없다**:
   **2026-09-15 에 예산이 257→259 로 올라갔다**(오너 승인 · Vercel Speed Insights +0.9KB). 정본은 `bundle-budget.json` 이다 — 여기 숫자를 믿지 말고 그 파일을 열어라.  ⚠ 올릴 때는 **손으로, 실측값보다 1KB 이상 위로**. `--update` 는 현재값에 딱 맞춰 '여유 0%' 문제를 재생산한다.
   → **첫 화면 임계 경로는 여유가 0 이다.** `HomeTab`·`PosterCarousel` 등 임계 경로 파일에 import 를 하나 더하면 바로 터진다.
   🔴 터졌을 때 **`--update` 로 예산을 올리지 마라**(그건 게이트를 끄는 것이다). 지연 로드로 빼고 전후 KB 를 보고해라.
   올려야만 하는 이유가 있으면 오너 결정이다 — 스크립트도 `--update` 를 "의도적으로 올릴 때만" 으로 못박고 있다(`scripts/bundle-budget.mjs:13`).
   ⚠ `✗ dist 가 소스보다 N초 낡았다` 로 거부하면 **실패가 아니라 측정 거부**다(`:49`). 다른 팀과 빌드가 겹친 신호이니 재빌드 후 다시 재라 —
   낡은 dist 를 재는 것은 거짓 통과이고, 과거에 42분 낡은 dist 를 재고 "번들에 포함됐다"고 오판한 적이 있다(`:8-9`).
5. **E2E** — 여기서 `npm run test:e2e` 를 바로 치지 마라. → **`nuri-e2e` 스킬의 절차를 따른다.**
   왜(실측 `playwright.config.ts:69-77`): webServer 가 `npm run build && npx vite preview --port 4173` 이고 `reuseExistingServer: false` 다.
   즉 **E2E 를 돌릴 때마다 3번의 빌드가 통째로 다시 돈다** — sitemap 덮어쓰기와 운영 DB 읽기가 그대로 따라온다.
   구성만 적어 두면: `npm run test:e2e` = `test:e2e:main`(`--grep-invert @boot`) + `test:e2e:boot`(`--grep @boot --workers=1`).
   안전 실행법·범위 좁히기·`E2E_BASE_URL` 우회는 `nuri-e2e` 가 다룬다 — 여기서 되풀이하지 않는다.

> 빠른 피드백이 필요하면 3번 전에 `npx tsc -b --noEmit`만 먼저 돌려도 되지만, 최종 게이트는 위 5개 전부다.
> ⚠ 4번은 3번의 산출물(`dist/`)을 재므로 **순서를 바꾸면 낡은 값을 잰다.** 3번을 스킵했으면 4번도 스킵이라고 적어라.

### 조건부 — 법정 문서를 건드렸으면 (CLAUDE.md 의 남은 구속 ①)
`npm run legal:check` (= `gen-legal.mjs --check`. 파일을 쓰지 않고 커밋된 결과물과 **바이트 비교**, 다르면 exit 1)
- 약관·개인정보·환불·마케팅·**도박문제(anti-gambling)** 5개 문서가 대상이다. 2026-09-13 실측: `[legal] --check OK — 5개 문서가 TSX 원문과 일치한다` · exit 0.
- 🔴 **CI 에 이 스텝이 없다**(`ci.yml` 전수 확인 — `legal` 문자열 0건). 즉 **아무도 대신 잡아 주지 않는다.**
  TSX 원문만 고치고 `public/legal/*.html` 재생성을 빠뜨리면 라이브의 법정 고지가 원문과 어긋난 채 남는다.
- 고쳤으면 `npm run legal`(--check 없이)로 재생성한 뒤 다시 `--check`. 산출물은 `.gitattributes` 가 `eol=lf` 로 고정한다
  (바이트 비교 게이트라 줄끝이 틀어지면 통째로 불일치가 된다 — 편집 시 `nuri-edit`).

## 기준선 (2026-09-13 이 저장소에서 실제로 돌린 값)

변경 후 수치가 여기서 벌어지면 **네 변경 때문인지부터** 확인해라. "원래 그랬다" 로 넘기지 마라.

| 게이트 | 명령 | 실측 |
|---|---|---|
| 린트 | `npm run lint` | **2026-09-16 실측 `✖ 309 problems (0 errors, 309 warnings)`** — **error 0 이 게이트**. (2026-09-13 판은 221 이었다. 늘어난 것은 전부 기존 규칙의 파일 증가분이다) |
| 단위 | `npm test` | **2026-09-16 실측 `Test Files 209 passed (209)` · `Tests 2249 passed | 6 skipped (2255)`** (2026-09-13 판 159파일·1866테스트는 두 단계 낡았다) |
| 빌드 | `npm run build` | **이 세션에서는 안 돌렸다** — 위 산출물 덮어쓰기 때문. 수치 없음. 돌렸으면 네가 재서 적어라 |
| 번들 | `npm run bundle:budget` | 예산 정본 `bundle-budget.json`: 첫 화면 **259** · JS 1000 · CSS 32 · 최대 청크 114. 2026-09-15 실측 첫 화면 257.8/259 · JS 987.9/1000(여유 **1%**) · 최대 청크 111.4/114(여유 **2%**). 🔴 **다음에 먼저 터지는 곳은 첫 화면이 아니라 JS 전체와 최대 청크다.** |
| E2E | `nuri-e2e` 참조 | 수치를 여기 적지 않는다 — **정본은 `.claude/skills/nuri-e2e/SKILL.md`**. (예전 판이 '여기 복사하지 않는다'고 적고도 83개·491실행을 복사해 뒀고, 둘 다 낡아 있었다) |

**린트 221 warning 의 규칙별 내역** (2026-09-13 실측 — 합이 221 이라 빠진 것이 없다):

| 규칙 | 건수 | 무엇 |
|---|---|---|
| `security/detect-non-literal-fs-filename` | **176** | 테스트·스크립트가 변수 경로로 파일을 읽는다. 대부분 이것 |
| `security/detect-non-literal-regexp` | **30** | 변수로 `new RegExp(...)`. **예전 판에는 이 줄이 통째로 빠져 있었다** — 두 번째로 큰 덩어리다 |
| `security/detect-unsafe-regex` | **8** | 재앙적 백트래킹 후보. 예: `src/lib/tdaSearch.ts:56` |
| `react-hooks/exhaustive-deps` | 4 | |
| `detect-possible-timing-attacks` · `detect-eval-with-expression` · `@typescript-eslint/no-explicit-any` | 각 1 | |

⚠ 이 표는 **개수만** 센다. 그 자리에 사용자 입력이 실제로 흐르는지는 사람이 읽어야 갈린다 — 판정은 `security-audit` 3번.

## E2E gotcha (반드시 기억 — 실행 절차 자체는 `nuri-e2e`)
> 아래는 **스펙을 쓸 때** 걸리는 함정 목록이다. 실행 절차·신선도 대조·판정 기준은 `nuri-e2e` 에 있다.

- E2E는 **프로덕션 빌드(포트 4173)** 를 검사한다. dev(5173) 아님 — 빌드 스킵하면 옛 번들을 검사하는 함정(대조법은 `nuri-e2e` ⑤⑥).
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
- **게이트가 전부 초록이어도 음성 대조를 안 했으면 완료가 아니다.** 초록은 "테스트가 통과했다" 이지
  "그 테스트가 이 버그를 잡는다" 가 아니다. 고친 것을 되돌렸을 때 **그 테스트가 실제로 빨개지는지**를 봐야 한다.
  절차와 함정(자가검사가 자기 판정기를 쓰면 거짓 통과하는 부류 포함)은 **`nuri-verify`** 에 있다 — 여기서 되풀이하지 않는다.
- **flaky 를 "0" 이라고 적지 마라.** 로컬 기본은 `retries: 0`(`playwright.config.ts:32`)이라 1회 실행으로는
  플레이크가 **보이지 않는다**. 재봤으면 리포터가 `flaky` 라벨을 붙인 것만 수치로 적고, 안 재봤으면
  **"플레이크 측정 안 함"** 이라고 적어라. 판정 절차(재시도 실행법·알려진 목록·회귀와 가르는 기준)는
  **`nuri-e2e`** 가 다룬다 — 여기서 되풀이하지 않는다.

## 이 게이트가 못 보는 것 (초록이어도 안전을 뜻하지 않는다)
- **음성 대조** — 위 DoD 참고. 게이트는 "빨개져야 할 때 빨개지는가" 를 검사하지 않는다(`nuri-verify`).
- **플레이크** — 로컬 1회 실행으로는 드러나지 않는다(위 참고).
- **운영 DB 의 실제 상태** — lint/vitest/build 는 라이브 RLS·ACL 을 보지 않는다. DB 를 건드렸으면 위 "DB를 건드렸다면 추가" 절과 `nuri-migration`.
- **권한 거부로 0행이 된 클라이언트 변이** — 에러가 아니라 "성공, 영향 0행" 으로 돌아와 테스트도 초록이다(`nuri-affect`).
- **실제 손가락 조건** — Playwright 의 click/tap 은 누름이 0ms 라 길게 누르는 동안만 나는 부류를 재현하지 못한다(CLAUDE.md 참고 메모의 `offsetLeft` 사례).
- **CI 의 보안 스텝** — `semgrep`(`ci.yml:118-125`, `--error`)과 `gitleaks`(`:102-103`, 커밋 **이력**)는 **이 게이트에 없고 윈도우 로컬에서 돌지도 않는다.**
  위 5개가 전부 초록이어도 푸시하면 그 둘에서 빨개질 수 있다 → `security-audit`.
- **늦은 응답이 남의 화면을 덮는 부류** — `staleResponse`/세대 가드 미적용은 lint·타입·빌드가 전부 통과한다.
  이 세션에서만 **세 번** 재발했다(`N01 캘린더·알림·이용권 → A04 AuthContext → F14 StoreDashboard`).
  → **`nuri-async-guard`** 가 이 부류 전담이다(오류 원문 노출·저장소 무가드 읽기도 같이 다룬다). 비동기 setter·오류 던지기·`localStorage` 읽기를 새로 쓰기 **직전에** 부른다.

## 보고
게이트 결과를 정직하게 보고하라 — 통과는 "lint error 0 / vitest N파일 M테스트 / build OK / 번들 첫화면 NNN.N of 259KB / E2E N 그린"처럼 **수치로**, 실패는 출력과 함께.
🔴 **표의 숫자를 베끼지 마라. 네가 돌린 값을 적고 측정 날짜를 같이 남겨라.** 이 표가 2026-09-13→09-16 사이에 네 곳이나 낡아 있었고,
   낡은 기준선은 "예전에도 그랬다" 로 **회귀를 통과시킨다.**
번들은 통과/실패만 적지 말고 **첫 화면 임계 경로 KB 와 여유**를 적어라 — 여유 0% 라 "통과" 한 줄로는 다음 사람이 벽에 붙은 줄 모른다.
**돌리지 않은 단계는 "스킵" 이라고 쓴다** — 특히 빌드·E2E 는 산출물을 건드리므로 안 돌린 채 "OK" 로 적는 일이 실제로 생긴다.
음성 대조 결과와 플레이크 측정 여부도 같이 적어라(안 했으면 안 했다고).
