---
name: nuri-async-guard
description: "늦은 응답·오류 원문 노출·저장소 무가드 읽기 세 부류를 진단하고 어떤 기존 인프라를 쓸지 정한다. 증상 — 탭이나 계정을 빠르게 오가면 옛 데이터가 지금 화면을 덮는다 · 로그아웃했는데 남의 이름·역할이 잠깐 보인다 · 다른 매장·다른 게임의 숫자가 그대로 남는다 · 오류 안내에 SQL 이나 테이블·컬럼 이름이 보인다 · 권한이 없는데 그냥 '불러오지 못했습니다' 만 뜬다 · 사파리 프라이빗·쿠키 차단 브라우저에서 흰 화면. 비동기 setter, API 의 오류 던지기, localStorage/sessionStorage 읽기를 새로 쓰거나 고치기 **직전에** 호출하라."
---

# nuri-async-guard — 늦은 응답 · 오류 원문 · 무가드 저장소 읽기

**이 셋은 고칠 인프라가 이미 다 있다. 없는 것은 "언제 무엇을 쓰라"는 문서뿐이다.**
그래서 매번 새로 만들거나 빠뜨렸고, `.claude/handoff/current.md` 가 스스로 만든 재발 표(`:1514-1522`)에서
**합쳐 여덟 번** 재발했다.

| 부류 | 재발 이력(핸드오프 표 원문) | 횟수 |
|---|---|---|
| 늦은 응답이 남의 화면을 덮음 | N01 캘린더·알림·이용권 → A04 `AuthContext` → F14 `StoreDashboard` | **3** |
| 서버 오류 원문이 화면에 노출 | `dbError` 필터 → `throwRpc`(§5-B) → `setAppSetting`(§8-2) | **3** |
| `localStorage` 무가드 읽기 → 흰 화면 | `supabase.ts` A03-1 → `ThemeContext` | **2** |

핸드오프의 라우팅 규칙상 **이 세 부류는 이미 "재발 확인됨"** 이다 — 또 나면 같은 등급으로 재시도하지 말고 올려라.

## 형제 스킬로 넘길 것 (여기서 하지 않는다)

| 하려는 일 | 스킬 |
|---|---|
| 세운 계약을 **깨뜨려** 빨간불이 되는지 보기(음성 대조) | `nuri-verify` — 이 스킬은 **무엇을 단언할지**만 정한다 |
| 쓰기(UPDATE/DELETE)가 0행 200 으로 성공 위장 | `nuri-affect` — **쓰기의 영향 행수**. 여기는 **읽기 응답의 순서**다. 다른 문제다 |
| 계약 테스트를 어디에 세울지 · 복제 통합 | `nuri-single-source` |
| 파일 줄끝·BOM·앵커 | `nuri-edit` (편집 **전에**) |
| lint·vitest·build 게이트 실행 / E2E 실행 | `nuri-ship` / `nuri-e2e` |
| 서버측 권한·RLS·RPC GRANT | `security-audit`, `nuri-migration` |
| KST/UTC 축 | `nuri-time` |

---

# 부류 1 — 늦은 응답(stale response)

## 증상

- 탭·매장·게임·글을 빠르게 오가면 **먼저 떠난 요청의 응답**이 나중에 도착해 지금 화면을 덮는다.
- 로그아웃했는데 이름·역할이 잠깐 되살아난다. 계정을 바꿨는데 **앞 계정의 예약·알림·이용권**이 보인다.
- 다른 매장으로 옮겼는데 앞 매장의 숫자·오류 배너·"HH:MM 기준" 갱신 시각이 남는다.
- 조건을 바꿨는데(빌런 카드·검색 필터) 앞 조건의 결과가 그대로 표시되고, 그 값이 **저장·공유까지 된다**.

## 왜 나는가

`await` 뒤의 `setState` 는 **"내가 요청할 때의 화면"이 아니라 "응답이 도착한 지금 화면"** 에 그려진다.
서버는 각자 제 데이터만 준다 — **RLS 우회가 아니라 클라이언트 표시 격리 문제**다.
다만 프로필 응답에는 `role` 이 같이 오므로, 계정 축에서는 표시가 아니라 **권한 경계** 문제가 된다.

## 쓸 인프라 (새로 만들지 마라 — 2026-09-13 실측)

| 축 | 파일 | 핵심 | 실측 |
|---|---|---|---|
| **대상**(uid · gameSeq · postId · `venueId#날짜`) | `src/lib/staleResponse.ts` | `isFreshResponse` / `isStaleResponse` — `seq` **와** `owner` 가 **둘 다** 같아야 그린다 | import 파일 **12**, 호출 **56곳** |
| **계정 세대** | `src/lib/authGeneration.ts` | `withOwner` / `withSignedOut` / `canApplyProfile` | 참조 파일 **4** |
| **세대 카운터만**(owner 축을 못 만들 때) | `src/components/features/gto/equityRequest.ts` | `planEquity` / `canApplyEquity` | — |

