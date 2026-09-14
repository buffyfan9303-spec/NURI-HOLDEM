---
name: nuri-e2e
description: NURI HOLDEM 의 Playwright E2E 를 실제로 돌려야 할 때 호출하라 — nuri-ship 게이트의 E2E 단계, "테스트 돌려줘"·"회귀 확인해줘", 빌드 산출물이 바뀐 뒤 검증, 이미 난 실패가 플레이크인지 회귀인지 판정. `npm run test:e2e` 를 그냥 돌리면 보호 파일 public/sitemap.xml 이 덮이므로 이 절차로 대체한다.
---

# nuri-e2e — E2E 를 보호 파일을 덮지 않고, 거짓 통과 없이 돌리는 절차

`npm run test:e2e` 를 **그대로 실행하지 마라.** 이 스킬이 그 자리를 대신한다.
(`nuri-ship` 의 1~3단계 — lint · vitest · build — 는 그대로 `nuri-ship` 이 한다. 여기는 **E2E 단계만**이다.)

## 왜 그냥 돌리면 안 되나 (2026-09-13 저장소 실측)

`package.json:20-22` — `test:e2e` 는 playwright 를 **두 번** 띄운다.

```
test:e2e      = test:e2e:main && test:e2e:boot
test:e2e:main = playwright test --grep-invert @boot
test:e2e:boot = playwright test --grep @boot --workers=1
```

`playwright.config.ts:69-70` — `E2E_BASE_URL` 이 **없으면** 각 실행마다 webServer 가
`npm run build && npx vite preview --port 4173 --strictPort` 를 돈다. 즉 **빌드가 2회**다.

`package.json:8` — `build` 는 `node scripts/gen-sitemap.mjs && node scripts/gen-thumbs.mjs && tsc -b && node scripts/gen-legal.mjs && vite build`.
`scripts/gen-sitemap.mjs:13-22, 78` — `.env.local` 을 직접 파싱해 `VITE_SUPABASE_URL/ANON_KEY` 를 얻고,
운영 Supabase 로 anon 읽기 **2건**(`schedules?approved=eq.true`, `venues?approved=eq.true&status=eq.active`)을 보낸 뒤
**`public/sitemap.xml` 을 통째로 다시 쓴다.** 그 파일은 보호 대상이다 → 그냥 돌리면 2회 덮인다.

`playwright.config.ts:69` — 반대로 **`E2E_BASE_URL` 이 있으면 `webServer` 가 `undefined`** 라 빌드가 아예 안 돈다.
이게 안전 경로의 근거다. 실측으로 확인했다(아래 "판정 기준" ①).

> `npm run build` 가 건드리는 다른 산출물(`public/legal/*.html`·썸네일)은 결정적이라 재생성해도 바이트가 같다 —
> 실측: 마지막 빌드 직후 `git status --porcelain public/` 이 `M public/sitemap.xml` **한 줄뿐**. 백업 대상은 sitemap 하나다.

### 🔴 `git checkout` 으로 복원하지 마라

`public/sitemap.xml` 은 **작업트리와 HEAD 가 다르다**(실측: 작업트리 `6130e085…` vs `HEAD` `c1949c57…`).
`git checkout -- public/sitemap.xml` / `git restore` 는 **HEAD 판으로 되돌려** 보호 내용을 조용히 날린다.
복원은 반드시 **직접 뜬 백업 파일 복사**로 한다.

---

## 안전 실행 스크립트 (Bash 도구에 그대로 붙여라)

