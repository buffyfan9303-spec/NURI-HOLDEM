# NURI HOLDEM — Google Play 등록 가이드 (웹앱 → TWA)

웹앱(PWA)을 **TWA(Trusted Web Activity)** 로 감싸 Play 스토어에 올린다.
별도 앱 코드 없이 `nuriholdem.com` 을 그대로 전체화면 앱으로 띄운다(웹을 배포하면 앱도 바로 바뀐다).

> **2026-10-08 개정(출시 준비).** 2026-09-04 판의 사실 중 바뀐 것: ① 광고 — 지금은 매장 '유료광고'·커뮤니티 광고 칸·클락 광고 기능이 있다
> ② 본인인증·매장 이용권 스위치 **켜짐** ③ 위치정보 이용약관 공개 주소 신설 ④ 테마색 #101823 ⑤ AAB 빌드 스크립트 추가.
> 세부 문서: [store-listing](playstore/store-listing.md)(최종 원고) · [app-access](playstore/app-access.md)(심사관 안내) ·
> [data-safety](playstore/data-safety.md) · [content-rating](playstore/content-rating.md) ·
> [gambling-policy](playstore/gambling-policy.md) · [twa-technical](playstore/twa-technical.md)
> 오너가 할 일의 순서·입력값은 저장소 밖 실행표(`Documents/누리홀덤_앱스토어_1007/10_출시실행표_1008.md`)에 있다.

---

## ⛔ 되돌리기 가장 비싼 실수 3가지 — 먼저 읽을 것

### 1. 콘텐츠 등급 설문에서 카테고리를 **게임이 아닌 앱**으로 고른다

