---
name: nuri-single-source
description: 같은 계산이 여러 곳에 복제돼 화면마다 다른 값을 말할 때 호출하라 — "카드와 상세가 다른 레벨을 말한다"·"TV 송출만 마감으로 뜬다" 류 증상의 진단, 복제본을 lib/ 한 곳으로 통합, 통합 뒤 **재복제를 막는** 계약(`*.contract.test.ts`)을 무엇으로 세울지 결정. lib/ 에 공용 계산 함수를 새로 만들거나 기존 시그니처를 바꿀 때도 먼저 부른다. (세운 계약이 실제로 빨개지는지 깨뜨려 보는 것은 nuri-verify.)
---

# nuri-single-source — 단일 정본과 복제 금지 계약

**같은 계산이 두 벌이 되는 순간이 버그다.** 두 벌이 된 다음에는 수정이 한 벌에만 들어가고,
그때부터 앱은 **같은 대회를 화면마다 다르게 말한다.** 유저가 먼저 발견한다.

2026-09-13 한 세션에서 네 부류를 찾아 고쳤다(전부 워킹트리 diff 로 실측 확인):

| 계산 | 복제 | 증상 |
|---|---|---|
| `msToRegClose` | 3벌(2벌 제거 + 정본 1) | F2 수정이 한 벌에만 들어가 **TV 송출이 모든 대회에 '마감'** 을 띄웠다 |
| `levelNumberAt` | 4벌 제거 — `(levels[], i)` 3 + `(cfg, i)` 1 | 시그니처까지 갈렸다 |
| `msToNextBreak` | 2벌 제거 — 3인자 1 + 2인자 1 | 같은 이름이 인자 개수가 달랐다 |
| 마감 레벨 파싱 | 6벌 제거 — `PosterFormModal` 3 · `ScheduleCard` 1 · `ScheduleDetailModal` 1 · `ScheduleTable` 1 | 규칙까지 갈려 `/\d+/` 가 `'22:00'` 을 **22레벨**로 읽었다 |

네 번째가 핵심이다 — 복제는 **규칙이 갈리는 것**이지 코드가 중복되는 것이 아니다.
같은 포스터 하나를 카드 16 · 블라인드표 16 · 상세 20 · 클락상속 20 으로 말하고 있었다.

> 여섯 번째 복제본(`ScheduleTable.tsx`)은 **DB 컬럼명 `regCloseLevel` 을 한 번도 쓰지 않았다** —
> `regCloseTime` 자유 텍스트를 `/(\d+)\s*LV/i` 로 직접 파싱했을 뿐이다. 4단계 ③(토큰 참조 수)로는
> 영원히 안 걸린다. ④(정규식 지문)가 그 몫이다. 그리고 이 한 벌은 `lib/` 가 아니라
> `ScheduleCard.regCloseText` 로 합쳐졌다 — **정본이 꼭 `lib/` 일 필요는 없다. 한 곳이면 된다.**
> (컴포넌트 파일에 정본을 두면 `react-refresh/only-export-components` 가 걸린다 —
> `ScheduleCard.tsx:63` 처럼 그 한 줄만 `eslint-disable-next-line` 하고 이유를 적는다.)

---

## 1단계 — 전수 조사 (고치기 전에 반드시)

한 곳을 고치기 전에 **몇 벌인지부터** 센다. 한 벌만 고치는 것이 이 사고의 전부다.

```bash
N=msToRegClose                                   # 조사할 이름
grep -rnE "(function\s+$N\s*[(<]|(const|let|var)\s+$N\s*=)" src --include=*.ts --include=*.tsx
grep -rln "\b$N\b" src --include=*.ts --include=*.tsx | sort   # 정의 + 소비처 전부

# ⚠ 이름 없는 복제(인라인 규칙)는 이름으로 절대 못 찾는다 — **정규식 리터럴**과 **DB 컬럼명**으로 찾는다.
grep -rnF '\s*LV' src --include=*.ts --include=*.tsx           # -F(고정 문자열). 실측: 비테스트는 regClose.ts 2줄뿐
grep -rln 'regCloseTime' src --include=*.ts --include=*.tsx | sort   # 그 원본 값을 읽는 파일 전부 = 재구현 후보
```

정의가 2개 이상이면 통합 대상이다. **소비처 목록도 같이 뽑아라** — 4단계 배선 앵커에 그대로 쓴다.

