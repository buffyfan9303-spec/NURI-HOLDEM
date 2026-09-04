# Google Play 도박 정책 대응

<!-- 2026-09-04 조사 산출물. 각 주장은 1차 출처(Google/Play/IARC 공식 문서) 또는 파일:줄 근거를 달았고,
     blocker/high 주장은 별도 에이전트가 **반증을 시도**해 검증했다. 검증에서 뒤집힌 것은 아래 '적대적 검증'에 남겼다. -->


## 결론

Google Play 실화폐 도박 정책의 적용 대상은 "온라인 카지노·스포츠베팅·경마·복권·DFS" 5종이며, 앱이 **앱 안에서** 돈을 걸고 실물 가치의 상품을 받게 해야 걸립니다. NURI HOLDEM은 코드상 인앱 결제 0곳(PortOne은 결제가 아니라 본인인증 전용), 광고 SDK 0곳(AdSense 제거됨), 포인트·이용권의 현금화 경로 0곳, 이용권은 킬스위치로 기본 비활성 — 즉 판정 기준선인 '앱 내 재화 → 실물 가치' 사슬이 실제로 끊겨 있습니다. 결정적으로 **한국은 Google Play 도박앱 허용 41개국 목록에 없으므로**, 한 번 '실화폐 도박앱'으로 오분류되면 신청 경로 자체가 없어 회복이 불가능합니다. 반면 기능이 거의 1:1인 KHPL(오프라인 홀덤펍 일정·클락·좌석·비현금 포인트)이 '라이프스타일 · 청소년이용불가'로 승인돼 있고, 러너러너는 '상금규모'를 등록정보에 그대로 쓰고도 살아 있어 상금·GTD 표기 자체는 반려 사유가 아닙니다. 따라서 실질 위험은 정책 해당 여부가 아니라 ① 게임 카테고리로 잘못 등록해 GRAC 게임물 등급분류를 유발하는 것, ② PLAYSTORE.md에 남은 "AdSense 사용 → 광고 포함 체크" 지시대로 사실과 다른 신고를 하는 것, ③ 상금 숫자 옆에 참가 CTA가 붙어 정책 위반 예시("COMPETE!")와 형태가 같아 보이는 것 세 가지입니다.



## 근거 (위험도 · 출처)

- **[blocker]** 한국(KR)은 Google Play 도박앱 허용 국가/지역 목록에 없다. 목록은 호주·오스트리아·벨기에·브라질·불가리아·캐나다·콜롬비아·크로아티아·체코·덴마크·에티오피아·핀란드·프랑스·독일·가나·그리스·헝가리·아일랜드·이탈리아·일본·케냐·라트비아·리투아니아·멕시코·네덜란드·뉴질랜드·나이지리아·노르웨이·파나마·포르투갈·루마니아·세르비아·싱가포르·슬로바키아·스페인·스웨덴·스위스·탄자니아·터키·영국·미국이며 아시아는 일본·싱가포르뿐이다. 따라서 '실화폐 도박앱'으로 분류되는 순간 한국 배포는 신청 경로 자체가 없다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/12256011?hl=en`

- **[high]** 같은 조항의 위반 예시에 '메뉴·탭·버튼·웹뷰 등 내비게이션 요소가 현금 상금 대회 참가를 부르는 CTA(BET!/REGISTER!/COMPETE!)'가 명시돼 있다. NURI의 예약·참가 버튼이 'GTD 1,000만' 같은 상금 표기와 한 카드 안에 붙으면 이 예시와 외형이 같아져 심사관 오분류의 최대 유발점이 된다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9877032?hl=en`

