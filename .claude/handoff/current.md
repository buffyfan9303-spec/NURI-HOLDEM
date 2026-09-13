# NURI HOLDEM — 작업 인수인계 (진행 중)

> 세션·한도로 끊겨도 **이 문서와 현재 Git 상태만 대조하면 이어받을 수 있게** 적는다.
> 비밀·토큰·개인정보는 적지 않는다.

---

## 🚩 2026-09-13 17:00 KST — 배포 직전 대기 (push 만 남음)

**구현·검증 전부 끝났다. `git push` 가 권한 분류기에 차단돼 배포만 못 했다.**
우회하지 않았다 — 배포는 되돌리기 어렵고, 차단은 기술 실패가 아니라 권한 제한이다.

### 👉 다음에 실행할 명령 (이것 하나면 배포된다)
```bash
cd "C:/Users/buffy/OneDrive/바탕 화면/누리홀덤"
git push origin main
```
Vercel git 연동이라 push 순간 자동 배포가 시작된다. 사전 조건은 전부 충족돼 있다.

### 기준선
- branch `main` · HEAD `1862264` · `origin/main` 대비 **ahead 4, behind 0** · 작업 트리는 이 문서 갱신분만
- push 될 커밋 4개:
  `1862264` 병합이 되살린 클락 복제본 3개 수정 /
  `2386105` origin/main 병합(충돌 5개 해결) /
  `1516e2e` 소스 285파일 /
  `ceb4c9e` 문서·스킬 34파일

### 검증 (병합 **후** 전량 재실행 — 병합 전 결과 재사용 안 함)
| 게이트 | 결과 |
|---|---|
| `npx vitest run` | ✅ 185 files / 2,057 tests (세션 시작 154/1,812) |
| `tsc` · `eslint` | ✅ 0 |
| `npm run build` | ✅ exit 0 |
| `npm run bundle:budget` | ✅ 첫 화면 256.5 / 257 KB gz |
| `npm run legal:check` | ✅ exit 0 |
| E2E main (4173 프로덕션 빌드) | ✅ 515 passed / **1 failed** / 26 skipped |
| E2E boot (직렬) | ✅ 2 passed |

유일한 실패 `e2e/auth-smoke.spec.ts:93` 은 **기존 BLOCKED #20**(`docs/plans/BLOCKED.md:49`) —
운영 DB 미적용으로 나는 404 다. **코드로 못 고친다. 오너 결정.**

### 보호 파일
`e2e/nuri-spot.spec.ts` · `src/lib/ranges.data.ts` · `src/lib/spotEvaluate.test.ts` · `src/lib/spotEvaluate.ts`
→ 네 개 모두 세션 시작 해시 그대로.
`public/sitemap.xml` → 병합 충돌로 **재생성**(생성물). 사용자 보관본과 차이는 `lastmod` 날짜 9줄뿐,
손수정 없음을 확인했다. `npm run build` 가 매번 덮어쓰는 것을 실측했고 빌드마다 복원했다.

### ⚠ 배포해도 남는 것 (오너 결정 — 코드로 안 풀린다)
1. **이벤트 메뉴는 뜨지만 "진행 중인 이벤트가 없어요" 그대로다.** 운영 DB 에 캠페인 행이 없고,
   만드는 RPC 가 미적용 초안 `20260912c` 안에 있다.
2. 🔴 **이용권 기능을 켜기 전에 `20260912b` 보강본을 반드시 적용**해야 한다.
   비로그인 fail-open + PUBLIC EXECUTE 잔존. 지금은 킬스위치 OFF·`store_vouchers` 0행이라 실피해 0,
   **켜는 첫날부터 유효**하다. (기존 초안 헤더의 "실질 피해 없음" 은 NULL 경로를 놓친 서술이라 파일에서 정정해 뒀다.)
3. `20260913c` 는 **적용과 같은 배포에서** `ledger.ts` 를 RPC 로 전환해야 반쪽이 안 된다.

### 미검증으로 남긴 것 (PASS 로 세지 않았다)
- `npm run test:mutation` **NOT_RUN**(소스를 덮어쓰는 도구).
- `post-nav ③` — 4173 에서 19회 연속 통과이나 그 전 1/3 실패 1건의 **근본 원인 미특정**. 간헐 가능성을 0 이라 적지 않는다.
- 실계정 2개가 필요한 경로(계정 전환 실화면·업주/관리자 화면 모션)는 코드·계약 검사로만 확인.
- N04 이용권 감사의 운영 DB 실제 상태는 **BLOCKED**(접속 금지) — 파일·마이그레이션 정적 독해뿐.

### 검증 장치가 실제로 잡은 것
- **계약 테스트**: 병합이 되살린 F2 가드 없는 `msToRegClose` — TV 보드가 마감 레벨 미설정 대회마다 '마감' 을 단언.
  `tsc`·eslint 로는 안 잡힌다(문법은 완전하고 로직만 틀렸다).
- **음성 대조**: 구현자가 "통과해 버린 음성 대조" **5회 자기 신고**(미니파이 백틱 직렬화 · `color-mix` 퍼센트 정규화 ·
  등급색 `ledVarStyle` · 느슨한 정규식 · 파일 전체 검색 오염).
- **적대 반증**: 제출 40건 중 **18건(45%) 격추**. 설계 단계 16건은 구현 전이라 비용 0.
- **프로덕션 빌드 E2E**: dev 에서 **거짓 통과**하던 배너 z-index(`post-nav ⑦`) — dev 는 렌더가 느려 300ms 안에 배너가 안 떴다.
- **`bundle:budget`**: `postNav` 첫 화면 임계 경로 누수 — 예산을 올리는 대신 원인을 고치고 **누수 파수꾼**을 세웠다.
- **`secretlint` 훅**: 훅 자체 버그(`xargs -n` 없음 → 파일이 많을수록 방어선이 꺼짐)를 고쳐서 통과. 우회하지 않았다.

### ✅ 병합 후 독립 검증 결과 (2026-09-13 17:1x KST) — **PASS_WITH_CONCERNS → CONCERN 닫힘**

독립 검증자(fable)가 `merge-base = e008b02` 기준으로 충돌 5파일을 **네 방향 diff**
(`base→ours` · `base→theirs` · `ours→결과` · `theirs→결과`)로 전수 확인했다.

**병합에서 잃은 것: 없음.**
- `clockLevel.ts`·`schedules.ts` = 양쪽 합집합(각 방향 diff 가 정확히 상대 추가분만)
- `ClockDisplay.tsx` = 상류판과 **바이트 동일** — 우리 변경은 상류가 그 함수를 `ClockStage` 로 옮기며 소멸(기능 손실 없음)
- `TournamentClock.tsx` = 우리(C01·C04·`active` 폴링 게이트) + 상류(`ClockStage`·`venueName`) 합집합
- 자동 병합 2파일도 **서로 다른 함수 영역**이라 로직 교차 없음. 옛 `@container (min-width: 768px)` 잔존 0건
- 파일 삭제는 `gto.deep.data.ts` 1건뿐이고 **소비자 0곳**(의도된 삭제)

**`ClockStage` 중복 제거는 도달 가능한 입력에서 등가**(격리 비교 4픽스처 × reg 5종 × index 전수):
호출부 게이트(`regLevel > 0 ? … : null`) 뒤에서 **80/80 동일**. null 은 소비처가
`reg !== null &&`(레일 생략)·`regText ?? '—'`(미니)로 그린다 — 화면이 비거나 깨지는 분기 없음.

**CONCERN(폰트 적용 후 보드 레이아웃) — 리드가 측정해 닫았다:**
`e2e/clock-visual.spec.ts` **29 passed exit 0**(폰트 켜진 프로덕션 빌드).
그 스펙이 `document.fonts.ready` 를 안 기다린다는 지적이 있었으나, CDP 플랫폼 폰트 조회로
1920×1080·390×844 **둘 다 `Pretendard Variable`** 이 실제 렌더 폰트임을 확인했고
첫 텍스트 렌더가 197~240ms 인 반면 스펙은 테스트당 6~7초를 쓴다 → **측정은 폰트 적용 후다.**

**검증자가 확인 못 한 것(PASS 로 세지 않음)**: E2E 전체 분포를 자기 실행으로 재현하지 못했다
(리드 수치 515/1/26 은 리드 실행분이다). 계약 음성 대조는 읽기 전용 지시라 안 돌렸다.

### 🔴 리드 과장 1건 — 검증자가 반증했다 (정정)

`1862264` 커밋 메시지와 위 "검증 장치가 잡은 것" 의
**"TV 보드가 마감 레벨 미설정 대회마다 '마감' 을 단언"** 은 **과장이다.**
상류 원본 `ClockStage`(aacfd0b `:393`·`:450`)와 병합 시점 모두
`regLevel > 0 ? msToRegClose(…) : null` **게이트가 이미 있었다** — `target = 0` 은 호출되지 않는다.
로컬 사본에 F2 가드가 없던 것은 사실이고 복제 제거·계약도 옳지만,
**"실제 회귀가 손님 화면에 나갔다" 는 사실이 아니다.** 이어받는 사람은 그 커밋 메시지를 이 정정과 함께 읽어라.

같은 부류로 **"`npm run build` 가 매번 sitemap 을 덮어쓴다" 도 조건부**다 — 날짜가 같으면 내용이 같아 안 덮인다
(검증자 실측: 오늘 빌드 후 porcelain 0). 복원 절차는 유지하되 서술은 조건부로 읽어라.

### 리드가 틀렸고 교정된 것 (같은 실수 반복 방지)
- "랭킹 튐 = 문서 높이 클램프" → **오진**. 실제는 Chromium **스크롤 앵커링**.
- "P02 는 RLS 거부에서 `[]`" → **틀림**. 인가가 WHERE 절이라 오류가 아니라 `200 + 0행`.
- "page 소비처 2곳" → **5곳**. Modal 전체는 38파일/47호출.
- `regClose` "본문 8회" → **부분 문자열로 센 탓**. 단어 경계로는 0회(`tsc` 가 잡았다).
- 🔴 `grep` 부분 문자열 집계가 이 세션에서 **두 번** 오판을 만들었다. 단어 경계 없이 세지 말 것.

## 기준선

| 항목 | 값 |
|---|---|
| branch | `main` |
| HEAD | `e008b0244284a46271cca02ff1b2a7c2672ed361` |
| 원격 | `origin/main` 보다 **9커밋 뒤** (pull 하지 않았다 — 사용자 승인 필요) |
| 커밋/푸시 | **하지 않았다.** 모든 작업은 작업 트리에만 있다 |
| 운영 DB | **건드리지 않았다.** 마이그레이션 적용·결제·이용권 발급/소비 전부 없음 |
| 배포 | **하지 않았다** |
| 계정 | B(`.claude-max-new`)로만 작업. A 계정 설정·토큰을 복사하지 않았다 |

## 지시 문서 — **4개다.** 작업 디렉터리 밖이라 `Read` 도구로는 못 연다. `sed` 로 읽어라

```
../홀덤 캘린더/outputs/
├── NURI_GTO_AURA_발전_Claude_Code_실행명령문_2026-09-12.md             (616줄)  GTO·Aura
├── NURI_전체완성도_연동_UI_Claude_Code_실행명령문_2026-09-12.md          (567줄)  C01~C08·V01~V07·N01~N08·U01~U06
├── NURI_출시전_종합점검_모델_인증_보안_속도_Claude_Code_2026-09-12.md     (705줄)  ★선행 — 자동로그인·본인인증·보안·속도
└── NURI_관리자_전체강화_이벤트_운영_Claude_Code_2026-09-12.md            (260줄)  관리자·이벤트 운영
```

마지막 문서가 세 번째를 **선행 지시**로 지정한다("기존 통합 지시를 먼저 읽고 병합").
세 번째 §4(자동로그인)가 **"가장 먼저 고칠 사용자 문제"** 로 명시돼 있다.

---

## 완료 — 검증됨

### GTO 분석 신뢰성 (W1)

| ID | 문제 → 원인 → 바뀐 계약 | 검증 증거 |
|---|---|---|
| 자리 매칭 | 스팟은 `'UTG1'`·차트는 `'UTG+1'` 로 적어 9개 중 8개가 겹침 → TS 가 `===` 비교를 못 막아 **UTG+1 자리만** 표에 안 걸리고 `math_only` 로 떨어짐. 경계 변환 `toTablePos()` 신설 | 되돌리면 **7건** 실패(verifier 독립 재현). e2e `🔴 UTG+1 오픈이 수학 참고가 아니라…` 통과 |
| 표 인원 | defend 표를 전부 6인으로 단정 → 9인 입력에 **없는 차이**를 적어 정확 일치를 유사 스팟으로 강등. `baseTableSize?: 6 \| 9` 추가 | 되돌리면 1건 실패 |
| defend 조회 | 같은 `vs` 에 BB 표·SB 표가 나란히 있는데 `hero` 를 안 걸어 **배열 순서에 기댄 우연한 정답**이었다. `findDefendChart(list, villainPos)` 로 분리 | 순서를 뒤집은 사본으로 검증. 되돌리면 3건 실패 |
| **콜 금액 원장** | `sizeBb` 는 **증분**(근거: `potBb`(spot.ts:280)가 블라인드에 모든 액션을 그냥 더한다). 옛 코드는 ① 히어로가 이미 낸 돈을 안 빼고(BB vs 2.5x → 38.5%, 정답 **27.3%**) ② 빌런의 **마지막 증분**만 봐서 3벳·4벳에서 틀렸다. `investedThisStreet(actor)` + `amountToCall()` 로 교체 | 회귀 11건. `+=` → `Math.max` 로 되돌리면 3벳·4벳 건 실패. 입력 UI 라벨 `얼마나` → **`이번에 추가`** |
| **레인지 승률 편향** | 히어로를 먼저 고정하고 빌런만 리샘플 → 결합 분포 편향. 보드 `Qc2d3h4s9c`·히어로 `{AsAh,KsKh}`·빌런 `{AsQs,QhQd}` 에서 정답 **33.33%** 인데 **25%**(문서 실측 24.8%) | 오라클 15건. 편향 재현하면 4건 실패(대칭성 포함). 보드 5장이면 **전수 계산**, `seed` 주입, `kind: no_legal_combinations` 로 계산 불가를 50% 와 구분 |

### 테스트 인프라

| 문제 | 원인 | 수정 |
|---|---|---|
| 단위 테스트 4건 flaky | `emojiPolicy`·`eventTicketRule`·`rankverify` 가 `it()` 마다 저장소 전체(마이그레이션 200개 / src 422개)를 **다시 읽어** 부하 시 vitest 기본 **5초 타임아웃** 초과. 단정 실패가 아니었다 | 파일당 한 번만 읽도록 memoize. **단정은 한 줄도 안 바꿨다**(verifier 확인). 빌드 동시 실행 부하 3회 연속 통과 |
| equity 새 테스트 flaky | 20,000회×2경로가 5초 초과 | 4,000회 + 명시 타임아웃 20초. 허용 오차는 표본오차 3σ 로 재계산 |

### 에이전트 체계 (6 → 8)

신규 `design-reviewer`·`root-cause-debugger`(둘 다 **opus-5**, 기본 읽기 전용).
전 8개에 `effort`·`memory: local` + memory 규율 + 설정 자율수정 금지 + 대화 규칙.
`.gitignore:62` 에 `.claude/agent-memory-local/` 추가.

**라우팅 정책 개정** — 디자인 디버깅·파이프라인 연동은 **Sonnet 을 건너뛰고 Opus 5 부터**.
재발 카운터: 1회차 도메인 팀 → 2회차 **Opus 5(sonnet 재시도 금지)** → 3회차 **fable-5-1**.

### 문서 정정

`lint` 기준선이 틀려 있었다 — "경고 35~43" 은 보안 플러그인 도입(09-02) 시점 값이고,
09-05~09-11 에 추가된 fs 기반 계약 테스트 약 30개가 **96건**을 더해 실제는 **126건**(0 error).
미추적 디렉터리 기여는 **0건**. `docs/nuri-status-2026-09-12.md` 와 `.cursor/commands/ship.md` 를 실측값으로 고쳤다.

---

## 완료 — 운영 연동 (2차 명령문 §4)

게이트: `tsc -b` **0 error** · `npm run lint` **0 error**(경고 127) · `npm test` **1273 통과** · build ✓ · bundle ✓

| ID | 문제 → 원인 → 바뀐 계약 | 검증 증거 |
|---|---|---|
| **C01** | 통계 저장이 **전 행 upsert** 라, 400ms 디바운스 타이머가 낡은 `state` 클로저로 발사돼 방금 누른 STOP 을 `running:true` 로 덮었다 → `saveClockLiveStats()` 신설, **`live_stats` 컬럼만 UPDATE** 라 제어 필드를 덮는 것이 **구조적으로 불가능**해졌다 | `clock.statsWrite.test.ts` 신규. 되돌리면 2건 실패 |
| **C02** | 리모컨이 진입 때 1회 읽은 stale `buyins/session` 으로 통계를 재계산해 정본을 덮었다 → 장부 연동 클락은 `next.liveStats`(구독 정본)를 그대로 싣는다. standalone 만 예외(`derived` 가 늘 빈 값) | `remoteContract.test.ts` 신규. 되돌리면 1건 실패 |
| **C03** | 표시는 `effectiveLevel` 인데 STOP·이전·다음은 **raw `currentIndex`** 를 썼다 — `levelMovePatch` 가 주석으로 "실효 인덱스" 계약을 적어 뒀는데 `ClockRemote` 만 어겼다 → `eff.index` 로 통일 | `clock.level.test.ts` +5종(드리프트·브레이크·마지막 레벨·일시정지). 되돌리면 2건 실패 |
| **N01** | `CalendarPanel.reload` · 알림 Realtime 재조회 · 읽음 실패 재조회 3곳에 세대 가드가 없어 **A 의 예약·뱅크롤·알림이 B 화면에 그려질 수 있었다** → `reqSeq` + `uidRef` 대조. 로그아웃 경로에서도 세대를 올려 in-flight 를 무효화 | 코드 추적. ⚠ 단위 테스트 없음 |
| **N02** | `posts.length === 0` 조기 return 이 단건 조회 폴백을 막아 **공유 링크가 영구 무반응**(URL 파라미터는 이미 지워져 재시도 불가) → 길이 조건 제거. 없는 글/못 불러온 글 토스트 분리 | 코드 추적. ⚠ 단위 테스트 없음 |
| **N04** | `onSubmit` 을 fire-and-forget 으로 부르고 **즉시 입력을 비워** 실패 시 원문이 사라졌다 → `guardedSubmit`·`submitPostComment` 순수 함수로 분리, 성공 `await` 후에만 클리어. 재진입 가드는 `useRef`(배칭 때문에 `useState` 로는 연타가 통과). 저장 중 다른 글로 이동하면 `postId` 대조로 미반영. 게시글·매장 Q&A·요강 **세 경로 모두** 같은 계약 | `CommentThread.test.ts` 4건 · `PostDetailModal.test.ts` 4건. 되돌리면 4건 실패 |
| **N08** | 미상 거리를 `Infinity` 로 두고 `isFinite(dA-dB)` 로 걸러 **한쪽만 미상이면 거리 비교를 통째로 건너뛰고 시간순으로 빠졌다** — 위치 미상이 코앞 매장보다 앞에 섰다 → `compareByDistanceThenStart` 분리 | 회귀 8건(반대칭 포함). 되돌리면 4건 실패 |
| **V01** | `approve_buyin_request` 에 행 잠금·CAS 가 없어 **승인이 거절을 덮어 active 이용권과 확정 바인이 공존** 가능. `reject` 에만 CAS 가 있어 한 방향만 막혀 있었다 → `for update` + `and status='pending'` + `if not found then raise` | 마이그레이션 **초안** `20260912a_...sql`. 계약 테스트 7건. **운영 미적용** |

## E2E 전체 결과 (2026-09-12 03:33)

`npm run test:e2e` → **332 통과 · 23 skip · 1 실패** (5.8분)

