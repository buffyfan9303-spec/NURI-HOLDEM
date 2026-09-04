# IARC 콘텐츠 등급 설문 답안

<!-- 2026-09-04 조사 산출물. 각 주장은 1차 출처(Google/Play/IARC 공식 문서) 또는 파일:줄 근거를 달았고,
     blocker/high 주장은 별도 에이전트가 **반증을 시도**해 검증했다. 검증에서 뒤집힌 것은 아래 '적대적 검증'에 남겼다. -->


## 결론

이 앱은 '게임물'이 아니라 정보제공 앱이므로 Play 한국 배포에 GRAC 게임물 등급분류는 불필요하다 — 갈림길은 스토어 카테고리가 아니라 콘텐츠 등급 설문 첫 화면의 '게임 vs 앱' 선택이며, 반드시 '앱'을 골라야 한다. 코드로 확인한 결과 GTO 트레이너 3종은 정답이 고정된 객관식 퀴즈(표준 차트·Nash 채점 + 간격반복)이고 핸드 리플레이어는 게시글 첨부 핸드를 스트리트 순서로 보여주는 뷰어 + 에퀴티 계산기라, 칩을 걸고 우연으로 승패를 가리는 구조가 없어 '오락을 주된 목적으로 하는 영상물'(게임산업법 §2①1)에 해당하지 않는다. 다만 '게임'으로 잘못 등록하면 앱의 자체 19세 정책 때문에 청소년이용불가가 산출될 소지가 있고, 자체등급분류사업자(구글)는 청소년이용불가 게임물을 분류할 수 없어 GRAC 직접 심의 + 사행성 확인 절차로 빠지는 최악의 경로가 열린다. 도박 문항 2개(실제 도박 / 시뮬레이션 도박)는 모두 '아니요'가 정답이고, 인앱 결제도 '아니요'다(PortOne 은 본인인증 전용, 유상 충전 경로 폐쇄됨) — 대신 사용자 상호작용·UGC 는 '예'다. 진짜 위험은 등급 설문이 아니라 Play 도박 정책의 CTA 조항으로, 참가비·GTD 가 붙은 대회에 '예약하기' 버튼이 있는 구조가 "실제 현금 게임·콘테스트·토너먼트 참여를 유도하는 클릭 유도문안"으로 읽힐 여지가 있다.



## 근거 (위험도 · 출처)

- **[blocker]** 한국에서 GRAC 등급은 '게임'에만 부여되고, 게임이 아닌 앱은 Google Play 자체 등급 체계(만 3세/7세/12세/16세/19세 이상)를 따른다. 즉 이 앱을 '앱'으로 등록하면 GRAC 등급분류 절차 자체가 발생하지 않는다
  · 출처: `https://support.google.com/googleplay/answer/6209544?hl=ko ("게임을 제외한 앱의 콘텐츠 등급 분류는 Google Play 등급 분류를 기준으로 합니다")`

- **[blocker]** 자체등급분류사업자(구글·애플 등)는 청소년이용불가 게임물을 등급분류할 수 없다. 따라서 '게임'으로 등록했다가 청소년이용불가가 산출되면 IARC 자동등급 경로가 막히고 GRAC 직접 등급분류 + 사행성게임물 확인(제21조) 절차로 넘어간다
  · 출처: `https://toss.im/apps-in-toss/blog/game_rating_classification · https://www.lexology.com/library/detail.aspx?g=234d46f5-19ee-47c5-b8ea-ad6d8e761105 (게임산업법 제21조의2 제3항 취지). 조문 원문은 직접 확인하지 못했다 — 조항 번호는 불확실`

