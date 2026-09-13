---
name: nuri-affect
description: src/api 에 UPDATE/DELETE 를 새로 쓰거나 고칠 때, mutationAffected.contract.test.ts 가 실패했을 때, 또는 "삭제·해제·승인이 화면에서만 됐고 새로고침하면 되살아난다" 부류를 조사할 때 호출. PostgREST 는 RLS 가 막은 변이를 오류가 아니라 0행 200 으로 돌려주므로, mustAffect / .select()+검사 / idempotentOff / ALLOW 중 무엇을 쓸지 정하고 계약을 통과시킨다.
---

# nuri-affect — 클라이언트 변이의 "조용한 0행" 계약

**한 문장**: PostgREST 는 RLS 가 막은 UPDATE/DELETE 를 오류가 아니라 **0행 200(`error: null`)** 으로 돌려준다.
`.select()` 없이 `const { error } = await …` 로 받으면 클라이언트는 그걸 **성공으로 읽는다**.

같은 결함이 두 번 났다.
- **approveOwner (2026-09-12)** — 회원 승인이 0행 200 으로 통과해 관리자 화면만 '승인됨' 이었다.
- **deletePost (F15, 2026-09-13)** — 권한 없는 운영자가 눌러도 '삭제되었습니다' 가 뜨고 낙관적 갱신으로 목록에서 사라져, 새로고침 전까지 아무도 몰랐다.

두 번 났으므로 개별 수정이 아니라 **통로 하나 + 전수 계약**이다: `src/api/_mustAffect.ts` · `src/api/mutationAffected.contract.test.ts`.

## 경계 — 여기서 안 하는 것
- **RLS 정책·RPC·ACL·마이그레이션** = `nuri-migration`. 이 스킬은 서버가 왜 0행을 줬는지 안 고친다. 클라이언트가 **0행을 성공이라 말하지 않게** 할 뿐이다.
- **lint/vitest/build 게이트 순서** = `nuri-ship`. **비밀·의존성·어드바이저** = `security-audit`.
- **계약을 일부러 깨뜨려 빨간불을 확인하는 절차(음성 대조)** = `nuri-verify`(`nc.sh` — 원복 보장·앵커 유일성).
  여기서는 **무엇을 깨뜨려 봐야 하는지**만 정한다(§5).

---

## 1. 결정 트리 — 새 변이를 쓸 때 30초

```
Q1. 0행일 때 사용자가 "됐다"를 보는가? (토스트 / 낙관적 갱신 / 모달 닫힘 / 목록에서 사라짐)
     아니오 — 백그라운드·베스트에포트·fire-and-forget·전진자(백업) ─────────→ ④ ALLOW + 사유
     예 ↓
Q2. 켜기/끄기 쌍의 **끄는 쪽**이고, 켜기가 upsert·23505 무시로 관대하고, **본인 행**인가? (셋 다여야 한다)
     예 ──────────────────────────────────────────────────────────────────→ ③ idempotentOff
     아니오 ↓
Q3. 바뀐 **행의 값**이 뒤 로직에 필요한가? (예: 기각 시 target_id 로 블라인드 해제)
     예 ─────────────────────────────────────────────────────→ ② .select('필요한 컬럼') + 0행 검사
     아니오 ─────────────────────────────────────────────────→ ① mustAffect   ← 기본값
```

애매하면 **①**. ①이 과하다고 느끼면 그건 대개 Q1 이 '아니오' 인 경우이고, 그러면 ④에 **이유를 글로 써야** 한다.

### ① mustAffect — 기본값 (실측 64곳)
```ts
import { mustAffect } from './_mustAffect';
await mustAffect(supabase.from('community_posts').delete().eq('id', postId));
// 맥락이 필요한 화면만 두 번째 인자로 문장을 준다
await mustAffect(
  supabase.from('ledger_sessions').update(patch).eq('venue_id', venueId).eq('session_date', date),
  '마감할 장부를 찾지 못했습니다. 장부를 먼저 열었는지, 권한이 있는지 확인해 주세요',
);
```
오류는 **그 객체 그대로** 던지고(호출부의 `instanceof Error`·`msgOf` 분기가 종전과 같다), 0행은 `NoRowsAffectedError`.