**실패 1건은 이번 변경과 무관한 기존 실패다.**
`e2e/auth-smoke.spec.ts:93` — 커뮤니티 탭 이동 중 404.
근거: `src/api/ads.ts:51` 이 `supabase.rpc('community_ads_public')` 을 부르는데
그 RPC 를 만드는 `20260911a_community_ads_promoted_posts.sql` 이 **운영 DB 미적용**이다
(오너 결정 대기 #20). `src/api/ads.ts:20` 주석이 이 상황을 이미 적어 두고 있다.
**이번 diff 에 ads·community API 파일이 하나도 없다**(`git diff --name-only` 확인).
→ 운영 적용 전까지 이 실패는 계속 난다. **성공으로 덮지 않았다.**

⚠ 처음 돌린 E2E 는 `Timed out waiting from config.webServer` 로 죽었는데,
테스트 실패가 아니라 **하위 에이전트가 남긴 CPU 무한 루프 12개**(`node -e "while(true){Math.random();}"`)가
코어를 72분 태워 preview 서버가 180초 안에 못 뜬 것이었다. 정리 후 재실행해 위 결과를 얻었다.
재발 방지 규칙을 `root-cause-debugger`·`verifier` 정의에 넣었다.

## 완료 — 2차 배치

| ID | 문제 → 원인 → 바뀐 계약 | 검증 증거 |
|---|---|---|
| **N03** | 구글 로그인이 `redirectTo: origin` 이라 페이지를 떠났다 돌아오면 **열려 있던 글·대회·매장·탭이 사라졌다** → `pendingViewIntent.ts`(기존 `pendingQrIntent` 패턴 재사용). **원시 URL 을 저장하지 않는다** — 허용된 kind + 내부 id 만. 10분 만료·1회 소비. **복원은 '보기'까지**(좋아요·예약·소비는 재실행 안 함). 초안은 저장하지 않는다 | 28건. 오픈 리다이렉트 13종 차단, 저장소 조작 시 읽을 때 재검사 |
| **V04** | `api/vouchers.ts` 6개 읽기 함수가 `error` 를 **구조분해에서 아예 빼서** RLS 거부·네트워크 끊김이 `[]` 로 둔갑 → 화면단 `.catch` 가 트리거될 기회조차 없었다. 전부 `if (error) throw error` | `vouchers.errorPropagation.test.ts` 8건. 되돌리면 1건 실패 |
| **V04(화면)** | 재조회 실패가 '보유 0장' 으로 보였다 → `everLoaded` 로 **첫 실패는 전면 오류, 이미 본 뒤의 실패는 목록 유지 + 인라인 '갱신 실패' 배너**. loading/empty/data/error 분리 | 위 테스트 포함 |
| **V05** | `VoucherWallet.load` · `MyVoucherSheet.reloadHeld` 에 세대 가드 없음 → A 의 지연 응답이 B 화면에 반영 가능 → **`staleResponse.ts` 공통 계약 재사용**. uid 변경 시 `vouchers·held·plan·redeem·phoneTarget` 즉시 정리 | `voucherStaleGuard.test.ts` 9건. 되돌리면 3건 실패 |

> V04·V05 는 **클라이언트 표시 격리** 문제다. **RLS 우회가 아니다** — 서버는 각자 제 데이터만 준다.

## 완료 — 3차 배치 (클락·장부 나머지)

| ID | 문제 → 원인 → 바뀐 계약 | 검증 증거 |
|---|---|---|
| **C04** | 게임 전환 시 늦은 응답이 다른 게임 화면을 덮었다 → `staleResponse.ts` 재사용(owner=`gameSeq`). `clockLinked` 에 `clock.gameSeq === gameSeq` 추가 | 소스 계약 테스트 |
| **C05** | realtime 콜백에 `reloadSession()` 이 빠졌고, `reloadSession` 에 `return` 이 없어 `await` 가 헛돌았다 → 연결 + 실제 Promise 반환 | 2건 |
| **C05 보완** | `.catch(() => {})` 가 재조회 실패를 삼켜 **낡은 단가·할인이 정상처럼 보였다**(운영자가 낡은 값으로 승인·정산). `loadGames` 도 자체 catch 로 실패를 먼저 흡수해 `Promise.all` 에 도달조차 못 했다 → 기존 `loadError` 재사용. `hasBoardData` 로 **초기 실패(전면 카드) vs 재조회 실패(보드 유지 + 인라인 배너)** 분리 | 6건. 되돌리면 6건 실패 |
| **C06** | **현재 화면의 할인 인덱스를 대상 게임의 할인 배열에 적용**했다 — 사이드 요청을 메인에서 승인하면 엉뚱한 할인이 장부에 박힌다 → `discIdxFor(seq)` 가 대상 게임의 `discounts`·클락 레벨을 조회해 재계산. **조회 실패 시 현재 게임으로 fallback 하지 않고 throw** | 3건 |
| **C07** | `clearClockState` 가 DELETE 의 `error` 를 확인하지 않아 403/500 에도 성공 안내·화면 이동 | 1건 |

## verifier 독립 검증 (2차·3차 배치)

**통과** — C04~C07 · V04 · V05 · N03 핵심 기제.
`NuriPosLedger.tsx` 는 검증 시점에 편집 중이라 **보류**로 남겼다(이후 C05 보완이 들어갔으므로 **재검증 대상**).

verifier 가 짚은 공백 2건:
1. **N03 `isSafeIntentId` 유니코드 우회** — 거부 목록이라 전각 슬래시(`／`)·유니코드 공백·제어문자가 통과했다.
   지금 구조에선 id 로 주소를 조립하지 않아 악용 불가였지만, **허용 목록(`^[A-Za-z0-9_-]{1,128}$`)으로 교체**해 부류 전체를 닫았다. 테스트 38건(유니코드·인코딩 10종 추가).
2. **C06 `bulkApprove` 할인 캐시** — 게임별 캐시라 일괄 승인 도중 세션·클락이 바뀌면 낡을 수 있다.
   **의도된 절충으로 남긴다**: 캐시가 없어도 각 요청이 서로 다른 시각에 조회되므로 같은 문제가 있고,
   캐시가 있으면 **한 번의 일괄 승인 안에서는 모든 행이 같은 할인**을 쓴다(운영상 더 일관됨). 창은 수 초다.

## 관리자 기능 목록 (관리자 문서 §2 요구 — 2026-09-12 실측)

진입: `App.tsx` 의 `isAdmin` 게이트 → `AdminTab.tsx` 의 `ADMIN_SECTIONS` **10개**.
**"이벤트 관리" 메뉴는 코드에 없다** — 보드·재고·경품을 마이그레이션으로만 조정할 수 있다.

| 메뉴 | 변경 대상 | API/RPC | 권한 위치 | 상태 |
|---|---|---|---|---|
| 운영 분석 | (읽기) | `admin_platform_stats`·`free_plan_usage` | **서버 RPC** | 정상 |
| 포스터 승인 | `schedules` | `updateSchedule`·`rejectSchedule` | **서버 RLS** + `prevent_self_approve_poster` 트리거 | 정상 |
| 게시물 관리(순서·부스트·공동업주·이용권충전·순위인증·미션·명예의전당·매장순서) | 다수 | `set_app_setting`·`adminDecideVenueOwner`·`admin_decide_voucher_credit` 등 | **서버 RLS/RPC** | 정상 |
| 노출 관리 | `home_banners`·`community_ads`·`shouts`·`community_posts`·`marketplace_notices` | `admin_set_post_blinded`·`admin_set_post_pinned`·`adminShoutBump` 등 | **서버 RLS/RPC** | 정상 |
| 기능 스위치 | `app_settings` | `set_app_setting` | **서버 RPC** | 정상 |
| 회원 관리 | `profiles`·`point_grants`·`point_purchases` | `updateUserStatus`·`approveOwner`·`adminWithdrawUser`·`admin_set_nickname` 등 | **서버 트리거** `guard_profile_privileged_cols` | **결함 A 남음** |
| 매장 | `venues`·`venue_staff` | `admin_create_venue`·`admin_update_venue` 등 | **서버 RPC** | 부분 성공 처리됨 |
| 신고 | `reports`·`community_posts` | `ReportQueue`·`admin_set_post_blinded` | **서버 RLS** | 정상 |
| 고객문의 | `support_inquiries` | `answerInquiry` | **서버 RLS** | 정상 |
| 오류 로그 | `client_errors` | 직접 select/delete | **서버 RLS** | 정상 |
| **이벤트 관리** | `event_*` | `event_board`·`open_event_card` | — | **UI 없음(신규 구축 대상)** |

**중요**: 조사 범위 안에서 **클라이언트 role 검사만으로 보호되는 메뉴는 없었다.**
모든 쓰기가 RLS·`my_role()='admin'` RPC·BEFORE UPDATE 트리거에 걸린다.
다만 `updateUserStatus`·`answerInquiry`·오류로그는 RLS 에 의존하는 **직접 테이블 UPDATE** 라,
정책이 지워지면 클라이언트에 방어가 없다.

## 완료 — 4차 배치 (자동로그인·관리자 저장 신뢰성)

| ID | 문제 → 원인 → 바뀐 계약 | 검증 증거 |
|---|---|---|
| **A01** | `getSession()` 은 저장소·갱신 실패에도 reject 하지 않고 `{session:null, error}` 로 resolve 하는데 `currentUser()` 가 `error` 를 버려, **'확인 불가' 가 '비로그인' 과 같은 null** 이 됐다. AuthContext 는 정상 성공으로 받아 **재시도 없이 로그인 화면**을 띄웠다 — 토큰은 저장소에 멀쩡히 있는데도. → `currentUserStrict()` 신설(던진다), `getMyProfile` 만 교체. 기존 `currentUser()` 는 그대로(호출부 67곳). 부팅 재시도 1회→2회(1.2초·3초). **실패해도 토큰을 지우지 않는다** | `sessionRestore.test.ts` 7건. 되돌리면 2건 실패 |
| **결함 B** | `approveOwner` 가 두 겹으로 실패를 흘렸다 — ① `profiles` 업데이트에 `.select()` 가 없어 **RLS 거부가 error 없이 0행 200 으로 통과** ② `venues` 업데이트는 `{error}` 구조분해조차 없어 **오류가 통째로 버려짐**. 남던 상태: 회원 `approved=true` · 매장 `approved=false` → **업주는 로그인되는데 매장이 홈·검색에 안 뜨고 관리자 화면은 '승인됨'** → 둘 다 확인 + `OwnerApprovalPartialError` 로 **명시적 부분 성공 계약**(두 쓰기 모두 멱등이라 재시도 안전) | `approveOwner.test.ts` 7건. 되돌리면 3건 실패 |

> 바로 위 `updateUserStatus:409` 주석이 **정확히 그 함정을 경고**하는데 `approveOwner` 만 안 따르고 있었다.

⚠ 빌드 사고 1건: `erasableSyntaxOnly` 가 켜져 있어 파라미터 프로퍼티(`constructor(public cause)`)가 금지(**TS1294**)인데 썼다가 빌드가 깨졌다. E2E webServer 가 exit 2 로 못 뜬 원인. 고쳤다.
**이 저장소에서는 런타임 코드를 만드는 TS 문법(파라미터 프로퍼티·enum·namespace)을 쓰지 마라.**

## 완료 — 5차 배치 (관리자·커뮤니티·매장·GTO·레이아웃)

| ID | 문제 → 바뀐 계약 | 검증 |
|---|---|---|
| **결함 A** | 관리자 승인·제재가 `onUpdate` **직후** 성공·"안내 메일 발송" 을 표시했다(`void` 라 기다릴 방법이 없었다) → `Promise<UserUpdateResult>` 계약. **resolve 뒤에만** 성공 표시, 실패 시 시트 유지 + **제재 사유 보존**, 연타 차단은 `useRef`(배칭 때문에 `useState` 로는 두 번째가 먼저 통과) | `sanctionMail.test.ts` 7건. 되돌리면 2건 실패 |
| **메일 결과** | 메일 실패를 `console.warn` 으로 삼켜 **안 갔는데 갔다고** 말했다 → `mailSent: true/false/null` 로 구분. **저장 실패 시 메일을 아예 안 보낸다**(제재 안 됐는데 통보 가면 안 된다). ⚠ RESEND **기능은 그대로** — 결과 보고만 정확하게 | 위 테스트 포함 |
| **N05** | 열린 상세에 새 댓글이 안 왔다 → `subscribePostComments(postId)` + 순수 함수 `applyCommentEvent`(id dedupe·대댓글 동반 삭제). **전체 재조회 안 함** | 5건. 되돌리면 4건 실패 |
| **N06** | 검색·인기·더보기가 **최신 50개 안에 갇혀** 61번째 옛 글을 못 찾았다 → `searchPosts({q,category,order,cursor})` keyset cursor. 필터 변경 시 `staleResponse` 로 늦은 응답 폐기. 부분 조회 중엔 "결과 없음" 대신 "찾는 중…" | 7건. 되돌리면 1건 실패 |
| **N07** | 첨부 실패에도 닫고 초안을 지워, 다시 쓰면 **본문이 또 INSERT** 됐다 → `pendingPostId`+`failedAttach` 유지, **실패한 첨부만 멱등 재시도**. 무엇이 실패했는지 구분 안내 | 5건. 되돌리면 2건 실패 |
| **C08** | `reload` 가 본문에서 `schedules` 를 읽는데 deps 에 없어 **구독 콜백이 낡은 포스터 id 목록**으로 예약을 조회했다 → `schedulesRef` + 예약 전용 `reloadReservations`. 조회 실패를 "0명" 과 분리 | 6건. **예약 이벤트당 API 호출 ~17건 → 1건** |
| **V06** | QR 의 게임(사이드N)이 소비 요청에 안 실려 **사이드 QR 을 메인에서 승인**하면 메인에 들어갔다 → RPC 에 `gameSeq` 전달 + 서버 초안은 같은 트랜잭션 안에서 `set_config` 로 트리거에 전달(**비원자 보정 아님**). 마감된 게임은 거절 | 8건. 마이그레이션 **초안** `20260912b`(미적용) |
| **🔐 V06 부수** | 이용권 소비 RPC 2개가 **`PUBLIC` 기본 GRANT** 상태였다 → `REVOKE ALL FROM PUBLIC, ANON` + `GRANT TO authenticated, service_role`(보안표준 §3) | 초안에 포함 |
| **V07** | 승인 대기를 "사용 완료" 로 단정하고 잔량을 **배열 길이−1** 로 추측했다 → 서버 정본 기반, 문구를 "사용 요청 전송 · 매장 승인 후 확정" 으로. `subscribeMyVouchers` 로 복원 즉시 반영(**시트 닫으면 언마운트** — 무료 한도 게이팅 준수) | 7건. 되돌리면 7건 실패 |
| **§3.4 죽은 데이터** | `gto.deep.data.ts` 가 "T9s 는 약 40% 빈도로 3-Bet" 류 **사람이 지어 쓴 수치**를 담고 있었다(어느 화면에도 렌더 안 됨) → 삭제. 되살아나지 않는지 테스트로 고정. 화면에서 사라진 것 **없음** | 9+2건 |
| **§3.4 채점** | `freq >= 0.25` 하나로 채점해 **12.5% 혼합을 "빈도가 낮다"는 이유로 오답** 처리했다 → `gradeDetail: best/mix/wrong`, **혼합에 들어 있으면 정답**. `wrongPickOf` 도 같은 기준(0)으로 맞춤(어긋나면 정답이 오답노트에 찍힌다). 현재 차트 빈도(1·0.75·0.5·0.25)에선 **동작 불변** | 29건. 되돌리면 2건 실패 |
| **U01** | 320px 헤더에서 `커…` 로 잘렸다. 실측: 잔량 149px 중 로고 버튼이 `shrink-0` 로 96.1px 선점 → 타이틀 **34.9px** → 320 대역에서 **워드마크만 접어** 99px 확보. 글자·히트영역은 안 줄였다 | `e2e/header-320.spec.ts` — `scrollWidth>clientWidth` 로 실제 잘림 측정 |

## 실화면 조사 결과 (design-reviewer, 캡처 93장 `docs/bugshots/`)

**P0** — U06 매장/그룹 상세에 **focus 계약이 통째로 없다**: `aria-modal` 은 있는데 focus 가 안 들어가고(`.focus()` 0곳),
배경 focusable 28개가 탭 순서에 남아 **10번째에야 '뒤로 가기'** 에 닿는다. 탭바는 터치로는 못 누르는데 **키보드로는 눌린다**.
`GroupPage` 는 `role`·`aria-modal` 이 아예 없다. → home-team 작업 중.

**P1** — 다크 모드 대비 AA 미달 10건: `rgb(88,80,236)` on `rgb(14,19,34)` = **3.33:1**(기준 4.5). 라이트는 통과(5.87:1).

**P2** — U02 같은 외부 서비스 소개 문구가 세 곳에서 다른 기능을 약속(`PosterCarousel.tsx:89` 만 어긋남) ·
U03 공개 홈 fold 에서 홍보 25% > 일정 21%, 빈 공간 31% · U04 글로우가 GTO 탭에 7개(홈·커뮤니티 0) ·
U05 아이콘 stroke 1.8/2/2.4/2.5/3.5 혼재 · §5.3 기준선 2.7px 어긋남, 본문 lh 1.43(권장 1.5~1.65 미달), `text-2xs` 11.69px(권장 하한 12 미달)

> design-reviewer 가 자기 1차 계측 **2건을 스스로 철회**했다(0-높이 노드 오탐, `color(srgb)` 파싱 버그).

## ⚠ 프로세스 사고 2건 (규칙으로 반영 완료)

1. **CPU 무한 루프 12개 방치** — 코어를 72분 태워 전체 E2E 의 preview 서버가 굶어 죽었다(테스트 실패 아님).
2. **`git stash` 사용** — 4개 팀이 동시 편집 중이라 **남의 미커밋 작업이 통째로 날아갈 뻔했다.**
   즉시 검증: stash 목록 비어 있음 · 핵심 문자열 9개 생존 · 보호 파일 해시 기준선 일치 → **유실 없음.**

둘 다 7개 에이전트 정의에 사고 기록과 함께 금지 규칙으로 박았다.

## 6차 — 최종 후처리 (문서 5) · 진행 중

문서 5(`NURI_최종후처리_코드정리_전체최적화_폰트실화면_…md`, 195줄)의 §1 시작 조건은 **충족**됐다:
선행 구현·검증 완료(게이트 exit 0 · verifier PASS · 브라우저 E2E 8/8).

### 기준선 (§2) — `scratchpad/baseline-doc5/`

| 항목 | 값 |
|---|---|
| tracked diff | `tracked.diff` (복구용 preimage) |
| 미추적 목록 | `status.txt` |
| lockfile | `package.json`·`package-lock.json` 사본 |
| dist JS 합계 | 3361.1 KB (비압축) |
| 첫 화면 임계 경로 | **252.2 / 256 KB gz — 여유 1%** ⚠ |
| JS 전체 | 955.3 / 1000 KB gz (여유 4%) |
| CSS 전체 | 30.6 / 32 KB gz (여유 4%) |
| 최대 청크 | 107.7 / 114 KB gz (여유 6%) |

⚠ **첫 화면 여유가 1% 밖에 없다.** 이번 배치로 코드가 늘어난 결과다.
§6 은 "예산을 통과시키려고 상한을 올리지 마라" 고 명시한다 — `bundle:budget:update` 를 쓰지 않는다.

### 재사용할 측정 하네스 (§9)

`e2e/perf.spec.ts`(CPU 4× 스로틀 · `PerformanceObserver` 로 CLS·LoAF·요청 기록) ·
`boot-budget.spec.ts` · `cache-first.spec.ts` · `nav-stability.spec.ts` · `font-coverage.spec.ts`.
`perf.spec.ts` 는 스스로 **"병렬 워커 CPU 경합에 취약(단독 실행은 delta=0)"** 이라고 적어 뒀다 —
**측정은 반드시 단독 실행**한다(§9 도 CPU 경합 통제를 요구한다).

### §3 코드·의존성 정리 — **결론: 지울 것이 없다**

조사 방법: `tsc -b`(TS6133 **0건**) · `eslint .`(미사용 변수 경고 **0건**) ·
317개 파일의 export 심볼을 `src`+`e2e`+`scripts`+`supabase`+`public`+`index.html`+설정+CI 전문에 대조.
동적 `await import()` 검출이 실제로 되는지 `MOCK_VENUES` 로 검증. `dist/`·`.claude/worktrees/` 는 **오탐 원인이라 제외**.

**런타임 의존성 13개 전부 사용 중.** 특히 `html5-qrcode` 는 **동적 import + type-only import** 라 정적 검색만으로는 놓친다.
`pretendard` 는 npm 패키지가 아니라 `index.html` 이 `public/fonts/` 를 직접 로드하지만 **서브셋 원본 소스**다.

**"확실한 미사용" 2건도 삭제하지 않았다:**

| 파일 | 크기 | 왜 안 지우는가 |
|---|---|---|
| `src/components/features/LeaguePanel.tsx` | 25KB | **번들에 없다**(아무도 import 안 해 이미 트리셰이킹됨) → 지워도 **런타임·번들 이득 0**. 연합리그 폐기는 **오너 제품 결정**이고, 마이그레이션 주석은 "클라 진입점 제거" 만 적었지 코드 삭제를 지시하지 않았다. `leagues` 테이블·RPC 는 §3.3 보존 대상이라 더더욱 손대지 않는다 |
| `src/api/rankingConsent.ts` | 3KB | 같은 이유로 **번들에 없다**. "랭킹 공개 동의" 게이트라 **동의 UI 재도입 시 필요**하다 |

§3 이 "삭제량·줄 수·패키지 개수를 성과 목표로 삼지 않는다" 고 했고
`AGENTS.md` 3대 불변 규칙 중 하나가 기능·데이터 보존이다. **이득 0 · 위험 있음이면 안 지우는 것이 맞다.**
→ **오너 결정 대기 항목**으로 남긴다. 지우고 싶으면 `git show HEAD:<경로>` 로 언제든 복구된다.

**보류(삭제 후보에서 제외)**: 미참조 export 237개(대다수 `type`/`interface` — 런타임 비용 0, 모듈 공개 계약) ·
이용권·정산·법적 동의 계약 함수 · 지금 미커밋 수정 중인 파일 · `scripts/loadtest.mjs`+`autocannon`(마스터 플랜 DoD 도구) ·
수동 generator 3종 · `public/legal`·`brand`·`guide`·폰트 서브셋 전량(직접 링크·`@font-face`·DB 저장 경로) ·
루트 `*.log`·`.env.local.bak`·`blob-report/`(미추적 사용자 파일 — §3.3 보호).

⚠ `gen-icons.mjs` 가 `gen-favicons.mjs` 로 대체됐다고 **자체 주석에 적혀 있으나** 산출 파일이 겹치고
어느 쪽이 마지막으로 돌았는지 확인 불가 → 보류.

### 🔴 §7 최대 발견 — **Pretendard 가 한 글자도 적용되지 않는다** (2026-09-12 실측)

**증상**: 앱 전체가 Malgun Gothic 폴백으로 렌더된다. 폰트 서브셋 13개(**321KB**)를 받아 놓고 픽셀에는 안 쓴다.

**실측**(64px `오늘 내일 일정`, headed Chromium, `document.fonts.ready` 이후):

| 스택 | 폭 |
|---|---|
| `'Pretendard Variable'` | **389.13** |
| `__nuri_no_font__`(존재하지 않는 폰트) | **389.13** ← 같다 = 미적용 |
| `system-ui`(Malgun Gothic) | 429 |
| body 실제 | 429 |

콜드·웜1·웜2 **세 번 모두 동일**. CDP `getPlatformFontsForNode` 도 `Malgun Gothic` 을 보고한다.

**원인 규명 — 단계별로 배제했다:**

| 가설 | 검증 | 결과 |
|---|---|---|
| 주입 타이밍(JS 가 런타임에 CSS 를 넣어 늦다) | `<head>` 에 **정적 `<link>`** 로 바꿔 측정 | ❌ 여전히 미적용 — 타이밍 문제 아님 |
| woff2 파일 손상·글리프 없음 | U+C624(`오`)를 덮는 면(`PretendardVariable.subset.90.woff2`)을 **`FontFace` API 로 직접 로드** | ✅ HTTP 200 · 20,852B · load ok · **폭 371.3 ≠ 389.13 = 적용됨**. 파일 정상 |
| **`font-display: optional`** | 위 둘을 배제하면 남는 것 | **🔴 원인 확정** — 받아 놓고도 블록 구간이 지나 브라우저가 사용을 거부한다 |

**왜 아무도 몰랐나 — 검증기가 거짓양성이었다.**
`index.html` 이 PV 를 **`system-ui` 와** 비교했다. PV 미적용 시 `mk(PV)`=389.13(기본 폰트), `mk(없는폰트,system-ui)`=429(Malgun) 라
**항상 39.87px 차가 나와 언제나 '적용됨'** 으로 읽혔다 — 실패를 감지할 수 없는 구조다.
주석의 **"재방문 적용률 12/12"** 는 이 거짓양성 위에 쌓인 값으로 보인다(내 실측은 웜에서도 0).

**고친 것**: 검증기만. 이제 **존재하지 않는 폰트와만** 비교해 미적용이면 정직하게 false 를 낸다.
**로딩 전략은 건드리지 않았다** — §4 가 "optional→swap 이나 전량 preload 를 실측 없이 적용하지 마라" 고 명시했고,
주석에도 과거 함정 기록(swap 이 161ms 전면 재레이아웃을 만들었다)이 있다.

### §6 실측 결과 — 폰트 전략 A/B/C (2026-09-12)

조건: 프로덕션 빌드 · 390×844 · **CPU 4× 스로틀** · **콜드 캐시**(컨텍스트마다 새로) ·
**서비스워커 차단** · 세 조건 **교대** 5회 · 중앙값과 최소~최대.
도구: `e2e/font-strategy-measure.spec.ts` (**기본 skip** — `NURI_MEASURE=1` 일 때만 실행. **`--headed` 필수**).

| | `optional`(현재) | **`fallback`** | `swap` | `fallback`+size-adjust |
|---|---|---|---|---|
| 폰트 적용 | **0/5** | **5/5** | 5/5 | 5/5 |
| CLS 중앙값 | **0.0976** | **0.2095~0.2234** | 0.3455 | 0.2246 |
| CLS 스프레드 | 0.0976~0.2146 | 0.2046~0.2112 | 0.2436~0.3606 | 0.2095~0.3265 |

⚠ **정정(독립 검증 지적)** — 내가 "`fallback` 스프레드가 좁다" 고 썼는데 **재현되지 않았다.**
독립 재실행에서는 0.1746~0.3416 으로 훨씬 넓었다. **n=5 표본의 스프레드 서술은 실행마다 불안정하다** —
방향성(중앙값)만 인용하고 정밀한 스프레드를 근거로 쓰지 마라.
| LCP 중앙값 | 868~952ms | 804~1128ms | 888ms | 868ms |
| 폰트 전송 | 321KB / 13건 | 321KB / 13건 | 321KB / 13건 | 321KB / 13건 |

**읽는 법**
- **`fallback` 이 `swap` 을 모든 면에서 이긴다** — 적용률 같고 CLS 는 절반, LCP 도 낫다. `swap` 은 후보에서 뺀다.
- 전송량은 **네 조건 모두 같다**(321KB). 지금은 그걸 받고 **픽셀이 0** 이라는 것만 다르다.
- **폴백 메트릭 보정(`size-adjust: 86.5%`)은 효과가 없었다** — CLS 0.2246 vs 0.2234 로 노이즈 범위다.
  글자폭(64px 에서 Malgun 429 vs Pretendard 371.3) 이 주원인이 아니라는 뜻이다.
  실제 폰트 테이블에서 ascent/descent 를 떠 `ascent-override`·`descent-override` 까지 맞추는 것은 별도 작업이다.
- ⚠ **lab 측정이다.** 실사용자 현장 지표가 아니다(§6). 서비스워커를 차단했으므로 실제 재방문과도 다르다.

### 독립 검증과 결론이 갈린 지점 — 재확인함

독립 검증자는 **"woff2 네트워크 요청이 0건, Cache Storage 도 비어 있다"** 고 보고했다
(= 폰트를 아예 안 받으니 낭비도 없다는 뜻). 결정에 치명적이라 **내가 다시 쟀다.**

방법: 새 컨텍스트 · 프로브 span 을 만들기 **전에** 측정(프로브 자체가 폰트 로드를 유발하므로) ·
8초 대기(콜드 경로는 `setTimeout(1500)` + `requestIdleCallback(timeout:6000)` 로 늦게 주입된다).

```
NET before={"res":13,"css":1,"loaded":13}  after={"res":13,"loaded":13}  응답이벤트=13
```

**프로브 이전에 이미 13건**이고 프로브 이후에도 13 그대로다 — **프로브가 유발한 것이 아니다.**
`page.on('response')` 로 실제 네트워크 응답을 센 값이라 확정적이다.
→ **321KB 다운로드는 실재한다.** 검증자 측은 잔존 `vite preview :4174`(이전 세션 잔여물, 실저장소 dist 서빙)로
첫 측정이 오염됐다고 스스로 보고했는데, 그 영향이 이 항목에도 남았을 가능성이 있다 `[추정]`.

> 교훈: **측정 프로브가 측정 대상을 바꾼다.** 폰트 적용 여부를 재는 span 을 만드는 순간 서브셋 로드가 촉발된다 —
> 네트워크를 셀 때는 반드시 **프로브 이전에** 재라.

### ⚠ 남은 결정 — 오너 판단 필요 (NEEDS_USER)

**지금 상태(`optional`)는 어느 쪽으로도 정당화되지 않는다** — 321KB 를 받고 픽셀 0 이다. 둘 중 하나여야 한다:

| 선택 | 얻는 것 | 잃는 것 |
|---|---|---|
| **A. `fallback` 으로 전환** | 브랜드 폰트가 **실제로 적용**된다(설계 원래 의도) | CLS **0.098 → 0.21** (good → needs improvement). `AGENTS.md` 의 "주르륵 밀림 금지" 와 충돌 |
| **B. Pretendard 제거** | **321KB 절약** · CLS 0.098 유지 · 화면은 **지금과 완전히 동일** | 브랜드 폰트 포기(라이선스·서브셋 작업 폐기) |

**A 를 고르면 CLS 를 되돌릴 후속 작업이 남는다**(폰트 테이블 기반 메트릭 override).
**B 는 지금 화면과 픽셀이 같아 시각 회귀가 0 이다** — 사용자는 변화를 못 느끼고 데이터만 아낀다.

내 판단으로는 **B 가 즉시 안전한 이득**이고, **A 는 오너가 브랜드 폰트를 원하는지에 달렸다**(팀이 라이선스·서브셋·100줄짜리 로딩 전략을 만든 걸 보면 원했던 것으로 보인다).
**둘 다 현 상태보다는 낫다.** 오너 답이 없으면 현 상태를 유지하고 이 기록을 남긴다.

⚠ **현재 타입 스케일(11.69/12.75/14.88px)은 Pretendard 기준으로 고른 값인데 실제로는 Malgun 으로 읽힌다.**
그래서 §7 의 크기 조정보다 이 결정이 **먼저**다.

⚠ **headless 로는 이 판정이 불가능하다** — headless 는 시스템 폰트가 달라 반대 결론이 난다. 반드시 `--headed`.

### §7 수정 완료 — 실화면 확인 + 회귀 스펙 (`e2e/typography-regression.spec.ts`)

| 항목 | 수정 전 | 수정 후 | 어떻게 |
|---|---|---|---|
| **200% 확대 텍스트 소실** (`ToolsPanel.tsx`) | 'NURI SPOT' 칸 `client 19 / scroll 119` | **`163 / 163`** | 원인이 글자 크기가 아니라 배지의 `shrink-0` → `flex-wrap` 으로 배지를 아래 줄로. 배지 `text-[10px]`(사다리 밖) → `text-2xs` |

⚠ **정정(독립 검증 지적, 2026-09-12)** — 내가 "100% 배율에서는 화면이 그대로다" 라고 썼는데 **부정확했다.**
`flex-wrap` 자체는 320~1024px·100% 에서 줄바꿈을 만들지 않는다(그 부분은 맞다).
그러나 같은 행의 `truncate` → `line-clamp-2` 는 **100% 배율·320~390px 에서 설명 문구를 1줄 → 2줄로 바꿔 카드 높이를 키운다**
(390px 실측 15.9px → 31.9px. 412px 이상에서는 원래대로 1줄).
**실질은 개선**이다(잘려 사라지던 글자가 보인다) — 다만 "레이아웃 불변" 은 사실이 아니므로 기록을 고친다.
| **법정 고지 크기** (`BusinessFooter.tsx`) | 11.69px / 행간 18.99 (권장 하한 12 미달) | **12.75 / 19.125** | 새 규격 없이 기존 역할 토큰 **`t-desc`**. 사업자 정보·1336 은 **법정 상시 노출** |
| **360px 잘림** (`ToolsPanel.tsx`) | `truncate` 로 87 < 142 | **`111 / 111`**, 높이 32px(2줄), **글자 11.6875px 유지** | 이미 최소 크기라 줄이지 않고 `line-clamp-2` 로 두 줄 허용 |

- 음성 대조: `flex-wrap` 을 되돌리면 `client 0 / scroll 23` — **텍스트가 완전히 사라진다**.
- 회귀 스펙은 `textContent` 가 아니라 **`scrollWidth > clientWidth`** 로 잰다(CSS truncate 는 DOM 을 안 바꿔 텍스트 비교로는 절대 안 잡힌다).
- 360px 테스트는 `fontSize >= 11` 을 **함께** 단언한다 — "작게 줄여서 회피" 하는 우회를 막는다.
- 카탈로그 그리드(`ToolsPanel` 의 일반 도구 카드 `desc`)는 **재지 않았으므로 건드리지 않았다** —
  일괄 변경은 모든 카드 높이를 바꾼다(문서 2 §5 금지 사항).

### §7 그 외 (제안 diff 확보, 미적용)

- **P0-2** 200% 확대에서 GTO 도구 카드 텍스트 소실(`ToolsPanel.tsx:587` clientWidth 19 / scrollWidth 119).
  원인은 글자 크기가 아니라 `shrink-0` 배지가 행을 다 먹는 것 → `flex-wrap` + `text-[10px]`→`text-2xs`.
- **P1-1** 11.69px 한 크기에 행간 **18.99 / 15.94 / 11.69** 세 갈래(135/119/24개).
  135개 갈래가 전부 `BusinessFooter` — **법정 상시 노출(사업자 정보·1336)인데 앱에서 가장 작고 빽빽한 블록**이다 → `t-desc`(12.75/19.13).
- **P1-2** 360px 전용 잘림 5곳(`tools`). 전부 이미 11.69px 라 **더 줄이면 안 되는 구간** — 레이아웃(2줄 허용)으로 풀어야 한다.
- **보존 예외**: `pointer:coarse` 입력창 16px !important(iOS 자동확대 회피) · 클락 `clamp(84px,26vmin,400px)` TV 숫자 ·
  달력 날짜 `leading-none`(격자 정렬) · `NuriMarks` 별도 폰트(unicode-range 16자).

### 완료 — 자동로그인 A02·A03 (`src/lib/supabase.ts`)

폰트 결정과 무관한 안전 작업으로 진행했다. 회귀 `src/lib/authStorage.test.ts` **11건**.

| ID | 문제 → 바뀐 계약 | 음성 대조 |
|---|---|---|
| **A02** | `nuri:keep-signed-in` 은 localStorage 라 **모든 탭이 공유**하는데 `stores()` 가 매번 다시 읽었다. → **A 탭이 OFF 로 로그인해 sessionStorage 에 세션을 둔 상태에서 B 탭이 체크박스만 켜도** A 탭이 localStorage 를 보게 돼 **자기 세션을 못 찾았다**(폼 조작만으로 로그아웃된 것처럼 보인다). → 플래그(= **다음 로그인의 기본 선택**)와 **이 탭의 실제 저장 위치**(`pinned`)를 분리. 부팅 때 한 번 정해지고, 이 탭에서 **직접** 바꿀 때만 움직인다 | 고정을 빼면 **2건 실패** |
| **A03-1** | `authStorage.getItem` 이 `stores()` 를 **try 블록 밖**에서 불렀다. `stores()` → `isKeepSignedIn()` → `getItem` 이 SecurityError 를 던지면(사파리 프라이빗·쿠키 차단 웹뷰) **폴백에 닿기도 전에 어댑터 전체가 터진다** = 흰 화면 → 읽기까지 감쌌다 | try/catch 를 빼면 **4건 실패** |
| **A03-2** | 쓰기는 되는데 **읽기가 던지는** 환경에서, 쓰기 성공 시 `memory.delete(k)` 를 해 **방금 쓴 값을 다시 못 읽었다**(탭 안에서 로그인이 유지되지 않음) → 메모리에 **항상 거울**을 둔다 | 테스트가 처음에 이걸로 실패해 발견했다 |

⚠ 거울을 두면서 **"로그아웃했는데 다시 로그인됨"** 이 생기지 않는지 따로 못박았다(3건):
`getItem` 은 저장소가 **`null` 을 돌려주면 그대로 null** 이다 — 메모리로 덮지 않는다.
메모리는 **읽기 자체가 막힌 환경**에서만 답한다. `removeItem` 은 양쪽 저장소와 메모리를 모두 비운다.

### 완료 — A04 계정 경계 (`src/lib/authGeneration.ts` 신설 · `src/contexts/AuthContext.tsx`)

`AuthContext` 의 프로필 조회는 전부 `await` 뒤 `setUser` 였다. 그 사이 로그아웃·계정 전환이 일어나면
**사라진 계정이 되살아나거나 남의 프로필이 들어온다.** `role` 까지 같이 오므로 표시가 아니라 **권한 경계** 문제다.

| 경로 | 무슨 일이 났나 |
|---|---|
| 부팅 조회 + **재시도 타이머**(1.2초·3초) | 로그아웃 뒤 도착 → 다시 로그인 상태. 타이머는 `cancelled` 로도 안 끊겨 unmount 후에도 깨어났다 |
| `onAuthStateChange` → `setTimeout(0)` 조회 | A 로 나간 조회가 B 로그인 뒤 도착 → **B 화면에 A 의 역할·승인 상태** |
| `refreshProfile` · `updateProfile` | 저장·조회 중 로그아웃하면 그대로 반영 |
| **제재 분기** | 낡은 A 프로필의 정지 판정이 `apiSignOut()` 을 불러 **지금 로그인한 B 를 쫓아냈다** |

판정을 `lib/authGeneration.ts` 순수 함수로 뺐다(vitest 환경이 `node` 라 Provider 를 렌더할 수 없다).
`staleResponse.ts` 와 같은 계보지만 인증에는 규칙이 하나 더 있다 — **부팅 첫 조회는 uid 를 모른다.**
단순 소유자 비교로 막으면 자동 로그인이 통째로 버려진다. 그래서 세대는 **계정이 바뀔 때만** 오르고
(null → uid 최초 확정과 같은 계정 `TOKEN_REFRESHED` 는 오르지 않는다), 소유자가 확정된 뒤에만 응답 uid 를 대조한다.
로그아웃은 **`apiSignOut()` 을 기다리기 전에** 세대를 올려 한 프레임도 되살아나지 않게 했다.

회귀 `src/lib/authGeneration.test.ts` **15건** — 절반은 '버려야 하는 것', 절반은 **'버리면 안 되는 것'**(과잉 차단 = 자동 로그인 실패).

음성 대조: 세대 검사 제거 → **4건 실패** · 최초 확정에서 세대를 올림 → **2건 실패** · 소유자 대조 제거 → **1건 실패**.
복원 뒤 블롭 해시 `827da8807146d7e85867074ac11f37f26f31756a` 일치.

게이트: `tsc -b` 통과 · `vitest run` **1478건 전부 통과** · `build` ✓.

### 보고만 — A05 로그아웃 범위 (문서 지시: 임의 변경 금지)

설치된 `@supabase/auth-js` **2.112.3** 의 `signOut(options = { scope: 'global' })` 을 직접 확인했다.
`src/api/auth.ts` 의 `signOut()` 은 옵션이 없으므로 **전 기기 로그아웃**이다. 화면 문구와 어긋난다:

- `ProfileModal` 의 버튼은 그냥 **"로그아웃"** 이다 — 다른 기기까지 끊긴다는 고지가 없다.
- `AutoLoginCheckbox` 는 **"이 브라우저에서 다음부터 자동으로 로그인됩니다"** 라고 약속하는데,
  사용자가 **다른 기기에서** 로그아웃하면 이 약속이 조용히 깨진다. "자동 로그인이 자꾸 풀린다" 는 체감의 유력한 원인이다.

⚠ **바꾸지 않았다.** `local` 로 내리면 제재·탈퇴의 전체 종료가 약해지고, 분실 기기 대응 수단도 사라진다.
선택지는 둘이며 **오너 결정**이다: ① 일반 로그아웃만 `local` 로 내리고 제재·탈퇴는 `global` 유지(+ "다른 기기에서도 로그아웃" 옵션 제공),
② 현행 `global` 유지하고 **문구를 사실에 맞춘다**(권장 — 코드 위험 0).

### 종결 — `detect-unsafe-regex` 6건은 전부 오탐 (코드 변경 없음)

3건은 e2e·테스트 파일이라 입력원이 없다. 나머지 3건(`api/rankings.ts:191`, `lib/ranges.ts:28`, `lib/tdaSearch.ts:56`)은
`safe-regex` 의 **star-height 휴리스틱**에 걸린 것이고, 세 정규식 모두 갈래가 모호하지 않다
(`(?:규칙\s*)?` 는 리터럴이 앞을 막고, `expandRange` 는 `^…$` 앵커에 단일 문자 클래스뿐이다).

추론에 기대지 않고 병리적 입력으로 실측했다 — **5만 자에서 최악 0.20ms**, 전부 선형:

| 대상 | 최악 |
|---|---|
| `parsePrizeMan` `\d+(?:\.\d+)?` (소수점 유인 포함) | 0.17ms · 0.08ms |
| `expandRange` 토큰 | 0.06ms |
| `tdaSearch` 번호 검색(사용자 질의가 직접 닿는 유일한 것) | 0.20ms |

억제 주석도 달지 않았다 — 경고 문구를 지우는 것은 위험을 줄이는 게 아니다.

### 조사 완료 — 관리자 이벤트 운영(§6)은 0% (구현 대기, 편집자 미지정)

관리자 상위 메뉴 10개는 전부 있고 **이벤트 관리만 없다**(`AdminTab.tsx:1071-1083` 의 `ADMIN_SECTIONS`).
그보다 아래가 비어 있다 — `src/api/events.ts` 의 export 는 조회 `getEventBoard` 와 손님 개봉 `openEventCard` 둘뿐이고,
`event_campaigns` 에는 **insert/update/delete 정책이 하나도 없다**(`20260906b:84-86`). `event_cards` 는 `revoke all from public, anon, authenticated`(:93).
즉 **service_role 우회 말고는 캠페인을 만들거나 공개·중단·종료할 SQL 경로가 아예 없다.** 관리자 RPC 도 저장소 전체에 없다.

관리자 RPC 보안 표본 2건(`admin_withdraw_user`·`admin_update_venue`)은 **위반 없음** —
`security definer` + `set search_path`, `my_role() is distinct from 'admin'`, `revoke … from public, anon` 전부 지켜져 있고
`20260911k` 는 파일 안 `do $check$` 로 ACL·search_path·NULL-safe 가드를 자가검사한다. 새 이벤트 RPC 는 이 형태를 그대로 따르면 된다.

#### ⚠ 해소되지 않은 모순 — 운영 DB 접근 없이는 판정 불가

- `20260906b_event_card_draw.sql` 헤더: **"아직 적용하지 않았다(오너 승인 대기)"**
- 커밋 `9e5b016` 메시지 본문: 운영 DB 복사본 `_trash_20260910.*` 로 **"오픈 이벤트 캠페인+카드 100"** 을 치웠다는 기록

⚠ 둘 다 참일 수는 없다. `git show --stat 9e5b016` 의 실제 diff 에는 **이벤트 SQL·코드 변경이 없다** —
배너 이미지 24개 삭제와 홈 배너 코드 수정뿐이다. 그 문장은 git 이 추적하지 않는 **운영 DB 작업을 메시지에 적어 둔 것**이라
이력만으로는 실행 여부·시각·백업 존재를 검증할 수 없다.

**질문으로 올리지 않는다** — 지시 문서 자체가 이 경우를 정해 뒀다: *"백업이 없으면 과거 복원만 BLOCKED 로 두고 메뉴·관리 기능·신규 판 검증은 계속한다."*
따라서 **과거 로티 데이터 복원만 BLOCKED**, 관리 기능·신규 판은 계속한다. 운영 DB 조회 권한이 있는 사람이
`_trash_20260910` 접두 테이블 존재 여부부터 확인하면 그때 판정된다.

#### 필요한 것 (마이그레이션은 **초안만**, 적용은 오너 승인)
- **RPC**: 목록·초안 생성·카드 구성(서버 셔플)·검증(수량 합계·기간 역전·경품 만료)·공개(draft→live, 원자적)·종료·초안 삭제(발급·개봉 이력 없을 때만)
- **권한**: 전부 `revoke … from public, anon` + `grant … to authenticated`, 관리자 가드는 본문에서 NULL-safe. **발급 주체는 클라이언트 문자열이 아니라 서버에서 유도**
- **구조**: `store_vouchers` ↔ `event_cards` 가 지금 **note 문자열 파싱**으로 이어져 있다(`20260906b:249`) — 구조적 FK 로 바꿔야 한다
- **감사**: 기존 `_audit` 경로를 생성·공개·중단·종료 각 단계에 연결

⚠ `src/api/events.ts` 는 지금 §4 배치가 편집 중이다. **§6 은 §4 가 끝난 뒤 직렬로** 착수한다(파일별 편집자 한 명).

### 구현 완료(검증 대기) — §4 이벤트 상시 메뉴

**핵심 문제**: 이벤트가 0개·조회 실패·**소진**·시작 전 중 하나라도면 홈 배너가 통째로 사라져
앱에서 이벤트로 가는 길이 `?event=1` 딥링크 하나만 남았다. 배너 판정 함수 하나가 **광고와 진입로를 동시에** 쥐고 있었다.

바뀐 것:
- **홈 이벤트 칸이 한 자리 세 갈래**가 됐다 — 응답 전 스켈레톤(그래도 눌린다) / 배너(광고, 게이트 **그대로**) / 메뉴 한 줄(그 밖 전부, **게이트 없음**). 메뉴는 배너 판정 함수를 공유하지 않는다.
- `CARD_EVENT_SLUG` 기본값에 묶여 있던 조회·씨앗·개봉을 **전부 slug 파라미터화**. 씨앗은 slug 별 Map — 안 고치면 캠페인이 둘 이상일 때 **다른 판의 카드가 첫 프레임에 그려진다**. 그냥 빼면 `event-enter.spec.ts` 의 '빈 화면 없음' 계약이 깨지므로 **동시에** 고쳐야 했다.
- 로그인 복귀: `VIEW_KINDS` 에 `'event'`, 복원 판정을 `lib/viewIntentRestore.ts` 순수 함수로 분리. `RestoreAction` 필드는 `open`·`id` 둘뿐이다 — **카드 인덱스를 담을 자리가 구조적으로 없어** "로그인하니 카드가 저절로 열렸다"가 불가능하다.
- `?event` 를 **유지**(닫을 때만 삭제) + popstate 재동기화, `useBackClose` 에 누락돼 있던 `ADOPT` 보강.

⚠ **실측으로 잡은 것**: `replaceState` 는 '지금 항목'만 고치는데 `useBackClose` 는 X 버튼으로 닫을 때도 `history.back()` 을 쓴다 —
그래서 **예전 항목의 `?event=…` 주소가 되살아났다.** e2e '이벤트 닫기'가 실제로 이걸로 실패했고, popstate 후 한 틱 뒤 재동기화로 고쳤다.

⚠ **`onLogin` 을 "스냅샷 먼저"가 아니라 "닫지 않기"로 고쳤다** — 스냅샷은 AuthModal 이 구글로 떠나기 직전에 찍으므로 App 쪽에서 순서를 맞출 방법이 없다.
`CustomerDashboardPage.tsx`(매장 팀 파일)는 건드리지 않았다 — 그 로그인 버튼은 이벤트 판(z-60)이 떠 있을 때 도달 불가라 순서 문제가 성립하지 않는다.

음성 대조 9종(N1~N9), 전부 복원 후 0건. 로그인 복귀는 **양쪽 실패 모드**를 대칭으로 잠갔다 —
N2·N8(복귀가 안 된다) / N3(카드가 저절로 열린다). ⚠ N8 은 처음 0건이었는데 대조 스크립트의 `String.replace` 가
같은 문자열의 **첫 번째**(ClockRemote)만 바꾼 것이었다 — 지목해 다시 돌려 1건 실패 확인. **음성 대조 자체가 틀릴 수 있다는 사례.**

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1512건**(기준선 1478 + 34) · build ✓ · bundle:budget ✓(253.3/256KB, 여유 1%) ·
`test:e2e` 전량 **350 passed · 23 skipped · 1 failed**.

유일한 실패 `e2e/auth-smoke.spec.ts:93` 은 **기존 결함 주장**(미커밋 변경 0 트리에서 재현했다고 함) — **verifier 가 독립 확인 중**.
시작 시점의 다른 2건(`a11y-modal` 히트영역, `admin-exposure`)은 이 배치가 유발한 것이라 같은 배치에서 고쳤다.

실제 화면(375×812, 프로덕션 빌드, 비로그인) 5개 상태 전부에서 진입 칸이 남는 것을 확인. 하단 5칸은 무변경.

#### 여기서 나온 후속 과제
1. **'준비 중(draft)' vs '이벤트 없음' 구분 불가** — 서버 `event_board` 가 `status <> 'draft'` 로 막는다. 마이그레이션 필요(운영 미적용 12건 뒤로).
2. ⚠ **`LoadErrorCard` 가 서버 원문 메시지를 그대로 노출한다**(실패 화면에 `boom`). **보안 표준 6번 위반** — 공용 atom 이라 §4 범위 밖이었다. 별도 처리 필요.
3. 조사 처리가 "이벤트을(를)" 로 나온다(전 호출부 공통).
4. 번들 첫 화면 임계 경로 여유 1% — 다음 커밋에서 터질 수 있다.

### 검증 완료 — §4 verifier **PASS** + 간극 2건 직접 처리

verifier 판정: 게이트 재실행(vitest 1512 정확히 일치, 린트 0 error, build ✓), E2E 계약 변경은
**정당한 강화**(`a11y-modal` 은 조건부 skip 제거로 더 엄격해졌고, 텍스트→`data-testid` 교체는
배너와 메뉴가 같은 문구를 갖게 돼 **텍스트로는 구분 자체가 불가능해진** 것이 이유였다).
`?tab=event` 부팅 위험도 코드상 도달 불가 확인 — `pcTabs` 의 `onChange` 가 `gotoTabOrEvent` 라
`'event'` 는 `changeTab`/`commitTab`/`setActiveTab` 에 **절대 닿지 않는다**. `isEventSlug` 우회 10종 전부 차단.

#### 간극 ① 뒤로가기를 잠그는 e2e 가 저장소에 **한 건도 없었다**

`grep -rn goBack e2e/*.spec.ts` 이벤트 매치 0건. 고쳐 놓고 잠그지 않은 상태였다.
`e2e/event-backnav.spec.ts` **6건** 신설 — 딥링크→뒤로 / 홈에서 열고 뒤로 / **X 로 닫은 뒤 뒤로**(실제로 터졌던 경로) /
**뒤로가기 연타** / 이벤트→다른 탭→뒤로 / 새로고침 복원. 계약은 하나다: **판이 떠 있으면 주소에 `event` 가 있고, 닫히면 없다.**
어긋나면 새로고침·공유 링크가 거짓말을 한다.

6/6 통과. 음성 대조: popstate 재동기화를 떼면 **2건 실패**(X 닫기 뒤 뒤로 / 연타). 복원 후 `App.tsx` 해시 `f773c836…` 일치.

#### 간극 ② 보안 표준 6번 위반 — 오류 원문 노출 (`src/lib/dbError.ts`)

`LoadErrorCard` 가 `msgOf(error, '')` 를 **DOM 에 그대로 그린다**(48곳+). `msgOf` 의 기본 분기는 서버 원문을 그대로 돌려주므로
`42P01 relation "secret_settings" does not exist` 같은 문장이 화면에 나간다. 공개 저장소 구조 위에서 **스키마를 알려 주는 꼴**이고,
이벤트 판처럼 **비로그인도 닿는 화면**이 있어 노출 범위가 넓다.

전부 삼키면 이 파일이 원래 막으려던 '전부 저장 실패로 뭉개짐'이 되돌아온다. 그래서 **나눴다**:
- 5글자 SQLSTATE 중 Postgres 가 스스로 만든 분류만 거른다(`isInternalSqlState`). 원문은 **콘솔로만** 남겨 재현 안 되는 버그의 단서를 유지한다.
- 그대로 두는 것: **`P0001`**(plpgsql `raise exception` — 우리가 사용자를 향해 쓴 문장), **코드 없는 오류**(네트워크·SDK·우리 `throw`), `PGRST*`(5글자가 아니다), 그리고 행동 가능한 코드의 준비된 문장.
- `details` 도 같이 막았다 — 원문보다 노골적이다(`Key (venue_id)=(…) is not present in table "venues"`).

테스트 **12건 추가**(총 20건), 절반은 '새면 안 되는 것', 절반은 **'뭉개면 안 되는 것'**. 음성 대조: 필터 제거 → **6건 실패**.
복원 후 해시 `8dbf6fa9…` 일치.

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1524건** · build ✓ · bundle:budget ✓.

⚠ verifier 가 **실행하지 못한 것**(정직하게 남긴다): `click-paths`·`a11y-modal`·`perf`·`admin-exposure` 는 정적 검토만 했고,
`auth-smoke.spec.ts:93` 은 실계정이 필요해 미실행이다. 구현자·verifier 둘 다 **기존 결함으로 판단**했지만
(`src/api/ads.ts` 는 이번 diff 에 없고 이미 `PGRST202` 를 삼키는 코드가 있다) **라이브 재현으로 확정되지는 않았다.**

### 완료 — 조사 처리 (`src/lib/josa.ts` 신설)

보고된 것은 "이벤트**을(를)** 불러오지 못했습니다" 하나였지만, 조사 헬퍼가 **아예 없어서** 7곳이 전부 손으로 괄호 표기를 쓰고 있었다.
`CalendarPanel` 은 이미 이것 때문에 공용 템플릿을 버리고 자기 화면만 따로 덮어썼다(`:267`) — **한 곳이 규칙을 피하기 시작하면 문구가 화면마다 갈라진다.**

규칙은 하나다: 앞 낱말에 받침이 있는가. 한글 음절은 `0xAC00` 부터 종성 28개 주기라 `(코드 - 0xAC00) % 28 !== 0` 이면 된다 — 형태소 분석기는 필요 없다(번들도 로딩도 0).
숫자·영문으로 끝나는 이름이 실제로 있어서(매장 'NURI 1', 직원 'kim2') **읽는 소리**로 판단한다 — 1(일)은 받침이 있고 2(이)는 없다, L·M·N·R 은 있고 나머지는 없다.

⚠ **판단할 수 없으면 조사를 생략한다** — 기호·이모지로 끝나면 `을(를)` 로 돌아가지 않는다. 테스트 9건 중 하나가
모든 입력 조합에 `(` 가 섞이지 않는 것을 잠근다(이 파일의 존재 이유).

적용: `LoadErrorCard.tsx`(실제 보고된 화면, 48곳+ 가 공유). 이 문구에 결합된 e2e 셀렉터는 없음을 확인했다.

**2026-09-12 마무리** — §6 이 끝나 파일이 풀린 뒤 남은 5곳을 정리했다:
`AdminTab.tsx:1649`(직원 삭제 확인) · `StaffSchedule.tsx:105`(명부 중복) · `VerifyGateSheet.tsx:41`(본인인증 안내) ·
`VenueManageTab.tsx:1462`(순위 이동 prompt) — **넷 다 사용자가 입력한 이름·닉네임·사유가 들어가는 자리**라 조사가 실제로 갈린다.

⚠ `CalendarPanel.tsx:267` 의 우회는 **제거했다.** 조사를 헬퍼가 처리하게 되면서 덮어쓴 제목과 기본 템플릿의
글자가 **같아졌다**('데이터'·'정보' 둘 다 받침이 없어 '를'). 남겨 두면 앞으로 템플릿을 고칠 때 이 화면만 조용히 뒤처진다.
`what` 구체화('뱅크롤 데이터'/'캘린더 정보')는 그대로 뒀다 — 그건 조사와 무관한 별개의 개선이다.

이제 **화면에 나가는 괄호 조사 표기가 0개**다(남은 두 건은 주석의 기록).
게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1562건** · build ✓ · `event-entry`+`event-backnav` **12/12**.

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1533건** · build ✓.

### 구현 완료(검증 중) — §6 관리자 이벤트 운영

관리자 RPC 7종 + 검증 함수 1종을 `supabase/migrations/20260912c_admin_event_ops.sql` **초안**으로 썼다.
⚠ **적용하지 않았다** — `supabase db push` 실행 0, 운영 DB 쓰기 0. 화면은 `EventOpsAdmin.tsx`(신규) + `AdminTab` 섹션 신설.

보안: `security definer` + `set search_path` 전부 · 가드 전부 `is distinct from` · `revoke all … from public, anon` + `grant … to authenticated, service_role` ·
`create or replace` 뒤 ACL 재명시(재정의한 `open_event_card` 포함) · **테이블 정책은 한 줄도 새로 열지 않았다**(RLS 표면 불변).
`issued_by` 는 `auth.uid()` 로 서버 유도 — **클라이언트에 파라미터 자체가 없다**(옛 seed 의 `where name='로티아레나'` 방식은 테스트로 금지).

격리 docker(postgres:16-alpine, 운영 무관)에 스텁 스키마 + 기존 2개 + 신규를 실제로 적용해 **행동 단정 38건** 통과.
**1등 자리 12회 표본 전부 다름**(서버 셔플 실증), 감사기록에 자리 정보 없음, 출석→참여권→개봉→이용권 10장 전부 FK 연결.

구조 부채: `store_vouchers` 에 `event_campaign_id`(`on delete set null`)·`event_card_idx` 를 nullable 로 추가하고 `open_event_card` 가 채운다.
⚠ **기존 행은 백필하지 않는다** — 옛 note 파싱이 틀린 행에 **틀린 캠페인을 박는 게 없는 것보다 나쁘다**.

#### ⚠ 음성 대조에서 **대조 자체가 두 번 틀렸다** (기록해 둘 가치가 있다)
- SQL 자가검사 8종 중 2종이 **조용히 통과**했다 — 검사 문자열 `order by random()` 이 **본문 주석에도** 있어서 주석이 검사를 대신 통과시켰다.
- vitest N4 가 처음 `0 failed` 였는데, 변조가 **인덱스 정의를 때리고 insert 문을 못 건드린 것**이었다. 지목해 N4a/N4b 로 다시 돌려 각각 1건 실패 확인.
- §4 의 N8(`String.replace` 가 첫 번째만 바꿈)과 **같은 부류**다. **음성 대조가 0건이면 코드가 맞는 게 아니라 대조가 틀렸을 수 있다.**

#### 🔴 다른 배치의 결함 발견 — `20260911k` 는 지금 적용하면 **전체 롤백**된다
`supabase/migrations/20260911k_admin_withdraw_user.sql:247` 의 자가검사가
`pg_get_function_identity_arguments(p.oid) = 'uuid, text'` 로 비교한다. 이 함수는 **파라미터 이름까지** 돌려주므로
(`p_user_id uuid, p_reason text`) 영원히 불일치 → `ABORT` 로 트랜잭션 전체가 굴러떨어진다.
구현자가 같은 패턴을 베꼈다가 컨테이너에서 그대로 터뜨려 발견했고, 자기 파일은 proname 매칭 + 오버로드 수 확인으로 바꿨다.
**20260911k 는 다른 배치 산출물이라 손대지 않았다.** verifier 가 독립 확인 중이며, 같은 패턴이 다른 미적용 파일에도 있는지 훑는다.

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1559건**(기준선 1533 + 26) · build ✓ · bundle:budget ✓(254.6/256KB, AdminTab 은 lazy 라 무변동).
E2E: `admin-event-ops` 6/6 · `admin-exposure` 9/9 · `admin-switches` 11/11 · `click-paths`+`event-*` 19 passed/4 skipped.

실제 화면(1280×900, 가짜 관리자 세션): **PGRST202 → '서버에 아직 없습니다' 카드**(‘0건’ 위장 없음, 서버 원문도 안 새어 나옴),
403 도 동일, 4상태를 **글자 배지**로 구분(색만으로 전달하지 않음), 1280/768/390px 가로 넘침 0px.

#### 범위에서 뺀 것
과거 로티 복원(BLOCKED) · 마이그레이션 적용 · `event_board` 의 draft 필터(손님 경로) ·
기존 로티 캠페인의 참여권 정책(새 판만 매장 지정 강제 — 서버가 '전매장 지급 2개 동시 활성'을 거절하므로 §7 의 "출석 1회 → 네 판 참여권"은 구조적으로 불가능) · §5 매장 개인화 · §9 나머지.

### 완료 — 미적용 마이그레이션 5건을 막고 있던 자가검사 결함 (nuri-lead 직접)

§6 검증에서 확정된 결함을 고쳤다. **두 파일 다 `BLOCKED.md` 의 미적용 12건 안에 있다**(적용된 파일은 건드리지 않았다).

- `20260911k_admin_withdraw_user.sql:247`·`:291` — `pg_get_function_identity_arguments(p.oid) = 'uuid, text'`.
  그 함수는 **파라미터 이름까지** 돌려준다. 격리 컨테이너 실측: 반환값 `p_user_id uuid, p_reason text`, 비교 결과 **`f`**.
  함수는 정상으로 만들어지는데 **검사가 혼자 죽어** ABORT → 트랜잭션 전체 롤백. 파일명 순 적용이라 **`l·m·n·o` 까지 5건이 함께 막혀 있었다.**
  → `to_regprocedure('public.…(uuid, text)')::oid` 비교로 교체(이름과 무관, 없으면 예외 대신 NULL 이라 가드가 산다). 실측 **`t`**, 8인자도 **`t`**.
  ⚠ 음성 대조: 함수를 `drop` 하면 여전히 `ABORT: … 가 생성되지 않았습니다` 발생 — **가드를 죽이지 않았다.**
- `20260911f_kst_date_defaults_and_season_window.sql:214` — `like '%current_date%'` 가 **소문자만** 잡았다.
  바로 위 `:200` 은 이미 `upper()` 로 정규화하는데 여기만 빠져 `CURRENT_DATE` 회귀가 통과했다. → `strpos(upper(…), 'CURRENT_DATE')`.

일회용 컨테이너(`postgres:16-alpine`)를 따로 띄워 실측하고 삭제했다. **사용자의 `supabase_*` 12개는 건드리지 않았다**(정리 후 12개 그대로 확인).

**적용된 파일이라 남겨 둔 것 3건**(재적용할 일이 생기면 그때) — `BLOCKED.md` 에도 적었다:
`20260726a…:134`(선두 `_` 와일드카드) · `20260726f…:72`(`is_paid_ad` 등의 `_` 8회가 와일드카드) ·
`20260911f_staff_schedule_update_scope:35-43`(**`v_check` NULL 가드 누락** — WITH CHECK 없이 정책이 재생성되면 `false OR NULL` = NULL 이라 IF 가 통째로 건너뛴다).

### ✅ 닫힘 — `e2e/auth-smoke.spec.ts:93` 은 **기존 결함이 맞다** (문서 근거 확보)

§4 에서 "구현자·verifier 둘 다 기존 결함으로 판단했지만 라이브 재현으로 확정되지 않았다" 고 남겨 둔 건이다.
`docs/plans/BLOCKED.md:49` 가 이미 명시하고 있다 — `20260911a_community_ads_promoted_posts` 미적용 때문에
**배포된 앱이 없는 RPC(`community_ads_public`)를 불러 404** 가 나고, **"`auth-smoke` e2e 가 이 404 로 실패한다"** 고 적혀 있다.
추측이 아니라 이미 기록된 기존 결함이다. 이 세션의 어떤 변경과도 무관하다.

### §6 FAIL 2건 수정 완료(재검증 중)

**FAIL ① 서버 원문 노출** — `throwRpc` 가 `new Error(message)` 로 감싸며 `code` 를 버려 `dbError` 필터가 통째로 무력화됐다.
`EventRpcError extends Error` 로 `code`·`details`·`hint`·`status` 를 싣는다(`Error` 하위 클래스인 이유: 곳곳의 `instanceof Error` 와 Sentry 가 그걸 기대한다).
`errText` 는 `msgOf(e, fallback)` 로. 403 경로 화면이 `이벤트 목록 열람 권한이 없습니다` + `권한이 없습니다…` 로 바뀌고 원문은 DOM 에서 0개.

⚠ 판단 하나: `EventAdminRpcMissingError` 에는 **일부러 `code: 'PGRST202'` 를 달지 않았다.**
달면 `msgOf` 가 '앱이 최신이 아닙니다. 새로고침 후 다시 시도해 주세요' 로 덮는데, **관리자에게 새로고침은 답이 아니다**(서버에 함수가 없다).
우리 문장('마이그레이션 20260912c 적용 후')이 맞다. 이 계약도 테스트로 잠갔다.

**FAIL ② 죽은 자가검사** — `prosrc` 에 시그니처가 없다는 것이 원인(`strpos(prosrc,'p_tiers')=671` 인데 `'p_tiers jsonb'`=0).
`pg_get_function_arguments` / `pronargs` / `pg_get_function_identity_arguments` 로 교체하고 **실제 발화까지 확인**했다.

**번들** — 관리자 블록을 `src/api/adminEvents.ts` 로 분리(재수출하지 않는다 — 재수출하면 청크가 안 갈라진다).
`src/App.tsx` 는 열지 않았다. 내가 `dist` 로 직접 확인: `admin_list_event_campaigns` 가 **`AdminTab-*.js` 에만** 있고 엔트리 `index-*.js` 에는 **0건**.
첫 화면 254.6 → **253.7 KB gz**(여유 1.4KB → 2.3KB). 모바일 99% 유저가 관리자 코드를 받지 않는다.

#### ⚠ 음성 대조가 **세 번째로** 틀렸다 — 이제 패턴이다
- §4 N8: `String.replace` 가 같은 문자열의 **첫 번째**(다른 파일)만 바꿨다.
- §6 1차: 검사 문자열이 **본문 주석에도** 있어 주석이 검사를 대신 통과시켰다 / 변조가 **인덱스 정의**를 때리고 insert 를 못 건드렸다.
- §6 2차: 변조가 **미사용 import 를 만들어 빌드가 깨졌고**, 테스트가 아예 안 돌아 출력에 "failed" 가 없던 것을 **0건 실패로 읽었다**.
  그리고 자가검사 발화 확인에서 **옛 시그니처가 남아 오버로드 검사가 먼저 터져** 고친 줄이 발화했음을 증명하지 못했다.

**원칙**: 음성 대조가 0건이면 **먼저 대조를 의심한다.** ① 변조가 정말 그 줄에 닿았나 ② 빌드·수집이 살아 있나(테스트가 실제로 실행됐나)
③ **그 줄의 메시지로** 터졌나(다른 가드가 먼저 터진 것이 아니라).

게이트(내가 독립 재실행): `tsc -b` 0 · 린트 **0 error** · vitest **1562건** · build ✓ · 첫 화면 253.7/256KB.

### ✅ §6 검증 완료 — **PASS** (FAIL 2건 모두 닫힘)

verifier 가 **되돌려서** 확인했다 — `throw new EventRpcError(error)` 를 `throw new Error(error.message)` 로 되돌리니
정확히 403 조회실패·액션 실패 토스트 **2건만** 깨지고 나머지 5건은 무관했다(과잉도 과소도 아니다).
자가검사는 **매번 컨테이너를 처음부터** 만들어 확인했다 — 옛 시그니처가 남으면 오버로드 검사가 먼저 터져
"고친 줄이 발화했다"를 증명할 수 없기 때문이다. 두 줄 모두 **자기 메시지로** 발화했다.

부수 확인: `pg_get_function_identity_arguments` 가 이름을 포함해 돌려주는 것이 여기서도 재확인됐고,
§6 에서 **이름 포함 비교를 쓴 것은 `20260911k` 와 반대로 옳은 판단**이다(의도가 반대다).

⚠ 검증자가 실저장소 2개 파일을 직접 편집했다가 원복했다(지시는 격리 사본만이었다).
내가 독립 확인: `tsc -b` 0 · vitest **1562건** · 잔존물 0 · 보호 파일 5개 해시 기록 완료.

#### 후속 관찰 1건 (FAIL 아님 — 문구 정밀도)
격리 컨테이너에서 **로그인한 비관리자**가 `admin_list_event_campaigns` 를 직접 호출하면
함수 내부 가드가 기본 **P0001** 을 낸다(42501/403 이 아니다). PostgREST 는 P0001 을 보통 400 으로 매핑하므로
`isDenied()` 가 false 가 되어 "열람 권한이 없습니다" 대신 일반 "불러오지 못했습니다" 가 뜬다.
**보안 노출은 아니다** — 새는 문장은 우리가 쓴 한국어이고, UI 는 `isAdmin` 으로 이미 막혀 실사용 경로로는 도달 불가다.
e2e 가 검증한 42501/403 은 **EXECUTE 권한 자체가 빠졌을 때**(배포 순서 사고) 실제로 나는 형태이고 그쪽은 정확히 막혀 있다.

### 완료 — 문서 5 §6 성능 **기준선 실측** (`e2e/perf-baseline.spec.ts` 신규)

⚠ **전부 lab 측정이다. 현장 지표(RUM)가 아니다.** 조건: 프로덕션 빌드 + `vite preview`(4173), Chromium **단일 워커**,
390×844, **CPU 4× 스로틀**, 네트워크 무스로틀(정적은 localhost TTFB 4~6ms, API 는 운영 Supabase **읽기만**),
표본 **n=7 교대 측정**, service worker 를 **allow·block 둘 다** 측정.

```
npm run build && npx vite preview --port 4173 --strictPort
E2E_BASE_URL=http://localhost:4173 NURI_PERF=1 NURI_PERF_RUNS=7 \
  npx playwright test e2e/perf-baseline.spec.ts --workers=1 --reporter=line
```
`NURI_PERF` 가 없으면 3건 전부 skip — **기본 스위트는 느려지지 않는다.**

#### 중앙값 (괄호 = 최소~최대)

| | cold(SW on) | warm | reload |
|---|---|---|---|
| LCP | **692** (644~716) | 324 | 332 |
| 콘텐츠 표시(스켈레톤 소멸) | 915 (812~985) | 330 | 332 |
| 조작가능(앱, GA 제외) | 664 | **273** | 276 |
| 조작가능(**GA 포함**) | 664 | **4808** | **4801** |
| CLS | **0.066** | **0** | **0** |
| long task | 2건 / 합 571ms / 최대 371ms | 3건 / 400ms | 3건 / 391ms |

탭 전환 재방문 중앙값: 라이브 **116** · 커뮤니티 344 · GTO 357 · 캘린더 342. 알림 패널 열기 89 / 닫기 18.
커뮤니티 스크롤 10회에서 **long task 0**, CLS +0.015.

#### 병목 — 숫자보다 이게 중요하다
1. **콜드의 주범은 단일 long task 하나**: `vendor-react-*.js` **376ms(blocking 325ms) @271ms**, 이어 `index-*.js` 112~244ms.
   콜드 long task 합 571ms 의 대부분이다. 조작가능(664)과 셸 표시(681)가 붙어 있는 이유도 같다.
2. ⚠ **warm/reload 의 '조작 가능 4.8초' 는 앱이 아니라 GA 다.** `googletagmanager/gtag/js` 가 @4.38s 에 169ms,
   @4.55s 에 102ms. **앱 자체는 273ms 에 조용해진다.** 서드파티를 분리하지 않고 TTI 를 말하면 앱이 **20배 느린 것처럼** 보인다.
3. **CLS 0.066 은 콜드 전용** — warm·reload 는 **정확히 0**. 남은 시프트는 '스냅샷 없는 첫 방문'의 초기 삽입뿐이다.
4. **콜드 JS 전송 555KB gz ≠ 첫 화면 예산 253.7KB.** `index.html` 의 `modulepreload` 는 10개인데 타임라인에는
   **68개 청크가 1.2초 안에** 들어온다 — `App.tsx:1388` `warm()` 의 idle 프리페치다. 문서화된 의도적 트레이드오프지만
   **번들 예산(임계 경로)과 실제 콜드 전송량은 다른 수치**다(§6 이 "별개로 보고" 하라고 한 바로 그것).
5. 폰트 **339KB / 14요청**이 콜드에 실린다 — 열려 있는 NEEDS_USER(폰트 전략)와 같은 자산이다.
6. **모든 조건에서 재현된 중복**: `rpc/venue_rating_summary` **×2**(콜드·리로드·로그인 전부).

#### ⚠ 이 표를 읽을 때의 정직성 단서 3개
- **SW 가 가져온 것을 0 으로 적지 않았다** — SW 경유 응답은 `transferSize=0` 이라 '요청이 없는 것'처럼 보인다.
- 단 **SW 경유 KB 와 네트워크 KB 는 단위가 다르다**(Cache API 는 비압축 본문). **콜드 실회선 바이트는 `sw=block` 열로 읽어야 한다** → JS 555 + CSS 31 + 폰트 339 ≈ **925KB(압축)**.
- **API 전송량은 0 이 아니라 "모름"이다** — Supabase 응답에 Timing-Allow-Origin 이 없어 크기가 전부 0 으로 보고된다. 요청 수와 응답 시간만 유효하다.

#### 쓰면 안 되는 수치 (하네스가 오염시킨 것 — 구현자가 스스로 표시)
검색 입력→반영 830ms 와 스크롤 1089ms 에는 **내가 넣은 고정 대기**(700ms / 100ms×10)가 들어 있다.
그 두 구간은 **long task·CLS 만** 유효하다. 또 `listenersΔ` 최대 1020(중앙값 33)은 7회 중 1회 이상치라 **누수라고 주장하지 않는다**
(이 저장소에는 "n=5 분산 주장이 재현되지 않은" 전례가 있다). **p95 는 n=7 로 확정하지 않았다.**

#### 재지 못한 것
장부 입력·저장 / 매장 대시보드 / 클락 / 순위·정산 / 관리자 전환 — **E2E 계정이 폐기돼 401**이고 운영 DB 쓰기는 금지다(억지로 실계정을 쓰지 않았다).
이벤트 목록/판 — 오늘 진행 중인 이벤트가 없어 배너가 렌더되지 않는다(하네스가 건너뛰고 로그를 남긴다).
GTO 는 스텁 세션으로 **탭 마운트 930ms** 만 쟀고 실제 스팟 계산은 미측정. 네트워크 스로틀·실기기·RUM 전부 미적용.

게이트(하네스 추가 후): 린트 **0 error** · vitest **1562** · build ✓ · 첫 화면 253.7/256KB ✓ · 기본 스위트에서 신규 3건 **skip**.

### 📋 다음 배치 — §5 낭비 목록 (측정만 했고 **하나도 고치지 않았다**)

측정과 수정을 섞으면 무엇이 효과였는지 말할 수 없다. 아래는 전부 `파일:줄` 로 확인된 관찰이며, **효과는 가설**이다 —
고치기 전후를 **같은 하네스로** 재야 한다. ⚠ 이번 측정은 **비로그인 홈 경로**라 A·C 항목은 애초에 포함되지 않았다.

**A. 숨은 탭에서 계속 도는 구독/폴링** (keep-alive 라 언마운트되지 않는다 — 예상 효과 1위)
1. `LedgerStatsPanel.tsx:127` `subscribeLedger` 에 `active` 게이트 없음. 마운트부 `VenueManageTab.tsx:809` 가 형제 패널과 달리 `active` prop 을 **안 넘긴다**
2. `NuriPosLedger.tsx:313` ungated(같은 컴포넌트가 `active` 를 받아 다른 곳에선 쓴다) · `:318`(바인요청) · `:414`(클락)
3. `TournamentClock.tsx:373` `setInterval(loadAd, 30_000)` 에 `active` 없음 — 같은 파일 `:289` 1초 틱에는 있다. 예상 **시간당 240요청/브라우저**
4. `App.tsx:1902` 안읽은 쪽지 `setInterval(load, 90_000)` 에 `document.hidden` 게이트 없음 — 사용자당 시간당 40요청
5. ✅ 대조군: `LiveGamesTab.tsx:105,109` 는 게이트가 **제대로 있다** — 하위 에이전트의 "라이브 탭 상시 폴링" 주장은 코드를 열어 **반증됐다**

**B. 중복 fetch / 과다 전송**
6. `clock.ts:355` `getRunningClocks()` 가 `select('*')`(레벨 배열 `config` 포함)인데 `App.tsx:1742` 부팅과 `LiveGamesTab.tsx:103` 이 **각각** 받는다. App 은 결과를 탭에 내려주지 않는다
7. `venue_rating_summary` ×2 — **측정으로 확인된 유일한 중복**. `reviews.ts:80` 의 dedupe 는 '비행 중'일 때만 합류시켜 시점이 어긋나면 2회 나간다
8. `schedules.ts:150` `select('*') limit 800` — 홈이 그리는 건 8건. 아카이브 때문에 유지 중이라 **삭제가 아니라 분할 후보**
9. `App.tsx:1450` `getReservationCounts(오늘 이후 전체 id)` 를 홈 진입에 호출하는데 소비처는 browse 카드뿐 — 수백 UUID 가 RPC 본문에 실린다
10. `community.ts:405/411/415/430` — `getPosts()` 1회가 **4왕복**

**D. 리렌더/재구독**
11. `App.tsx:1965` 알림 realtime 이펙트 deps 가 `[user]`(객체). **같은 파일 `:1209~1211` 에 이 churn 을 `user?.id` 로 고친 선례가 있는데 여기만 남았다**
12. `LedgerVoucherRail.tsx:63-64` `Date.now()` 를 `useMemo` deps 에 넣어 **memo 가 절대 히트하지 않는다**
13. `App.tsx:3018` `unread={notifications.filter(...)}` 매 렌더 새 배열 + 상주 컴포넌트 memo 없음

### 구현 완료(검증 중) — §5-A 숨은 탭 구독·폴링 게이트

| 파일 | 바뀐 것 |
|---|---|
| `LedgerStatsPanel.tsx:127` | `subscribeLedger` 에 `active` 게이트. `prevActiveRef` 상승 감지 → `setLiveTick` 1회 증가(두 데이터 effect 의 deps 에 이미 있어 재조회된다) |
| `VenueManageTab.tsx:809` | `active={tabActive && renderSection === 'stats'}` — 전에는 **prop 자체가 없었다** |
| `NuriPosLedger.tsx` | 장부·바인요청·클락 구독 3곳에 게이트 + 게이트 진입부에서 `reload()/reloadSession()/loadPending()/reloadClock()` |
| `clock/TournamentClock.tsx:373` | 광고 폴링 `setInterval` 에 게이트, deps `[]` → `[active]`(같은 파일 `:289` 1초 틱의 선례를 따름) |
| `LedgerVoucherRail.tsx:63` | `Date.now()` → `at ?? Date.now()`. `at` 은 이미 있던 '마지막 수신 시각' 상태 — **새 상태를 만들지 않았다** |

테스트 +12건(`NuriPosLedgerRace.contract.test.ts` 수정·추가, `perfHiddenTabGates.contract.test.ts` 신규).
음성 대조 7종, **0건 나온 항목 없음**, 복원 후 전부 해시 일치.

#### ⚠ 정직하게 남길 세 가지
1. **하네스로는 이 배치의 효과를 증명할 수 없다.** 기준선이 **비로그인 홈 경로**라 장부·클락 코드가 애초에 그 경로에 없다.
   내가 격리 상태에서 다시 돌려 **회귀가 없음만** 확인했다(n=7): LCP 콜드 **704**(기준선 692 범위) · CLS **0.066** ·
   스크롤 long task **0** · 알림 열기 중앙값 ~97 · GTO 탭 마운트 975. **개선도 회귀도 아니다 — 안 걸리는 경로라 안 움직인 것이다.**
2. **실브라우저로 확인된 것은 `LedgerStatsPanel` 채널 하나뿐**이다(통계 진입 시 `phx_join`, 이탈 시 `phx_leave`+`phx_close` 관찰).
   `NuriPosLedger`·`TournamentClock` 의 실제 정지는 **미확인** — 러닝 클락·오늘 장부 시드에 쓰기가 필요해 시도하지 않았다.
3. ⚠ **"숨은 동안 놓친 이벤트가 실제로 복구되는지" 는 재현하지 않았다** — 구현자가 코드 경로 확인에 그쳤다고 스스로 밝혔다.
   **이게 이 배치의 진짜 위험이다**(업주가 없는 장부를 보고 정산한다). verifier 에게 이 간극을 메우라고 지시했다.

#### ⚠ 내 실수 하나
에이전트가 보고 없이 턴을 끝낸 뒤 내가 4173 프리뷰를 정리했는데, 그게 **그쪽의 격리 재측정을 끊었다**.
이후 기계를 비우고 내가 직접 다시 쟀다. 프로세스 정리는 PID·명령줄을 확인하고 해야 한다는 것은 맞지만,
**측정이 끝났는지부터 확인했어야 했다.**

게이트(내가 독립 재실행): `tsc -b` 0 · 린트 **0 error** · vitest **1574건** · build ✓ · 첫 화면 253.7/256KB(5개 파일 전부 lazy 청크).

### ✅ §5-A 검증 **PASS** + 후속 결함 2건 직접 수정

verifier 가 내가 지적한 간극(재동기화 미재현)을 **실브라우저로 메웠다** — 격리 사본에 `App.tsx` 의 keep-alive 를
흉내 낸 하네스(언마운트 없이 `display` 토글 + `active` 만 변경)를 만들고, **숨은 동안 목 DB 를 바꿔** 재현했다:

| 시점 | 화면 | 요청 |
|---|---|---|
| 보이는 중 | `김철수` 1명 · 바인 5만원 | — |
| 숨김 2초 | — | **0건** |
| (숨은 동안 바인 2건 추가·단가 7만원·QR 대기 1건) | — | — |
| 다시 보임 | `김철수`·**`박영희`·`이민수`** · **7만원** · 생존 3 | **6건** — 게이트로 끊은 구독 4개에 정확히 대응 |

런타임 음성 대조로 **재현이 실제로 손실을 잡는다**는 것까지 보였다 — 재검증을 빼면 `박영희`·`이민수` 가 **0건**이 된다(= 없는 장부를 보고 정산).

#### 🟠 수정 1 — 성능 배치가 **중복 fetch 를 새로 만들고 있었다** (`NuriPosLedger.tsx`)
재검증을 effect 첫 줄에 무조건 두었는데, `reload`/`reloadSession` 의 identity 가 `date`·`gameSeq` 에 걸려 있어
**날짜·게임을 옮길 때마다** 같은 조회가 또 나갔다. 바로 위 초기 로드 effect 가 이미 하는 일이다.
실측 **전환 1회당 11건 → 7건(중복 4건)**. egress 를 아끼자는 변경이 반대 방향으로 비용을 만들고 있었다.
부수로 두 effect 가 `setLoadError` 를 동시에 써서, 초기 로드가 세운 오류를 늦게 온 성공이 지울 수 있었다.
→ `LedgerStatsPanel` 이 이미 쓰는 **상승 에지** 패턴으로 바꿨다(최초 마운트도 재검증하지 않는다 — 그것도 초기 로드가 한다).

#### 🟡 수정 2 — 계약 테스트가 **'거는 곳'만 보고 '넘기는 곳'을 안 봤다**
`active` 는 optional 이고 기본값이 `true` 라, **마운트부에서 prop 을 빼면 게이트 4개가 전부 무력화**되는데
타입 검사도 계약 테스트도 아무것도 잡지 못했다(verifier 가 실제로 시험해 **통과**시켰다).
`react-hooks/exhaustive-deps` 도 warning 이라 0 error 게이트를 통과한다.
→ `VenueManageTab` 의 세 마운트부(`NuriPosLedgerM`·`TournamentClockM`·`LedgerStatsPanelM`)를 계약으로 잠갔다.
음성 대조: 이전에 **0건**이던 M3·M4 가 이제 **각 1건 실패**.

#### ⚠ 음성 대조가 **네 번째로** 틀렸다 — 이번엔 내가 냈다
마운트부 변조 스크립트에서 앵커를 `" active={tabActive && … 'ledger'}"` 로 짧게 잡았는데,
**같은 식이 바로 앞줄 `LedgerWorkspaceM` 에도 있어** `replace(...,1)` 이 첫 번째를 쳤다.
`NuriPosLedgerM` 은 멀쩡한데 **엉뚱한 컴포넌트에서 게이트가 떨어져 나갔고**, 스크립트가 인코딩 오류로 중단돼
**파일이 변조 상태로 남았다**. `git diff` 로 원인을 찾아 복원했다(해시 `26e42221…` 일치).
§4 N8 과 **정확히 같은 실수**다 — 앵커는 **컴포넌트 이름까지** 포함하고, 대조 전에 **매칭 횟수를 세야 한다**(고친 스크립트는 `count != 1` 이면 '대조 무효'로 멈춘다).

#### verifier 가 기록한 자기 실수 2건(같은 부류)
① 변조 앵커를 `\n` 으로 썼는데 작업 트리가 **CRLF** — 9종 중 6종이 **조용히 0회 매칭**됐다.
② 요청 로그를 클릭 **뒤에** 비워, 이미 나간 재동기화 6건을 지워 놓고 "재동기화 안 돈다"는 **거짓 FAIL** 을 낼 뻔했다.

#### 아직 남은 것(수정 안 함)
`LedgerWorkspace.tsx:78` 전체화면 분기가 `<LedgerVoucherRail … active dense />` 로 **하드코딩** — 도달 경로가 좁아 경미.
`AdminTab.tsx:1565-1566` 이 `active` 없이 두 컴포넌트를 렌더(현재는 조건부 오버레이라 무해하나 형태가 M3 과 같다).

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1578건** · build ✓ · 번들 예산 ✓.

### 구현 완료(검증 중) — §5-B `App.tsx` 낭비 정리

| 항목 | 바뀐 것 |
|---|---|
| ① 쪽지 미읽음 폴링 | `setInterval` 에 `document.hidden` 게이트 + **복귀 재동기화** |
| ② 알림 realtime deps | `[user]` → `[user?.id]` — 포인트 갱신마다 채널 teardown→재연결 + `getMyNotifications()` 재발사가 사라진다(같은 파일 `:1209` 선례가 이미 있었다) |
| ③ `unread` 배열 | `useMemo` + 핸들러 8개 `useCallback` + **소비처에 `memo`** |
| ⑤ 예약자 수 | sticky 게이트 — 홈만 보는 사용자에게 **수백 UUID RPC** 가 나가지 않는다 |
| ④ `reviews.ts` | `getVenueRatings()` TTL 60초 + 쓰기 무효화 |

⚠ **③ 은 배열만 memo 했으면 증상 가리기였다** — 나머지 prop 8개가 전부 인라인 화살표라 매 렌더 깨진다.
`CustomerDashboardPage` 는 keep-alive **상주**라 닫혀 있어도 App 리렌더마다 1,000줄 트리를 다시 그리고 있었다.
**prop 안정화 + memo 를 한 쌍으로** 넣었고, 마운트부에 인라인 화살표가 하나라도 되살아나면 계약 테스트가 실패한다.

⚠ **① 에서 별도 `visibilitychange` 리스너를 달지 않았다** — 기존 `useVisibilityRefresh`(20초 스로틀 + `focus`)에 얹었다.
따로 달면 같은 복귀에 두 번 조회하게 되어 **§5-A 가 낸 중복 fetch 와 같은 부류**가 된다.

#### 측정 — 이번엔 진짜로 움직였다 (기계 단독, n=7)
| | 기준선 | 이후 | 판정 |
|---|---|---|---|
| PB3 **중복요청** | **2** | **0** | 🟢 해결 |
| PB3 **api요청수** | **28** | **26** | 🟢 −2(사라진 왕복과 정확히 일치) |
| 콜드 LCP / CLS | 692~704 / 0.066 | 696 / 0.0649 | 노이즈 |
| 알림 열기 | ~97 | 89(67~217) | **노이즈 — 분포가 넓어 개선이라 말하지 않는다** |

①②③⑤ 는 **로그인·상주 경로**라 이 하네스(비로그인 홈)가 애초에 지나가지 않는다 — **회귀 없음만** 확인됐다.

음성 대조 N1~N10, 전부 1건씩 실패. ⛔(앵커 중복·변조 미적용) 0건. 실저장소 무변조.
스크립트가 **앵커 매칭 횟수 ≠ 1 이면 대조 무효로 멈추고**, 매 회차 수집 건수와 복원 해시를 검사한다 — 내가 네 번째로 밟은 함정이 도구로 막혔다.

#### 🔵 ⑥ `getRunningClocks()` 는 **건드리지 않았다 — 내 전제가 틀렸다**
"App 은 결과를 탭에 내려주지 않으니 컬럼을 좁힐 수 있다"가 성립하지 않는다.
`App.tsx:2097` 의 `buildRegInfoMap` → `lib/regStatus.ts` 가 `config.levels`·`config.regCloseLevel`·`config.title` 을 **직접 읽는다**.
컬럼을 좁히면 browse 카드의 **'레지 마감' 배지가 판정 불가**가 된다(기능 소실). 남은 낭비는 컬럼이 아니라
부팅과 라이브 탭 마운트의 **시차 중복 왕복**인데, 클락은 초 단위 실시간이라 60초 TTL 로 풀면 '진행/일시정지'가 낡는다.
`src/api/clock.ts` 는 store-team 파일이기도 하다 → **보고만.**

게이트(내가 독립 확인): `tsc -b` 0 · 린트 **0 error** · vitest **1594건** · build ✓ · 첫 화면 253.9/256KB(+0.2KB).
E2E 관련 32스펙 148 통과 · 13 skip · **1 실패**(`auth-smoke:93` — `BLOCKED.md:49` 가 명시한 **기존** 404 결함).

### §5-B 검증 — **조건부 FAIL 2건을 직접 수정**

verifier 가 ②③④(계정 경계·memo·TTL 캐시)는 PASS 를 냈다. 특히 ④ 는 `memo` 가 **갱신을 막지 않는다**는 것을
실제 React 19 렌더로 통로 셋(prop·context·`useSyncExternalStore`) 전부 확인했고, TTL 캐시는
`venue_reviews` 가 **공개 읽기**(RLS `TO anon, authenticated USING (true)`)라 사용자 경계를 넘을 수 없음을 정책으로 확인했다.

#### 🔴 FAIL ① — 배지가 **더** 낡아졌다 (내가 지시한 설계가 틀렸다)
"별도 리스너를 달면 중복 fetch 가 된다"는 이유로 재동기화를 `useVisibilityRefresh` 에 얹었는데,
그 훅은 **20초 스로틀**이다. 실브라우저 재현:

| t | | 이번 코드 | HEAD |
|---|---|---|---|
| 82s | 복귀(스로틀 소진) | fetch | — |
| 86s | 쪽지 도착 | 배지 0 | 배지 0 |
| 90s | 틱 | **건너뜀(hidden)** | fetch |
| 95s | 복귀 | **스로틀에 삼켜짐** | — |
| 100s | | **배지 0** ❌ | **배지 5** ✅ |

**최대 낡음 90초 → 180초.** 스로틀을 소진하는 것은 다른 소비자가 아니라 **직전 복귀 자신**이라 피할 수 없고,
카톡↔앱을 빠르게 오가는 모바일(사용자 99%)에서 흔한 패턴이다.

→ **건너뛴 틱을 기억**한다(`missedTick`). 리스너는 **그때만** 발사하므로 '같은 복귀에 두 번 조회'가 애초에 생기지 않는다 —
내가 별도 리스너를 피하려던 이유가 **조건을 붙이면 성립하지 않는다**. `useVisibilityRefresh` 쪽 중복 조회는 걷어냈다.

#### 🔴 FAIL ② — 계약 테스트가 **흉내 변조 5종을 전부 통과**시켰다
정규식은 "그 문장이 있는가"만 본다. **"도달하는가", "다른 경로가 없는가"** 는 못 본다. 실제로:
- **M1**: 게이트를 그대로 두고 `setInterval` 을 **한 줄 더** 달면 백그라운드 폴링 완전 부활 → 16건 전부 초록
- **M2**: 재동기화를 `if (String(user.id) === '__never__')` **죽은 분기**에 넣으면 영영 안 도는데 → 16건 전부 초록

→ '문장 존재' 대신 **개수와 위치**를 본다: 이펙트 안 `setInterval` 이 **정확히 1개**, 재동기화는 **가드 바로 뒤 무조건 실행**(함수 끝까지 못박음).
음성 대조: M1 **FAIL 1**, M2 **FAIL 1**(이전 통과), M2b·M2c·M3 **각 FAIL 1**.
⚠ 근본 한계는 남는다 — 정규식으로는 도달 가능성을 다 볼 수 없다. **§5-A 검증이 쓴 런타임 하네스**가 진짜 답이다.

#### 주석 정정 2건 (검증자 지적 — 과장이었다)
- `App.tsx:1454` "기능 소실 없음" → 첫 진입 **1왕복 동안 '예약 N'·'마감 임박' 뱃지가 비어 있다**고 사실대로.
- `reviews.ts:72` "다음 조회에서 바로 본다" → **후기를 쓰는 `VenuePage` 는 스스로 재조회하지 않는다**(원래 그랬다. 회귀 아님).

#### 아직 남은 것(수정 안 함)
`handleMeOpenSchedule` → `openScheduleById` 의 deps 에 `schedules` 가 있어 **일정이 갱신될 때마다 memo 가 빗나간다** — 절감이 부분적이다.
verifier 가 "중복요청 2→0" 의 **2** 라는 수치는 폴백(`venue_reviews?limit=5000`)이 도는 환경 전제라 코드만으로 재확인 불가하다고 지적했다 — 수치 자체는 미검증이다.

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1599건** · build ✓ · 번들 예산 ✓.

### ⚠ 폰트 NEEDS_USER — **질문의 전제가 틀렸다**(내가 인계받은 채로 들고 있던 것)

지금까지 이 질문을 "**A.** `fallback` 으로 바꿔 브랜드 폰트를 살리고 CLS 를 감수 / **B.** Pretendard 를 빼고 321KB 절약"
양자택일로 들고 있었다. 근거는 "`optional` 이라 폰트가 거의 적용되지 않는데 321KB 는 다 받는다" 였다.

`index.html:98-215` 를 끝까지 읽어 보니 **그렇게 단순하지 않다.** 현재 구조는 실수가 아니라
**실측으로 설계된 2단 경로**이고, 파일 안에 조리법과 수치가 그대로 남아 있다(적대적 재측정값으로 교체된 표):

| | 이전 | 현재 | 폰트 전면차단(상한) |
|---|---|---|---|
| LCP 375 | 3,684ms | **2,944ms** | 2,928ms |
| CLS 콜드 | 0.0587 | 0.0587 | — |
| 콜드 폰트 적용 | 0/10 | 0/10 | — |
| **재방문 적용률** | 9/12 | **12/12** | — |

읽는 법: **'콜드 적용 0/10' 은 바뀐 것이 아니라 원래 그랬다.** `optional` 은 블록 구간(~100ms) 안에 폰트가
이미 준비돼 있지 않으면 그 로드에서 교체하지 않는다 — 콜드에서는 구조적으로 항상 늦는다.
그래서 **콜드에는 321KB 를 임계 경로에 얹고도 얻는 픽셀이 0 이었다.** 지금은 그 다운로드를
**첫 페인트·부팅이 끝난 뒤 유휴로** 미뤄 캐시만 데우고, '캐시에 있다'가 **실측된** 웜 방문에서만 head 에서 즉시 적용한다.
결과는 **브랜드 폰트를 덜 보여주는 게 아니라 더 보여주면서**(9/12 → 12/12) 콜드가 0.74초 빨라진 것이다.

즉 §6 실측에서 잡힌 **콜드 폰트 339KB / 14요청은 임계 경로가 아니라 LCP 뒤의 캐시 예열**이다.
내가 인수인계에 "비용은 다 치르고 효과는 못 얻는다" 고 적은 것은 **틀렸다.**

그리고 이 파일은 `swap` 을 명시적으로 금지한다 — 늦게 도착한 폰트가 전면 재레이아웃을 일으킨다("주르륵 밀림 금지").
`fallback` 도 같은 계열이라 A 안은 **측정된 설계를 되돌리는 것**이고, B 안은 재방문 12/12 을 버리는 것이다.

**→ 실측한 결과, 위 표까지 포함해 내가 세운 전제가 전부 틀렸다. 아래가 확정된 사실이다.**

### ✅ 폰트 NEEDS_USER **닫음** — 양자택일이 아니라 "받는데 안 그린다" 였다

**한 문장**: Pretendard 는 self-host 도입일(**2026-08-26, `bbcf840`**)부터 지금까지 **단 한 픽셀도 적용된 적이 없다.**
콜드·웜·헤드리스·헤디드 전부. 회귀가 아니라 **처음부터** 그랬다.

판정 근거(폭 비교가 아니라 CDP 실제 사용폰트 + 픽셀 해시):

| 조건 | 헤더 픽셀 해시 |
|---|---|
| 현재(`optional`) | `533346822707` |
| **woff2 전면 차단** | `533346822707` ← **1비트도 다르지 않다** |
| `fallback`/`block`/`swap` | `93f74bbea87f` |

즉 **콜드 방문마다 13요청 321KB 를 받고 얻는 픽셀이 0** 이었다.

**원인**(가설을 하나씩 갈라 확정): `pretendardvariable-dynamic-subset.css` 의 **92개 face 전부에 걸린 `font-display: optional`**.
dynamic-subset 은 face 를 **레이아웃 중에야 발견**하므로 요청이 첫 페인트 근처에서야 출발하고,
**13개 파일**의 캐시 읽기+압축 해제가 optional 의 블록 구간(~100ms)을 넘긴다. 한 번 넘기면 그 로드에서는 끝이다.
서브셋 커버리지(화면 한글 158자 전수 대조)·주입 타이밍·서비스워커·웜 캐시는 **전부 무죄로 기각**됐다 —
CSS 에서 `optional` **한 단어만** `block` 으로 바꾸면 즉시 적용된다.

**내가 한 것**: `index.html` 의 폰트 주입을 **제거했다**(파일은 지우지 않았다 — `public/fonts/pretendard/` 3.2MB 그대로).
확인: woff2 요청 **0건**, `h2 → Malgun Gothic×18` · `p → Malgun Gothic×20` 으로 **제거 전과 정확히 동일**.
회귀 `e2e/font-apply-measure.spec.ts` 2건 신설(요청 0건 + CDP 로 Pretendard 가 안 그려지는지).

**왜 켜지 않았나** — 이게 판단의 핵심이다. **이 앱의 행간·말줄임·박스 크기는 전부 Pretendard 가 적용되지 않은 상태에서 눈으로 맞춰졌다.**
지금 켜는 것은 '의도한 디자인 복원'이 아니라 **전 화면 미검증 변경**이다(글자 폭이 바뀌어 줄바꿈·말줄임·카드 높이가 전부 움직인다).
문서 5 §7 이 요구하는 **모바일·PC 실화면 확인**이 먼저다.

**켜는 법(측정 완료, `index.html` 주석에 그대로 적어 뒀다)** — 4173 프로덕션 빌드 · 412×915 · CPU 4x · SW 차단 · n=5 중앙값:
① CSS 의 `optional` → `fallback` ② `<head>` 에 `<link>` 정적 추가.
결과: 콜드 LCP 652 → **948ms** · 콜드 CLS 0.0775 → **0.0791(사실상 동일)** · 전송 321KB(지금도 받고 있던 양).

⚠ **"브랜드 폰트를 살리면 주르륵 밀린다"는 통념이 실측으로 깨졌다.** CLS 가 오르는 것은 `font-display` 탓이 아니라
**유휴 지연 주입** 탓이었다(지연 주입 + `fallback` 은 CLS 0.132). `<head>` 정적이면 교체가 첫 페인트 근처라 늦은 재레이아웃이 없다. 대가는 LCP +약 300ms 뿐이다.

#### 🚫 앞으로 인용하면 안 되는 수치 (전부 오염)
| 오염된 것 | 왜 |
|---|---|
| `index.html` 의 옛 표 — 콜드 0/10, 재방문 **9/12 → 12/12** | 판정기가 `mk('__nuri_no_font__,system-ui')` 로 **대조군에 폴백을 붙여** 적용 여부와 무관하게 항상 차이가 났다. **12/12 은 존재한 적이 없다.** (지웠다) |
| 이 문서에 있던 `fallback` **CLS 0.21** · `swap` **0.35** | 재측정에서 0.132 / 0.127. 게다가 '유휴 지연 주입' 조건이 섞여 있어 `font-display` 탓으로 읽으면 틀린다 |
| "A 를 고르면 CLS 0.098 → 0.21" | `<head>` 정적이면 0.079 로 비용이 사라진다 — **양자택일 프레이밍 자체가 틀렸다** |
| "headless 로는 폰트 판정 불가" | **폭 비교법에만** 참. CDP 사용폰트·픽셀 해시는 헤드리스도 정확하다 |

#### 판정 방법 (여기서 세 번 틀렸다 — 다음 사람을 위해)
- ❌ `document.fonts.check()` — **없는 폰트에도 `true`**(덮는 face 가 없으면 공허참). `status==='loaded'` 도 '칠할 수 있다'가 아니다(13개 loaded 인데 안 쓰였다).
- ❌ 고립 span 폭 비교 — 화면에 **없던 글자**로 프로브하면 그 순간 로드가 시작돼 `optional` 이 폴백을 확정한다. CSS 가 멀쩡해도 항상 '미적용'이 나온다.
- ❌ 새 컨텍스트 + `storageState` 로 '웜' 만들기 — localStorage 만 따라오고 **HTTP·SW 캐시는 안 따라온다**(내가 이걸로 한 번 틀렸다).
- ✅ **CDP `CSS.getPlatformFontsForNode`** 와 **픽셀 해시**.

#### 부수 정정
`e2e/font-coverage.spec.ts` 의 제목이 "Pretendard **자신이 그린다**" 였는데, 이 스펙은 CSS 를 직접 fetch 해
FontFace 를 **스스로 등록한 뒤** 재므로 앱이 폰트를 쓰는지와 무관하다(제거 후에도 통과). 제목을 **'서브셋 자산의 글자 커버리지'** 로 고쳤다.
`src/index.css:20` 의 `font-display: swap` 은 **`NuriMarks`**(랭킹 마크 16글자, 15KB) 것이라 이 건과 무관하다.

#### 미검증(숨기지 않는다)
`index.html` 옛 표의 LCP·전송량 칸은 재측정하지 않았다(적용 여부 칸만 오염이 확정됐다).
실서비스 도메인에서 재지 않았다 — 전부 로컬 `vite preview`. CLS 절대값은 노이즈가 커서 **조건 간 상대 분리**만 신뢰한다.

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1601건** · build ✓ · 번들 예산 ✓ ·
`first-screen`·`home-cls`·`header-320`·`typography-regression`·`font-apply-measure` **12 통과 / 2 skip**.

### 📋 다음 배치 준비 — 문서 5 §7·§8 (타이포그래피 실화면). 사전 조사만 했다

**역할 토큰은 있는데 거의 쓰이지 않는다.** `src/index.css:879-885` 에 6개가 정의돼 있지만 실제 사용 횟수는:

| 토큰 | 값(html 17px 기준) | 사용 |
|---|---|---|
| `t-nav` | 0.875rem = **14.88px** | 5 |
| `t-tab` | 0.75rem = 12.75px | 14 |
| `t-title` | 0.875rem = 14.88px | **2** |
| `t-body` | 0.875rem / 행간 1.375rem | **1** |
| `t-desc` | 0.75rem = 12.75px | 38 |
| `t-meta` | 0.6875rem = **11.69px** | **2** |

그런데 **임의 px 이 115곳**이다: `text-[10px]` 46 · `text-[9px]` 33 · `text-[11px]` 33 · `text-[8px]` 3 (+ 인라인 `fontSize:` 19곳).

⚠ **이게 왜 중요한가**: `html { font-size: 17px }` 는 **"50대 이용자 가독성"을 위해 16px 에서 올린 결정**이다(`index.css:537`).
그런데 `text-[9px]` 같은 **절대 px 은 그 결정을 통째로 무시한다** — rem 기반 확대가 안 걸리고,
심지어 **가장 작은 역할 토큰(11.69px)보다도 작다.** 접근성 결정과 실제 화면이 어긋나 있다.

⚠ 그리고 이제 **폰트가 시스템 폰트(맑은 고딕)로 확정**됐으므로, 타이포그래피는 **실제로 보이는 그 폰트 기준**으로 판정해야 한다.
Pretendard 를 가정하고 맞추면 또 어긋난다.

문서가 명시한 함정도 그대로 옮긴다: **`.75rem` 은 12px 이 아니라 12.75px 이다.** 16px 을 가정해 정규화하면 전부 틀린다.
루트를 16px 로 되돌리는 것은 간격·컨트롤 전체에 영향을 주므로 **단순 정리로 하지 않는다.**
coarse pointer 입력창의 16px 예외(모바일 확대 방지)와 클락 타이머의 큰 `clamp` 는 **의도된 것**이라 보존한다.

### ✅ 폰트 제거 검증 **PASS** + §5-B 계약의 구조적 구멍(N1) 폐쇄

**픽셀 무회귀** — 제거 전(`git show HEAD:index.html`)과 현재를 각각 빌드해 390×844 로 5개 화면 비교:
`gto`·`calendar`·`browse`·`community` **바이트 완전 동일**, `home` 만 **329,160픽셀 중 4픽셀**
(x=389 맨 끝 열, RGB 델타 ≤3/255 — 장식 그라디언트 경계). **"완전 동일"로 반올림하지 않고 그대로 남긴다.**
CDP 사용폰트는 두 빌드 모두 `Malgun Gothic`.

**되돌리기가 실제로 동작한다** — `index.html` 주석의 '켜는 법' 2단계를 격리 사본에서 그대로 실행하니
CDP 가 `Pretendard Variable` 을 보고했다(요청 14건). **주석이 거짓이 아니다.**

**새 e2e 2건이 진짜 잠금이다** — 재활성화 빌드에서 **2/2 FAIL**, 현재 빌드에서 **2/2 PASS**.

`index.html` diff 는 단일 hunk(+28/−132)로 FONT 블록에만 국한 — 앱 셸·SVG 스프라이트·`<noscript>`·법적 고지 무변경.

⚠ 남은 사실 하나: `public/sw.js` 의 캐시 키(`nuri-shell-v2`)는 그대로다. 기존 사용자 기기에 남은 폰트 바이트가
**되살아나지는 않지만**(요청 자체가 안 생긴다) **능동적으로 정리되지도 않는다.**

#### 🔴 N1 — 계약 테스트의 **구조적** 한계를 찔렸고, 구조로 막았다
독립 검증이 두 번째 폴러를 앵커에서 **1400자 밖**에 심자 18/18 통과했다(같은 변조를 창 안에 넣으면 잡혔다).
즉 판정 기준이 '버그 유무'가 아니라 **'앵커로부터의 거리'** 였다 — 정규식 계약이 한 지점 주변 고정폭 창만 보는 탓이다.

→ 창이 아니라 **파일 전체 불변식**으로 올렸다: **`App.tsx` 전체에서 `setInterval` 은 정확히 하나.**
지금 실제로 하나뿐이라 이 형태가 성립한다. 음성 대조: 파일 반대편에 게이트 없는 폴러를 심으면 **FAIL 1**(이전 통과).
새 주기 작업이 필요하면 숫자만 올리지 말고 **그 타이머에도 숨은 탭 게이트가 있는지 확인하고 근거를 적으라**고 테스트에 써 뒀다.

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1602건** · build ✓.

### ⚠ 사고 기록 — 캡처 중 운영 Supabase 로 GET 8건이 나갔다 (2026-09-12, §7 진단)

design-reviewer 가 **스스로 보고**했다. `context.route` 를 **두 개** 걸었는데, Playwright 는 나중에 등록한 것을 먼저 잡고
그 안의 `route.continue()` 는 **다른 핸들러가 아니라 실네트워크로 나간다.** 그래서 Supabase GET **8건이 운영 프로젝트에 도달**했다.

**피해 범위**: 가짜 JWT 라 전부 **401** — 읽은 데이터 0. **쓰기 0건.** 즉시 단일 `'**/*'` 핸들러로 바꿔 이후 캡처는 유출 0.

**규칙으로 굳힌다**: 목킹은 **핸들러 하나**로 한다. 여러 개를 겹치면 `route.continue()` 가 조용히 실네트워크로 새어
"목킹했다고 믿는데 운영에 나가는" 상태가 된다. 세션 규약이 금지한 것은 운영 **쓰기**였고 그 선은 지켜졌지만,
**읽기도 나가면 안 된다** — 다음부터 캡처 하네스는 첫 실행에서 **요청 로그로 유출 0 을 먼저 증명**하고 시작한다.

### 📋 §7·§8 진단 완료 — 결함 심각도순 (캡처 약 75장 + computed 5벌, 스크래치패드)

조건: 프로덕션 빌드 4173 · **headed** Chromium · 390/1440 기본(위험 화면만 320/768/1920) · 다크 기본 + 주요 화면 라이트 병행 ·
200% 확대는 `html{font-size:34px}` 주입 · **로그인은 전부 합성 세션 목킹**.

| | 결함 | 근거 |
|---|---|---|
| 🔴 **P0-A** | **200% 확대에서 GTO 탭이 기능적으로 붕괴** — 설명이 `client 19 / scroll 26` 으로 눌려 **한 글자씩 세로로** 쌓이고, 카드가 600px 넘게 자라 도구 목록이 fold 밖으로 밀린다. 오버플로 31곳 | `ToolsPanel.tsx` |
| 🔴 **P0-B** | 절대 px 의 발원지는 "115곳"이 아니라 **셸 2줄 + atom 1줄** — `App.tsx:757` 탭바 라벨 `text-[11px]`(**전 15화면 ×115 노드**, 1차 내비게이션이 최소 토큰보다 작고 rem 확대를 안 받는다) · `App.tsx:752` 배지 `text-[9px]` · **`Avatar.tsx:60` 인라인 `fontSize` → 9~17px 7단**(8개 파일, 게시글 상세 한 화면에 10/13/17px 동시) | 아래 3곳 |
| 🔴 **P0-C** | **법정 상시 노출 블록이 절반만 고쳐졌다** — 약관·정책 링크만 **11.69px**(같은 역할인데 1.06px 작다) · 라벨 대비 라이트 **2.81:1**·다크 3.09:1 로 **AA 미달 ×7** · 320px 에서 "사업장 주소"가 `사업장/주소` 로 갈라짐 | `BusinessFooter.tsx` |
| 🟠 P1-A | 같은 역할 버튼이 **라벨 3크기 × 높이 11종**(`.btn` 오버라이드 241회/40회). 40.8 vs 42.5 = **1.7px 차** — `index.css:265` 스스로 적어 둔 *"1px 차이는 위계가 아니라 대충 만든 것으로 읽힌다"* 에 정확히 해당 | `index.css` 공용 |
| 🟠 P1-B | **이벤트 결과 `꽝` 이 앱에서 가장 작은 글자**(`text-[9px]`) · 경품 확률 고지 10px · 같은 `이용권 0장` 이 한 화면에서 10px/11.69px · 경품명이 비면 **"경품은 입니다."** 로 문장이 깨짐 | `EventPage.tsx` 11곳 |
| 🟠 P1-C | **실제 잘림** — home 320 매장명 `52/205`(25%만 보임) · browse **1440** 인기글 `235/454` · '곧 시작' 레일에서 **시작 시각이 잘림** · calendar **390** 에서 문구 2건 · tools 320 은 **이미 최소 크기라 더 줄일 수 없다** | 여러 |
| 🟡 P2-A | 라이트에서 주말 표시가 안 보인다 — `토` **1.53:1**, `일` 1.68:1. 구분이 색 하나에만 걸려 있다 | browse |
| 🟡 P2-B | 같은 11.69px 에 **행간 5갈래**, 12.75px 에 5갈래 — 일정 카드 한 행에서 `LIVE`/`TOP`/`9/12(토)` 의 **baseline 이 안 맞는다** | 전역 |
| 🟡 P2-C | 관리자 표 `tabular-nums` 커버리지 **6/13** — ⚠ **정적 근거뿐, 렌더로 확인 못 함** | `AdminTab.tsx` |

⚠ **P0-A 는 재발이다.** 이전 §7 수정이 같은 카드의 **배지 행만** 고치고 설명 열은 "재지 않았으므로 건드리지 않았다"고
스스로 기록했는데, 그 미측정 영역이 정확히 여기다. **재지 않은 곳은 고쳐지지 않는다.**

⚠ 규약이 없는 게 아니다 — `StoreDashboard.tsx:65` 에 이미 *"사다리 밖 임의 px 금지(§T1 규칙 2)"* 가 적혀 있다.
**규약이 한 파일에만 있고 셸·atom 이 그걸 어기고 있다.**

#### 진단자가 스스로 철회한 것 4건 (눈대중이 틀렸다고 밝힘)
홈 캐러셀 왼쪽 잘림(자동 전환 중 프레임) · 라이트 my-store 헤더가 검다(캡처 오독) ·
`1000만 GTD` 가 라이트에서 안 보인다(실측하니 gold-600 으로 스왑돼 AA 통과) · 대비 스캔 상위 실패(조상 배경 오탐).

#### 못 본 것
장부·정산 표의 **실데이터 금액 정렬**(스키마 목킹 범위 초과 — P2-C 가 정적 근거뿐인 이유) · 클락 TV 송출 실화면 ·
프로필 모달·이용권 지갑(셀렉터 못 찾음, 4순위라 포기) · 관리자 하위 표 내용(목 0건) · **열린 키보드·실기기 iOS/Android**(Windows 에뮬레이션뿐 — **iPhone 검증 완료라고 부르지 않는다**).

### ✅ P0-A 해결 — 200% 확대 GTO 붕괴 (`ToolsPanel.tsx`, 글자 크기는 **0곳** 바꿨다)

**기제를 정확히 특정했다**: `flex-1` 은 **`flex-basis: 0%`** 라 **줄바꿈 계산에 0 으로 잡힌다.**
그래서 `shrink-0` CTA 는 어떤 폭에서도 아래로 못 내려가고, 글 칸 혼자 남는 폭을 0 에 수렴하며 흡수한다.

⚠ **`flex-wrap` 만 붙이면 안 고쳐진다** — 390px·200%에서 아이콘(76.5)+CTA(158)+간격(42.5)=277.5 < 사용가능 296.5 라
wrap 조건 자체가 성립하지 않는다. `flex-[1_1_7rem]` 로 **실질 basis** 를 줘야 rem 이 루트 확대를 타고 줄바꿈을 만든다.
**1차 수정이 `flex-wrap` 만 붙이고 끝난 것이 반쪽이었던 이유가 이것이다.**

⚠ **두 번째 원인은 "재는 축이 하나였다"는 것이다.** 1차 수정의 `truncate` → `line-clamp-2` 는
**가로 잘림을 세로 잘림으로 옮긴 것**이었다 — 320px·**100%**에서 'NURI SPOT' 설명이 이미 `clientHeight 32 / scrollHeight 48` 로
'토론'을 잘라먹고 있었다. `scrollWidth` 만 보는 회귀 스펙은 이걸 **구조적으로 못 잡는다.**

실화면 전후(오버플로 노드 / 세로 잘림):
390@200% **34 → 0** / 8 → 0 · 320@200% **34 → 0** / 21 → 0 · 320@100% **19 → 0** / 1 → 0 ·
768@200% 22 → 0 · 1440@200% 21 → 0. 레인지 카드 높이 390@200% **1339 → 497**. 설명 `19/26 → 261/261`.
100% 에서 나빠진 것 없음.

회귀 3건 추가 — **가로·세로 잘림을 동시에** 잠그고(`truncate`→`line-clamp` 우회가 통과하지 못하게),
설명 폰트 하한도 함께 단언해 **"작게 줄여 회피"를 막는다**. 음성 대조: `truncate` 복원 **3건 실패**, `flex-1` 복원 **2건 실패**.

#### ⚠ 새 함정 — 음성 대조가 **여섯 번째로** 틀릴 뻔했다 (도구 쪽 함정)
**4173 에 preview 가 떠 있으면 Playwright webServer 가 `npm run build` 를 통째로 건너뛰고 낡은 `dist` 를 검사한다.**
그래서 첫 음성 대조가 **거짓 통과**했다. 포트를 비우고 다시 돌려 위 결과를 얻었다.
→ **규칙**: e2e 음성 대조 전에 **4173 을 비우거나** `E2E_BASE_URL` 로 서버를 직접 관리한다. 이건 코드가 아니라 **측정 도구**의 함정이다.

#### 보고만 (내 재량 밖)
**200% 확대에서 도구 목록은 여전히 fold 밖이다** — 첫 도구 카드 top 2688 → 2053(−24%)이지만 fold 는 844 다.
히어로 3장 + 검색 + 칩이 약 1500px 이라 fold 안에 넣으려면 **카드를 없애거나 접어야 한다**(기능·정보 소실) → **오너 결정 후보**.

### ✅ P0-C 해결 — 법정 상시 노출 블록 가독성 (`BusinessFooter.tsx`)

**법정 문구는 한 글자도 바꾸지 않았다.** 크기·색·줄바꿈만 다뤘다.

| 항목 | 전 | 후 |
|---|---|---|
| 약관·정책 링크 | `text-2xs` **11.69px** | `t-desc` **12.75px**(사업자 정보와 같은 역할로 통일) |
| 라벨(dt) | `text-ink-muted/70` | **불투명** `text-ink-muted` + `shrink-0 whitespace-nowrap` |
| 사행성 고지문 | `text-ink-muted/80` | **불투명** `text-ink-muted` |

**대비(실제 지면 `surface-base` 와 알파 합성해 계산 — 순백 아님)**:

| 대상 | 라이트 전 → 후 | 다크 전 → 후 |
|---|---|---|
| 사업자 정보 라벨 ×7 | **2.81 → 4.99** | 3.09 → **5.28** |
| 사행성 배제 고지 | **3.37 → 4.99** | 3.72 → **5.28** |

전부 AA(4.5) 통과. 320/390/768/1440 × 라이트·다크 **8조합 전부 실화면 computed 로 실측**.

**320px 줄바꿈**: "사업장 주소" 라벨이 자기 폭 안에서 `사업장/주소` 로 갈라지던 것 → `whitespace-nowrap`+`shrink-0` 으로 라벨은 항상 1줄.
⚠ **글자를 줄여서 풀지 않았다**(이미 최소 구간이다). 값(dd)은 그대로 2줄로 흐른다.

회귀 2건 추가(라이트·다크). 음성 대조는 **4개 단언을 각각 독립적으로** 되돌려 **그 줄에서만** 실패하는 것을 확인했고,
5원칙(앵커 1회 매칭 · 실제 실행 확인 · 원인 줄 확인 · 복원 해시 `280d8cc3…` 일치)을 전부 충족했다.

게이트: `build`(tsc 포함) ✓ · eslint 0 error/warning · vitest **1607건 141파일** · `typography-regression` 7건 프로덕션 빌드에서 통과.
`index.css`·`tailwind.config.js` 는 열지 않았다 — 토큰이 부족하지 않았다.

### ✅ P0-B 해결 — 셸 탭바 + 아바타 사다리 (`App.tsx`, `Avatar.tsx`)

| 위치 | 전 | 후 |
|---|---|---|
| 탭바 라벨 `App.tsx:757` | `text-[11px]` **절대 11px** | **`t-tab`** 12.75 / 600 / lh 17 + `break-all` |
| 배지 `App.tsx:752` | `text-[9px]` **앱 최소** | **`text-2xs`** 11.69 |
| 아바타 이니셜 `Avatar.tsx:60` | 인라인 `max(9, size*0.42)` → **9/9/10/11/12/13/17px 7단** | **4구간 사다리** 11.69/12.75/14.88/17 |
| 아바타 원 지름 | `width: size`(px) | `width: size/17 rem` — 100% 렌더 폭 **완전히 동일** |

⚠ **`t-nav`(14.88)를 쓰지 않은 것은 실측 반증이다** — 320px 칸이 59.3px 인데 `t-nav` 의 '커뮤니티' 는 **59.5px** 로 **안 들어간다**(`t-tab` 은 51px).
⚠ **지름까지 rem 으로 바꾼 이유**: 글자만 rem 으로 올리니 200% 확대에서 size 18 아바타의 이니셜이 원 밖으로 **세로 +13px** 넘쳤다.
⚠ 첫 실측에서 **200% 겹침 2~3건**을 발견해 고쳤다 — `index.css:564` 의 전역 `word-break: keep-all` 때문에 폭 제한만으로는 '커뮤니티' 가 안 접혀 `break-all` 이 필요했다(100% 에서는 51 < 59.3 이라 줄바꿈이 일어나지 않는다).

실화면: 390/320 × 다크·라이트 × 100%/200%, 겹침 0 · 잘림 0 · 가로 스크롤 0 · 배지 `99+` 까지 안 깨짐 ·
이니셜 7종 전부 수평 오차 ≤0.01px, 수직 ≤0.87px, 잉크가 원 밖으로 안 나감. **유출 0 을 먼저 증명**(외부 98건 전부 fulfill).

#### ⚠ 구현자가 **자기 계약의 구멍 2개를 스스로 찾아 막았다**
- 소스 계약이 `/text-\[\d+px\]/` 라 **템플릿 조립형**(`` text-[${계산}px] ``)이 통과했다 → `/text-\[[^\]]*px\]/` 로 넓혔다.
- e2e 가 className 을 **하드코딩**해 `App.tsx` 를 되돌려도 통과했다 → 이제 **소스에서 className 을 떠다가** 주입한다.

신규 회귀: `e2e/tabbar-label-ladder.spec.ts`(**루트를 34px 로 키워 라벨이 따라 커지는지** — 크기 단언만으로는 `text-[12.75px]` 가 통과하므로 이 확대 대조가 핵심) ·
`src/components/atoms/Avatar.ladder.test.ts`(사다리 소속·최소단·**비례**·인라인 px 부재·지름 rem).

### ⚠ 내가 준 전제가 틀렸다 — **줄바꿈은 파일마다 다르다**

나는 여러 배치에 "작업 트리는 **CRLF**" 라고 일괄 전달했다. **틀렸다.** 바이트 단위 실측:

| LF | CRLF |
|---|---|
| `src/App.tsx` · `src/index.css` · `src/components/atoms/Avatar.tsx` · `src/api/adminEvents.ts` · `index.html` | `src/components/features/VenueManageTab.tsx` · `src/components/features/PostDetailModal.tsx` |

이건 **앵커가 조용히 0회 매칭되는** 바로 그 부류의 사고를 만든다(이미 한 번 났다).
→ **규칙 정정**: 앵커에 개행을 넣지 말고 **한 줄 안에서 유일한 문자열**을 쓴다. 필요하면 **그 파일의 줄바꿈을 먼저 확인**한다.
어느 쪽이든 **매칭 횟수를 세서 1이 아니면 대조를 무효로 멈춘다**(이게 근본 방어선이다). 도는 두 배치에 즉시 정정을 보냈다.

#### `index.css` 후속 3건 (다음 배치 — P0-B 는 읽기만 했다)
1. **역할표에 '모바일 1차 내비' 칸이 없다** — 표는 `t-nav` 를 "1단계 내비" 로 규정하는데 **하단 탭바는 320px 에서 `t-nav` 가 물리적으로 안 들어간다.** 표에 "하단 탭바(5칸 고정폭) = `t-tab`" 을 명시하거나 짧은 라벨 정책을 정해야 한다.
2. 사다리 최소단이 11.69px 하나뿐이라 18px 아바타의 이니셜 비율이 0.65 까지 올라간다(원 안에는 들어간다 — 실측).
3. ⚠ **200% 확대에서 탭바 활성 알약과 아이콘이 따로 논다** — 알약은 `h-7 w-12`(rem)이라 커지는데 아이콘은 `[&_svg]:h-[21px]` **절대 px** 이라 그대로다(`App.tsx:738`).

### ✅ §8-2 완료 — 이벤트 메뉴 / 캠페인 공개·숨김 / 행사 종료를 **세 축으로 분리**

| 제어 | 저장 형태 | 기본 |
|---|---|---|
| 사이트 메뉴 표시 | **기존 `app_settings.event_menu_visible`** 재사용, `'off'` 일 때만 숨김 | **켜기**(없는 값·깨진 값·**조회 실패** 전부 표시) |
| 캠페인 공개/숨김 | **새 축 `event_campaigns.hidden_at`** — `status` 는 `live` 그대로 | 현재 상태 보존 |
| 행사 종료 | 기존 `status='ended'` | 자동 종료 없음 |

⚠ **숨김을 `live → draft` 로 구현하지 않았다.** 컨테이너 단정이 이를 실증한다 — 숨긴 뒤에도 `status='live'` 라
`admin_compose_event_cards` 가 여전히 "초안에서만" 이라며 거절한다(**공개 후 카드 재편집이 풀리지 않는다**).

**공통 판정 함수**: `src/lib/eventState.ts` 의 `evaluateEvent()` — 7가지 상태 + 판정 불가.
시작 **포함**/종료 **미포함** · `hiddenAt === undefined`(서버 미보고)는 **공개**로 읽음 · 잘못된 날짜·로딩 중은 `unknown` + `canJoin:false` ·
**참여 불가면 항상 `blockedReason` 이 있다**(활성 버튼 뒤 RPC 오류 금지).
⚠ 내 지시는 `adminEvents.ts` 에 두라는 것이었는데 **구현자가 번들 근거로 `lib/eventState.ts` 로 뺐다 — 옳은 판단이다**:
홈·`EventPage` 가 `adminEvents` 를 import 하면 관리자 RPC 8개가 첫 화면 청크로 끌려온다(여유 1%).
**손님 화면은 `../lib/eventState` 를 직접 import 한다.**

**마이그레이션 `20260912d` — 초안(미적용).** 전부 추가만(지우는 컬럼·함수·정책 0).
격리 DB 행동 단정 **10종 통과**: 숨김 시 손님 NULL·관리자 미리보기·`status=live` 유지 / 숨김 중 카드 열기 거절·참여권 미지급 /
**A 매장 숨김이 B 에 영향 없음** / 다시 공개 시 카드 10장 그대로 / **숨김 중에도 내 이용권 조회됨(RLS)** / anon 차단.

**미적용 상태 동작**: 목록에 `hiddenAt` 이 없으면 **'확인 불가' 배너**를 띄우고 각 줄을 '공개'로 **오단정하지 않는다**.
숨기기/다시 공개는 `PGRST202` → **'서버 미적용' 안내**(성공 위장 없음).

🔴 **실캡처로 기존 결함 1건을 잡았다**: `settings.ts` 의 `setAppSetting` 이 `new Error(error.message)` 로 감싸
`permission denied for function set_app_setting` **원문이 관리자 DOM 에 그려졌다**(보안 표준 6번).
`SettingsError`(code·status 보존)로 고쳤다 — §5-B 의 `throwRpc` 와 **같은 부류**다.

음성 대조 SQL 8종 + TS 8종 전부 검출, 구멍 0. ⚠ 자가검사 자체가 한 번 오탐했다 —
Postgres 가 `is not distinct from` 을 `NOT (… IS DISTINCT FROM …)` 으로 되돌려줘 정상 정책에서 ABORT. 컨테이너 실측으로 잡았다.

**범위 밖 2건은 내가 승인한다**: `settings.ts`(메뉴 읽기 헬퍼는 여기 있어야 청크가 안 깨진다 + 위 보안 결함) ·
`e2e/admin-event-ops.spec.ts`(`app_settings` 라우트 1줄 — **없으면 그 조회가 운영으로 나간다**).

게이트(내가 독립 확인): `tsc -b` 0 · 린트 **0 error** · vitest **1641건** · build ✓ · 첫 화면 254.5/256KB.

### 🔴 보안 표준 정정 — `CREATE OR REPLACE` 의 ACL 동작이 **사실과 반대로** 적혀 있었다

`CLAUDE.md` 보안 표준 3번에 *"`CREATE OR REPLACE` 는 ACL 을 초기화하므로"* 라고 적혀 있었다. **틀렸다.**
격리 컨테이너(postgres:16) 실측:

| 시점 | anon 실행 가능 |
|---|---|
| 새로 만든 직후 | **t**(PUBLIC 기본 GRANT) |
| `REVOKE` 후 | f |
| **`CREATE OR REPLACE` 후** | **f — ACL 보존** |
| **`DROP` 후 재생성** | **t — ACL 초기화** |

ACL 이 날아가는 것은 **`DROP` + 재생성**이다(반환 타입 변경이 그 경우다).
⚠ 더 중요한 것은 **이 오해가 자가검사를 거짓 통과시킨다**는 점이다 — 이미 REVOKE 된 함수를 `CREATE OR REPLACE` 로 덮으면
**파일에서 REVOKE 를 빼도 ACL 이 남아 검사를 통과한다.** §8-2 구현자가 정확히 이걸 밟았고(`drop function` 후 재실행해서 검출),
그래서 **ACL 자가검사의 음성 대조는 `DROP` 후 적용해야 한다.** `CLAUDE.md` 에 실측과 함께 정정했다.

### ✅ §5 완료 — 게시글 상세를 읽는 화면으로

| 항목 | 전 | 후 |
|---|---|---|
| 모바일 상단(창 상단→본문) | **90.3px**(그립 16 + 제목행 68) | **56.3px** 한 행 · 768 73.3→56.3 · 2-pane 53 |
| 닫기 터치 | 44×44 | **46.8×46.8**(안 줄었다) |
| 글 제목 행간 | 1.25 | **1.375**(PC 25.5/1.333), line-clamp 제거 |
| 본문 행간 | 1.625 | **1.70** |
| 시각·조회 | 11.69px, 조회가 제목 **위** | **12.75px**, 작성자·시각 줄로 이동 |
| 2-pane 읽기 폭(1280·1440) | **501.5px** | **608px** |
| 768 독립 모달 | 544 / 읽기 501.5 | **714** / 읽기 671.5 |

⚠ **`Modal.tsx` 는 옵트인 `density="compact"` 를 신설**했다 — 기본값은 종전 그대로라 **다른 모달은 한 곳도 안 바뀐다**(문서가 요구한 "게시글 문맥에 한정").
읽기 면/댓글 면 구분: 본문은 창 지면 그대로, **댓글만 `bg-surface-base` 전폭 밴드**. `surface-high` 를 안 쓴 이유는 댓글 입력 `.input` 이 바로 surface-high 라 **입력 면이 지면에 흡수**되기 때문이다.
**응원·끌올의 채워진 박스 2개를 제거**해 짧은 글에서 보조 기능이 본문보다 강하던 것을 해소했고,
조건 문구("점수는 상대에게 가지 않아요")는 **한 글자도 안 바꾸고** 11.69px·**4.46:1(AA 미달)** → 12.75px·**6.00:1** 로 읽히게 했다.

잘림 검사: 320~1440 × 다크·라이트 × 200% × (짧은 글/긴 URL/세로 포스터/이미지 실패) **전부 0건**.
세로 포스터는 `object-contain`(4:3 자리 예약해 **CLS 0**)으로 맨 위·가운데·맨 아래가 다 보인다. **이미지 실패 상태 신설**.

⚠ **본문 17px 을 16px 로 낮추지 않았다** — 문서 §5-2 권장은 모바일 16px 이지만, 절대 px 을 박으면 200% 확대에서 안 늘어나
§7-3·P0-A 교훈에 정면으로 어긋난다. 루트 17px 의 `1rem` 을 유지했다(PC 권장 16–17 범위 안).

#### ⚠ 여기서도 **측정 도구가 두 번 틀렸다**
- **출력의 cp949 `UnicodeEncodeError` 로 복원이 건너뛰어져 패치가 3회분 누적**됐다 → 복원을 `finally` 로, 출력을 utf-8 로 고정.
  (내가 같은 함정을 두 번 밟았던 것과 같은 부류다.)
- **테스트 자체가 거짓 통과**했다 — 시트 진입 애니(0.26s) 중 `boundingBox()` 두 번이 **서로 다른 프레임**을 재 상단 높이가 113·175px 로 튀었다
  → 애니 정지 대기 + **한 `evaluate` 안에서 두 rect**. 수정 후 5회 연속 6/6.

게이트: `build` ✓ · 린트 **0 error** · vitest **1641건** · e2e 관련 **89 passed / 2 skipped / 0 fail**.
**못 한 것**: 실기기 모바일 **열린 키보드 위 댓글 입력**은 Windows 에뮬레이션뿐이라 미검증(Escape·포커스 복귀·다중 모달 잠금은 기존 스펙 통과로 간접 확인).

### 🔄 새 실행문 도착 — **내 지시 하나가 폐기됐다** (APIS 벤치마킹 문서, 2026-09-12)

문서: `…\outputs\NURI_APIS_국내외벤치마킹_홈라이브_전서비스_UIUX_상세설계_Claude_Code_2026-09-12.md`

⚠ **§0 이 내 직전 지시를 명시적으로 폐기했다**: *"모바일 3열을 무조건 해체하라는 이전 제안은 폐기한다.
360px 이상에서는 읽기 좋은 3열을 유지하고, 320px 등 좁거나 글자가 확대된 조건에서 보조 정보를 다음 줄로 이동한다."*
나는 그 직전에 store-team 에 **정확히 반대**를 지시했다. **즉시 철회 지시를 보냈고**, "이미 한 일을 처음부터 다시 하지 말고 3열 부분만 새 기준에 맞추라" 고 했다.
문서는 *"이 문서의 구성 및 수치는 과거 지시문의 상충하는 시각 제안보다 우선한다"* 고 못박는다.

**가져오는 것은 구조뿐이다** — 작은 배너 다음 실제 콘텐츠, 추천 카드 정보 배치, 촘촘하되 구분되는 라이브 행.
**APIS 의 색·로고·자산·고유 문구·수치는 가져오지 않는다.** 누리의 네이비·보라·금색은 유지하고 **번지는 보라 광원과 과한 장식만** 정돈한다.

### ✅ §6 완료 — 일정 카드 (철회 지시 반영됨)

| | 이전 | 지금 |
|---|---|---|
| ≥360px | 3열 고정 | **3열 유지** — `min-[360px]:` 기준(`sm:`=640 에서 내림) |
| ≤359px | 같은 3열 강요 | 1행(상태·시각·참가비) → 제목 → 매장·지역 → 등록마감·상금 → 메타 |
| **글자 확대** | 3열 유지(더 눌림) | **rem basis(`flex-[1_1_9rem]`)라 스스로 접힌다** — px 미디어쿼리가 못 잡는 축이다 |
| 메타 줄 | `overflow-x-auto`(**숨은 가로 스크롤**) | 줄바꿈 — 등록 마감·유형이 사라지지 않는다 |
| 메타 글자 | 11.69px | **12.75px** |

🔴 **'마감 임박' 조건을 삭제했다** — `(reserveCount ?? 0) >= 10` 이었는데 `Schedule` 타입에 **정원도 예약 마감 시각도 없어 근거가 0** 이다.
이제 `statusBadge` 는 `reserveCount` 를 **인자로도 받지 않고**, 예약은 메타 행에 사실만(`예약 12명`).

**포맷터 공통화**: `formatPrize`·`buyInText`·`regCloseText`·`prizeText`·`prizeMainText` 를 `ScheduleCard` 에서 export 해
`ScheduleTable`(자체 `Math.round(prizePool/10000)` **삭제**)·`ScheduleDetailModal`(참가비 3곳)이 쓴다.
⚠ **만 단위로 안 떨어지면 축약 자체를 포기**한다(`1,234,567` 그대로). **상금 보장 / 예상 상금**을 분리하고, 데이터 없으면 `null`(0·확정값을 만들지 않는다).
참가비 미입력은 **`무료`가 아니라 `—`**.

작업 중 실측으로 **추가 발견해 고친 것**: `leading-none` 세로 잘림(`15/17` 100%, `23/27` 200%) → `leading-tight` ·
390 매장명 `153/192`·지역 `4/68` → 줄바꿈 · 320@200% 카드 `250/270` 가로 넘침 → 참가비 블록 wrap.
**28조합(7폭 × 2테마 × 2배율) 전부 넘침 0 · 문서 가로 스크롤 0 · 숨은 가로 스크롤 0.** 대비 최저 다크 4.93 / 라이트 4.76 — AA 통과.

음성 대조 3종(금액 반올림 / 근거 없는 마감 임박 / 잘림) 전부 실패 확인, 복원 해시 `bc3652b8…` 동일.
게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1654건**(내가 독립 확인) · build ✓ · 신규 `e2e/schedule-card-fit.spec.ts` **36/36**.

#### ⚠ 넘긴 것 — `--card-h-list` 가 실측과 어긋난다
`index.css:1273` 토큰이 **116(모바일) / 81(≥640)** 인데 실측은 **≥768 116~117 · 412 117~186 · 390 142~214 · 320 138~202**.
**≥640 의 81 이 크게 어긋난다** — `HomeTab.tsx:368` 스켈레톤이 이 토큰을 써서 **데이터 도착 때 스크롤이 점프**한다.
`index.css` 는 홈 팀이 편집 중이라 **건드리지 않고 넘겼다**. ⚠ 그대로 117 로 박지 말라고 했다 —
변경 전 높이를 못 쟀고(HEAD 는 새 export 가 없어 빌드 불가), 폭마다 편차가 커서 고정 한 값으로 덮을 수 없다.

#### 아직 배정 안 된 것(§6 담당 범위 밖이라 손대지 않음)
`LiveGamesTab`·`VenuePage` 의 `BUY-IN`·`REG` 어휘와 **자체 금액 포맷**(같은 포맷터를 쓰게 하려면 배정 필요) ·
§10-1 일정 화면 순서(날짜·요일·대회 수 → 필터 → 목록)와 모바일 월간 달력(`App.tsx`·`CalendarPanel.tsx`) ·
그리드 카드 매장명은 기존 말줄임 유지(별점이 같은 줄이라 동작 보존).

### ✅ §7 완료 — 공통 토큰·양 테마 (`index.css`·`tailwind.config.js`·`ThemeContext.tsx`)

#### 🔴 이번 최대 발견 — 라이트 보정이 **알파 변형을 하나도 못 잡고 있었다**
`index.css:1105-1187` 의 라이트 `.text-*` 보정 목록 **전체**가 무력했다.
Tailwind 의 `text-sky-400/60` 은 `.text-sky-400` 이 아니라 **`.text-sky-400\/60` 이라는 별개 클래스**다.
그래서 라이트 달력 주말 표시가 `토` **2.00** · `일` 2.08 로 **사실상 안 보였다**(진단의 P2-A 가 이것이다).
전수 조사로 겹치는 알파 변형이 넷뿐임을 확인하고 하나씩 명시했다 — ⚠ **부분일치를 쓰지 않은 이유**는
`hover:text-sky-400/60` 까지 삼켜 **hover 전용 색을 상시 색으로** 만들기 때문이다. → `토/일` **5.53/5.78**.

#### 🔴 라이트 '옅은 보라' 의 진짜 발원지
`.subbar-aura`(`index.css:138`)가 `--aura-a2` 를 `color-mix` 계수로 써서 **모든 sticky 서브탭 바**에 보라를 미리 섞고 있었다.
**지면 블룸과 같은 토큰**이라 한 값이 두 곳에서 동시에 "모든 박스가 보라"를 만들었다. 라이트 블룸을 0.09/0.10/0.07 → **0.05/0.05/0.035** 로 내렸다(다크는 깊이라 무변경).

#### 🔴 `ThemeContext` 흰 화면 경로 (A03-1 과 같은 부류)
`resolveInitialTheme` 이 `useState` 초기화자 안에서 **감싸지 않은 `localStorage.getItem`** 을 불렀다 —
사파리 프라이빗·쿠키 차단 웹뷰에서 SecurityError 가 나면 **ThemeProvider 렌더가 통째로 터진다.**
`readStoredTheme()` 로 감싸고, `setItem` 실패가 화면 반영을 되돌리지 않게 분리했다.
첫 페인트 스크립트(`index.html:15-18`)는 이미 try/catch 이고 색이 `surface-base` 와 정확히 일치 — **번쩍임 없음**.

주요 토큰 전후(실측): 부가 글자 float **3.59 → 4.36**(AA 미달 해소) · 버튼 흰 글자 **5.56 → 6.46** ·
다크 액센트 글자 **3.60 → 9.40** · 금색 라이트 **4.67 → 5.85** · 라이트 오류 문구 틴트 위 **3.97 → 5.36**.
**128조합**(2테마 × 4폭 × 2배율 × 8화면) — 가로 넘침 0 · 고유 AA 미달 **8종 → 실질 2종**(둘 다 `aria-hidden` 장식 구분자, 남의 파일이라 보고만).
§11 **사용자 텍스트 간격 변경**(줄높이 1.5·자간 0.12em·단어 0.16em·문단 2배): 노드 수 840 **동일**, 세로 잘림 **6 → 0**(오히려 개선).

**문서 값과 다르게 간 것 2건(근거 있음)**: 라이트 `--border-default` 를 `#D6DEEA` 로 내리면 **1.65 → 1.26 으로 후퇴**해서
장식 역할인 `border-subtle` 에 넣었다 · `gold.*` **브랜드 팔레트는 안 건드리고** 통계 글자 클래스 `.stat-gold` 만 바꿨다.
**철회 1건**: 라이트 '홀덤펍' 1.07 은 **거짓 미달**이었다 — 알약이 `::before` 라 조상 배경 합성으로는 안 잡힌다. 픽셀을 떠서 재니 **5.96/6.00**(통과).

#### `.btn` 변형 — 호출부는 **한 곳도 안 옮겼다**(병렬 안전)
`.btn-sm` 34.00 / `.btn` 40.80(**무변경**) / `.btn-lg` 46.75 — 단 간격 6.8·5.95px(기존 1.7px 차를 대체).
⚠ **`@apply btn` 은 합성이 아니라 복사라 선언 순서가 계약의 일부**다(위에 뒀다가 조용히 무시되는 걸 잡았다).
⚠ `safelist: ['btn-sm','btn-lg']` 를 넣었다 — 호출부 0곳이면 Tailwind 가 `@layer components` 클래스를 **통째로 purge** 해서
다른 팀이 쓰는 순간 **아무 일도 안 일어나는 조용한 실패**가 된다. 이행이 끝나면 지워도 된다.
**`.btn:disabled`·`.input:disabled` 신설** — 이 파일에 `:disabled` 스타일이 **한 줄도 없었고** 비활성 입력이 활성과 **픽셀 단위로 같았다**.

#### P0-B 후속 3건 처리
① 역할표에 "하단 탭바(5칸 고정폭) = `t-tab`" 을 **예외 1**로 명시(폭 제약이 크기를 정하는 유일한 자리).
② 최소단은 **새로 만들지 않았다** — 10px 은 새 §5 의 '중요 정보에 9~10px 금지' 와 충돌한다. 18px 아바타는 **지름을 20px 로 올리는 쪽**이 맞다고 기록.
③ 200% 탭바 알약/아이콘 따로 놀기를 **`App.tsx` 를 열지 않고** `index.css` 에서 풀었다 — `height: calc(21rem / 17)`,
100% **20.98px**(시각 회귀 0) · 200% **41.98px**. 근본 수정 위치도 주석에 남겼다.

#### `--card-h-list` — 직접 재서 고쳤다
목킹 데이터로 **실제 카드를 렌더**해 폭을 훑었다: 320~344 **166.9** · 360~405 **182.2** · 412~430 128.5 · 480~1440 **117.3**.
→ `:root` 116 → **167**, `min-width:360px` **182** 신설, `min-width:640px` 81 → **117**(**36px 어긋나 있었다**).
⚠ 412·480 전이는 **일부러 안 넣었다** — CSS 브레이크포인트가 아니라 **글자가 줄바꿈을 멈추는 지점**이라 최악 데이터에서 되돌아간다(목 데이터 과적합).
넣은 두 경계만 근거가 있다: 360 은 카드가 실제 쓰는 `min-[360px]:` 경계, 640 은 전형·최악이 **둘 다** 117.3 인 유일한 구간.

⚠ **또 하나의 도구 함정**: Playwright **list 리포터는 통과한 테스트도 찍어서** 처음에 "전부 실패" 로 보였다. JSON 리포터로 바꿔 재판정했다.

게이트(내가 독립 확인): `tsc -b` 0 · 린트 **0 error** · vitest **1654건** · build ✓ · `bundle:budget` ✓(첫 화면 255.2/256 · CSS 31.2/32 — **상한을 올리지 않았다**. 여유가 얇다는 것은 경고로 남긴다).

#### 다음 배치로 넘긴 것(측정만 했고 고치지 않았다)
- 🔴 **입력칸 경계가 WCAG 1.4.11(3:1) 미달** — 경계 다크 1.25 / 라이트 1.58, 면 차이 라이트 **1.05**.
  `border-border-strong` 으로 올리면 라이트는 3.01~3.38 로 충족하지만 **다크는 2.46** 이라(입력 면이 지면보다 밝아 여유가 없다) 다크용 값을 따로 떠야 한다. **전 앱 폼이 한꺼번에 진해지는 변경**이라 눈으로 볼 수 있는 배치에서.
- `text-accent-300 hover:text-accent-200` **17곳**이 다크에서 hover 색 변화가 사라진다(두 상태가 같은 색). `:not(:hover)` 로 되살릴 수 있다.
- `CommunityTab:1147,1151` 의 `→` 가 `text-border-strong`(글자색으로 쓰임) → `text-ink-muted` 로.
- `.badge` 의 `leading-none` — 여러 줄 배지에 부적절하나 높이 변경 위험이 커 보류.

### 🔬 연결 감사 완료 — 에이전트 **90개**, 확정 **19건** / 반증 탈락 **22건**

문서 §8·§9·§10-4 의 코드 위험을 7개 영역으로 나눠 읽기 전용 조사 → **두 렌즈 적대적 반증**(재현되는가 / 정말 잘못인가, 불확실하면 기각) → 종합.
**탈락이 확정보다 많다** — 그게 이 감사의 신뢰도다. 전 항목 **정적 근거만**이고 브라우저·운영 DB 를 한 번도 안 건드렸다.

⚠ **감사가 내 기록 2건을 정정했다**(조사 중 코드가 바뀜): "홈 배너가 끝난 이벤트를 광고" 는 **이미 해소**(홈이 `evaluateEvent` 를 동적 import),
"손님 화면이 새 계약을 한 줄도 안 쓴다" 는 **절반만 남음**(`EventPage.canPlay` 하나). **다시 열지 말라**고 명시.

전체 계획서: `C:\Users\buffy\AppData\Local\Temp\claude\…\tasks\plan.md`(F1~F16 · 배치 순서 · DB 분리 · 회귀 · 보류).

### ✅ F1 + F2 완료 (`src/lib/regStatus.ts` — nuri-lead 직접)

4팀이 소비하는 **매칭 정본**이라 조정자가 쥐었다.

🔴 **F1 — 같은 데이터에도 결과가 달라졌다.** `buildRegInfoMap` 의 `map.set` 이 **충돌 가드 없이 조용히 덮어**,
메인+사이드 클락이 동시에 running 인 날(앱이 `<메인> 사이드N` 으로 제목을 스스로 만드는 **정상 형태**다)
메인 포스터의 배지와 홈 '지금 등록 가능' 이 **사이드 클락의 레지 상태**로 결정됐다.
누가 이기는지는 `getRunningClocks` 의 `order('updated_at', desc)` **배열 순서**에 달려 있었다.
→ **결정적 규칙**: 제목 정확 일치 > `gameSeq` 오름차순(메인=1 이 사이드를 이긴다).
⚠ '애매하면 둘 다 버린다' 는 **채택하지 않았다** — 포스터 1장 + 메인/사이드 클락이 **가장 흔한 형태**라 그 매장에서 라이브 표시가 통째로 사라진다.
⚠ **제목 검사를 개수보다 먼저** 하게 바꿨다 — 예전엔 `sameDay.length === 1` 조기 반환이 위에 있어
**1건짜리 스텁을 넘기는 호출(F4 의 상세 패널)에서 제목 비교가 아예 실행되지 않았다.**

🔴 **F2 — 없는 규칙을 마감이라고 단언했다.** `regCloseLevel` 미설정(0)이면 `num >= target` 이 `0 >= 0` 으로 참이 돼 **'이미 마감'** 이었다.
그래서 같은 대회를 화면마다 다르게 말했다 — 라이브 배지 없음 / browse '등록 마감' / 홈 목록 탈락 / 상세 '레지 마감'.
→ `target <= 0` 이면 **`null`(판정 불가)**. 소비처는 이미 `msLeft !== null` 로 갈라 놓아 **수정 없이 올바른 쪽으로 떨어진다**(네 소비처 전부 확인).

회귀 **+9건**(총 17). 감사 지정 ①②③④⑤ 를 포함: 포스터 2장 각자 매칭 · **포스터 1장 + 클락 2개** · **배열 순서를 뒤집어도 같은 결과** ·
제목 일치가 `gameSeq` 를 이김 · 미설정/빈 config → null · 정상 설정은 종전 그대로(과잉 차단 아님).

### ✅ F10 + F11 완료 (GTO)

`useHandBoard` 에 **마운트 뒤 외부 주입 진입점이 아예 없었다**(`init` 이 `useState` 초기화에서만 소비).
→ `setAll()` 신설, `onOpen` 이 `setSpot` 과 **같은 커밋에** `hb` 도 갈아끼운다.
전: A 를 보다 B 를 열면 **그리드=A · 리포트=B** 였고, 저장하면 **A 의 에퀴티가 영구 스냅샷에 박혔다**(공유 글은 사후 정정 불가).

F11 은 `++reqId.current` 가 **조기 반환 아래**에 있어 **무효 전환이 세대를 안 올렸다** → '분석하지 않았습니다' 옆에 **승률이 되살아났다**.
⚠ 더 큰 구멍을 함께 고쳤다 — `canonicalSpotKey` 가 **빌런을 의도적으로 제외**해서 ① 히어로→빌런 순서로 넣으면 **계산이 아예 안 되고**
② **빌런만 교체하면 이전 핸드 승률이 그대로 저장·공유**됐다. 키를 히어로·빌런·보드 3축으로 분리했다.
⚠ 감사가 미리 막은 오답도 그대로 지켜졌다 — `staleResponse` 의 owner 축을 `canonicalSpotKey` 로 두는 안은 **그 키에 빌런이 없어 무효**다.

### ✅ F13 + F15 완료 (커뮤니티)

`PostModeration` 은 `postsErr` 를 받도록 **이미 만들어져 있고 `LoadErrorCard` 분기까지 준비돼 있었는데 영원히 도달 불가**였다(배선 누락).
→ `AdminTab:1261` → props → `:148` 세 줄. ⚠ `onRetry` 를 함께 내려 **막다른 오류 카드**가 되지 않게 했다.
전: 조회 실패 세션에서 이 서브탭만 '관리할 게시글이 없습니다' 라고 단정(라벨 `count` 도 0 으로 거짓말).
후: 라벨 `(—)`, 필터 알약에서 개수 제거, 본문은 오류+재시도. **빈 상태도 '전체 0건' 과 '필터 때문에 0건' 으로 갈랐다.**

F15: 서버 응답 **전에** 성공 토스트 → 성공 시 **2회**, 실패 시 '삭제되었습니다' 뒤 2.4초 후 '실패했습니다'. 한 줄 삭제로 App 단일 토스트에 맡겼다.

⚠ **보고만 한 별건(더 큰 건)**: `deletePost` 가 **영향 행수를 안 본다.** PostgREST 는 RLS 가 막은 DELETE 를 오류가 아니라 **0행**으로 돌려주므로
권한 없는 운영자가 눌러도 **'삭제되었습니다'** 라고 말하고, 낙관적 갱신 때문에 화면에서도 사라진다.
이 저장소에 같은 부류 선례가 있다(`approveOwner` 의 `.select().single()`). 처방은 `.delete().select('id')` 후 0행이면 throw.

#### 이번 회차의 도구 함정 2건
- 함수 본문 추출에 `indexOf('\n}')` 를 쓰면 **구조분해 인자의 `}: { … }` 줄에 먼저 걸려** 본문을 통째로 놓친다(실제로 밟았다).
- 커뮤니티 팀이 **GTO 팀 편집 중에** 전체 테스트를 돌려 `gtoContract` 1건 실패를 보고했다 — 내가 재실행하니 **41/41 통과**. 일시적 충돌이었다.

게이트(내가 독립 확인): vitest **1705건 / 146파일 전부 통과**.
⚠ 번들 첫 화면이 **255.6~255.7 / 256KB**(여유 **0.3~0.4KB**)까지 찼다. 다음 배치는 여기부터 확인해야 한다.

### ✅ F14 + F12 완료 (매장) — 그리고 **`staleResponse` 가 아예 적용돼 있지 않았다**

**F14**: `getLedgerRange` 실패를 `.catch(() => {})` 로 삼켜 화면이 "최근 7일 장부 데이터가 없습니다"·이용권 **0장**·'오늘 게임' 표 소실을 말했다.
→ `rangeErr` + 좁은 `reloadRange()`. 네 곳이 **'—' + [다시 시도]** 로 갈린다.
⚠ **실패 판정을 '데이터 없음' 보다 앞에 뒀다** — 실패는 빈 값이라 뒤에 두면 **영원히 도달하지 못한다.**
⚠ **갱신 시각**: 예전엔 재조회가 실패해도 `setRefreshedAt(new Date())` 가 돌아 **낡은 값에 방금 시각이 붙었다.** 이제 실패하면 안 올린다.

**F12**: 칩의 ✓ 와 그 칩이 여는 판의 범위가 달랐다(1~4번은 오늘 메인 한 판, 5번만 날짜 단위 정산으로 승격).
→ 하루 범위로 맞추되 **조회 의존 위험을 두 겹으로** 막았다: F14 로 실패가 보이게 됐고, range 가 없으면 `every([])===true` 라 **예전대로 메인 기준으로 떨어진다**(✓ 가 조회 실패로 사라지지 않는다).
집계식을 새로 만들지 않고 표와 **같은 정본**(`ledgerCounts`/`buyinFinance`)을 공유한다. **KPI 밴드는 손대지 않았다**(감사 지시).

#### 🔴 §9-1 확인 결과 — 보호가 **없었다**
`VenueManageTab.tsx:782` 의 `<StoreDashboardM>` 에 **`key={venueId}` 가 없어** 매장 전환 시 언마운트되지 않고, reload 에 응답 가드도 없었다.
→ 만진 범위(range·loadErr·loading·refreshedAt)에 `ownerRef` + 세대 + `isStaleResponse` 를 걸어 **데이터·오류·로딩·갱신 시각이 같은 세대**가 됐다.
⚠ **남은 것(배정 필요)**: core 3종 포함 **setter 12개가 아직 무가드**다(`setSession`·`setBuyins`·`setPlayers`·`setClock`·`setVenueClocks`·`setWages`…).
**매장 A 응답이 B 화면에 숫자로 남을 수 있다.** `key={venueId}` 한 줄로 통째로 막는 방법도 있으나 그 파일은 다른 팀 것이다.

#### 이번에도 음성 대조가 한 번 거짓 통과할 뻔했다
`indexOf('if (!fresh()) return;')` 가 **위쪽 core 핸들러의 같은 문장**을 주워, 가드를 지워도 통과했다 →
완료부 `]).then(() => {` 직후 위치로 못박아 재현. (§5-B 때 내가 겪은 "앵커가 이웃을 친다" 와 같은 부류다.)
그리고 `StoreDashboard.tsx` 는 **CRLF** 라 `\n` 앵커가 0회 매칭됐다 — **파일마다 다르다는 정정이 실제로 작동했다.**

### 🔴 번들 임계 — 첫 화면 여유 **0.1KB**
`bundle:budget` 이 **255.9 / 256 KB gz**. 홈 팀이 지금 **임계 경로 파일**(`HomeTab`·`PosterCarousel`)을 편집 중이라 즉시 경고를 보냈다 —
**상한을 올리지 말고**, 늘 수밖에 없으면 **지연 로드로 뺄 것**을 먼저 보고 전후 KB 를 보고하라고 했다.
⚠ `bundle:budget` 이 **"dist 가 소스보다 낡았다"** 로 거부하는 것은 **다른 팀과 빌드가 겹친 신호**다 — 재빌드 후 다시 재야 한다.

게이트(내가 독립 확인): vitest **1705건 / 146파일 전부 통과**.

### 📌 모델 라우팅 보강 (오너 지시 2026-09-12) — **재발은 Fable 로 올린다**

> "한두번 진행된 오류는 fable5.1 적극 활용"

**한 번 고쳤는데 또 난 것**, 또는 **같은 부류가 두 번 이상 나온 것**은 `claude-opus-5` 로 다시 때리지 말고
**`claude-fable-5-1`** 로 올린다. 같은 등급으로 재시도하면 같은 방식으로 또 놓친다는 것이 이번 세션의 경험이다.
⚠ Fable 이 usage credits·추가 과금을 요구하면 **자동 동의하지 말고 멈추고 사용자에게 알린다.**

이 세션에서 **재발이 확인된 부류**(이후 이 목록에 해당하면 Fable):

| 부류 | 발생 이력 |
|---|---|
| **음성 대조 방법론** | **아홉 번** 틀렸다(앵커 이웃 침범 ×2 · 인코딩으로 복원 누락 ×2 · 낡은 dist · 리포터 오독 · CRLF/LF · 빌드 깨져 미수집 · 측정 순서) |
| **서버 오류 원문이 화면에 노출** | `dbError` 필터 → `throwRpc`(§5-B) → `setAppSetting`(§8-2). **세 번** |
| **늦은 응답이 남의 화면을 덮음**(`staleResponse` 미적용) | N01 캘린더·알림·이용권 → A04 `AuthContext` → **F14 `StoreDashboard`(setter 12개 아직 무가드)**. **세 번** |
| **`localStorage` 무가드 읽기 → 흰 화면** | `supabase.ts` A03-1 → `ThemeContext`. **두 번** |
| **쓰기 RPC 가 영향 행수를 안 봄**(RLS 거부가 '성공' 으로 보임) | `approveOwner` → **`deletePost`(F15 에서 보고, 미수정)**. **두 번** |
| **한 카드의 절반만 고침** | §7 P0-A ToolsPanel — 1차가 배지 행만 고치고 설명 열은 "재지 않았으므로" 안 고쳤다가 200%에서 재발 |
| **클락↔포스터 매칭** | F1 과 F4 가 같은 뿌리(느슨한 매칭). F1 은 고쳤고 F4 진행 중 |

### ✅ F4 + 매장 세대 가드 완료 — **내 지시 두 가지를 근거를 대고 바꿨고, 둘 다 옳다**

**F4**: 스텁 트릭을 버리고 `pickLiveClock(clocks, schedules)` 순수 함수로. 후보 판정은 `matchClockScheduleDetailed` 단일 소스에 맡기고 **승자만** 사전식 키로 고른다.

⚠ **내 지시는 "running → gameSeq → 제목(타이브레이크)" 였는데 "running → 제목 → gameSeq" 로 바꿨다.** 근거가 정확하다 —
회귀 ⑥ 이 *"패널이 고른 클락 = App 이 매칭한 클락"* 인데 **App 은 `확신도(title) > gameSeq`** 로 고른다(내가 방금 고친 `regStatus.ts`).
제목을 뒤로 두면 `제목 일치 seq2` vs `불일치 seq1` 에서 **두 화면이 갈린다.**
`running` 을 맨 앞에 둔 것도 근거가 있다 — App 은 `getRunningClocks()`(running 만)를 받고 패널은 `getVenueClocks()`(정지 포함)를 받으므로
**running 을 앞에 둬야 두 쪽 후보 집합이 맞춰진다.** 제목은 **랭킹 키일 뿐 필터가 아니라** 한 글자 달라도 탈락하지 않는다(테스트로 잠금).

전후: `[사이드(seq2,running), 메인(seq1,running)]` → 전 **사이드**(배열 순서) / 후 **메인** · `[정지(seq1), 라이브(seq3)]` → 전 **정지된 게임의 블라인드·PLAYERS** / 후 라이브.

**세대 가드**: ①(`key={venueId}`) 대신 **②(setter 전수 가드)** 를 골랐다. ⚠ 근거가 내 제시안보다 낫다 —
`key` 는 **매장 축만** 막는데 실제 stomping 은 **realtime 버스트로 같은 매장에 reload 가 겹칠 때**도 난다
(`subscribeLedger/Clock/BuyinRequests/StaffSchedule` 넷이 전부 `reload` 를 부른다). **KST 날짜 전환도 못 막는다.**
게다가 전환마다 전체 재마운트인데 `reload` 는 이미 `[venueId, d]` 로 재실행돼 **얻는 게 없다.**

`guard()` 를 **17곳**(성공 + `catch`)에 적용. 낡은 실패는 `ok=false` 도 못 건드린다(= **남의 매장 실패가 이 화면의 갱신 시각을 막지 않는다**).
세대가 없던 1회성 로드 3종에도 `ownerOnly`. 오류·로딩·`refreshedAt` 전부 같은 세대.

⚠ **빠진 setter 가 없음을 '열거' 가 아니라 '잔여물 0' 으로 보장했다** — 계약이 `guard( … )` 인자를 괄호 균형으로 지운 뒤
남는 setter 목록이 **정확히 4자리(전부 자기 줄에서 `fresh()` 를 명시 검사)** 여야 한다고 못박는다. **무가드 setter 를 새로 추가하면 목록이 달라져 깨진다.**

#### ⚠ 음성 대조가 **열 번째로** 틀릴 뻔했다 (이번엔 스스로 잡았다)
N1 이 통과했다 — **호출부만 되돌렸는데 단위 테스트가 `pickLiveClock` 을 직접 import 해서**
**쓰이지도 않는 함수를 검증**하고 있었다. 배선 앵커 테스트를 추가하고 N1a/N1b 로 쪼개 재현했다.
**원칙 ③('그 줄 때문에 터졌는지')의 실물**이다 — 함수는 맞는데 **아무도 안 부르는** 경우.

게이트: `tsc -b` 0 · 린트 내 4파일 **0 error/0 warning** · vitest **1742건 / 147파일** · build ✓ · 첫 화면 **255.7/256KB**(상한 그대로).
⚠ 첫 빌드가 `HomeTab.tsx TS6133`(홈 팀 작업 중)으로 죽었다 — 재실행 때 통과. **그 파일이 다시 깨지면 빌드가 막힌다.**

### ✅ F6 + F7 완료 — 이벤트 판정 연결

**F6**: `canPlay = !!user && tickets > 0` → **`av.canJoin`**(`evaluateEvent`). 보드→입력 매핑은 홈의 `remainCardsOf`/`totalCardsOf` 를 그대로 복제.
전: `status='ended'` + 참여권 3장에서 **타일이 활성**이고 히어로 3분기가 전부 비껴가 **아무 안내도 없었다** → 눌러서 '찢기' 까지 간 뒤 서버가 거절.
후: 타일 `disabled` + **"종료된 행사입니다. 받으신 이용권과 사용 이력은 그대로 남아 있습니다"**.

⚠ **e2e 셀렉터를 글자 그대로 보존**했다 — `'로그인하고 참여하기'` 와 `/모두 열렸어요/` 를 `blockedReason` 으로 **갈아끼우지 않고**,
같은 커밋에서 `data-testid` 를 달고 **새 회귀가 두 문구의 존재를 잠근다**. 게이트를 느슨하게 푸는 대신 계약을 이중으로 건 형태다.

**F7**: `noteServerTime(r[0].createdAt)` **제거**. 목록이 `createdAt desc` 라 `r[0]` 은 **항상 과거**여서
관리자 화면의 '지금' 이 그 캠페인의 나이만큼 뒤로 밀렸고, 홈이 같은 `eventNow()` 를 쓰게 되면서 **손님 화면 판정까지 오염**됐다.
⚠ 서버 값 공급 대신 **제거**를 택한 근거: `admin_list_event_campaigns` 응답에 `now()` 가 없고, 실으려면 **마이그레이션이 필요**하다(운영 DB).
자리에 "되살리려면 근거는 응답 `Date` 헤더 또는 RPC 가 싣는 `now()` 여야 한다" 는 주석을 남겼다.
가드는 **부호가 아니라 크기**(`MAX_CLOCK_SKEW_MS = 24h`)로 잘랐다 — ⚠ **음성 대조 N4 가 그 이유를 증명한다**:
가드를 '음수 거절' 로 바꾸니 **기존 '기기 시계 3시간 빠름' 테스트까지 실패**했다.

회귀 +7건(`eventVisibility.test.ts` 41건). 음성 대조 4종 전부 **의도한 것만** 실패, 복원 해시 일치.
번들: **내 변경분 0** — 엔트리 청크 12개에서 새 식별자가 **0건**임을 확인(전부 lazy `EventPage` 5.1→5.4KB 와 공유 `eventState` 1.2KB 에 있다).

#### 남는 것(오너 결정 후보 — NEEDS_USER 급은 아니다)
서버 '지금' 공급 경로가 없다. RPC 에 `now()` 를 싣거나(마이그레이션) 응답 `Date` 헤더를 읽어야 하는데
`supabase.rpc` 는 헤더를 주지 않는다. 그래서 `isServerTimeKnown()` 은 **현재 항상 false** 이고 **호출부 0곳이라 화면 영향은 없다.**
`nextBoundaryMs` 로 열린 화면이 종료 시각에 스스로 재판정하는 타이머도 넣지 않았다(최소 수정 유지).

#### 또 일시적 충돌 (세 번째)
커뮤니티 팀이 **매장 팀 편집 중**에 전체 테스트를 돌려 `scheduleFormat.test.ts` 1건 실패를 보고했다 —
내가 재실행하니 **20/20 통과**였고, 매장 팀이 이미 URL 리터럴 예외를 넣어 뒀다.
⚠ **병렬 배치에서 전체 vitest 를 돌린 결과는 그 시점의 스냅샷일 뿐이다** — 남의 파일 실패는 **조정자가 재확인**한다.

게이트(내가 독립 확인): vitest **1742건 / 147파일 전부 통과**.

### ✅ F3 + F5 + 홈 오류 배선 완료 (`App.tsx`·`HomeTab.tsx`)

**F3**: **now 만** 갈아끼운다 — `regNow` state + 30초 틱, `buildRegInfoMap(liveClocks, schedules, regNow)`.
진단대로 **낡은 것은 클락 데이터가 아니라 memo 의 now** 였다. 절대 마감시각(ISO) 안은 채택하지 않았고,
그쪽으로 되돌아가면 터지도록 회귀 ⑤ 를 넣었다(**일시정지 클락은 now 가 3시간 흘러도 값이 같아야 한다**).
틱은 `activeTab !== 'home'` 이면 아예 안 걸리고, 걸린 뒤에도 첫 문장이 `if (document.hidden) return;` 이다.
⚠ §5-B 의 `missedTick` 이 **여기는 필요 없다** — now 는 누적값이 아니라 '지금 몇 시냐' 하나라 복귀에 한 번 읽으면 최신이다(근거를 대고 패턴을 그대로 복사하지 않았다).

⚠ **계약 테스트를 '숫자만 올리지 않고' 승격했다**: "`setInterval` 은 정확히 하나" →
**"`App.tsx` 의 모든 `setInterval` 은 첫 문장이 `document.hidden` 게이트다"**.
원래 지키려던 것이 개수가 아니라 **'게이트 없는 주기 작업 금지'** 였고, 새 형태가 **더 강하다**(세 번째 타이머를 게이트 없이 달면 개수를 안 세도 걸린다).

**F5**: `refreshClocks` 정본 하나가 **같은 응답에서** `setLiveCount` 와 `setLiveClocks` 를 함께 쓴다. `changeTab` 이 라이브 진입에서 부른다.
구독 승격은 하지 않았고(전역 구독 금지), 회귀 ⑯ 은 `IS_MOCK` 에서 양쪽 0 이라 **e2e 로는 원리적으로 못 잡아** 단위 계약으로 대체했다.
기존 `perf/smoke/tabbar-autohide` 의 배지 정규식은 **손대지 않았다**.

**§11 조회 실패**: 홈이 로딩 / **실패** / 진짜 빈 상태 **세 갈래**가 됐다. 상단도 실패 때는 "오늘 대회 정보를 불러오지 못했어요" 로 바뀌고 '지금 등록 가능 N' 을 **아예 적지 않는다**.
**커뮤니티 실제 글**: 예산을 먼저 확보한 뒤 넣었고, 실패면 **섹션을 통째로 생략**한다(가짜 채움 없음). 화면 **맨 아래**에 뒀다 — 게시글은 유휴에 도착하므로 위에 끼우면 **도착 순간 아래가 밀린다**.

#### 번들 — 초과를 **갚아서** 맞췄다
착수 255.9 → 중간 **256.1(0.1 초과)** → `api/events` 를 entry 밖으로 255.5 → 커뮤니티 섹션까지 255.7 → 최종 **255.8 / 256 ✓**.
⚠ **상한을 올리지 않았다.** 원인을 빌드 산출물에서 실측했다 — `api/events` 안의 **이벤트 화면 전용 `TIER_META`·`oddsRows` 가 entry 청크에 실려 있었다**.
slug 상수만 `src/lib/eventSlug.ts` 로 떼고(`api/events` 가 재수출해 **기존 임포트 무수정**), `HomeTab` 이 `getEventBoard` 를 동적 import 로. 순 **−0.6KB**.

### 🔴 e2e 6건 실패는 **회귀가 아니라 테스트가 포트에 묶여 있던 것**이었다 (내가 고쳤다)

`e2e/post-detail-read.spec.ts` 가 `http://localhost:4173` 을 **하드코딩**했다(`POSTER` 상수 + 로컬 판정).
그래서 **다른 포트로 돌리면 앱 자신의 JS·CSS 까지 `[]` 로 응답**해 부팅이 통째로 막히고,
6건이 전부 "커뮤니티 하위탭 바가 없다" 로 무더기 실패한다. ⚠ **병렬 배치는 팀마다 포트를 나눠 쓰므로 반드시 터진다.**
→ `baseURL` 에서 origin 을 뽑게 고쳤다. 다른 포트(4201)에서 **6/6 통과** 확인.

⚠ 이걸로 **연쇄 오판이 설명된다** — 홈 팀이 전량 e2e 를 4192 에서 돌려 "6건 실패, 커뮤니티 팀 작업 중" 으로 보고했고,
나도 그 말을 받아 적을 뻔했다. **남의 파일 실패는 조정자가 재확인한다**는 원칙이 여기서 값을 했다.

게이트(내가 독립 확인): `tsc -b` 0 · vitest **1742건** · build ✓ · `post-detail-read` **6/6**.
⚠ 남은 e2e 실패 1건은 `auth-smoke` — 홈 팀이 404 의 정체를 프로브로 떠서 **`POST /rest/v1/rpc/community_ads_public`**(운영 미적용 RPC, `BLOCKED.md`)로 확정했다.

### ✅ 재발 스윕 완료 (Fable) — "쓰기가 실패했는데 화면이 '성공' 이라고 말한다" **전수**

오너 지시("한두번 진행된 오류는 Fable 적극 활용")로 배정한 첫 건. `approveOwner` 에서 한 번 고쳤는데 `deletePost` 에서 또 나온 부류다.

**전수 결과**: `src/api/**` 의 `.update(`/`.delete(` **88건**.

| 판정 | 건수 |
|---|---|
| 이미 확인 중(선례) | 8 |
| **고침**(성공 토스트 또는 낙관적·사후 로컬 갱신 → 사용자가 거짓을 믿는다) | **69** |
| 확인 불필요(**사유와 함께 허용 목록 고정**) | 11 |

⚠ **`.insert(`·`.upsert(`·`rpc(` 는 범위 밖으로 판정**했다 — INSERT 는 RLS WITH CHECK 위반이 **42501 오류**로 오고
upsert 의 ON CONFLICT DO UPDATE 도 Postgres 가 오류를 낸다. **조용한 0행이 없다.** 근거를 계약 테스트 머리말에 적었다.

#### 🔴 `.select('id')` 를 쓰지 않은 이유 — 이게 핵심 발견이다
복합키 테이블(`clock_states`·`staff_wage`·`venue_follows`·`post_reactions` …)에 `id` 가 없으면
**`RETURNING id` 가 42703 으로 쓰기 자체를 롤백시켜 기능이 죽는다.**
그래서 `mustAffect(builder)` 는 무인자 `.select()` 를 쓴다. **선례를 기계적으로 복사했으면 기능을 깨뜨렸을 자리다.**
원 오류를 그대로 던져도 안전한 근거도 확인했다 — 설치된 postgrest-js 의 `PostgrestError extends Error` 라
호출부의 `e instanceof Error` 분기가 종전과 동일하다. **반환 형태 무변경**(전부 `Promise<void>`).

#### 드러난 기존 거짓 2건
- `closeLedgerSession`·`setRegistrationClosed` — `getLedgerSession` 이 행이 없으면 **빈 세션을 합성**해서,
  **장부를 열기 전에도 '마감했습니다' 라고 말하고 있었다.** 이제 문장으로 드러난다.
- `rankverify` — **신분증은 이미 지웠는데 상태만 pending 으로 남던** 경로.

#### 호출부 영향
`App.tsx` 의 11곳은 **열지 말라고 해서 확인만** 했다 — 전부 `.catch → 고정 문구 + reload` 구조라 **던지기만 하면 화면이 서버 상태로 되돌아간다**
(F15 의 "화면에서 사라짐" 이 여기서 회복된다). ⚠ 다만 그 토스트가 고정 문구라 **"권한 없음" 을 말하지 못한다** — 후속 배정 대상.
직접 고친 호출부 7곳: `GroupPage`(catch 가 없어 **unhandled rejection** 이던 2곳), `VenuePage`(삼킴), `PostDetailModal`(낙관적 반응을 **스냅샷으로 되돌리기** 추가), `DealerShiftsModal`, `LeaguePanel` 2곳, `DraggableList`(조용한 롤백에 오류 표시).

#### 재발 방지 계약 — `mutationAffected.contract.test.ts`
전수 스캔(88건 발견, **하한 80/70 으로 공허 통과 차단**) → 각 변이가 `mustAffect` 통로 / 명시 검사 / **사유 있는 `ALLOW`** 중 하나여야 한다.
`ALLOW` 는 `파일::함수::연산:테이블` 키로 **위치·개수까지 정확 일치**(빠져도, 늘어도 실패).
`./_mustAffect` 에서 import 해야 한다는 것까지 못박아 **동명 빈 함수 우회**를 막았다.
⚠ **못 막는 것도 적었다**: 정규형이라 "던지는 게 실제로 도달하는지, 호출부가 그 throw 를 받아 화면을 되돌리는지" 는 못 본다 →
도달은 전용 테스트 3종이 보고(`approveOwner.test.ts` 와 같은 **`.select()` 를 타야만 0행이 드러나는 mock**), **호출부 되돌리기는 사람 리뷰 몫**이다.

음성 대조 3종(옛 형태 복원 → **6 실패** / 통로의 0행 검사 제거 → **11 실패** / 확인 없는 새 변이 추가 → **정확히 1 실패**), 복원 해시 전부 동일.
⚠ **편집한 31개 파일 전부 원래 줄바꿈(CRLF/LF)과 BOM 3개를 보존**했다 — 내가 정정한 "파일마다 다르다" 가 지켜졌다.

게이트(내가 독립 확인): `tsc -b` 0 · 린트 **0 error** · vitest **1766건 / 150파일** · build ✓ · 번들 예산 ✓ ·
**`public/sitemap.xml` 해시 `6130e085…` 그대로**(사용자 작업 중 파일 — Fable 이 `gen-sitemap` 을 피해 별도 outDir 로 빌드했다).

#### 남긴 것(범위 밖 판단, 후속 후보)
`VenuePage.tsx:1402`·`PosterFormModal.tsx:292` 가 **프라미스 settle 전에 성공 토스트**를 띄운다(F15 와 같은 부류) ·
`NuriPosLedger.tsx:1721` PlayerEditModal 이 **실패해도 닫힌다**(`savePlayer` 가 rethrow 안 함).

### ✅ F8 + F9 마이그레이션 **초안** 완료 (nuri-lead 직접) — ⚠ **적용하지 않았다**

`supabase db push` 실행 0 · 운영 DB 쓰기 0. 두 파일 다 헤더에 "오너 승인 대기" 를 명시했다.

#### 먼저 — `nuri-migration` **스킬 문서에도 같은 오류가 있었다**
스킬이 *"`CREATE OR REPLACE FUNCTION` 은 ACL 을 초기화한다"* 고 적고 있었다. **사실과 반대**다(2026-09-12 실측).
마이그레이션 절차의 **정본**이라 `CLAUDE.md` 와 같은 정정을 넣었다 — 특히 **"이 차이 때문에 ACL 자가검사가 거짓 통과하므로 음성 대조는 `DROP` 후 적용해야 한다"** 를 함께.

#### 🔴 F8 — 감사는 4건이라 했는데 **5건**이다
전수 스캔(정의 함수 233개)에서 **최종 정의가 NULL-unsafe 인 것 5개**:
`admin_grant_points` · `admin_grant_voucher_quota` · `admin_point_summary` · `admin_shout_refunds` · `hide_shout`.
⚠ 감사는 `admin_grant_voucher_quota` 를 *"2026-08-20 스윕이 이미 고쳤을 것"* 으로 **추론해서 뺐고, 실측이 아니라고 스스로 밝혔다.**
그 스윕은 1회성 DO 루프라 **그 이후 파일에는 닿지 않는다.** 포함했다.

⚠ **내 1차 스캔은 9건이었고 4건이 오탐**이었다 — 함수 경계를 넘어 읽었고,
**`coalesce(my_role()::text,'') <> 'admin'` 은 NULL-safe 인데** 잡았다. `$$` 로 본문을 정확히 잘라 다시 셌다.

**손으로 정의를 옮겨 적지 않았다.** 라이브가 저장소와 다를 수 있고(`20260830d` 머리말에 **라이브 전용 핫픽스** 전례가 있다),
그러면 저장소 텍스트를 다시 심는 순간 **그 핫픽스를 조용히 되돌린다.**
→ **라이브의 `pg_get_functiondef` 를 읽어 비교 연산자 하나만 바꿔 다시 심는다.** 본문·시그니처·`SECURITY DEFINER`·`search_path` 는 원본 보존.

격리 컨테이너 실측: 미리보기 **대상 3건** 정확히 식별(이미 `is distinct from` 인 것과 **`coalesce` 로 안전한 것은 건너뜀**) ·
교체 후 **`my_role()` 이 NULL 인데 가드가 막는다**(전에는 통과) · ACL `anon=false` 유지 ·
**음성 대조: 하나를 다시 `<>` 로 되돌리면 자가검사가 잡는다.**
자가검사는 **저장소 grep 이 아니라 라이브 `pg_proc`** 를 본다(grep 으로 만들면 2026-08-20 이전 파일 13곳이 오탐이고, 옛 파일 재적용 시 무관한 마이그레이션까지 죽인다).

#### 🔴 F9 — 마이그레이션 주석이 **거짓이었다**
`20260911d:92` 가 *"클라이언트는 이 컬럼을 쓰기만 하고 읽지 않는다"* 라고 적었는데
**`fetchPostSpot` 이 실제로 `analysis` 를 select 하고 있었다.** 다만 **화면에서 쓰는 곳은 없었다**(전수 확인).

그래서 문서가 요구한 **호환 순서**를 그대로 쓸 수 있었다:
**① 클라이언트가 먼저 안 읽게**(`src/api/spots.ts` — select·타입·반환에서 제거. **쓰기 경로는 그대로라 값은 보존**) →
② 그 앱이 배포된 뒤 DB 회수. ⚠ **반대 순서면 구버전 앱이 `null` 을 받아 전 글에서 스팟 카드가 조용히 사라진다.**

⚠ **값을 지우지 않았다** — `analysis` 의 존재 이유가 '엔진이 바뀌어도 옛 글의 결론이 변하지 않는다' 라 지우면 되돌릴 값이 없다. **공개 GRANT 에서만 뺐다.**

자가검사가 **양방향**을 본다 — 격리 컨테이너에서 둘 다 확인:
`analysis` 를 다시 열면 **잡고**, 화이트리스트를 너무 좁혀 `spot` 을 빼도 **잡는다**(그쪽이 카드가 사라지는 방향이다).

게이트: `tsc -b` 0 · 린트 **0 error** · vitest **1781건 / 152파일** · 컨테이너 정리 완료(사용자 `supabase_*` 외 0개).

### 🔬 대규모 독립 검증 결과 — 우선순위 1 **PASS**, FAIL 3건

#### ✅ 가장 큰 걱정이 기우였음이 실측으로 밝혀졌다
내가 "`mustAffect` 의 `.select()` 때문에 **SELECT 를 막는 테이블에서 쓰기가 통째로 죽을 수 있다**" 고 걱정했는데,
검증자가 postgres 16 + **PostgREST v16.2** 를 띄워 4조건을 실측했다:

**PostgREST 의 `.update().eq()` 는 WHERE 가 테이블 컬럼을 참조하므로 `RETURNING` 이 없어도 SELECT 정책이 이미 적용된다.**
즉 "SELECT 는 막고 UPDATE 는 허용" 인 테이블의 쓰기는 **이번 변경 이전부터 이미 0행**이었고, `.select()` 는 **그 거짓을 드러낼 뿐**이다.

⚠ **유일한 회귀 기제는 컬럼 수준 GRANT** 다 — `RETURNING *` 이 42501 로 롤백된다.
저장소 전수: `post_spots`(클라 변이 0건) · `point_purchases`(변이 대상 밖) · 주석 처리된 블록 하나. **현재 죽는 기능 없음.**
⚠ 하필 내 `20260913b` 가 `post_spots` 컬럼 grant 를 더 좁힌다 — **나중에 누가 클라 UPDATE 를 붙이면 그 쓰기가 죽는다.** 주석 보강 필요.

허용 목록 11건도 **반례 없음**(두 곳 다 `FOR ALL` 단일 정책이라 update 차단 ⟺ insert 차단).
계약 테스트 변조 7종 **전부 올바른 단언에서** 실패. `ON CONFLICT DO NOTHING` 은 조용한 0행이 맞지만 **의도된 "중복 무시"** 라 결함 아님(문장만 과하다).

#### 🔴 FAIL ① — **스윕이 고치려던 거짓을 반대 방향으로 새로 만들었다**
멱등 토글에서 **켜는 쪽은 관대한데 끄는 쪽만 엄격**해졌다:
`calendar.ts` 찜(`upsert` 관대 ↔ `delete` 엄격) · `unfollowVenue`(`23505` 무시 ↔ `mustAffect`) · `removeReaction`.
→ 되돌림이 **서버와 반대**를 그린다: **찜 해제 실패 시 하트가 '찜함' 으로 켜진다. 서버엔 찜이 없다.**
팔로우는 **"처리에 실패했습니다" + 팔로우 중 + 팔로워 수 +1**. → **Fable 재배정**(대칭화: 0행은 "이미 그 상태" 로 흡수, **오류는 그대로 던진다**).

#### 🔴 FAIL ② — F2 를 **한 벌만 고쳤다**("한 카드의 절반만 고침" 재발)
`msToRegClose` 복제본이 **셋**인데 `lib/regStatus.ts` 하나만 고쳤다.
`TournamentClock.tsx:65` 는 가드도 없고 **호출부(`:808`)도 무가드**라, `regCloseLevel` 미설정이면
**클락 TV 송출 화면이 모든 대회에 '마감' 을 띄운다.** F2 선언("이제 화면들이 일치한다")이 **네 번째 화면에서 깨진다.** → **Fable 재배정**.

#### 🔴 FAIL ③ — 내 마이그레이션 `20260913a` 의 **정규식이 문자열·주석을 오염**시켰다 (내가 고쳤다)
`my_role()\s*(<>|!=)` 를 **전역 치환**해서 **주석 안**·**문자열 리터럴 안**·**동적 SQL 안**의 같은 문구까지 바꿨다.
⚠ 그리고 **자가검사가 같은 정규식**이라 문자열만 바꿔 놓고도 **통과**했다.
⚠ 이 저장소는 실제로 그 문구를 **ABORT 메시지 문자열로 적는다**(`20260912c:724`·`20260912d:456`) — 라이브에 있으면 밟는다.

→ **`if` 조건문 문맥으로 좁혔다**(`\mif\M[^;]*?my_role\(\)…`). 바뀐 줄을 `raise notice` 로 **사람이 보게** 남겼다.
⚠ **자가검사도 같은 문맥으로 좁혀야 했다** — 안 그러면 보존해야 할 주석·문자열을 결함으로 잡아 **정상 적용을 막는다**(실제로 그렇게 실패했다).

검증자의 **적대적 함수 6종**을 그대로 재현해 확인: 오버로드 2개 포함 **6/6 safe** · **주석 보존 ✓ · 문자열 리터럴 보존 ✓** ·
기본값·`SECURITY DEFINER`·`search_path` 보존 · `coalesce` 안전형 건너뜀 ·
음성 대조 **양방향**(가드 회귀는 **잡고**, 주석만 있는 것은 **통과시킨다** — 과잉 차단 없음).

#### 검증자가 독립 재현해 준 것
`20260913b` 호환 순서 — **"DB 먼저면 전 글에서 카드가 사라진다" 가 사실**이다(PostgREST 로 42501/401 실측 → `fetchPostSpot` 이 `null` 반환).
F8 **대상 5건**도 자기 파서로 독립 재현해 **같은 5개**(감사의 4건이 틀렸다). ACL 자가검사도 `DROP` 후 적용으로 음성 대조 통과.
F1 순서 무관성(6가지 순열 ×2) · F6 문구 보존 · F16 원자성(`shareSpotPost` 1회, 취소 시 글 0) · StoreDashboard 잔여물 0 — **전부 PASS**.

#### 검증자가 **확인하지 못한 것**(그대로 남긴다)
전체 E2E 미실행(⚠ **`E2E_BASE_URL` 없이 `npm run test:e2e` 를 돌리면 webServer 의 build 가 `public/sitemap.xml` 을 덮어쓴다** — 보호 파일과 충돌) ·
`build`/`lint`/`bundle:budget` 미실행(첫 화면 255.8 주장은 **내가 따로 확인했다**) ·
**운영 DB 미조회**(`20260913a` 의 정규식 위험은 **라이브 정의를 봐야 확정**된다) · FAIL ① 을 실브라우저로 재현하지 않음(정적 추적).

### ✅ 검증 FAIL ①② 해결 (Fable) — 연결 감사 **전량 종료**

#### ① 멱등 OFF 를 **대칭화**했다 — 허용 목록으로 도망가지 않았다
`_mustAffect.ts` 에 **별도 통로** `idempotentOff(q)` 를 뒀다: `error` 는 **객체 그대로 던지고**(권한 거부는 여전히 드러난다),
**0행만** "이미 그 상태" 로 흡수한다. 네 사용처 모두 `user_id = 본인 uid` 필터라 **본인 행의 0행은 부재이지 거부가 아니다.**

⚠ **허용 목록이 아니다** — `IDEMPOTENT_OFF` 레지스트리를 따로 두고 계약이 네 겹으로 잠근다:
사용처 **정확 일치**(늘어도·빠져도 실패) · 사유에 적힌 **'켜기 = 함수명' 이 같은 파일에 실재하고 `upsert` 또는 `23505` 를 쓰는지 코드로 확인** ·
**'본인 행' 근거 문구 필수** · 통로 본문에 `NoRowsAffectedError` 가 없는지까지.

**전수에서 네 번째를 찾았다** — `blocks.ts unblockUser`. 안 고쳤으면 `BlockContext` 가 throw 를 받아
**'해제 실패' 를 띄우면서 차단이 그대로 남았을** 것이다(내가 지목한 셋에는 없었다).

🔴 **기존 테스트가 틀린 동작을 잠그고 있었다** — `community.deletePost.test.ts:88` 이 *"unfollowVenue 0행이면 던진다"* 를 단언했다.
뒤집고 **"error 는 던진다" 짝 테스트**를 추가했다. **계약이 틀린 방향을 지키고 있으면 고치는 것이 맞다.**

⚠ **의도적으로 남긴 비대칭**: `staff_schedule`·`staff_wage` 는 **매장 행(본인 행이 아니다)** 이라 0행이 **실제 RLS 거부일 수 있고**,
낙관적 반전이 없어 반대 방향 거짓이 안 생긴다. 계약 주석에 사유를 적었다 — 오너가 달리 판단하면 레지스트리에 짝을 적으면 된다.

`App.tsx:1761` 의 `reloadComments` 도 그 한 줄만 고쳤다(`.catch(() => {})` → 토스트). **형제 11곳 중 유일하게 삼키던 것**이다.

#### ② `msToRegClose` 복제본 **셋 → 하나**
`ClockDisplay.tsx:48-55`·`TournamentClock.tsx:65-76` 의 로컬 구현을 **삭제**하고 `lib/regStatus` 를 import 한다.
**TV 클락이 이제 말하는 것**: `regCloseLevel` 미설정 → `null` → 레지 마감 칸 **'—'**. 설정된 대회는 종전대로.
**네 화면이 드디어 일치한다.**
⚠ 임포트 방향을 지켰다 — `regStatus.ts` 는 `./clockLevel` 에서만 값을 가져오고 `../api/clock` 은 `import type` 이다
(`api/clock` 에서 가져오면 **업주 전용 장부 청크가 첫 화면 임계 경로로 딸려 온다**). **계약으로 잠갔다.**
**복제 금지 계약** 신설(`regStatus.contract.test.ts`): 정의가 `lib/regStatus.ts` **1회뿐** · 두 소비처의 import·3인자 배선 앵커(옛 2인자 **0회**) · null→'—' 렌더 분기.

음성 대조 7종 전부 의도한 테스트만 실패, 앵커 1회 매칭 강제(스킵 0), CRLF 3파일은 CR=LF 개수·BOM 확인.
게이트(내가 독립 확인): `tsc -b` 0 · 린트 **0 error** · vitest **1812건 / 154파일** · build ✓ · 번들 **255.8/256 변화 없음** · `sitemap.xml` 해시 그대로.

#### 남긴 것(범위 밖)
`msToNextBreak`·`levelNumberAt` 도 두 클락 파일에 **시그니처가 다른 복제본**으로 남아 있다(같은 부류, 다음 후보).
`_mustAffect.ts` 와 관련 테스트들은 아직 **untracked** 다 — 커밋할 때 `git add` 가 필요하다(이 세션은 커밋하지 않는다).

### ✅ 재검증 후속 — 계약 구멍 A5·B2b 를 닫았다 (2026-09-13, nuri-lead 직접)

독립 재검증이 남긴 "사소한 계약 구멍" 둘. 둘 다 **통과하고 있었지만 아무것도 보고 있지 않았다** — 이게 더 위험하다.

#### A5 — `IDEMPOTENT_OFF` 가 "짝" 과 "본인 행" 을 **주장만 받고 검증하지 않았다**
예전 계약은 짝 함수가 **관대한지**(`upsert` / `23505`)만 봤다. 그래서 둘 다 통과했다:
- 짝이 **다른 테이블**을 upsert 해도 통과 — "이 끄기의 짝" 이라는 주장 자체가 검증되지 않았다.
- `본인 행` 은 사유 산문에 **그 네 글자가 있기만 하면** 통과 — 남의 행·매장 행을 `idempotentOff` 로 지우면
  RLS 거부가 0행으로 위장해 "지웠다" 고 말하는데, **그게 이 통로의 유일한 위험**인데도 보지 않았다.

이제 셋 다 **코드로** 본다: ① 짝이 **같은 테이블**(`.from('<테이블>')`)을 건드리는가 ② 선언한 컬럼이 끄는 쪽 문장의
`.eq('<컬럼>', …)` 로 실재하는가 ③ **그 컬럼이 세션 사용자 값과 비교되는가**(`currentUser()` / `auth.getUser()` 에서
나온 식별자만 인정 — 관용구 3종을 화이트리스트로 두어 조용히 넓어지지 않게 했다).
사유 문구도 `본인 행(user_id)` 처럼 **기계가 읽는 선언**으로 바꿨다.

⚠ 그 과정에서 **정규식을 템플릿으로 조립하다 이스케이프가 한 겹 깎여** `Invalid regular expression` 이 났다.
더 나쁜 경우엔 **조용히 무엇이든 매치하는 패턴**이 되어 계약이 공허해졌을 것이다 —
테이블·컬럼 이름을 패턴에 끼워 넣는 대신 **문자열 포함 검사**(`hasCall`)로 바꿔 이 부류를 원천 차단했다.

**음성 대조 3종 — 전부 뒤집혔다**(각각 정확히 1건만 실패):
`N1` 짝을 다른 테이블 함수로 교체 → 같은-테이블 테스트 실패 ·
`N2` 선언 컬럼을 문장엔 있지만 세션 값이 아닌 것으로 교체 → 세션-값 테스트 실패 ·
`N3` `calendar.ts` 에서 `.eq('user_id', uid)` 제거 → 세션-값 테스트 실패.
두 파일 모두 sha256 **바이트 단위 원복 확인**.

⚠ **첫 시도에서 음성 대조 스크립트가 `npx` 를 못 찾고 원복 전에 죽어 변형이 파일에 남았다.**
바로 잡아 되돌렸지만(해시 일치 확인), 이 저장소에서 **패치 누적 사고가 났던 그 형태**다 — 이후엔 `trap` 으로 원복을 보장했다.

#### B2b — 이름을 바꾼 복제본은 **정규식으로 판정 불가**다. 방향을 바꿨다
`msToRegClose` 복제 금지 계약은 **이름**만 본다. `regCloseMs` 같은 다른 이름으로 같은 계산을 다시 쓰면 못 잡는다.
지문으로 잡아 보려고 **두 가지를 실측했고 둘 다 실패했다**:
- `regCloseLevel` 과 `60_000` 의 **±400자 근접** → `regStatus.ts` 밖에서 이미 3곳이 참(`api/clock.ts`·`LiveGamesTab`·`ScheduleDetailModal`)
- **같은 최상위 스코프** → `LiveCard`(8.6KB)·`LiveClockPanel`(5.7KB)·`ClockLive`(34KB) 전부 참

거대한 React 컴포넌트 본문이라 **오탐이 기본값**이 된다. 무리해서 넣으면 무관한 편집마다 터지고 결국 느슨하게 풀린다 —
**그게 더 나쁘다.** 그래서 '복제본이 없는가'(판정 불가) 대신 **'마감을 말하는 화면이 전부 그 한 곳에서 답을 읽는가'** 를 못 박았다.
복제본을 만들어도 호출을 바꾸지 않으면 죽은 코드라 화면은 거짓말하지 않고, **호출을 바꾸는 순간 걸린다** —
F2 가 실제로 났던 경로가 바로 '호출이 로컬 복제본을 보고 있었다' 다.

추가한 앵커: 소비처가 **정확히 넷**(새 화면이 생기면 앵커를 추가해야 통과) ·
`LiveGamesTab` 의 3인자 호출과 `regClosed = regMs === 0`(null 까지 CLOSED 로 그리지 않는다) ·
`ScheduleDetailModal` 의 3인자 호출과 **렌더 분기 순서**(`null` 검사가 `0` 검사보다 **앞**이어야 미설정 대회가 마감으로 안 보인다).

**음성 대조 4종 — 전부 뒤집혔다**: 호출을 로컬 이름으로 교체 · 렌더 분기 순서 뒤집기 · 다섯 번째 소비처 등장 ·
`null` 까지 CLOSED 로 그리기. `LiveGamesTab`(CRLF 579) · `ScheduleDetailModal`(LF 1470) 둘 다 `cmp` 로 **바이트 동일** 확인.

#### ⚠ 측정 도구를 하나 폐기했다 — `grep -c $'\r'`
줄끝 실측에 쓰던 이 명령이 이 환경에서 **빈 패턴이 되어 전 줄을 센다.** 그래서 LF 파일을 CRLF 로 오판했고,
하마터면 파일 전체의 줄끝을 뒤집을 뻔했다(즉시 발견해 되돌렸다).
**이제 줄끝은 python `b.count(b'\r\n')` 로만 센다.** 실측 결과:
`TournamentClock.tsx`·`LiveGamesTab.tsx` = **CRLF** / `ClockDisplay.tsx`·`regStatus.ts`·`_mustAffect.ts`·
`mutationAffected.contract.test.ts`·`regStatus.contract.test.ts`·`20260913a…sql` = **LF**.

또 하나: **bash heredoc(`<<'PY'`)이 백슬래시를 먹는다.** 정규식이 든 스크립트는 파일로 써서 실행한다.

### ✅ 일정 카드 E2E 시각대 버그 — 미설명 실패 7건이 사라졌다

`e2e/schedule-card-fit.spec.ts` 의 `day()` 가 `toISOString()` 으로 **UTC 날짜**를 만들었다. 앱은 KST 로 배치한다.
`src/lib/kst.ts` 의 `kstToday()` 로 교체(스펙 안에 KST 변환을 새로 만들지 않았다 — 두 벌이 되는 순간 그게 버그다).

⚠ **내 진단 하나가 틀렸고 담당이 정정했다.** 나는 "`TZ` 를 바꿔 재현하라" 고 지시했는데,
`toISOString()` 도 `kstToday()` 도 **epoch 산술만 쓰므로 `TZ` 와 무관**하다. 실제 조건은 **벽시계 UTC 시각**이고,
마침 실행 시각이 `2026-09-12 20:08 UTC = 2026-09-13 05:08 KST` 로 **문제 구간 안**이라 그 자체가 정확한 재현이었다.

- 수정 후(문제 구간 안 실제 시각): **36 passed / 0 failed**
- 음성 대조(`toISOString()` 로 되돌림): **29 passed / 7 failed** — 전체 E2E 의 미설명 실패 **7건과 정확히 일치**
- 빌드 신선도 확인: `playwright.config.ts` 의 `reuseExistingServer: false` + 4173 유휴 → 매 실행 새 빌드. **거짓 통과 위험 없음**

⚠ **남은 것**: `toISOString()` 을 쓰는 e2e 스펙이 **28개 더** 있다. 전부 위험한지는 미확인 —
"날짜 키를 만들어 KST 기준 데이터에 쓰는가" 로 분류 중이다. **있다는 사실만으로 고치지 않는다.**

### ✅ 클락 복제본 통합 — `levelNumberAt` 4벌 · `msToNextBreak` 2벌 → 각 1벌

`msToRegClose` 와 **같은 부류의 마지막 둘**. 시그니처까지 갈려 있었다(`cfg` 판본 / `levels` 판본, 2인자 / 3인자).
정의를 `src/lib/clockLevel.ts` 로 모았다 — `regStatus.ts` 가 `effectiveLevel` 을 가져오는 바로 그 파일이고,
**`api/clock` 에서 값을 가져오면 업주 전용 장부 청크가 첫 화면 임계 경로로 딸려 오기** 때문에 같은 제약이 적용된다(실측 확인: 값 import 0).

**동작 보존 근거** — 통합 후 호출부:
| 파일 | 전 | 후 |
|---|---|---|
| `TournamentClock` | `msToNextBreak(state, remaining)` (내부에서 `state.currentIndex`) | `msToNextBreak(state, state.currentIndex, remaining)` |
| `TournamentClock` | `levelNumberAt(cfg, i)` | `levelNumberAt(cfg.levels, i)` |
| `ClockDisplay` · `ClockRemote` · `LiveGamesTab` | `(lvls, eff.index)` | 시그니처 동일 — import 만 교체 |

운영자 클락이 `currentIndex` 를 그대로 쓰는 것이 맞다는 판단은 **코드에 이미 주석으로 있었고**(TV 는 DB 의 낡은
`current_index` 를 `effectiveLevel` 로 보정해야 하지만 운영자는 자기 state 가 권위다) 통합 후에도 그대로다.

⚠ 통합본이 **양쪽 원본보다 더 안전하다**: `s.config?.levels ?? []` 에 더해 `(lv[i].minutes ?? 0)` 이 붙어
`minutes` 미정의 시 **NaN 이 되던 경로가 사라졌다**(두 원본 다 `lv[i].minutes * 60_000` 이었다). 기능 소실 없음.

**게이트(내가 독립 실행)**: `tsc -b` 0 · vitest **155 files / 1826 tests 전부 통과**
(기준 154/1812 → 계약 구멍 A5·B2b 로 +4, 새 `clockLevel.contract.test.ts` 로 +10).

**음성 대조** — 담당이 1종(ClockRemote 에 `levelNumberAt` 재복제), **내가 겹치지 않는 3종을 따로** 걸었고 전부 뒤집혔다:
`P1` TournamentClock 에 `msToNextBreak` 로컬 복제본 재삽입 → 정의-단일성 실패 ·
`P2` 호출을 옛 2인자로 되돌림 → 배선 앵커 실패 · `P3` `levelNumberAt(cfg, …)` 로 되돌림 → 배선 앵커 실패.
`TournamentClock.tsx` 는 매 회차 `cmp` 로 **바이트 동일** 원복 확인(CRLF 1533 유지).

⚠ P3 은 처음에 앵커가 2곳이라 **내 스크립트가 단언에서 멈췄다** — 파일을 건드리기 전에 멈춘 것이라 안전했다.
고유 앵커(`cu.toIndex`)로 다시 걸어 확인했다. **앵커 유일성을 먼저 단언하는 습관이 실제로 사고를 막았다.**

이 계약이 못 보는 것: `regStatus.contract.test.ts` 와 **같은 한계** — 이름을 바꾼 복제본은 못 잡는다. 파일 머리말에 적혀 있다.

### 📌 전체 E2E 를 돌릴 때의 안전 절차 (확인해서 확정했다)

`npm run build` 는 `scripts/gen-sitemap.mjs` 를 돌리고, 그 스크립트는 `process.env` 가 없으면 **`.env.local` 을 직접 읽는다**
(실측: `.env.local` 에 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` 둘 다 있다). 즉 빌드는 운영 Supabase 로
**anon 읽기 2건**(`schedules`·`venues` 공개 목록 — 정상 빌드가 늘 하는 일, 쓰기 아님)을 보내고 `public/sitemap.xml` 에 **쓴다**.

⚠ **내가 여기에 예측을 사실처럼 적었다가 실측으로 정정한다.** 처음엔 *"`lastmod` 가 오늘 날짜라 내용이 반드시 바뀐다"*
라고 썼는데, **2026-09-13 05:26 KST 에 실제로 돌려 보니 해시가 그대로였다**(`6130e085…` 유지).
이유: `gen-sitemap.mjs:37` 의 `lastmod` 는 `new Date().toISOString().slice(0,10)` = **UTC 날짜**라 그때가 아직 `2026-09-12` 였고,
기존 파일의 `lastmod` 와 같아 산출물이 바이트 동일했다(정적 6 + 동적 3 = 9 URL).

⚠ 그 `toISOString()` 은 **고치지 마라.** sitemap `lastmod` 는 크롤러를 향한 값이라 UTC 가 오히려 맞다 —
방금 고친 e2e 픽스처의 KST 버그와 **표면만 같고 성질이 다르다**. (같은 패턴을 일괄 치환하면 이걸 망가뜨린다.)

그래도 절차는 **그대로 유지한다** — 승인 대회·활성 매장이 바뀌면 언제든 내용이 달라지고, 그날이 KST 오전이면 날짜까지 갈린다.

`playwright.config.ts:53` — **`E2E_BASE_URL` 을 주면 `webServer` 가 `undefined` 라 빌드가 아예 안 돈다.**
그래서 안전 절차는: **백업 → 내가 직접 `npm run build` → `public/sitemap.xml` 복원 + `git hash-object` 로
`6130e0858d79ea6e6af979cc17e58d3f0eb2c80f` 재확인 → `vite preview --port 4173` → `E2E_BASE_URL` 로 playwright.**
`dist/sitemap.xml` 에는 생성본이 남는데 그게 실제 배포본과 같고, **e2e 스펙 중 sitemap 을 검사하는 것은 0개**라 무해하다(grep 확인).

⚠ 전체 E2E 는 **단독으로** 돌린다 — 이 저장소는 부하 시 flaky 가 기록돼 있고(`subtab-motion`·`clock-catchup`·`shout-queue`),
로컬은 `retries: 0` 이라 다른 에이전트가 컨테이너를 돌리는 중에 돌리면 **잘못된 실패**가 섞인다.

### ✅ e2e `toISOString()` 전수 분류 — 58곳 중 위험 1건, 그리고 **거짓 통과**를 하나 찾았다

`e2e/**` 의 `toISOString()` 실제 호출 **58곳(29파일)** 을 소비처까지 역추적해 분류했다(불명 0).
판별 기준은 "UTC 날짜를 KST 배치 키인 것처럼 쓰는가" 하나다 — **`toISOString()` 이 있다는 사실만으로는 아무 정보가 없다.**

- **무해 대다수의 근거 셋**: ① `matchClockSchedule` 은 `s.date === g.sessionDate` **문자열 완전 일치**라 양변이
  같은 계산식이면 어긋날 수 없다 ② 11개 파일은 이미 `Date.now() + 9*3_600_000` 으로 **`kstToday()` 와 수식이 동일**하다
  (버그가 아니라 같은 로직의 중복 구현이다) ③ 나머지는 `created_at`·`ends_at` 같은 **완전 timestamp** 라 날짜 경계가 없다.
- ⚠ **`scripts/gen-sitemap.mjs:37` 의 `toISOString()` 도 고치지 마라** — sitemap `lastmod` 는 크롤러를 향한 값이라 UTC 가 맞다.
  **표면만 같고 성질이 다른 것을 일괄 치환하면 멀쩡한 것을 망가뜨린다.**

#### 🔴 `theme-tokens-v7.spec.ts:48` — 분류는 맞았고 **예측한 결과는 틀렸다**(실측으로 정정)

담당은 *"KST 05:00~09:00 에 8행 중 4행이 `ended` 로 걸러져 카드 높이 최빈값이 흔들려 테스트가 실패한다"* 고 보고했다.
**마침 그 구간(2026-09-13 05:24 KST)에 실제로 돌렸더니 8/8 통과했다.** 추측을 멈추고 직접 측정했다 —
같은 픽스처를 세 변형으로 넣고 브라우저에서 카드를 직접 세는 프로브를 짰다:

| 변형 | 카드 수 | 관찰 |
|---|---|---|
| A 현행(오늘-UTC) | 8 | **전부 `9/13`** — `9/12` 행 4개가 `hideEnded` 에 실제로 지워졌다 |
| B 10일 전 | **0** | 필터가 확실히 작동한다 |
| C 내일·모레 | 16 | **일정 1건이 `.cv-card-list` 를 2개 렌더**한다(8행 → 16카드) |

→ **기제는 실재한다**(4행이 조용히 사라진다). 그런데 단언이 `n > 2` 와 높이 **최빈값**이라
절반이 사라져도 둘 다 그대로여서 **실패가 아니라 거짓 통과**였다. 내 가설(‘🏁 지난 대회 섹션이 렌더한다’)도 틀렸다 —
`cv-card-list` 는 `ScheduleCard.tsx` 한 곳뿐이고 🏁 섹션은 자체 마크업이다.

이 스펙은 **246행에 스스로** *"이 테스트가 거짓 통과하지 않으려면 목킹한 행이 실제로 렌더돼야 한다"* 고 적어 두고
`if (!cards.length) return` 같은 우회를 금지까지 해 놨는데, 정작 그 조건이 **하루 4시간 깨져 있었다.** 그래서 둘 다 고쳤다:

1. `date` 를 `kstToday(Date.now() + (i%2)*86_400_000)` 로 — 같은 시각 실측 `n` **8 → 16**(8행 전부 렌더).
2. **단언을 실제로 지키게 강화** — 두 픽스처 날짜(`M/D` 라벨)가 **둘 다 화면에 있는지** 본다.
   카드 개수로 세지 않는다: 1건이 2카드라 개수는 구현 세부사항이고, `n >= 8` 로 올려도 이 결함은 **여전히 통과한다**(8 ≥ 8).

**음성 대조**: 날짜만 옛 UTC 방식으로 되돌리자 `⑦ 390px`·`⑦ 1440px` 2건이
`9/14 일정 행이 한 장도 안 보인다` 로 **실패**했다. 원복 후 8/8 통과 · 스펙 `cmp` **바이트 동일** · LF 유지.

> 교훈: **개수 단언은 "절반이 사라지는" 부류를 구조적으로 못 본다.** 무엇이 보여야 하는지를 이름으로 단언해야 한다.

### ✅ `20260913a` 재설계 — 재검증이 남긴 **유일한 FAIL 이 닫혔다** (Fable · 재발 부류라 상향)

정규식이 두 번 연속 실패한 자리다. **접근을 바꿨다** — 정규식으로 코드와 주석·문자열을 가르려 하지 않고,
`pg_temp` 임시 함수 3개로 **비코드를 먼저 마스킹**한 뒤 판정한다(트랜잭션 끝에 drop, 세션 밖에 아무것도 안 남는다).

- `nuri_mask_noncode` — 문자 단위 상태기계. `--` 줄주석 · `/* */`(중첩) · `'…'`(`''`) · `E'…'`(`\` 이스케이프) ·
  `"…"` 인용 식별자 · 달러 인용을 **같은 길이 공백**으로(줄바꿈 보존 → **오프셋 보존**).
  ⚠ 가장 바깥 달러 태그는 **본문 자체라 투명**하게 두고, 그 안에 **중첩된** 달러 인용만 마스킹한다.
- `nuri_guard_hits` — 마스킹본에서 `if | elsif | elseif | when | while` 뒤 ~ `then`(while 은 `loop`) 구간만 본다.
- `nuri_fix_guards` — 히트를 **내림차순 오프셋**으로 `overlay` 해 2글자 연산자만 바꾼다.

**미리보기 · 건너뛰기 게이트 · 치환 · 치환 후 재판정 · 자가검사가 전부 같은 판정기를 부른다** — 복붙하면 F3-3/F3-4 가 그대로 재발한다.
⚠ **전역 `<>` → `IS DISTINCT FROM` 치환을 하지 않는 근거**를 파일에 남겼다: `where … and my_role() <> 'admin'` 같은
**필터**에서는 NULL 세션 행이 매치돼 **넓어진다**(가드에서는 엄격해지지만 필터에서는 읽기 노출이 될 수 있다).

#### nuri-lead 독립 검증 — **Fable 의 하네스를 재사용하지 않고** 내가 만든 케이스로 실제 파일을 돌렸다
새 컨테이너(`postgres:16`), 새 DB 2개, 케이스 9종. **모두 PASS**:

| 케이스 | 기대 | 실측 |
|---|---|---|
| M1 (F3-1) 이미 안전 + **주석**에 문구 | 건너뜀·ABORT 없음 | `[건너뜀] 탐지 0건` · exit 0 |
| M2 (F3-2) 가드 + `then` 직후 문자열(`;` 없음) | 가드만 | 가드 1줄만 diff, 문자열 원문 |
| M3 (F3-3) 가드 + **메시지**에 문구 | 수정·롤백 없음 | 수정 후 `[자가검사] 통과` |
| M4 (F3-4) `if` + `elsif` | **elsif 도** 수정 | `elsif 1건 → 0건` |
| M5 **WHERE 필터**(가드 아님) | **불변** | 건너뜀 · diff 0 |
| M7 주석 + `case when` 가드 | 가드만 | `when 1건` 수정, 주석 보존 |
| **M8 저장소 실재 최악** — 조건식 자체가 정규식 문자열 + 메시지에도 문구(`20260912c:719-725` 형태) | 진짜 가드만 | 가드만 diff, 정규식·메시지 보존 |
| M9 중첩 달러 인용 | 불변(보수적) | 건너뜀 |
| 멱등 · ACL | 무변경 / anon=false·auth=true | 2회차 전부 건너뜀 · 5개 ACL 유지 |

Run1 은 정확히 **3줄**, Run2 는 **2줄**만 바뀌었다 — 주석·문자열·필터는 하나도 안 건드렸다.
Fable 의 음성 대조 6종(마스킹 요소를 하나씩 끄면 각각 다른 케이스가 뒤집힌다)도 보고에 있다.

#### ⚠ 내가 두 가지를 더 고쳤다 (검증 중 발견)
1. **운영 PG 버전을 사실로 단정하고 있었다** — `regexp_instr`/`regexp_substr` 는 PG 15+ 인데 머리말에 "(운영은 17)" 이라고 적혀 있었다.
   **이 세션은 운영 DB 를 조회하지 않았다.** 확인하지 않은 값이므로 *"적용 전에 `select version();` 을 먼저 확인하라"* 로 바꿨다.
2. **"못 보는 것" 목록이 보고서에만 있고 파일에는 없었다.** 보고서는 파일과 함께 다니지 않는다 —
   적용하는 사람이 "이게 전부를 잡는다" 고 믿게 된다. 6가지를 **파일 머리말로 옮겼다**:
   중첩 달러 인용 안의 진짜 가드는 안 고침 · 함수가 **왼쪽**인 형태만 · CASE 의 THEN **값 자리**는 놓침 ·
   `<> any(...)` 는 문법 오류로 **시끄럽게** 실패 · 인용 식별자 호출은 안 잡힘 ·
   **자가검사가 치환과 같은 판정기라 판정기 자체의 결함은 파일이 스스로 못 본다**(음성 대조 N3 로 실증 — `elsif` 를 빼면
   fail-open 이 남는데도 `[자가검사] 통과` 를 찍는다). → **판정기를 고치면 컨테이너 하네스를 반드시 다시 돌려라.**

주석만 추가했지만 **정리 후 재검증** 규약대로 하네스를 다시 돌렸고 **결과가 완전히 동일**했다(LF 421줄 유지, 컨테이너 정리 완료).

### 📊 전체 E2E — **464 passed / 1 failed / 26 skipped** (직전 457/8/26)

`E2E_BASE_URL=http://localhost:4173` 로 돌려 빌드를 태우지 않았다 → `public/sitemap.xml` 해시 `6130e085…` 그대로.

- 일정 스펙 **7건 실패가 사라졌다**(KST 픽스처 수정).
- 1차 실행에서 `cache-first`·`subtab-motion` 2건이 새로 실패했는데, **단독 실행에서는 둘 다 통과**했고
  `--retries=2` 로 전체를 다시 돌리자 **flaky 0건으로 아예 통과**했다 → 1회성 **부하 플레이크**다
  (`playwright.config.ts:32` 가 `subtab-motion` 을 알려진 부하 플레이크로 기록해 두고 있다).
  ⚠ 단독 통과만으로 플레이크라고 단정하지 않고 **재시도 라벨로 확인**했다.
- 남은 1건 `auth-smoke.spec.ts:93` 은 **오너 차단**이다 — 운영 DB 에 `20260911a` 가 안 올라가
  `community_ads_public` RPC 가 404 다(`BLOCKED.md` #20, ⏳오너). **라이브 DB 변경은 오너 승인 없이 금지**라 이 세션에서 풀 수 없다.

### 🔴 verifier 독립 검증 — **내 주장 4개가 틀렸다** (2026-09-13, opus-5)

목표가 "verifier PASS 일 때만 완료" 라 돌렸고, **실제 결함을 찾았다.** 이래서 돌린다.

#### FAIL ①-a (심각 · 보안 회귀) — `CASE WHEN` 은 가드일 수도 **필터일 수도** 있다
```sql
where (case when my_role() <> 'admin' then 1 else 0 end) = 1
```
판정기가 `when` 문맥으로 잡아 **치환한다.** 격리 컨테이너 실측 **NULL 세션 0행 → 2행**(읽기 노출),
극성을 뒤집으면 2행 → 0행(기능 소실). 그런데 파일이 *"`where` 는 전부 필터라 손대지 않는다 — 이것이 안전 근거다"* 라고
**단언**하고 있었다. **거짓이다.** "못 보는 것" 목록에도 없었다. → **Fable 재배정**(필터 치환 가능성이 **0** 이어야 한다는 요구로).

#### FAIL ①-b — 조건식 안에 `CASE` 가 있으면 **그 뒤 가드를 통째로 놓친다**
`if (case when p='a' then 1 else 2 end) = 1 and my_role() <> 'admin' then` — 조건식 끝이 **CASE 안의 `then`** 에 걸려 잘린다.
결과: `[건너뜀] … 이미 NULL-safe 이거나` + `[자가검사] 통과` 를 찍으면서 **fail-open 이 남는다**.
파일의 공시("CASE 의 THEN **값 자리**")보다 **실제 범위가 훨씬 넓다 — 과소 공시**다. → 같이 재배정.

#### FAIL ③-A — 내 A5 강화에 구멍이 **둘** 남아 있었다 (내가 고쳤다)
1. **켜기/끄기가 같은 함수 안에 있으면 같은-테이블 검사가 구조적으로 무효**다 —
   `idempotentOff(supabase.from('schedule_likes').delete())` 가 **스스로** `.from(테이블)` 을 만족시킨다.
   → 스캐너가 뽑아 둔 **끄는 문장 원문을 본문에서 뺀 뒤** 증거를 찾는다.
   (처음엔 문장 단위 분할로 하려 했는데 **중괄호 깊이 때문에 함수 본문이 통째로 한 덩이**가 되어 실패했다 — 실측으로 알았다.)
2. **세션 사용자 관용구 ③이 `supabase.auth.getUser()` 라는 문자열 존재만 봤다** — 하드코딩된 **남의 id** 도 통과하고,
   `_session.ts` 가 표준으로 적어 둔 구조분해형은 **거짓 실패**했다. → **`getUser()` 결과에 바인딩된 이름만** 인정하도록 고치고,
   **판정기 자체의 단위 테스트**를 추가했다(인정 4형 · 거부 2형 — 소스를 변조하지 않고 계약을 못 박는다).

   음성 대조 2종 전부 뒤집힘: `NC-A` 켜는 분기만 다른 테이블로 → 같은-테이블 테스트 실패(정확히 그 구멍) ·
   `NC-B` 본인 id 를 하드코딩된 남의 id 로 → 세션-값 테스트 실패. `calendar.ts` 바이트 동일 원복.
   ⚠ NC-B 는 앵커가 2곳이라 스크립트가 **파일을 건드리기 전에 멈췄다** — 앵커 유일성 단언이 또 사고를 막았다.

#### FAIL ③-B — 내 피벗의 **근거가 거짓이었다** (내가 고쳤다)
나는 *"복제본을 만들어도 호출을 바꾸지 않으면 죽은 코드라 화면이 거짓말하지 않는다"* 고 적었는데,
검증자가 **다섯 번째 화면에 이름 바꾼 복제본을 넣고 '마감' 을 렌더**해도 11개 전부 통과하는 것을 실증했다.
**새 화면은 기존 호출을 바꿀 필요가 없다.**

내가 지문 후보 둘을 실측해 기각한 것은 맞지만 **셋째를 놓쳤다**: `regCloseLevel` 은 **DB 컬럼명**이라
계산을 재구현하는 코드는 **이름을 바꿀 수 없다**. → **파일별 참조 수를 통째로 고정**했다(8파일 26참조).
음성 대조: 다섯 번째 화면이 `regCloseLevel` 로 마감을 재구현하자 **즉시 실패**했다.
한계도 적었다 — 이건 복제를 막는 게 아니라 **복제가 생길 자리를 전부 리뷰로 끌어내는** 장치다.

#### FAIL ④-D — 분류 하나가 틀렸다 (내가 고쳤다)
`e2e/home-cls.spec.ts:21` 의 `iso()` 를 담당이 "무해" 로 분류했는데 **위험이 맞다.**
`+9h` 보정이 없는데 47~49행이 이걸 **달력 날짜**로 쓴다. 프로덕션 빌드 프로브로 실측:
**현행 = 4행 중 2장만 렌더 / KST 수정 = 4장 전부.** 스펙이 통과하던 이유는 단언이 라이브 유무의
**대칭 비교**라 양쪽에서 상쇄되기 때문 — `theme-tokens-v7` 과 **같은 거짓 통과 가족**이다. `kstToday` 로 교체했다.

⚠ **해결했다고 말하지 않는 것**: 같은 파일 11~16행의 *"목킹 행이 e2e 에서 렌더되지 않는다(스켈레톤만 뜬다)"* 는
**별개다.** 내 프로브(나머지 REST 를 빈 배열로 막음)에서는 행이 정상 렌더됐다 — 스펙은 그 요청들을 통과시킨다.
그 메모는 **여전히 미해결**이고, 원인을 안다고 적지 않았다.

또 하나: 담당이 센 `toISOString()` 개수 **58 은 틀렸다**(실제 65 occurrence / 63행 / 29파일).

#### PASS 로 확인된 것
F3-1~F3-4 네 구멍 · 멱등 · ACL · `SECURITY DEFINER`/`search_path`/시그니처 보존 ·
파일이 적어 둔 "못 보는 것" 6가지가 **전부 사실** · 클락 통합 · 배선 앵커 4곳 ·
`theme-tokens-v7` 수정과 단언 강화(위험 구간 안에서 실증) · 게이트 4종 전부 재현 ·
보호 파일 5개 해시 시작=끝 동일 · 커밋 0 · 운영 DB 쓰기 0 · 배포 0 · HEAD `e008b02` 그대로.

검증자가 통과시킨 공격들(설계가 막아냄): 조건식 한가운데 `/*…*/` · 연산자 양옆 개행 · 중첩 `$q$` 동적 SQL ·
`exception when others then` · `exit when` · 한 줄 가드 2개 · 문자열 안 `'then end if ;'` · 무공백 `!=` · 오버로드 동명 함수.

#### ② 리모컨 라이브 통계 — **오늘 작업 탓이 아니다**(git diff 로 확인)
`ClockRemote.tsx` 에서 오늘 바뀐 것은 `levelNumberAt` 임포트뿐이고, `liveStats` 재계산 금지는 **C02(2026-09-12)의 기존 결정**이다.
다만 검증자 지적은 타당하다 — 리모컨은 장부를 **실제로 읽어오고**(48-57행), 재계산 금지가 정당한 대상은 **장부 파생분**뿐인데
`alive`/`adj*` 까지 막혀 **리모컨으로 누른 탈락이 TV 보드에 안 간다**(무인 운영에서는 갱신자가 아예 없다).
`remoteContract.test.ts:32-40` 이 그 동작을 계약으로 고정하고 있다. → **opus-4.8 재배정**(재현 → 필드 출처 표 → 판단).

### ✅ 리모컨 라이브 통계 복구 — **차분(delta)으로 C02 와 양립시켰다**

검증자가 찾은 기능 소실. 재현이 사실로 확인됐다 — 리모컨의 `persist` 호출부 **5곳 어느 것도 `liveStats` 를 패치에 넣지 않는다**.
그래서 장부 연동 클락에서 `live_stats` 는 **리모컨 조작으로 절대 바뀌지 않는다**(`eliminations` 컬럼 자체는 바뀐다).
보는 쪽은 `ClockDisplay.tsx:173` 이 `g?.liveStats ?? (폴백)` 이라 **스냅샷이 있으면 폴백을 쓰지 않는다** → TV 의 생존/엔트리가 얼어붙는다.
같은 패턴이 `LiveGamesTab`·`StoreDashboard`·`NuriPosLedger`·`VenueManageTab`·`ScheduleDetailModal` 에도 있다.
남은 쓰기 경로 `TournamentClock.tsx:463-471` 의 deps 는 `derivedKey`(장부 카운트 4개 + 바인단가)뿐이라 `eliminations`/`adj*` 로는 재발화하지 않는다.
**무인 운영이면 갱신자가 아예 없다 — 리모컨의 존재 이유가 무력화됐다.**

#### 왜 "state 필드만 재계산" 이 안 되는가 (담당이 표로 증명했다)
`alive` 가 `entries` 에 걸려 있고 `entries` 는 **장부 몫**을 포함한다. 그래서 필드 단위 분리가 성립하지 않는다.
C02 가 막으려던 사고도 실재한다 — 리모컨은 `sessionDate` 변경 시에만 장부를 읽고 **재구독이 없어서**,
통째로 재계산하면 리모컨이 열려 있는 동안 들어온 바이인이 빠져 **정본이 깎인다**.

#### 해법 — 정본에 `prev→next` **차분만** 얹는다
`applyRemoteStatDelta(canon, prev, next, cfg)` (`src/api/clock.ts`). 차이만 쓰므로 **리모컨의 낡은 `buyins` 는 결과에 전혀 들어가지 않는다**
(장부 몫은 정본 그대로 통과). 정본이 없으면(`null`) **오늘 동작 그대로 `null` 유지**. `...canon` 전개가 `buyInAmount` 를 보존한다(§28 가격 정보).

계약을 **양방향**으로 잠갔다: 기능 소실 방지(탈락 → `alive` 감소, `adj*` 반영, 0 하한) **와**
C02 회귀 방지(정본 장부 20명 vs 리모컨의 낡은 12명 — 결과가 정본을 따르고 `computeLiveStats(next, 낡은장부, cfg)` 와 **다름**을 단언).
그리고 **항등식**: `applyRemoteStatDelta(computeLiveStats(prev, L, cfg), prev, next, cfg) === computeLiveStats(next, L, cfg)`.

`remoteContract.test.ts` 는 **틀린 동작을 고정하고 있었으므로 좁혔다** — 뒤집는 이유를 테스트 주석에 남겼다
(전례: `community.deletePost.test.ts` 가 "unfollowVenue 0행이면 던진다" 를 단언하고 있던 건).
기존 단언(`computeLiveStats` 금지)은 유지하고 `derived` 금지를 더했다.

**음성 대조** — 담당 3종 + **내가 겹치지 않는 3종**, 전부 뒤집혔다:
`R1` `eliminations` 를 정본 값 유지로(= **원래 결함 재도입**) → 4건 실패 ·
`R2` 차분 대신 절대값(이중 계산) → **항등식** 실패 · `R3` `...canon` 제거(정본 필드·`buyInAmount` 소실) → C02 잠금 실패.
`clock.ts` 바이트 동일 원복(CRLF 544 유지).

⚠ 담당이 남긴 관찰(안 고침): `TournamentClock.tsx:463-471` 의 `derivedKey` 는 여전히 `eliminations`/`adj*` 를 포함하지 않는다.
리모컨 경로는 메워졌지만 **미래의 다른 writer** 가 같은 함정에 빠질 수 있다.

⚠ **게이트 숫자 주의**: 이 시점의 `vitest 156 files / 1836 tests` 에는 여러 에이전트의 작업이 섞여 있다.
**최종 숫자는 모든 작업이 끝난 뒤 다시 잰다.**

### ✅ `20260913a` 3차 — 검증자가 뚫은 보안 회귀 2건을 닫았다 (Fable · 683행)

**설계 원칙을 바꿨다: 확신할 수 없으면 건드리지 않는다.**
자동 치환 대상이 **딱 한 형태**다 — `if`/`elsif`/`elseif` 조건식에서 **AND·OR·NOT·괄호만** 거쳐 닿는 자리이고,
`case…end` 깊이 0 · 서브쿼리 밖 · 감싼 괄호가 전부 bare · **`then` 직후 첫 문장이 `raise`/`return`**.
나머지는 **전부 "검토"로 원문 줄과 함께 보고만** 한다(`when`·`while`·CASE 식 안·서브쿼리 안·함수 호출 괄호 안·
후위 연산·`any/all`·조건식 밖·판정 불가). **진짜 가드여도 자동으로 안 고친다.**

*필터 치환 가능성 0 의 근거*: `where` 는 SQL 문 안에서만 나오고, `if` 조건식에 SQL 문이 들어올 유일한 길은
**서브쿼리 괄호**인데 그건 검토로 빠진다. CASE 식은 깊이 조건에서, `when` 은 시작 토큰 조건에서 막힌다.
의미 보장은 **3치 논리 단조성**(NULL→TRUE 한 방향 = "건너뛰던 분기가 실행된다")까지다.

⚠ **검토가 1건이라도 있으면 미리보기가 EXCEPTION 으로 멈춘다.** Supabase SQL 편집기에서 `NOTICE` 가 안 보일 수 있어
"멈추는 것"으로 알린다. 계속하려면 `set local nuri.ack_review = 'on'` — **ack 해도 검토 건은 손대지 않는다.**
대상 이름은 5 → **12개**(라이브 정의 기준 판정 + 멱등이라 비용 0). 판정기가 O(n²)였던 것도 고쳤다(41KB 14초 → 108K자 2.1초).

#### nuri-lead 독립 재검증 — **행 수와 동작으로** 판정했다(diff 만으로는 부족하다)
| 공격 | 적용 전 | 적용 후 | 판정 |
|---|---|---|---|
| D1 `where (case when … then 1 else 0 end)=1` | 0행 | **0행** · 검토 보고만, 정의 불변 | ✅ 읽기 노출 없음 |
| D1-flip 극성 반대 | 2행 | **2행** · 불변 | ✅ 기능 소실 없음 |
| D2 `if (case … end)=1 and my_role() <> …` | **`ok`(fail-open)** | **`ERROR: denied`** · 자동 치환 | ✅ 가드 복구 |
| F3-1~4 · 순수 WHERE 필터 · 멱등 · ACL | — | 전부 유지(diff 정확히 3줄 · 2회차 0건 · anon=false×5) | ✅ 회귀 없음 |

⚠ **내 하네스에 버그가 있었고 하마터면 "통과" 로 읽을 뻔했다** — `psql` 에 마이그레이션을 **stdin 으로 주지 않아
아무것도 실행되지 않았는데** 로그가 비어 있어 "변경 0건" 처럼 보였다. **ACL 이 `anon=true` 로 남은 것**이 단서였다
(마이그레이션은 항상 회수한다). 이 저장소의 "0 실패 = 사실은 안 돌았다" 부류를 또 밟았다 —
**여러 신호를 교차 확인하지 않았으면 놓쳤다.**

또 하나 정정: Run C 의 `exit=0` 은 **마이그레이션이 아니라 내 하네스 탓**이다(`psql` 에 `ON_ERROR_STOP` 미지정).
로그에 `ERROR: STOP: 수동 검토 2건` 이 찍혔고 **정의가 불변**이라 롤백은 실제로 됐다.

### 📊 최종 게이트 (모든 에이전트 종료 후 단독 측정)

| 게이트 | 결과 |
|---|---|
| `npx tsc -b` | **0** |
| `npm run lint` | **0 error** / 209 warning(전부 기존 `security/detect-non-literal-fs-filename` 계열 오탐) |
| `npx vitest run` | **156 files / 1836 tests 전부 통과** (세션 시작 154/1812) |
| `npm run build` | **exit 0** · 보호 파일 `sitemap.xml` 해시 `6130e085…` 불변 |
| 전체 E2E (`E2E_BASE_URL` + `--retries=2`) | **464 passed / 1 failed / 26 skipped · flaky 0** |

⚠ 재빌드 후 preview 가 **새 엔트리**(`index-DoY_LAlV.js`)를 서빙하는지, `applyRemoteStatDelta` 가 실제로 번들
(`clock-CsJAf5x-.js`)에 들어갔는지 확인하고 E2E 를 돌렸다 — **옛 `dist` 를 검사하는 거짓 통과를 막기 위해서다.**

유일한 실패 `auth-smoke.spec.ts:93` 은 **오너 차단**이다(`BLOCKED.md` #20): 운영 DB 에 `20260911a` 가 안 올라가
`community_ads_public` RPC 가 404. **라이브 DB 변경은 오너 승인 없이 금지**라 이 세션에서 풀 수 없다.

### 🔴 verifier 2차 — 새 결함 4건 (1차가 못 본 것들)

1차 FAIL 3건은 실제로 닫혔다고 재확인됐다(행 수·동작으로). 그런데 **새로 4건**이 나왔다.

#### N1 (중) `then return query select …` 가 auto 로 들어가 **읽기가 넓어진다**
`then` 뒤 첫 문장이 `raise|return` 이면 auto 로 보는 휴리스틱이 **`return`(거부·조기탈출)과 `return query`(행 방출)를 못 가른다.**
실측 **1행 → 5행**. 게다가 미리보기가 **연산자가 있는 `if` 줄만** 찍어서 **분기 본문이 안 보인다** — 사람이 판단할 근거가 없다.
*"필터가 자동 치환될 가능성은 구조적으로 0"* 은 글자 그대로는 맞지만(필터 자체는 안 건드림)
**결과 확대라는 피해는 같은 경로로 일어난다.** → Fable 재배정(3회차).

#### N2 (하) 괄호 **없는** 후위 `IS` 술어
`if my_role() <> 'admin' is not true then` → `auto`. 헤더는 **괄호가 있는** `(…) is true` 만 검토로 공시했다.
치환 결과가 PG 문법 오류(IS 는 nonassoc)라 **마이그레이션 전체가 롤백**된다. 보안 구멍은 아니지만 적용이 통째로 막힌다. → 같이 재배정.

#### N3 (중) — **내 수정의 전제가 틀렸다**
나는 `home-cls.spec.ts` 를 고치며 *"앱은 KST 로 배치한다"* 고 적었다. **사실이 아니다.**
오늘/내일 **버킷팅**은 `HomeTab.tsx:186` 의 `toLocaleDateString('en-CA')` = **기기 로컬**이고,
KST 인 것은 `scheduleStatus.ts:24` 의 **시작 시각**뿐이다. 그리고 CI 는 `ci.yml:19` `ubuntu-latest`(**UTC**)다.
→ 내 수정은 **버그를 고친 게 아니라 옮겼다**: KST 기기 00~09시에는 고쳐지고 **UTC CI 15~24시에 재발**한다.

**진짜 수정은 픽스처가 아니라 `playwright.config.ts` 의 `timezoneId: 'Asia/Seoul'` 고정이다.**
프로덕션 빌드 프로브로 세 조합을 실측했다 — **둘 중 하나만으로는 안 되고 짝이어야 한다**:

| 조건 | 카드 |
|---|---|
| 브라우저 KST + KST 픽스처 **(지금)** | **4** ✅ |
| 브라우저 UTC + KST 픽스처(= CI 조건) | 2 |
| 브라우저 KST + 옛 UTC 픽스처 | 2 |

시간대를 고정하면 버킷(기기 로컬)·시작 시각(KST)·픽스처(KST)가 **셋 다 같은 날짜**를 보고, 어느 시각·어느 러너에서도 결과가 같다.
앱 사용자가 사실상 전원 한국이라 **KST 가 대표 환경**이기도 하다(CI 의 UTC 가 오히려 비현실적이었다).
`home-cls.spec.ts` 에 적었던 **틀린 근거도 고쳤다.** 시간대 고정 후 전체 E2E **464 passed · flaky 0** — 회귀 없음.

#### N4 (하) `applyRemoteStatDelta` 의 `earlies` 클램프가 합성되지 않는다 → **재배정**
`Math.max(0, canon.earlies + dEarlies)` 인데 `canon.earlies` 가 이미 클램프된 값이다. 장부 얼리 0, `adjEarlies` −5 → −3 이면
차분 결과 **2**, 직접 계산 **0**. 기존 항등식 테스트가 **클램프된 canon 을 안 써서 이 경우를 못 본다.**

#### ③ 계약의 잔여 구멍 — **내가 고쳤다** (2차 검증이 나열한 것 전부)
1. **같은 키에 끄는 문장이 둘이면** `find`(첫 번째)와 `Map`(마지막)이 어긋나 **앞 문장의 필터가 아예 검사되지 않았다** → 둘 다 **전부** 순회.
2. **'관대함' 과 '같은 테이블' 이 이어져 있지 않았다** — 다른 테이블의 upsert + 이 테이블의 단순 select 조합으로 통과 →
   `.from(테이블)` **근처 400자 안**에 `upsert`/`23505` 가 있어야 한다.
3. `sessionIdExprs` ② 가 **문장 끝을 앵커하지 않아** `(await currentUser())?.id ?? victimId` 가 통과 → `;` 까지 앵커. 단위 테스트로 못 박음.
4. `stripComments` 가 **줄 전체 주석만** 지워 꼬리 주석이 판정기에 들어갔다 → 꼬리 주석도 제거(`https://` 는 보존). 단위 테스트 추가.
5. `currentUser` 의 **출처를 안 봐서** 로컬 정의로 우회 가능 → `./_session` import 강제 + 지역 재정의 금지.

음성 대조: 로컬 `currentUser` 를 심으면 새 테스트가 **실패**한다(확인), `calendar.ts` 바이트 동일 원복.
`?? victimId` · 꼬리 주석은 **소스 변조 없이** 단위 테스트로 고정했다(더 오래 간다).

⚠ 이 과정에서 **또 이스케이프 사고**가 났다 — 파이썬 heredoc 을 거치며 `[^:'"\`\\]` 의 백슬래시가 한 겹 깎여 정규식이 깨졌고
테스트 파일이 통째로 파싱 실패해 **`Tests no tests`** 가 됐다. "통과 0건" 을 성공으로 읽지 않은 것이 다행이다.
→ 문자 클래스에서 백슬래시를 아예 빼 단순화했다.

#### 2차 검증이 남긴 것(추적 중)
`ScheduleCard.tsx:59-68` 의 `regCloseText()` 가 `structure.lateRegLevels` 로 **등록 마감을 이미 렌더**하는데
`regCloseLevel`·`msToRegClose` 토큰이 **0개**라 두 계약 모두 못 본다. `ScheduleDetailModal` 은 같은 화면에
`레이트 레지 {lateRegLevels}레벨`(466행, 포스터 계획값)과 `레지 마감 · LV{regLv}`(849행, 라이브 실측)를 **동시에** 그린다.
두 출처가 어긋날 수 있는지 **읽기 전용 판정 중**(→ opus-4.8).

### ✅ `20260913a` 4차 — N1·N2 닫힘 (Fable · 742행 LF)

- **N1** — 분기 판정을 `^(raise|return)` 에서 **거부 형태 둘**로 좁혔다:
  `raise exception …`(기본 레벨 `raise 'msg'`·`raise sqlstate`·`raise using` 포함)과
  **값 없는/리터럴 `return`**(`return;` `return null/true/false/숫자/'문자열';`).
  `return query`·`return next`·`return <식>`·`raise notice/warning` 는 전부 `if:branch` **검토**.
  그리고 미리보기·STOP 목록·자가검사 WARNING 이 **`⤤ then 뒤 L9 「…」` 로 분기 본문을 함께 찍는다** — 사람이 판단할 근거가 생겼다.
- **N2** — 히트 연산자 뒤 **피연산자 구간**(다음 `and/or/not` 전까지)에 `is`/`isnull`/`notnull` 이 있으면 `if:postfix` 검토.
  `and v_x is null` 처럼 다른 항의 `is` 는 구간 밖이라 auto 유지(과잉 차단 아님).

#### nuri-lead 독립 재검증 — 네 공격 전부 PASS (행 수·동작으로)
| 공격 | 분류 | 적용 후 |
|---|---|---|
| D1 필터 / 극성 반대 | 검토 | **0행 / 2행** 불변 |
| D2 조건식 안 CASE | 자동 | **`ERROR: denied`**(fail-open 제거) |
| **N1 `then return query`** | **검토 `if:branch`** | **1행**(3이 아니다) |
| **N2 괄호 없는 후위 IS** | **검토 `if:postfix`** | 정의 불변 · 문법 오류 없이 완료 |
| F3-1~4 · 멱등 · ACL · ack 없이 STOP | — | 전부 유지 |

Fable 음성 대조 4종(nc1 `when`→auto: 0→5행 · nc2 case 깊이 끕: fail-open 잔존 ·
nc3 분기 상수 되돌림: **1행→6행** · nc4 후위 상수 무효화: 문법 오류 전체 롤백) — 전부 재현됨.

⚠ 내 기대 서술 하나가 틀렸다 — N2 곀이스의 "적용 후 `ok` 여야 한다" 는 오기다.
그 함수는 원래도 `raise` 하는 형태라 **전·후 모두 `ERROR: denied`** 가 정상이고,
중요한 것은 **정의 불변 + 마이그레이션 정상 완료** 인데 둘 다 확인됐다.

### ✅ N4 — `earlies` 클램프 합성 (검증자 2차)

재현됐다: 장부 얼리 0 · `adjEarlies` **−5 → −3** 이면 차분 결과 **2**, 직접 계산 **0**.
도달 경로도 실재한다 — `ClockRemote.tsx:146` 의 보정 하한이 **−9999** 다.

**수정**: 클램프 **전** 원시값을 스냅샷에 보존한다(`ClockLiveStats.earliesRaw?`, optional).
되돌리기(`canon.earlies − prev.adjEarlies`)로는 복구 불가능하다 — `canon.earlies === 0` 이면
장부 몫이 `[0, −prevAdj]` 중 어디였는지 **정보가 이미 사라졌다**.
`live_stats` 는 jsonb 라 **마이그레이션 불필요**(객체 통째 저장·조회 — 내가 `clock.ts:314/382/400` 으로 확인).
**표시는 언제나 `earlies`(0 하한)** 라 화면에 음수가 보이거나 값이 사라지는 일은 없다.
낡은 스냅샷(필드 없음)은 `?? canon.earlies` 로 **예전 동작으로 degrade**.

합성 문제가 있는 필드가 `earlies` **하나뿐**이라는 것도 표로 확인됐다
(`entries`·`rebuys`·`addons`·`totalStack` 은 클램프가 없고, `alive`·`avgStack` 은 canon 을 읽지 않고 **새로 계산**한다).

⚠ **기존 항등식 테스트가 약속을 못 지키고 있었다** — `adjEarlies 1 → 2`(양수)만 봐서 **클램프 구간을 아예 안 밟았다.**
그래서 통과하고 있었던 것이다. 이제 **4608 조합 전수**(장부 2종 × adj 8값 × 2자리 × eliminations 6값 × 2자리)로
결과 객체 **전체**를 `toEqual` 비교한다. 음성 대조 2건 뒤집힘, `clock.ts` 바이트 동일 원복(CRLF 555 유지).

### 🔴 등록 마감이 **두 답을 동시에 말한다** — 다리가 끊겨 있었다 (2차 검증 ③ 에서 파생)

담당이 코드 경로로 증명했다. **`structure.lateRegLevels` 를 앱이 한 번도 쓰지 않는다** — `src/mock/data.ts` 뿐이다.
- `PosterFormModal.tsx:291` 은 `regCloseTime = '16LV 00:12'` 만 만든다.
- `App.tsx:2896/2934`(`handleSubmitPoster`)는 `structure` 에 `{ levels }` 만 넣는다.
- → `gameInherit.ts:29` 의 `if (sc.structure?.lateRegLevels)` 는 **실포스터에서 항상 false**.
- → 클락의 `regCloseLevel` 은 `defaultClockConfig()` 의 **12** 로 남는다(아무도 입력한 적 없는 기본값).

그 결과 `ScheduleDetailModal` **한 패널 안에서**:
`:849` 라이브 `레지 마감 · LV12 · 8분 남음` **와** `:465` 포스터 `레지 마감: 16LV 00:12` 가 **동시에** 보인다(조건부가 아니다).
카드도 `ScheduleCard.tsx:309`(실측 배지) + `:311`(`등록 마감 16레벨`)이 나란히 붙는다.
**이 세션이 계속 고쳐 온 "같은 대회를 화면마다 다르게 말한다" 의 살아 있는 사례**이고, **지금 운영 중**이다.

#### nuri-lead 판정 — 다리를 잇는다(덮어쓰기 안전 확인)
담당이 "덮어쓰기 범위를 nuri-lead 가 판정해 달라" 고 남겨 임의 수정하지 않았다. 내가 확인한 것:
1. `NuriPosLedger.tsx:2277` 이 **`if (!clockState?.running)` 안에서만** 병합한다 — **진행 중 클락은 안 건드린다**(주석도 "비파괴 병합").
2. 같은 자리 2281행 주석이 *"연동 포스터의 구조(레벨·**레지레벨**·애드온)를 클락에 병합"* 이라고 **의도를 이미 밝히고 있다.**
   `p.regCloseLevel = …` 코드도 이미 있다 — **새 동작이 아니라 한 번도 안 터지던 기존 의도의 복구**다.
3. `levels`·`startStack`·`rebuyStack`·`addonStack` 이 **이미 같은 방식으로** 포스터에서 덮어쓴다. 레지레벨만 예외로 둘 이유가 없다.
4. 정본은 **업주가 유저에게 광고한 포스터 값**이다 — 클락의 `12` 는 기본값이고, 소비자 고지 쪽이 진다는 결론은 받아들일 수 없다.
→ `regCloseTime` 의 `NNLv` 폴백을 넣되 **시각만 있는 형태(`'22:00'`)는 폴백하지 않는다**(레벨이 아니다),
   그리고 **같은 파싱이 이미 3곳에 있으므로 공용 헬퍼 하나로 뽑아** 복제 금지 계약을 붙이도록 지시했다.

⚠ **이 수정이 못 고치는 것**: 이미 저장된 클락은 **다음 장부 세션 저장 때까지 옛값(12) 그대로**다.
무인 운영 매장에서는 그 한 번이 늦게 올 수 있다.

### ✅ 등록 마감 다리 잇기 — `src/lib/regClose.ts` 신설 (운영 중 결함 수정)

담당이 전수 grep 하다 **정규식이 3곳 더** 있는 것을 찾았다 — `PosterFormModal.tsx` 안에 **같은 `/(\d+)\s*LV/i` 가 세 번**.
거기를 빼면 복제 금지 계약이 그 파일을 화이트리스트해야 하고 **그건 게이트를 느슨하게 푸는 쪽**이라 같이 배선했다. 결국 **5곳**:

| 파일 | 바뀐 것 |
|---|---|
| `lib/gameInherit.ts:29` | `lateRegLevels \|\| regCloseLevelFromText(regCloseTime)` — **키는 truthy 일 때만** 만든다 |
| `lib/gameInherit.ts:87` | 프리셋 경유도 같은 다리 |
| `ScheduleCard.tsx:63` | 인라인 정규식 → 헬퍼 |
| `ScheduleDetailModal.tsx:1333` | 옛 `/\d+/` → 헬퍼 (**동작 교정**, 아래 ⚠) |
| `PosterFormModal.tsx:161·209·226` | 정규식 3벌 → 헬퍼 |

**다리가 이어진 증거**(테스트로 남겼다 — probe 를 지우지 않았다):
`clockPatchFromSchedule(poster).regCloseLevel` **`undefined` → `16`**,
12레벨에서 `msToRegClose` **`0`(마감) → 마감 아님**, 16레벨에서 `0`(포스터와 일치).

⚠ **`undefined` 스프레드 위험을 못 박았다** — `{ ...baseCfg, ...schedPatch }` 에서 키가 있고 값이 `undefined` 면
**업주 수기값이 지워진다.** `'regCloseLevel' in p === false` 와 `merged.regCloseLevel === 7` 을 테스트로 고정했다.

#### nuri-lead 독립 음성 대조 — 담당이 걸지 않은 3각도, 전부 뒤집힘
`A` `computeLiveStats` 가 `earliesRaw` 를 **안 싣게**(담당은 소비 쪽을 되돌렸다 — 나는 **생산 쪽**을 막았다) → 3건 실패 ·
`B` 헬퍼가 맨 숫자도 레벨로 읽게(`'22:00'` → 22) → 4건 실패 ·
`C` 폴백 키를 **무조건** 만들게(`?? undefined`) → 3건 실패(그중 "키 자체를 만들지 않는다" 가 정확히 걸린다).
`clock.ts`·`regClose.ts`·`gameInherit.ts` 전부 **바이트 동일 원복**, 줄끝 파일별 유지(CRLF 555 / LF 21 / CRLF 321).

#### ⚠ 이 수정이 못 고치는 것 (정직하게)
- **이미 저장된 클락은 그대로다** — 상속은 장부 세션 저장 때, 그것도 `!running` 일 때만 돈다. **백필 안 했다**(운영 DB 쓰기 금지).
- **`BlindStructure` 동작이 바뀌었다(의도한 교정)** — 옛 `/\d+/` 는 `'22:00'` 을 **22레벨**로 읽었고 같은 문자열을 카드는 '레벨 없음'으로 봤다.
  이제 둘 다 '레벨 없음' 이고 표는 기본 16LV 로 떨어진다. **표가 사라지지는 않지만 그런 포스터의 표 모양은 달라진다.**
- **포스터가 `'22:00'` 처럼 시각만 적으면 다리는 여전히 안 이어진다** — 레벨 정보가 원천에 없다.
  근본 해결은 포스터 폼이 레벨을 **구조화 필드**(`structure.lateRegLevels`)로 저장하는 것인데 **스키마 변경이라 손대지 않았다.**
- **역방향 동기화 없음** — 업주가 클락에서 고쳐도 포스터는 안 바뀌고, 다음 장부 저장 때 포스터 값이 다시 이긴다.
  "포스터가 정본" 판정과는 일관되지만 **업주 눈에는 자기 수정이 조용히 되돌아간 것으로 보일 수 있다.**

### 📊 최종 게이트 (모든 에이전트 종료 후 단독 측정)

| 게이트 | 결과 |
|---|---|
| `npx tsc -b` | **0** |
| `npm run lint` | **0 error** / 219 warning(전부 기존 `security/detect-*` 오탐) |
| `npx vitest run` | **158 files / 1857 tests 전부 통과** (세션 시작 154/1812) |
| `npm run build` | **exit 0** · 보호 파일 `sitemap.xml` 해시 `6130e085…` 불변 |
| 전체 E2E (`E2E_BASE_URL` + `--retries=2`) | **464 passed / 1 failed / 26 skipped · flaky 0** |

재빌드 후 preview 가 새 엔트리(`index-AhILb9lO.js`)를 서빙하는지, 새 코드가 실제로 번들에 들어갔는지
(**함수명은 미니파이로 사라지므로 정규식 리터럴 `LV/i` 와 속성명 `earliesRaw` 로** 추적)를 확인하고 E2E 를 돌렸다.

유일한 실패 `auth-smoke.spec.ts:93` 은 **오너 차단**(`BLOCKED.md` #20) — 운영 DB 에 `20260911a` 미적용 → RPC 404.

### 🔴 verifier 3차 — 새 결함 6건. **그중 하나는 내가 방금 만든 회귀였다**

#### ④ 시간대 — 내 수정이 **절반짜리**였다 (검증자 실측 3조합)
Playwright 의 `timezoneId` 는 **브라우저만** 바꾼다. 그런데 일부 스펙이 픽스처 날짜를 **Node** 에서 만든다.

| Node(픽스처) | 브라우저 | 실제 환경 | 결과(489) |
|---|---|---|---|
| KST | KST | 개발기 / `TZ` 적용 후 CI | **462p / 1f** |
| UTC | KST | **변경 후 CI(내 수정만 있을 때)** | 461p / 2f |
| UTC | UTC | 변경 전 CI | 457p / 6f |

전체는 나아졌지만 `home-flow-fit` 하나는 실패 창이 **UTC 19~24시(5/24) → 15~24시(9/24)로 넓어졌다.**
`playwright.config.ts` 주석의 *"셋이 같은 날짜를 보고…"* 도 **UTC 러너에서는 거짓**이었다.

→ **`.github/workflows/ci.yml` 에 `TZ: Asia/Seoul`**(잡 레벨 env)을 넣어 브라우저와 Node 를 **짝**으로 맞췄고,
   Node 쪽 픽스처 4곳(`home-flow-fit:21`·`store-destination:66`·`clock-catchup:48`·`clock-watchdog:45`)을
   `kstToday` 로 통일해 **env 에 기대지 않게** 했다. 설정 주석의 거짓 문장도 고쳤다.

⚠ 특히 `store-destination.spec.ts:66` 은 같은 파일의 `test.use({ timezoneId: 'Pacific/Honolulu' })` 테스트가
*"앱이 기기 TZ 와 무관하게 **KST** 장부를 읽어야 한다"* 를 단언하는데, 픽스처가 Node 로컬이라 **UTC 러너에서 그 단언이 통째로 무효**였다.
`kstToday` 로 바꾸는 것이 그 테스트를 **강화**한다.

#### ⑤ 내 계약 테스트에 구멍이 **5개** 더 있었다 — 전부 막고 우회 입력을 재현으로 확인
검증자가 **실행 가능한 우회 입력**을 하나씩 줬다. 전부 넣어 보고 고친 뒤 다시 넣어 확인했다(7/7 잡힘):

| # | 우회 | 원인 | 지금 |
|---|---|---|---|
| B1 | `.from(\`community_posts\`)` 백틱 | `['"]` 만 봤고 못 읽으면 **`continue` 로 변이를 통째로 버렸다**(경고 없음) | 백틱 인정 + 못 읽으면 `(unparsable)` 로 **계약을 깬다** |
| B2 | `` `${p}//${h}` `` 가 든 줄의 DELETE | **내가 만든 회귀** — `stripComments` 정규식이 코드를 삼켰다 | **문자 스캐너로 교체**(문자열·템플릿·주석 추적, 길이 보존) |
| B3 | `u.user?.id ?? 남의id` | 관용구 ④ 에 `;` 앵커 없음 | 앵커 |
| B4 | `await currentUser() ?? {id:남의id}` | 관용구 ① 에 `;` 앵커 없음 | 앵커(③ 도 함께) |
| B5 | `const { currentUser } = {…}` | `const\s+` 가 `const {` 를 못 잡음 | 구조분해 검사 추가 |
| B6 | 문자열 리터럴로 import 위장 | 원문 전체 `toMatch` | **줄 첫머리(`^import`) 앵커** |
| B7 | `followVenue` 의 23505 제거 | 창 **400자**가 너무 넓어 다른 테이블의 upsert 를 근거로 삼음 | **150자 + 사이에 다른 `.from(` 금지** |

⚠ **B2 는 내가 2차 대응으로 넣은 것이 원인이다.** `/([^:'"\`])\/\/.*$/gm` 는 `//` **직전 한 글자**만 봐서
템플릿 리터럴·문자열 중간의 `//`·문자열 속 `/*` 를 전부 코드로 오인해 잘라 냈다.
**SQL 마이그레이션에서 배운 것과 똑같은 교훈**(정규식으로는 코드와 문자열을 가를 수 없다)을 **JS 쪽에서 다시 밟았다.**
이번엔 처음부터 문자 스캐너로 갔다. 검증자가 준 세 형태를 전부 재현해 확인했다.

#### ① N2 공시가 과소였다 (문구 수정)
`my_role() <> coalesce(v_x,'admin') is not true` 처럼 **피연산자가 함수 호출 괄호**면 후위 검사 세 그물이 전부 비껴가 **자동**으로 분류된다.
파일이 *"괄호가 있든 없든 검토"* 라고 적어 둔 것은 **거짓**이었다.
⚠ 손해 범위는 실측으로 확인됐다 — **읽기 확대가 아니다.** 치환 결과가 PG 문법 오류라 **트랜잭션 전체가 롤백**된다
(정의 전부 원본 유지). 즉 이미 공시된 `<> any()` 와 같은 등급 — **조용히 틀리는 것이 아니라 시끄럽게 멈춘다.**
그래서 판정기를 고치지 않고 **실측값으로 공시를 고쳤다**(고치려면 `opnd` 를 토큰 경계가 아니라 괄호 균형으로 재야 한다).
주석만 바꾼 뒤 하네스를 **다시 돌려 결과가 동일**함을 확인했다.

#### ⚠ 내 보고 정정 — "flaky 0" 은 사실이 아니다
검증자의 전체 실행은 **463 passed / 1 failed / 1 flaky / 26 skipped** 였고 flaky 는 `e2e/event-backnav.spec.ts:70`(뒤로가기 연타)이다.
내 실행에서는 안 나왔지만 **"flaky 0" 을 사실로 적으면 안 된다** — 재시도로 초록이 되므로 게이트는 통과하지만 **간헐 실패가 있다.**
(`playwright.config.ts:32` 가 이미 부하 플레이크를 기록해 둔 부류다.)

#### 후속으로 넘긴 것
② 마감 우선순위 통일(소비처 4곳이 서로 다른 규칙) · ③ `NuriPosLedger.tsx:1826` 얼리 '자동' 값 역산 불가 — **진행 중**.

### 📌 체크포인트 — 2026-09-13 09:2x KST (새 실행문 수신 직후)

**브랜치** `main` · **HEAD** `e008b02`(변경 없음) · `origin/main` 보다 9 뒤 — **pull 하지 않았다**.
커밋 0 · 푸시 0 · 배포 0 · 운영 DB 쓰기 0. 보호 파일 5개 사용자 수정 상태 유지,
`public/sitemap.xml` `git hash-object` = `6130e0858d79ea6e6af979cc17e58d3f0eb2c80f`.

#### 최종 게이트 (모든 에이전트 종료 후 단독 측정)
| 게이트 | 결과 |
|---|---|
| `npx tsc -b` | **0** |
| `npm run lint` | **0 error** / 221 warning(전부 기존 `security/detect-*` 오탐) |
| `npx vitest run` | **159 files / 1869 tests 전부 통과** (세션 시작 154/1812) |
| `npm run build` | **exit 0** |
| `npm run bundle:budget` | **통과** — 단 첫 화면 임계 경로 **256/256 KB gz = 여유 0%** |
| 전체 E2E(`E2E_BASE_URL` + `--retries=2`) | **463 passed / 1 failed / 1 flaky / 26 skipped** |

⚠ **내 이전 보고 정정** — "flaky 0" 은 **사실이 아니었다.** 이번 실행에서 `e2e/home-flow-fit.spec.ts:336`
(배너 양방향 랩)이 **flaky 로 분류**됐고, 이는 3차 검증자가 관측한 것과 **같은 스펙**이다.
단독 2회는 통과하므로 부하 플레이크이지만 **"0" 이라고 적으면 안 된다.**

⚠ **보호 절차가 실제로 발동했다(실측)** — `npm run build` 가 이번엔 `public/sitemap.xml` 을 **다시 썼다**
(생성본 `170ad6f8…`). UTC 날짜가 09-13 으로 넘어가 `lastmod` 가 바뀌었기 때문이다. 백업→복원으로 기준 해시를 되돌렸다.
직전까지는 "바뀌지 않았다" 였는데 **하루가 지나며 예측이 사실로 바뀌었다** — 절차를 유지한 것이 옳았다.

#### 내가 음성 대조로 찾아 닫은 구멍 하나
`regCloseLevelOf` 의 **`n > 0` 가드를 빼도 35개 테스트가 전부 통과**했다 — 아무도 그 가드를 보고 있지 않았다.
F2 와 **같은 부류**다(마감 레벨 `0` 은 '미설정' 이지 '0레벨' 이 아니다). 가드가 없으면
`ScheduleDetailModal` 이 `레이트 레지 0레벨` 을 그리고 블라인드 표가 0 을 기준으로 그린다.
→ `regClose.test.ts` 에 3건 추가. 양쪽 가드(레벨·텍스트)를 각각 빼면 **정확히 그 테스트가 빨개지는 것**을 확인했다.

#### 스킬·플러그인 설치 (사용자 지시)
- **플러그인 41개 × 두 프로필**(`~/.claude` · `~/.claude-b`). 유저 스코프라 NURI CRM·MIND·PET·nh-crm 에도 적용.
  ⚠ 원인: 이 세션이 도는 `.claude-b` 는 **플러그인 0 · 스킬 0 인 빈 프로필**이었다. 사용자의 `.claude`(25개)와 달랐다.
  기존 25개는 손대지 않았다(`installed_plugins.json` 수정일 09-02 그대로).
- **프로젝트 스킬 11종** — 신규 7(`nuri-verify`·`nuri-edit`·`nuri-e2e`·`nuri-single-source`·`nuri-time`·`nuri-affect`·`nuri-async-guard`)
  + 갱신 3(`nuri-ship`·`nuri-migration`·`security-audit`) + 사용자 추가 1(`nuri-capability-gate`).
- **이식**: 일반 규율 8종을 두 유저 프로필로 복사(전 프로젝트 사용). 포트·해시·함수표가 박힌 3종
  (`nuri-ship`·`nuri-e2e`·`security-audit`)은 누리홀덤 전용으로 남겼다. 사본에는
  *"수치는 누리홀덤 2026-09-13 기준 — 인용하지 말고 다시 재라"* 머리말을 넣었다.
- 적대 검증이 초안에서 실제 오류를 잡았다: **"복사해 쓰라" 고 실은 명령이 안 돌아갔고**(앵커를 소스가 아니라
  테스트 제목에서 옮겨 적었다), 그 음성 대조 스크립트가 **🔴 판정에도 exit 0** 을 냈으며,
  N2 사례가 **사실과 뒤집혀** 적혀 있었다. 전부 실측값으로 고쳤다.
- 총평이 잡은 게이트 공백 둘: **`bundle:budget` 이 어느 스킬에도 없는데 CI 는 돌린다**(여유 0%),
  **`legal:check` 는 스킬·CI 어디에도 없는데** 법·규제 구속 직결이다. 둘 다 `nuri-ship` 에 넣었다.

#### 🔴 새 실행문 수신 — 네이티브 팀 판정이 선행 조건이다
`홀덤 캘린더/outputs/NURI_스킬_커넥터_모델라우팅_에이전트팀_통합실행_2026-09-13.md`(578줄)를 전문 읽었다.
요구 3·12 와 문서 123행이 **"네이티브 팀 활성화와 실제 모델이 확인되지 않으면 성공으로 보고하지 말고
일반 서브에이전트를 네이티브 팀으로 보고하지 마라"** 고 못 박는다.

**현재 실측**:
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` **켜져 있음** · 프로젝트 `.claude/settings.json` 에 `teammateMode: "in-process"` **있음**
- 그러나 `CLAUDE_CONFIG_DIR` = `.claude-b` — 문서 A절이 지정한 **`.claude-max-new` 가 아니다**(그쪽은 플러그인 4 · 스킬 0)
- 🔴 `ListAgents` 가 방금 생성한 둘을 **"Subagents (2)"** 로 표시한다 — **"Teammates" 가 아니다**
- 피어 세션 3개가 보인다: `누리마인드`(requires_action) · `누리CRM`(running) · `spot evaluation logic`(offline)

→ **판정 보류.** `capability-steward`(haiku)와 `critical-reviewer`(fable 요청)에게
**자기 런타임 모델 원문 인용**과 **팀 가시성**을 보고하게 해 실증 중이다. 확인되면 그때 판정한다.

#### 다음 한 작업
팀·모델 판정 → 확인되면 문서 D절 순서(1 현황·소유권 → 2 **E-1 권한**)로 진행.
확인 안 되면 **차단 표시 + 새 대화형 세션 필요 안내**, 그동안 읽기 전용 조사와 안전한 독립 작업만.

### 🔬 네이티브 에이전트 팀 판정 — **"팀" 으로 확인되지 않았다. 다만 필요한 능력은 있다** (2026-09-13 09:4x KST)

실행문 요구 3·12 와 문서 123·228행이 *"확인되지 않으면 성공으로 보고하지 말고 일반 서브에이전트를 네이티브 팀으로 바꾸어 보고하지 마라"* 고 못 박아, **작업보다 판정을 먼저** 했다. 전부 실증이고 추측이 아니다.

#### 되는 것 (도구 반환값 원문으로 확인)
| 능력 | 증거 |
|---|---|
| 리드 → 에이전트 직접 메시지 | ✅ 이 세션에서 **3회 성공**(Fable 마이그레이션·store-team·verifier) — 전부 재개·응답 |
| **에이전트 ↔ 형제 에이전트 왕복** | ✅ **양방향 완결**. A2→B2 `success:true` · B2 가 `from: aef99fef72814a3af` 로 수신 ·
B2→A2 답장 `success:true` · **A2 가 `PONG-B2: 수신 확인. verifier(B2) 다. 형제 왕복 성공.` 을 실제로 받았다.**
메시지 래퍼는 `<agent-message from="...">` 이고 하네스가 이를 *"같은 세션 내에서 동작 중인 subagent/teammate"* 로 지칭한다. |
| 요청 모델 = 실제 실행 모델 | ✅ 3계단 전부 **시스템 프롬프트 원문 인용**으로 확인 |

**모델 검증 기록** (실행문 준비 1이 요구한 형식):
| 요청 | 역할 | 런타임 관찰(원문) | effort |
|---|---|---|---|
| `fable` | critical-reviewer · store-team | "You are powered by the model named Fable 5.1. The exact model ID is **claude-fable-5-1**." | 미확인 |
| `sonnet` | verifier ×2 | "...named Sonnet 5. The exact model ID is **claude-sonnet-5**." | 미확인 |
| `haiku` | capability-steward ×2 | `claude-haiku-4-5-20251001` | 미확인 |

#### 안 되는 것 / 확인 안 되는 것
- 🔴 **에이전트에게 `ListAgents` 가 없다** — `No matching deferred tools found`(A2·B2 둘 다, 서로 다른 질의 3회씩).
  즉 **팀원이 서로를 발견할 수 없다.** 형제 대화는 **리드가 상대 ID 를 명시적으로 쥐여 줄 때만** 성립한다.
- 🔴 리드의 `ListAgents` 묶음 라벨이 **`Subagents`** 다 — `Teammates` 가 아니다.
- 공유 작업(Task) 기능·작업 소유권 추적 UI: **미확인**
- reasoning effort: **3계단 모두 미확인**
- `CLAUDE_CONFIG_DIR` = `.claude-b` — 문서 A절이 지정한 **`.claude-max-new` 가 아니다**(그쪽은 플러그인 4·스킬 0).

#### 판정
**네이티브 팀이라고 라벨을 붙이지 않는다.** 런타임이 이들을 `Subagents` 로 표시하고 팀원 발견 수단이 없기 때문이다.
다만 **협업 능력 자체는 실증됐다** — 형제 간 양방향 왕복이 끝까지 동작한다.
다만 준비 2-4 가 요구하는 **실질**(리드에게만 보고하고 끝내지 않고 연동 상대와 직접 왕복)은 **이 방식으로 충족 가능**하다 —
리드가 각 에이전트에게 **상대의 agentId 를 명시**하면 된다. 그래서 작업은 진행하되 **라벨을 바꿔 부르지 않는다.**

⚠ 참고: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 과 프로젝트 `teammateMode: "in-process"` 는 **이미 켜져 있다.**
그래서 A절 명령을 다시 돌려도 **같은 결과일 가능성이 있다** — 다른 점은 프로필(`.claude-max-new`)과
`--teammate-mode` 를 **CLI 플래그로** 주는 것뿐이다. 사용자가 판단할 수 있게 이 사실을 그대로 알린다.

#### ⚠ 낮은 모델 신뢰도 — 실물로 나왔다
`haiku` 에이전트 **2개에서 사실 오류 2건**:
- `.claude/rules/nuri-team-capabilities.md` → "없음" (**실제 존재**, 2,692 bytes, 09-13 09:00)
- `.claude/agents/nuri-lead.md` → "미존재" (**실제 존재**)
둘 다 내가 재확인해 잡았다. 실행문이 *"낮은 모델의 빠른 통과가 고위험 안전 증거가 되지 않음"* 이라고 한 것이 그대로다.
→ **haiku 보고는 전부 재확인하고 판정 근거로 쓰지 않는다.**

#### 내 시험 설계 오류 하나 (기록)
1차 왕복 시험이 실패한 것은 팀 때문이 아니라 **내가 `capability-steward` 역할로 시험을 설계했기 때문**이다 —
그 역할만 `tools: Read, Glob, Grep, Bash` 로 제한돼 **`SendMessage` 자체가 없었다**(나머지 9역할은 전체 도구).
역할 도구 선언을 먼저 읽었으면 피할 수 있었다. → **에이전트를 만들기 전에 그 역할의 `tools:` 선언을 확인한다.**

### 진행
- §7 타이포그래피 **실측·제안 diff** — 조사 중(읽기 전용). `index.css`·`tailwind.config.js` 는 **편집자 나 하나**.
- §6 성능 실측 — 조사 종료 후 단독 실행 예정.

## 진행 중 / 미착수

| 항목 | 상태 |
|---|---|
| C08 | **재현 전** |
| V02·V03·V06·V07 | **재현 전** (V03 은 정책 질문) |
| N05·N06·N07 | **재현 전**(근거 위치만 확인) |
| §3.4 근거·채점 | **재현됨, 미수정** — 아래 참조 |
| U01~U06 · §5 레이아웃 | **미착수** — 단계 3 |

### §3.4 — `actionFromEquity` 가 전략 빈도를 지어낸다 (재현됨)

`src/components/features/gto/useDeepGto.ts:26-32` 가 승률 구간만 보고
`{raise:0.85, call:0.13, fold:0.02}` 같은 빈도를 **솔버 근거 없이** 만든다.
`GtoDeepPanel.tsx:86` 의 `MixBar` 가 이것을 GTO 빈도 막대처럼 그린다.
`AGENTS.md` 의 "가짜 solver 수치·가짜 EV 를 만들지 않는다" 와 정면으로 충돌한다.
**미수정** — 화면 표현을 바꿔야 해서 design-reviewer 검토가 먼저다.

---

## 미완료 / 남은 것

### 정책 질문 (사용자 답이 필요)

1. **lint 보안 룰 오버라이드** — 126건 중 **112건**이 `security/detect-non-literal-fs-filename`·
   `detect-non-literal-regexp` 이고, 전부 **테스트가 빌드타임 소스 경로를 읽는 것에 대한 오탐**이다.
   테스트 전용 오버라이드로 끄면 126 → 약 14건.
   *왜 필요한가*: 보안 룰을 끄는 판단이라 `AGENTS.md` 보안 표준에 걸린다.
   *답이 없으면*: 현행 유지(0 error 라 게이트는 통과). 문서 기준선만 실측값으로 고쳐 뒀다.

2. **V03 이용권 OFF 의 의미** — `identityFlag.ts` 는 "기능 중단" 으로 읽히는데
   `20260829f_identity_voucher_killswitch.sql:64` 는 OFF 일 때 **인증 검사만 건너뛴다**.
   *왜 필요한가*: 보안 정책이라 이름·주석만 보고 바꾸면 안 된다.
   *답이 없으면*: 재현·패치 초안만 만들고 운영 적용 대기로 둔다.

### 미검증 / 환경 필요

- `detect-unsafe-regex` 6건(`src/lib/ranges.ts`·`tdaSearch.ts`)은 **실제 ReDoS 후보** — 오탐 아님. 개별 검토 필요.
- 전체 E2E(69스펙) 미실행. GTO 관련 스펙만 돌렸다.
- 실기기(iOS/Android) 확인 없음. 에뮬레이션만.
- 액션 원장에 **멀티웨이 side pot · 미콜 베팅 반환 · 올인**이 없다. v1 저장 스팟 adapter 도 없다.
- `no_legal_combinations` 일 때 여전히 `hero: 0.5` 를 돌려준다 — 호출부가 `kind` 를 안 보면 50% 로 오해할 수 있다.

---

## 다음에 이어갈 정확한 순서

1. C01~C03(클락 제어 경합·리모컨 역행·STOP 레벨 불일치) — P1, 게임 운영 정확성 직결
2. C04·N01·V05 — 응답 generation 가드를 **공통 패턴으로 한 번에**
3. V01·V02 DB 경합 재현(두 connection), C06 대상 게임 견적
4. C05·C07·V04 Promise/error 계약
5. N02·N03 → N04·N07 → N05·N06 → N08 → C08
6. 단계 3 공통 컴포넌트(U01 헤더 320px 잘림부터)

## 검증 명령

```bash
npm run lint          # 기준선: 0 error · 경고 126
npm test              # 1238건
npm run build         # tsc -b 가 타입 게이트
npm run bundle:budget
npx playwright test e2e/nuri-spot.spec.ts --reporter=line
```

부하 시 flaky 를 확인하려면 빌드를 동시에 돌려라:
```bash
npm run build > /dev/null 2>&1 & npx vitest run; wait
```