- **[blocker]** Play 도박 정책은 '메뉴 항목, 탭, 버튼, WebView 등의 탐색 요소를 통해 실제 현금으로 내기를 하거나 실제 현금 게임, 콘테스트, 토너먼트에 참여하도록 클릭 유도문안을 제공하는 앱'을 위반으로 본다. 이 앱은 참가비(BUY-IN)·GTD 가 표시된 대회 카드에 '예약하기' CTA 를 상시 노출하므로 문언상 충돌 여지가 있다 — 등급 설문이 아니라 정책 심사에서 걸릴 지점
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9877032?hl=ko · src/components/features/ScheduleDetailModal.tsx:409,937,978 · src/components/features/ScheduleCard.tsx:272,485-495`

- **[high]** 게임산업법 제21조 제1항의 등급분류 의무는 '게임물을 제작 또는 배급하고자 하는 자'에게만 발생한다 — 게임물이 아니면 의무 주체가 아니다
  · 출처: `https://casenote.kr/법령/게임산업진흥에_관한_법률/제21조`

- **[high]** 게임물 정의(제2조 제1호)는 '오락을 할 수 있게 하거나 이에 부수하여 여가선용, 학습 및 운동효과 등을 높일 수 있도록 제작된 영상물'이다. 학습효과는 '오락에 부수하여'만 포섭되므로, 주된 목적이 정보 제공·운영도구인 이 앱은 게임물이 아니다
  · 출처: `https://casenote.kr/법령/게임산업진흥에_관한_법률/제2조`

- **[high]** GTO/핸드 트레이너 3종(프리플랍·포스트플랍·오늘의 드릴)은 정답이 고정된 객관식 퀴즈다 — 표준 차트·자체 Nash 데이터로 채점하고 간격반복(SRS)·정답률·약점 통계를 쌓는 학습 도구이며, 칩을 걸거나 우연으로 승패를 가리는 구조가 없다
  · 출처: `src/components/features/tools/PreflopTrainer.tsx:1-6, src/components/features/tools/DailyDrill.tsx:1-8, src/lib/preflopQuiz.ts (gradePreflop/makeQuiz)`

- **[high]** 핸드 리플레이어는 커뮤니티 게시글에 첨부된 핸드를 스트리트 순서로 공개하는 '뷰어'이고, 곁들여진 것은 에퀴티·아웃 계산기다. 사용자 입력으로 결과가 갈리는 플레이 구조가 아니다
  · 출처: `src/components/features/HandReplayer.tsx:1-10, src/components/features/gto/equityEngine.ts`

- **[high]** 이 앱은 자체적으로 만 19세 미만 이용을 금지한다. 가입 동의와 준법 서약에 '만 19세 이상' 필수 체크가 걸려 있고 법적고지에도 명시돼 있다 — 콘텐츠 등급 설문 결과(낮은 등급)와 실제 운영 정책(19+)이 어긋나므로 타겟 연령 설정으로 메워야 한다
  · 출처: `public/legal/anti-gambling.html('본 서비스는 만 19세 미만 청소년은 이용할 수 없습니다') · src/components/features/AuthModal.tsx:211,500,582 · src/components/features/ConsentGateModal.tsx:152`

- **[medium]** 앱 안에 실제 화폐 결제가 없다. PortOne SDK 는 휴대폰 본인인증(requestIdentityVerification) 전용이고, 이용권 유상 충전 승인 경로는 폐쇄돼 서버에서도 거부된다. 상점 마크는 활동점수(무상 획득)로만 구매한다 → IARC '디지털 구매' 문항은 '아니요'
  · 출처: `src/components/features/IdentityVerificationButton.tsx:2,45 · src/api/identity.ts:1 · src/components/features/AdminTab.tsx:163('유상 충전 승인 경로 폐쇄 — 서버도 raise') · src/lib/loyalty.ts:180 · package.json:33(@portone/browser-sdk 만 존재, 결제 SDK 없음)`

- **[medium]** 앱 안에 사용자 상호작용·UGC 가 광범위하게 있다(커뮤니티 글·댓글, 쪽지, 채팅, 이미지 첨부) → IARC 인터랙티브 요소 '사용자 상호작용'·'사용자 제작 콘텐츠 공유'는 '예'
  · 출처: `src/api/messages.ts:1 · src/components/features/chat/ChatPane.tsx · src/components/features/CommentThread.tsx · src/components/features/PostAttachments.tsx`