⚠ 이 grep 은 주석·테스트를 걸러내지 않는다(계약 테스트의 `strip()` 과 다르다). 실측하면
`regStatus.contract.test.ts:13` 의 **주석 안 `` `function msToRegClose(` ``** 이 정의처럼 잡힌다 —
히트를 세기 전에 파일과 줄을 눈으로 확인해라.

> 규칙이 갈렸는지는 이름이 아니라 **결과로** 확인한다. 같은 입력 하나(실데이터 포스터 1건)를
> 각 판본에 넣어 답을 표로 적어라. 위 16/16/20/20 이 그렇게 나왔다.

---

## 2단계 — 정본 고르기

**시그니처는 넓은 쪽, 규칙은 좁은 쪽.** 이 둘을 반대로 적용하면 통합이 회귀가 된다.

- **시그니처 = 더 많은 정보를 받는 쪽.** `msToNextBreak`·`msToRegClose` 는 3인자(`s, index, remaining`)를
  남기고 2인자를 버렸다. 이유가 코드에 있다(`clockLevel.ts`): DB `current_index` 는 낡을 수 있어
  소비처가 **실효 인덱스를 넘길 수 있어야** 한다. 2인자는 그 선택지를 봉쇄한다.
- **입력 타입 = 실제로 읽는 최소 구조.** `levelNumberAt` 은 `(cfg: ClockConfig, i)` 가 아니라
  `(levels: ClockLevelKind[], i)` 를 남겼다. `ClockLevelKind`·`ClockLevelInput` 처럼 **구조적 최소 인터페이스**를
  lib 쪽에 선언하면 어떤 호출자 모양이든 만족하고, api 타입에 묶이지 않는다.
- **규칙 = 덜 단언하는 쪽.** 파싱은 `/\d+/`(아무 숫자나)를 버리고 `/(\d+)\s*LV/i` 를 남겼다.
  느슨한 쪽은 `'22:00'` 을 22레벨이라고 **틀리게 단언**한다.
- **null-safe 한 쪽.** `s.config?.levels ?? []` 로 받고, 판정 근거가 없으면 던지지 말고 `null`.

### null 과 0 을 반드시 가른다 (F2 의 본체)

`regCloseLevel` 미설정을 예전 코드는 `0 >= 0` 으로 **'이미 마감'** 이라고 단언했다.
**규칙이 없다는 것은 마감이 아니라 판정 불가다.**

| 값 | 뜻 | 화면 |
|---|---|---|
| `null` | 판정 불가(미설정) | 배지 생략 · `'—'` |
| `0` | 마감 도달 | `'마감'` |
| 양수 | 남은 ms | 카운트다운 |

소비처의 **분기 순서도 계약이다**: `null` 을 **먼저** 걸러야 0 과 섞이지 않는다.

### 통합하면 안 되는 경우

같은 이름인데 **의도적으로 달라야 하는** 것이 있다. 이때 합치는 것은 기능 소실이다.
판별: *"두 판본의 차이가 버그인가, 아니면 소비처의 권위가 다른가?"*

이 저장소의 실제 예 — 함수는 하나지만 **인자는 소비처마다 다르다**:
- 손님이 보는 화면(TV·라이브 카드·상세): `eff.index, eff.remainingMs` — `effectiveLevel` 로 보정한 값.
- 운영자 클락(`TournamentClock`): `state.currentIndex, remaining` — **자기 state 가 권위**다.

→ 합칠 것은 **정의**고, 고정할 것은 **누가 어떤 인자를 넘기는가**다. 계약은 둘을 따로 못 박는다.

---

## 3단계 — 통합: 호출부 인자 보존 확인표

정의를 옮기기 전에 이 표를 채워라. **"값이 같은가" 칸이 비면 통합하지 마라.**

| 소비처 | 통합 전 호출 | 통합 후 호출 | index 출처 | 같은 값인가(근거) |
|---|---|---|---|---|
| ClockDisplay.tsx | `msToRegClose(g, rem)` | `msToRegClose(g, eff.index, eff.remainingMs)` | `effectiveLevel` | |
| TournamentClock.tsx | `msToRegClose(state, rem)` | `msToRegClose(state, state.currentIndex, remaining)` | 자기 state | |

- 2인자→3인자처럼 **인자가 늘면** 기존 호출 전부가 조용히 의미가 바뀐다. 한 줄씩 확인한다.
- 값 단언은 계약 테스트가 아니라 **단위 테스트**(`regClose.test.ts`·`regStatus.test.ts`)가 한다.
  통합 전후로 같은 입력의 답이 같은지는 거기서 증명한다.
