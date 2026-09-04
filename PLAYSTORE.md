# NURI HOLDEM — Google Play 등록 가이드 (웹앱 → TWA)

웹앱(PWA)을 **TWA(Trusted Web Activity)** 로 감싸 Play Store에 올린다.
별도 앱 코드 없이 `nuriholdem.com` 을 그대로 전체화면 앱으로 띄운다.

> **2026-09-04 전면 개정.** 정책 원문·국내외 선례 앱을 실제로 조사해 다시 썼다.
> 세부 근거와 그대로 복사할 원고는 `playstore/` 아래 5개 문서에 있다:
> [store-listing](playstore/store-listing.md) · [content-rating](playstore/content-rating.md) ·
> [data-safety](playstore/data-safety.md) · [gambling-policy](playstore/gambling-policy.md) ·
> [twa-technical](playstore/twa-technical.md)

---

## ⛔ 되돌리기 가장 비싼 실수 3가지 — 먼저 읽을 것

### 1. 콘텐츠 등급 설문 첫 화면에서 **'앱'** 을 고른다 (게임 아님)

여기서 '게임'을 고르면 IARC가 한국 등급을 산출하고, 이 앱의 19세 성격상 **청소년이용불가**가 나올 소지가 있다.
그런데 자체등급분류사업자(구글)는 청소년이용불가 게임물을 분류할 수 없어 **GRAC 직접 심의 + 사행성게임물 확인 절차**로 넘어간다.
홀덤 도메인에서 그 경로는 최악이다.

이 앱은 게임물이 아니다 — GTO 트레이너는 표준 차트·Nash로 채점되는 **정답이 정해진 객관식 퀴즈**이고,
핸드 리플레이어는 **기록 재생 뷰어 + 에퀴티 계산기**다. 칩을 걸고 우연으로 승패를 가리는 화면이 하나도 없다.

### 2. 광고는 **"없음"** 으로 신고한다

> ⚠️ **이 문서의 옛 판본은 "AdSense 사용 → '광고 포함' 체크"라고 지시하고 있었다. 그건 틀렸다.**
> AdSense Auto Ads는 2026-08 정책 대응으로 이미 제거됐고(`e419d30`), 코드에 광고 SDK가 **0개**다.
> 사실과 다르게 '광고 포함'으로 신고하면 ① 허위 신고이고 ② 도박 광고 규정(추가 요건 9개)을 스스로 불러들인다.
> 그 9개 중 8번은 *"도박·실머니게임·토너먼트의 지원 또는 컴패니언 기능(참가금 관리 등) 제공 금지"* 인데,
> 우리 장부(바인 기록)와 대회 안내는 이 요건을 구조적으로 만족할 수 없다. **자충수다.**

### 3. 카테고리는 **스포츠**

와홀덤(`kr.co.waholdem`)이 같은 성격으로 **스포츠 · 3세 이상 · 디스크립터 0개**로 통과했다.
'마인드 스포츠' 프레이밍이 `public/legal/anti-gambling.html` 의 법적 논거와도 일치한다.

---

## 국내 선례 — 갈림길은 "앱 안에서 포커를 칠 수 있는가" 하나다

| 앱 | 패키지 | 카테고리 | 등급 | GRAC | 결정 요인 |
|---|---|---|---|---|---|
| **와홀덤 링크** | `kr.co.waholdem` | **스포츠** | **3세** | 없음 | 설명문에 도박·현금·상금·바이인 단어 **0개**. "대한민국 마인드 스포츠의 표준" |
| 홀덤온 | `kr.co.joyimpact.holdemon` | 엔터테인먼트 | 12세 | 없음 | **'바인액'을 필터 조건으로 명시하고도 12세.** 광고+인앱결제 둘 다 있음 |
| 홀딩스타 | `co.kr.holdingstar.holdingstar` | 라이프스타일 | 청불 | 없음 | 랭킹·포인트·마일리지 + 학습 콘텐츠 쓰고도 통과 |
| 러너러너 | `com.runnersoft.runnerrunner` | 라이프스타일 | 청불 + **사행성** | **CC-OM-240314-002** | ⚠ *"참가비 없는 무료 토너먼트 홀덤 게임을 매일 진행"* — **앱 내 플레이 때문에 GRAC로 떨어짐** |
| 한게임 홀덤 (대조군) | `com.nhn.holdem` | 게임>카드 | 청불 | 필수 | 앱에서 실제로 침 |

**교훈**: 카테고리를 '앱'으로 골라도 앱 안에 플레이 가능한 포커가 있으면 GRAC를 못 피한다(러너러너).
반대로 참가비 금액(`바인액`)이나 랭킹·포인트를 써도 그 자체로는 반려되지 않는다(홀덤온·홀딩스타).
**우리가 지켜야 할 선은 "GTO 학습도구가 플레이 가능한 포커로 읽히지 않게 하는 것"** 하나다.

해외 선례도 같은 공식이다 — 일본 Poker Station은 대회 일정·티켓·QR 체크인·**블라인드 타이머**만 말하고 3세를 받았다.
즉 **우리 토너먼트 클락은 위험 요소가 아니다.**

---

## 🔴 Play 밖의 더 큰 리스크 — 오너 확인 필요

