# NURI HOLDEM — 이어서 하기 (인수인계 정본)

> **다른 Claude Code 계정·다른 컴퓨터에서 이어서 작업할 때 이 파일 하나만 읽으면 된다.**
> 한도가 끊기거나 계정을 바꿔도 이 파일은 git 에 있으므로 `git pull` 이면 따라온다.
>
> 마지막 갱신: **2026-09-15** · 갱신한 세션: `main` 브랜치, 배포까지 완료된 상태
> ⚠ **이 파일은 살아 있는 문서다.** 작업을 끝낼 때마다 "남은 일" 표와 "마지막 갱신"을 고쳐라.
> 날짜별 파일을 새로 만들지 마라 — 정본이 여러 개면 전부 못 믿게 된다.

---

## 0. 새 세션에서 붙여넣을 문구

아래를 그대로 복사해 Claude Code 에 붙여 넣어라.

```
누리홀덤 작업을 이어서 한다. 먼저 docs/HANDOFF.md 를 읽고 그대로 따라라.
그 다음 CLAUDE.md · AGENTS.md · .claude/rules/nuri-team-capabilities.md 를 읽어라.

시작 전에 반드시 확인할 것:
  git branch --show-current && git rev-parse HEAD && git status --short

HANDOFF.md 의 "3. 남은 일" 표에서 아직 안 끝난 항목을 이어서 하고,
끝나면 "6. 배포" 절차대로 배포까지 한다(커밋·푸시·배포는 오너가 상시 위임했다).
```

---

## 1. 이 프로젝트가 무엇인가 (30초)

- **운영 중인 라이브 서비스**다. 손님 도메인 `https://nuriholdem.com`.
- 유저는 **모바일 99%**(홈·라이브·커뮤니티·GTO·프로필), 매장 운영주는 **PC 99%**(내 매장·장부·클락).
- 클락은 매장 **대형 TV 로 송출**된다(1920×1080 · 1080×1920).
- 스택: Vite + React 19 + TS · Tailwind v3.4 · Supabase(RLS/RPC) · Vercel · Playwright · vitest.
- 정본 문서: `CLAUDE.md`(규약) · `AGENTS.md`(동시편집 금지) · `.claude/rules/nuri-team-capabilities.md`(팀·모델).

---

## 2. 지금 어디까지 왔나 (2026-09-15 기준)

### 배포 완료 — 손님 도메인에서 실측 확인함
가장 최근 커밋 `b09c7a8`. 오늘 배포한 주요 커밋:

| 커밋 | 내용 |
|---|---|
| `b09c7a8` | 계약 테스트 주석이 Tailwind 를 통해 죽은 CSS 를 만들던 것 |
| `9bedbb6` | **안드로이드에서 화면이 흔들리던 `dvh`** → `svh` + 재발 방지 계약 |
| `dc2e4c6` | **열 때 번쩍이던 4곳**(이벤트·로그인·약관·고객센터) + 자동 검사 게이트 |
| `9fe125d` | `nuri-e2e` 스킬 기준선을 사실과 맞춤 |
| `3f18d51` | 운영 데이터가 CI 를 깨던 결합 2건 |
| `7177c0a` | 라이트 테마에서 **안 보이던 클락 조작 패널**(흰 글자 × 흰 배경) |
| `6836e9c` | 라이트 `text-danger` 62곳 대비 미달 |

### 게이트 기준선 (이 숫자에서 나빠지면 통과가 아니다)
```
lint           0 errors / 281 warnings   ← warnings 는 전부 기존. errors 만 본다
vitest         2152 passed (194 files)
tsc -b --force rc=0
bundle:budget  통과 (여유 0~3% — 아슬아슬하다. 청크를 늘리면 바로 터진다)
E2E            538 passed / 0 failed / 26 skipped / 0 flaky
Supabase 어드바이저 보안 ERROR 0
```
🟢 **E2E 전량 초록은 2026-09-15 가 처음이다.** 예전 문서에 적힌 "허용되는 실패 1건"은 **폐기됐다**
(그 원인이던 마이그레이션을 적용했다). 이제 **빨간불은 전부 빨간불이다.**

### DB
`BLOCKED.md` #20 의 마이그레이션은 **전부 적용 완료**(17건). 어드바이저 보안 ERROR 0 유지 중.

---