- **[high]** 도박 광고를 싣는 앱에는 9개 추가 요건이 붙고, 그중 8번은 '도박·실머니게임·토너먼트의 지원 또는 컴패니언 기능(참가금 관리 등) 제공 금지', 9번은 '앱 콘텐츠가 도박·토너먼트 서비스로 유도 금지'다. NURI의 장부(바인·참가금 기록)와 대회 안내는 이 두 요건을 구조적으로 만족할 수 없으므로, 도박 광고가 뜰 수 있는 광고 네트워크를 다시 붙이면 즉시 정책 충돌이다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9877032?hl=en`

- **[high]** 한국에서 GRAC 등급은 '게임'에만 발급되고 '앱'은 Google Play Rating(3+/7+/12+/16+/19+)을 쓴다. 따라서 Play Console에서 게임으로 등록하면 GRAC 게임물 등급분류가 요구되고, 이는 홀덤 도메인에서 사행성 심사로 직결된다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9859655?hl=en`

- **[high]** PLAYSTORE.md 4단계 7번이 '광고 포함 여부(AdSense 사용 → "광고 포함" 체크)'라고 지시하고 있으나 실제 코드에는 광고가 0개다. 이 지시대로 신고하면 사실과 다른 앱 콘텐츠 신고가 되고, 도박 광고 규정(9개 추가 요건)을 스스로 불러들이는 자충수가 된다.
  · 출처: `PLAYSTORE.md · src/main.tsx:70-74`

- **[medium]** 도박앱이 아닌 앱에 적용되는 조항(Other Real-Money Games, Contests, and Tournament Apps)의 금지 범위는 '실제 돈(앱 내에서 돈으로 산 아이템 포함)으로 걸거나 참가해 실물 금전 가치의 상품을 얻는 것'이다. 판정 기준은 그 사슬이 앱 안에 있는가이며, NURI는 참가비 수납·상금 지급이 전부 오프라인 매장 소관이다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9877032?hl=en`

- **[medium]** 이용권을 켜면 Google의 Gamified Loyalty Programs 요건이 적용된다. 비게임 앱은 확률형 보상도 허용되지만 '프로그램 공식 규칙을 앱 안에 게시'가 필수이고, 확률형이면 확률 또는 선정 방법을, 고정비율이면 적립·사용 비율을 앱 안과 공식 약관 양쪽에 명시해야 한다. 현재 앱 안에 이용권 공식 규칙 문서가 없다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9877032?hl=en`

- **[medium]** 두 선례의 갈림길이 NURI의 등록 전략을 결정한다 — 앱 내 카드 플레이가 있으면(러너러너) GRAC 게임물 등급분류로, 없으면(KHPL) Google Play Rating 19+로 간다. NURI의 GTO 도구는 칩을 걸고 하는 플레이가 아니라 프리플랍 퀴즈·차트·계산기·핸드 리플레이어이므로 KHPL 경로가 맞다.
  · 출처: `src/lib/preflopQuiz.ts:1-25 · src/components/features/tools/ · src/components/features/HandReplayer.tsx:1-3`

- **[medium]** Play 정책이 '반드시 등록정보에 넣어라'라고 강제하는 문구는 책임도박(responsible gambling) 고지 하나뿐이며, 그것도 승인된 도박앱·DFS앱에만 적용된다. NURI에는 법적 의무 문구가 없다. 다만 선례 2건이 모두 자발적으로 '비현금·금전 미개입·19세'를 등록정보에 적었고, 이것이 오분류를 막는 실질 방어다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/13381106?hl=en`

- **[medium]** 홈 배너·커뮤니티 광고의 외부 링크는 스킴 검증(http/https만 허용)은 있으나 도메인 화이트리스트가 없다. 운영자가 실수로 불법 도박 사이트 링크를 넣으면 앱 콘텐츠가 도박 서비스로 유도하는 형태가 되어 정책 위반이 된다(현재 실제 위반 사례는 확인되지 않음).
  · 출처: `src/components/features/HomeTab.tsx:188 · src/api/homeBanners.ts:71`

- **[medium]** 향후 B2B 부스트 결제를 TWA 안에서 열 경우 Play 결제 정책(앱 내 디지털 상품은 Play 결제 사용) 적용 여부를 별도로 검토해야 한다. RefundPolicy.tsx 주석이 PG 가맹 심사를 언급하고 있어 도입 의사가 존재한다. 도박 정책 축에서의 결론은 불확실이며 결제 정책 담당 축의 판단이 필요하다.
  · 출처: `src/pages/legal/RefundPolicy.tsx:3-4`

- **[low]** Google Play 실화폐 도박 정책이 규율하는 '도박앱'은 온라인 카지노·스포츠베팅·경마·복권·DFS 5종뿐이며, 앱이 온라인 도박을 'enable or facilitate' 해야 해당한다. NURI는 앱 내 베팅·칩·판돈 기능이 없어 이 5종 어디에도 들어가지 않는다.
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9877032?hl=en`