```bash
cd "C:/Users/buffy/OneDrive/바탕 화면/누리홀덤"
set -e

# ① 보호 파일 백업 + 기준 해시 (저장소 밖에 둔다)
BK="$(mktemp)"; cp public/sitemap.xml "$BK"
H0=$(git hash-object public/sitemap.xml); echo "[1] sitemap 기준 $H0"

# ② 포트 확보 — vite 는 --strictPort 라 점유돼 있으면 그냥 죽는다
#    실측: "error when starting preview server: Error: Port 4173 is already in use"
#    점유 중이면 아래 "포트 정리" 로 죽이고 다시 시작해라 (지난 실행이 흘린 고아일 확률이 높다)
netstat -ano | grep -E ':4173 .*LISTENING' && { echo "!! 4173 점유 중 — 아래 '포트 정리'로 죽여라"; exit 1; }

# ③ 빌드는 내가 직접 돈다 (여기서 sitemap 이 덮인다 — 예상된 동작)
npm run build

# ④ 즉시 복원 + 해시 재확인.  여기서 안 맞으면 그 뒤는 진행하지 마라
cp "$BK" public/sitemap.xml
H1=$(git hash-object public/sitemap.xml)
[ "$H0" = "$H1" ] || { echo "!! 복원 실패: $H0 != $H1"; exit 1; }
echo "[4] sitemap 복원 확인 $H1"

# ⑤ preview 기동 — 고정 sleep 대신 실제로 응답할 때까지 기다린다(콜드 스타트가 3초를 넘으면 ⑥이 헛탕)
npx vite preview --port 4173 --strictPort &
curl -s --retry 20 --retry-delay 1 --retry-connrefused -o /dev/null http://localhost:4173/

# ⑥ stale dist 차단 — 서빙되는 엔트리 == 방금 빌드한 엔트리인가
S=$(curl -s http://localhost:4173/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
D=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
[ -n "$S" ] && [ "$S" = "$D" ] || { echo "!! stale/미기동: 서빙 [$S] vs dist [$D] — 아래 '포트 정리' 로 preview 를 죽이고 다시"; exit 1; }
echo "[6] 엔트리 일치 $S"

# ⑦ E2E — E2E_BASE_URL 이 있으므로 webServer 는 undefined, 빌드는 안 돈다
#    🔴 set -e 를 반드시 끈다. 실패가 1건이라도 나면(③의 BLOCKED #20 은 **정상 경로다**)
#       playwright 가 1 로 끝나 스크립트가 여기서 죽고 — ⑧의 보호 파일 대조가 통째로 안 돈다.
set +e
E2E_BASE_URL=http://localhost:4173 npx playwright test --grep-invert @boot --reporter=list; RC_MAIN=$?
E2E_BASE_URL=http://localhost:4173 npx playwright test --grep @boot --workers=1 --reporter=list; RC_BOOT=$?
set -e

# ⑧ 뒷정리 + 최종 대조 (여기 출력이 $H0 와 같아야 끝난 것이다)
#    🔴 `kill $!` 로는 안 죽는다 — 실측(2026-09-13): 종료되는 것은 npx 래퍼뿐이고
#       포트를 쥔 node 는 살아남아 계속 200 을 준다. 포트를 잡은 PID 를 직접 죽여라.
PORT_PID=$(netstat -ano | grep -E ':4173 .*LISTENING' | awk '{print $NF}' | head -1)
[ -n "$PORT_PID" ] && { taskkill //PID "$PORT_PID" //F || true; }
echo "[8] rc main=$RC_MAIN boot=$RC_BOOT"
echo "[8] sitemap 최종 $(git hash-object public/sitemap.xml)  / 기준 $H0"
```

**포트 정리** (②가 막았을 때 · 지난 실행이 고아를 남겼을 때 — Git Bash 에서 `//` 두 개가 맞다):

```bash
P=$(netstat -ano | grep -E ':4173 .*LISTENING' | awk '{print $NF}' | head -1); echo "점유 PID=$P"
taskkill //PID "$P" //F
netstat -ano | grep -E ':4173 .*LISTENING' || echo FREE
```

주의 몇 개 (전부 실측):

- **`@boot` 는 `--workers=1` 을 유지해라.** '무엇이 먼저 출발했는가' 를 재는 스펙이라(`ci.yml:73-74`)
  워커가 CPU 를 다투면 측정 대상 자체가 왜곡된다. 병렬로 합치지 마라.
- **URL 은 `localhost` 로 써라. `127.0.0.1` 은 안 된다.** 이 머신에서 preview 는 `::1`(IPv6) 에만 바인딩된다 —
  실측: `curl http://localhost:4173/` → 200 / `curl http://127.0.0.1:4173/` → 연결 실패(`000`).
- **🔴 `kill $!` 는 preview 를 못 죽인다(2026-09-13 이 머신 실측).** 포트 4199 로 대조:
  `npx vite preview &` → `kill $PV` 가 **rc=0** 을 돌려주는데도 `netstat` 에 같은 PID 가 `LISTENING` 으로 남고
  `curl` 은 계속 **200**. 죽는 것은 npx 래퍼고 node 가 고아로 남는다.
  → 다음 실행이 ②에서 막힌다. `taskkill //PID <PID> //F` 로 죽여야 포트가 풀린다(대조 확인: 그 뒤 `000`).