- **[medium]** 홈 상단 배너가 외부 링크(linkUrl)를 갖는 운영형 배너이고, 계열 사이트(nurimind.co.kr) 프로모션 링크도 있다. Play 는 '광고 형식을 사용해 제품이나 앱을 홍보'하는 경우도 광고로 보므로 '광고 포함' 선언 여부를 오너가 판단해야 한다. AdSense 스크립트는 2026-08 에 제거돼 현재 서드파티 광고는 0개다
  · 출처: `src/components/features/HomeBannersCard.tsx:1-22 · src/components/features/HomeTab.tsx:96 · src/main.tsx:70-74 · https://support.google.com/googleplay/android-developer/answer/9857753?hl=ko`

- **[medium]** Play Console 타겟 연령대 구간은 5세 이하/6~8/9~12/13~15/16~17/18세 이상 6단계이며, '만 18세 이상만' 선택 시 '미성년자 액세스 제한' 체크박스로 만 18세 미만의 검색·다운로드·구매를 차단할 수 있다. 한국 기준 '만 19세'에 정확히 대응하는 구간은 없다
  · 출처: `https://support.google.com/googleplay/android-developer/answer/9285070?hl=ko`

- **[medium]** IARC/ESRB 도박 디스크립터 정의상 'Simulated Gambling'은 '실제 현금을 걸지 않고 도박을 할 수 있는 것(주로 카지노 도박 시뮬레이션)', 'Real Gambling'은 '실제 현금을 걸고 도박을 할 수 있는 것'이다. 이 앱은 어느 쪽도 제공하지 않는다
  · 출처: `https://www.esrb.org/ratings-guide/ ("Player can gamble without betting or wagering real cash or currency" / "Player can gamble, including betting or wagering real cash or currency")`

- **[low]** 위치는 '가까운 순' 정렬에만 쓰이고 타인에게 표시되지 않는다 → IARC '위치 공유'는 '아니요'
  · 출처: `src/lib/geo.ts:3 · src/App.tsx:993-994 · src/components/features/LiveGamesTab.tsx:144-146`

- **[low]** IARC 설문의 실제 문항 문구는 참여 스토어프론트의 개발자 콘솔 로그인 뒤에만 열람 가능하며 공개 문서로 전문이 배포되지 않는다. 따라서 아래 답안은 문항 '주제' 단위 매핑이고, 콘솔의 실제 문장과 1:1 대응한다고 보장할 수 없다 — 불확실
  · 출처: `https://globalratings.com/how-iarc-works/ · https://globalratings.com/faq/`


## 조치

- [🧑 오너만 가능] 콘텐츠 등급 설문 첫 화면에서 '게임'이 아니라 '앱'을 선택한다. 이 한 번의 선택이 GRAC 심의 유무를 가르는 유일한 갈림길이다 — 스토어 카테고리로는 갈리지 않는다
  · 위치: Play Console → 정책 및 프로그램 → 앱 콘텐츠 → 콘텐츠 등급 → 설문 시작

- [🧑 오너만 가능] 앱 카테고리는 '스포츠'를 1순위, '이벤트'를 2순위로 등록한다. 라이프스타일은 잡탕이라 심사관에게 아무 정보를 주지 않는다. 스포츠는 anti-gambling.html 의 '마인드 스포츠' 법적 논거와 일치한다
  · 위치: Play Console → 스토어 설정 → 앱 카테고리

- [🧑 오너만 가능] 타겟 연령대를 '만 18세 이상만'으로 설정하고 '미성년자 액세스 제한' 체크박스를 켠다. 설문 결과 등급이 낮게 나와도 이것으로 앱의 자체 19세 정책과 정합을 맞춘다
  · 위치: Play Console → 정책 및 프로그램 → 앱 콘텐츠 → 타겟층 및 콘텐츠