조사 중 Play 정책보다 무거운 것이 나왔다. **`playstore/gambling-policy.md` 를 반드시 읽을 것.**

2024-02-27 시행 **관광진흥법 §26조의2**(카지노업 유사행위, 7년 이하 징역/7천만원 이하 벌금)의 후속으로
문체부·사행산업통합감독위원회·경찰청이 2024-05-10 내놓은 지침이 아래를 위법으로 명시한다:

- (a) **게임으로 적립한 포인트를 홀덤펍 입장료로 쓰게 하는 행위** ← 우리 랭킹 → 포인트 → 이용권 사슬
- (b) **특정인 식별이 불가능한 시드권 제공** ← 일정 상세의 '파트너 / 시드권 발행'
- (c) **참가비를 모아 상금·상품을 제공하는 홀덤대회** ← §28이 표시를 유지하기로 한 참가비 + GTD 조합

현재 이용권은 킬스위치(`app_settings.identity_voucher_enabled`) **기본 비활성**이고 유상 충전 경로도 닫혀 있어
제출 시점에는 노출되지 않는다. 그대로 두고 제출하는 것이 안전하다.
(b)(c)는 우리가 만든 것이 아니라 **매장이 여는 대회의 성격**이므로 법률 검토가 필요하다 —
BLOCKED #1(변호사 유권해석)과 같은 사안이다.

---

## 0. 사전 준비 상태 (2026-09-04 실측)

- ✅ HTTPS (Vercel)
- ✅ `manifest.webmanifest` — id/name/icons(192·512·maskable)/standalone/shortcuts/share_target
  · **2026-09-04 수정**: `theme_color`·`background_color` 가 구 테마 `#151221` 로 남아 있어 현행 `#06080F` 로 고침.
    TWA 스플래시와 상태바가 이 값을 쓰므로 안 고치면 앱이 옛 보라색으로 뜬다.
- ✅ Service Worker `/sw.js`
- ✅ `https://nuriholdem.com/.well-known/assetlinks.json` 이 **200 으로 열림**(경로·배포 확인 완료)
- ✅ 광고 SDK 0개 · 인앱 결제 경로 0개(PortOne은 본인인증 전용, `requestPayment` 호출 0곳)
- ✅ 개인정보처리방침 URL: `https://nuriholdem.com/legal/privacy.html`
- ✅ 폰 스크린샷 7장(1080×1920) · 피처 그래픽(1024×500) — `npm run playstore:assets`
- ⬜ `assetlinks.json` 의 SHA-256 지문 — **Play Console 에서 받아야 하므로 오너만 가능**

## 1. 스토어 자산 생성

```bash
npm run playstore:assets
```

`playstore/screenshots/*.png`(1080×1920 · 7장)와 `playstore/feature-graphic-1024x500.png` 가 생성된다.

> **⚠ 상표**: 기본은 `--fixture` 모드로, 제휴 매장 상호·로고·주소를 가명으로 덮어 촬영한다
> (BLOCKED #14 의 기본값 "캡처는 가명 픽스처로 촬영"). 실제 매장 브랜드가 들어간 판이 필요하면
> 서면 허락을 받은 뒤 `node scripts/playstore-shots.mjs`(플래그 없이)로 `playstore/screenshots-real/` 에 뽑는다.

## 2. TWA 패키지 생성

### (A) PWABuilder — 가장 쉬움
`https://pwabuilder.com` → `https://nuriholdem.com` → Package For Stores → Android → Generate Package.
패키지명 `com.nuriholdem.twa`, 서명키는 **분실 시 업데이트 불가**이므로 안전 보관.

### (B) Bubblewrap — CLI
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://nuriholdem.com/manifest.webmanifest
bubblewrap build
```

## 3. assetlinks.json 지문 채우기

`public/.well-known/assetlinks.json` 의 `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE` 교체:
Play Console → 앱 → 설정 → 앱 무결성 → **SHA-256 인증서 지문**(Google이 최종 서명하므로 이 값이 정답).
업로드키 지문만 넣으면 링크 검증에 실패한다 — 둘 다 넣어도 된다.

> ⚠️ 틀리면 앱 상단에 Chrome 주소창이 보인다(전체화면 실패).

## 4. Play Console 등록

1. 개발자 등록 $25(1회)
2. 앱 만들기 — 이름은 `playstore/store-listing.md` ①번 그대로, 언어 한국어, **앱**(게임 아님), 무료
3. `.aab` 업로드 — **비공개 테스트 트랙부터** 권장
4. 스토어 등록정보 — 원고는 `playstore/store-listing.md`, 자산은 1번에서 생성한 것
5. **콘텐츠 등급 설문** — 답안은 `playstore/content-rating.md`. 도박 문항 2개 모두 '아니요'
6. **데이터 보안** — 답안은 `playstore/data-safety.md` (거짓 기재 시 앱 정지)
7. 개인정보처리방침 URL 입력
8. **광고: 없음** (위 ⛔2 참조)
9. 대상 연령: 만 19세 이상

## 5. 업데이트

웹은 배포 즉시 반영(TWA는 실시간 웹을 띄운다).
`.aab` 재빌드는 **앱 셸/네이티브 설정을 바꿀 때만** — 버전코드를 올려 재업로드한다.
