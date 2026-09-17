---
name: nuri-prompt-templates
description: 오너가 외부에서 가져온 프롬프트 템플릿 3종 — 반응형 비전 디버깅 · Level 4~5 리팩토링 · 계약 우선 회귀 차단 — 을 이 저장소에서 실행하기 직전에 호출하라. 원본 템플릿은 이 저장소에 없는 파일(`PostList.tsx`)·없는 디렉터리(`src/shared/types`)·안 쓰는 관용구(`auto-fit`)를 가정하므로 그대로 쓰면 헛도는 지시가 된다. 각 템플릿을 실제 파일·실제 관용구·실측 스윕 폭으로 바꿔치기한 붙여넣기용 프롬프트 텍스트만 제공한다(구속 규칙 아님 — 오너 결정: 프롬프트 전용). 검증·게이트 실행은 nuri-verify·nuri-ship이 담당하므로 여기서 되풀이하지 않는다.
---

# nuri-prompt-templates — 외부 프롬프트 3종의 저장소 번역판

> 만든 경위: 오너가 2026-09-16 에 외부 템플릿 3종을 주며 "저장하고 적용" 을 지시했고,
> **구속 규칙이 아니라 프롬프트 전용**으로 두기로 결정했다(`CLAUDE.md` 2026-09-07 "질서 제한 전면 삭제" 와 충돌하지 않게).
> 본문의 인용 수치는 전부 그날 실측이고, 리드가 `src/api` 파일 수와 `min-w-0` 횟수를 재측정해 정정했다.

## 이게 뭐고 뭐가 아닌가

- **프롬프트 텍스트 모음이다.** 아래 3개 인용 블록은 그대로 복사해 Claude Code 대화창에 붙여 넣는 지시문이다. 파일이 아니라 문구다.
- **규칙이 아니다.** CLAUDE.md 2026-09-07 절에서 지운 이징·색·아이콘 팩 제한을 이 스킬이 되살리지 않는다. 프롬프트가 뭘 하라고 시키든, 실제 관용구·보호 파일·기능 보존 원칙이 이긴다.
- **검증은 여기서 안 한다.** 게이트 실행은 `nuri-ship`, 초록불 음성 대조는 `nuri-verify`, 편집 시 CRLF/BOM 안전은 `nuri-edit`, 중복 계산 통합은 `nuri-single-source`, 변이 0행 계약은 `nuri-affect`, E2E는 `nuri-e2e` — 이 스킬은 그 앞 단계(무엇을 프롬프트에 넣을지)만 다룬다. 베끼지 말고 호출하라.

## 세 템플릿 모두에 넣을 접지 사실 (2026-09-16 실측)

| 사실 | 실측 근거 |
|---|---|
| 루트 폰트 17px, 8pt는 절대 px 아니라 단계(step) | `src/index.css:594` |
| 문서 레벨 `overflow-x: clip` — 넘침은 안쪽 요소에서 재라 | `src/index.css:602`(html) · `607`(body) |
| 엘리베이션 5단 기존 — 새 토큰 금지 | `src/index.css:306-310`(`--surface-base/low/mid/high/float`) |
| `auto-fit`/`auto-fill` **0회**, `min-w-0` **455회** — 새 그리드 패턴 금지 | 저장소 전체 grep 실측(2026-09-16, `src/` 기준) |
| 실제 스윕 폭 | 320·360·375·390·412·430(모바일) · 768(태블릿) · 1280·1440(PC) · 1920(대형) — `e2e/notice-bar.spec.ts:112`·`board-view-toggle.spec.ts:160`·`header-surface.spec.ts:110`·`rank-scroll-slots.spec.ts:219` 등에서 실사용 |
| 넘침 판정식 | `scrollWidth - clientWidth > 1` |
| 기존 스캐너 | `clippedNodes()` `e2e/post-detail-read.spec.ts:112` · `measure()` `e2e/home-flow-fit.spec.ts:140`(line-clamp→값 잘림→ellipsis→진짜 넘침 순서가 계약) |
| 글자 폭 대 가용 폭 관용구 | `src/components/atoms/MarqueeText.tsx:31`(`ms.offsetWidth > vp.clientWidth + 1`) |
| 커뮤니티 실제 파일 | `src/components/features/community/PostRowCard.tsx`(`PostRow`·`PostCard`를 **같은 파일**에서 export, 손님 화면과 운영자 광고 미리보기가 **같은 컴포넌트**를 씀) · 컨테이너 `src/components/features/CommunityTab.tsx` — `src/components/community/PostList.tsx`는 없음(확인: 파일 없음) |
| 도메인 경계 | `src/api/*.ts`(비테스트 **43개** — 2026-09-16 claude-A 재측정. 초안의 "84개+" 는 틀렸다) — `src/shared/types/`는 없음(확인: 디렉터리 없음) |
| 워크트리 한계 | `.env.local` 없음 → `IS_MOCK=true`로 빌드. 로컬 build/e2e 금지(보호 파일 `public/sitemap.xml` 덮음) → 소스 정적 분석 + 손님 도메인 `https://nuriholdem.com` 실측(브라우저 도구 있을 때)만 |