## 3. 남은 일 — 오너 지시 13건 (2026-09-15 접수)

> 진행 상황을 여기서 관리한다. **끝낼 때마다 이 표를 고쳐라.**
> 상태: `⬜ 미착수` · `🔵 진행중` · `✅ 완료(배포됨)` · `⏸ 보류(사유 필수)`

| # | 오너 원문 요지 | 담당 파일(단독 편집자 1명) | 상태 |
|---|---|---|---|
| 1 | PC 에서 **내 매장 들어가는 순간 전체가 넓어져** 이질감 | `src/App.tsx` · `src/index.css` | ⬜ |
| 2 | 관리자 노출관리→광고→커뮤니티 광고에 **"게시글 연결 필요"인데 연결 UI 가 없다** | `src/components/features/community/AdSlotsAdmin.tsx` | ⬜ |
| 3 | 관리자 설정은 **모션보다 기능·연동·노출·위치·광고·회원·게시글 관리가 정확한 것**이 중요. 모션은 쓰되 이질감만 없게 | `src/components/features/AdminTab.tsx` | ⬜ |
| 4 | **이벤트가 있는데 PC 이벤트 탭엔 "이벤트 없음"** | `src/lib/eventSlug.ts` · `src/api/events.ts` · `src/App.tsx` | ⬜ |
| 5 | **프로필 카드 프레임에서 이름과 마크가 겹침.** 이 카드를 차라리 **인증서처럼** 만들면 좋겠다 | 프로필 카드 컴포넌트 | ⬜ |
| 6 | 랭킹 상점의 닉네임색·프로필 카드 프레임이 **"400점 소장"** → **"400점"** 으로. 좌우 공백이 크면 **"영구소장"** | `src/components/features/CustomerDashboardPage.tsx` 등 상점 | ⬜ |
| 7 | **응원 보내기 기능 전량 삭제** | `src/api/community.ts`(cheer) · `CommentThread` · `PostRowCard` · `PostDetailModal` | ⬜ |
| 8 | **랭킹 상점에서 뭘 사도 바뀌는 게 없다.** 실제로 반영되는지 확인 | 상점 구매 경로 전체 | ⬜ |
| 9 | 친구초대: 추천받은 사람이 **본인인증까지 마치면** 활동점수 말고 **이벤트 뽑기권 1개** 지급 | 초대 경로 + **DB 마이그레이션** | ⬜ |
| 10 | 내 매장→대시보드 맨 위 **"관리할 매장 선택"만 남기고 "운영자 전체 접근" 표기 제거**(일반 업주에게 보이면 안 됨) | `src/components/features/VenueManageTab.tsx` | ⬜ |
| 11 | 클락 **얼리가 0에서 -1 이면 -5000** 이 된다. **음수 금지** | `src/components/features/clock/**` · `src/api/clock.ts` | 🔵 |
| 12 | 클락 **중앙 네모 테두리 삭제** | `src/components/features/clock/ClockStage.tsx` | 🔵 |
| 13 | 클락 프라이즈가 **200등까지**일 때 20줄까지는 한 화면, **넘으면 몇 초 단위로 옆으로 자동 전환** | `src/components/features/clock/ClockStage.tsx` | 🔵 |

### 각 항목의 **완료 기준**(이게 있어야 "했다"고 말할 수 있다)