- **[low]** 현재 앱에 광고 SDK는 0개다. AdSense Auto Ads는 2026-08 정책 위반('게시자 콘텐츠 없는 화면에 광고') 대응으로 제거됐고 수동 광고 슬롯도 0개다. dist/index.html에 남은 'adsbygoogle' 문자열은 주석 텍스트일 뿐 스크립트가 아니다.
  · 출처: `src/main.tsx:70-74, index.html:20-23`

- **[low]** PortOne SDK는 결제가 아니라 본인인증에만 쓰인다. 코드 전체에서 호출되는 것은 requestIdentityVerification 하나뿐이고 requestPayment 호출은 0곳이다. 즉 앱에 인앱 결제 경로가 존재하지 않는다.
  · 출처: `src/components/features/IdentityVerificationButton.tsx:45, src/api/identity.ts:1`

- **[low]** 예약 화면의 결제수단 라벨(현금·카드·이체·이용권·서포트)은 매장 장부에 오프라인 수납 방식을 기록하는 값이지 앱이 돈을 받는 경로가 아니다.
  · 출처: `src/api/reservations.ts:228`

- **[low]** 활동점수 상점 상품은 전부 표현·소유·편의(외치기·프레임·닉네임 색 등)이며 확률형(뽑기)·포인트 베팅·유저 간 포인트 선물·포인트↔이용권 교환·참가비 대납은 설계에서 배제돼 있다. 즉 '앱 내 재화로 실물 가치를 얻는' 경로가 코드에 없다.
  · 출처: `src/api/community.ts:1908-1912`

- **[low]** 매장이용권의 유상 충전(구매) 경로는 클라이언트 UI와 서버 승인 양쪽에서 폐쇄됐고(§12-A-2), 바인 1회당 자동 적립도 중단됐으며(§12-A-3), 유저 간 양도가 금지된다. 이용권은 '금전적 가치 없음'으로 정의돼 있다.
  · 출처: `src/components/features/AdminTab.tsx:163,167 · src/components/features/NuriPosLedger.tsx:1310 · src/components/features/CustomerDashboardPage.tsx:5-6`

- **[low]** 본인인증과 매장이용권은 하나의 킬스위치(app_settings.identity_voucher_enabled)로 묶여 있고 기본값이 비활성화다. 제출 시점에 이용권 기능이 꺼져 있으면 심사관이 볼 수 있는 '가치 있는 재화' 자체가 화면에 없다.
  · 출처: `src/lib/identityFlag.ts:15-16`

- **[low]** 승인 선례 1 — KHPL(com.khpl.app, SJ&C)은 '오프라인 홀덤 펍 매장을 위한 토너먼트 일정·운영 안내 앱'으로 일정·참가신청·좌석·라이브 블라인드 클락·공지·비현금 멤버십 포인트를 제공하며 라이프스타일 카테고리 · 콘텐츠 등급 Google Play Rating 19+(사행성 서술자 없음)로 게재 중이다. 등록정보에 '본 앱은 오프라인 매장 운영·안내용 서비스입니다. 실제 게임 플레이나 금전이 오가는 기능은 제공하지 않습니다', '매장 포인트(LP)는 비현금 커뮤니티 혜택이며 금전으로 교환할 수 없습니다', '매장은 만 19세 이상 성인만 입장 가능합니다'를 명시했다. NURI와 기능 구성이 거의 1:1이다.
  · 출처: `https://play.google.com/store/apps/details?id=com.khpl.app&hl=ko`