- **preview 는 dist 를 디스크에서 매 요청 읽는다.** 실측(dist 에 프로브 파일을 넣고 내용을 바꿔 curl):
  새 파일도 바뀐 내용도 재기동 없이 즉시 반영됐고 `Cache-Control: no-cache` 다.
  → 이미 preview 가 떠 있다면 ②를 건너뛰고 ③④만 한 뒤 ⑥으로 가도 된다. **⑥은 어떤 경우에도 건너뛰지 마라.**
- 자격증명(`E2E_EMAIL`/`E2E_PASSWORD`)은 `playwright.config.ts:10-17` 이 `.env.local` 에서 채운다.
  없으면 로그인 스펙이 **조용히 skip** 된다 — 통과 개수가 갑자기 줄면 이걸 먼저 의심해라.

---

## 판정 기준 — 무엇을 보고 "통과" 라고 하는가

### ① 보호 파일이 안 덮였는가 (이게 1순위다)
⑧의 `git hash-object` 출력 == ①의 `$H0`. 다르면 **통과라고 말하지 마라.**
`E2E_BASE_URL` 경로가 실제로 빌드를 건너뛴다는 것은 실측했다 —
`design-tokens.spec.ts` 17개를 이 경로로 돌린 전후 `public/sitemap.xml`(`6130e085…`)과
`dist/index.html`(`046ef659…`) 해시가 **둘 다 그대로**였다(7.4초, 17 passed).

### ② 수치로 말한다
현재 등록 규모(2026-09-15 실측 `--list`): **main 552 tests / 91 files + boot 2 tests / 1 file = 554 실행**.

기준선(2026-09-15 전량 실행, preview 4173 프로덕션 빌드, `--retries=2`):
**main 526 passed / 0 failed / 26 skipped / 0 flaky · boot 2 passed = 528 passed / 0 failed / 26 skipped**.
🟢 **이 저장소에서 E2E 전량 초록은 이때가 처음이다.** 빨간불 하나라도 남으면 통과가 아니다 — 아래 ③ 참고.
네가 돌린 결과가 다르면 **네 결과가 기준**이다. 보고는 `N passed / M failed / K skipped (F flaky)` 로 한다 —
"그린" · "잘 됨" 은 완료 증거가 아니다.

### ③ 허용되는 실패는 **없다** (2026-09-15 변경)

예전에 여기 "유일하게 허용되는 실패 1건 = `e2e/auth-smoke.spec.ts:93`(BLOCKED #20 미적용)" 이라고 적혀 있었다.
**그 면제는 끝났다** — 2026-09-14~15 에 `20260911a` 를 포함해 마이그레이션을 운영에 적용해서
`community_ads_public` 이 생겼고, 그 스펙은 통과한다(실측: `auth-smoke.spec.ts` 의 `:24`·`:36`·`:59`·`:93` 4건 전부 ✓).

**이제 실패는 전부 실패다.** 하나라도 빨간불이면 통과라고 말하지 마라.
⚠ 실패를 봤을 때 **회귀부터 의심하지 말고 `운영 데이터 결합`을 먼저 배제해라** — 아래 ⑦ 이 그 절차다.

### ④ flaky 인가 회귀인가
**단독 재실행이 통과했다고 플레이크라고 단정하지 마라.** 단독 실행은 부하 조건이 다르다.
판정은 **전체를 `--retries=2` 로 돌려 Playwright 가 스스로 `flaky` 로 분류하는지** 보는 것이다
(로컬 기본은 `retries: 0`, 2 는 CI 에서만 — `playwright.config.ts:32`. 그래서 1회 실행으로는 플레이크가 아예 안 보인다).

```bash
E2E_BASE_URL=http://localhost:4173 npx playwright test --grep-invert @boot --retries=2 --reporter=list
```