- **1** — 홈~GTO 와 내 매장의 **콘텐츠 폭을 실측**해 수치로 대조. 갑자기 넓어지는 원인(컨테이너 max-width 분기)을 찾아 없앤다. 전/후 폭 수치 필수.
- **2** — 관리자가 **실제로 게시글을 골라 연결**할 수 있고, 연결 후 그 광고 칸이 **손님 화면에 그 글로 뜨는 것**까지 확인. "연결 필요" 문구만 지우는 건 완료가 아니다.
- **3** — "이질감"의 정체를 **먼저 특정**해라(모션 길이? 전환 방식? 레이아웃 점프?). 짐작으로 모션을 지우지 마라. 오너는 **모션을 없애라고 하지 않았다** — "이질감만 없게" 다.
- **4** — **원인은 이미 확정됐다**(아래 §7-⑨). 임시로 slug 를 바꾸지 말고 **진행 중인 캠페인을 열도록** 구조를 고쳐라. 안 그러면 다음 이벤트에 또 난다.
- **5** — 겹침을 **스크린샷으로** 확인하고 고친다. "인증서처럼"은 **디자인 변경**이라 시안을 먼저 오너에게 보여라(`NEEDS_USER:`).
- **6** — 라벨만 바꾸는 일이지만 **좌우 공백을 실측**해서 "400점" 이냐 "영구소장" 이냐를 정해라.
- **7** — 삭제는 되돌리기 어렵다. **DB 컬럼·RPC 까지 지울지, 화면만 뗄지** 먼저 정하고 오너에게 알려라. `community_posts.cheer_count` 같은 비정규화 값이 있다.
- **8** — **구매 → 반영 사슬 전체**를 추적해라(포인트 차감·아이템 저장·화면 적용). 어디서 끊기는지 수치로. **포인트/돈이라 고위험** — `critical-reviewer` 급으로 다뤄라.
- **9** — **DB 변경이 필요하다.** `.claude/skills/nuri-migration/SKILL.md` 를 먼저 읽어라. 지급 시점이 "본인인증 완료"라 **중복 지급 방지**(멱등)가 핵심이다.
- **10** — 일반 업주 계정 시점에서 **안 보이는 것**을 확인. 관리자에게는 남아야 하는지 오너에게 확인.
- **11** — 개수 하한 0 **과** 금액 계산 둘 다. 음수가 장부·정산·상금까지 번졌는지 추적(`nuri-affect` 스킬). 회귀 테스트 필수.
- **12** — 무엇을 가리키는지 **스크린샷으로 특정**한 뒤 지워라. 지우고 레이아웃이 밀리지 않는지 확인.
- **13** — 20줄 이하는 **지금과 픽셀 단위로 동일**해야 한다. `prefers-reduced-motion` 에서도 **뒷부분에 도달 가능**해야 한다(못 보면 기능 소실).

---

## 4. 🔴 절대 어기면 안 되는 것

### 보호 파일 — 오너가 직접 작업 중. **읽기만 하고 수정 금지**
```
e2e/nuri-spot.spec.ts
public/sitemap.xml
src/lib/ranges.data.ts
src/lib/spotEvaluate.test.ts
src/lib/spotEvaluate.ts
```
⚠ `npm run build` 와 `npm run test:e2e` 는 **`public/sitemap.xml` 을 덮어쓴다.** §5 절차를 써라.

### 라이브 DB
- 조사·테스트에서 **쓰기 0**. 하네스에서 비-GET 은 전부 abort.
- **운영 데이터를 지워서 테스트를 통과시키지 마라.** 이게 이 부류의 최악의 오답이다.
- DB/RLS/RPC 마이그레이션은 **작성과 적용 판단을 리드가 조정**한다. 쓰기 전에 `.claude/skills/nuri-migration/SKILL.md`.

### 비밀
- `.env.local`(gitignore)·GitHub Secrets·Supabase Vault 만. **`VITE_*` 는 번들에 박히는 공개 값**이다.
- **이 문서에 토큰을 적지 마라.** Vercel 토큰은 오너에게 받아 환경변수로만 쓴다.

### 동시 편집
- **파일별 편집자는 정확히 한 명.** 병렬은 **읽기 전용 조사만.**
- ⚠ **남이 편집 중인 트리에서 게이트를 돌리지 마라.** 2026-09-15 에 실제로 겪었다 —
  중간 저장 상태를 검사해 **있지도 않은 실패 2건**이 나왔다. 검사는 트리가 멈춰 있을 때만 의미가 있다.

### 자율 수정 금지
하위 에이전트는 자기 agent 정의 · `.claude/skills/**` · `.claude/hooks/**` · `CLAUDE.md` ·
`AGENTS.md` · `.claude/settings.json` 을 **스스로 고치지 않는다.** 리드에게 제안만 한다.

---

## 5. 게이트 돌리는 법

```bash
cd "C:/Users/buffy/OneDrive/바탕 화면/누리홀덤"
npx tsc -b --force          # rc=0
npm run lint                # 0 errors (warnings 281 은 기존)
npm run test                # 2152 passed
npm run bundle:budget       # 통과 (여유 0~3%)
```

