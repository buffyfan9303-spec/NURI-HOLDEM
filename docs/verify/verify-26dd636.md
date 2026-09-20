# 독립 검증 — `26dd636` (H1·S1·C1) + 미커밋 작업트리 (2026-09-20)

검증자: `verifier`(Opus 5) · 읽기 전용 — **저장소 소스·테스트·설정을 한 줄도 고치지 않았다.**
환경: 격리 프리뷰 `http://localhost:4273`(워크트리 `scratchpad/gate-wt`, HEAD `6fdf032` + 변경 파일 복사 + dist 14:05 빌드).
오너 포트 4173·5173 은 건드리지 않았다. 빌드·`supabase db push`·라이브 DB 쓰기 없음.

## 판정표

| 항목 | 판정 | 근거 한 줄 |
|---|---|---|
| 기능 보존(삭제 줄 전수) | **PASS** | `git show 26dd636 -- src/` 의 비주석 삭제 줄 60여 개 전부 대체 구현이 있다. 신고·차단·삭제 권한 조건 문자 그대로 보존 |
| H1 `notifyScrollNow` | **PASS** | `nav-stability -g H1` 4/4 통과, 프레임 로그 `387/47.75 → 0/60.5`(눌린 프레임 0) |
| H1 후속 `scrollRestoration='manual'` | **PASS** | **독립 음성 대조 실측**: setter 무력화 시 `y=0·h=47.75·shrunk=1` 프레임 1개 재현, 원본은 0개 |
| S1 모바일 7칸 | **PASS** | 320/360/390/430 전부 7칸·겹침 0·글자넘침 0·높이 44·글꼴 12.75 (실측 로그) |
| S1 이용권 판 | **PASS** | 이용권 클릭 후 바 잔존·`data-pane="voucher"` 표시·활성 1개·왕복 top 206 고정 |
| C1 두 카드 | **PASS** | `post-detail-read` 다크/라이트 모바일·PC 전부 통과, 계약 21/21, **음성 대조 8/8 빨개짐** |
| PC 회귀(1024/1280/1440 × 권한 3) | **PASS** | 9조합 넘침 0 · 글자 14.875 · 높이 44 · 이용권 우측 여백 3.1 · tablist 안 비탭 0 |
| 권한(열람 vs 발급) | **PASS** | 이번 커밋은 `canVoucher`·`caps.issueVoucher` 를 **바꾸지 않았다**. 화면 게이트가 서버보다 넓어진 곳 없음 |
| 게이트(타입·vitest·번들) | **PASS** | `tsc --noEmit` exit 0 · vitest **252파일 2735건 전부 통과** · bundle:budget 통과(JS 1008/1010) |
| 보안 코딩 표준 8항 | **PASS** | 신규 `dangerouslySetInnerHTML`·`innerHTML`·`eval` 0 · 비밀 0 · API/RPC/RLS 변경 0 |
| §28·법 고지 | **해당 없음** | 금액 표기·사업자 정보·19세/1336 경로를 건드리지 않았다 |
| `init()` 지연으로 인한 문서 불일치 | **FAIL(중)** | F1 — 아래 |
| 탭 커밋 effect 의 `window.scrollY` 재도입 | **FAIL(중)** | F2 — 아래 |
| 킬스위치 OFF 의 `data-pane` 단언 | **FAIL(하)** | F3 — 아래(빈 검사) |
| HANDOFF §2-B 의 "1024 칸 153px" | **FAIL(하)** | F4 — 실측과 다르다 |
| 작업트리에 섞인 무관한 설정 변경 | **FAIL(하)** | F5 — 커밋 stage 에서 빼야 한다 |
| nav-stability 병렬 2건 실패 | **flake 로 확정** | F6 — 단독 재실행 2/2 통과 |
| S26 실기기 | **NOT_RUN** | 하네스(Pixel 7)에 주소창 접힘 없음 — `dvh==svh==lvh` |
| bfcache 복귀에서의 scrollRestoration | **NOT_RUN** | Playwright 로 재현 수단이 없어 재지 않았다 |
| 키보드 Tab→Enter/Space | **NOT_RUN** | `display:none` 이라 포커스에서 빠지는 것은 구조상 참이나 **실제로 누르지 않았다** |
| 시안 crop 과 사람 눈 대조 | **NOT_RUN** | 수치만 봤다 |
| 전체 E2E 622건 | **NOT_RUN** | 11개 스펙(98건)만 돌렸다 — 아래 "실행한 명령" |

