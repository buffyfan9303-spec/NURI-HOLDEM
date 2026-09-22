# NURI 팀 공통 교훈 — 원천 색인

> **이 파일은 상태 정본이 아니다.** 진행 상태는 `docs/HANDOFF.md` 하나뿐이다.
> 여기 있는 것은 역할을 넘나들며 반복해서 물린 **공통 교훈**과, 그 근거가 되는 **원문 경로**다.
> 요약은 원문을 찾는 색인일 뿐 근거가 아니다. **판단할 때는 원문을 열어라.**
>
> 🔴 **반복 실패의 상세 근거는 `docs/HANDOVER-2026-09-23.md` §3 이 정본이다**(10종 · 발생 목록 · 작업 전 한 동작).
> 아래 K-12~K-18 은 그 조사에서 색인에 없던 것만 올린 것이고, 수치는 여기 베끼지 않는다.
>
> 비밀·개인정보는 여기에 복제하지 않는다. 원문에만 둔다.
> 학습 원본 백업(2026-09-21, 751파일·해시 대조 완료): `C:\Users\buffy\Documents\누리팀백업\20260921-061555-ba7578d5`
> (그 폴더의 `manifest.json` 에 원천 절대경로·바이트·mtime·SHA-256 이 있다. **Git 밖 로컬 보관**이다.)

## 읽는 법

각 교훈은 이렇게 적는다.

- **증거 수준** — `정적`(코드·문서만) · `로컬`(로컬 빌드/E2E 실측) · `운영`(라이브 도메인·DB 실측) · `실기기`(S26 등 실제 단말)
- **상태** — `confirmed`(재현·반증까지 끝남) · `historical`(그때는 맞았다, 지금 지침 아님) · `superseded`(대체됨, 대체 근거 명시) · `unverified`(가설)

---

## K-01 · 보호 파일은 빌드가 덮는다 (sitemap)

`npm run build` 와 `npm run test:e2e` 는 둘 다 `public/sitemap.xml` 을 **다시 쓴다**.
그 파일은 오너 보호 대상이고, 작업트리 판과 HEAD 판이 **다르다**.

- 재현: 아무 빌드나 한 번 돌리고 `git status --porcelain public/` 을 본다.
- 반례(하면 안 되는 것): `git checkout -- public/sitemap.xml` — HEAD 판으로 되돌려 보호 내용을 **조용히 날린다**.
- 절차: 백업 → 빌드 → **즉시 복원** → `git hash-object` 로 해시 대조.
- 관련 역할: `verifier` · `nuri-lead` · 구현하는 모든 역할
- 원천: `.claude/skills/nuri-e2e/SKILL.md` (안전 실행 스크립트) · `CLAUDE.md`(검증 절)
- 증거 수준: `로컬` / 상태: `confirmed`

## K-02 · 파일별 편집자는 정확히 한 명

같은 checkout 에서 소스 편집은 **직렬**이고, 읽기 전용 조사만 병렬이다.
Codex 와 Claude Code 사이에는 공용 실시간 작업 목록이 **없다** — 다른 도구가 쉬고 있다고 추정하지 않는다.

- 절차: 편집 전마다 `git status --short` 와 관련 `git diff` 를 확인한다.
- 관련 역할: 전부
- 원천: `AGENTS.md`(동시 편집 금지) · `.claude/rules/nuri-team-capabilities.md`
- 증거 수준: `정적` / 상태: `confirmed`

## K-03 · 실패를 "0건"이나 "저장 성공"으로 표시하지 않는다

조회가 실패했는데 빈 목록을 그리면 업주는 **아무도 안 온 줄 안다.**
`.catch(() => {})` 로 오류를 삼킨 자리가 실제로 그랬다(출석 목록 R1-3).

- 재현: 해당 조회를 네트워크 단에서 끊고 화면 문구를 읽는다.
- 반례: 실패 상태에서 "아직 없습니다" 가 뜨면 실패다. `—` 나 오류 안내여야 한다.
- 같은 부류: 영원히 도는 스켈레톤. 실패는 스켈레톤으로 위장하지 않는다.
- 관련 역할: `store-team` · `community-team` · `home-team` · `critical-reviewer`
- 원천: `.claude/agent-memory-local/store-team/rpc_error_and_bundle_2026-09-12.md` ·
  `src/components/features/CheckinModal.tsx`(listErr) · `docs/HANDOFF.md` §0-a15(Q5 로딩/실패 표시)