> **왜 인자 없는 `.select()` 인가 (실측)** — `supabase/baseline/2026-07-20-live-snapshot.sql` 확인:
> `clock_states`(:90) · `post_reactions`(:517) · `staff_wage`(:678) · `venue_follows`(:732) 에 **`id` 컬럼이 없다**.
> `.select('id')` 는 `RETURNING id` 라 42703 으로 터지고 **쓰기 자체가 롤백**된다 — 기능이 죽는다.
> `mustAffect` 는 행 수만 보므로 컬럼 이름에 의존하지 않는다. 여기에 `.select('id')` 를 넣지 마라.

### ② `.select(컬럼)` + 0행 검사 (실측 9곳)
반환 행의 **값**이 필요할 때만. 그 테이블에 그 컬럼이 있는지는 네 책임이다.
```ts
const { data, error } = await supabase.from('reports').update({ status }).eq('id', id)
  .select('target_type, target_id');
if (error) throw error;
if (!data || data.length === 0) throw new Error('처리 권한이 없거나 이미 처리된 신고입니다');
```

### ③ idempotentOff — 멱등 토글의 **끄는 쪽 전용** (실측 4곳)
`error` 는 그대로 던지고 **0행만** 성공으로 흡수한다(`boolean` 반환).
```ts
import { idempotentOff } from './_mustAffect';
const user = await currentUser();        // ← 이 모양이어야 계약이 '본인 행' 으로 인정한다(§3)
if (!user) throw new Error('로그인이 필요합니다');
await idempotentOff(supabase.from('venue_follows').delete().eq('user_id', user.id).eq('venue_id', venueId));
```
**왜 따로 있나 (2026-09-13 검증 FAIL ①)**: 켜기는 upsert/23505 무시로 "이미 켜져 있음" 을 성공으로 흡수하는데
끄기만 `mustAffect` 로 엄격하면 **되돌림이 서버와 반대 방향**을 그린다 — 다른 탭에서 먼저 해제한 찜을 다시 해제하면
호출부가 `setLiked(!next)` / `setView(before)` 로 되돌려 **하트가 '찜함' 으로 켜진다(서버엔 찜이 없다)**.
거짓말을 없애려던 스윕이 같은 부류의 거짓말을 반대 방향으로 만든 것이다.

⚠ **본인 행에만** 쓴다. 남의 행·매장 행은 RLS 거부가 0행으로 위장하므로 ①이 맞다.
(`staffSchedule` 의 `addStaffShift`/`removeStaffShift` 는 켜기가 관대하지만 **매장 행**이라 여기 없다.)

### ④ ALLOW — 확인 불필요 선언 (실측 11곳)
`mutationAffected.contract.test.ts` 의 `ALLOW` 에 `파일::함수::연산:테이블` 키와 **10자 넘는 이유**를 적는다.
이유가 되는 것: 전진자(백업은 새 행을 만들지 않는다) · fire-and-forget(`.catch(() => {})`) · 읽음 스탬프 ·
"바로 뒤 insert/upsert 가 같은 RLS 를 42501 오류로 드러낸다" · "원래 없던 첨부를 지우는 것이라 0행이 정상".
이유가 **안 되는 것**: "귀찮다" · "어차피 관리자만 쓴다" · "RLS 가 있으니 괜찮다".

---

## 2. 스캐너가 읽는 모양 — 이대로 써야 잡힌다

계약은 AST 가 아니라 **문자 스캐너 + 좁은 창**이다. 아래는 합성 파일로 **실측한** 동작이다.