---

## FAIL / 결함 (심각도 순)

### F1 (중) — `src/lib/backstack.ts:176` : `init()` 은 **첫 `pushLayer()` 때만** 돈다. 주석·HANDOFF 의 "잃는 것" 이 실제와 다르다

`init()` 은 `pushLayer()` 안(`backstack.ts:241`)에서만 호출된다. 즉 부팅 직후에는 `scrollRestoration` 이 **`auto` 그대로**다.

실측(격리 4273 · Pixel 7 · 저장소 파일 수정 없음):

```
① 시점별 scrollRestoration:
   [["initScript","auto",10],["DOMContentLoaded","auto",81],["load","auto",204],
    ["t+500","auto",517],["t+3000","auto",3015]]
② F5(레이어를 한 번도 안 민 상태): before y=387 → after y=374, mode=auto   ← 복원이 **그대로 일어난다**
③ 탭을 한 번 옮긴 뒤:            'auto' → 'manual', pushState 도 'manual' 상속
④ F5(레이어 민 뒤):              before y=97  → after y=0,   mode=manual   ← 복원이 사라진다(모드는 새로고침을 넘어 유지)
```

그래서 `backstack.ts:170-172` 과 `docs/HANDOFF.md:2224` 이 적은 "잃는 것: 전체 새로고침(F5)·외부에서 돌아올 때의 자동 스크롤 복원" 은 **세션 상태에 따라 갈린다** — 홈만 보다 새로고침하면 복원되고, 탭을 한 번이라도 옮긴 뒤에는 안 된다. 사용자에게는 "어떨 땐 제자리, 어떨 땐 맨 위" 로 보인다.

H1 수정 자체는 영향받지 않는다(탭 뒤로가기는 반드시 그 전에 `pushLayer` 를 거친다 — 위 ③ 이 그 증거고, 내 음성 대조도 `manual` 상태에서 잡혔다).

또 같은 주석의 "이 앱은 탭마다 위치를 저장하지 않는다" 는 정확하지 않다 — `src/components/features/CommunityTab.tsx:139·207` 이 **섹션별 scrollY 를 Map 에 저장했다가 `window.scrollTo` 로 복원**한다. 다만 그것은 앱이 직접 하는 복원이라 `manual` 의 영향을 받지 않는다(오히려 브라우저 복원과의 경합이 사라져 유리하다). **추정 — 실측하지 않았다.**

제안: ⓐ 주석·HANDOFF 를 실측대로 고치거나, ⓑ 정말 앱 전역 규칙이면 `init()` 이 아니라 모듈 최상위(또는 App 부팅 지점)에서 한 번 설정해 부팅 직후부터 일관되게 한다. 어느 쪽이든 오너 결정이 필요한 동작 변경이다.

### F2 (중) — `src/App.tsx:1095` : 탭 커밋 `useLayoutEffect` 안에서 `window.scrollY` 를 **다시 읽는다**

```ts
markProgrammaticScroll();
window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
notifyScrollNow(window.scrollY);          // ← 여기
```

같은 파일 `src/App.tsx:678-688` 이 **정확히 이 패턴을 없앤 기록**이다:
"원인은 useLayoutEffect(= 커밋 직후, 레이아웃이 가장 오염된 시점)에서 `window.scrollY` 를 읽어 문서 전체 레이아웃을 그 자리에서 강제한 것 … 모바일 콜드 마운트 207ms · 탭 전환 회당 27ms".

바로 위 줄이 `scrollTo({ top: 0 })` 이므로 값은 **0 으로 확정**이다. `notifyScrollNow(0)` 으로 부르면 강제 레이아웃 읽기가 0회가 되고 동작은 같다(`notifyScrollNow` 의 기본 인자만 `window.scrollY` 로 남는다).

**추정 — 이번 회귀의 비용은 재지 않았다.** 예전 사고는 스크롤 프레임마다였고 이번은 탭 전환당 1회라 규모가 다르다. 다만 탭 전환은 오너가 "눌림" 을 지적한 바로 그 프레임이다.

### F3 (하) — `e2e/store-nav.spec.ts:534` : 킬스위치 OFF 의 이용권 판 단언이 **아무것도 재지 않는다**

```ts
expect(await page.locator('[data-pane="voucher"]').count(),
  '킬스위치가 꺼졌는데 이용권 판이 마운트됐다 …').toBe(0);
```