- 증거 수준: `로컬` / 상태: `confirmed`

## K-04 · 인가는 서버가 한다 · 매장 경계는 서버가 지킨다

클라이언트의 `user.role`·`verified` 판정은 **UI 분기용**이다. 권한은 RLS 정책이나
SECURITY DEFINER RPC 안의 `auth.uid()`·`my_role()` 검사로만 성립한다.

- 판정법: **화면 게이트와 서버 게이트를 표로 나란히 놓고** '화면이 유일한 가드'인 자리를 찾는다.
  2026-09-15 에 그렇게 5개가 나왔고, 하나는 **화면 호출부가 0곳인데 RPC 만 살아 있었다.**
- 권한 함수는 **전이 폐쇄**로 센다. 직접 호출부만 세면 한 겹 너머를 놓친다.
- 탭만 숨기는 분리는 권한이 아니다. 같은 테이블을 읽을 수 있으면 이미 준 것이다.
- 🔴 **라이브 함수 정의가 정본**이다. 저장소 SQL 파일이 아니다 — `create or replace` 로 파일 본문을 덮으면
  앞 마이그레이션이 조용히 되돌아간다.
- 관련 역할: `critical-reviewer`(주) · `store-team` · `nuri-lead`
- 원천: `CLAUDE.md` 보안 코딩 표준 2·3 · `.claude/agent-memory-local/nuri-lead/project_migration_live_def_is_canonical.md` ·
  `.claude/agent-memory-local/nuri-lead/project_store_audit_followups.md` ·
  `.claude/agent-memory-local/store-team/ledger_money_audit_2026-09-17.md` · `.claude/skills/nuri-migration/SKILL.md`
- 증거 수준: `운영` / 상태: `confirmed`

## K-05 · QR — 혼합 의도 · 보류 의도 · 늦은 응답

세 가지가 각각 다른 사고다.

1. **혼합 의도**: `?checkin=A&buyin=B` 처럼 한 주소에 두 용도가 실리면 **어느 쪽도** 실행하지 않는다.
   파서(`qrPayload.ts`)가 거부하지만, **그 파서를 안 거치는 통로**가 있으면 우회된다 —
   실제로 App 의 effect 세 개가 각자 읽어 우회했다(2026-09-21 Q6).
2. **보류 의도**: OAuth 왕복에서 쿼리가 사라지므로 의도를 저장하는데, 새 QR 주소가 오면
   **무효·혼합·정상 가입까지 포함해** 옛 의도를 먼저 버려야 한다. 사용자가 로그인 창을 닫아도 버린다.
3. **늦은 응답**: 매장 A→B 전환 시 A 의 QR 이미지 Promise 가 B 를 덮는다. 이미지에 `venueId` 를 묶고
   cleanup 으로 늦은 resolve 를 버린다(Q5).

- 반례: `game=12x` 가 `parseInt` 로 12 가 되어 **다른 테이블**에 참가 요청이 가던 자리.
- 관련 역할: `store-team`(QR 컴포넌트) · `home-team`(App·파서) · `critical-reviewer`
- 원천: `src/lib/qrPayload.ts` · `e2e/qr-deeplink.spec.ts` · `docs/HANDOFF.md` §0-a15 ·
  `src/components/features/qrVenueGuard.contract.test.ts`
- 증거 수준: `로컬`(비로그인 축) / 상태: `confirmed`
  ⚠ 로그인 상태 축·실제 카메라·인쇄물 디코드는 `NOT_RUN`(HANDOFF §0-a15).

## K-06 · 포스터는 저장으로 끝나지 않는다 — 일정·라이브까지가 한 사슬

`포스터 저장 → 조회 → 일정/라이브 노출 → 예약 → 방문 → 장부 → 클락 → 순위 → 재방문` 이 한 사슬이고,
어느 한 칸에서 끊기면 사용자에게는 **기능이 없는 것과 같다**.

- 판정법: 변경한 함수의 **소비 화면**까지 적는다 — `변경 함수/데이터 → 소비 화면 → 실패/재시도 → 재조회/실시간 → 권한/매장 → 검증`.
- 관련 역할: `store-team`(생산자) · `home-team`(공개 일정 소비자)
- 원천: `.claude/agent-memory-local/store-team/poster_mutation_audit_2026-09-17.md` ·
  `.claude/agent-memory-local/home-team/link-chain-audit.md` · `src/components/features/linkChain.contract.test.ts`
- 증거 수준: `로컬` / 상태: `confirmed`