- 통합으로 **표시가 사라지면 안 된다**(CLAUDE.md 3번: 기능 보존). 상세의 '레이트 레지' 행은
  표시를 유지한 채 **값만** 정본으로 바꿨다.

---

## 4단계 — 복제 금지 계약 작성

`src/lib/<이름>.contract.test.ts`. **다섯 겹**에서 해당하는 것을 고른다. 본보기 3개를 먼저 읽어라:
`src/lib/regStatus.contract.test.ts` · `clockLevel.contract.test.ts` · `regClose.contract.test.ts`.

```ts
// 소스 계약 — <함수> 는 src/lib/<파일>.ts 하나뿐이다 (YYYY-MM-DD, 사고 ID)
// 머리말 5항목(왜 · 보는 것 · 못 보는 것 · 음성 대조 · 실행 명령)은 `nuri-verify` §5 의 규약이다 —
// 여기서 되풀이하지 않는다. 그 형식대로 채우고, '보는 것' 에 아래 ①~⑤ 중 쓴 것을 적어라.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (code: string, re: RegExp) =>
  (code.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

// ① 정의 단일성
const DEF = /\b(?:function\s+NAME\s*[(<]|(?:const|let|var)\s+NAME\s*=)/;
describe('NAME — 정의는 src/lib/<파일>.ts 하나뿐이다', () => {
  it('🔴 정의하는 파일은 lib/<파일>.ts 뿐이고, 거기서도 한 번이다', () => {
    const defs = walk(SRC)
      .map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), n: count(strip(readFileSync(p, 'utf-8')), DEF) }))
      .filter((x) => x.n > 0);
    expect(defs, '복제본이 생겼다 — lib/<파일>.ts 에서 import 하라').toEqual([{ file: 'lib/<파일>.ts', n: 1 }]);
  });
});
```

⚠ `describe` 로 감싸라. 임포트해 놓고 안 쓰면 `@typescript-eslint/no-unused-vars`(tseslint recommended,
`eslint.config.js:30`)로 **lint 가 깨진다** — `nuri-ship` 게이트의 첫 단계다.

② **배선 앵커** — 소비처가 그 한 곳을 *실제로 부르는가*. 단위 테스트는 함수를 직접 import 하므로
**아무도 안 부르는 함수도 통과시킨다.** import 줄 1회 + 정확한 호출 형태를 소비처마다 고정한다.

```ts
expect(count(tv, /^import \{ NAME \} from '\.\.\/\.\.\/\.\.\/lib\/FILE';$/m)).toBe(1);
expect(count(tv, /\bNAME\(state, state\.currentIndex, remaining\)/)).toBe(1);
expect(count(tv, /\bNAME\(state, remaining\)/), '옛 2인자 호출이 남아 있다').toBe(0);  // 음성 대조
```

③ **바꿀 수 없는 토큰의 파일별 참조 수 고정** — 이게 결정적이다.
**DB 컬럼명은 재구현하는 코드도 바꿀 수 없다.** 새 파일이 손대면 목록에 없어서, 기존 파일에서 늘면
개수가 달라져서 걸린다 — 어느 쪽이든 **사람이 한 번 본다**. `regCloseLevel` 은 실측 **8파일 26참조**:

```ts
const EXPECT: Record<string, number> = {
  'api/clock.ts': 5, 'api/presets.ts': 1,
  'components/features/LiveGamesTab.tsx': 1, 'components/features/ScheduleDetailModal.tsx': 1,
  'components/features/clock/ClockDisplay.tsx': 1, 'components/features/clock/TournamentClock.tsx': 9,
  'lib/gameInherit.ts': 7, 'lib/regStatus.ts': 1,   // ← 계산은 여기 하나뿐이다
};
```

실패 메시지에 **두 갈래 지시**를 넣어라: "재구현이 아니면 숫자를 고쳐라 / 재구현이면 정본을 써라."

⚠ **토큰은 반드시 `\b` 로 감싼다.** 실물은 `/\bregCloseLevel\b/g`(`regStatus.contract.test.ts:115`)다.
경계를 빼고 `/regCloseLevel/g` 로 세면 이 저장소에 있는 `regCloseLevelFromText`·`regCloseLevelOf` 까지
먹어 **11파일 41참조**가 된다(실측). 표가 처음부터 맞지 않고, 맞추려 숫자를 키우면 계약이 공허해진다.
→ 토큰을 고르면 **접두사가 겹치는 이름이 있는지 먼저** `grep -rn "<토큰>" src` 로 본다.