```bash
grep -rn "isFreshResponse\|isStaleResponse" src --include="*.ts" --include="*.tsx" | wc -l   # 56
grep -rl "staleResponse"   src --include="*.ts" --include="*.tsx" | wc -l                    # 12
grep -rl "authGeneration"  src --include="*.ts" --include="*.tsx" | wc -l                    # 4
```

### 두 축을 왜 둘 다 보는가 (`staleResponse.ts:28-29` 주석 그대로)

- `seq` 만 보면 놓친다 — **로그아웃처럼 새 요청 없이 대상만 사라지는** 경로가 있다.
- `owner` 만 보면 놓친다 — 같은 사람이 빠르게 두 번 새로고침하면 먼저 낸 응답이 나중에 온다.
- 비교는 `Object.is` 다. `===` 로 바꾸면 `NaN` owner 가 자기 자신과도 달라져 **정상 응답을 영원히 버린다**.

### 인증에는 규칙이 하나 더 있다 — `authGeneration.ts`

**부팅 첫 조회는 uid 를 아직 모른다.** 단순 owner 비교로 막으면 **자동 로그인이 통째로 버려진다**(A04 를 고치다 실제로 밟은 함정).

| 전이 | 세대 | 근거 |
|---|---|---|
| `null → uid` (부팅 세션 확인, 로그인 성공) | **올리지 않는다** | 바로 그 요청의 응답까지 버려진다 |
| 같은 계정 재확인(`TOKEN_REFRESHED`) | **올리지 않는다** | 무효화가 아니다 |
| `uid → 다른 uid` (계정 전환) | **+1** | 이전 계정의 in-flight 전부 폐기 |
| 로그아웃 | **+1**, 이미 로그아웃이어도 무조건 | 진행 중 조회를 끊는 것이 목적 |

`canApplyProfile` 은 세 겹이다 — ① `seq` 불일치 폐기 ② 확정된 owner 끼리 불일치 폐기(방어선)
③ owner 가 확정돼 있으면 **응답의 `profileId` 도** 그 사람이어야 한다.
로그아웃은 `apiSignOut()` 을 **기다리기 전에** 세대를 올린다 — 한 프레임도 되살아나지 않게.

## 판정 트리 — 이 비동기 setter 에 가드가 필요한가

```
0) 응답이 setState / setRef / 저장·공유 페이로드에 닿는가?
   아니오 → 불필요.
1) 그 사이 **대상이 바뀔 수 있는가**?  (아래 중 하나라도 '예' 면 필요)
     · 계정 축      — 로그아웃 · 계정 전환이 가능한가                → authGeneration (AuthContext) / owner=uid (그 외)
     · 대상 축      — 매장·게임·글·날짜·필터를 바꿀 수 있는가        → owner = 그 키 (`venueId#날짜` 처럼 합성해도 된다)
     · 순서 축      — 같은 대상에 재조회가 겹치는가
                      (realtime 버스트 · 연타 · 디바운스 · 재시도 타이머) → seq
   ⚠ owner 축을 고를 때 "그 값이 바뀌면 결과가 달라지는가" 로 고른다.
      F11: 에퀴티 owner 로 `canonicalSpotKey` 를 쓰려 했는데 그 키는 **빌런 카드를 의도적으로 뺀다** —
      빌런만 바꾸면 옛 승률이 남아 그대로 DB 에 저장됐다. 키가 빼는 축을 확인하고 골라라.
2) 무효 전환(계산 불가·조건 상실)에서도 세대를 올리는가?
   `if (!canCalc) { setX(null); return; }` 를 세대 증가 **위**에 두면 그게 F11 ①이다.
   무효 전환이야말로 진행 중 요청을 끊어야 하는 순간이다 — 세대는 `canCalc` 와 **무관하게** 올린다.
3) setter 가 몇 개인가?
   1~2개 → 각 콜백에서 `if (stale()) return;`
   3개 이상 → `guard()` 헬퍼로 감싼다(아래 표준형). 열거로 관리하면 반드시 하나 빠진다.
4) `key={user?.id}` 로 통째로 재마운트하면 되지 않나?
   **매장 축만 막고 realtime 재조회 겹침·날짜 전환은 못 막는다**(핸드오프 `:1536-1539` 의 실제 판단).
   `App.tsx:3172` 의 `key={user?.id ?? 'anon'}` 처럼 계정 축에만 보조로 쓴다 — setter 가드를 대체하지 않는다.
