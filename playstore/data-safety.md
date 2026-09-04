# Play 데이터 보안(Data Safety) 양식 답안

<!-- 2026-09-04 조사 산출물. 각 주장은 1차 출처(Google/Play/IARC 공식 문서) 또는 파일:줄 근거를 달았고,
     blocker/high 주장은 별도 에이전트가 **반증을 시도**해 검증했다. 검증에서 뒤집힌 것은 아래 '적대적 검증'에 남겼다. -->


## 결론

코드 실측 결과, 이 앱은 Play 데이터 보안 14개 카테고리 중 7개(개인 정보·메시지·사진 및 동영상·앱 활동·앱 정보 및 성능·기기 또는 기타 ID·금융 정보 일부)에서 '수집함'이고, 그중 3개는 서드파티 전송(=Play 정의의 '공유')이 실제로 일어난다(Google Analytics G-9T7JZNEQE8 · Sentry · Resend · Gemini). 중요한 정정 두 가지: (1) 앱 안에 실제 결제 호출이 0건이다 — PortOne 은 `requestIdentityVerification` 본인인증 전용이고 `requestPayment` 는 코드 전체에 없다. 포인트 상점(buy_mark·buy_shout 등)은 활동 점수 소비라 '결제 정보'는 수집하지 않는다. (2) 위치는 `navigator.geolocation` 을 읽지만 좌표가 기기 밖으로 나가지 않는다(하버사인 거리 계산이 전부 클라이언트) — Play 정의상 '수집 안 함'이다. 다만 GA4 가 IP 로 대략적 위치를 파생시키므로 그 한 줄은 오너 판단이 필요하다. 양식 통과의 실제 병목은 데이터 유형이 아니라 삭제 요건이다: 인앱 탈퇴(`withdraw_my_account`)는 구현돼 있으나 앱 설치 없이 접근 가능한 **웹 계정 삭제 요청 URL 이 없다** — Play 는 이 URL 을 별도 입력란으로 요구하고 미제출 시 반려된다. 부수적으로 주간 이메일 발송 대상 SQL 이 마케팅 수신 동의를 전혀 보지 않아, 이미 라이브인 개인정보처리방침의 '수신 동의자 한정' 문구와 코드가 어긋나 있다.



## 근거 (위험도 · 출처)

- **[blocker]** Play 는 계정 생성이 가능한 앱에 대해 '앱 설치 없이 접근 가능한 웹 계정·데이터 삭제 요청 URL' 을 데이터 보안 양식에 반드시 입력하게 한다. 이 저장소의 public/legal 에는 anti-gambling·marketing·privacy·refund·terms 5종만 있고 삭제 요청 페이지가 없다. 인앱 탈퇴만으로는 요건을 못 채운다.
  · 출처: `public/legal/ 디렉터리 목록(5개 html) · grep 'delete-account|account-deletion|계정 삭제' → 앱 코드에 라우트 0건 · PLAYSTORE.md:45`

- **[high]** Google Analytics 4(측정 ID G-9T7JZNEQE8)가 조건 없이 로드된다. GA4 는 IP 로부터 대략적 위치(국가·도시)와 클라이언트 ID(기기 식별자)를 파생시키므로, 최소한 '기기 또는 기타 ID'와 '앱 활동 > 앱 상호작용'은 수집+공유(분석 목적)로 기재해야 한다. 사용자 옵트아웃 UI 는 앱에 없다(브라우저 쿠키 차단만 안내).
  · 출처: `src/main.tsx:77 (googletagmanager 스크립트 주입) · index.html:28-31 (gtag config) · src/pages/legal/PrivacyPolicy.tsx:109,271`

- **[high]** Sentry 는 VITE_SENTRY_DSN 이 설정된 경우에만 동적 로드되며, 켜져 있으면 오류 스택·브라우저 정보·IP 가 미국 Sentry 로 전송된다. 세션 리플레이는 0으로 꺼져 있다. 실제 프로덕션에서 DSN 이 설정돼 있는지는 코드로 확인 불가 — 오너가 Vercel 환경변수에서 확인해야 양식의 '공유' 체크가 정확해진다.
  · 출처: `src/lib/monitoring.ts:12,60-70 · src/pages/legal/PrivacyPolicy.tsx:191`

