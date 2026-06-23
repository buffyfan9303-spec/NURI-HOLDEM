# 내 매장(Venue) 파이프라인 강화 백로그

> 2026-06-23 6차원 감사 + 7영역 강화 스캔으로 도출한 **48건**의 강화(enhancement) 기회.
> 버그가 아니라 "이미 동작하는 파이프라인을 더 강하게/연결되게/자동화"하는 항목.
> 값 = 가치(높음/중간/낮음), 공수 = S(반나절)·M(1~2일)·L(3일+). 종류 = 자동화/연결/분석/견고성/실시간/정합/UX.

## 관통하는 큰 그림
1. **알림/푸시 인프라(`notifications`+`push_on_notification`+VAPID)는 완비됐는데** 매장 경제 이벤트(이용권·후기·클락·시즌·휴면)에 거의 연결돼 있지 않다 → 연결만으로 리텐션·전환 큰 상승(대부분 S~M).
2. **신원(`user_id`)이 장부·CRM·직원에서 자유텍스트 이름으로 단절** → `user_id` 키로 묶으면 CRM·급여·노쇼·등급이 한 번에 살아난다(토대).

## 추천 착수 순서
1. 🔥 Quick Win: 이용권 수령·사용 알림 + 시즌 D-7/D-1 알림 (둘 다 기존 인프라 재사용, S)
2. 리그 ITM→통합스탠딩 자동적립 + 토너 finish→순위 자동초안 (가장 큰 2개 단절)
3. **CRM 토대**: `customer_profiles.user_id` + 체크인 자동적재 + 오늘 방문 손님 보드 ← *진행 중(2026-06-23)*
4. 직원 `user_id` 연동 + 급여 자동 산출

상태: ☐ 미착수 · ◑ 진행중 · ☑ 완료

---

## 1. 장부·정산 (ledger-settlement)
- ☐ **[높음/M·자동화] 마감 → 순위 자동 초안 저장** — 마감해도 순위는 100% 수동 재입력. `venue_rankings`에 `status(draft|final)` 추가, 마감 시 그날 명단∪바인을 draft로 선기록, 등수·프라이즈만 채워 확정. *(클락 finish→초안과 통합 가능)*
- ☐ **[높음/L·정합] 미수금 영속 추적 + 회수 알림** — `is_unpaid`는 있으나 "갚았다"·이월 없음. `ledger_receivables`(venue,player,amount,status,settled_at) 신설, 미수자 다음 방문 시 회수 알림 + 업주 홈 '미회수 합계' 위젯.
- ☐ **[높음/M·견고성] 정산 누수(클락 vs 장부) 영속 기록·경보** — 현재 diff를 토스트 한 줄로만 알리고 사라짐. diff를 저장해 마감자별 반복 누수 추적 + 임계 초과 시 업주 경보.
- ☐ [중간/M·분석] 일일 마감 리포트(전일 대비) — 주간 리포트만 존재. 마감 시 그날 KPI를 `daily_ledger_summary`에 박제 + 전일 대비 알림.
- ☐ [중간/M·분석] DB측 매출집계 RPC/뷰 단일화 — `buyinFinance` 규칙이 프런트·`getPosterOpsSummaries`·주간RPC 3곳 중복. `ledger_revenue_summary` RPC로 1원화 + 페이로드 축소.
- ☐ [중간/M·정합] 프라이즈풀 vs 실수금 역마진 경보 — GTD 미달/시상>매출 시 마감 화면 경고. `gameType='gtd'`,`targetEntries` 근거 존재.
- ☐ [낮음/S·자동화] 마감·순위미입력 자동 리마인드 — 마감 후 순위 미입력 장부를 cron으로 찾아 업주 알림.