이용권 판은 `src/components/features/VenueManageTab.tsx:1045` 의 `visited.includes('voucher') && canVoucher` 로만 렌더되고 `visited` 는 `[]` 로 시작한다(`:289`). 이 테스트는 이용권을 **누르지 않으므로** 킬스위치가 ON 이어도 `count() === 0` 이다 → 이 줄은 킬스위치를 구별하지 못한다.

앞의 두 단언(`보이는칸 6개` · `not.toContain('voucher')`)은 유효하므로 테스트 자체가 무의미하진 않다. 제안: 이 줄을 빼거나, 킬스위치 ON 에서 이용권을 누른 뒤 OFF 로 바꾸는 시나리오로 옮긴다.

### F4 (하) — `docs/HANDOFF.md` §2-B "PC 불변 확인: 1024/1280/1440 … 단계 칸 153px" 은 1024 에서 사실이 아니다

실측(`e2e/store-nav.spec.ts` PC 블록 console 출력, 4273):

| 폭 | 전체권한 | 킬스위치off | 장부계열만 |
|---|---|---|---|
| 1024 | **119.4px** | **135.9px** | **149.8px** |
| 1280 | 153px | 153px | 153px |
| 1440 | 153px | 153px | 153px |

계약 테스트가 100~170 범위를 보므로 **구현 결함은 아니다.** 인용 수치가 틀렸을 뿐이다 — 다음 사람이 "1024 도 153" 을 기준으로 삼으면 헛수고한다.

### F5 (하) — 작업트리에 이번 작업과 무관한 설정 변경 2건이 섞여 있다

- `.claude/settings.json` — `+ "includeCoAuthoredBy": false`
- `.codex/config.toml` — `+ [shell_environment_policy]` 에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` · `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`

실행문 §2 가 "배포 직전 변경 파일만 선별 stage 하고 **다른 사람의 미추적·설정 WIP 는 포함하지 않는다**" 고 못박았다. `git commit -a` 하면 그대로 딸려 들어간다. 나는 읽기만 했고 되돌리지 않았다.

### F6 (정보) — nav-stability 2건이 병렬에서 실패했다가 단독에서 통과 = **부하 flake**

`--workers=2`:

```
1) nav-stability.spec.ts:143 뒤로가기 연속 — ['tab:community','tab:home','tab:home'] (기대 …,'tab:live',…)
2) nav-stability.spec.ts:273 오버레이 ESC 로 닫고 즉시 back — got 'tab:home' (기대 'tab:live')
  2 failed · 2 skipped · 32 passed (1.2m)
```

`--workers=1` 로 그 2건만 단독 재실행:

```
✓ 뒤로가기 연속 (4.3s) · ✓ 오버레이 ESC 로 닫고 즉시 back (2.9s) — 2 passed (8.7s)
계측표: 유실탭 0 · 도착 오류 0/4
```

→ flake 로 확정. 다만 **이 두 건은 이번 변경이 건드린 바로 그 뒤로가기 경로**다. 앞으로 여기서 빨간불이 나오면 flake 로 넘기기 전에 반드시 단독 재실행할 것.

---

## 상세 근거

### 1. 기능 보존 — 삭제 줄 전수 확인 (PASS)

`git show 26dd636 -- src/` 의 `-` 줄에서 주석을 걷어내고 전부 읽었다. **사라진 기능 없음.**

- **신고·차단·삭제**: 권한 조건이 `acts` 배열로 옮겨가며 **문자 그대로 보존**됐다.
  `if (user && user.id !== post.userId)` → 신고·차단, `if (onDelete && (user?.role === 'admin' || user?.id === post.userId))` → 삭제.
  순서(신고→차단→삭제)·`confirm()` 문구·`block()` 실패 토스트·`onClose()` 까지 동일.
  `acts.length === 0` 이면 버튼 자체를 안 그린다(종전에는 빈 `div` 가 남았다 — 폭 0이라 시각 변화 없음).
  음성 대조: `acts.push` 하나를 지우면 계약 `③-acts3` 이 빨개진다(확인함).
- **끌올**(`user?.id === post.userId`) · **좋아요/추천/비추천/공유** 핸들러(`onLike`·`react`·`copyLink`) · **로그인 유도**(`promptLogin`) · **차단 필터**(`useBlocks`) · **실시간 댓글**(`key={post.id}` + `replies`) · **이전/다음 글**(`nav[data-pd-nav]`, 카드 **밖**에 그대로) · **drag-close**(`Modal variant="page"`, 메뉴에만 `data-drag-close="off"`) — 전부 남아 있다.
- `GameStepBar` 의 **완료 표시**: 모바일에서 인라인 체크·번호를 `hidden lg:inline` 으로 라벨 폭에서 뺐지만, `aria-label="N. 라벨 (완료)"` + 라벨 폭을 안 쓰는 `absolute` 점 마커로 정보를 유지한다. PC 표기는 불변(실측 `단계수`/`글자 14.875px` 로 확인).
- `CommentThread` 는 루트 댓글마다 래퍼 `<div>` 가 하나 늘었다(`postDetailMobile` 여부와 무관하게). `space-y-4` 는 직속 자식에 걸리므로 간격은 유지된다 — 매장 Q&A 등 다른 호출부는 스타일 차이가 전혀 없다(모든 차이가 `postDetailMobile &&` + `max-lg:` 이중 가드).
- `PostDetailModal` 의 스크롤 리셋은 `articleRef.current?.closest('.overflow-y-auto')`(`:206`) 이라 새 래퍼와 무관하다.
- `inline=true`(2-pane)는 `CommunityTab.tsx:427` 의 `<aside className="hidden lg:...">` 안에서만 렌더된다 → 모바일에 `inline` 경로가 없다. 같은 동작이 한 화면에 두 번 나올 수 없다.

### 2. H1 — 독립 음성 대조 (PASS, 실측)

`e2e/nav-stability.spec.ts` H1 블록 4건, `--workers=1`:

```
[H1 live]      전: {"y":387,"h":47.75,"shrunk":"1"}
               프레임: [{i:0,y:387,h:47.75,shrunk:"1"},{i:1,y:0,h:60.5,shrunk:null}, …]