- **[high]** 주간 이메일 다이제스트 발송 대상 SQL 이 마케팅 수신 동의(agreed_to_marketing)를 전혀 확인하지 않는다. 매장을 팔로우한 active 회원 전원의 email·nickname 이 Resend(미국)로 나간다. 이미 라이브인 개인정보처리방침은 이 전송을 '수신 동의자 한정'이라고 고지하고 있어 코드와 문서가 어긋난다.
  · 출처: `supabase/migrations/20260818d_secret_settings_and_digest_rows.sql:15-35 (where 절에 동의 조건 없음) · supabase/functions/weekly-email-digest/index.ts:66 · src/pages/legal/PrivacyPolicy.tsx:192`

- **[high]** 전화번호는 두 갈래로 수집된다: 본인인증 시 profiles.phone(선택), 그리고 매장 CRM 의 customer_profiles.phone·birthday(매장 운영주가 입력) 및 딜러 구인 지원 dealer_applications.phone(필수 입력). 후자들은 매장 업주에게 노출되므로 '공유' 판단이 필요하다.
  · 출처: `supabase/baseline/2026-07-20-live-snapshot.sql:551(profiles.phone), 190-201(customer_profiles), 205-213(dealer_applications) · src/pages/legal/PrivacyPolicy.tsx:236-262`

- **[medium]** 앱 안에 실제 금전 결제 호출이 0건이다. PortOne SDK 는 본인인증(requestIdentityVerification)에만 쓰이고, 코드 전체에 requestPayment 호출이 없다. 따라서 '금융 정보 > 결제 정보'는 수집 안 함으로 기재해야 한다(허위 기재하면 오히려 문제).
  · 출처: `src/components/features/IdentityVerificationButton.tsx:45 (PortOne.requestIdentityVerification) · src/api/identity.ts 전체 · grep 'PortOne\.' 결과 1건뿐`

- **[medium]** 위치는 '수집'에 해당하지 않는다. getCurrentPosition 좌표가 React state 에만 머물고 haversineKm 로컬 계산에만 쓰이며 어떤 테이블·API 로도 전송되지 않는다(코드 전체에서 좌표를 insert/upsert 하는 지점 0건).
  · 출처: `src/App.tsx:994-996 · src/components/features/LiveGamesTab.tsx:146-148 · src/lib/geo.ts:8-14 · src/App.tsx:1737-1755 (사용처가 정렬뿐)`

- **[medium]** 자체 크래시/진단 수집이 별도로 존재한다. client_errors 테이블에 message·stack·url(현재 페이지 전체 URL)·user_agent·user_id 를 저장한다. 이는 '앱 정보 및 성능 > 비정상 종료 로그·진단' 수집에 해당하고, url 에 쿼리스트링이 섞이면 앱 활동까지 실린다.
  · 출처: `src/lib/errorLog.ts:24-32 · supabase/baseline/2026-07-20-live-snapshot.sql:71-79 (client_errors 스키마)`

- **[medium]** 웹 푸시 구독은 endpoint·p256dh·auth 키와 user_agent(300자)를 push_subscriptions 에 저장한다. endpoint 는 브라우저 푸시 서비스(안드로이드 크롬=FCM)의 기기별 URL 이므로 '기기 또는 기타 ID' 수집에 해당하고, 발송 시 그 서비스로 전송된다.
  · 출처: `src/api/push.ts:62-73 · supabase/baseline/2026-07-20-live-snapshot.sql:563-571`

- **[medium]** 순위 인증에서 신분증 이미지를 수집한다. 비공개 버킷 'verifications' 에 증빙 1장 + 신분증 1장을 올리고, 운영자 승인·반려 시 신분증만 즉시 삭제한다. AI 검사(Gemini)에는 증빙만 보내고 신분증은 제외한다 — 이 분리는 코드로 확인된다.
  · 출처: `src/api/rankverify.ts:62-77 (업로드) · :140-146 (id_card_path=null + storage.remove) · :148-175 (aiInspectVerification 이 proofPath 만 사용)`