- 리포터가 `flaky` 로 세면 → 부하 플레이크. 알려진 목록이 `playwright.config.ts:32` 주석에 있다:
  **subtab-motion root 이동 · clock-catchup · shout-queue**.
  2026-09-15 전량 `--retries=2` 실행에서 관측된 것(네 개를 **다른 등급으로** 갈라 적는다 — 뭉뚱그리면 다음 사람이 오판한다):

  | 스펙 | 2026-09-15 관측 | 등급 |
  |---|---|---|
  | `event-backnav.spec.ts:70` | ✓ 통과, retry 0회 | **반증됨.** 지난 실패는 flake 가 아니라 `home_banners` 운영 결합(⑥)이었다 — 목록에서 뺀다 |
  | `subtab-motion.spec.ts` | ✓ 8건 통과, retry 0회 | **이번엔 안 나왔을 뿐.** 반증 아님 — 남긴다 |
  | `shout-queue.spec.ts` | ✓ 3건 통과, retry 0회 | **이번엔 안 나왔을 뿐.** 반증 아님 — 남긴다 |
  | `clock-catchup.spec.ts` | ⊘ 2건 skip | **관측 자체가 없다.** `:68` 의 `test.skip(!EMAIL \|\| !PASSWORD \|\| !WRITES_ALLOWED)` 때문에 **운영 프로젝트(쓰기 차단)에서는 구조적으로 영원히 skip** 이다 — 로컬 안전 절차로는 flaky 여부를 판정할 방법이 없다 |

  ⚠ "이번 실행에서 안 나왔다" 와 "반증됐다" 는 다르다. 목록에서 빼려면 **왜 지난 실패가 flake 가 아니었는지**를 대야 한다.
- 재시도를 다 쓰고도 `failed` 면 → **회귀다.** 플레이크로 부르지 마라.
- 목록에 없는 스펙이 flaky 로 나오면 **새 불안정성**이다. 목록에 얹지 말고 원인을 봐라.

### ⑤ 그 변경이 실제로 번들에 들어갔는지 — 🔴 함수명으로 찾지 마라
미니파이가 함수·변수 이름을 지운다. 실측:

| 찾은 것 | src | dist | 판정 |
|---|---|---|---|
| `regCloseLevelFromText` (함수명) | 5곳 | **0곳** | 지워진다 — 이걸로 확인하면 "안 들어갔다"고 오판한다 |
| `earliesRaw` (객체 속성명) | 있음 | `dist/assets/clock-*.js` | 보존 |
| `LV/i` (정규식 리터럴) | 있음 | `dist/assets/index-*.js` | 보존 |

→ **문자열 리터럴 · 정규식 리터럴 · 외부와 주고받는 객체 속성명**으로 추적해라.

```bash
grep -rl 'earliesRaw' dist/assets | head        # 속성명 — 보존됨
grep -rlo 'LV/i'      dist/assets | head        # 정규식 리터럴 — 보존됨
```

### ⑥ HTTP 상태로 파일 존재를 확인하지 마라
preview 는 SPA 폴백이라 **없는 경로에도 200 + index.html** 을 준다 —
실측: `curl -o /dev/null -w '%{http_code}' http://localhost:4173/__never_existed.txt` → `200`.
"200 이니까 배포됐다" 는 거짓 통과다. 신선도 판정은 ⑥단계의 **엔트리 해시 대조**뿐이다.

### ⑦ 코드를 안 바꿨는데 빨개졌다면 — **운영 데이터 결합부터 배제해라** (2026-09-15 사고)

실제로 있었던 일: 오너가 운영에 배너 **1건**을 등록했는데 그 `link_url` 이 `/?event=rotiarena-attend` 였고,
`src/components/features/HomeTab.tsx:286` 의 중복 제거(`?event=` 링크를 가진 배너가 있으면 이벤트 슬라이드를
넣지 않는다)가 발동해 **커밋 0개로 스펙 9건이 빨개졌다**(home-event-banner ①~④ · event-entry ×3 ·
event-backnav ×2 · a11y-modal 이벤트 닫기). 제품은 멀쩡했다 — **테스트가 운영 데이터를 타고 있었다.**

**왜 생기나**: `e2e/_fixtures.ts` 의 context route 는 **쓰기만** 끊는다. 읽기는 그대로 운영으로 나간다.
그리고 스펙이 `if (opts.banners) await page.route(...)` 처럼 **조건부로** 목킹하면
"안 넘기면 기본값" 처럼 보이는 코드가 실제로는 **"안 넘기면 라이브"** 다.