## K-07 · 모션 — 첫 페인트 · fixed 자손 · stacking · keep-alive

네 가지가 이 저장소에서 반복해서 물린 자리다.

- **첫 페인트**: 진입 모션을 `requestAnimationFrame` 으로 한 프레임 미루면 그 프레임이 **정착 위치로 페인트**되고
  다음 프레임에 +8 로 점프한다 — 사용자에게는 **0→+8 역행**으로 보인다. `useLayoutEffect` 커밋 안에서 시작해야 한다.
- **fixed 자손**: `transform`·`filter`·`backdrop-filter` 가 걸린 요소는 `position: fixed` 자손의
  **컨테이닝 블록이 된다**. 헤더 유리 효과 때문에 `fixed inset-0` 스크림이 68px 안에 갇혀 바깥 클릭이 안 닿았다.
  → 모션 대상에 sticky/fixed/모달의 **조상**을 넣지 않는다.
- **stacking**: transform 이 걸린 요소는 새 stacking context 가 되어 배경 레이어 위로 올라갔다가,
  끝나면 다시 내려간다. 그 순간 **색이 점프**한다(C1).
- **keep-alive**: 최상위 탭은 언마운트되지 않고 `display` 토글이라, 항상-렌더 진입 애니메이션은
  탭 재방문마다 다시 재생돼 깜빡인다.
- 관련 역할: `home-team` · `design-reviewer` · `root-cause-debugger`
- 원천: `src/lib/tabEnter.ts`(머리말) · `CLAUDE.md` 참고 메모 · `e2e/mobile-tab-transition.spec.ts` ·
  `docs/HANDOFF.md` §0-a15
- 증거 수준: `로컬` / 상태: `confirmed` — ⚠ 실기기(S26)는 `NOT_RUN`.

## K-08 · 실제 픽셀과 DOM 은 다른 것을 말한다

- `.reveal` 등 등장 애니메이션 중에 `getBoundingClientRect()` 로 간격을 재면 **거짓으로 커진다**.
  레이아웃 간격은 `offsetTop`/`offsetHeight` 로 재고, 보이는 간격은 rect 로 따로 잰다.
- `offsetLeft` 는 transform 이 걸린 조상에서 **끊긴다**(Chromium).
- 인라인 `<span>` 은 `clientWidth` 가 0 이라 넘침 검사가 무조건 통과한다. `Range.getClientRects().length` 로 재라.
- 소스 grep 이 아니라 **computed style** 로 확인한다. 빌드된 CSS 의 순서가 승자를 정한다.
- 관련 역할: `design-reviewer`(주) · `home-team` · `root-cause-debugger`
- 원천: `.claude/agent-memory-local/design-reviewer/MEMORY.md` 와 그 상세 파일들 ·
  `.claude/agent-memory-local/nuri-lead/feedback_gates_that_measure_nothing.md` · `CLAUDE.md` 참고 메모
- 증거 수준: `로컬` / 상태: `confirmed`

## K-09 · GTO 는 독립 오라클이 없으면 "미증명" 이다

`equity` 는 전략 해답이 아니고, HU 기준은 다인·BB앤티에 그대로 쓸 수 없다.
EV 단위·오차·seed·수렴 조건을 적지 않은 수치는 비교할 수 없다.

- 판정: 독립 기준이 없으면 `BLOCKED` 로 둔다. **모델을 올려도 없는 오라클은 생기지 않는다.**
- 관련 역할: `gto-team` · `critical-reviewer`(정오 독립 검토)
- 원천: `.claude/agent-memory-local/gto-team/equity_engine_kinds.md` · `outs_equity_basis.md` ·
  `nash_gen_k1.md` · `GTO-자료/근거자료.md`
- 증거 수준: `로컬` / 상태: `confirmed`(범위 한계 자체가 확정됐다는 뜻)

## K-10 · "빌드 READY" 는 배포가 아니다

- CI 가 초록이 아니면 Vercel 이 도메인 별칭을 **안 붙인다**. `READY` 만 보면 속는다 —
  `aliasAssigned:false` 로 도메인이 옛 배포에 머문 적이 있다.
- **새 푸시는 돌던 CI 를 취소한다.** 5분 간격 두 번 푸시로 커밋 두 개의 CI 가 연달아 취소됐다.
- 확인 순서: CI 3종 success → 두 alias 의 `deployment.id` 대조 → **손님 도메인에서 문자열 지문 실측**.
- 관련 역할: `nuri-lead` · `verifier` · `capability-steward`
- 원천: `.claude/agent-memory-local/nuri-lead/project_vercel_domain_pin.md` ·
  `project_ci_cancels_on_push.md` · `docs/HANDOFF.md` §6