## 2. 순위·시즌·리그 (ranking-season-league)
- ☐ **[높음/M·연결] 리그 ITM 보고 → 통합 스탠딩 자동 적립** — *가장 큰 단절.* 라이브 정산(`league_event_status.itm`)과 누적순위(`league_entries`)가 전혀 연결 안 됨(수동 입력). 정산 시 ITM을 점수 환산해 자동 적립(`(league,venue,date,name)` 유니크).
- ☐ **[높음/M·자동화] 리그 시즌 종료 → 아카이브·우승 매장/MVP** — 매장 시즌은 완비인데 리그는 `final`에서 멈춤. `league_results`+`end_league_season` RPC, `_end_season_internal` 패턴 재사용.
- ☐ 🔥 **[높음/S·자동화] 시즌 D-7·D-1 알림** — `ends_on`·`current_season_standings`·알림 인프라 다 있는데 막바지 푸시 없음. `notify_seasons_ending` cron + `notified_d7/d1` 가드.
- ☐ [중간/M·분석] 단골/MVP 자동 선정 배지(시즌MVP·단골왕·머니인왕) — `venue_player_counts` 등 집계는 풍부, 매장 단위 칭호 자동 부여만 없음.
- ☐ [중간/M·연결] 활동점수 → 매장 등급/혜택 자동 지급 — 점수는 코스메틱 마크에만 쓰임. 등급 도달 시 바우처 자동 발급.
- ☐ [중간/S·UX] 전국 통합랭킹 + 시즌챔피언 크로스링크 — `global_ranking_totals`·`get_domestic_rankings`·`my_championships`가 따로 놂. 한 패널에 합성.

## 3. 이용권 경제 (voucher-economy)
- ☐ 🔥 **[높음/S·연결] 이용권 수령·사용 즉시 알림** — `store_vouchers` 발급/사용 알림 0건. 손님이 받은 줄 모름(101장, 사용 0). `notifications`+`push_on_notification`에 연결.
- ☐ **[높음/M·자동화] 이용권 만료 정책** — `expires_at` 컬럼 자체가 없음(만료 상태는 흔적만). 유효기간+만료 임박 알림+소멸 cron.
- ☐ **[높음/M·자동화] 단골 자동 발급(방문/바인 마일스톤)** — 현재 바인당 적립만(단발). 누적 충성도를 자동 보상으로 환류(`voucher_loyalty_grants` 멱등키).
- ☐ [중간/S·정합] 적립 멱등성 보강 — `accrue_voucher`에 중복방지 키 없음(재시도 시 과적립). `source_buyin_id`+부분유니크.
- ☐ [중간/M·분석] 사용 패턴 코호트 분석 — 발급→첫사용 리드타임·요일/시간대·잠자는 이용권. 분석을 리마인드 액션으로 환류.
- ☐ [중간/S·실시간] 발급 한도 소진 임박 알림 — `quota<임계` 시 능동 알림(현재 화면 열어야만 배지).
- ☐ [중간/M·분석] 종류/캠페인 태깅 — `kind(accrual|manual|campaign|loyalty)`+`campaign_id`로 캠페인 ROI 분해.

## 4. 출석·방문·CRM (checkin-attendance-crm)
- ◑ **[높음/L·연결] 체크인 `user_id` ↔ `customer_profiles` 신원 연결** — *CRM 핵심 단절.* 앱 체크인(계정)과 CRM(장부 자유텍스트)이 따로. `customer_profiles`에 `user_id` 컬럼조차 없음(0행). *← 2026-06-23 착수.*
- ◑ **[높음/M·자동화] QR 체크인 → 자동 CRM 적재 + '오늘 방문 손님' 보드** — `check_in`이 checkins만 남기고 끝. 자동 upsert + 업주 대시보드 위젯. *← 2026-06-23 착수.*
- ☐ **[높음/M·자동화] 방문 빈도 자동 등급(VIP/단골) + 등급별 자동 쿠폰** — 단골 판별이 코드 곳곳 하드코딩. `customer_profiles.tier` + cron 재계산 + `coupons` 자동 발급.
- ☐ **[높음/M·자동화] 휴면 손님 감지 + 재방문 유도 푸시(win-back)** — `lastVisit`은 계산되나 휴면 추출·알림 없음. 30일+ 미방문 회원에 재방문 쿠폰 푸시.
- ☐ **[높음/M·분석] 예약↔체크인↔장부 노쇼 자동 추적** — 셋이 대조 안 됨(노쇼가 방문으로 오집계). 노쇼 판정 RPC + `noshow_count`.
- ☐ [중간/S·자동화] 생일 단골 자동 축하+쿠폰 — `getUpcomingBirthdays` 완성됐으나 표시만. 당일 생일자 쿠폰+푸시 자동화.
- ☐ [중간/S·UX] 출석왕 리더보드 + 스트릭 마일스톤 보상 — 스트릭 점수는 정확히 관리되나 어디에도 노출/보상 없음.