- **[low]** 승인 선례 2 — 러너러너(com.runnersoft.runnerrunner, 주식회사 러너소프트)는 '홀덤펍 및 토너먼트 No.1 서비스'로 라이프스타일 카테고리 · 청소년이용불가(GRAC 19, 사행성 서술자)로 1만+ 다운로드 중이며, 등록정보에 '토너먼트 대회 일정 및 상금규모 등 주요 정보를 확인 가능합니다'를 그대로 쓰고 있다. 즉 상금·GTD 금액 표기 자체는 Play 반려 사유가 아니다. 단 이 앱은 앱 내 무료 토너먼트 플레이가 있어 게임물 등급분류번호(제 CC-OM-240314-002호)를 받았고, 그 결과 GRAC 등급 경로로 들어갔다.
  · 출처: `https://play.google.com/store/apps/details?id=com.runnersoft.runnerrunner&hl=ko`


## 조치

- [🧑 오너만 가능] Play Console에서 '게임'이 아니라 '앱'으로 만들고 카테고리를 라이프스타일로 지정한다. 게임으로 등록하면 한국에서 GRAC 게임물 등급분류가 요구되며, 승인 선례 2건(KHPL·러너러너)도 모두 라이프스타일이다.
  · 위치: Play Console → 앱 만들기 → 앱/게임 선택 · 스토어 설정 → 카테고리

- [🧑 오너만 가능] 콘텐츠 등급 설문에서 '실제 돈을 걸거나 실제 돈으로 상품을 얻을 수 있는가'는 아니오, '도박을 소재로 하거나 도박 관련 정보를 제공하는가'는 예로 답해 Google Play Rating 19+(청소년이용불가)를 목표로 한다. 대상 연령은 18세 이상만 선택하고 Designed for Families에 참여하지 않는다.
  · 위치: Play Console → 정책 → 앱 콘텐츠 → 콘텐츠 등급 / 타겟 층 및 콘텐츠

- [🧑 오너만 가능] '앱에 광고 포함' 신고를 '아니요'로 제출한다. 코드에 광고 SDK와 광고 슬롯이 0개이므로 '예'로 신고하면 사실과 다르고, 도박 광고용 9개 추가 요건을 스스로 불러들인다.
  · 위치: Play Console → 정책 → 앱 콘텐츠 → 광고

- [🤖 코드/문서 작업] PLAYSTORE.md의 4단계 7번 'AdSense 사용 → 광고 포함 체크' 문장을 '광고 없음 — 광고 포함 아니요'로 고치고, 「주의 — 홀덤 콘텐츠 정책」 절에 '광고 재도입 시 도박 광고 카테고리 차단 필수(정책 요건 8·9와 구조적 충돌)'를 덧붙인다.
  · 위치: PLAYSTORE.md

- [🧑 오너만 가능] deliverable의 '서비스 성격 안내' 블록을 스토어 전체 설명 맨 아래에 그대로 넣는다. 승인된 KHPL이 같은 위치에 같은 성격의 4줄을 넣어 통과했다.
  · 위치: Play Console → 스토어 설정 → 기본 스토어 등록정보 → 전체 설명

- [🧑 오너만 가능] 앱 액세스(App access)에 심사용 테스트 계정과 '일정 열람은 로그인 없이 가능'을 기재한다. 심사관이 앱 안을 직접 열어 베팅·칩·결제가 없음을 확인해야 오분류가 나지 않는다.
  · 위치: Play Console → 정책 → 앱 콘텐츠 → 앱 액세스 권한