- **[medium]** 순위 인증 증빙 이미지·핸드 분석 텍스트·매장 주간 요약이 Google Gemini API 로 전송된다. 즉 '사진 및 동영상'과 '앱 활동 > 사용자 콘텐츠'는 서드파티 공유에 해당한다.
  · 출처: `supabase/functions/gemini/index.ts:70 (generativelanguage.googleapis.com 호출) · src/api/ai.ts:17-25 · src/api/rankverify.ts:175`

- **[medium]** 매장 장부(ledger_buyins)에 참가비 결제수단(현금/카드/계좌)과 금액이 플레이어 이름 단위로 기록된다. 이용자 본인의 결제수단 정보는 아니지만 '금융 정보 > 구매 내역' 으로 볼 여지가 있어, 매장 운영 기능을 쓰는 계정 한정 선택 항목으로 기재하는 편이 안전하다.
  · 출처: `supabase/baseline/2026-07-20-live-snapshot.sql:351-370 · src/api/ledger.ts:32,161`

- **[low]** 인앱 계정 삭제 경로는 실재하고 실제로 개인정보를 파기한다. withdraw_my_account() 가 real_name·phone·ci(원문)·verified_at·birth_date·gender·carrier 를 NULL 로 지우고 email/nickname 을 익명 문자열로 치환하며 status='withdrawn' 으로 전환한다.
  · 출처: `supabase/baseline/2026-07-20-live-snapshot.sql:4737-4766 · src/api/auth.ts:434 · src/components/features/ProfileModal.tsx:993`

- **[low]** 본인인증 CI(연계정보)는 원문이 DB 에 남지 않는다. 2026-08-27 Expand/Contract 마이그레이션으로 profiles.ci 원문을 지우고 Vault 페퍼 기반 HMAC-SHA256 ci_hash 만 저장한다. 원문은 verify-identity 엣지 함수 → verify_identity_commit 트랜잭션 안에서만 존재한다.
  · 출처: `supabase/migrations/20260827b_ci_hmac_expand.sql:22-40 · supabase/migrations/20260827c_ci_hmac_contract.sql:6-35 · supabase/functions/verify-identity/index.ts`

- **[low]** AdSense 는 제거되어 현재 광고 SDK 가 없다. 따라서 '공유 목적: 광고 또는 마케팅' 은 어느 항목에도 체크하지 않는다.
  · 출처: `src/main.tsx:66-74 (AdSense 제거 주석) · loadThirdParty() srcs 배열에 gtag 1건만 · index.html:20-26`

- **[low]** 인앱 메시지가 다수 존재한다 — group_messages·venue_messages·listing_messages·user_messages·live_wall. '메시지 > 인앱 메시지' 수집으로 기재해야 한다.
  · 출처: `supabase/baseline/2026-07-20-live-snapshot.sql:265-273, 426-433, 744-752, 435-444 · supabase/migrations/20260827g_user_messages.sql:3`

- **[low]** 전송 중 암호화는 '예'로 답할 수 있다. Supabase·Resend·Gemini·PortOne·GA 호출이 전부 https 이고 http 평문 엔드포인트가 없다.
  · 출처: `index.html:7 (https preconnect) · supabase/functions/*/index.ts 의 fetch URL 전부 https · src/main.tsx:77`

- **[low]** 연락처·캘린더·오디오·건강 및 피트니스·웹 탐색 기록은 수집하지 않는다. 관련 API 호출이 코드에 0건이다(getUserMedia 는 QR 스캔용 카메라 1건뿐이고 영상은 저장·전송하지 않는다).
  · 출처: `src/components/features/QrScanModal.tsx:49,71 (getUserMedia video only, audio:false) · 연락처/캘린더 API grep 0건`


## 조치