- [🧑 오너만 가능] 설문 도중 '추가 설명' 입력란이 나오면 다음을 그대로 적는다: '앱 내 베팅·현금게임·환전 기능 없음. 오프라인 매장이 개최하는 대회 일정 정보 제공과 커뮤니티, 매장 운영 도구가 전부이며 참가비·상금은 매장이 판매하는 상품 정보로만 표시함. 포커 학습 도구는 정답이 정해진 객관식 퀴즈로 베팅 요소 없음.'
  · 위치: Play Console 콘텐츠 등급 설문 (또는 앱 액세스 권한 안내 메모)

- [🤖 코드/문서 작업] '예약하기' CTA 주변 카피가 '실제 현금 토너먼트 참가 유도'로 읽히지 않는지 점검한다 — 기능은 그대로 두되(§규약 2: 기능 보존), 라벨을 '참가 신청'보다 '방문 예약/좌석 예약'에 가깝게, 참가비는 '매장이 정한 상품 가격' 맥락임을 한 줄 병기하는 방향
  · 위치: src/components/features/ScheduleDetailModal.tsx:409, 937-978 · src/components/features/ScheduleCard.tsx:485-495

- [🤖 코드/문서 작업] manifest 의 categories 순서를 사용 실체에 맞춰 sports 우선으로 재배열한다(현재 social, lifestyle, sports). 스토어 카테고리 선택과 신호를 일치시키는 저비용 정리
  · 위치: public/manifest.webmanifest:15

- [🧑 오너만 가능] '광고 포함' 선언 여부를 결정한다. 서드파티 광고 SDK 는 0개(AdSense 제거 완료)지만 홈 배너가 외부 링크를 갖는 운영형 프로모션이라 판단이 필요하다 — 배너가 유료 게재면 '예', 자사 안내 전용이면 '아니요'로 갈린다
  · 위치: Play Console → 정책 및 프로그램 → 앱 콘텐츠 → 광고 · 근거 코드는 src/components/features/HomeBannersCard.tsx

- [🧑 오너만 가능] 스토어 등록정보 전체 설명 첫 문단에 '앱 내 베팅·환전 없음'과 '만 19세 이상 이용'을 명시하고, 법적고지 5종 중 anti-gambling.html 링크를 노출한다. Play 도박 정책 심사에서 가장 먼저 읽히는 자리다
  · 위치: Play Console → 스토어 등록정보 → 전체 설명 · public/legal/anti-gambling.html

- [🤖 코드/문서 작업] 부스트·기간 마크 등 유료 결제를 나중에 열면 IARC '디지털 구매' 답이 바뀐다. 결제를 여는 커밋에서 콘텐츠 등급 설문을 재제출하도록 PLAYSTORE.md 에 한 줄 남긴다
  · 위치: PLAYSTORE.md (4항 콘텐츠 등급 설문 옆)


---

## 그대로 사용할 산출물

# IARC 콘텐츠 등급 설문 — NURI HOLDEM 문항별 답안

전제: IARC 설문의 실제 문장은 Play Console 로그인 뒤에만 열람 가능하다(globalratings.com/how-iarc-works). 아래는 공개 문서로 확인 가능한 **주제 단위**로 정리한 답안이며, 콘솔의 문구와 표현이 다를 수 있다.

---

## 0. 사전 선택 (가장 중요 — 여기서 GRAC 유무가 갈린다)