- [🧑 오너만 가능] deliverable의 영문 선언문을 저장해 두고, 도박 정책으로 반려될 경우 이의신청 본문에 그대로 사용한다(허용 5종 비해당 + 앱 내 스테이크 부재 + 비현금 재화 + 인앱결제 0 + 19세 게이트 순서로 반박).
  · 위치: Play Console → 정책 상태 → 이의신청 / 또는 앱 심사 문의

- [🤖 코드/문서 작업] 대회 카드에서 상금·GTD 숫자와 '예약/참가' 버튼이 같은 시야에 오는 구성을 점검한다. 금액은 '매장이 등록한 참가비·상금 정보'라는 출처 라벨을 달아 앱이 상금을 거는 주체로 읽히지 않게 한다(§28의 가격 정보 성격 유지, 금액 삭제 아님).
  · 위치: src/components/features/ScheduleCard.tsx · ScheduleDetailModal.tsx

- [🤖 코드/문서 작업] 이용권 킬스위치(identity_voucher_enabled)를 켜기 전에 '매장이용권 공식 규칙'(발급 조건·사용 매장 한정·비현금·양도 불가·유효기간·회수 사유)을 앱 내 문서로 게시한다. Google의 Gamified Loyalty Programs 요건이 비게임 앱에도 '앱 내 공식 규칙 게시'를 요구한다.
  · 위치: src/components/features/LegalDocsModal.tsx(신규 문서 추가) · src/lib/identityFlag.ts(스위치)

- [🤖 코드/문서 작업] AdSense를 포함한 어떤 광고 네트워크도 재도입하지 않는다. 부득이 도입한다면 도박·베팅 광고 카테고리를 전면 차단한 상태에서만 한다 — 이 앱은 장부(참가금 관리)와 대회 안내를 제공하므로 도박 광고 허용 요건 8·9를 만족할 수 없다.
  · 위치: src/main.tsx:70-74(현재 제거 상태 유지)

- [🤖 코드/문서 작업] 홈 배너·커뮤니티 광고의 linkUrl에 도메인 화이트리스트를 추가한다(현재는 http/https 스킴 검증만 있음). 운영자 실수 한 번이 '앱이 도박 사이트로 유도'라는 위반 형태를 만든다.
  · 위치: src/api/homeBanners.ts:71 · src/components/features/HomeTab.tsx:188

- [🧑 오너만 가능] B2B 부스트 결제를 TWA 안에서 여는 계획은 Play 결제 정책 검토 전까지 착수하지 않는다. 웹에서만 결제하고 앱은 안내만 하는 구조가 안전 경로다(도박 정책 축의 판단이 아니라 결제 정책 축의 확인 필요).
  · 위치: src/pages/legal/RefundPolicy.tsx(주석의 PG 가맹 심사 언급) · 향후 결제 도입 지점


---

## 그대로 사용할 산출물

【NURI HOLDEM — Google Play 스토어 등록정보 도박정책 대응 문단】

────────────────────────────────────────
① 전체 설명(Full description) 맨 아래에 그대로 붙이는 블록 — 한국어
────────────────────────────────────────

■ 서비스 성격 안내

본 앱은 오프라인 홀덤펍에서 열리는 토너먼트의 일정 안내 · 예약 · 매장 운영 도구 서비스입니다.