④ **정규식 지문 고정**(파싱 계산일 때만) — ③ 이 못 보는 구멍을 정확히 메운다.
DB 컬럼명을 새로 참조하지 않고 **정규식만 다시 써서** 재구현하면 ③ 은 영원히 못 본다(위 여섯 번째 복제본).
그래서 **정규식 리터럴의 소스 텍스트 자체**를 지문으로 잡는다 — 실물 `regClose.contract.test.ts:42, 62-67`:

```ts
const RAW = /\\s\*[Ll][Vv]/;   // 정규식이 아니라 '소스에 적힌 글자' \s*LV 를 찾는다
it('🔴 원본 정규식이 정본 밖에 남아 있지 않다', () => { /* walk + strip + count(RAW) */
  expect(hits, '인라인 파싱 복제다 — <정본함수> 를 부르라').toEqual([{ file: 'lib/regClose.ts', n: 1 }]);
});
```

실측: `\s*LV` 는 지금 `src` 비테스트 전체에서 `lib/regClose.ts` **한 곳뿐**이다(raw 2회 → strip 후 1회).
지문은 **정본이 실제로 쓰는 리터럴**이어야 한다 — 정본이 정규식을 바꾸면 지문도 같은 커밋에서 바꾼다.

⑤ **임계 경로 임포트 방향**(해당할 때만) — 아래 별도 절.

---

## 이 방식이 못 보는 것 (실측 — 숨기지 마라)

**"복제본이 존재하는가" 는 정규식으로 판정 불가다.** 지문 후보 둘(`60_000` 근접 / 같은 최상위 스코프)을
실측해 기각했다 — `TournamentClock`·`LiveGamesTab`·`ScheduleDetailModal` 은 6~34KB 짜리 거대 컴포넌트라
**오탐이 기본값**이 된다. 오탐이 잦으면 계약이 느슨하게 풀리고, 그게 더 나쁘다.

DEF 정규식을 15가지 선언 모양에 넣어 실측했다(`node` 로 직접 확인):

| 잡는다 | 못 잡는다 |
|---|---|
| `export function X(` · `export default function X(` | **이름을 바꾼 복제** (`regCloseMs`) |
| `async function X(` · `function X <T>(` | `const o = { X(s) {} }` 객체 메서드 |
| `const X = function` · `let X = (s) =>` | `const o = { X: (s) => 0 }` 객체 속성 |
| 공백이 늘어난 형태 | `class C { X(s) {} }` · `class C { X = (s) => 0 }` |
| | `const { X } = helpers` 구조분해 |

→ 객체·클래스 멤버로 심은 복제는 **이름이 같아도** 못 잡는다. 세 본보기 파일 머리말에 없던 한계다.

그리고:
- **배선 앵커만으로는 새 화면을 못 막는다.** 검증자가 **다섯 번째 화면에 이름 바꾼 복제본을 넣고
  '마감' 을 렌더**해도 배선 테스트가 전부 통과하는 것을 실증했다. 새 화면은 기존 호출을 바꿀 필요가 없다.
  ③ 토큰 고정이 그 몫을 맡는다.
- **③ 도 만능이 아니다.** 토큰을 새로 참조하지 않고(이미 뽑아 둔 지역 변수를 인자로 받아) 재구현하면 못 본다.
  이건 '복제를 막는' 장치가 아니라 **'복제가 생길 자리를 리뷰로 끌어내는'** 장치다.
  ④ 가 그중 '정규식만 다시 쓴' 부류를 건지지만, 정규식을 **다르게 써서 같은 뜻**을 내면(`/LV\s*(\d+)/`·`split('LV')`)
  ④ 도 못 본다. 지문은 글자 일치일 뿐이다.
- **스캔 범위가 `src/` 뿐이다.** 템플릿의 `walk(SRC)` 는 `src` 아래만 걷고 `.test.ts(x)`·`.d.ts` 를 뺀다
  (실측: 비테스트 **328파일**). 이 저장소에는 최상위 **`api/`**(`p.js`·`s.js`·`sitemap.js`·`health.js` — 서버리스 함수)와
  **`e2e/`** 가 따로 있다. 거기 심은 복제본은 ①③④ 어디에도 안 걸린다. 테스트 파일 안의 재구현도 마찬가지다.