### E2E — **`npm run test:e2e` 를 그냥 돌리지 마라** (보호 파일을 덮는다)
`.claude/skills/nuri-e2e/SKILL.md` 의 절차를 쓴다. 요지:
1. `public/sitemap.xml` 을 **저장소 밖으로 백업**하고 `git hash-object` 로 기준 해시를 잡는다
2. 포트 4173 이 비었는지 확인(점유 중이면 `taskkill //PID <PID> //F`)
3. `npm run build` → **즉시 sitemap 복원** → 해시 대조(다르면 중단)
4. `npx vite preview --port 4173 --strictPort &` → 서빙 엔트리와 `dist/index.html` 엔트리 **대조**
5. `E2E_BASE_URL=http://localhost:4173 npx playwright test --grep-invert @boot --retries=2`
   그리고 `--grep @boot --workers=1`
6. preview 를 `taskkill` 로 죽이고 **sitemap 최종 해시 재대조**

⚠ `git checkout -- public/sitemap.xml` **금지** — 작업트리와 HEAD 가 달라서 보호 내용이 날아간다. 백업 복사로만 복원.
⚠ **dev 서버(5173)에서 잰 숫자를 보고하지 마라** — modulepreload·청크 분리·정적 셸이 없어
`boot-budget`·`gto-tab-verify`·`static-shell` 이 **환경 탓으로** 빨개진다.

---

## 6. 배포하는 법 (오너가 상시 위임했다 — 물어보지 말고 해라)

### 🔴 **빌드 READY ≠ 배포 완료.** 이 프로젝트는 도메인이 자동으로 안 따라온다
2026-09-14 하루에 **세 번 연속** 같은 일이 났다. 푸시 → Vercel 이 production 으로 빌드 →
**alias 만 안 붙음** → 손님은 옛날 화면을 본다. 그래서 **매번 alias 를 직접 건다.**

```
1) git push origin main
2) Vercel API 로 그 커밋의 production 배포를 찾아 READY 까지 기다린다
3) POST https://api.vercel.com/v2/deployments/<dplId>/aliases
   Authorization: Bearer $VERCEL_TOKEN     body: {"alias":"nuriholdem.com"}
   → **nuriholdem.com 과 www.nuriholdem.com 둘 다** 건다
4) 손님 도메인에서 **실측**한다(아래)
```
토큰은 오너에게 받아 `VERCEL_TOKEN` 환경변수로만 쓴다. 프로젝트는 `nuri-holdem`.

### 배포 실측 — 무엇을 증거로 쓰나
- 🔴 **"자산이 200 이다"를 증거로 쓰지 마라.** `vercel.json` 의 `/(.*)` → `/index.html` rewrite 때문에
  **없는 파일도 200(HTML 약 24,640 bytes)** 이 온다. 크기·Content-Type 까지 보거나 내용으로 확인해라.
- **청크 해시 지문(권장)**: 라이브 `/` HTML 에서 `/assets/index-*.css`(또는 `.js`) 이름을 뽑아 내려받고,
  **그 커밋에만 있는 문자열**을 grep 한다.
  ⚠ 미니파이어가 **같은 값의 셀렉터를 한 규칙으로 합치고**, Tailwind 클래스의 대괄호·콜론은
  **백슬래시로 이스케이프**된다(`.sm\:grid-cols-5`, `.min-h-\[50svh\]`). 정확한 문자열 대신 **패턴**으로 찾아라.
  ⚠ lightningcss 가 미디어쿼리를 최신 문법으로 바꾼다 — `@media (min-width:640px)` 가 아니라 **`@media (width>=640px)`** 다.
- ⚠ **sitemap `lastmod` 는 KST 자정~오전 9시에는 쓸모없다.** `gen-sitemap.mjs` 가 `toISOString()`(**UTC**)을 쓴다.
  KST 00:35(9/15) 빌드가 `2026-09-14` 로 찍힌다. 그 시간대엔 청크 해시로만 판정해라.

---

## 7. 🔴 오늘 비싸게 배운 함정 (같은 데서 또 막히지 마라)

① **가설은 결론이 아니다.** 2026-09-15 에 리드 가설이 **세 번 연속 틀렸다**
(알림 스크림 `plus-lighter` / 번쩍임 View Transition / 내 스팟 렌더 루프). 전부 측정으로 반증됐다.
가설은 **어디부터 잴지**만 정해 준다.

② **코드보다 데이터가 먼저.** `select count(*) from spot_reviews` → **0행** 한 줄이 가설 3개를 동시에 지웠다.
"이 화면에 지금 무엇이 들어 있나"를 먼저 봐라.