- 증거 수준: `운영` / 상태: `confirmed`

## K-11 · 음성 대조를 안 하면 그 검사는 아무것도 재지 않는다

이 저장소의 **최다 함정**이다. 빨간 검사보다 '아무것도 안 잰 초록 검사'가 더 많이 나왔다.

- `if (!count) continue` 같은 조용한 탈출을 게이트에 두지 않는다. 건너뛴 것을 모아 단언한다.
- **고의로 망가뜨려 빨개지는 것을 본 뒤**가 완료다. 2026-09-21 에 두 번, 음성 대조가 초록이라
  검사를 다시 설계했다(M1 역행·Q6 우회). 특히 **필터가 찾으려는 것 자체를 걸러내고 있지 않은지** 본다.
- flaky 는 "flaky 겠지" 로 넘기지 않는다. **단독 3회** 돌려 세 번 다 통과해야 부하 문제다.
- 관련 역할: `verifier`(주) · `root-cause-debugger`(flaky 원인) · 전 역할
- 원천: `.claude/agent-memory-local/nuri-lead/feedback_gates_that_measure_nothing.md` ·
  `project_ci_only_flake_cpu_throttle.md` · `docs/HANDOFF.md` §2(알려진 flaky)
- 증거 수준: `로컬` / 상태: `confirmed`

---

# K-12 ~ K-18 — 2026-09-23 반복 실패 전수 조사에서 추가

> 아래 7건은 **2번 이상 실제로 반복된 것만** 올린 것이다. 조사 방법과 발생 목록·증거는
> **`docs/HANDOVER-2026-09-23.md` §3 이 정본**이다. 여기에는 판정과 **작업 전 한 동작**만 적고
> 수치는 베끼지 않는다(베끼면 K-14 가 된다).

## K-12 · 줄끝(CRLF)·BOM 은 파일 속성이 아니라 **체크아웃 속성**이다

`core.autocrlf=true` 라 계정·머신·워크트리가 바뀌면 같은 파일이 다른 줄끝으로 떨어진다.
실패 모드가 에러가 아니라 **0건 매칭**이라 치환도 음성 대조도 조용히 초록을 낸다.

- 반복: 2026-09-12 ~ **09-23**, 최소 6개 역할 기억에 10건.
- 반례(믿으면 안 되는 것): **`grep` 으로 줄끝을 세는 것.** 2026-09-23 에 CRLF 0개 파일에 `299/299` 를 줬다.
- 절차: 편집 전후로 `git ls-files --eol <파일>` 과 바이트 계수를 대조. `git diff --numstat` 이 작은지 확인.
- 관련 역할: 전부 / 원천: `docs/HANDOVER-2026-09-23.md` §3-B · `.claude/skills/nuri-edit/SKILL.md`
- 증거 수준: `로컬` / 상태: `confirmed` · **강제 장치 없음**

## K-13 · 늦은 응답이 남의 화면을 덮는다 (계정·대상·순서 3축)

K-05 는 QR 한 자리만 다룬다. 일반 부류는 이것이다 — 계정·매장·날짜·realtime 어디서든 난다.

- 반복: 8건(2026-09-12 ~ 09-21). **Q3(목록)를 막은 다음 날 Q5(이미지)로 같은 파일에서 재발**했다.
- 왜 안 잡히나: 빠뜨려도 lint·타입·빌드·vitest 가 **전부 통과**한다. 로컬·CI 는 응답이 늘 순서대로 온다.
- 절차: 편집 전 `grep -nE '\.then\(set[A-Z]' <파일>`. 나오면 `src/lib/staleResponse.ts` 로 감싸고
  **같은 커밋에** 그 파일 계약에 `expect(body).not.toMatch(/\.then\(set[A-Z]/)` 를 넣는다.
- ⚠ 가드를 썼어도 `await` 뒤 비교하는 두 값이 **같은 클로저에서 얼어붙으면** 영원히 통과한다(2026-09-21 실제).
- 관련 역할: 전 구현팀 / 원천: `HANDOVER-2026-09-23.md` §3-C · `.claude/skills/nuri-async-guard/SKILL.md`
- 증거 수준: `로컬` / 상태: `confirmed` · **전역 장치 없음**