---

## 템플릿 A — 반응형 비전 디버깅

원본은 뷰포트를 스스로 정하고 넘침을 문서 레벨(`document.body`/`html`의 `scrollWidth`)로 재라고 시킨다. 이 저장소는 `html`·`body`에 `overflow-x: clip`이 걸려 있어(`src/index.css:602,607`) 그 단언은 항상 통과해 버린다(공허한 참). 아래로 교체해서 쓴다.

> 이 저장소에서 [화면/컴포넌트]의 반응형 넘침·잘림을 찾아라.
>
> - 문서 레벨(`document.body`/`html`)의 `scrollWidth`로 판정하지 마라 — `overflow-x: clip`이 걸려 있어(`src/index.css:602,607`) 항상 통과로 나온다. 판정은 **안쪽 요소** 각각에서 `scrollWidth - clientWidth > 1`로 재라.
> - 스윕 폭: 320·360·375·390·412·430(모바일) · 768(태블릿) · 1280(PC 기준)·1440(PC) · 1920(대형). 유저 화면(browse·live·community·GTO·profile)은 모바일 위주, 매장 운영주 화면(my-store·장부·클락 설정)은 PC 2종 위주로 본다.
> - 새 스캐너를 짜지 마라. `e2e/post-detail-read.spec.ts:112`의 `clippedNodes()`와 `e2e/home-flow-fit.spec.ts:140`의 `measure()`를 재사용하거나 같은 순서(line-clamp로 설계된 요약 제외 → **값 잘림**부터 확인 → `text-overflow: ellipsis` → 그 외 진짜 넘침)를 그대로 지켜라. 순서를 바꾸면 "말줄임은 설계"로 넘어가 값 잘림(예: 마감 시각·금액)을 놓친다 — 실제 재발 이력이 있다.
> - 글자 폭 대 가용 폭 비교는 `clientWidth - paddingLeft - paddingRight` 대 실제 텍스트 폭으로 재라 — `src/components/atoms/MarqueeText.tsx:31`이 그 관용구다.
> - 이 워크트리는 `.env.local`이 없어 `IS_MOCK=true`로 빌드된다 — 로컬 build/preview로는 화면이 안 그려진다(실측 확인됨). 소스 정적 분석과, 브라우저 도구가 있으면 손님 도메인 `https://nuriholdem.com`(운영 중 라이브)에서 실측하라. `npm run build`/`test:e2e`는 돌리지 마라 — 보호 파일 `public/sitemap.xml`을 덮는다.
> - file:line + 실측값으로만 보고하라. "좋아 보인다"는 보고가 아니다.

---

## 템플릿 B — Level 4~5 리팩토링

원본은 리팩터 "레벨"을 코드 구조 관점(함수 추출 → 모듈 분리 → 아키텍처 재설계)으로만 매긴다. 이 저장소에서 레벨 4~5(구조·아키텍처 변경)는 항상 **기능·데이터 보존** 검증을 동반해야 한다 — 마크업을 합치면서 안 옮겨간 기능이 게이트 전부 초록인 채로 조용히 사라진 실제 사고가 있었다(2026-09-12).