③ **PC 하네스는 모바일을 못 본다.** E2E 프로젝트 이름이 `mobile-chromium` 이지만 **데스크톱 에뮬레이션**이다.
주소창 접힘이 없어 **`dvh` == `svh` == `lvh`** 다. 뷰포트 높이를 6단으로 훑고도 "혐의 없음"이 나왔다.
**재현 못 함 ≠ 없음.** 못 재면 소스에서 막아라(→ `src/components/dynamicViewportUnit.contract.test.ts`).

④ **`toBeVisible` 이 거짓 통과한다.** `filter({ hasText: '글쓰기' })` 가 **본인인증 게이트 시트**의
"'글쓰기'는 본인인증이 필요해요" 문구에 붙어 통과했고, 정작 테스트 대상은 열리지도 않았다.
**부분일치 셀렉터는 실패할 때보다 통과할 때 더 위험하다.** `getByRole(name)` 으로 **좁혀라.**

⑤ **테스트가 운영 데이터를 탄다.** `e2e/_fixtures.ts` 의 가드는 **쓰기만** 끊는다. 읽기는 운영으로 나간다.
`if (opts.x) page.route(...)` 처럼 **조건부 목킹**은 "안 넘기면 기본값"이 아니라 **"안 넘기면 라이브"** 다.
배너 **한 장을 등록했더니 커밋 0개로 스펙 9건이 빨개졌다.**
실측: 운영을 목킹 없이 읽는 스펙 파일이 **91개 중 83개**다. `home_banners` 만 막아 뒀고 나머지는 그대로다.
👉 **코드를 안 바꿨는데 빨개지면 회귀부터 의심하지 말고 운영 데이터 결합을 먼저 배제해라.**

⑥ **"flaky" 라는 꼬리표가 미진단 결함일 수 있다.** `event-backnav:70` 이 flaky 목록에 있었는데
`--retries=2` 로 돌리니 retry 0회 통과였다. 지난 실패는 경합이 아니라 ⑤였다.
**"이번에 안 나왔다" 와 "반증됐다" 는 다르다.**

⑦ **Suspense 폴백 스로틀.** `lazyWithReload` 는 `lazy(async …)` 라 **청크가 캐시에 있어도 첫 렌더에 한 번 서스펜드**한다.
그냥 `setState` 로 열면 리액트가 불투명 폴백을 커밋하고 **최소 ~300ms 붙잡는다.**
👉 **여는 setState 를 `startTransition` 으로 감싸라.** 진입점이 여럿이면 `openXxx` 하나로 모아서.
👉 구별법: **청크를 미리 데워도 안 사라지면 네트워크가 아니라 스로틀이다.**

⑧ **같은 오리진이어도 `location.assign` 은 전체 리로드다.** 앱이 재부팅돼 홈이 스켈레톤으로 되돌아갔다 온다.
앱 안에서 열 수 있는 목적지는 앱 안에서 열어라. **모르는 링크는 기존 경로로 떨어뜨려야** 정적 페이지가 안 죽는다.

⑨ **이벤트 중복 제거가 slug 를 안 본다** — `src/components/features/HomeTab.tsx` 의
`banners.some(b => /[?&]event=/.test(b.linkUrl))` 는 **`?event=` 문자열만** 본다.
그런데 홈 진입이 여는 것은 `CARD_EVENT_SLUG`(`card-open-2026-09`)이고 배너는 `rotiarena-attend` 다 —
**다른 캠페인인데 "중복"으로 판정**한다. 👉 **이것이 남은 일 #4 의 원인이다.**

⑩ **Tailwind 는 주석까지 스캔한다.** `content: ['./src/**/*.{js,ts,jsx,tsx}']` 는 평문 스캔이라
**주석에 적은 클래스도 CSS 를 만든다.** `dvh` 를 금지하는 계약 테스트의 설명문에 그 클래스를 적었더니
라이브 CSS 에 죽은 규칙이 실렸다. **금지하려는 클래스명을 주석에 그대로 쓰지 마라.**

⑪ **줄끝이 파일마다 다르다.** `App.tsx` 는 **LF**, `HomeTab.tsx`·`MySpotList.tsx` 는 **CRLF**, BOM 있는 파일도 있다.
**편집 전에 재고, 편집 후에 다시 재라.** 파이썬으로 고칠 때 `\n` 으로 매칭하면 CRLF 파일에서 빗나간다.