## K-14 · 문서에 박힌 수치는 썩는다 — 판단 전에 정본을 다시 재라

- 반복: 9건. 같은 내용이 `CLAUDE.md` · `AGENTS.md` · 스킬 본문 **세 곳에 복제**돼 한 곳만 고치면 나머지가 낡는다.
- 실제 사례: ACL 서술 정정이 `CLAUDE.md` 에만 들어가 `AGENTS.md` 가 **3일** 틀린 채였고,
  SlidingPill 개수는 **8일** 어긋나 있었다(2026-09-23 에 고침).
- 절차: 문서 수치를 근거로 쓰기 전에 그 자리에서 세라. 잰 값과 **측정 날짜**를 보고에 같이 적는다.
  `CLAUDE.md` 를 고쳤으면 `AGENTS.md`·스킬에 같은 문장이 있는지 `grep` 한다.
- 관련 역할: `nuri-lead` · `capability-steward` · 문서를 고치는 전원
- 원천: `HANDOVER-2026-09-23.md` §3-D / 증거 수준: `로컬` / 상태: `confirmed` · **자동 장치 0개**

## K-15 · 워크트리·사본 빌드는 운영이 아니다 (IS_MOCK)

`.env.local` 과 `node_modules` 는 git 추적 밖이라 사본에 **절대 따라오지 않는다.**
env 가 없으면 앱이 에러 없이 **조용히 mock 으로 부팅**한다 — 화면이 멀쩡해 신호가 없다.

- 반복: 7건. 🔴 **다섯 팀 전부의 기억에 같은 증상이 있다**(이 조사에서 가장 강한 반복 증거).
- 절차: 하네스 첫 명령으로 `.env.local` 을 복사하고, 재기 전에
  `grep -q '\.supabase\.co' dist/assets/*.js && echo REAL || echo MOCK` 로 판정한다.
- 반례: `.claude/worktrees/**` 에서는 게이트를 돌릴 수 없다(node_modules 도 없다).
- 원천: `HANDOVER-2026-09-23.md` §3-F / 증거 수준: `로컬` / 상태: `confirmed`

## K-16 · 같은 계산이 복제되면 화면마다 답이 갈린다

같은 데이터를 카드·목록·상세·표·TV·장부 **여섯 자리**에서 보여 주는 앱이다.
옆 컴포넌트에서 복사하는 쪽이 항상 빠르고, 복사한 순간엔 값이 같아 **아무 검사도 안 빨개진다.**

- 반복: 5건. 등록 마감 규칙이 한때 **6벌**로 갈려 같은 포스터를 16/16/20/20 으로 말했다.
- 절차: 공용 계산을 **고치기 전에** 정의 수와 소비처를 센다(`nuri-single-source` §1단계 두 grep).
  정의가 2개 이상이면 **먼저 합친다.**
- 한계: 단일정본 계약 6종은 **소스 정규식**이라 이름만 바꾼 복제는 통과한다.
- 원천: `HANDOVER-2026-09-23.md` §3-G · `.claude/skills/nuri-single-source/SKILL.md`
- 증거 수준: `로컬` / 상태: `confirmed`

## K-17 · 비동기로 그려지는 자리는 **컴포넌트마다** 예약해야 한다

- 반복: 5건. 오너 표현 — "지지직 하면서 올라가" · "말려 올라가거나 내려가" · "주르륵 나온다".
- 🔴 **CLS 로는 못 잡는다** — 같은 이동에서 `cls: 0` 이 나온다(scrollY 0·VT 스냅샷 구간).
  `scrollHeight` 변동과 `scrollY` 를 직접 단언해라.
- 계약의 한계: `spaceReservation.contract.test.ts` 가 **딱 4개 파일만** 읽는다. 새 컴포넌트는 계약 밖에서 태어난다.
  → 자리를 예약했으면 **그 파일 경로를 계약의 목록에 추가**해라.
- ⚠ 잴 때 Playwright `locator.click()` 은 대상까지 자동 스크롤해 **측정을 오염시킨다** — `page.evaluate` 로 눌러라.
- 원천: `HANDOVER-2026-09-23.md` §3-I / 증거 수준: `로컬` / 상태: `confirmed`

## K-18 · 히트영역 오버행은 이웃을 덮거나, 잘리거나, 배치를 부순다

`.hit::after` · `tap-y-44::before` 는 보이는 상자를 안 건드리는 대신 세 가지로 고장난다:
이웃 자리 침범 · `overflow-*` 조상에서 잘림 · `position` 특이도 싸움. **셋 다 화면상으론 멀쩡하다.**

