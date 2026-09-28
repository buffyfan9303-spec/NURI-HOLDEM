# 매장이용권 "살짝 올라갔다가 내려옴" 실측 보고 (root-cause-debugger · 2026-09-29)

요구 키: 오너 채팅 2026-09-29 "매장이용권을 클릭하면 살짝 올라갔다가 내려와 — 실측해서 확인"
대상: 운영 번들 https://nuriholdem.com (index-ddFK4b4h.js = main 06f671eb, 관련 3파일은 HEAD 와 diff 0) + 목 업주 세션(supabase 요청 전부 로컬 fulfill, 운영 DB 읽기·쓰기 0)
하네스·프레임 로그: `scratchpad/vb/` (lib.cjs · sheet.cjs · store.cjs · parts.cjs · shots.cjs · frames-*.json · shot-*.png)

## [재현]
```
cd scratchpad/vb && node sheet.cjs header 390 844      # 헤더 티켓 아이콘
node sheet.cjs quick 390 844                            # 홈 '이용권 · 출석' 카드
node shots.cjs 412 915                                  # 붕괴 전/후 스크린샷
```
누름: CDP `Input.dispatchTouchEvent` touchStart → 120ms → touchEnd. rAF 마다 버튼·시트·본문의 rect.top·transform·scrollY 기록.
env: `NV`(보유 장수, 기본 0) `LAT`(store_vouchers 지연, 기본 250ms) `REDUCE=1` `CPU=4` `SIMFIX=1`(수정안 흉내).

## [원인] 한 문장
**[이용권 · 출석] 시트는 높이가 내용 높이인 바닥 고정 시트인데, 여는 순간 두 칸이 스켈레톤(키 큰 자리표시)으로 그려졌다가
데이터가 도착하면 짧은 빈 상태로 바뀌어 시트가 줄고 → 윗변이 44~107px 아래로 떨어진다.**

- 시트 높이 = 내용: `src/components/atoms/Modal.tsx:484` (`height: fillHeight ? … : undefined`) + `:435` (`alignItems: flex-end` — 줄면 윗변이 내려감)
- 소비처가 `fillHeight` 를 안 넘김: `src/components/features/MyVoucherSheet.tsx:153`
- 줄어드는 칸 ①: '자주 가는 매장 이용권' 스켈레톤 2줄 `MyVoucherSheet.tsx:313` → 빈 문구 한 줄 `:316` (173.0 → 106.1px, −66.9)
- 줄어드는 칸 ②: '내 매장이용권' 스켈레톤 104px×2 `src/components/features/VoucherWallet.tsx:204` → EmptyState `:220` (293.9 → 251.6px, −42.3)
- 매번 재발하는 이유: `src/App.tsx:2173` `useDelayedUnmount(voucherSheetOpen)` — 닫으면 시트가 언마운트돼 다시 열 때마다 두 칸이 null(스켈레톤)부터 시작한다(2회차 열기도 같은 44.2px 실측).

## [근거] 실측 수치 (시트 = `[role=dialog]`, lay = rect.top − transform translateY)

| 조건 | 시트 최고점(lay) | 최종 | 떨어짐 | 시각(누름 기준) | 높이 |
|---|---|---|---|---|---|
| 헤더 390×844 · 0장 · LAT250 | 101.3 | 145.5 | **44.2px** | 433ms | 742.7→698.5 |
| 같은 조건 2회차 열기 | 101.3 | 145.5 | 44.2px | 423ms | 742.7→698.5 |
| 홈 카드 390×844 | 101.3 | 145.5 | 44.2px | 459ms | 742.7→698.5 |
| **412×915(S26급) · 0장** | 109.8 | 216.5 | **106.7px** | 442ms | 805.2→698.5 |
| 390 · LAT600 | 101.3 | 145.5 | 44.2px | **774ms**(시트 정착 후 별도 낙하) | |
| 390 · reduced-motion | 101.3 | 145.5 | 44.2px | 444ms | sheet-up 은 1프레임으로 사라짐 |
| 390 · CPU×4 | 101.3 | 145.5 | 44.2px | 474ms | |
| PC 1280×800(가운데 모달) | 48.0 | 68.7 | 20.7px(아래변은 20.7 위로) | 416ms | 704→662.5 |
| 390 · 3장 보유 | 101.3 | 101.3 | 0 | — | 88vh 상한에 걸려 안 보임 |
| 412×915 · 3장 | 109.8 | 115.8 | 6px | 420ms | |
| **음성 대조 LAT=0**(390·1280) | — | — | **0** | — | 첫 프레임 전에 도착 → 붕괴 없음 |