- [🤖 코드/문서 작업] 웹 계정·데이터 삭제 요청 페이지를 만들어 public/legal/delete-account.html 로 배포하고, Play Console 데이터 보안 양식의 '데이터 삭제 요청 URL' 란에 https://nuriholdem.com/legal/delete-account.html 을 입력한다. 내용은 ① 앱 내 경로(프로필 > 회원 탈퇴) ② 앱 설치 없이 요청하는 이메일 주소 ③ 삭제되는 항목(실명·전화·CI해시·생년월일·성별·통신사·이메일·닉네임)과 익명화 후 남는 항목(작성 글·장부 기록) ④ 법정 보존 항목(전자상거래법 분쟁기록 3년) ⑤ 처리 기한. 기존 5개 legal html 과 같은 템플릿으로 만들면 scripts/gen-legal.mjs 파이프라인에 그대로 얹힌다.
  · 위치: public/legal/delete-account.html (신규) · scripts/gen-legal.mjs · Play Console > 앱 콘텐츠 > 데이터 보안 > 데이터 삭제 섹션

- [🧑 오너만 가능] 프로덕션에 VITE_SENTRY_DSN 이 실제로 설정돼 있는지 확인한다. 설정돼 있으면 '앱 정보 및 성능(비정상 종료 로그·진단)'의 공유=예, 안 돼 있으면 공유=아니오로 기재한다. 코드만으로는 판별 불가라 이 한 칸의 진위가 오너 확인에 달려 있다.
  · 위치: Vercel 대시보드 > 프로젝트 > Settings > Environment Variables (VITE_SENTRY_DSN)

- [🤖 코드/문서 작업] 주간 이메일 다이제스트 수신자 SQL 에 마케팅 수신 동의 게이트를 넣는다. weekly_email_digest_rows() 의 profiles 조인에 'and p.agreed_to_marketing is true' 를 추가하면 코드가 이미 라이브인 개인정보처리방침 문구와 일치한다. 지금은 팔로우만 하면 동의 없이 발송된다.
  · 위치: supabase/migrations/ 에 신규 마이그레이션 (기준 파일: supabase/migrations/20260818d_secret_settings_and_digest_rows.sql:15-35)

- [🧑 오너만 가능] GA4 를 계속 유지할지 결정한다. 유지하면 데이터 보안 양식에서 '기기 또는 기타 ID' 와 '앱 활동 > 앱 상호작용' 을 수집+공유(목적: 분석)로, 그리고 IP 파생 대략적 위치까지 인정할지를 정해야 한다. 사용자 옵트아웃 UI 가 앱에 없으므로 '사용자가 데이터 수집 여부를 선택할 수 있음'에는 체크하지 않는다. 대안으로 설정 화면에 분석 수집 끄기 토글을 넣으면 '선택'으로 기재할 수 있다.
  · 위치: src/main.tsx:66-88 (loadThirdParty) · index.html:28-31 · Play Console 데이터 보안 양식

- [🧑 오너만 가능] 본인인증·매장이용권 킬스위치(app_settings.identity_voucher_enabled, 기본값 비활성)를 출시 시점에 켤지 정한다. 켜지 않고 출시하면 실명·전화·생년월일·성별·통신사·CI 항목을 '수집 안 함'으로 낼 수 있지만, 나중에 켤 때 양식을 반드시 갱신해야 한다. 켜고 출시하는 편이 양식 재제출 리스크가 없다.
  · 위치: Supabase > Table Editor > app_settings (key='identity_voucher_enabled') · src/lib/identityFlag.ts · src/api/vouchers.ts:20-22

- [🤖 코드/문서 작업] 딜러 구인 지원 폼(dealer_applications)이 전화번호를 필수로 받아 매장 업주에게 노출하는 구조를 확인하고, 양식에서 '개인 정보 > 전화번호'의 공유=예(목적: 앱 기능)로 기재한다. 이 한 건 때문에 전화번호는 본인인증을 끄더라도 여전히 수집 항목으로 남는다.
  · 위치: supabase/baseline/2026-07-20-live-snapshot.sql:205-213 · src/api/dealerShifts.ts 및 딜러 커뮤니티 지원 폼

