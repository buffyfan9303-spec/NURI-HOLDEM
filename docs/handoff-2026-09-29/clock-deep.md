# 토너먼트 클락 심층 실측 — root-cause-debugger (2026-09-29)

- 요구 키: 오너 채팅 2026-09-29 "클락, 내매장도 할 때마다 문제가 계속 나왔으니 디버깅 더 정확하게, 실측까지" (클락 담당분)
- 역할: 제품 소스는 읽기만 했다. 워크트리 수정 0, 운영 DB 접근 0(모든 supabase 요청은 가짜 서버가 받음). `public/sitemap.xml` 해시는 그대로(3ed60a7a…).
- 빌드 기준: `98b7e55c`(HEAD 를 `git archive` 로 뜬 격리 사본). 이후 HEAD 가 `ed09bbf8` 로 두 커밋 전진했지만 클락 관련 파일 차이는 0이다(`git diff --stat 98b7e55c HEAD -- clock·clockLevel·serverTime·NuriPosLedger·StoreDashboard` 빈 결과).

## 하네스(재현 방법)

| 무엇 | 경로 |
|---|---|
| 격리 사본(HEAD) + node_modules 정션 | `scratchpad\ck\wt` |
| 빌드 | `bash scratchpad/ck/build.sh`(환경값 출력 안 함) |
| 서버 | `cd scratchpad/ck/wt && npx vite preview --port 4290 --strictPort --host 127.0.0.1` |
| 실행 | `cd scratchpad/ck/wt && npx playwright test -c ../pw.config.ts <스펙>` |
| 가짜 백엔드 | `scratchpad\ck\specs\harness.ts` — clock_states·ledger_* PostgREST(eq/is/in 필터 · PATCH CAS 평가 · upsert) + **가짜 Supabase Realtime**(Phoenix vsn 2.0.0, `page.routeWebSocket`), 지연 150ms · REST 60ms, 소켓 끊기/조용히 끊기 |
| 기기 시계 어긋남 | `addInitScript` 로 `Date` 를 ±5분(타이머는 실제 시간) |
| 측정 | `probe.ts` — 글자 변화를 `performance.timeOrigin` 기준 실제 시각으로 기록(기기 시계 오프셋과 무관) |
| 스크린샷 | `scratchpad\ck\shots\` |

스펙: `t1-time`(시간) · `t1b-syncfail`(측정 실패) · `t2-multi`(다기기) · `t3-display`(표시·모션) · `t4-ledger`(장부 접점) · `t5-drift`(전진자 없음·정지/재개).

## 재발 부류(커밋 이력에서 뽑은 것) — 이번에 남은 결함이 어느 부류인가

| 부류 | 이전에 고친 커밋 | 이번에 남은 것 |
|---|---|---|
| ① 마지막 writer 가 이긴다(낡은 사본 덮어쓰기) | C01·C02(09-12) · applyRemoteStatDelta(09-13) · 8d564f75 레벨 CAS(09-17) · f58de3f0 CLOCK-TAP-LAG(09-24) · C2 자동전진 CAS(09-25) · D2 제어 CAS·D5(09-28) — **7번** | K1: 카운트 열·live_stats 는 아직 조건 없는 절대값 쓰기 |
| ② live_stats(TV 인원·평균 스택) 갱신 주체가 "열려 있는 화면" | C02(09-12) · 09-13 · D4·D5(09-28) — **3번** | K3 대시보드 경로 · K4 두 작성자 다른 값 · K5 리모컨 표시 |
| ③ DB 전진자 부재 → 표시 파생 | adc8ba5c(07-26 TV 00:00 얼음) · C4(09-25 TV 레벨줄 30초) | K6 대시보드 위젯 · 리모컨 버튼 |
| ④ 세로 TV 정보 누락·겹침 | 51df0451 · 46a54e5c · 4b15812c · #1(ce1684dc) · 8afa1724 — **5번** | K7 프라이즈·총 진행 시간 없음 |
| ⑤ 시간 기준 | D1(09-28 serverNow) · D9(09-29 RPC 배포) | K2 측정 전/실패 · K8 첫 프레임 · K9 반올림·위상 · K10 홈 카드 |

같은 부류가 되풀이된 공통 원인은 **"클라이언트 화면이 공유 행의 파생값을 계산해서 쓴다"** 한 가지다. 열 값(eliminations·adj_*)과 그 파생 캐시(live_stats)를 기기마다 따로 계산해서 **통째로** 쓰고, 쓰는 주체가 "지금 열려 있는 화면"이다. 그래서 새 화면이나 새 진입로가 생길 때마다 같은 증상이 다시 났다. K1·K3·K4·K5가 모두 여기에서 나온다.

## 결함(심각도순)

### K1 [높음] 카운트 열·live_stats 를 조건 없이 절대값으로 쓴다 — 동시·잠든 기기의 탈락/엔트리가 사라지고 TV 숫자가 틀린 채 굳는다
- 재현: `npx playwright test -c ../pw.config.ts t2-multi -g "2A|2B|2C"` (FAIL 3건)
- 측정
  - 2A: 리모컨 두 대에서 [탈락]을 동시에 눌렀다 → `eliminations` **1**(기대 2). 두 PATCH 가 둘 다 `{"eliminations":1, live_stats.alive 9}` 를 썼다.
  - 2B: 리모컨A [엔트리+]를 누르고 200ms 뒤 리모컨B [탈락]을 눌렀다 → 열 값 `adj_entries 11 · eliminations 1` 이므로 참값은 생존/엔트리 **10/11** 이다. 그런데 `live_stats` 와 TV 는 **9/10** 이었다. **35초 뒤에도 9/10**(다른 쓰기가 없으면 스스로 고쳐지지 않는다).
  - 2C: 잠든 폰(소켓이 죽어 있음) 동안 다른 기기가 탈락 3건을 냈다. 깬 폰이 [탈락]을 한 번 누르자 `eliminations` 가 **1**이 됐다(기대 4). 3건이 사라졌다.
- 원인: `src/api/clock.ts:540-557` `clockPatchRow` 가 바뀐 칸의 **절대값**과, 이 기기 사본으로 계산한 `live_stats` **JSON 전체**를 싣는다. 비제어 경로 `clock.ts:593-597` 에는 CAS 가 없다. TV 는 `live_stats` 가 있으면 그것만 읽는다(`ClockStage.tsx:96, 130`). 그래서 낡은 사본으로 계산한 스냅샷 하나가 남의 열 변경분까지 지운다. 이 한계는 `clock.ts:539` 주석에 이미 적혀 있다("원자 증감은 서버 RPC 몫").
- 최소 수정안
  - (a) `live_stats` 에는 **장부 파생분만** 저장한다(derived entries·rebuys·earlies·doubleEarlies·buyInAmount). 생존·엔트리·총칩은 표시하는 쪽에서 **한 함수**로 행의 열 값(adj_*·eliminations)과 합성한다(ClockStage·LiveGamesTab·homeRail·StoreDashboard·ClockRemote). 이렇게 하면 2B 는 원천적으로 없어지고 `applyRemoteStatDelta` 도 필요 없다.
  - (b) ±카운트는 원자 증감으로 바꾼다. 서버 RPC `clock_adjust(venue, seq, d_elim, d_entries, d_rebuys, d_earlies, d_addons)` 를 SECURITY DEFINER + `can_access_ledger` + 하한 클램프로 만든다. 마이그레이션이라 리드가 결정한다. 클라이언트만으로 막으려면 바뀐 카운트 열에 `.eq(col, base[col])` 를 걸고, 0행이면 다시 읽은 뒤 **차분을 다시 적용**한다(되돌리지 않는다).
- 재발 이력: 있다(부류 ①, 7번).
- 회귀검사: `t2-multi` 2A/2B/2C. 지금 코드에서 FAIL 이므로 음성 대조는 이미 확인된 셈이다.

### K2 [높음·조건부] 서버 시각을 재기 전이나 재기에 실패한 뒤에는 PC 자동 전진이 기기 시계로 레벨을 **일찍** 넘긴다
- 재현: `t1-time -g "C PC"`, `t1b-syncfail`
- 측정: PC 시계 +5분, 실제로 150초 남은 레벨로 쟀다.
  - `server_now` 가 1.5초 걸리면 첫 호출 491ms 뒤 `PATCH current_index 1` 이 나갔다. **149초 일찍** 넘어갔다.
  - `server_now` 첫 호출이 503 이고 이후 네트워크가 정상이면, 11초 동안 재측정이 **0회**였고 **146초 일찍** 넘어갔다.
  - 이때 DB 에는 `index 1 · ends_at=원래 경계+20분` 이 들어간다. 그래서 TV 는 "LEVEL 2 22:29" 를 그리고 **블라인드가 2분 반 먼저 오른다**.
  - 대조: `server_now` 가 60ms 이고 부팅 중에 측정이 끝난 경우에는 PASS 였다.
- 원인
  - `src/lib/serverTime.ts:19-22`: 측정 전·실패 후에도 `offset 0`(기기 시계)을 그대로 돌려준다.
  - `serverTime.ts:37-43`: 실패해도 `syncedAt` 을 갱신해서 **10분 동안 재측정하지 않는다**.
  - `TournamentClock.tsx:743-746`: 워치독이 마운트 즉시, 그리고 매초 `levelCatchUp(serverNow())` 로 DB 에 쓴다. 측정이 됐는지는 확인하지 않는다.
  - 같은 조건이 걸리는 곳: `NuriPosLedger.tsx:2160-2172`(백업 전진자), 시작·정지·±시간 버튼(`ClockRemote.tsx:157-176`, `TournamentClock.tsx:779-827`, `NuriPosLedger.tsx:2222-2231`).
- 최소 수정안(**사본에서 검증함**)
  - `serverTimeKnown()` 을 추가하고, 실패하면 15초 뒤 다시 잰다. 워치독 첫 줄에 `serverNow(); if (!serverTimeKnown()) return;` 를 넣는다.
  - 결과: 사본에 적용하면 C(1500)·C2 **PASS**, 원본은 **FAIL**. 양·음 대조가 모두 끝났다. 사본은 원본으로 되돌렸고 sha256 이 일치한다.
  - 쓰기 버튼(시작·±시간)도 측정 전이면 측정을 기다렸다가 쓰게 한다.
  - 함정: RPC 가 없는 환경(42883/PGRST202)에서는 known 을 참으로 두고 기기 시계로 떨어져야 한다. 그러지 않으면 전진이 영영 멈춘다.
- 재발 이력: D1(09-28)의 뒷면이다. 기존 D1 스펙(`e2e/mystore-linkage-0928.spec.ts` D1)은 1.5초를 기다린 뒤 눌러서 이 창을 피해 간다.

### K3 [중간] 업주가 대시보드에만 있으면 TV 인원·평균 스택이 멈춘다 — 'TV 인원·평균 스택 멈춤'은 일부만 고쳐졌다
- 재현: `t4-ledger -g 4A`
- 측정
  - 장부·클락에 한 번도 들어가지 않고 대시보드에 있는 상태에서 다른 기기가 바인 +1 을 넣었다 → 4초 뒤 live_stats 쓰기 **0회**, TV 는 **5/5** 그대로였다.
  - 장부에 들어가면 949ms 뒤 6 이 됐다. 장부에서 바인 → TV 1036ms, 클락에서 → 1022ms. 클락을 한 번 거친 뒤 대시보드로 돌아오면 반영된다(keep-alive 된 클락 화면이 쓴다).
- 원인: live_stats 를 쓰는 곳이 `TournamentClock.tsx:576-587`(클락 화면이 마운트된 뒤)와 `NuriPosLedger.tsx:707-722`(`active` 인 장부) 두 곳뿐이다. 대시보드의 QR 승인(`StoreDashboard.tsx:559/623 approveBuyinRequest`)이나 다른 접수대의 바인은 아무도 다시 계산하지 않는다. DB 쪽 재계산도 없다(마이그레이션에 live_stats 트리거 0건).
- 수정안: 장부 파생분 스냅샷을 서버 트리거로 옮긴다(ledger_buyins·ledger_sessions 변경 시). K1 (a)와 한 묶음이다. 클라이언트만으로 막으려면 장부와 같은 400ms 작성기를 **함수 한 벌로 뽑아** 대시보드에도 붙인다.
- 재발 이력: 있다(부류 ②, 3번). 매번 "지금 열린 화면 하나"에 쓰기를 붙였기 때문에 새 진입로가 생기면 다시 난다.

### K4 [중간] 같은 바인을 두고 두 작성자가 다른 얼리·총칩을 쓴다
- 재현: `t4-ledger -g 4D`
- 측정: 클락 설정은 더블얼리 20분, 장부 세션 얼리는 0인 상태에서 바인 +1 을 넣었다. 클락 화면은 `earlies 8 · totalStack 240,000`, 장부 화면은 `earlies 0 · 200,000` 을 썼다. 결과는 나중에 쓴 쪽으로 정해진다.
- 원인: 얼리 기준을 고르는 식이 화면마다 다르다.
  - `TournamentClock.tsx:542-548`: `cfg.earlyDoubleMin || session`
  - `NuriPosLedger.tsx:681-684, 700-716`: session 만 본다
  - `ClockRemote.tsx:100-105`: cfg 를 먼저 본다
  - 두 값이 갈리는 경로: `liveStructurePatch`(`clock.ts:355 withDerivedEarly`)가 설정의 얼리 분을 다시 환산해도 세션은 바뀌지 않는다.
- 수정안: `earlyWindowOf(cfg, session)` 한 벌을 만들고 세 곳이 그것만 쓴다(정본 두 벌 부류).

### K5 [중간] 장부 연동 리모컨의 인원 표시가 처음 열 때 읽은 장부에 멈춘다
- 재현: `t4-ledger -g 4C`
- 측정: 바인 +1 뒤 서버와 TV 는 6/6, 리모컨은 "생존 **5** / 엔트리 **5**".
- 원인: `ClockRemote.tsx:91-97` 이 장부를 한 번만 읽는다(구독 없음). `:178` 은 표시를 스냅샷이 아니라 `computeLiveStats(state, derived)` 로 계산하고, `:182-186` 의 하한 클램프도 낡은 derived 를 쓴다.
- 수정안: 연동 클락이면 TV 와 같은 값(스냅샷)을 표시한다. K1 (a)를 적용한 뒤라면 공용 합성 함수를 쓴다.

### K6 [중간] 전진자가 없는 운영(리모컨만 쓰는 무인 운영)에서 raw index 를 쓰는 화면이 남아 있다
- 재현: `t5-drift -g 5A`
- 측정: 실효 레벨 2, 18:55 남은 상태.
  - TV·리모컨 표시는 레벨 2 로 맞다.
  - 리모컨 [이전 레벨]은 **disabled=true** 다.
  - 대시보드 위젯은 "**100/200 레벨 1 · 0:00**" 이다.
  - DB PATCH 는 0건이다(전진자가 없다).
- 원인: `ClockRemote.tsx:208, 214` 는 `state.currentIndex` 를 쓴다(표시는 eff.index 를 쓴다). `StoreDashboard.tsx:430-440` 은 raw currentIndex 를 쓰고, `endsAt−now` 를 0으로 클램프한다.
- 수정안: `effectiveLevel` 로 바꾼다. `VenueManageTab.tsx:1317` 이 이미 그렇게 하고 있다.
- 재발 이력: 있다(부류 ③).

### K7 [중간] 세로 TV(1080×1920)에서 프라이즈 표와 총 진행 시간이 통째로 없다
- 재현: `t3-display -g "1080×1920"` → `shots\tv-1080x1920.png`(가로 `tv-1920x1080.png` 와 비교)
- 측정: 20줄 · 총액 44,416,537 인 프라이즈가 세로 화면에 한 글자도 없다. 위쪽 y 90~580 과 중간 y 1280~1570 은 비어 있다.
- 원인
  - `PrizeColumn` 이 `.clk-col` 이다(`ClockStage.tsx:333`). 이 클래스는 `index.css:3043` 에서 `display:none` 이고 가로에서만 `:3054` 에서 flex 로 켜진다.
  - Total Time 은 `.clk-wide-only`(`index.css:3045`)다.
  - #1(09-25)은 지표 레일만 세로 띠(`clk-rails-band`)로 옮겼고 프라이즈는 빠뜨렸다.
- 수정안: 세로 띠나 위쪽 빈 공간에 프라이즈 총액과 상위 N 줄을 둔다. 디자인 판단이 필요해서 design-reviewer 와 오너가 정한다. 기능 소실 부류라 3번(기능 보존) 대상이다.
- 재발 이력: 있다(부류 ④, 5번).

### K8 [낮음] TV·리모컨을 켤 때 첫 프레임이 기기 시계를 쓴다(약 1초, 레벨까지 틀린다)
- 재현: `t1-time -g "B|A"`
- 측정
  - TV +5분, 3분 남은 레벨: 첫 **1002ms 동안 "LEVEL 2 17:59"** 를 그린 뒤 "LEVEL 1 02:58" 로 바뀐다.
  - A: TV(+5분) 첫 값 04:59(참값 09:59, −300초), 리모컨(−5분) 첫 값 14:59(+300초).
- 원인: 측정 전에는 offset 이 0이다. 측정이 끝나도 재렌더가 일어나지 않아서, 틀린 값이 다음 1초 틱까지 남는다.
- 수정안: 첫 렌더를 `syncServerTime()` 이 끝날 때까지(최대 약 1.5초) '불러오는 중'으로 둔다. 또는 오프셋이 갱신될 때 틱을 즉시 한 번 돌린다.

### K9 [낮음] 화면마다 초 반올림과 틱 위상이 달라 같은 순간에 1초씩 어긋난다
- 재현: `t1-time -g D`
- 측정
  - TV와 리모컨은 같은 순간에 최대 1초 차이가 났다.
  - 레벨 경계에서 TV 는 +800ms, 리모컨은 +651ms 에 바뀌었다.
  - TV 는 00:00 을 1초 동안 보이고 20:00 을 건너뛴다. 리모컨은 20:00 을 보인다.
- 원인
  - 반올림 방식이 다르다: round(`ClockStage.tsx:26`, `ClockRemote.tsx:32`) 대 floor(`NuriPosLedger.tsx:2200`, `StoreDashboard.tsx:550`, `VenueManageTab.tsx:1320`, `TournamentClock.tsx:378`).
  - 컴포넌트마다 마운트 시점에 따라 위상이 다른 1초 setInterval 을 돈다.
- 수정안: 포매터를 한 벌로 합치고(카운트다운 관례는 ceil), `serverNow` 의 초 경계에 맞춘 `useSecondTick` 도 한 벌만 둔다.

### K10 [낮음·코드 확인] 홈 카드의 '마감까지 N분'과 레벨은 기기 시계를 쓴다
- `App.tsx:2837-2853` `regNow = Date.now()`, `lib/homeRail.ts:27` 기본값 `Date.now()`.
- 5분 빠른 폰에서는 마감이 5분 일찍 뜬다. 측정은 NOT_RUN.

### K11 [낮음·코드 확인] 장부의 클락 바는 창 복귀 때 클락을 다시 읽지 않는다
- `NuriPosLedger.tsx:499` 의 `useResyncOnWake` 는 장부·세션·대기만 다시 읽는다.
- 조용한 끊김에서도 폴링이 없다. 비교하면 TV·리모컨·클락 화면은 30초 폴링이고, 2F 에서 28.9초 만에 따라잡았다.
- 제어 버튼은 CAS 로 막히지만, 표시와 [아웃](K1)은 낡은 값으로 나간다. 측정은 NOT_RUN.

### K12 [낮음·코드 확인] PC 레벨 ±가 raw index 기준이다
- `TournamentClock.tsx:816` `levelMovePatch(state, state.currentIndex, …)`.
- 백그라운드 탭 스로틀로 워치독이 늦으면, 표시(실효 레벨)와 다른 레벨을 기준으로 움직인다(현재 레벨 타이머만 리셋됨). 측정은 NOT_RUN.

## 통과(PASS) 항목과 수치

| 항목 | 결과 |
|---|---|
| 측정이 끝난 뒤 정상 상태 서버 기준 표시(TV +5분 · 리모컨 −5분 · 대조 TV) | 평균 오차 0.61 / 0.30 / 0.61초(반올림 + 틱 위상 범위) — D1 동작 확인 |
| iPhone(WebKit 26.5)이 `server_now` 마이크로초 6자리를 읽는가 | `Date.parse` 정상 |
| 정지/재개 5회 누적 드리프트 | −3ms. 정지 1.2초 뒤 TV = 저장값과 같음 |
| 잠든 리모컨 STOP(다른 기기가 이미 정지) | CAS 가 0행으로 막고 토스트 → START 로 복귀, remaining 600000 보존 (2D) |
| 소켓 끊김 → 재연결 → 재적재 | TV 1.4초 · 리모컨 1.4초 (2E) |
| 조용한 끊김 | 28.9초(30초 폴링, 설계대로) (2F) |
| 리모컨A → TV · 리모컨B 전파 | 331~369ms (realtime 150 · REST 60 가정) (2G) |
| 레벨 경계 불일치 프레임(타이머↔레벨줄) | TV 0 · 리모컨 0 |
| 숫자 폭 흔들림(tabular) | 1920×1080 857.08 · 1080×1920 852.34 · 1280×720 571.41 · 리모컨 320px — 전부 고정 |
| 초 갱신 CLS | TV 0.0001~0.0002(레벨 경계의 블라인드·레벨 글자) · 리모컨 0 |
| 레벨 전환 애니메이션(번쩍임) | 실행 중 애니메이션 0 |
| 20줄 프라이즈 · 10억 칩 · 긴 매장명(가로 TV 3종 · 리모컨 390) | 넘침·타이머 겹침 0 |
| CPU×4 30초 | 초 건너뜀 0 · 1.5초 넘는 간격 0 |
| 장부·클락 화면에 있을 때 바인·취소 반영 | 약 1초(4A ②~⑤), DELETE 반영(4B) |

## NOT_RUN(자료·환경 없음)
- 실기기: 매장 TV 브라우저(Tizen·webOS), iPhone Safari 절전·백그라운드. 하네스는 Chromium 이고, WebKit 은 `Date.parse` 한 줄만 확인했다.
- 운영 Supabase Realtime 의 실제 지연·재연결 백오프(가짜 소켓 150ms 가정). 운영 E2E 매장(dddd…)은 읽지 않았다(목 서버로 충분).
- PC 백그라운드 탭의 분 단위 강한 스로틀에서 워치독이 어떻게 도는지(K12).
- 실시간 블라인드 구조 편집 UI(LiveLevelsEditor) 경유 흐름. config 는 같은 `saveClockPatch` 비제어 경로라 K1 과 같은 성질이다(CAS 없음).
- K10·K11 수치 측정.

## 띄운 프로세스와 정리
- `vite preview` 4290: PID 31048(자식 34692) → `taskkill /T /F` 로 종료했고 포트 닫힘을 확인했다.
- Playwright 브라우저는 러너가 매 실행마다 닫았다. 부하 프로세스는 띄우지 않았다(CPU×4 는 CDP 에뮬레이션).
- 사본 패치(K2 검증용)는 원본으로 되돌렸고 sha256 이 일치한다. 사본도 다시 빌드했다.

## 다음 한 단계
- 리드 결정 1: K1·K3·K5 를 한 묶음으로 처리한다. `live_stats` 를 **장부 파생분만** 담게 바꾸고(서버 트리거 또는 대시보드 작성기), 표시는 합성 함수 한 벌로, ±카운트는 원자 RPC 로 한다. DB 가 걸리므로 `nuri-migration` 절차가 필요하다.
- 리드 결정 2: K2 는 사본에서 검증한 7줄 패치(`serverTimeKnown` + 15초 재측정 + 워치독 게이트)를 store-team 에 넘긴다. 회귀검사는 `t1b-syncfail`·`t1-time C(1500)` 를 e2e 로 옮기는 것이다.
- K6·K9 는 Sonnet 급 정형 수정이다(`effectiveLevel` 로 교체, 포매터·틱 한 벌). K7 은 design-reviewer 의 판단이 필요하다.
