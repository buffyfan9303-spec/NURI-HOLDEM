# NURI HOLDEM — Google Play 등록 가이드 (웹앱 → TWA)

웹앱(PWA)을 **TWA(Trusted Web Activity)** 로 감싸 Play Store에 올립니다.
별도 앱 코드 없이 `nuriholdem.com` 을 그대로 전체화면 앱으로 띄웁니다.

## 0. 사전 준비 (이미 완료된 것 ✅)
- ✅ HTTPS (Vercel)
- ✅ `manifest.webmanifest` — name/icons(192·512·maskable)/standalone/theme_color/shortcuts
- ✅ Service Worker `/sw.js` — 앱 셸 캐싱 + 웹푸시, 로드 시 자동 등록
- ✅ 앱 느낌 — 흰 화면 플래시 제거, 당겨서새로고침/더블탭줌/이미지 롱프레스 차단(설치형)
- ⬜ `/.well-known/assetlinks.json` — **지문(SHA-256)만 채우면 됨** (아래 3번)

## 1. PWA 설치 가능 여부 확인
Chrome DevTools → Lighthouse → "Progressive Web App" 감사 → 모두 통과 확인.
또는 모바일 Chrome에서 `nuriholdem.com` 접속 → 메뉴에 "앱 설치"가 떠야 함.

## 2. TWA 패키지 생성 (둘 중 하나)
### (A) PWABuilder — 가장 쉬움(웹)
1. https://www.pwabuilder.com → `https://nuriholdem.com` 입력
2. "Package For Stores" → Android → **Generate Package**
3. 패키지명 `com.nuriholdem.twa` 확인, 서명키 생성(다운로드 후 안전 보관 — 분실 시 업데이트 불가)
4. 받은 `.aab`(업로드용) + `assetlinks.json`(PWABuilder가 생성한 지문 포함) 확보

### (B) Bubblewrap — CLI(세밀한 제어)
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://nuriholdem.com/manifest.webmanifest
bubblewrap build          # app-release-bundle.aab 생성 + 서명키 생성
```

## 3. assetlinks.json 채우기 (도메인 ↔ 앱 연결)
`public/.well-known/assetlinks.json` 의 `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE` 를 실제 지문으로 교체:
- **권장:** Play Console → 앱 → 설정 → 앱 무결성(App signing) → **SHA-256 인증서 지문** 복사
  (Google이 최종 서명하므로 이 지문이 정답. 업로드키 지문만 넣으면 링크 검증 실패함 → 둘 다 넣어도 됨)
- 커밋·배포 후 `https://nuriholdem.com/.well-known/assetlinks.json` 가 200으로 열리는지 확인
- 검증: https://developers.google.com/digital-asset-links/tools/generator

> ⚠️ assetlinks가 틀리면 앱 상단에 Chrome 주소창이 보입니다(전체화면 실패). 지문 정확히 확인.

## 4. Play Console 등록
1. https://play.google.com/console (개발자 등록 $25 1회)
2. 앱 만들기 → 이름 "NURI HOLDEM", 언어 한국어, 앱/무료
3. **`.aab` 업로드** (프로덕션 또는 비공개 테스트 트랙부터 권장)
4. 스토어 등록정보: 짧은 설명·전체 설명·아이콘(512)·**그래픽 이미지(1024×500)**·**스크린샷(폰 2장 이상)**
5. 콘텐츠 등급 설문, **데이터 보안(Data Safety)** 양식(수집: 이메일/닉네임/푸시토큰 등 정확히 기재)
6. 개인정보처리방침 URL(앱 내 법적고지/약관 페이지 링크)
7. 대상 연령·광고 포함 여부(AdSense 사용 → "광고 포함" 체크)
8. 출시 검토 제출 → 승인까지 보통 수일

## 5. 업데이트
웹은 배포 즉시 반영(TWA는 실시간 웹을 띄움). **앱 셸/네이티브 설정 변경 시에만** `.aab` 재빌드·버전코드 올려 재업로드.

## 주의 — 홀덤 콘텐츠 정책
Play는 "도박/카지노" 정책이 엄격합니다. 본 앱은 **실제 베팅·환전 없음(대회 일정·커뮤니티·매장운영)** 임을 스토어 설명·데이터보안에 명확히 기재하세요. 실머니 요소가 없어야 안전합니다.