- [🤖 코드/문서 작업] client_errors.url 에 쿼리스트링이 통째로 실리는 것을 잘라낸다(location.href → location.pathname). 지금은 ?checkin=<venueId> 같은 파라미터가 진단 로그에 남아 진단 데이터가 앱 활동까지 포함하게 된다. 한 줄 수정으로 양식의 진단 항목 범위가 좁아진다.
  · 위치: src/lib/errorLog.ts:28


---

## 그대로 사용할 산출물

# Play Console 데이터 보안(Data Safety) 양식 답안 — NURI HOLDEM
작성 기준: 저장소 실측(2026-09-04). 근거는 각 행 맨 오른쪽.
※ Play 정의: **'수집'=기기 밖으로 전송됨**, **'공유'=서드파티에 전송됨**. 기기 안에서만 처리하고 전송하지 않으면 수집이 아니다.

---

## A. 데이터 유형별 답안표

### 1. 위치 (Location)
| 하위 유형 | 수집 | 공유 | 필수/선택 | 목적 | 근거 |
|---|---|---|---|---|---|
| 대략적인 위치 | **아니오** (단, GA4 IP 파생분은 오너 결정 필요 → 아래 ※) | — | — | — | src/App.tsx:994 · src/lib/geo.ts |
| 정확한 위치 | **아니오** | — | — | — | 좌표가 state 에만 머물고 전송 지점 0건 |

※ GA4 를 유지하면 Google 이 IP 로 국가·도시 수준 위치를 파생시킨다. 보수적으로 가려면 '대략적인 위치'를 수집=예·공유=예·필수·목적=분석 으로 기재한다. **오너 결정 항목.**

### 2. 개인 정보 (Personal info)
| 하위 유형 | 수집 | 공유 | 필수/선택 | 수집 목적 | 공유 목적 | 근거 |
|---|---|---|---|---|---|---|
| 이름 | **예** (닉네임 `profiles.name`/`nickname`, 본인인증 시 실명 `real_name`) | **예** (Resend — 주간 메일에 닉네임) | 닉네임=**필수** / 실명=**선택** | 앱 기능, 계정 관리 | 앱 기능 | baseline:526,542,550 · auth.ts:218-224 |
| 이메일 주소 | **예** | **예** (Resend) | **필수** | 앱 기능, 계정 관리, 개발자 커뮤니케이션 | 개발자 커뮤니케이션 | auth.ts:218 · weekly-email-digest/index.ts:44 |
| 사용자 ID | **예** (`profiles.id` UUID, 닉네임) | 아니오 | **필수** | 앱 기능, 계정 관리 | — | baseline:525 |
| 주소 | 아니오 (매장 주소는 사업장 정보이지 이용자 주소가 아님) | — | — | — | — | baseline:860 `venues.address` |
| 전화번호 | **예** | **예** (매장 업주에게 제공) | **선택** | 앱 기능, 사기 방지 | 앱 기능 | baseline:551 · 205-213 dealer_applications.phone · 190-201 customer_profiles.phone |
| 인종 및 민족 / 정치·종교 신념 / 성적 지향 | 아니오 | — | — | — | — | 컬럼 없음 |
| 기타 정보 | **예** (생년월일·성별·통신사·CI HMAC 해시 — 만19세 확인·1인1계정) | 아니오 | **선택** | 사기 방지, 앱 기능 | — | baseline:552-555 · 20260827c_ci_hmac_contract.sql |

### 3. 금융 정보 (Financial info)
| 하위 유형 | 수집 | 공유 | 필수/선택 | 목적 | 근거 |
|---|---|---|---|---|---|
| 사용자 결제 정보 | **아니오** — 인앱 결제 호출 0건 | — | — | — | PortOne 은 `requestIdentityVerification` 만(IdentityVerificationButton.tsx:45) |
| 구매 내역 | **예** (매장 장부의 참가비 결제수단·금액) | 아니오 | **선택** (매장 운영 기능 사용 시) | 앱 기능 | baseline:351-370 `ledger_buyins` |
| 신용 점수 / 기타 금융 정보 | 아니오 | — | — | — | — |

### 4. 건강 및 피트니스 — 전부 **아니오** (관련 컬럼·API 0건)