| 쓰는 방식 | 결과 |
|---|---|
| `await mustAffect(supabase.from('venues').delete()…)` — 한 문장 인라인 | ✅ 확인됨 |
| `` await mustAffect(supabase.from(`venues`).delete()…) `` — 백틱 | ✅ 확인됨(백틱도 읽는다) |
| `const q = supabase.from('venues').delete()…; await mustAffect(q);` | ❌ **미확인으로 잡혀 계약이 깨진다** |
| `.select('id')` 검사를 **400자 넘게** 떨어뜨려 놓기 | ❌ **미확인으로 잡혀 계약이 깨진다** |

규칙 (`scan()`):
- `.update(`/`.delete(` 와 같은 문장(직전 `;` 이후)에 **`supabase` 리터럴**이 있어야 변이로 센다.
- `mustAffect(`/`idempotentOff(` 는 `supabase` **바로 앞 40자** 안에서 끝나야 인정된다 → **변수로 빼지 마라.**
- ②는 문장 안 `.select(` + (문장 안 `.single()` **또는** 문장 끝 이후 **400자** 안의 `length === 0`·`NoRowsAffectedError`).
- `.from()` 인자는 `'` `"` `` ` `` 만 읽는다. 못 읽으면 조용히 버리지 않고 **`(unparsable)` 키로 계약을 깬다** — 사람이 한 번 보게 만드는 장치다.
- 키의 함수 이름은 **열 0 선언**만 센다. 들여쓴 지역 헬퍼 안에 변이를 두면 키가 바깥 함수 이름이 된다.
- 우회 방지: `mustAffect`/`idempotentOff` 를 쓰는 파일은 `import { … } from './_mustAffect'` 가 필수이고, 같은 이름의 지역 정의는 실패다.

---

## 3. IDEMPOTENT_OFF 등재 — 사유 문장이 **검사된다**

`IDEMPOTENT_OFF` 의 값은 산문이 아니라 **선언**이다. 다섯 가지가 코드로 대조된다.

```ts
'src/api/community.ts::unfollowVenue::delete:venue_follows':
  '켜기 = followVenue insert + 23505 무시. 본인 행(user_id).',
