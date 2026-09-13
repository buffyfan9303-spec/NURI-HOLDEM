---
name: nuri-time
description: 날짜가 픽스처·단언·버킷 키로 들어가는 코드를 쓰거나, 하루 중 특정 시각에만 나는 실패·시간대 탓으로 보이는 e2e 실패를 고치기 직전에 호출하라. KST/UTC 축이 엇갈려 생기는 거짓 통과를 판별한다.
---

# nuri-time — KST/UTC 날짜 축 판별

앱은 **두 기준을 동시에 쓴다.** 이건 버그가 아니라 현재 사실이고, 고치기 전에 알아야 할 전제다.
(2026-09-13 저장소에서 직접 확인)

| 위치 | 기준 | 코드 |
|---|---|---|
| `src/lib/scheduleStatus.ts:24` | **KST 고정** | `` Date.parse(`${date}T${hhmm}:00+09:00`) `` — 문자열에 박는다 |
| `src/components/features/HomeTab.tsx:186` | **기기 로컬** | `now.toLocaleDateString('en-CA')` (오늘/내일 버킷) |
| `src/lib/kst.ts:17` | **TZ 무관** | `new Date(now + 9*3600_000).toISOString().slice(0,10)` — epoch 산술 |
| `src/lib/regStatus.ts:24` | 축 없음 | `s.date === g.sessionDate` — **문자열 완전 일치** |

→ 시작 시각은 KST 인데 **버킷은 기기 로컬**이다. 해외·시계 오설정 유저에겐 실제 제품 버그이고,
게이트에겐 "환경에 기대는 단언"이 된다. 픽스처만 고치면 **버그가 옮겨 갈 뿐이다**(아래 사고 4).

---

## 1. 판별 결정 트리 — 이 날짜 호출이 위험한가

`toISOString()` / `toLocaleDateString()` 이 **있다는 사실만으로는 아무 정보가 없다.**
실측(2026-09-13): e2e 에 `toISOString()` **65 occurrence / 29 파일** — 그중 위험 후보는 **13개**뿐이었다.
직접 다시 세는 명령(Bash 도구):

```bash
cd "C:/Users/buffy/OneDrive/바탕 화면/누리홀덤"
grep -ro "toISOString()" e2e --include=*.ts | wc -l      # 전체 occurrence  → 65
grep -rl "toISOString()" e2e --include=*.ts | wc -l      # 파일 수          → 29
grep -rn "toISOString()\.slice(0, *10)" e2e --include=*.ts   # 날짜 키 후보 → 14줄
#   ⚠ 이 14줄 중 `home-cls.spec.ts:23` 은 **주석**이다(과거 코드를 인용한 기록) → 실제 코드는 13.
```

판별 질문은 하나다: **"UTC 날짜를 KST 배치 키인 것처럼 쓰는가."**

```
① 값이 날짜 키(YYYY-MM-DD)인가?  →  .slice(0,10) 이 붙는가
   NO  → 완전 timestamp다. 무해(근거 ③). 여기서 끝.
   YES ↓
② 그 키를 앱이 '달력 날짜'로 해석하는가?
   (오늘/내일 버킷 · scheduleStatus · hideEnded · session_date 조회)
   NO  → 표시용·정렬용이면 무해. 끝.
   YES ↓
③ 비교 대상도 **같은 수식**에서 나오는가?
   YES → 무해(근거 ①②). 두 값이 함께 어긋나 상쇄된다.
   NO  ↓
④ 값이 크롤러·외부 시스템을 향하는가?
   YES → **고치지 마라.** UTC 가 맞다(아래 반례).
   NO  → 위험. kstToday() 로 바꾸고 §3 의 짝 맞추기까지 한다.
```

### 반례 — 표면만 같고 고치면 망가지는 것

`scripts/gen-sitemap.mjs:38` 의 `new Date().toISOString().slice(0,10)` 은 sitemap `<lastmod>` 다.
**크롤러를 향한 값이라 UTC 가 맞다.** ④에서 걸러라. 일괄 치환하면 멀쩡한 것을 망가뜨린다.