[H1 back]      전: {"y":132,"h":47.75,"shrunk":"1","tab":"home"}
               프레임: [{i:0,y:132,h:47.75,shrunk:"1"},{i:1,y:132,h:47.75,shrunk:"1"},{i:2,y:0,h:60.5,shrunk:null}, …]
  4 passed (15.8s)
```

**소스를 고치지 않은 음성 대조** — `History.prototype.scrollRestoration` 의 setter 를 `addInitScript` 로 무력화해(=앱의 `'manual'` 대입이 먹히지 않게) 수정 전 상태를 재현했다:

```
MODE=asis    scrollRestoration=manual  → y=0 프레임 12개 / 그중 접힌 프레임 0개
MODE=neuter  scrollRestoration=auto    → y=0 프레임 13개 / 그중 접힌 프레임 1개
             [{"i":1,"y":0,"h":47.75,"shrunk":"1"}]      ← 오너가 본 '눌림' 프레임 그대로
```

→ 결함도 처방도 **실재한다.** 새 e2e 는 전제(`before.y > 56`·`shrunk === '1'`·`zero.length > 0`)를 먼저 세우므로 조용히 통과할 통로가 없다.

### 3. S1 (PASS, 실측)

```
[S1 320/360/390/430] 보이는칸 ["요약","posters","ledger","clock","ranking","settle","voucher"]
                     role없는칸 0 · 넘침 0 · 겹침 [] · 글자넘침 [] · 문서가로넘침 0
                     높이 [44×7] · 글꼴 [12.75×7] · 활성수 1