```
1. 사유에 **`켜기 = <함수명>`** 이 있어야 한다.
2. 그 함수가 같은 파일에 **열 0 선언**으로 존재해야 한다.
3. 그 함수 본문에 `.upsert(` 또는 `'23505'` 가 있어야 한다(실제로 관대한가).
4. 그 관대함이 **같은 테이블** `.from('<테이블>'` 로부터 **150자 안**에 있고, 사이에 **다른 `.from(` 이 끼면 실패**.
   끄는 문장 자체는 증거에서 **전부 제거**된다(같은 함수 안의 on/off 분기가 스스로를 만족시키는 것을 막는다).
5. 사유에 **`본인 행(<컬럼>)`** 이 있고, 그 컬럼이 끄는 문장의 `.eq('<컬럼>', <세션 id 식>)` 로 **실재**해야 한다.

### 세션 id 로 인정되는 관용구 — 이 네 선언뿐 (`const` 고정 · `;` 까지 정확히)
```ts
const me  = await currentUser();                                  // → me.id / me?.id
const uid = (await currentUser())?.id;                            // → uid
const { data: { user } } = await supabase.auth.getUser();         // → user.id / user?.id
const { data: u } = await supabase.auth.getUser();                // → u.user.id / u.user?.id — 이 한 줄만으로 인정된다
const uid = u.user?.id;                                           //   (중간 변수를 두면 uid 가 추가로 인정될 뿐, 필수가 아니다)
```
`let`·`var` 는 매치하지 않는다(정규식이 `const` 로 고정돼 있다).

**거부는 두 갈래이고 터지는 메시지가 다르다 — 실측.** 이걸 섞으면 엉뚱한 메시지를 찾아 헤맨다.
- 판정기가 **빈 배열**을 돌려주는 것 → `… 세션 사용자 id 바인딩을 못 찾았다`:
  `await currentUserId()` · `await currentUserStrict()` · 세미콜론 없이 줄바꿈 · `?? victimId` 폴백 · `let`/`var` 선언.
- 판정기는 **채워지는데 그 값이 아닌 것** → `<컬럼> 이 세션 사용자 값과 비교되지 않는다`:
  같은 함수에 `getUser()` 구조분해가 남아 있는 채로 `const uid = someRow.user?.id;`(다른 객체)나 하드코딩된 남의 id 를 쓰는 경우.
  배열에 `u.user.id`·`u.user?.id` 가 들어 있어 **첫 메시지는 뜨지 않는다**. 거부는 `.eq()` 대조에서 난다.

> `_session.ts` 에 `currentUserId()`·`currentUserStrict()` 가 **실제로 있는데도** 계약은 인정하지 않는다.
> 걸리면 **정규식을 느슨하게 풀지 마라** — 위 네 형태 중 하나로 맞추는 게 먼저다.
> 정말 새 관용구가 필요하면 `sessionIdExprs` 에 **명시적으로** 추가하고, 같은 커밋에서 그 판정기의
> 단위 테스트(`🔴 sessionIdExprs 는 …`)에 **거부 사례도 함께** 넣어라. 넓히기만 하면 검사가 무의미해진다.

`currentUser` 자체도 못 박혀 있다: **줄 첫머리** `import { currentUser } from './_session';` 여야 하고,
지역 재정의·구조분해 바인딩은 실패한다(문자열 리터럴로 import 를 흉내 내던 우회를 막은 것).

---

## 4. 계약이 깨졌을 때 — 메시지 → 조치

| 실패 메시지 | 무슨 뜻 | 조치 |
|---|---|---|
| `영향 행수를 확인하지 않는 변이가 새로 생겼다` | 새 변이가 ①②③ 어디에도 없다 | §1 결정 트리. 대부분 `mustAffect` |
| `ALLOW 에 있는데 더는 확인 없는 변이가 아니다` | 고쳐졌거나 사라졌다 | ALLOW 에서 그 줄을 지운다 |
| 키가 `…:(unparsable)` | 스캐너가 `.from()` 을 못 읽었다 | 테이블 이름을 **리터럴**로 되돌려라(변수·조립 금지) |
| `idempotentOff 를 새로 쓴 변이가 있다` | ③을 등재 없이 썼다 | §3 다섯 조건. 하나라도 안 되면 ①이 맞다 |
| `켜는 쪽 … 이 <테이블> 을 끄는 문장 밖에서 건드리지 않는다` | 짝 주장이 거짓 | 진짜 짝 함수명을 적거나 ①로 바꿔라 |
| `<컬럼> 이 세션 사용자 값과 비교되지 않는다` | 남의 행일 수 있다 | 관용구를 §3 형태로 맞추거나 ①로 바꿔라 |
| `스캐너가 실제로 변이를 찾는다` (하한 80/70) | 스캐너가 눈이 멀었다 | **숫자를 낮추지 마라.** `stripComments`·`.from()` 파싱부터 의심 |

---

## 5. 검증 — 통과만 보고 끝내지 마라

```bash
npx vitest run src/api/mutationAffected.contract.test.ts
# 2026-09-13 실측: 13 tests passed (소요 시간은 실행마다 달라 판정 기준이 아니다 — 개수만 본다)

# 도달·throw 는 mock 테스트가 본다 (계약은 문장의 '존재'만 본다)
npx vitest run src/api/mustAffect.test.ts src/api/idempotentOff.test.ts \
  src/api/community.deletePost.test.ts src/api/clock.clearState.test.ts
```

**음성 대조를 반드시 해라.** 새로 쓴 `mustAffect(` 를 잠깐 지우고 계약이 **실패하는 것을 본 뒤** 되돌린다.
(되돌림을 바이트로 증명하는 절차는 `nuri-verify` 의 `nc.sh` 를 쓴다 — 여기서 되풀이하지 않는다.)
이 저장소에서 계약은 **"13개 전부 통과" 인 채로 세 번 구멍이 나 있었다**(2026-09-13):
백틱 `.from()` 을 못 읽고 변이를 통째로 버림 · `stripComments` 정규식이 템플릿 리터럴 줄의 **코드를 삼킴** ·
짝 증거 창이 400자라 **다른 테이블의 upsert** 를 근거로 통과. 초록색은 증거가 아니다.

현황 수치 (2026-09-13 실측): **변이 88건 = 확인 77(mustAffect 64 + select 검사 9 + idempotentOff 4) + ALLOW 11.**

마무리는 `nuri-ship` 게이트.

---

## 6. 이 스킬(과 계약)이 **못 보는 것** — 숨기면 거짓 안심이 된다

1. **`src/api/` 밖은 전혀 안 본다.** 스캐너는 `readdirSync(src/api)` 한 층만 훑는다(하위 폴더도 없음).
   실측으로 **바깥에 확인 없는 PostgREST 변이가 4곳** 있다 — 계약이 통과해도 이것들은 그대로다:
   - `src/lib/hallOfFame.ts:106` `adminDeleteHallEntry` — `.delete()` `{ error }` 만
   - `src/lib/loyalty.ts:50,56` `adminSaveCustomMission` / `adminDeleteCustomMission`
   - `src/components/features/AdminTab.tsx:945` `clearAll` — 0행이어도 **'오류 로그를 비웠습니다' 성공 토스트**가 뜬다
   새 변이를 컴포넌트나 `src/lib` 에 쓰면 계약의 눈 밖이다. **`src/api` 에 두든지, 그 자리에서 직접 0행을 검사해라.**
2. **화면 되돌림은 아무도 안 본다.** 계약은 문장의 존재만, mock 테스트는 함수가 throw 하는지까지만 본다.
   호출부가 그 throw 를 `catch` 해서 토스트만 띄우고 **낙관적 갱신을 되돌리지 않으면** 화면은 여전히 거짓말을 한다.
   낙관적 갱신을 쓰는 자리는 `catch` 에서 **스냅샷 복원**이 있는지 직접 확인해라.
3. **`.insert(`·`.upsert(`·`supabase.rpc(` 는 범위 밖.** 조용한 0행이 없다(42501·23505 오류로 온다).
   단 `rpc` 가 **내부에서 0행 UPDATE 를 하고 성공을 반환**하면 그건 서버 문제다 → `nuri-migration`.
4. **RLS 정책이 옳은지는 안 본다.** "0행이 나온 게 정당한가" 는 서버 쪽 질문이다.
5. `stripComments` 는 **정규식 리터럴을 추적하지 않는다.** 이스케이프 없는 `//` 를 담은 정규식 리터럴이 생기면
   그 뒤가 주석으로 잘린다(2026-09-13 기준 `src/api` 에 0곳).
6. **`__dirname` 기준이라 파일을 옮기면 조용히 범위가 바뀐다.** 그때 방패는 하한 테스트(80/70) 하나뿐이다.
7. **`mustAffect` 는 인자 없는 `.select()` = `RETURNING *` 이다** — 행 수만 쓰고 버리지만 **바뀐 행 전체가 응답으로 나간다.**
   계약도 이 스킬도 그걸 안 본다. CLAUDE.md 보안 §6(민감 컬럼 미노출)과 부딪히는 테이블에 쓸 때는 ②로 **필요한 컬럼만** 받아라.
   실측(2026-09-13): `mustAffect` 가 닿는 테이블은 **35개**. 그중 baseline 스냅샷에 DDL 이 있는 31개에는 비밀 컬럼이 없다
   (`group_members.role` 만 걸리는데 이건 모임 등급이지 `profiles.role` 이 아니다). `profiles` 변이 2곳
   (`auth.ts:425`·`:569`)은 둘 다 `.select('id').single()` 이라 ②다.
   ⚠ 나머지 4개(`bankroll_entries`·`home_banners`·`post_polls`·`spot_reviews`)는 **2026-07-20 baseline 이후에 생겨 DDL 을 못 봤다** — 확인 안 됨.
   감시 대상은 `venue_pos_settings.cancel_password_hash`(baseline `:773`): 지금은 `src/api` 에서 변이하지 않지만,
   나중에 `mustAffect` 로 감싸면 해시가 그대로 클라이언트로 나간다.