> 이 저장소에서 [대상 파일/영역]을 Level 4~5로 리팩토링하라(구조 변경 — 컴포넌트 분리·병합, 상태 이동, 파일 재배치 포함).
>
> - 스택은 자유다 — CLAUDE.md 2026-09-07 절에 따라 이징·색·아이콘 팩 제한은 없다. 남은 3원칙만 지킨다: §28 금액 표시 문구, 보안 코딩 표준(CLAUDE.md 하단), **기능·데이터 보존**(있던 기능·화면·데이터를 임의로 없애지 않는다).
> - 기존 관용구를 먼저 써라 — 새로 들이지 마라: 엘리베이션은 `--surface-base/low/mid/high/float` 5단(`src/index.css:306-310`)이 이미 있다. 그리드는 명시 트랙 + `minmax(0,1fr)`(`min-w-0` **455회** 확인(2026-09-16 재측정)) — `auto-fit`/`auto-fill`은 이 저장소에 0회이므로 새로 쓰면 그 자체가 결함이다.
> - 루트 폰트는 17px다(`src/index.css:594`, 50대 가독성 목적). 8/16/24 같은 수치는 절대 px이 아니라 **단계(step)**로 해석하라(오너 결정) — 8px을 리터럴 px로 박지 마라.
> - 도메인 경계는 `src/api/*.ts`다(`src/shared/types/`는 존재하지 않는다 — 확인됨). 원본 템플릿이 `src/shared/types`를 전제하면 무시하고 `src/api`의 기존 타입을 재사용하라.
> - 커뮤니티 목록/카드를 만질 거라면 실제 파일은 `src/components/features/community/PostRowCard.tsx`다(`PostRow`·`PostCard`를 **같은 파일**에서 export, 손님 화면과 운영자 광고 미리보기가 **같은 컴포넌트**를 쓴다) — `PostList.tsx`가 아니다. 컨테이너는 `CommunityTab.tsx`.
> - 리팩터 전후로 **삭제된 diff**를 직접 읽어라(`git diff --stat`가 아니라 `git diff`로 지워진 마크업·핸들러를 본다) — 게이트가 전부 초록이어도 기능이 소실될 수 있다.
> - 편집은 `nuri-edit`(CRLF/BOM 안전), 계약 통합은 `nuri-single-source`, 마무리 게이트는 `nuri-ship`을 각각 호출하라 — 그 절차를 여기서 베끼지 않는다.

---

## 템플릿 C — 계약 우선 회귀 차단

원본은 "리팩터 전에 계약(스냅샷/골든 테스트)을 먼저 세워라"는 절차인데, 이 저장소는 이미 그 절차를 스킬 4개로 나눠 갖고 있다. 여기서 새로 정의하면 같은 일을 두 방식으로 하게 되고, 그 자체가 결함이다(SlidingPill 사례와 같은 부류).

> 이 저장소에서 [대상]을 고치기 전에 회귀를 막을 계약을 세워라.
>
> - 계산이 여러 곳에 복제돼 있는지, 어디를 정본으로 통합할지, `*.contract.test.ts`를 무엇으로 세울지는 **`nuri-single-source`를 호출**해 정하라 — 여기서 재정의하지 않는다.
> - 변이(mutation) RPC/API를 건드린다면 PostgREST가 RLS 차단을 오류가 아니라 "0행 200"으로 돌려주는 함정이 있다 — **`nuri-affect`를 호출**해 `mustAffect`/`.select()`+검사/`idempotentOff`/`ALLOW` 중 무엇을 쓸지 정하라.
> - 세운 계약이 실제로 뭔가를 보고 있는지는 **`nuri-verify`를 호출**해 일부러 깨뜨려 빨간불이 되는지 확인하라 — 초록불만 보고 통과로 선언하지 마라.
> - 마무리 게이트(lint → vitest → build → bundle:budget, DB를 건드렸으면 Supabase 어드바이저까지)는 **`nuri-ship`을 호출**하라. E2E는 `npm run test:e2e`를 직접 돌리지 말고 **`nuri-e2e`**로 넘겨라(보호 파일 `public/sitemap.xml`을 덮는다).
> - 이 워크트리에서는 로컬 E2E/빌드 프리뷰가 구조적으로 안 된다(`.env.local` 없음 → `IS_MOCK=true`, 실측 확인됨) — 계약 자체는 정적으로 세우고, 실행·검증은 빌드 가능한 워크트리나 손님 도메인 실측이 되는 세션에 넘겨라.

---

## 이 스킬을 쓸 때 마지막 체크

- 위 세 프롬프트 중 어느 것도 새 금지 규칙을 만들지 않는다 — "이 파일 이 줄을 이렇게" 구체 변경만 요구한다.
- §28 카피 계약(참가비·GTD·상금 = 가격 정보로 표시 유지, '환전·현금·수익·시세표·에스크로' 계열 어휘 금지)은 세 템플릿 어디에서든 카피를 건드리면 항상 같이 확인한다.
- 보호 파일(`e2e/nuri-spot.spec.ts` · `public/sitemap.xml` · `src/lib/ranges.data.ts`)은 세 템플릿 어느 것으로도 수정 대상에 넣지 않는다.
  ⚠ `src/lib/spotEvaluate.ts` 는 2026-09-17 오너 지시로 **보호에서 내렸다**. `spotEvaluate.test.ts` 는 추가만 허용(기존 단언 삭제·약화는 리드 보고).