· 앱 안에서 카드 게임을 하지 않습니다. 베팅·칩·판돈을 다루는 기능이 없습니다.
· 앱 안에서 돈을 걸거나 주고받는 기능이 없습니다. 참가비 수납과 상금 지급은 전적으로 각 매장이 현장에서 자신의 책임과 계산으로 처리하며, 회사는 그 과정에 관여하지 않고 이용자에게 어떠한 금전도 지급하지 않습니다.
· 앱에 표시되는 참가비(바이인)·GTD·프라이즈풀은 매장이 등록한 상품 가격 정보이며(「전자상거래 등에서의 소비자보호에 관한 법률」상 가격 고지), 회사가 지급을 약속하는 금액이 아닙니다.
· 활동점수와 매장 이용권은 활동 기록을 표시하기 위한 비현금 표시값입니다. 돈으로 살 수 없고, 돈으로 바꿀 수 없으며, 이용자 간 양도·매매가 금지됩니다.
· 인앱 결제와 인앱 상품 판매가 없습니다. 앱 내 광고가 없습니다.
· 만 19세 이상만 가입·이용할 수 있습니다(「청소년보호법」). 가입 시 연령 확인과 필수 동의 절차를 거칩니다.
· 도박 문제로 어려움을 겪고 계시다면 한국도박문제예방치유원 헬프라인 1336(24시간·무료)에서 상담하실 수 있습니다.
  불법 환전·사행성 행위 금지 서약: https://nuriholdem.com/legal/anti-gambling.html

주요 기능 — 전국 홀덤펍 대회 일정 달력 · 대회 예약 · 라이브 블라인드 클락 · 매장 장부 및 운영 도구 · 커뮤니티 · 중고장터 · GTO 학습 도구(퀴즈·차트·계산기)

사업자 — 엔에이치홀딩스 · 대표자 김윤혜 · 사업자등록번호 525-20-02937

────────────────────────────────────────
② 짧은 설명(80자) 후보
────────────────────────────────────────
전국 홀덤펍 토너먼트 일정·예약·매장 운영 도구. 만 19세 이상. 앱 내 베팅·금전 거래 없음.

────────────────────────────────────────
③ 정책 문의·이의신청용 영문 선언문 (Play Console 문의 본문에 그대로 첨부)
────────────────────────────────────────
NURI HOLDEM is an information and venue-operations app for offline Texas Hold'em tournaments held at brick-and-mortar venues in South Korea.

The app does NOT offer card game play, wagering, betting, virtual chips, or any cash-out mechanism. No money is staked, collected, held, or paid out through the app: entry fees and prizes are handled entirely by each venue on its own account at its physical premises, and the developer is not a party to those transactions and pays nothing to users.

Buy-in and guaranteed-prize figures displayed in the app are price information for a service supplied by the venue, disclosed as required by the Korean Act on Consumer Protection in Electronic Commerce. They are not amounts the developer offers or guarantees.

In-app "activity points" and "store vouchers" are non-monetary display values. They cannot be purchased with money, cannot be exchanged for money, and cannot be transferred or sold between users. The app contains no in-app purchases, no in-app billing, and no advertising SDK. Access is restricted to users aged 19 and over, with an age declaration and mandatory consent at sign-up, and the app links to a responsible-gaming notice (Korea Center on Gambling Problems helpline 1336) in its footer and legal pages.

Accordingly, the app does not enable or facilitate online casino games, sports betting, horse racing, lotteries, or daily fantasy sports, and does not enable users to wager or stake real money in-app to obtain a prize of real-world monetary value. It therefore falls outside the scope of the Real-Money Gambling, Games, and Contests policy. Comparable Korean apps for offline hold'em venues are published on Google Play under the Lifestyle category with a 19+ rating (for example com.khpl.app).

────────────────────────────────────────
④ 앱 내 배치 — 이미 있는 것 / 추가할 것
────────────────────────────────────────
· 이미 있음: 푸터 "만 19세 미만은 이용할 수 없습니다 · 도박문제 상담 1336(24시간·무료)" — src/components/features/BusinessFooter.tsx:76
· 이미 있음: 가입 시 필수 동의 「불법 환전·사행성 행위 금지 서약」 — public/legal/anti-gambling.html
· 추가 권장: 위 ①의 '서비스 성격 안내' 6줄을 [내 정보 → 법적 고지] 최상단에 같은 문장으로 노출. 목적은 이용자 안내가 아니라, 심사관이 스토어 등록정보에서 읽은 문장을 앱 안에서 그대로 다시 보게 만드는 것이다(선례 KHPL이 등록정보와 앱 안내를 같은 문장으로 맞췄다).