```

## 표준형

```ts
// 요청 직전
const seqRef = useRef(0);
const ownerRef = useRef<string | null>(null);
ownerRef.current = `${venueId}#${d}`;      // ⚠ 렌더 본문에서 **동기로** 갱신. useEffect 면 타이밍 갭이 생긴다
const owner = ownerRef.current;
seqRef.current += 1;
const seq = seqRef.current;
const stale = () => isStaleResponse({ seq, owner }, { seq: seqRef.current, owner: ownerRef.current });
const guard = <T,>(fn: (v: T) => void) => (v: T) => { if (!stale()) fn(v); };

api().then(guard(setData)).catch(guard((e: unknown) => setErr(e)));
```

세 가지를 같이 지킨다:
- **then · catch · finally 셋 다** 가드한다. 낡은 **실패**도 남의 화면에 오류 배너·로딩 해제를 남긴다.
- **재조회 실패는 데이터를 지우지 않는다** — `setErr` 만 하고 `setData([])` 는 하지 않는다(V04).
  첫 실패만 전면 오류, 이미 본 뒤의 실패는 목록 유지 + 인라인 배너(`everLoaded` / `hasBoardData`).
- **owner 가 바뀌면 즉시 초기화**한다 — `useEffect(() => { setData(null); setErr(null); }, [uid])`.
  가드는 '덮어쓰기'를 막을 뿐, 앞 계정의 화면을 **지우지는** 않는다.

## 회귀 테스트에서 무엇을 단언할 것인가

렌더 트리 테스트는 못 쓴다(vitest 환경이 `node` 라 Provider·supabase·모달 트리를 다 채워야 한다).
그래서 이 저장소는 **① 판정만 순수 함수로 빼서 단위 테스트** + **② 배선은 소스 계약 테스트** 두 벌을 쓴다.
(선례: `staleResponse.test.ts` **11건** · `authGeneration.test.ts` **15건** · `voucherStaleGuard.test.ts` **9건** ·
`StoreDashboardRace.contract.test.ts` **28건** — 2026-09-13 `npx vitest run` 실측, 5파일 **83건** 통과)

단언할 것:

1. **두 축 각각이 독립으로 버린다** — `seq` 같고 `owner` 다름 → 버림 / `owner` 같고 `seq` 다름 → 버림.
   (`staleResponse.test.ts:16,25`)
2. **사고 순서를 그대로 재현** — A 조회 시작 → 로그아웃 → B 로그인 → A 응답 도착 = 버림.
   중간(로그아웃 직후)에서도 이미 버려야 한다. (`staleResponse.test.ts:61`)
3. **반대편 절반 — "버리면 안 되는 것"**. 과잉 차단은 자동 로그인 실패다.
   `authGeneration.test.ts` 는 15건 중 **절반이 이쪽**이다(`:65` `A04 — 버리면 안 되는 것들`):
   부팅 첫 조회 · `TOKEN_REFRESHED` · 방금 한 로그인의 결과는 **반영돼야 한다**.
   **이 절반이 없는 가드 테스트는 통과해도 쓸모없다** — `return false` 한 줄로도 초록이 된다.
4. **then/catch/finally 세 곳 전부**에 가드가 있다(`voucherStaleGuard.test.ts:36` 은 가드 등장 횟수 ≥ 3 으로 잠근다).
5. **catch 가 데이터를 지우지 않는다** — `setErr` 만 있고 `setData` 가 없는 형태를 정규식으로 못박는다
   (`voucherStaleGuard.test.ts:45,70`).
6. **owner 가 uid 에 묶여 있다** — `const owner = uid` 와 `isStaleResponse({ seq, owner }` 를 같이 확인.
   owner 를 상수로 바꾸면 가드가 통과만 하고 아무것도 안 본다.
7. **완료부(로딩·갱신 시각)의 위치까지** — 가드가 `Promise.all().then()` 의 **첫 줄**이고
   `setLoading(false)` 가 그 **뒤**여야 한다.
   ⚠ `indexOf('if (!fresh()) return;')` 로만 보면 **위쪽 오류 핸들러의 같은 문장을 주워** 완료부 가드를 통째로 지워도 통과한다
   (`StoreDashboardRace.contract.test.ts:147-153` — 2026-09-13 음성 대조에서 실측된 거짓 통과).
8. **"빠진 setter 가 없다"를 열거가 아니라 잔여물 0 으로** — `guard( … )` 인자를 괄호 균형으로 통째로 지우고
   남는 `setX(` 목록이 **허용 목록과 정확히 일치**해야 한다. 무가드 setter 를 새로 추가하면 목록이 달라져 깨진다.
   (`StoreDashboardRace.contract.test.ts:204-236` 의 `stripGuarded`)
9. **벌거벗은 배선을 금지**한다 — `.then(setX` · `.catch(() => setX` 가 **하나도 남지 않는다**
   (`:249-250`). 한 줄이라도 남으면 그 줄이 무가드다.

깨뜨려 보는 절차는 `nuri-verify`. 단, ⑧ 때문에 **"함수는 맞는데 아무도 안 부르는" 경우**가 이 부류에서 실제로 났다 —
단위 테스트가 순수 함수를 직접 import 하면 호출부를 되돌려도 초록이다. **배선 앵커를 따로 둬라.**

---

# 부류 2 — 서버 오류 원문이 화면에 노출

## 증상

- 오류 카드에 `relation "secret_settings" does not exist` · `permission denied for function set_app_setting` ·
  `Key (venue_id)=(…) is not present in table "venues"` 처럼 **테이블·컬럼·함수·제약 이름**이 그대로 보인다.
- 반대 증상도 같은 뿌리다 — **권한이 없는데** '불러오지 못했습니다' 만 떠서 직원이 자기 조작을 의심하며 같은 버튼을 반복해 누른다.

## 왜 나는가

`src/lib/dbError.ts` 의 `msgOf` 는 **`code` 로 갈래를 판단한다.** 그런데 API 계층에서
`throw new Error(error.message)` 로 감싸면 그 한 줄이 **`code` 를 버린다.**
그러면 `msgOf` 는 "코드 없는 오류 = 우리가 쓴 문장" 갈래로 떨어져 **원문을 그대로 반환**하고,
`isDenied`(`code==='42501' || status===403`)도 동시에 `false` 가 된다.
`LoadErrorCard` 는 `msgOf(error, '')` 를 그대로 DOM 에 그리고, **비로그인도 닿는 화면**(이벤트 판)이 있다 →
공개 저장소 구조 위에서 **스키마를 그대로 알려 주는 꼴**이다(CLAUDE.md 보안 표준 **6번**).

**실측 (2026-09-13, `src/lib/dbError.ts` 를 직접 불러 확인):**

| 입력 | 화면에 나가는 값 | `isDenied` |
|---|---|---|
| `{ code:'42P01', message:'relation "secret_settings" does not exist' }` | `"불러오지 못했습니다"` + 콘솔에 `[db] 42P01 …` | — |
| **`new Error('relation "secret_settings" does not exist')`** | **`"relation \"secret_settings\" does not exist"`** 🔴 | — |
| `{ code:'42501', message:'permission denied for function set_app_setting' }` | `"권한이 없습니다. 매장 담당자 계정인지 확인해 주세요"` | **true** |
| **`new Error('permission denied for function set_app_setting')`** | **원문 그대로** 🔴 | **false** 🔴 |

**즉 `code` 하나를 버리면 두 가지가 동시에 깨진다 — 원문이 새고, 권한 안내가 사라진다.**

## 쓸 인프라

| 하려는 일 | 쓸 것 |
|---|---|
| API 에서 오류 던지기 | **`if (error) throw error`** — 원본을 그대로. 이미 `src/api` 에 **161곳** |
| 감싸야 한다면 | `code`·`details`·`hint`·`status` 를 **실어 나르는** Error 서브클래스 — `EventRpcError`(`src/api/adminEvents.ts:68`) · `SettingsError`(`src/api/settings.ts:12`) |
| 화면 문구로 바꾸기 | `msgOf(e, '맥락을 담은 fallback')` (`src/lib/dbError.ts`) |
| '못 불러옴' vs '권한 없음' 갈라 그리기 | `isDenied(e)` → `LoadErrorCard`(`src/components/atoms/LoadErrorCard.tsx:39,55`) |
| '다시 하면 되는' 부류 구분 | `isOffline(e)` |

## 무엇을 보여주고 무엇을 삼킬 것인가 — 규칙

| 오류 | 화면 | 원문 | 왜 |
|---|---|---|---|
| `P0001` (plpgsql `raise exception`) | **원문 그대로** | — | 우리가 **사용자를 향해** 직접 쓴 문장이다. 번역하면 나빠진다 |
| `42501` / `status 403` | **"권한이 없습니다…" + 별도 분기** | 콘솔 | 🔴 **삼키면 안 된다.** 조회 실패와 처방이 다르다 — 직원이 같은 버튼을 반복해 누르게 된다 |
| 네트워크 끊김 | "네트워크가 끊겼습니다…" | — | 유일하게 '다시 시도하면 되는' 부류라 따로 구분한다 |
| `23505·23503·23514·22P02·PGRST301·PGRST202` | 준비된 행동 가능 문장 | — | 사용자가 할 수 있는 일이 있다 |
| **내부 SQLSTATE**(`42P01·42703·42883·XX000·53300·40001` …) | **fallback 만** | **`console.warn('[db] …')` 로 남긴다** | 원문에 식별자·SQL 이 들어 있다. 그렇다고 버리지는 않는다 — 재현 안 되는 버그의 유일한 단서 |
| `details` / `hint` | 같은 기준으로 거른다 | 콘솔 | `details` 가 원문보다 더 노골적이다(컬럼·값·테이블을 한 줄에) |
| **코드가 없는 오류** | 원문 그대로 | — | 네트워크·SDK·우리 `throw new Error('…')` 는 우리가 쓴 문장이다 — **그래서 `code` 를 절대 버리면 안 된다** |

> **두 방향으로 동시에 틀릴 수 있다.** 전부 보여주면 스키마가 새고, 전부 삼키면 `dbError.ts` 가 원래 막으려던
> "모든 실패가 '저장 실패' 한 문장으로 뭉개짐"이 되돌아온다. **둘 다 단언해라.**

## 판정 트리

```
A) src/api 에 새 함수를 쓴다
   → `if (error) throw error` 가 기본이다.
     감싸야 할 이유가 있으면(도메인 분기·마이그레이션 미적용 안내) code/details/hint/status 를 실은 서브클래스로.
     🔴 `throw new Error(error.message)` 는 쓰지 마라 — 그 한 줄이 위 표 전체를 무력화한다.
B) 화면에서 오류를 문장으로 만든다
   → `msgOf(e, fallback)`. fallback 에 **호출부 맥락**을 담아라('장부 저장 실패').
     🔴 `e instanceof Error ? e.message : '…'` 를 새로 쓰지 마라 — 필터를 우회한다.
C) 목록/패널이 비었다
   → `LoadErrorCard` 로 '없음'·'못 불러옴'·'권한 없음' **세 갈래**를 갈라라. 두 갈래면 실패가 '없음'으로 위장한다.
D) 이 화면에 비로그인이 닿는가?
   → 그렇다면 원문 노출은 **공개 스키마 유출**이다. 우선순위를 올려라.
