# TWA 패키징 기술 준비

<!-- 2026-09-04 조사 산출물. 각 주장은 1차 출처(Google/Play/IARC 공식 문서) 또는 파일:줄 근거를 달았고,
     blocker/high 주장은 별도 에이전트가 **반증을 시도**해 검증했다. 검증에서 뒤집힌 것은 아래 '적대적 검증'에 남겼다. -->


## 결론

TWA 패키징의 배포 인프라는 이미 준비돼 있다 — https://nuriholdem.com/.well-known/assetlinks.json 이 200 · Content-Type: application/json · ACAO * 로 실제로 열리고(curl 실측), Vite 가 public/.well-known 을 dist 로 복사하며(dist/.well-known/assetlinks.json 존재), vercel.json 의 rewrite 2개(/s/:code · /p/:id)와도 충돌하지 않는다. 남은 것은 그 파일 안의 SHA-256 지문 플레이스홀더 하나이고, 이건 Play Console 앱 서명 화면에서만 얻을 수 있어 오너 몫이다. 기술적 실블로커는 3개다 — ① assetlinks 지문 미기입(전체화면 실패 → 앱 상단에 Chrome 주소창 노출) ② Play 의 target API 36(Android 16) 의무화 기한이 2026-08-31 로 **이미 지났다**(오늘 2026-09-04) — 구버전 Bubblewrap 이 생성한 targetSdk 34/35 는 업로드 자체가 거절된다 ③ 2023-11-13 이후 만든 개인 개발자 계정이면 테스터 12명 × 연속 14일 폐쇄테스트를 통과해야 프로덕션 접근이 열려, 지문을 오늘 채워도 정식 출시까지 최소 2주가 더 걸린다. manifest 쪽 결함은 theme_color/background_color 가 구 플럼 #151221 로 남아 있어(index.html 은 #06080F) Bubblewrap 이 이 색을 **빌드 시점에 APK 스플래시로 구워 넣는다** — 앱을 켤 때마다 플럼 스플래시 → 딥네이비 앱으로 색이 튄다. 여기에 shortcuts 가 5개인데 Bubblewrap 은 4개에서 잘라내므로(TwaManifest.ts 의 `if (shortcuts.length === 4) break;`) '내 매장'이 조용히 사라진다. 한편 브리핑에 있던 두 가지 우려는 소스 확인 결과 **해당 없음**이었다: PortOne 은 결제가 아니라 `requestIdentityVerification`(본인인증) 한 곳에만 쓰이고(src/components/features/IdentityVerificationButton.tsx:45) 랭킹상점은 현금이 아닌 매장 포인트 기반이라 Google Play 결제 정책(Play Billing 강제) 노출이 없으며, AdSense 도 Google 정책 문서가 Trusted Web Activity 를 지원 뷰잉 프레임으로 **명시**하고 있어 광고 정책 위반이 아니다.



## 근거 (위험도 · 출처)

- **[blocker]** 그 파일의 지문이 아직 플레이스홀더다 — sha256_cert_fingerprints 값이 문자열 'REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE' 이다. 이 상태로 TWA 를 띄우면 도메인 검증이 실패해 앱 상단에 Chrome 주소창이 그대로 보인다(전체화면 실패). TWA 출시의 1순위 블로커.
  · 출처: `public/.well-known/assetlinks.json:8 및 라이브 응답 본문(WebFetch https://nuriholdem.com/.well-known/assetlinks.json)`

- **[blocker]** Google Play 의 target API level 의무화 기한이 2026-08-31 로 이미 경과했다. 신규 앱과 모든 업데이트는 Android 16(API 36) 이상을 타깃해야 한다. 전역 설치된 구버전 @bubblewrap/cli 가 생성하는 targetSdk 34/35 로 빌드하면 .aab 업로드 단계에서 거절된다(연장 신청 시 2026-11-01 까지, 다만 이는 기존 앱 대상).
  · 출처: `https://developer.android.com/google/play/requirements/target-sdk — 신규 앱·업데이트 Android 16(API 36), 기한 2026-08-31, 연장 2026-11-01`