**구멍의 크기(2026-09-15 실측)** — 운영 Supabase 를 목킹 없이 읽는 스펙 파일이 **91개 중 83개**다.
상위 테이블: `app_settings` 2253 · `community_posts` 1191 · `venues` 1105 · `clock_states` 1045 ·
`schedules` 978 · `home_banners` 892(전체 17,394건 계측).
`home_banners` 는 fixture 에서 기본 `[]` 로 막았다(`_fixtures.ts`). **나머지는 안 막혀 있다** — 다음은 다른 테이블로 온다.

**계측하는 법** — `_fixtures.ts` 의 `route.continue()` **직전**에 URL 로그를 넣고 전체를 1회 돌린다.
스펙이 `page.route` 로 이미 이긴 요청은 거기까지 오지 않으므로, 찍히는 것이 곧 **"목킹 없이 운영으로 나간 요청"** 이다.

**판정 순서**:
1. 그 스펙이 **어느 표를 목킹 없이 읽는지** 위 방법으로 찾는다.
2. 그 응답만 바꿔 **배타 가설**로 가른다 — 존재가 문제인지, 특정 **값**이 문제인지.
   (그 사고에서는 같은 배너의 `link_url` 만 `/live` 로 바꾸니 되살아났다. **배너의 존재가 아니라 `?event=` 문자열 하나**가 변수였다.)
3. 🔴 **운영 데이터를 지워서 초록을 만들지 마라.** 그게 이 부류의 최악의 오답이다.
   고칠 곳은 **목킹의 기본값**이지 오너의 자산이 아니다.
4. `context.route` 를 **밖에 따로 걸지 마라** — Playwright 는 route 를 **나중에 등록된 것부터** 맞춰 보므로
   기존 `SUPABASE_API` 핸들러가 먼저 이겨 조용히 무효가 된다(실측: 통과 수 변화 0). **기존 핸들러 안**에 넣어라.

### ⑧ `toBeVisible` 이 **거짓 통과**할 수 있다 — 부분일치 셀렉터 (같은 날)

`drag-close.spec.ts` 가 `page.locator('[role="dialog"]').filter({ hasText: '글쓰기' })` 로 시트를 찾았는데,
운영 계정에 `ci_hash` 가 없어(`src/api/auth.ts:99` `verified: !!row.ci_hash`) 글쓰기 대신 **본인인증 게이트 시트**가
열렸고 그 시트의 **"'글쓰기'는 본인인증이 필요해요"** 문구에 붙어 `toBeVisible` 이 **통과**했다.
스펙은 그 뒤 제목 입력에서 타임아웃했다 — **검증 대상에 도달조차 못 하는 죽은 커버리지**였다.

→ 접근성 이름으로 **좁혀라**: `getByRole('dialog', { name: '글쓰기' })`.
→ 로그인 게이트(본인인증·권한)가 막아 도달이 안 되면, **도달 조건만** 목킹하고 **단언은 손대지 마라**.
   `profiles` 를 고정 객체로 갈아치우지 말고 **필요한 필드만 덧붙여라**(운영 응답의 나머지는 그대로 통과).
→ 셀렉터를 고친 뒤에는 **일부러 결함을 넣어 빨개지는지** 보고 원복해라(`git hash-object` 로 바이트 동일 확인).
   "고쳤더니 초록" 은 그 스펙이 살아 있다는 증거가 아니다.

---

## 이 스킬이 못 보는 것 (숨기면 거짓 안심이 된다)

- **실기기를 못 본다.** `playwright.config.ts:56` 의 프로젝트는 `mobile-chromium`(Pixel 7 에뮬레이션) **하나뿐**이다.
  실제 iOS Safari · 실기기 터치 지연 · 저가 안드로이드 성능은 이 게이트 밖이다.
- **손가락 길이의 누름을 못 낸다.** Playwright 의 `click`/`tap` 은 누름이 0ms 라
  '누른 채로' 생기는 부류(전역 `button:active { transform }` 와 `offsetLeft` 가 얽힌 알약 오작동)를 **절대 재현하지 못한다**.
  그 조건은 CDP `Input.dispatchTouchEvent` 로 touchStart→(100ms+)→touchEnd 를 보내야 한다(`e2e/pill-press.spec.ts` 가 그 방식이다).