### 5. 메시지 (Messages)
| 하위 유형 | 수집 | 공유 | 필수/선택 | 목적 | 근거 |
|---|---|---|---|---|---|
| 이메일 | 아니오 | — | — | — | — |
| SMS 또는 MMS | 아니오 | — | — | — | — |
| 기타 인앱 메시지 | **예** | 아니오 | **선택** | 앱 기능 | baseline:265,426,744,435 · 20260827g_user_messages.sql |

### 6. 사진 및 동영상 (Photos and videos)
| 하위 유형 | 수집 | 공유 | 필수/선택 | 수집 목적 | 공유 목적 | 근거 |
|---|---|---|---|---|---|---|
| 사진 | **예** (프로필·대회 포스터·장터·커뮤니티 첨부·순위 인증 증빙·신분증) | **예** (Google Gemini — **증빙 이미지만**, 신분증 제외) | **선택** | 앱 기능, 사기 방지 | 사기 방지 | rankverify.ts:62-77 · :148-175 · gemini/index.ts:70 |
| 동영상 | 아니오 | — | — | — | — | 업로드 input 이 전부 `accept="image/*"` |

### 7. 오디오 — 전부 **아니오** (QR 스캔 카메라는 `audio:false`, 영상 저장·전송 없음 — QrScanModal.tsx:71)

### 8. 파일 및 문서 — **아니오** (이미지 외 파일 업로드 경로 없음)

### 9. 캘린더 — **아니오** (기기 캘린더 API 미사용. 앱의 '캘린더'는 자체 대회 일정 데이터)

### 10. 연락처 — **아니오** (기기 주소록 접근 0건)

### 11. 앱 활동 (App activity)
| 하위 유형 | 수집 | 공유 | 필수/선택 | 수집 목적 | 공유 목적 | 근거 |
|---|---|---|---|---|---|---|
| 앱 상호작용 | **예** (GA4 이벤트, 체크인, 활동 로그) | **예** (Google Analytics) | **필수** | 분석, 앱 기능 | 분석 | main.tsx:77 · index.html:28-31 · baseline:63,36 |
| 인앱 검색 기록 | 아니오 (검색어를 서버에 저장하지 않음) | — | — | — | — | — |
| 설치된 앱 | 아니오 | — | — | — | — | — |
| 기타 사용자 생성 콘텐츠 | **예** (게시글·댓글·리뷰·문의·핸드 분석 텍스트) | **예** (Gemini — AI 기능 사용 시) | **선택** | 앱 기능 | 앱 기능 | baseline:134,109,790,702 · ai.ts:7-14 |
| 기타 작업 | 아니오 | — | — | — | — | — |

### 12. 웹 탐색 — **아니오** (브라우저 방문 기록 접근 0건)

### 13. 앱 정보 및 성능 (App info and performance)
| 하위 유형 | 수집 | 공유 | 필수/선택 | 수집 목적 | 공유 목적 | 근거 |
|---|---|---|---|---|---|---|
| 비정상 종료 로그 | **예** (`client_errors`: message·stack·url·user_agent·user_id) | **예/아니오 — Sentry DSN 설정 여부에 따름** | **필수** | 앱 기능(품질), 분석 | 분석 | errorLog.ts:24-32 · monitoring.ts:12,60-70 |
| 진단 | **예** (LoAF·CLS·INP 성능 계측) | 위와 동일 | **필수** | 앱 기능, 분석 | 분석 | monitoring.ts:20-58 |
| 기타 앱 성능 데이터 | **예** | 위와 동일 | **필수** | 앱 기능, 분석 | 분석 | 위와 동일 |

### 14. 기기 또는 기타 ID
| 하위 유형 | 수집 | 공유 | 필수/선택 | 수집 목적 | 공유 목적 | 근거 |
|---|---|---|---|---|---|---|
| 기기 또는 기타 ID | **예** (웹푸시 endpoint·구독키·User-Agent, GA4 클라이언트 ID) | **예** (Google Analytics · 브라우저 푸시 서비스) | 푸시=**선택** / GA=**필수** | 앱 기능, 분석 | 분석, 앱 기능 | push.ts:62-73 · baseline:563-571 · main.tsx:77 |