| 항목 | 답 | 근거 |
|---|---|---|
| 이 항목은 게임입니까, 앱입니까? | **앱 (게임 아님)** | 주된 목적이 오프라인 대회 일정 정보 제공·커뮤니티·매장 운영 도구. 게임산업법 §2①1 의 '오락을 주된 목적으로 제작된 영상물'이 아니다 |
| 앱 카테고리 | **스포츠** (대안: 이벤트) | 마인드 스포츠 프레이밍이 anti-gambling.html 의 법적 논거와 일치. 라이프스타일은 정보량 0 |
| 개발자 연락처 | 엔에이치홀딩스 / buffyfan9303@gmail.com / nuriholdem.com | public/legal/* 사업자 정보와 동일하게 |

> ⚠ 여기서 '게임'을 고르면 IARC 가 한국 등급을 산출하고, 이 앱의 19+ 성격상 청소년이용불가가 나올 소지가 있다. 자체등급분류사업자(구글)는 청소년이용불가 게임물을 분류할 수 없으므로 GRAC 직접 심의 + 사행성게임물 확인 절차로 넘어간다. **되돌리기 가장 비싼 실수다.**

---

## 1. 폭력 (Violence)

| 문항 주제 | 답 | 근거 |
|---|---|---|
| 폭력적 행위를 묘사합니까 | **아니요** | 앱 콘텐츠에 폭력 묘사 0 |
| 사실적 폭력 / 유혈 / 고문 | **아니요** | — |
| 사람 또는 동물에 대한 위해 | **아니요** | — |

## 2. 성적 콘텐츠 (Sexuality)

| 문항 주제 | 답 | 근거 |
|---|---|---|
| 노출·성적 행위 묘사 | **아니요** | — |
| 성적 대상화된 묘사 | **아니요** | 매장 포스터 이미지는 업로드 심사(관리자 승인) 대상 |
| ※ 이용자가 올린 이미지에 그런 것이 있을 수 있음 | 별도 UGC 문항에서 처리 | 4항 참조 |

## 3. 언어 (Language)

| 문항 주제 | 답 | 근거 |
|---|---|---|
| 앱이 제공하는 콘텐츠에 비속어·욕설 | **아니요** | 앱 자체 카피에 없음 |
| 성적·모욕적 언어 | **아니요** | — |

## 4. 규제 약물 (Controlled Substances)

| 문항 주제 | 답 | 근거 |
|---|---|---|
| 마약·주류·담배의 사용·판매 묘사 | **아니요** | 앱은 매장 정보를 안내할 뿐 주류를 묘사·판매하지 않음 |

## 5. 도박 (Gambling) — 이 앱의 핵심 문항

| 문항 주제 | 답 | 근거 |
|---|---|---|
| **실제 도박 또는 현금 지급** (실제 화폐로 베팅하거나 실제 화폐가 지급되는가) | **아니요** | 앱 안에 베팅 기능 0. 회사는 참가비를 수취하지 않고 상금을 지급하지 않으며 금전 흐름에 관여하지 않는다(anti-gambling.html). 결제 SDK 는 본인인증 전용(IdentityVerificationButton.tsx:45) |
| **시뮬레이션 도박** (실제 화폐 없이 도박을 할 수 있는가 — 카지노 시뮬레이션 등) | **아니요** | 칩을 걸고 우연으로 승패를 가리는 화면이 하나도 없다. GTO 트레이너 3종은 표준 차트·Nash 로 채점되는 **정답이 정해진 객관식 퀴즈**(PreflopTrainer.tsx / DailyDrill.tsx), 핸드 리플레이어는 **기록 재생 뷰어 + 에퀴티 계산기**(HandReplayer.tsx). ESRB 정의의 "Player can gamble"에 해당하지 않는다 |
| 도박을 가르치거나 도박 사이트로 연결하는가 | **아니요** | 외부 도박 사이트 링크 0. 불법 도박장 홍보는 서약으로 금지되고 적발 시 영구 정지(anti-gambling.html 제재표) |
| 무작위 아이템(루트박스·가챠) | **아니요** | 상점 마크는 가격·조건이 고정된 확정 구매(shopMarks.ts) |

> 설명란이 있으면 반드시 적을 것: "포커 소재가 등장하지만 앱 내에서 카드를 나눠 승부를 겨루는 기능은 없음. 학습 도구는 정답이 정해진 객관식 퀴즈."

## 6. 공포 (Fear / Horror)

| 문항 주제 | 답 |
|---|---|
| 무섭거나 불쾌한 이미지·소리 | **아니요** |

## 7. 인터랙티브 요소 (Interactive Elements)

| 문항 주제 | 답 | 근거 |
|---|---|---|
| 사용자 간 상호작용(텍스트·음성·이미지 교환) | **예** | 커뮤니티 글·댓글(CommentThread.tsx), 쪽지(api/messages.ts), 채팅(chat/ChatPane.tsx) |
| 사용자 제작 콘텐츠(UGC) 공유 | **예** | 게시글 이미지 첨부(PostAttachments.tsx), 중고장터 사진 |
| 사용자 위치를 **다른 사용자에게** 표시 | **아니요** | geolocation 은 '가까운 순' 정렬에만 사용, 서버 저장·타인 노출 없음(lib/geo.ts:3, App.tsx:993-994, LiveGamesTab.tsx:144-146) |
| 개인정보를 제3자와 공유 | **예** (제한적) | 닉네임·프로필·장착 마크가 공개 랭킹·커뮤니티에 노출. 실명·연락처·CI 는 비노출(보안 표준 §6) |
| **디지털 구매(인앱 결제)** | **아니요 (현재)** | 실제 화폐 결제 경로 0. 상점 마크는 활동점수(무상 획득)로만 구매하고, 이용권 유상 충전 경로는 서버에서도 거부(AdminTab.tsx:163). ⚠ 부스트 유료화가 열리면 '예'로 바뀌고 **재설문 필요** |
| 무제한 인터넷 접근(내장 브라우저·검색엔진) | **아니요** | 앱 내 범용 브라우저 없음. 외부 링크는 시스템 브라우저로 열림(window.open, _blank). ⚠ TWA 특성상 스코프 밖 URL 은 커스텀 탭으로 열리므로, 심사에서 되물으면 "범용 브라우저 기능 없음"으로 답할 것 |
| 광고 표시 | **오너 판단** | 서드파티 광고 SDK 0개(AdSense 제거, main.tsx:70-74). 홈 배너(HomeBannersCard.tsx)가 유료 게재면 '예' |

---

## 8. 예상 결과와 보정

- 위 답변대로면 IARC 는 낮은 연령 등급 + 인터랙티브 요소 '사용자 상호작용' 표기를 산출한다(ESRB Everyone/Teen, PEGI 3~12, GRAC 해당 없음).
- 그런데 앱은 자체적으로 **만 19세 이상만** 이용 가능하다(anti-gambling.html, AuthModal.tsx:211, ConsentGateModal.tsx:152).
- 이 간극은 **콘텐츠 등급이 아니라 타겟 연령으로 메운다**: 타겟층 및 콘텐츠 → **만 18세 이상만** + '미성년자 액세스 제한' 체크. (Play 연령 구간에 만 19세는 없다 — 18세 이상이 최고 구간)
- 설문 답을 억지로 올려 '성인용'을 만들지 말 것. 허위 답변은 삭제·정지 사유이고, 도박 문항을 '예'로 답하면 도박 앱 라이선스 요건(라이선스 보유·승인·지역 차단)이 통째로 따라붙는다.

---

## 9. 등급 설문 밖의 진짜 위험 (같이 처리해야 함)

Play 도박 정책은 **"메뉴 항목, 탭, 버튼, WebView 등의 탐색 요소를 통해 실제 현금으로 내기를 하거나 실제 현금 게임, 콘테스트, 토너먼트에 참여하도록 클릭 유도문안(CTA)을 제공하는 앱"**을 위반으로 본다.
이 앱은 참가비(BUY-IN)와 GTD 가 표시된 대회 카드에 '예약하기' CTA 를 상시 노출한다(ScheduleDetailModal.tsx:409/978, ScheduleCard.tsx:485-495).
등급 설문에서는 정직하게 '아니요'가 맞지만, **정책 심사에서 걸릴 확률은 여기가 가장 높다.** 스토어 설명 첫 문단의 '앱 내 베팅·환전 없음' 명시와 anti-gambling.html 링크 노출로 방어선을 먼저 깔아 둘 것.