- **운영 DB 상태에 의존한다.** `e2e/_fixtures.ts:61-69` 의 route 가드는 **쓰기만** 끊는다(`route.abort('blockedbyclient')`).
  읽기는 그대로 운영 Supabase 로 나간다 → 운영 데이터가 바뀌거나 DB 가 내려가면 **코드 회귀가 아닌데도 빨개진다.**
  실패를 보면 먼저 "DB 쪽인가"를 갈라라(③의 BLOCKED #20 이 그 예다).
- **시간대 창을 못 본다.** 하루 중 특정 시각에만 나는 실패는 이 절차로 안 잡힌다.
  KST/UTC 축이 엇갈리는 문제는 **`nuri-time` 스킬이 담당**한다 — 여기서 되풀이하지 않는다.
  다만 실행 전 한 줄만 확인해라: `playwright.config.ts:53` 의 `timezoneId: 'Asia/Seoul'`(브라우저)과
  `.github/workflows/ci.yml:34` 의 `TZ: Asia/Seoul`(Node)은 **짝이다.** 하나만 있으면 비대칭이고, 그 진단은 `nuri-time` 으로 넘겨라.
- **로컬 통과가 CI 통과를 보장하지 않는다.** CI 는 ubuntu 러너에 `fonts-noto-color-emoji`·`fonts-noto-cjk` 를
  따로 깔고 돈다(`ci.yml:66-67`). `font-coverage`·`emoji-glyphs`·`typography-regression` 계열은 **로컬 설치 폰트에 좌우된다.**
- **린트·타입·단위 테스트를 대신하지 않는다.** → `nuri-ship`.
  DB 를 바꿨다면 → `nuri-migration`. 보안 점검 → `security-audit`. 변이 RPC 가 0행 200 으로 조용히 실패하는 부류 → `nuri-affect`.
- **"그 스펙이 진짜로 빨개질 수 있는 스펙인가"를 못 본다.** 이 절차는 초록불을 세기만 한다.
  단언이 공허해서 늘 통과하는 스펙은 여기서 구별되지 않는다 — 음성 대조는 **`nuri-verify`** 가 담당한다.
- **셀렉터 자체의 건전성을 못 본다.** 라벨·이모지에 묶인 셀렉터가 남아 있다. 텍스트를 바꿨다면
  같은 커밋에서 `data-testid` 로 옮겨야 하고, **셀렉터를 느슨하게 푸는 것은 게이트 무력화**라 통과로 치지 않는다.
- **이 스크립트는 Windows + Git Bash 전용이다.** `netstat -ano`·`taskkill //PID`·`::1` 전용 바인딩은
  이 머신에서 잰 값이다. ubuntu CI 는 다르다(거기서는 `npm run test:e2e` 를 그대로 돌린다 — sitemap 보호는 로컬 사정이다).
- **전체 체인을 한 번에 끝까지 돌려 본 기록이 없다.** ①~⑧ 각 단계는 따로 실측했지만
  (⑦의 `E2E_BASE_URL` 경로 · ⑥의 대조 · ②의 strictPort 충돌 · ⑧의 `kill` 실패는 각각 확인),
  **`npm run build` 를 포함한 전 구간을 한 번에 통과시킨 실행은 없다.** 처음 쓸 때는 각 단계 출력을 눈으로 확인해라.
  특히 ③의 sitemap 덮어쓰기는 `scripts/gen-sitemap.mjs:78` 의 `writeFileSync` **코드 판독** 근거이지 실행 관측이 아니다.

---

## 실패했을 때 보고 형식

```
E2E: 528 passed / 0 failed / 26 skipped / 0 flaky   (main 552 + boot 2, E2E_BASE_URL 경로)
sitemap: 5b5953aa… → 5b5953aa…  (불변 확인)
```
실패가 있으면 **건별로** 적는다 — `파일:줄 — 원인(회귀 / 운영 데이터 결합 / 환경)`.
⚠ dev(5173)에서 돌린 숫자를 보고하지 마라: modulepreload·청크 분리·정적 셸이 없어
`boot-budget` · `gto-tab-verify` · `static-shell` 이 **환경 탓으로 빨개진다**(2026-09-15 실측 — preview 에서는 전부 통과).

빌드를 못 돌렸거나 ⑥ 대조를 건너뛴 실행은 **결과를 보고하지 마라** — 옛 dist 를 검사한 숫자일 수 있다.