---

## B. 데이터 처리 방식(각 항목 공통 답변)

- **일시적으로만 처리됨(ephemeral)**: 위치 좌표에 해당(기기 밖 전송 없음) → 그래서 애초에 '수집' 항목이 아니다.
- **데이터 수집이 선택 사항인가**: 전화번호·실명·생년월일·성별·통신사·사진·인앱 메시지·사용자 콘텐츠·푸시 ID = **예(선택)**. 이메일·닉네임·사용자 ID·진단·GA 상호작용 = **아니오(필수)**.

## C. 보안 관행 섹션

| 질문 | 답 | 근거 |
|---|---|---|
| 전송 중 데이터가 암호화되나요? | **예** | 모든 엔드포인트 https — index.html:7 · verify-identity/index.ts:47 · gemini/index.ts:70 · weekly-email-digest/index.ts:44 |
| 사용자가 데이터 삭제를 요청할 수 있나요? | **예** | 인앱: ProfileModal.tsx:993 → `withdraw_my_account()` (baseline:4737-4766). **⚠ 웹 URL 은 아직 없음 — 제출 전 반드시 만들 것** |
| 데이터 삭제 요청 URL | `https://nuriholdem.com/legal/delete-account.html` | **미구현. 이 파일을 만들어야 위 칸을 채울 수 있다** |
| 독립적 보안 검토 배지 | 신청 안 함 | 외부 감사 이력 없음 |
| 가족 정책 준수 | 해당 없음 | 만 19세 이상 전용(verify-identity/index.ts:63-65 fail-closed 연령 게이트) |

## D. 서드파티 전송처 요약(양식의 '공유' 근거)

| 전송처 | 무엇을 보내는가 | 근거 |
|---|---|---|
| Supabase (AWS 서울 ap-northeast-2) | 1차 저장소 — 서드파티 '공유'가 아니라 처리 위탁(인프라). Play 양식에서는 공유로 세지 않음 | PrivacyPolicy.tsx:172 |
| Google Analytics 4 (`G-9T7JZNEQE8`) | 앱 상호작용 이벤트, 클라이언트 ID, IP 파생 대략 위치 | main.tsx:77 · index.html:28-31 |
| Google Gemini | 순위 인증 **증빙** 이미지(신분증 제외), 핸드 분석 텍스트, 매장 주간 요약 | gemini/index.ts:70 · rankverify.ts:148-175 |
| Sentry (미국) | 오류 스택·브라우저 정보·IP. **DSN 설정 시에만** | monitoring.ts:12,60-70 |
| Resend (미국) | 이메일 주소·닉네임(주간 다이제스트·제재 안내) | weekly-email-digest/index.ts:44 · notify-sanction/index.ts:89 |
| PortOne + 본인확인기관 | 본인인증 요청/결과 조회(국내 처리). **결제 아님** | verify-identity/index.ts:47 · IdentityVerificationButton.tsx:45 |
| 브라우저 푸시 서비스(안드로이드=FCM) | 푸시 endpoint 로 알림 발송 | push.ts:62-73 |
| 매장 업주(제3자 제공) | 예약자 표시명, 딜러 지원자 전화번호, 매장 CRM 고객 전화·생일 | baseline:617-623, 205-213, 190-201 |

## E. 제출 전 체크리스트
1. [ ] `public/legal/delete-account.html` 생성 → 배포 → 양식 URL 칸 입력 **(미완료 시 반려)**
2. [ ] Vercel 의 `VITE_SENTRY_DSN` 설정 여부 확인 → 진단 항목 '공유' 칸 확정
3. [ ] 본인인증 킬스위치(`identity_voucher_enabled`) ON/OFF 확정 → 실명·전화·생년월일·성별·통신사·CI 행 확정
4. [ ] GA4 유지 여부 확정 → '대략적인 위치' 행 확정
5. [ ] 주간 메일 SQL 에 마케팅 동의 게이트 추가(코드-방침 불일치 해소)