떨어지는 폭이 88vh 상한에 잘린다: 390 에서는 로딩 중 자연 높이(≈807)가 742.7 로 잘려 109px 중 44px 만 보이고, 915 에서는 805 까지 커서 107px 이 다 보인다.
스크린샷 `vb/shot-412x915-before.png`(스켈레톤, 윗변 109.8) → `shot-412x915-after.png`(빈 상태, 윗변 216.5).

### 반증한 가설
| 가설 | 판정 | 관찰 |
|---|---|---|
| 전역 `button:active scale(.97)` 복귀 | 기각 | 버튼 scale 0.97→1(높이 38.3→37.1→38.3), 버튼 top 10.6 불변. LAT=0 에서도 눌림은 같은데 낙하 0 |
| 시트 진입 스프링 오버슈트 | 기각 | `sheet-up` 은 cubic-bezier(0.32,0.72,0,1) — y∈[0,1] 이라 넘침 없음, ty 742.7→0 단조. reduced-motion(진입 1프레임)에서도 44.2px 낙하 그대로 |
| 스크롤 잠금 scrollY 점프/복원 | 기각 | scrollY 0 고정(스크롤 상태 대조 188·1885 도 불변), body fixed 0회(keepViewport 미사용), 배경 main top 60.5 불변 |
| 헤더 접힘(headerShrink) | 기각 | 헤더 버튼 top 10.6 전 프레임 불변 |
| Suspense 폴백 번쩍 | 기각 | 시트는 누름 후 163~203ms 에 나타나 끝까지 연속 존재, 빈 프레임 없음(청크 선로딩·경계 선마운트 App.tsx:4783) |
| **레이아웃 이동(내용 붕괴)** | **채택** | 낙하 시각이 LAT 을 그대로 따라감(0→없음, 250→433ms, 600→774ms), 모션·CPU 무관 |

### 다른 진입점 — 이동 없음(실측)
- 내 매장 단계 바 '이용권' 탭(`VenueManageTab.tsx:1631`, title="매장이용권"): 390·1280, 맨 위/스크롤 188/장부에서 진입, 전역 지연 300ms — 버튼·바·판 top 전부 불변(판은 누름 후 218~267ms 에 나타나 고정). `frames-store-step-*.json`
- 대시보드 '매장이용권' 카드 → 매장이용권 관리(`StoreDashboard.tsx:1478`): 390·1280 — 시트가 내용이 길어 상한(88vh/85vh)에 고정, 이동 0. `frames-store-card-*.json`
- 내 정보의 '내 매장이용권'(CustomerDashboardPage → VoucherWallet 같은 컴포넌트): 누르는 진입점이 아니라 재지 않음. 같은 스켈레톤(104×2)→빈 상태 붕괴가 그 페이지에서는 아래 내용이 위로 당겨지는 CLS 로 나타날 수 있다(미측정).

→ 오너가 말한 것은 **헤더 티켓 아이콘 / 홈 '이용권 · 출석' 카드가 여는 시트**로 판단한다(두 진입점이 같은 시트, 재현되는 곳은 여기뿐).

## [편집자]
편집 없음(읽기 전용). 제품 소스 `git status --short` 빈 출력 확인.