- **[blocker]** 2023-11-13 이후 생성된 개인(personal) Google Play 개발자 계정은 테스터 12명이 연속 14일 이상 옵트인된 폐쇄 테스트를 완료해야 프로덕션 접근 권한을 신청할 수 있다. 법인(organization) 계정과 그 이전 개인 계정은 면제. 지문을 오늘 채워도 정식 출시까지 최소 2주가 추가로 든다 — 일정 블로커.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/14151465 (2024-12-11 에 20명 → 12명으로 완화, 14일 유지)`

- **[high]** manifest 의 theme_color·background_color 가 구 테마색 #151221(딥 플럼)로 남아 있는데 index.html 의 meta theme-color 와 ThemeContext 의 다크 토큰은 #06080F 다. Bubblewrap 은 이 두 값을 빌드 시점에 읽어 APK 의 스플래시 배경(background_color)과 상태바/툴바 색(theme_color)으로 구워 넣으므로, 웹을 아무리 고쳐도 앱 실행 때마다 플럼 스플래시가 먼저 뜬 뒤 딥네이비 앱으로 색이 튄다. CLAUDE.md 모션 헌법의 '색 회귀 = 기존 오류' 에 해당.
  · 출처: `public/manifest.webmanifest:12-13(#151221) vs index.html:47(meta theme-color #06080F) vs src/contexts/ThemeContext.tsx:38(dark #06080F / light #F5F7FB)`

- **[high]** shortcuts 가 5개인데 Bubblewrap 은 4번째에서 루프를 끊는다 — 마지막 항목 '내 매장'(/?tab=my-store)이 경고 없이 APK 에서 누락된다. 어느 4개를 남길지 지금 정하지 않으면 도구가 대신 정한다.
  · 출처: `public/manifest.webmanifest:22-28(5개) vs https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/core/src/lib/TwaManifest.ts — `if (shortcuts.length === 4) { break; }``

- **[medium]** 현재 shortcuts 의 URL 5개(browse·live·community·market·my-store)는 전부 여전히 유효한 딥링크다 — App.tsx 의 허용 목록이 ['home','browse','live','community','market','tools','calendar','my-store','admin'] 이다. 다만 하단 탭바에 실제로 뜨는 것은 홈·라이브·커뮤니티·GTO(tools)·캘린더라서, 지금 shortcuts 는 앱의 실제 내비게이션과 어긋나 있다.
  · 출처: `src/App.tsx:170(TabId), src/App.tsx:754(valid 목록), index.html 정적 셸 하단 탭바(홈·라이브·커뮤니티·GTO·캘린더)`

- **[medium]** icons 는 Bubblewrap 요건을 충족한다 — findSuitableIcon 이 any·maskable 모두 최소 512px 을 요구하는데 icon-512.png(any)와 icon-maskable-512.png(maskable) 모두 실제 512x512 다(PNG IHDR 실측). 단 purpose:'monochrome' 아이콘이 없어(최소 48px 요구) Bubblewrap 이 알림용 단색 아이콘을 다른 아이콘에서 유도하고, 그 결과 Android 상태바 작은 아이콘이 흰 뭉개짐으로 뜨는 경우가 잦다. sw.js 가 실제로 push/notificationclick 을 구현하고 있어 이게 눈에 띈다.
  · 출처: `public/icon-512.png·icon-maskable-512.png IHDR 실측 512x512 / TwaManifest.ts findSuitableIcon(any 512, maskable 512, monochrome 48) / public/sw.js:64-76`

- **[medium]** manifest 에 screenshots 필드가 없다. 영향은 두 가지로 갈리는데 흔한 오해를 정정할 필요가 있다 — ① 실제 영향은 Chrome 안드로이드의 richer install UI(설명+스크린샷이 있는 큰 설치 다이얼로그)가 뜨지 않고 최소 설치 바로 폴백되는 것, 그리고 PWABuilder 리포트 카드에서 감점되는 것뿐이다. ② Play 스토어 등록정보의 스크린샷과는 **무관하다** — Bubblewrap 소스에 screenshots 필드가 아예 없고, Play 는 폰 스크린샷 최소 2장(추천 노출 자격은 4장·1080px·9:16)과 1024x500 피처 그래픽을 Play Console 에 별도 업로드받는다. 즉 manifest 에 넣어도 스토어 등록정보는 여전히 손으로 올려야 한다.
  · 출처: `public/manifest.webmanifest(screenshots 없음) / TwaManifest.ts 에 screenshots 필드 부재(WebFetch 확인) / https://support.google.com/googleplay/android-developer/answer/9866151 계열 요건 — 폰 최소 2장, 추천 노출 4장·최소 1080px·16:9 또는 9:16, 피처 그래픽 1024x500 JPEG/24bit PNG(알파 없음)`

- **[medium]** orientation 이 'portrait-primary' 라 TWA 액티비티가 세로로 고정된다. 유저(모바일 99%)에겐 맞지만, CLAUDE.md 플랫폼 분리에 따르면 내 매장·장부·클락 설정은 PC/태블릿 밀도 화면이다 — 태블릿에 앱을 깐 매장 운영주는 가로로 돌릴 수 없다. 웹 manifest 를 건드리지 않고 twa-manifest.json 의 orientation 만 'default' 로 두면 브라우저 PWA 동작은 유지한 채 앱만 회전 허용이 된다(Bubblewrap DEFAULT_ORIENTATION = 'default').
  · 출처: `public/manifest.webmanifest:10 / CLAUDE.md '플랫폼 분리' 절 / TwaManifest.ts DEFAULT_ORIENTATION='default'`

- **[medium]** 본인인증 흐름은 TWA 에서 실기기 검증이 필요한 유일한 고위험 경로다. PortOne 본인인증은 통신사 PASS 앱 등으로 넘어가는 외부 스킴/intent 리다이렉트를 쓰는데, 이 목적지들은 manifest scope '/' 밖이라 TWA 가 주소창 달린 Custom Tab 으로 띄우고 인증 후 nuriholdem.com 으로 되돌아와야 한다. 다행히 현재 이 기능은 킬스위치(app_settings.identity_voucher_enabled)가 기본 OFF 라 출시를 막지는 않는다.
  · 출처: `src/api/vouchers.ts:4-7 (킬스위치 기본 비활성) / src/components/features/IdentityVerificationButton.tsx:45 / public/manifest.webmanifest:7 (scope '/')`

- **[medium]** sw.js 의 navigate 핸들러가 네트워크 우선이고 앱 셸 HTML 을 전혀 캐시하지 않는다(CACHEABLE 정규식에 .html 없음, 프리캐시는 /offline.html 한 장뿐). TWA 는 웹 콘텐츠가 첫 페인트를 낼 때까지 스플래시를 유지하므로, 지하철 같은 느린 망에서 앱을 켜면 HTML 왕복 시간 내내 스플래시(=위의 잘못된 #151221)가 머문다. 오프라인이면 앱 대신 offline.html 이 뜬다.
  · 출처: `public/sw.js:31-38(navigate 네트워크 우선 → offline.html 폴백), public/sw.js:9(CACHEABLE 에 html 미포함), public/sw.js:13(프리캐시 offline.html 단독)`

- **[medium]** Bubblewrap 실행 환경 요건이 까다롭다 — JDK 는 정확히 17 이어야 하고(문서: 17 미만은 컴파일 불가, 그보다 높으면 Android command line tools 와 호환되지 않음), Node.js 는 14.15.0 이상이다. 개발 머신에 JDK 21+ 만 있으면 bubblewrap build 가 실패한다. minSdkVersion 기본값은 21 이라 TWA 요건(Chrome 72+)에 충분하고, enableNotifications 기본값이 true 라 sw.js 의 웹푸시가 Android 13+ 의 POST_NOTIFICATIONS 위임과 함께 동작한다.
  · 출처: `https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md (JDK 17, Node 14.15.0+) / TwaManifest.ts DEFAULT_MIN_SDK_VERSION=21, DEFAULT_ENABLE_NOTIFICATIONS=true`

- **[low]** assetlinks.json 이 라이브 도메인에서 실제로 200 으로 열리고 Content-Type: application/json; charset=utf-8, Access-Control-Allow-Origin: * 로 응답한다 — Digital Asset Links 검증이 요구하는 형태를 모두 만족한다. 배포 경로 자체는 문제 없다.
  · 출처: `curl -sI https://nuriholdem.com/.well-known/assetlinks.json → HTTP/1.1 200 OK, Content-Type: application/json; charset=utf-8, Access-Control-Allow-Origin: *, Server: Vercel`

- **[low]** PortOne 은 결제가 아니라 본인인증에만 쓰인다 — 코드베이스 전체에서 PortOne 호출은 requestIdentityVerification 한 곳뿐이고 requestPayment·requestIssueBillingKey 는 0곳이다. 랭킹상점도 현금이 아닌 매장 포인트(venue_score_entries) 기반이다. 따라서 Google Play 결제 정책(인앱 디지털 재화 판매 시 Play Billing 강제)에 걸리는 지점이 현재 없다 — 브리핑의 'PortOne 결제가 붙어 있다'는 전제는 소스와 다르다.
  · 출처: `src/components/features/IdentityVerificationButton.tsx:45 (PortOne.requestIdentityVerification 유일) / src/api/identity.ts:1 (본인인증 교차검증) / src/api/rankings.ts:225,337 (매장 포인트) — requestPayment grep 결과 0건`

- **[low]** AdSense Auto Ads 는 TWA 에서 정책 위반이 아니다 — Google 정책 문서가 Android 의 지원 뷰잉 프레임으로 'Chrome Custom Tabs' 와 'Trusted Web Activities' 를 명시적으로 열거한다. 다만 Play Console 콘텐츠 등급·데이터 보안에서 '광고 포함'은 반드시 체크해야 한다.
  · 출처: `https://support.google.com/admob/answer/48182 — 지원 뷰잉 프레임에 Trusted Web Activities 명시`

- **[low]** 동일 출처의 비해시 자산이 캐시 우선으로 무기한 고정된다 — CACHEABLE 이 /icon·/favicon·/nuri-logo·/fonts 와 .png/.webp/.woff2 등을 모두 잡는데, 이 경로들은 Vite 해시가 없어 파일 내용을 바꿔도 CACHE 이름('nuri-shell-v2')을 올리기 전까지 옛 바이트가 계속 나온다. 브라우저와 달리 TWA 사용자는 캐시를 비울 계기가 없어 이 정체가 더 오래간다. 실제 위험은 /fonts/pretendard/...-dynamic-subset.css(비해시 CSS)와 아이콘류에 한정되고, 배너는 날짜가 든 파일명(poster-roti-0827.webp)이라 사실상 무해하며 Supabase 이미지는 교차 출처라 SW 가 아예 건드리지 않는다.
  · 출처: `public/sw.js:9(CACHEABLE), public/sw.js:41-43(캐시 우선, 재검증 없음), public/sw.js:30(교차 출처 패스), public/sw.js:4(CACHE='nuri-shell-v2'), src/components/features/PosterCarousel.tsx:64`

- **[low]** offline.html 은 sw.js 자체 바이트가 바뀔 때만 갱신된다 — install 에서만 add 하고 CACHEABLE 이 .html 을 잡지 않으므로, offline.html 만 수정해 배포하면 SW 가 재설치되지 않아 옛 오프라인 페이지가 계속 나온다.
  · 출처: `public/sw.js:11-14(install 에서만 c.add('/offline.html')), public/sw.js:9(CACHEABLE 에 html 없음)`

- **[low]** index.html 의 메타태그에는 TWA 를 막는 요소가 없다 — manifest 링크·viewport(viewport-fit=cover)·theme-color·mobile-web-app-capable·apple-* 가 모두 정상이고, prefer_related_applications 도 false 라 설치 프롬프트가 억제되지 않는다. 다만 TWA 의 네이티브 크롬 색은 meta theme-color 가 아니라 **manifest 값**을 읽으므로, ThemeContext 가 런타임에 meta 를 다크/라이트로 바꿔주는 것과 무관하게 manifest 를 고쳐야 한다.
  · 출처: `index.html:44-52(manifest·viewport·theme-color·mobile-web-app-capable), public/manifest.webmanifest:16(prefer_related_applications:false), src/contexts/ThemeContext.tsx:39(런타임 meta 갱신)`


## 조치

- [🧑 오너만 가능] assetlinks.json 의 'REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE' 을 실제 SHA-256 지문으로 교체한다. **업로드 키 지문과 Play 앱 서명 키 지문 두 개를 배열에 모두** 넣는다 — 내부 테스트 트랙은 업로드 키로, 프로덕션은 Google 최종 서명 키로 서명되므로 하나만 넣으면 한쪽에서 주소창이 뜬다. 배포 후 https://developers.google.com/digital-asset-links/tools/generator 로 검증.
  · 위치: public/.well-known/assetlinks.json:8 · 지문 출처는 Play Console → 앱 → 테스트 및 출시 → 설정 → 앱 서명(App integrity)

- [🧑 오너만 가능] Google Play 개발자 계정을 만들고(등록비 $25 1회) 계정 유형을 확인한다. 2023-11-13 이후 만든 **개인** 계정이면 테스터 12명 × 연속 14일 폐쇄테스트가 프로덕션의 전제조건이므로, 지문 작업과 **병렬로 지금 시작**해야 총 일정이 2주 이상 밀리지 않는다. 법인 계정이면 면제.
  · 위치: https://play.google.com/console → 대시보드의 프로덕션 접근 권한 신청 항목

- [🤖 코드/문서 작업] manifest 의 theme_color·background_color 를 #151221 → #06080F 로 고친다. 이 두 줄이 APK 스플래시 배경과 상태바 색으로 구워지므로, .aab 를 굽기 **전에** 배포돼 있어야 한다(Bubblewrap 은 라이브 URL 의 manifest 를 읽는다).
  · 위치: public/manifest.webmanifest:12-13 — 전문은 deliverable 참조

- [🤖 코드/문서 작업] shortcuts 를 5개 → 4개로 줄인다(Bubblewrap 이 4번째에서 자른다). 아래 수정본은 하단 탭바와 동일한 4개(라이브·커뮤니티·GTO·캘린더)를 남기고 '일정 탐색'·'중고장터'·'내 매장'을 뺐다 — 어느 4개를 남길지는 한 줄 교체로 바뀌는 오너 판단이니, 다르게 원하면 그 4개로 갈아끼우면 된다. URL 은 모두 유효한 딥링크임을 App.tsx:754 허용 목록으로 확인했다.
  · 위치: public/manifest.webmanifest:22-28

- [🤖 코드/문서 작업] npm i -g @bubblewrap/cli@latest 로 최신 버전을 깔고, bubblewrap init 후 android/app/build.gradle 의 targetSdkVersion 이 **36** 인지 눈으로 확인한다. 34/35 면 .aab 업로드가 거절된다(기한 2026-08-31 경과). 같은 자리에서 JDK 가 정확히 17 인지도 확인한다(21+ 면 빌드 실패).
  · 위치: 터미널 · bubblewrap init --manifest https://nuriholdem.com/manifest.webmanifest 실행 후 생성된 android/app/build.gradle

- [🤖 코드/문서 작업] twa-manifest.json 의 orientation 을 'default' 로 둔다. 웹 manifest 는 portrait-primary 를 유지해 브라우저 PWA 동작을 바꾸지 않으면서, 태블릿에 앱을 깐 매장 운영주가 내 매장·장부·클락 설정을 가로로 볼 수 있게 된다.
  · 위치: bubblewrap init 이 생성하는 프로젝트 루트의 twa-manifest.json

- [🤖 코드/문서 작업] 512x512 단색 실루엣 PNG(예: /icon-monochrome-512.png)를 만들어 배포한 뒤 manifest icons 에 purpose:'monochrome' 한 줄을 추가한다. 없으면 Android 상태바의 푸시 알림 아이콘이 흰 뭉개짐으로 뜬다. **파일이 없는 상태로 manifest 에 먼저 적으면 Bubblewrap 의 아이콘 페치가 404 로 깨지므로 순서를 지킬 것.**
  · 위치: public/icon-monochrome-512.png 신규 → public/manifest.webmanifest icons 배열 (붙여넣을 한 줄은 deliverable 하단에 있음)

- [🤖 코드/문서 작업] 폰 스크린샷을 캡처한다. 하나로 두 곳을 다 덮을 수 있다 — 1080x1920(9:16) PNG 4장을 찍어 ① Play Console 스토어 등록정보에 업로드하고(최소 2장이지만 추천 노출 자격이 4장) ② 같은 파일을 public/screenshots/ 에 넣고 manifest 의 screenshots 필드로 선언하면 Chrome 설치 다이얼로그도 커진다. 여기에 피처 그래픽 1024x500(알파 없는 24bit PNG 또는 JPEG) 1장이 별도로 필요하다.
  · 위치: Play Console → 스토어 등록정보 · 및 public/screenshots/ (manifest 블록은 deliverable 하단)

- [🧑 오너만 가능] 내부 테스트 트랙에 첫 .aab 를 올린 뒤 실기기에서 3가지를 순서대로 확인한다 — ① 앱 상단에 Chrome 주소창이 없는가(assetlinks 검증 성공) ② 스플래시 색이 딥네이비 #06080F 인가(플럼이면 manifest 배포가 안 된 것) ③ 앱 아이콘 길게 눌러 바로가기 4개가 다 뜨는가. ①이 실패하면 지문이 틀린 것이므로 Play Console 앱 서명 화면을 다시 본다.
  · 위치: Play Console → 테스트 및 출시 → 내부 테스트 · 실제 안드로이드 기기

- [🤖 코드/문서 작업] 본인인증(PortOne) 킬스위치를 켜기 **전에** TWA 안에서 인증 흐름을 왕복 테스트한다. PASS 앱 등 외부 스킴으로 나갔다가 nuriholdem.com 으로 정상 복귀하는지가 관건이다. 지금은 app_settings.identity_voucher_enabled 가 기본 OFF 라 출시를 막지 않으므로, 출시 후 별건으로 검증해도 된다.
  · 위치: src/lib/identityFlag.ts 의 플래그 · src/components/features/IdentityVerificationButton.tsx:45 · 실기기 TWA

- [🧑 오너만 가능] Play Console 데이터 보안 양식에 '광고 포함'을 체크하고 수집 항목(이메일·닉네임·푸시 토큰)을 정확히 기재한다. AdSense 는 TWA 가 지원 뷰잉 프레임으로 명시돼 있어 정책상 문제가 없으나, 미신고는 그 자체로 위반이다. 스토어 설명에는 '실제 베팅·현금게임·환전 없음(오프라인 대회 일정·커뮤니티·매장 운영 도구)'을 명시하고 개인정보처리방침 URL 로 기존 public/legal/*.html 을 연결한다.
  · 위치: Play Console → 정책 및 프로그램 → 앱 콘텐츠(데이터 보안·광고·콘텐츠 등급) · 링크는 https://nuriholdem.com/legal/ 및 /legal/anti-gambling.html

- [🤖 코드/문서 작업] (선택·저위험) sw.js 의 CACHE 상수를 'nuri-shell-v3' 로 올려 비해시 자산(아이콘·폰트 CSS·offline.html)의 정체를 한 번 끊는다. TWA 는 브라우저와 달리 사용자가 캐시를 비울 계기가 없어 배포 때마다 이 한 줄을 검토하는 습관이 필요하다. 지금 당장의 블로커는 아니다.
  · 위치: public/sw.js:4


---

## 그대로 사용할 산출물

■ public/manifest.webmanifest — 수정본 전문 (지금 그대로 교체 가능 · JSON 검증 통과)

변경점은 3가지뿐이다. ① background_color·theme_color #151221 → #06080F ② shortcuts 5개 → 4개(Bubblewrap 이 4에서 자름) ③ shortcut 아이콘에 type 명시.
존재하지 않는 파일을 가리키는 필드(screenshots·monochrome 아이콘)는 **일부러 넣지 않았다** — Bubblewrap 의 아이콘/자원 페치가 404 로 깨지기 때문이다. 파일을 만든 뒤 붙여넣을 블록은 아래에 따로 뒀다.

{
  "id": "/",
  "name": "NURI HOLDEM",
  "short_name": "NURI",
  "description": "전국 홀덤 대회 일정 · 커뮤니티 · GTO · 매장관리",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "orientation": "portrait-primary",
  "dir": "ltr",
  "background_color": "#06080F",
  "theme_color": "#06080F",
  "lang": "ko",
  "categories": ["social", "lifestyle", "sports"],
  "prefer_related_applications": false,
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "라이브", "short_name": "라이브", "url": "/?tab=live", "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }] },
    { "name": "커뮤니티", "short_name": "커뮤니티", "url": "/?tab=community", "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }] },
    { "name": "GTO", "short_name": "GTO", "url": "/?tab=tools", "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }] },
    { "name": "캘린더", "short_name": "캘린더", "url": "/?tab=calendar", "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }] }
  ],
  "share_target": {
    "action": "/?tab=community&shared=1",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
}

(위 파일은 검증본을 이 경로에 써 뒀다: C:\\Users\\buffy\\AppData\\Local\\Temp\\claude\\C--Users-buffy-OneDrive-------------\\624b2073-287f-47a8-94bf-5e267abc0988\\scratchpad\\manifest.webmanifest — python json.load 통과, shortcuts 4개, theme #06080F 확인)

────────────────────────────────────────
■ 파일을 만든 뒤에 추가할 블록 (지금 넣으면 404 로 깨진다)

[1] public/icon-monochrome-512.png (512x512 단색 실루엣) 를 배포한 뒤 → icons 배열 마지막에 한 줄:

    { "src": "/icon-monochrome-512.png", "sizes": "512x512", "type": "image/png", "purpose": "monochrome" }

[2] public/screenshots/*.png (1080x1920, 9:16) 4장을 배포한 뒤 → share_target 위에 블록 추가:

  "screenshots": [
    { "src": "/screenshots/home-1080x1920.png", "sizes": "1080x1920", "type": "image/png", "form_factor": "narrow", "label": "오늘·내일 홀덤 대회 일정" },
    { "src": "/screenshots/live-1080x1920.png", "sizes": "1080x1920", "type": "image/png", "form_factor": "narrow", "label": "진행 중인 토너먼트 라이브" },
    { "src": "/screenshots/community-1080x1920.png", "sizes": "1080x1920", "type": "image/png", "form_factor": "narrow", "label": "홀덤펍 커뮤니티" },
    { "src": "/screenshots/gto-1080x1920.png", "sizes": "1080x1920", "type": "image/png", "form_factor": "narrow", "label": "GTO 학습 도구" }
  ],

  ※ 이 screenshots 는 Chrome 설치 다이얼로그용이다. Play 스토어 등록정보의 스크린샷은
     Bubblewrap 이 manifest 에서 읽지 않으므로(TwaManifest.ts 에 screenshots 필드 자체가 없다)
     같은 PNG 를 Play Console 에 **따로** 업로드해야 한다. 피처 그래픽 1024x500 도 별도.

────────────────────────────────────────
■ public/.well-known/assetlinks.json — 지문 채운 형태 (오너가 값만 갈아끼움)

배포 경로는 이미 검증됐다(라이브 200 · application/json · ACAO *). 값만 바꾸면 된다.
지문 두 개를 **모두** 넣는다: 위가 Play 앱 서명 키(프로덕션), 아래가 업로드 키(내부 테스트).

[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.nuriholdem.twa",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:…  ← Play Console > 앱 서명(App integrity) 의 '앱 서명 키 인증서' SHA-256",
        "11:22:33:…  ← 같은 화면의 '업로드 키 인증서' SHA-256"
      ]
    }
  }
]