```

## ⚠ 이 저장소에 남아 있는 부채 (새로 늘리지 마라)

```bash
grep -rn "new Error(error\.message" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l   # 125
grep -rn "if (error) throw error" src/api --include="*.ts" | wc -l                                        # 161
grep -rn "msgOf(" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l                     # 23
```

**125곳이 아직 `code` 를 버린다**(`community.ts`·`vouchers.ts`·`ledger.ts`·`auth.ts` 에 집중).
그중 화면이 `msgOf` 를 거치는 경로만 노출로 이어진다 — **전수 개조는 이 스킬의 범위가 아니다.**
지금 건드리는 파일에 있으면 그때 `throw error` 로 바꾸고, **새로 추가하지 마라.**

## 회귀 테스트에서 무엇을 단언할 것인가

`src/lib/dbError.test.ts` **20건**이 선례다. 양쪽을 **한 파일 안에서** 잠근다:

1. **누설 목록을 표로 돌린다** — `42P01·42703·42883·XX000·53300·40001` 각각에 대해
   `msgOf` 결과가 fallback 과 **정확히 같고** `does not exist` 를 포함하지 않는다 (`:71-87`).
2. **`details` 도 같은 기준** — `Key (venue_id)=(…) is not present in table "venues"` 가
   결과에 `venues|venue_id` 로 나타나지 않는다 (`:89`).
3. **반대편 절반** — `P0001` 원문 유지 · 코드 없는 오류 원문 유지 · `42501` 은 여전히 "권한이 없습니다" ·
   `PGRST116` 은 5글자가 아니라 내부 분류에 안 걸린다 (`:104-124`).
   **이 절반이 없으면 `msgOf` 를 `return fallback` 한 줄로 바꿔도 초록이다.**
4. **`isDenied` 가 살아 있다** — 42501 을 준 오류가 `LoadErrorCard` 에서 '권한 없음' 갈래로 간다
   (`adminEventOps.migration.test.ts:70` · `eventVisibility.test.ts:211` 이 이미 이 형태다).
5. **Supabase 오류는 평범한 객체다** — `instanceof Error` 로는 못 읽는다는 것을 단언에 박아 둔다 (`:10`).
6. API 래퍼를 새로 만들었으면 **`code` 가 실려 나가는지**를 단언한다 — 서브클래스 인스턴스의
   `.code` 가 원본과 같고, `msgOf` 가 그 인스턴스에서 준비된 문장을 낸다.

---

# 부류 3 — localStorage 무가드 읽기 → 흰 화면

## 증상

사파리 프라이빗 · 쿠키 차단 웹뷰 · 기업 정책 · 저장소 용량 초과 뒤 손상된 상태에서
**앱이 통째로 죽는다.** 그 환경은 **영구 조건**이라 새로고침해도 같은 화면이다 — 사용자는 빠져나갈 수 없다.

## 왜 나는가

`localStorage.getItem` 은 **읽기만 해도 `SecurityError` 를 던진다.**
"없는 값을 `null` 로 주는 것"과 **완전히 다르다**(`ThemeContext.tsx:20-21`).
그리고 던지는 위치에 따라 피해 범위가 다르다 — 이 저장소의 실제 렌더 트리로 재면:

| 던지는 위치 | 결과 | 근거 |
|---|---|---|
| **모듈 최상위 / `createRoot` 이전** | 🔴 **진짜 흰 화면.** React 가 시작도 못 해 폴백이 없다 | `src/main.tsx:21` 이 그래서 try 를 두고 있다(`createRoot` 는 `:56`) |
| `App`·Provider 의 렌더 본문·`useState` 초기화자·`useEffect` | 루트 `ErrorBoundary`(`src/main.tsx:58`)의 **전역 풀스크린 폴백**("잠시 문제가 생겼어요") = 앱 사용 불가 | `ThemeProvider`·`App`·`CustomerDashboardPage`(`App.tsx:3172`)가 전부 이 층 |
| 탭·섹션 컴포넌트(`<ErrorBoundary inline>` 안) | 그 **탭만** 오류 카드 | `App.tsx:3609·3618·3649·3659·3671·3690·3721` |

**JSON 파싱 실패도 같은 부류다.** `getItem` 을 감싸도 `JSON.parse` 를 안 감싸면 같은 자리에서 같은 결과가 난다.
이 저장소의 `JSON.parse` 는 non-test **18곳 전부가 저장소 값**을 먹는다(2026-09-13 18곳 입력을 전수로 되짚어 확인).

**실측 (2026-09-13, 던지는 저장소를 주입해 재현):**

```
① typeof 가드만            → THROW: SecurityError   ← useState 초기화자면 렌더가 터진다
② try/catch 표준형          → null                   ← 정상 폴백
③ JSON.parse 무가드         → THROW: SyntaxError     ← getItem 을 감싸도 parse 를 안 감싸면 같은 결과
```

🔴 **`typeof localStorage !== 'undefined'` 는 가드가 아니다.** 그건 SSR/비브라우저 환경만 걸러낸다.
객체는 **존재하면서** 던진다.

## 쓸 인프라 — 표준형은 이 저장소에 이미 있다

```ts
// 정본: src/contexts/ThemeContext.tsx:25-31
function readStoredTheme(): Theme | null {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : null;
  } catch {
    return null;          // ← 폴백은 **안전한 기본값**. 예외를 위로 던지지 않는다
  }
}
```

한 줄 형태(이 저장소의 관용구, 그대로 따라 써라):

```ts
try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }        // identityFlag.ts:35
try { localStorage.setItem(KEY, v); } catch { /* 저장소 차단 환경 */ }             // ThemeContext.tsx:63
try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } // ToolsPanel.tsx:313
try { raw = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch { return null; } // pendingViewIntent.ts:87
```

**규칙 넷:**
1. **접근이 아니라 `getItem` 호출까지** try 안에 넣어라. `safeLocal()` 처럼 **객체 얻기만** 감싸면
   `getItem` 이 던질 때 **폴백에 닿기도 전에** 터진다 — A03-1 에서 실제로 난 일이다(`src/lib/supabase.ts:46-48`).
2. **`getItem` 과 `JSON.parse` 를 같은 try 안에** 둬라.
3. **쓰기 실패가 화면 반영을 되돌리지 않게** 한다 — 클래스·state 는 먼저 반영하고 `setItem` 은 그 뒤에 감싼다
   (`ThemeContext.tsx:61-63`: "이 세션 안에서는 정상 동작하고, 다음 방문에 기억되지 않을 뿐이다").
4. **읽기가 막힌 환경에서만 메모리 거울로 답한다.** 저장소가 `null` 을 돌려주면 **그대로 `null`** 이다 —
   메모리로 덮으면 "로그아웃했는데 다시 로그인됨"이 생긴다(`src/lib/supabase.ts` A03-2 의 실제 함정).

## 판정 트리

```
1) 이 읽기가 렌더 경로에 있는가?
   모듈 최상위 / createRoot 이전     → 🔴 최우선. 진짜 흰 화면이다
   useState 초기화자 / 렌더 본문     → 🔴 앱 또는 탭이 통째로 죽는다
   useEffect / 이벤트 핸들러         → 그 기능만 죽는다 (그래도 감싼다 — effect 의 throw 도 경계로 올라간다)