한국에서 GRAC 등급은 **게임에만** 나오고, 게임이 아닌 앱은 Google Play 자체 등급을 쓴다
([공식](https://support.google.com/googleplay/android-developer/answer/9859655): "GRAC ratings are only issued for games").
'게임'으로 고르면 홀덤 성격상 청소년이용불가 → GRAC 직접 심의·사행성 확인 경로가 열린다.
이 앱에는 칩을 걸고 승패를 가리는 화면이 없다 — GTO 도구는 정답이 정해진 문제·계산기, 핸드 리플레이어는 기록 재생 뷰어다.

### 2. 광고는 **사실대로** 신고한다 (2026-10-08 판단: '예')

> ⚠️ 2026-09-04 판은 "광고 없음"이라고 했다. **지금은 사실이 아니다.**
> - 커뮤니티 매장 목록의 `AD`·'유료광고' 표시 매장(`venues.is_paid_ad`, 운영 1곳 — 2026-10-08 읽기 조회)
> - 커뮤니티 광고 칸(`community_ads` — 승격 게시글, 지금 게재 0) · 클락 화면 광고(`clock_ads`, 0) · 홈 배너 외부 링크(1)
> Play 의 광고 기준은 서드파티 SDK 가 아니어도 "다른 콘텐츠와 구분되지 않는 네이티브 광고"·자사 배너를 광고로 본다
> ([광고 신고 도움말](https://support.google.com/googleplay/android-developer/answer/9859455)). 유료로 노출 순서를 바꿔 주는 매장 카드는 이에 가깝다.
> 그래서 '광고 포함: **예**'가 안전한 답이다. 사실과 다른 '아니요'는 그 자체로 허위 신고다.
>
> 🔴 **함께 걸리는 위험**: Play 는 **도박 광고**를 싣는 앱에 9개 요건을 붙이고, 그중 8번이 "도박·실머니 게임·토너먼트의 지원·컴패니언 기능 금지"다
> ([도박 정책](https://support.google.com/googleplay/android-developer/answer/9877032)). 홀덤펍 광고가 '도박 광고'로 분류되면 장부·대회 안내 기능과 충돌한다.
> 판단은 오너 몫(실행표 ③ 위험 R1) — 홀덤펍 유료 노출을 계속할지, 광고 문구를 '대회 정보'로 한정할지.

### 3. 카테고리는 **라이프스타일**(대안: 스포츠)

기능이 거의 같은 국내 선례 KHPL(오프라인 홀덤펍 일정·클락·좌석·비현금 포인트)이 라이프스타일 · Google Play 19+ 로 게재돼 있다
(2026-09-04 조사, `playstore/gambling-policy.md`). 웹 manifest 의 `categories` 도 lifestyle 을 맨 앞으로 맞췄다.

---

## 0. 준비 상태 (2026-10-08 실측)

| 항목 | 상태 | 증거 |
|---|---|---|
| HTTPS · Service Worker | ✅ | Vercel · `public/sw.js` |
| `manifest.webmanifest` | ✅ id `/` · scope `/` · start_url `/?source=pwa` · standalone · 아이콘 any/maskable/monochrome · shortcuts 4 · screenshots 4 | `src/manifestTwa.contract.test.ts` 12건 통과 |
| 테마색 | ✅ **#101823**(현행 '4안 미드나이트 블루')로 고침 — 이전 #0A0A0A 는 옛 'E+황동' 색이라 스플래시만 옛 색이었다 | 계약 ①② (index.html meta theme-color 와 같아야 통과) |
| `twa-manifest.json` | ✅ `playstore/twa/twa-manifest.json` — 패키지 `com.nuriholdem.twa` · 이름 '누리홀덤' · 회전 허용(`default`) · 위치 위임 끔 | 계약 ③~⑥ |
| AAB 빌드 | ✅ **서명 없는 검증 빌드 성공** — targetSdk 36 · 권한 `POST_NOTIFICATIONS` 하나 | `npm run playstore:twa` → aapt2 badging |
| 업로드 키 서명 AAB | ⬜ 오너 몫(키 생성·보관) | 아래 2절 |
| `assetlinks.json` 지문 | ⬜ 자리표시자 — Play Console 에서만 얻는다 | 아래 3절 |
| 개인정보처리방침 | ✅ https://nuriholdem.com/legal/privacy.html | |
| 계정 삭제 URL | ✅ https://nuriholdem.com/legal/delete-account.html (로그인 없이 열림 · 앱 이름·삭제/보관 항목·기한) | |
| 위치기반서비스 이용약관 | ✅ **신설** https://nuriholdem.com/legal/location.html (배포 후) — 원본은 `LegalDocsModal.tsx` 의 LOCATION | `npm run legal:check` |
| 인앱 결제 | ✅ 없음(PortOne 은 본인인증 전용) | |
| 스토어 자산 | ✅ 폰 스크린샷 7장(1080×1920, 24비트 PNG) · 피처 그래픽 1024×500 · 아이콘 512 | `npm run playstore:assets` |

## 1. 스토어 자산 생성

```bash
npm run playstore:assets          # 운영 사이트를 읽기만 해서 찍는다(쓰기 0)
```

`playstore/screenshots/*.png`(1080×1920 · 7장)와 `playstore/feature-graphic-1024x500.png` 가 생긴다(git 제외).
기본은 `--fixture` — 제휴 매장 상호·로고·주소를 가명으로 덮는다(BLOCKED #14). 업로드 순서는 `playstore/store-listing.md` ⑤.

## 2. AAB 만들기 (Bubblewrap)

전제(이 PC 2026-10-08 확인): `@bubblewrap/cli` 1.25.0(전역) · JDK 17.0.20.1 · Android SDK platform 36 / build-tools 36.1.0 — 모두 `~/.bubblewrap`.

```bash
npm run playstore:twa                                  # 검증 빌드(서명 없음) — 누구나
node scripts/playstore-twa.mjs --release --keystore <업로드키.keystore> --version-code 1 --version-name 1.0.0
#   ↑ 업로드 빌드 — 오너 PC 에서만. 비밀번호는 환경변수 BUBBLEWRAP_KEYSTORE_PASSWORD · BUBBLEWRAP_KEY_PASSWORD 로만.
```

- 작업 폴더는 **저장소 밖**(기본: OS 임시 폴더 `nuri-twa-build`)이다. 생성된 Gradle 프로젝트·키는 커밋되지 않는다(`.gitignore` 에 `*.keystore`·`*.jks`·`playstore/twa/*`).
- ⚠ 이 PC 는 `NoDefaultCurrentDirectoryInExePath=1` 이라 맨손 `bubblewrap build` 가 `gradlew.bat` 을 못 찾는다 — 스크립트가 작업 폴더를 PATH 앞에 넣어 우회한다.
- 업로드 키 만들기(오너, 한 번): `keytool -genkeypair -v -keystore nuri-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`
  (keytool 위치: `~/.bubblewrap/jdk-extract/jdk-17.0.20.1+1/bin/keytool.exe`). **키 파일과 비밀번호를 잃으면 업데이트를 못 올린다** — 별도 백업 2곳.
- 버전: 올릴 때마다 `--version-code` 를 1씩 올린다. 웹만 바뀌면 AAB 재업로드는 필요 없다(색·아이콘·바로가기·패키지 설정을 바꿀 때만).

## 3. assetlinks.json 지문 채우기

`public/.well-known/assetlinks.json` 의 `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE` 를 교체한다.
Play Console → 앱 → **테스트 및 출시 → 앱 무결성 → 앱 서명** 의 ① 앱 서명 키 인증서 SHA-256 ② 업로드 키 인증서 SHA-256 — **둘 다** 배열에 넣는다
(내부 테스트는 업로드 키, 스토어 배포본은 Google 키로 서명된다).

```json
"sha256_cert_fingerprints": [
  "<앱 서명 키 SHA-256 (AA:BB:… 형식)>",
  "<업로드 키 SHA-256>"
]
```

- **지금 자리표시자가 운영에 떠 있는 것은 무해하다.** 패키지를 설치한 기기가 없고, 잘못된 지문은 "검증 실패 → 주소창 표시"로만 이어지며
  다른 앱에 권한을 주지 않는다(형식이 틀린 값은 어떤 인증서와도 맞지 않는다). 웹 동작에도 영향 0.
- 지문을 넣은 뒤 배포하고 [Digital Asset Links 검사기](https://developers.google.com/digital-asset-links/tools/generator)로 확인한다.
  틀리면 앱 상단에 Chrome 주소창이 보인다(전체화면 실패).

## 4. Play Console 입력 (오너)

순서·화면 위치·정확한 입력값은 실행표 ②. 요약:
1. 개발자 계정(조직 권장 — 개인 계정은 2023-11-13 이후 생성이면 **12명 × 14일 비공개 테스트** 필수,
   [공식](https://support.google.com/googleplay/android-developer/answer/14151465))
2. 앱 만들기 — 이름 `store-listing.md` ①, 기본 언어 한국어, **앱**, 무료
3. AAB 업로드(내부 테스트 → 비공개 → 프로덕션)
4. 스토어 등록정보 — `store-listing.md`
5. 앱 콘텐츠: 개인정보처리방침 · 앱 액세스(`app-access.md`) · 광고(예) · 콘텐츠 등급(`content-rating.md`) ·
   타겟층(만 18세 이상만) · 데이터 보안(`data-safety.md`) · 계정 삭제 URL
6. 결제를 나중에 열면(부스트·유료 마크 등) 콘텐츠 등급의 '디지털 구매'와 데이터 보안을 **다시 제출**한다.

## 5. 업데이트

웹은 배포 즉시 반영된다. AAB 재빌드는 `playstore/twa/twa-manifest.json`(색·아이콘·바로가기·이름)을 바꿀 때만 — `--version-code` 를 올려 재업로드.
웹 테마색을 바꾸면 `manifest.webmanifest` 와 `twa-manifest.json` 을 같은 커밋에서 바꾼다(계약 ①②가 잡는다).