⑫ **`.codex/config.toml` 은 다른 도구(Codex)의 변경이다.** 커밋하지 말고 건드리지 마라.

⑬ **`.git/worktrees` 고아 10개** 때문에 커밋마다 `Permission denied` 경고 10줄이 나온다.
**커밋 자체는 성공하므로 무해하다.** 정리하려면 OneDrive 동기화를 멈추고 권한이 필요하다(오너 몫).

---

## 8. 팀·모델 운영

- 정본: `.claude/rules/nuri-team-capabilities.md`.
- 기본 배정: 단순 점검 haiku · 명확한 저위험 구현/정형 검증 **Sonnet 5** · 조정 **Opus 5**.
  **디자인/이미지 해석 · 보안/권한 · 이용권 · GTO 계산 · 복잡한 연동 · 첫 재발**은 **Fable 5.1**.
- ⚠ **2026-09-15 기준 Fable 5.1 은 한도 소진 상태였다**(4회 연속 거절). 오너 상시 지시:
  **한도가 차면 Opus 5 로 전환한다. 크레딧 구매·계정 전환 금지.** `/usage-credits` 를 부르지 마라.
- 하위 에이전트는 **사용자에게 직접 묻지 않는다.** `NEEDS_USER:` 로 리드에게 올리고 **리드가 묻는다.**
- 구현이 끝나면 **독립 검증**을 붙인다.
- ⚠ 에이전트에게 메시지가 **엇갈려 닿을 수 있다.** 같은 결정을 두 번 물어오면 **한 장으로 압축해서** 다시 보내라.

---

## 9. 열린 결정 · 미검증 (숨기지 말 것)

| 항목 | 상태 |
|---|---|
| **내 스팟 흔들림(`dvh`→`svh`)** | 고쳐서 배포했지만 **실기기 확인 못 함.** PC 에 주소창이 없다. 오너 안드로이드에서 재확인 필요. 여전히 흔들리면 원인은 다른 데 있다 |
| **매장 상세 열 때 18프레임·853ms** | 안 고침. `handleVenueClick` 이 VT 모핑 때문에 `flushSync` **동기 커밋**이라 `startTransition` 처방이 안 먹는다. **모핑을 포기할지가 설계 결정** |
| **공지 상세 18프레임·377ms** | 안 고침. 처방은 한 줄인데 진입 경로가 운영 데이터에 의존해 재현이 불안정했다 |
| **`NotificationPanel.tsx` 의 전체 리로드** | **의도적**이다(주석에 근거). 쿼리·해시형 딥링크는 SPA 핸들러가 모르고 부팅 딥링크가 1회 ref 로 잠겨 있다. 걷어내려면 이펙트 여러 개를 재진입 가능하게 만들어야 한다 |
| **E2E 운영 데이터 결합** | 91개 중 83개 파일이 운영을 읽는다. `home_banners` 만 막았다. **다음은 다른 테이블로 온다** |
| **`gemini` 엣지 함수 완전 삭제** | 스텁으로 통로는 닫았으나 함수는 ACTIVE. **Supabase 대시보드에서 오너만** 가능 |
| **`.git/worktrees` 고아 10개** | 권한 차단. 무해하지만 경고가 나온다 |
| **모바일 사각지대 감사** | 2026-09-15 진행 중이었다. `AdminTab.tsx`·`CustomerDashboardPage.tsx`·`EventPage.tsx`·`LedgerWorkspace.tsx`·`index.css` 에 **미완성 변경이 남아 있을 수 있다.** 이어받기 전에 `git status --short` 와 `npx tsc -b --force` 로 상태부터 확인해라 |

---

## 10. 작업을 끝낼 때

1. 게이트 4종(§5) — 기준선보다 나빠지면 통과가 아니다
2. 커밋 — 무엇을 **왜** 고쳤는지, **측정값**과 **미검증**을 본문에 남긴다
3. 푸시 → 배포 → **alias 2개** → **손님 도메인 실측**(§6)
4. **이 파일의 §3 표와 "마지막 갱신"을 고친다**
5. 오너에게 보고할 때 **"고친 것 / 남긴 것(이유) / 미검증"** 을 갈라서 적는다 —
   **"좋아 보임"·자기평가·문서 작성은 완료가 아니다.**