2) 파싱하는가? → getItem 과 같은 try 안에.
3) 실패했을 때 무엇을 반환할 것인가?
   **기능이 꺼지는 쪽이 아니라 "없던 것처럼" 동작하는 기본값**을 골라라.
   예: 테마=다크 · 즐겨찾기=[] · 코치마크=안 봤음 · 자동로그인 플래그=false.
   ⚠ 실패를 '숨김'·'차단'으로 해석하지 마라 — 진입 경로가 사라지면 사용자가 되돌릴 방법이 없다.
4) 쓰기도 있는가? → 별도 try. 쓰기 실패가 이미 반영된 화면을 되돌리지 않게.
```

## 지금 남아 있는 무가드 (2026-09-13 실측 — **3곳**)

`.getItem(` 은 non-test **47회 / 33파일**. 그중 try 밖은 셋뿐이다:

| 위치 | 형태 | 터지면 |
|---|---|---|
| `src/App.tsx:1607` | `useEffect` 안 `sessionStorage.getItem('nh_pw_otp')` | `App` 본문 → **전역 풀스크린 폴백** |
| `src/components/features/CommunityTab.tsx:553` | `useState` 초기화자, `typeof` 가드만 있다 | `inline` 경계(`App.tsx:3618`) → **커뮤니티 탭만** 오류 카드 |
| `src/components/features/ProfileModal.tsx:170` | `useEffect` 안 `sessionStorage.getItem` + `removeItem` | `CustomerDashboardPage`(`App.tsx:3172`)는 `inline` 경계 **밖** → 전역 폴백 |

전수 재측정(직접 돌려 확인한 명령):

```bash
node -e '
const {execSync}=require("child_process"),fs=require("fs");
const files=execSync(`grep -rl "\\.getItem(" src --include="*.ts" --include="*.tsx"`,{encoding:"utf8"})
  .trim().split(/\r?\n/).filter(f=>!/\.test\.tsx?$/.test(f));
const bad=[];
for(const f of files){
  const lines=fs.readFileSync(f,"utf8").split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const L=lines[i], at=L.indexOf(".getItem(");
    if(at<0||/^\s*(\/\/|\*)/.test(L))continue;
    if(/\btry\b/.test(L.slice(0,at)))continue;
    const up=lines.slice(Math.max(0,i-25),i).join("\n"), t=up.lastIndexOf("try {");
    if(t>=0){const s=up.slice(t);
      if((s.match(/\{/g)||[]).length>(s.match(/\}/g)||[]).length)continue;}
    bad.push(f+":"+(i+1)+"  "+L.trim().slice(0,92));
  }
}
console.log("무가드 .getItem( =",bad.length+"\n"+bad.join("\n"));
'
```

⚠ 이 검출기는 **휴리스틱**이다(같은 줄 `try` + 위 25줄 안의 열린 `try` 만 본다).
받는 객체를 가리지 않으므로 **`sessionStorage` 도 같이 잡힌다** — 위 3곳 중 둘이 그렇다.
못 보는 것은 `.getItem(` **이 아닌 접근**이다. 같은 검출기의 API 만 바꿔 돌린 실측(2026-09-13):
무가드 `.setItem(` **0곳** · 무가드 `.removeItem(` **3곳**(`src/App.tsx:2380` ·
`src/components/features/CustomerDashboardPage.tsx:231` · `src/components/features/ProfileModal.tsx:175`).
`removeItem` 도 같은 환경에서 던지는데 **앞 둘은 위 표에 없다**(둘 다 이벤트 핸들러라 그 조작만 죽는다).
`localStorage.key()`·`.length` 도 밖이다(`src/lib/rankingDraft.ts:80-81` — 여기는 try 안이라 안전).
`document.cookie`·IndexedDB·`caches` 는 src 에 **0회**라 오늘은 잴 것이 없다(새로 쓰면 검출기 밖이다).
목록이 줄었다고 "전부 안전"으로 읽지 마라.

## 회귀 테스트에서 무엇을 단언할 것인가

1. **던지는 저장소를 주입하고 함수가 폴백을 반환한다** — `throw` 가 위로 새지 않는다.
   `localStorage` 를 `{ getItem(){ throw new DOMException('x','SecurityError'); } }` 로 바꿔 놓고 호출한다.
2. **읽기·쓰기 각각**을 따로 던지게 해서 단언한다. 이 저장소에는 **쓰기는 되는데 읽기가 던지는** 환경이
   실제로 있었다(A03-2). 한쪽만 테스트하면 그 조합을 못 잡는다.
3. **깨진 JSON** 을 돌려주는 저장소에서도 폴백이 나온다(`'{"a":'` 같은 값).
4. **반대편 절반** — 정상 저장소에서는 **저장값이 그대로 읽힌다**.
   폴백만 단언하면 `return null` 한 줄로도 초록이 된다.
5. 인증 저장소라면 **"로그아웃했는데 다시 로그인됨"** 을 따로 못박는다 —
   저장소가 `null` 을 주면 결과도 `null`(메모리 거울이 덮지 않는다), `removeItem` 은 양쪽 저장소와 메모리를 **모두** 비운다.
   (`src/lib/authStorage.test.ts` **11건**이 이 형태다)
6. 렌더 경로라면 **어느 경계가 잡는지**를 알고 단언 범위를 정해라 — 전역 폴백 층이면
   "앱 전체가 죽는다"가 회귀의 의미다.

---

# 이 스킬이 못 보는 것

- **서버 쪽은 하나도 보지 않는다.** RLS·RPC GRANT·엣지 함수 인증은 `security-audit`·`nuri-migration`.
  부류 1 은 전부 **클라이언트 표시 격리**다 — 이걸 다 해도 **권한이 새면 아무 소용 없다**.
- **실제 브라우저에서 재현하지 않았다.** 부류 3 의 실측은 던지는 저장소를 **주입해** 재현한 것이고,
  사파리 프라이빗·특정 웹뷰의 실제 동작은 확인하지 않았다. 기기별 차이는 못 본다.
- **소스 계약 테스트는 "그 문장이 있는가"만 본다.** 실행 결과가 아니다.
  정규식 밖의 동등한 코드(다른 이름·다른 배치)는 통과하지 못하고, 반대로 **죽은 코드**도 통과시킨다.
  ⑧·⑨ 같은 잔여물 0 기법이 그 구멍을 좁힐 뿐 닫지는 못한다.
- **경합의 실제 타이밍을 재지 않는다.** 응답 순서 역전이 현장에서 얼마나 자주 나는지, 창이 몇 ms 인지 모른다.
  판정 로직이 맞는지만 본다.
- **검출기는 `.getItem(` 만 본다.** `sessionStorage` 는 같이 잡히지만(무가드 3곳 중 둘),
  `removeItem`·`setItem`·`key()`·`length` 는 밖이다 — 무가드 `.removeItem(` **3곳**이 위 표에 없다.
  IndexedDB·`document.cookie`·`caches` 는 src 에 0회라 오늘은 잴 것이 없다.
- **요청 자체를 끊지 않는다.** 여기 나오는 가드는 **도착한 응답을 버릴** 뿐이라 네트워크 왕복·서버 부하·
  외부 API 과금은 그대로다. 취소 경로는 이 저장소에 아예 없다(`AbortController`·`abortSignal` 사용 **0곳**,
  2026-09-13 실측) — 연타로 요청이 쌓이는 것이 문제라면 이 스킬만으로는 부족하다.
- **오류 원문 부채 125곳을 화면 경로까지 추적하지 않았다.** 그중 몇 곳이 실제로 `msgOf` 를 거쳐
  DOM 에 닿는지는 재지 않았다 — "노출 가능성"이지 "노출 확인"이 아니다.
- **Sentry·`client_errors` 로 나가는 원문은 범위 밖이다.** 화면 노출만 본다. 콘솔·수집 경로에
  식별자가 남는 것은 의도된 설계다(`logInternal`).
- **e2e 로 확인하지 않았다.** 이 스킬을 쓰고 나면 `nuri-ship` → `nuri-e2e` → `nuri-verify` 순서로 넘겨라.

# 이 문서의 수치를 다시 재는 명령 (전부 직접 실행해 확인한 것, 2026-09-13)

```bash
grep -rn "isFreshResponse\|isStaleResponse" src --include="*.ts" --include="*.tsx" | wc -l              # 56
grep -rl "staleResponse"  src --include="*.ts" --include="*.tsx" | wc -l                                # 12
grep -rl "authGeneration" src --include="*.ts" --include="*.tsx" | wc -l                                # 4
grep -rn "new Error(error\.message" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l # 125
grep -rn "if (error) throw error" src/api --include="*.ts" | wc -l                                      # 161
grep -rn "msgOf(" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l                   # 23
grep -rn "\.getItem(" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l               # 47
grep -rl "\.getItem(" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l               # 33

npx vitest run src/lib/staleResponse.test.ts src/lib/authGeneration.test.ts src/lib/dbError.test.ts \
  src/components/features/voucherStaleGuard.test.ts \
  src/components/features/StoreDashboardRace.contract.test.ts
# → Test Files 5 passed · Tests 83 passed (11 · 15 · 20 · 9 · 28)
```

⚠ `npm run test:e2e` 와 `npm run test:mutation` 은 여기서 돌리지 마라 —
전자는 보호 파일 `public/sitemap.xml` 을 덮고(→ `nuri-e2e`), 후자는 소스를 덮어쓴다.