---

## 2. 무해 판정의 근거 3종 (이 중 하나면 고치지 않는다)

| 근거 | 왜 무해한가 | 실측 사례 |
|---|---|---|
| ① **문자열 완전 일치 비교** | 양쪽이 같은 문자열이면 그 문자열이 무슨 날짜든 매칭된다 | `regStatus.ts:24` 의 `s.date === g.sessionDate` |
| ② **이미 +9h 보정된 동일 수식** | `kstToday` 와 같은 값을 낸다 | e2e 날짜 키 13개 중 **12개**가 `Date.now() + 9*3_600_000` 형태 |
| ③ **완전 timestamp** | 날짜 경계가 없다. 순간을 그대로 표현 | `created_at` · `ends_at` · `expires_at` 등 — 65 중 날짜 키 13 을 뺀 **52** |

> ②를 손으로 다시 쓰지 마라 — `kstToday`(`src/lib/kst.ts`)를 import 해라.
> 같은 규칙이 두 벌이 되는 순간 그게 다음 버그다(`kst.ts` 머리말이 같은 이유로 파일을 분리했다).

> ③의 52 는 "날짜 키가 아닌 나머지"다. 엄밀히는 **50개가 `.slice` 없는 맨 timestamp**이고,
> 나머지 2개는 주석 1(`home-cls.spec.ts:23`) + `.slice(11, 19)` 1(`clock-watchdog.spec.ts:85`, 시:분:초 로그 문자열)이다.
> 어느 쪽도 날짜 경계를 타지 않아 판정은 같다.

### 현재 남아 있는 유일한 맨 UTC 날짜 키

`e2e/live-card-fit.spec.ts:13` — `const iso = (d: Date) => d.toISOString().slice(0, 10);`

**무해다. 다만 경로마다 이유가 다르다** — 39행이 갈래를 가른다:
`r.fulfill(json(withPoster ? [scheduleRow()] : []))`.

| 경로 | 무해한 이유 |
|---|---|
| `withPoster=false`(잘림 3건 + '포스터 없으면 커뮤니티') | `schedules` 가 **빈 배열**이라 `scheduleRow()` 가 아예 안 만들어진다. `session_date`(16행) 말고는 **비교 상대가 없다** |
| `withPoster=true`('포스터 열기' · '관전 클락') | `session_date`(16행)와 `date`(29행)가 **같은 `iso(new Date())`** → `matchClockSchedule` 의 문자열 완전 일치(근거 ①) |

> ⚠ 근거 ①은 **withPoster 경로에만** 성립한다. "둘 다 들어가니 상쇄된다"를 기본 경로에 갖다 붙이지 마라 —
> 거기엔 두 번째 값이 존재하지 않는다.

**`ended` 우려는 실측으로 해소했다**(2026-09-13): `withPoster` 경로에서 이 UTC 날짜는 KST 05:00~09:00 에
`scheduleStatus` 상 `ended` 가 되지만, **그 값을 읽는 곳이 이 경로에 없다.**
- `src/components/features/LiveGamesTab.tsx:9` 는 `regStatus` 의 `matchClockSchedule`·`msToRegClose` 만 import 한다 —
  파일 전체에 `scheduleStatus`·`hideEnded` 참조 **0곳**. `src/App.tsx:3610` 이 필터 안 한 `schedules` 를 그대로 넘긴다.
- `hideEnded` 는 **browse 전용**이다(`src/App.tsx:2141-2143`).
- 포스터 모달의 `ended` 게이트는 `ScheduleDetailModal.tsx:1116` 의 `doReserve` **안에만** 있고,
  스펙이 확인하는 '블라인드' 탭은 정적 탭 목록(같은 파일 63행)이라 상태와 무관하다.

---

## 3. 픽스처 작성 규칙 — 브라우저와 Node 는 **짝**이다

```ts
import { kstToday } from '../src/lib/kst';
const day = (offset: number) => kstToday(Date.now() + offset * 86_400_000);
```

