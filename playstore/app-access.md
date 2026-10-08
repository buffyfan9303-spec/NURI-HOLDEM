# 앱 액세스(App access) — 심사관 안내문 초안 (2026-10-08)

Play Console → 정책 및 프로그램 → 앱 콘텐츠 → **앱 액세스 권한** 에 넣는 글이다.
선택지는 "일부 기능이 제한됨(로그인 필요)" 을 고르고, 아래 영문을 그대로 붙인 뒤 **테스트 계정 칸만 오너가 채운다.**
(심사관은 대부분 영어로 읽는다. 한국어 원문은 내부 확인용.)

## 사실 근거 (2026-10-08 확인)

| 범위 | 로그인 없이 | 로그인 필요 | 본인인증(휴대폰) 필요 |
|---|---|---|---|
| 홈·일정 탐색·대회 상세·매장 페이지·라이브 관전 | 가능 | — | — |
| 커뮤니티 읽기·GTO 학습 도구 | 가능 | — | — |
| 글·댓글 쓰기, 쪽지, 찜·알림 | — | 필요 | 일부(글쓰기 게이트) |
| 대회 예약·매장 이용권·이벤트 카드 | — | 필요 | **필요** — 운영 스위치 `identity_voucher_enabled = on`(2026-10-08 읽기 조회) |
| 내 매장(업주 도구) | — | 업주 계정 | — |

- 휴대폰 본인인증(PortOne → 국내 본인확인기관)은 **한국 휴대폰 명의자만** 통과한다. 심사관이 직접 할 수 없다.
- 실명 인증을 마친 계정을 심사관에게 넘기면 그 사람의 실명·생년월일이 붙은 계정을 남이 쓰게 된다 — **넘기지 않는다**(개인정보·보안 표준 §6).
- 그래서 안내문은 "인증이 필요한 예약·이용권은 화면 녹화로 보여 준다"로 쓴다. 녹화는 오너가 자기 계정으로 찍는다(아래 오너 할 일).

## 영문 (콘솔에 붙일 글)

```
NURI HOLDEM (누리홀덤) is an information and community app for offline Texas Hold'em pubs in South Korea.

1) No login is needed for the main content. Open the app and use the bottom tabs:
   Home / Live / Community / GTO (study tools) / Calendar.
   Tournament schedules, tournament details, venue pages and live tournament clocks can all be viewed without an account.

2) Test account (email login) for signed-in features (posting, comments, messages, saving tournaments):
   Tap "로그인" (Log in) at the top right → choose email login.
   Email: <OWNER FILLS IN>
   Password: <OWNER FILLS IN>

3) Reservations, store vouchers and the attendance event require Korean mobile identity verification
   (a legal age check for users 19 and over, done by a licensed Korean identity provider with a Korean phone number).
   Reviewers cannot complete this step. A screen recording of these flows is available here: <OWNER FILLS IN: video URL>

4) The app has no in-app purchases, no card game play and no wagering. Entry fees shown for tournaments are price
   information published by each venue; payment happens at the venue, not in the app.

Account deletion: My info (내 정보) → Security (보안) → Delete account (회원 탈퇴),
or https://nuriholdem.com/legal/delete-account.html
Contact: ace@nuriholdem.com
```

## 한국어 원문 (내부 확인용)

```
누리홀덤은 한국의 오프라인 홀덤펍을 위한 정보·커뮤니티 앱입니다.
1) 주요 화면은 로그인 없이 볼 수 있습니다 — 하단 탭: 홈/라이브/커뮤니티/GTO/캘린더.
2) 로그인 기능(글쓰기·댓글·쪽지·찜)은 아래 테스트 계정(이메일 로그인)으로 확인할 수 있습니다.
3) 예약·매장 이용권·출석 이벤트는 만 19세 확인을 위한 국내 휴대폰 본인인증이 필요해 심사관이 직접 진행할 수 없습니다. 화면 녹화를 첨부합니다.
4) 인앱 결제·카드 게임·베팅 기능이 없습니다. 참가비는 매장이 공개한 가격 정보이며 결제는 매장에서 합니다.
```

## 오너가 준비할 것 (실행표 ②에도 같은 내용)

1. 심사 전용 이메일 계정 1개를 앱에서 새로 가입한다(본인인증 하지 않음). 비밀번호는 이 저장소·채팅에 적지 않고 콘솔 칸에만 넣는다.
2. 자기 계정으로 "대회 예약 → 이용권 지갑 → 출석 이벤트 카드" 를 화면 녹화(1~2분)하고 링크 공유가 되는 곳(예: 구글 드라이브 '링크가 있는 사용자')에 올린다. 화면에 실명·전화번호가 보이면 가린다.
3. 심사 기간에 테스트 계정 비밀번호를 바꾸지 않는다.