- 반복: 6건(2026-09-19 하루에 둘). `InstallBanner.tsx:118` 에 "`.hit` 금지" 가 코드 주석으로 박혀 있다.
- 🔴 게이트가 **틀린 방향으로 있다**: 전역 스윕(`e2e/design-tokens.spec.ts`)은 **크기만** 재고 홈 한 판에서만 돈다 —
  세 사건 모두 여기서 초록이었다. **없는 것보다 위험하다**(초록이 안전의 증거로 읽힌다).
- 절차: 붙이기 전에 ① 오버행 `(44−박스폭)/2` 와 이웃 gap 비교 ② `overflow-*` 조상 확인 ③ `absolute|fixed|sticky` 면 금지.
  하나라도 걸리면 **`h-[44px]` 실박스**로 간다(루트 17px 이라 `h-11`=46.75px).
- ⚠ Playwright click 은 누름 0ms 라 `:active`/`transform` 부류를 재현 못 한다 — CDP 터치 홀드(`e2e/pill-press.spec.ts`).
- 원천: `HANDOVER-2026-09-23.md` §3-J / 증거 수준: `로컬` / 상태: `confirmed`

---

## historical — 지금은 지침이 아니다 (되살리지 마라)

원문은 보존한다. **활성 규칙으로 부활시키지 않는다.**

| 무엇 | 왜 지금은 아닌가 | 원천 |
|---|---|---|
| 모션 헌법 v2 · 아우라 v3~v6.5 수치 규정 · 아이콘 단일 팩 강제 | 2026-09-07 오너 지시로 **전면 삭제**. 남은 것은 법·규제, 보안 코딩 표준, 기능·데이터 보존 셋뿐이다 | `CLAUDE.md` 머리말 표 |
| "3회차에 Fable 승격" 운영 규칙 | 2026-09-13 정책으로 폐기, 2026-09-21 개편에서 **희소 사용**으로 다시 좁혔다 | `.claude/rules/nuri-team-capabilities.md` |
| 일괄 Fable 기본 배정(reviewer 3역할) | 잔여량이 적다는 오너 지시가 우선. 지금은 Opus 5 가 기본이고 Fable 은 조건부다 | 이 문서 아래 · 역할 정의 frontmatter |
| 자동 `git pull`·fetch 후 병합·과거 실패 허용치 | 현행 규칙은 사용자가 명시 요청할 때만. "허용되는 실패 1건"도 폐기됐다 | `AGENTS.md` §6 · `docs/HANDOFF.md` §2 |
| `.claude/handoff/current.md` 의 진행 상태 | 2026-09-15 이후 상태 정본은 `docs/HANDOFF.md` 하나다 | `.claude/handoff/current.md` 머리말 |

## 원천 색인 — 어디를 뒤져야 하나

| 원천 | 경로 | 비고 |
|---|---|---|
| 역할별 기억(활성) | `.claude/agent-memory-local/<역할>/MEMORY.md` + 상세 파일 | 10개 역할. `Explore` 는 자동 기억 없음 |
| 상태 정본 | `docs/HANDOFF.md` | 여기가 유일한 진행 상태 |
| 프로젝트 자동 기억 | `C:\Users\buffy\.claude\projects\C--Users-buffy-OneDrive-----------\memory\` | 에이전트 기억과 **별개**다. "프로젝트 기억이 있으니 팀원이 읽었다"고 가정하지 않는다 |
| 실행 설계문(역사 포함) | `.claude/handoff/*.md` | git 미추적. 요구 키는 `문서경로#ID` |
| Codex 쪽 검토 교훈 | `.codex/agent-memory-local/verifier/` | Claude 원천과 구별한다. 이번 개편에서 **수정하지 않았다** |
| 원본 백업(불변) | `C:\Users\buffy\Documents\누리팀백업\20260921-061555-ba7578d5` | 751파일 · `manifest.json` 에 SHA-256 |

⚠ **다른 worktree 에 같은 이름이지만 내용이 다른 기억이 있다.** 2026-09-21 대조에서 16건이 나왔고
(대부분 각 역할의 `MEMORY.md`, 그리고 `nuri-lead` 의 상세 7건), 루트에 없던 고유 파일 28건은
**덮어쓰지 않고 합집합으로** 루트에 들여왔다. 원본은 위 백업에 출처별로 그대로 있다.
파일명이나 수정 시각만으로 한쪽을 버리지 마라.