- 계약 테스트는 **소스 텍스트만** 본다. 런타임 동작은 단위 테스트가, 화면은 e2e 가 본다.

---

## 임계 경로 보호 — `lib/` 는 `api/clock` 에서 값을 import 하지 않는다

실측된 정적 사슬이다: `api/clock.ts:4` 가 `./ledger` 에서 **값**(`earlyTypeOf`, `ledgerCounts`)을 가져온다.
그래서 `lib/*` 가 `api/clock` 에서 값을 하나라도 가져오면 **업주 전용 장부 청크가 비로그인 손님의
첫 화면에 딸려 온다.** 이 앱의 체감은 CPU 가 아니라 내려보내는 바이트가 지배한다.

```ts
import { effectiveLevel } from './clockLevel';      // ✅ 값은 lib 에서
import type { ClockState } from '../api/clock';     // ✅ 타입은 import type
```

⚠ **함정**: `api/clock.ts:272` 가 `effectiveLevel` 을 **재수출**한다. `from '../api/clock'` 로 가져와도
타입체크·빌드가 전부 통과하면서 사슬만 조용히 붙는다. 계약으로 잠근다:

```ts
expect(count(code, /^import \{ effectiveLevel \} from '\.\/clockLevel';$/m)).toBe(1);
expect(code, 'api/clock 에서 값을 가져오면 장부가 첫 화면에 딸려 온다')
  .not.toMatch(/^import \{[^}]*\} from '\.\.\/api\/clock';$/m);
```

---

## 검증

```bash
npx vitest run src/lib/regStatus.contract.test.ts   # 실측 2026-09-13: 1파일 12테스트
npx vitest run src/lib/regStatus.contract.test.ts \
  src/lib/clockLevel.contract.test.ts src/lib/regClose.contract.test.ts
                                                    # 실측: 3파일 29테스트 (12 + 10 + 7)
npx vitest run contract.test                        # 계약 전체 — 실측: 17파일 198테스트
```

⚠ **초 단위 소요시간은 적지 마라.** 같은 기계에서 몇 분 뒤 다시 재도 1.0~1.7s 로 흔들린다(실측).
재현되는 것은 **파일 수·테스트 수**뿐이다 — 기준선으로 쓸 수 있는 것도 그것뿐이다.

⚠ `nuri-verify` 는 "세 계약 테스트 → 35테스트" 를 인용하는데 **다른 3개**다
(regStatus 12 + clockLevel 10 + **mutationAffected 13**). 여기 29는 regStatus 12 + clockLevel 10 + **regClose 7** 이다.
숫자가 어긋나 보이면 **파일 목록부터 대조해라** — 둘 다 맞다.

⚠ `contract.test` 는 대소문자 무관 **경로 부분일치 필터**다 — `remoteContract.test.ts` 같은 camelCase 도
함께 잡혀 17파일이 된다(`*.contract.test.ts` 파일은 13개). **글롭은 동작하지 않는다**:
`"src/**/*.contract.test.ts"` → 실측 `No test files found, exiting with code 1`.

> 수치는 저장소가 바뀌면 달라진다. **재지 않고 인용하지 마라** — 파일 수·테스트 수를 매번 기준선과 대조한다.

## 경계 — 여기서 안 하는 것

| 그건 저기서 한다 | |
|---|---|
| `nuri-verify` | 세운 계약이 **정말 무언가를 보는지** 깨뜨려 확인하는 음성 대조 절차 · §5 의 **머리말 5항목** 규약과 "쓰면 안 되는 것"(템플릿 정규식 조립 등) |
| `nuri-ship` | 마무리 게이트 실행 순서(lint→vitest→build)·보고 형식 |
| `nuri-e2e` | Playwright 실행 절차 |
| `nuri-migration` | DB 컬럼명을 바꾸는 절차 — 바꾸면 ③ 토큰 목록이 통째로 깨진다. 먼저 거기로 |
| `nuri-affect` | 변이 0행 계약 |
| `nuri-edit` | 계약 파일을 새로 쓰거나 기존 소비처를 고칠 때의 줄끝·BOM 실측과 안전한 쓰기 |

여기는 **복제된 계산을 찾아 합치고, 무엇으로 계약을 세울지**(정의 단일성·배선 앵커·토큰 참조 수·정규식 지문)만 다룬다.
계약을 다 쓴 뒤에는 반드시 `nuri-verify` 로 넘어가라 — **통과만 보고 끝내면 아무것도 검사하지 않는 계약이 남는다.**