## 최소 수정안 (구현하지 않음)
**A(권장) — 시트 높이를 내용에서 떼어낸다: `MyVoucherSheet.tsx:153` 의 `<Modal …>` 에 `fillHeight` 한 단어.**
이미 있는 Modal 기능(`Modal.tsx:484`, 현재 사용처 0)이라 새 코드가 없다. 시트가 항상 88vh(PC 85vh 상한 안 88vh=704) 로 서고,
데이터 도착은 스크롤 본문 안에서만 일어나 윗변이 움직일 수 없다. 두 칸을 따로 맞추는 것보다 한 곳에서 부류 전체를 막는다(앞으로 칸이 늘어도).
대가: 내용이 짧을 때 시트 아래 빈 공간(390: 44px, 412×915: 107px).
**가설 검증(제품 수정 없이 `SIMFIX=1` 로 dialog 에 height:88vh 주입):** 390·412×915·3장·LAT600·PC1280 전부 **낙하 0, 높이 단일값**.

B(대안) — 빈 공간이 싫다면 스켈레톤을 '가장 흔한 결과'(0장) 높이에 맞춘다: `MyVoucherSheet.tsx:313` 2줄→빈 문구와 같은 높이 1줄, `VoucherWallet.tsx:204` 을 EmptyState 높이로.
0장 사용자는 이동 0 이 되지만 보유자는 시트가 **더 올라가는** 반대 방향 이동이 남는다(부분 해결).

C(보조) — `App.tsx:2173` 언마운트로 매번 null 부터 시작하는 것: 마지막 결과를 유지하면 2회차 이후는 스켈레톤 자체가 안 뜬다. 첫 열기는 못 막으므로 A 의 대체가 아니다.

## 수정 후 증명 방법
1. 같은 하네스(운영 대신 로컬 빌드: `BASE=http://localhost:<port>`):
   `for v in "390 844" "412 915" "1280 800"; do node sheet.cjs header $v; NV=3 node sheet.cjs header $v; LAT=600 node sheet.cjs quick $v; done`
   합격: 모든 실행에서 `dlg.layOvershoot == 0` 이고 `dlg.heights` 가 한 값. 현재 코드(음성 대조)는 44.2 / 106.7 / 20.7.
2. 회귀 테스트 1개(제안 — `e2e/voucher-sheet-open.spec.ts` 에 추가): store_vouchers 를 500ms 지연 + `[]` 로 route,
   헤더 버튼 클릭, 시트가 뜬 뒤 1.5s 동안 rAF 로 `[role=dialog]` 의 `rect.top − translateY` 를 모아 `max − min ≤ 1` 단언.
   현재 코드로 돌리면 44px 로 **실패해야** 한다(음성 대조를 실제로 실행할 것). 뷰포트는 375×812 보다 **높은 412×915 를 같이** 돈다 — 88vh 상한이 낙하를 가리는 폭이 달라서다.

## [미검증]
- 실기기(S26) 주소창 접힘 상태: 하네스는 dvh==svh 라 재현 불가. 88vh 계산이 실기기에서 어떻게 잡히는지는 모른다.
- 실제 운영 응답 지연: 250/600ms 로 근사. 응답이 첫 프레임(~170ms) 전에 오는 기기·네트워크에서는 안 보일 수 있다(오너가 '살짝'이라 한 것과 모순 없음).
- 내 정보(대시보드) 페이지의 같은 스켈레톤 붕괴 CLS 는 재지 않았다.
- 목 업주 세션의 `user.verified` 값에 따라 VoucherWallet 경고 박스가 끼는 경우(보유 >0 & 미인증)는 3장 조건에서만 부분적으로 거쳤다.

## 띄운 프로세스
Playwright chromium 을 실행마다 띄우고 `browser.close()` 로 닫았다(전부 `timeout` 래핑). CPU 부하 프로세스·서버 0개. 남은 프로세스 없음(조회 확인 — 남아 있는 chrome 은 사용자 브라우저).