`kstToday` 는 epoch 산술이라 **러너 시간대와 무관**하다 — env 에 기대지 않는다.

그런데 **픽스처만 KST 로 바꾸면 부족하다.** 지금 걸려 있는 두 줄이 반드시 함께 있어야 한다:

| 무엇을 바꾸나 | 어디 |
|---|---|
| **브라우저** 시간대 | `playwright.config.ts:53` → `use: { timezoneId: 'Asia/Seoul' }` |
| **Node(러너)** 시간대 | `.github/workflows/ci.yml:34` → `TZ: Asia/Seoul` |

`timezoneId` 는 **브라우저만** 바꾼다. 픽스처를 Node 에서 만드는 스펙(`toLocaleDateString('en-CA')`)은
러너 TZ 를 따르므로, 하나만 있으면 비대칭이고 UTC 러너에서 픽스처와 앱 버킷이 여전히 하루 어긋난다.

`playwright.config.ts` 에 기록된 실측(489 테스트, 내가 돌린 것 아님 — 설정 주석의 기록):
**Node UTC + 브라우저 UTC = 6실패 / Node UTC + 브라우저 KST = 2실패 / Node KST + 브라우저 KST = 1실패**(BLOCKED #20, 시간대 무관).
전체는 나아지지만 `home-flow-fit` 하나는 실패 창이 **오히려 넓어진다**(UTC 19~24시 → 15~24시) — 짝을 맞춰야 사라진다.

> 새 스펙을 추가할 때 이 두 줄을 **지우거나 느슨하게 풀지 마라.** 지우면 게이트가 러너 복권이 된다.

---

## 4. 재현 창 — 실측 표 (이게 이 스킬의 핵심이다)

UTC 날짜 픽스처가 만드는 증상은 **하루 중 정해진 구간에만** 나온다. 직접 계산한 결과(2026-09-13):

| KST 시각 | UTC 픽스처가 KST와 다른 날인가 | UTC 픽스처 `scheduleStatus` | KST 픽스처 |
|---|---|---|---|
| **00 ~ 04** | **예** | `live` (버킷 어긋남) | `upcoming` |
| **05 ~ 08** | **예** | **`ended`** ← hideEnded 가 행을 지운다 | `upcoming` |
| 09 ~ 18 | 아니오 | `upcoming` | `upcoming` |
| 19 ~ 23 | 아니오 | `live` | `live` |

**창이 둘, 그리고 중첩이다:**
- **KST 00:00~09:00** (= UTC 15:00~24:00) — UTC 날짜 ≠ KST 날짜. 행이 엉뚱한 날에 배치된다.
- **KST 05:00~09:00** — 여기에 더해 `시작(19:00) + 10h`(`TOURNEY_OPEN_HOURS`)를 넘겨 **`ended`** 가 되고,
  `hideEnded`(검색어·날짜 미선택이면 기본 활성)가 행을 **조용히 지운다**.

재현용 계산 — 언제든 안전하게 돌려서 창을 다시 확인할 수 있다(빌드 안 함):

```bash
node -e "
const kst=n=>new Date(n+9*3600000).toISOString().slice(0,10);
const utc=n=>new Date(n).toISOString().slice(0,10);
const st=(d,n)=>{const s=Date.parse(d+'T19:00:00+09:00');return n>=s+10*3600000?'ended':n>=s?'live':'upcoming'};
const b=Date.UTC(2026,8,13,0,0,0), out=[];
for(let h=0;h<24;h++){const t=b+h*3600000;
  out.push([(h+9)%24,'날짜어긋남 '+(utc(t)!==kst(t)),'UTC픽스처 '+st(utc(t),t),'KST픽스처 '+st(kst(t),t)]);}
out.sort((a,b)=>a[0]-b[0]).forEach(r=>console.log('KST',String(r[0]).padStart(2,'0'),'|',r.slice(1).join(' | ')));
"
```

⚠ **정렬을 `| sort -k2 -n` 으로 파이프하지 마라.** 이 저장소의 기본 셸은 PowerShell 이고 거기서 `sort` 는
`Sort-Object` 라 `Sort-Object: A parameter cannot be found that matches parameter name 'k2'` 로 죽는다(2026-09-13 실측).
위처럼 **node 안에서 정렬**하면 PowerShell·Bash 어느 쪽에 붙여도 같은 표가 나온다 — 둘 다에서 확인했다.

브라우저 시각을 실제로 옮겨 창 안을 보고 싶으면 Playwright `page.clock` 이 쓸 수 있다
(설치된 버전 **1.62.1**, `page.clock` 지원). ⚠ **이 저장소에서 쓰인 적이 없고(현재 0곳) 내가 검증하지 않았다.**
그리고 `page.clock` 은 **브라우저만** 옮긴다 — Node 에서 만드는 픽스처는 그대로다(§3 의 비대칭이 재현에도 똑같이 적용된다).

---

## 5. 단언이 거짓 통과하는 모양 — 실제 사고 기록

시간대 버그가 **실패가 아니라 통과로** 나타난 사례들이다. 단언을 이렇게 쓰면 절반이 사라져도 초록이다.

| 날짜 | 스펙 | 단언이 왜 못 잡았나 | 실측 |
|---|---|---|---|
| 2026-09-13 | `schedule-card-fit.spec.ts` | (잡았다) 정상 실패 | KST 00~09 에만 **7건 실패** → `kstToday` 로 해결 |
| 2026-09-13 | `theme-tokens-v7.spec.ts` | 개수 단언 **`n > 2`** — 8행 중 4행이 사라져도 참 | 현행 카드 8개(전부 내일치) / 고친 뒤 **16개** |
| 2026-09-13 | `home-cls.spec.ts` | 라이브 유무 **대칭 비교** — 양쪽에서 똑같이 상쇄 | 4행 중 **2장만 렌더** / 고친 뒤 **4장** |

> 출처(내가 돌린 것이 아니라 **스펙 주석에 남은 실측 기록**이다 — 그대로 인용한다):
> `e2e/theme-tokens-v7.spec.ts:53` = "실측(2026-09-13 05:26 KST): 현행 = 카드 8개(전부 내일치) / 고친 뒤 = 16개(8행 × 카드 2개)",
> `e2e/home-cls.spec.ts:34` = "실측(2026-09-13 06:07 KST, 프로덕션 빌드 프로브): 현행 = 4행 중 2장만 렌더 / 고친 뒤 = 4장 전부".
> `schedule-card-fit` 의 **7건**만은 저장소에 근거 문장이 없다 — 그 스펙은 `[320,360,390,412,768,1280,1440]`
> 7폭을 파라미터로 도는 구조(171행)라 폭당 1건으로 읽으면 앞뒤가 맞지만, **확인된 수치로 쓰지 마라.**

**교훈(단언 쓰는 법):**
- 개수 하한(`n > 2`)으로 "렌더됐다"를 대신하지 마라. **기대한 날짜가 실제로 화면에 있는지**를 직접 봐라.
  `theme-tokens-v7.spec.ts:279` 가 고친 모양이다 — 두 날짜의 `M/D` 라벨을 각각 `toContain` 한다.
- 양변이 같은 조건에서 나온 값이면 대칭 비교는 아무것도 검증하지 않는다.
- 픽스처 행이 **정말 렌더됐는지** 먼저 확인해라. PostgREST 목킹은 **맨 배열**이어야 한다 —
  `{"data":[]}` 로 주면 supabase-js 파싱이 실패해 한 장도 안 그려지고, **스켈레톤끼리 비교하며 조용히 통과**한다.

### 사고 4 — 내 첫 수정이 틀렸던 방식 (같은 실수 반복 금지)

픽스처만 KST 로 바꿨더니 **KST 개발기에서는 고쳐지고 UTC CI 에서 재발**했다. 고친 게 아니라 옮긴 것이다.
→ 픽스처를 고쳤으면 **§3 의 두 줄이 둘 다 있는지 확인하고**, 반대 환경(러너 TZ 반대쪽)에서도 성립하는지 따져라.

---

## 6. 이 스킬이 **못 보는 것** (숨기면 거짓 안심이 된다)

1. **창 밖에서는 재현되지 않는다.** KST 09:00~24:00 에 돌리면 UTC 픽스처와 KST 픽스처가 **표상 완전히 같다**(§4 표).
   그 시간대에 초록을 보고 **"고쳤다"고 말하지 마라.** 보고할 때는 **돌린 시각(KST)과 재현 창을 같이 적어라.**
   - 창 안에서 못 돌렸으면: "KST 14:20 에 통과 — **재현 창(00:00~09:00) 밖이라 이 실행은 회귀를 증명하지 않는다**" 라고 쓴다.
2. **정적 판별이다.** 문자열만 본다. 런타임에 서버가 내려준 날짜, DB `ledger_business_date`,
   엣지 함수가 계산하는 날짜는 **여기서 안 보인다.**
3. **DST 를 다루지 않는다.** KST 는 DST 가 없어 `+9h` 산술이 성립한다. 다른 시간대를 도입하면 이 전제가 깨진다.
4. **`kstToday` 는 `Date.now()` 를 믿는다.** 기기 시계가 크게 틀어지면 TZ 와 무관하게 어긋난다 — 서버 판정이 최종이다.
5. **§4 표는 `start_time: '19:00'` · `TOURNEY_OPEN_HOURS = 10` 기준**이다(`src/lib/scheduleStatus.ts:12`).
   픽스처 시작 시각이 다르면 `ended` 창이 이동한다.
6. **소비처를 코드로 훑어 "안 읽는다"까지만 본다.** §2 의 `live-card-fit` 판정이 그 예다 —
   `LiveGamesTab` 에 `scheduleStatus` 참조가 0곳인 것은 확인했지만, **그 스펙을 창 안에서 돌려 초록을 본 것은 아니다.**
   정적 추적이 놓치는 경로(동적 import·조건부 렌더 안쪽)가 있으면 판정이 뒤집힐 수 있다.
7. **이 스킬은 검사를 실행하지 않는다.** 판정만 한다. 고친 뒤 "정말 잡히는가"는 `nuri-verify`(음성 대조),
   실제 실행은 `nuri-e2e` 다 — 여기 초록/빨강 근거는 없다.

---

## 7. 여기서 하지 않는 것 — 다른 스킬로 넘긴다

- **게이트 실행 순서**(lint → vitest → build)와 완료 보고 → **`nuri-ship`**. 여기서 되풀이하지 않는다.
- **E2E 를 실제로 돌리는 것** → **`nuri-e2e`**. 🔴 `npm run test:e2e` 를 그냥 돌리지 마라 —
  webServer 빌드가 `scripts/gen-sitemap.mjs` 를 돌려 보호 파일 `public/sitemap.xml` 을 덮는다.
  안전 절차(백업·포트·범위 좁히기)는 전부 `nuri-e2e` 에 있다. 이 스킬은 **판정만** 하고 실행은 넘긴다.
  (§1 반례의 `lastmod` 가 갱신되는 것이 바로 그 덮어쓰기다.)
- **고친 단언이 정말 잡는지 확인**(일부러 깨뜨려 빨간불 보기) → **`nuri-verify`**.
  §5 는 **시간축이 만드는** 거짓 통과의 모양만 다룬다. 음성 대조 절차 자체는 저기 있다.
- **DB 쪽 날짜**(`ledger_business_date` · `session_date` 컬럼 · RPC 의 `(now() at time zone 'Asia/Seoul')::date`)를
  **바꾸는** 작업 → **`nuri-migration`** 을 먼저 불러라. 이 스킬은 클라이언트·테스트 축만 판별한다.
- 같은 날짜 계산이 여러 파일에 복제돼 화면마다 다른 날을 말하는 부류 → **`nuri-single-source`**
  (§2 의 "`kstToday` 를 손으로 다시 쓰지 마라"가 그 스킬의 관할이다).
- 비밀·권한·의존성 점검 → **`security-audit`**.