[S1 이용권 알약] {"중심차":0.55,"폭차":0.44}
[S1 왕복 바 top] [206,206,206,206]
[S1 킬스위치 OFF] ["요약","posters","ledger","clock","ranking","settle"]
[PC 1024/1280/1440 × 권한 3] 넘침 0 · 글자 14.875 · 높이 44 · 이용권오른쪽여백 3.1 · 탭아닌자식 [] · 알약 중심차 0.23/폭차 0.2
```

`chip()` 에서 `min-w-0 flex-1 basis-0 sm:flex-none sm:basis-auto` → `w-max shrink-0` 로 바뀌면서 PC 에서 `min-width:auto` 가 부활하지만(칩이 콘텐츠 아래로 못 줄어듦), 1024 전체권한(가장 빡빡한 조합)에서도 `넘침 0` 이므로 실측상 문제가 없다.

단계 바를 소비하는 다른 스펙도 돌렸다 — `ledger-step-destination`·`owner-layout-verify`·`clock-rank-save` **9 passed**. 라벨 기반 셀렉터는 전부 `hasText`(부분 일치)나 `/클락/` 정규식이라 `aria-label` 이 `"3. 클락"`(점 뒤 공백)으로 바뀐 영향을 받지 않는다.

### 4. C1 (PASS, 실측 + 음성 대조 8/8)

`src/components/features/readingSurface.contract.test.ts` — **21 passed**(저장소에서 실행).

계약이 실제로 무언가를 보는지, **파일을 고치지 않고** 메모리 문자열 변조로 8가지를 되돌려 봤다:

```
OK       원본(변조 없음)                                   → 실패 없음
빨개짐 ✔ N1 댓글 className 을 옛 문자열 리터럴로            → ①-구조
빨개짐 ✔ N2 라이트 면(max-lg:bg-surface-high) 제거          → ①-테마면
빨개짐 ✔ N3 lg:contents 제거(PC 가 카드 두 겹)              → ②-lg:contents
빨개짐 ✔ N4 반응 트레이 블록 제거                            → ③-트레이조건
빨개짐 ✔ N5 acts.push 하나 제거(차단)                        → ③-acts3
빨개짐 ✔ N6 PC 알약 줄을 모바일에도 항상 보이게              → ③-알약줄
빨개짐 ✔ N7 data-pd-post-card 속성 제거                      → ②-카드있음·lg:contents·반지름·테두리·면
빨개짐 ✔ N8 카드 닫는 자리 제거(댓글이 카드 안으로)          → ②-닫는자리
```

곁가지로 확인한 것:
- `②` 의 `POST.indexOf('</div>{', open)` 는 카드 안에서 **유일하게** 매치한다(직접 세었다: `open=15114 … 유일 히트 32849 < comments=33008`). 즉 "댓글이 카드 안인데도 통과" 하는 창은 지금 없다. 다만 **문자열 위치 기반이라 구조가 조금만 바뀌면 깨지기 쉽다** — 그 자체는 계약으로서 정상 동작이다.
- `③` 의 `[data-pd-post-card] .ring-aura.rounded-card` 셀렉터는 `PostDetailModal.tsx:813` 의 알약 묶음을 실제로 집는다(카드 자신은 `max-lg:ring-aura` 라 `.ring-aura` 에 안 걸린다) → `알약줄보임` 은 빈 판정이 아니다.
- 반응 트레이 테스트의 `if (!tray) return null` 은 바깥에서 `expect(m).not.toBeNull()` 로 잡는다 — 조용한 skip 아님.
- `voucher-issue-permission.spec.ts:36` 의 `if (n === 0) return false` 도 호출부가 `expect(opened).toBe(true)` 로 잡는다 — 조용한 skip 아님.

`post-open-stability` + `drag-close` **5 passed**, `post-nav` 의 "PC 1440 읽기 폭 68~74ch · 1280 2-pane 인라인 종전대로" 통과 → `lg:contents` 가 PC 읽기 폭·2-pane 을 바꾸지 않았다.

### 5. 권한 (PASS)

이번 커밋은 권한 판정을 **하나도 바꾸지 않았다.**

- `VenueManageTab.tsx:371` `canVoucher = idOn && (manageOk || voucherView)` — 변경 없음. 모바일 이용권 탭도 종전 PC 버튼과 **같은** `showVoucher={canVoucher}` 를 받는다(`:898`).
- `:407` `issueVoucher: idOn && manageOk` — 변경 없음(직전 커밋 `27de127` 의 결과). 서버 정본 `issue_voucher` 첫 줄 `can_manage_pos(p_venue_id)` 와 같은 선.
- 판 렌더 `:1045` `visited.includes('voucher') && canVoucher` — 변경 없음.

즉 **화면 게이트가 서버보다 넓어진 자리는 없다.** `voucher-issue-permission` 4건(양성 대조 포함) 통과로 실측 확인.
⚠ 클라이언트 게이트는 인가가 아니다 — 최종 판정은 서버다. 라이브 DB 에 아무것도 쓰지 않았다.

### 6. 보안·법 (PASS)

- diff 전체에 `dangerouslySetInnerHTML`·`innerHTML =`·`eval`·`new Function` 신규 0.
- 비밀·키 0. `e2e/post-detail-read.spec.ts` 의 가짜 세션 토큰은 서명이 문자열 `'e2e'` 인 테스트 픽스처고, 같은 파일이 `page.context().route('**/*')` 로 **모든 요청을 fulfill** 하므로 운영 Supabase 로 새지 않는다(모든 분기가 `fulfill`, `continue`/`fallback` 없음).
- `src/api/**`·RLS·RPC·엣지 함수 변경 0.
- §28 금액 표기·`BusinessFooter`·19세/1336 경로 변경 0.

---

## 실행한 명령과 종료 코드

```
# 격리 워크트리 gate-wt, E2E_BASE_URL=http://localhost:4273
npx playwright test e2e/backstack.spec.ts e2e/nav-stability.spec.ts --workers=2
    → 32 passed / 2 failed / 2 skipped   EXIT=1   (실패 2건은 F6 — 단독에서 통과)
npx playwright test e2e/nav-stability.spec.ts --workers=1 -g "뒤로가기 연속|오버레이 ESC 로 닫고 즉시 back"
    → 2 passed                            EXIT=0
npx playwright test e2e/nav-stability.spec.ts --workers=1 -g "H1"
    → 4 passed                            EXIT=0
npx playwright test e2e/store-nav.spec.ts e2e/post-nav.spec.ts e2e/post-detail-read.spec.ts e2e/voucher-issue-permission.spec.ts --workers=2
    → 48 passed                           EXIT=0
npx playwright test e2e/post-open-stability.spec.ts e2e/drag-close.spec.ts --workers=2
    → 5 passed                            EXIT=0
npx playwright test e2e/ledger-step-destination.spec.ts e2e/owner-layout-verify.spec.ts e2e/clock-rank-save.spec.ts --workers=2
    → 9 passed                            EXIT=0
node scripts/bundle-budget.mjs (gate-wt dist)
    → ✓ 통과 · JS 1008/1010 (여유 0%) · 첫 화면 259/267 · CSS 31.1/34 · 최대청크 113.5/117   EXIT=0

# 저장소(읽기 전용 실행)
npx tsc --noEmit -p tsconfig.app.json     → EXIT=0 (출력 없음)
npx vitest run                             → 252 files / 2735 tests 전부 통과   EXIT=0
npx vitest run src/components/features/readingSurface.contract.test.ts → 21 passed

# 스크래치패드(저장소 밖) 자작 계측
node neg-scrollrestore.mjs asis|neuter     → H1 음성 대조(위 §2)
node probe-scrollrestore.mjs / probe2.mjs  → init() 지연·F5·pushState 상속 실측(위 F1)
node neg-contract.mjs                      → 계약 음성 대조 8종(위 §4)
```

**참고**: 격리 워크트리 `gate-wt` 에는 `src/components/features/readingSurface.contract.test.ts` 가 **복사되지 않아 옛 버전**이다. 거기서 돌리면 옛 정규식이 새 구조를 못 찾아 1건 실패한다 — 그것 자체가 "옛 계약이 새 구조에서 진짜로 깨진다(= 느슨하게 푼 것이 아니라 갱신이 필요했다)" 는 증거다. 새 계약은 저장소에서 돌려 21/21 통과를 확인했다.

## 띄운 프로세스·만든 사본과 정리 여부

- 브라우저: 자작 계측 3개는 모두 `browser.close()` 로 닫았고, Playwright 러너는 스스로 닫는다. 남은 `@playwright/mcp` 프로세스들은 **내가 띄운 것이 아니다**(다른 세션 소유).
- CPU 부하 프로세스 **띄우지 않았다.**
- 만든 파일: 스크래치패드의 `neg-scrollrestore.mjs`·`neg-contract.mjs`(세션 폴더, 그대로 둠) ·
  `gate-wt/neg-scrollrestore.mjs`·`probe-scrollrestore.mjs`·`probe2.mjs` → **삭제 완료**(`git -C gate-wt status` 에 미추적 잔여 0 확인).
- 저장소 파일은 이 보고서 외에 **하나도 만들거나 고치지 않았다.**

## NEEDS_USER (nuri-lead 가 오너에게 물을 것)

1. `bundle-budget.json` 의 `totalJsGzipKb 1007 → 1010` 상향 — 커밋 메시지대로 오너 결정 대기 중이다. 현재 실측 1008 이라 여유 2KB.
2. F1 — `history.scrollRestoration = 'manual'` 은 앱 전역 동작 변경이다. 지금은 "레이어를 민 세션에서만" 적용돼 새로고침 복원이 세션마다 갈린다. 부팅부터 일관되게 끌지, 지금처럼 둘지 오너 결정이 필요하다.