## 5. 직원·운영 (staff-ops)
- ☐ **[높음/M·정합] 직원 계정 ↔ 스케줄 `staff_user_id` 연동** — 이름(text) 매칭이라 동명이인/닉변경 시 셀프출퇴근·급여 깨짐. `venue_staff.user_id`는 있는데 사장됨.
- ☐ **[높음/M·자동화] 급여 자동 산출 + 월 명세 영속화** — 클라에서 시급×시간만, 미저장. 야간(22~06)·연장 가산 없음. `compute_payroll` RPC + `staff_payslip`.
- ☐ **[높음/M·자동화] 반복 스케줄 자동 생성(요일 패턴)** — 매달 30칸×N명 수동 토글. `weekly_off` 기반 '패턴으로 자동 채우기'.
- ☐ [중간/M·실시간] 교대 D-1 리마인더 + 미출근 경보 cron — 알림은 `confirmSchedule` 1회뿐.
- ☐ [중간/M·견고성] 셀프 QR 출퇴근 + 위변조 감사로그 — 현재 임의 시각 덮어쓰기 가능, 변경이력 없음(급여 근거인데 무결성 약함). 서버시각 RPC + `staff_attendance_log`.
- ☐ [중간/M·분석] 근태·인건비 통계(지각률·결근·인건비/매출%) — 현재 출근일수·평균출퇴근만.
- ☐ [중간/L·견고성] 포지션 기반 권한 세분화(딜러/플로어/캐셔) — `staff_position` 입력은 받으나 사장됨. 최소권한 분리.
- ☐ [중간/L·연결] `dealer_shifts` ↔ `staff_schedule` 통합 — 딜러 로테이션이 3번째 분리 시스템(급여 누락 위험).

## 6. 클락·라이브 운영 (clock-live-ops)
- ◑ **[높음/M·연결] 토너 종료(finish) → 입상 순위 자동 초안** — finish가 chime만. 클락이 prize 자리수·참가명단을 다 갖고도 수기. 입상 모달 자동 생성 → `saveVenueRankings`. *← 2026-06-23 착수.*
- ☐ **[높음/M·실시간] 레벨업·등록마감 임박 푸시** — 화면 봐야만 아는 로컬 오디오뿐. 푸시 인프라 연결(`last_alert_index` 가드).
- ☐ [중간/S·분석] 평균 스택 BB 환산 표시 — `avgStack/cur.bb`로 'AVG 42 BB' 즉석 파생(스키마 변경 불필요).
- ☐ [중간/M·UX] TV 디스플레이 공지 티커 + 다중 스폰서 로테이션 — 현재 단일 광고 이미지뿐.
- ☐ [중간/S·실시간] 리바인/애드온 마감 카운트다운 — REG CLOSE만 있음. `addonCloseLevel` 추가.
- ☐ [중간/M·정합] 실 바인 매출 기반 프라이즈풀 자동 산출·검증 — `live_stats.buyInAmount`×엔트리로 EST.POOL 파생, 수기 prize와 괴리 시 경고.

## 7. 매장 페이지·성장 (venue-page-growth)
- ☐ **[높음/M·연결] 새 후기·악평 알림 + 업주 답글** — `venue_reviews` 트리거 0건(업주가 악평을 모름). 답글 기능도 없음.
- ☐ **[높음/M·자동화] 휴면 단골 타겟 푸시 캠페인** — 현재 팔로워 전체 무차별. '14일+ 미방문 단골' 세그먼트 핀포인트(`send_venue_announcement`에 `p_segment`).
- ☐ **[높음/M·분석] 업주 성장 대시보드(팔로워·평점·방문 추세)** — `StoreDashboard`에 follow·review·rating 지표 0. `venue_growth_stats` RPC + CountUp 카드.
- ☐ **[높음/M·자동화] QR 체크인 → 팔로우 유도 + 후기 요청 funnel** — QR이 성장 엔진인데 전환 루프 비어있음(후기 0행).
- ☐ [중간/S·연결] 평점 SEO JSON-LD(LocalBusiness+aggregateRating) — 공유 카드에 평점 미노출.
- ☐ [중간/M·연결] 근처/비슷한 매장 추천 + 팔로우 매장 통합 피드 — 회원 체류·재방문 고리 없음.
- ☐ [중간/M·분석] 마케팅 푸시 성과 분석(도달·후속 방문 귀인) — `venue_announcements`는 발송 수만 저장.
