# UI/UX 심층 재분석 — 2026-08-17

8개 차원(첫 방문·예약/체크인·커뮤니티·라이브/클락·업주 콘솔·리텐션·마이크로 디테일·정보구조) 병렬 코드 감사.
발견 62건 중 impact≥4는 반박 검증(이미 구현 여부·실재 여부) 통과분만 수록 — **확정 40건 + 경미 21건**.

## 확정 발견 40건 (검증 통과)

### 첫 방문 5분

#### [5점·M] 첫 화면 기본 필터가 '오늘 하루'라 첫인상이 빈 화면·종료 배지가 되기 쉬움
- **문제**: 처음 온 손님은 아무 조건도 안 걸었는데 '오늘' 날짜 필터가 기본 적용된 상태로 시작한다. 평일 오전·심야 방문이면 목록이 0건이거나 이미 끝난 오늘 대회(종료 배지)만 가득해 '대회가 없는 서비스'로 오해하고 이탈한다. 게다가 이 기본 상태가 '필터 걸린 상태'로 계산돼, 아무것도 안 건 방문자에게 '초기화' 버튼이 보이고 빈 화면 문구도 '조건에 맞는 대회가 없어요'라고 말한다 — 사용자는 자기가 뭘 잘못 걸었는지 찾게 된다.
- **개선안**: 기본 상태를 '오늘부터 앞으로'(날짜 무필터+종료 숨김)로 바꾸거나, 최소한 기본 오늘 선택을 필터로 취급하지 않기(hasActiveSearchFilter·EmptyState filtered 판정에서 제외, hideEnded는 기본 상태에서 true). 추가로 날짜 슬라이더 셀에 대회가 있는 날 점(·)이나 개수를 표시하고, 오늘 0건이면 '오늘은 없어요 — 내일 N개 →' 식으로 가장 가까운 대회 날짜로 원탭 이동을 제공.
- **근거**: IntegratedSearchBar.tsx:236 selectedDates 기본값 [오늘]. App.tsx:1334 hideEnded는 dates가 비어야만 true → 기본 [오늘]이라 첫 화면에 오늘의 종료 대회가 노출(주석 의도 '앱을 막 켠 상태는 종료 제외'와 실제 동작 모순). App.tsx:749+2007 첫 진입부터 '초기화' 버튼 노출. App.tsx:2164-2166 dates.length>0라 프리스틴 로드가 filtered로 판정 → EmptyState가 '조건에 맞는 대회가 없어요' 출력. App.tsx:1994 '총 N개'도 오늘 개수만 집계.
- **검증**: 실제 격차 — IntegratedSearchBar.tsx:236·App.tsx:746 기본 dates=[오늘]이라 App.tsx:1334 hideEnded=false(주석 의도와 모순, 종료 대회 첫화면 노출), 749→2007 프리스틴 로드에 초기화 버튼, 2164-2166 filtered 판정으로 빈화면이 '조건에 맞는 대회가 없어요'(2787) 출력, 날짜슬라이더 점표시·최근접 날짜 원탭 이동은 미구현

#### [4점·M] 온보딩 3택 중 2택이 아무것도 바꾸지 않음 — '첫 화면을 맞춰드려요' 약속 불이행
- **문제**: 첫 방문 700ms 후 뜨는 온보딩 시트가 '주로 무엇을 하시나요? 첫 화면을 맞춰드려요'라고 묻지만, 실제로 화면이 바뀌는 건 'GTO 공부'(도구 탭 이동) 하나뿐이다. '대회 찾기'와 '매장 단골(체크인·이용권)'은 localStorage에 저장만 되고 어디서도 읽히지 않아 선택 전과 동일한 browse 화면이 나온다. 특히 비로그인 첫 방문자에게 '체크인·이용권'은 실행 불가능한 약속이라, 앱의 첫 상호작용이 '눌러도 달라지는 게 없는 질문'이 된다.
- **개선안**: '매장 단골' 선택 시 가까운 순 정렬 활성화+매장 팔로우 유도(또는 주변 매장 리스트 랜딩)를 실제로 실행하고, '대회 찾기'는 이번 주 대회 수·지역 선택으로 이어지게 한다. 그게 어려우면 질문형 온보딩을 버리고 실제 가치를 보여주는 1장(예: '이번 주 전국 대회 N개 · 내 주변 매장 M곳')으로 교체 — 묻지 말고 보여주기.
- **근거**: OnboardingSheet.tsx:31-38 finish()가 persona 저장 후 'gto'만 goto-tab 디스패치. App.tsx:660 persona 소비처는 'gto' 단 한 곳(tourney/regular는 데드 데이터). OnboardingSheet.tsx:51 '첫 화면을 맞춰드려요' 문구, :43 'regular' 옵션이 비로그인자에게 체크인·이용권 약속.
- **검증**: 확인됨 — nuri:persona 소비처는 App.tsx:660의 'gto' 체크 단 하나뿐이고, OnboardingSheet.tsx finish()도 'gto'만 goto-tab 디스패치. 'tourney'/'regular'는 저장만 되고 어떤 화면 변화도 일으키지 않아(건너뛰기와 동일한 browse) '첫 화면을 맞춰드려요' 약속 불이행이 실제로 존재하며 미구현 상태.

#### [4점·S] '가까운 순'을 켜도 카드에 거리가 안 보임 — 정렬 효과를 체감·검증 불가
- **문제**: 📍 가까운 순 토글은 위치 권한까지 요청해 haversine으로 정렬하지만, 카드에는 거리 숫자가 전혀 없고 위치 정보는 '강남' 같은 대분류 텍스트뿐이다. '갈까?' 의사결정의 핵심 변수(얼마나 먼가)를 확인할 수 없어, 사용자는 정렬이 실제로 작동했는지도 모른 채 권한만 내준 셈이 된다.
- **개선안**: myPos가 있을 때 App에서 카드별 distanceKm를 계산해 ScheduleCard prop으로 내려 '📍1.2km' 배지를 3행(리스트)·매장명 옆(그리드)에 표시. 좌표 없는 매장은 배지 생략(현재 정렬에서 뒤로 밀리는 동작과 일관).
- **근거**: App.tsx:1352-1358 nearSort 시 haversineKm로 정렬만 수행, 거리값은 버려짐. ScheduleCard.tsx 전체에 거리 표기 없음 — 위치 표현은 VenueLink의 region 텍스트뿐(ScheduleCard.tsx:152). CardProps(159-169)에 거리 관련 prop 부재.
- **검증**: App.tsx:1352-1358에서 haversineKm은 정렬 비교에만 쓰고 값은 버려짐. ScheduleCard.tsx에는 km/거리 표기·prop 전무(위치는 VenueLink region 텍스트뿐)이며, geo.ts의 표시용 fmtKm 헬퍼는 테스트에서만 쓰이고 UI에 미연결 — 격차 실재.

### 예약→체크인 루프

#### [5점·M] 예약 완료 순간이 토스트 한 줄로 끝남 — '다음 단계' 안내 부재
- **문제**: 손님이 '예약하기'를 누르면 '예약되었습니다' 토스트와 '예약 완료' 배지로 끝난다. 대회는 보통 며칠 뒤인데 캘린더 등록·알림 켜기·당일 준비(길찾기) 같은 다음 행동을 아무것도 제안하지 않아, 예약 후 앱을 닫으면 대회 당일까지 아무 접점이 없다. 캘린더 버튼이 바로 아래 있지만 성공 순간과 연결되지 않아 대부분 지나친다.
- **개선안**: 예약 성공 시 onDone(afterReserve)에서 토스트 대신 작은 성공 시트를 띄운다: ① '📅 내 캘린더에 추가'(기존 CalendarShareRow 로직 재사용) ② '🔔 시작 1시간 전 알림 받기'(enablePush 호출 — 서버 리마인더는 이미 있으므로 푸시 구독만 붙이면 됨) ③ D-day 표기. 이미 있는 부품 조합이라 신규 백엔드가 필요 없다.
- **근거**: ScheduleDetailModal.tsx:688-694 afterReserve는 setMine+toast만 실행. CalendarShareRow(560-597)는 별도 요소로 성공 흐름과 무관. App.tsx:727 푸시 온보딩 배너(pushNudge)는 isOwner||isAdmin||venue_staff 게이트라 손님에겐 영원히 안 뜸 — 손님이 푸시를 켜는 경로는 ProfileModal 설정(570-580) 뿐.
- **검증**: 확인됨: ScheduleDetailModal.tsx:688-694 afterReserve는 setMine+toast+loadRes뿐이고 CalendarShareRow(561-597)는 성공 흐름과 분리(301행 렌더), App.tsx:727 푸시 배너는 업주/운영자+설치형 전용이라 손님 미노출, 서버 리마인더(20260611c cron→notifications→20260603e 자동푸시)는 실재하므로 구독만 붙이면 됨 — 성공 시트류 기구현 없음

#### [5점·M] 대회 당일 홈 화면에 '내 예약'이 전혀 안 보임
- **문제**: 당일 바인요청 상태 배너(⏳/✅)는 홈 상단에 있지만, 정작 '오늘 내가 예약한 대회' 배너는 없다. 예약 내역은 헤더 🎟 → 내 대시보드 → 4번째 섹션까지 들어가야 보인다. 대회 당일 앱을 연 예약자가 시작 시간·장소를 다시 찾으려면 포스터를 검색해야 하고, '예약→방문' 전환을 앱이 전혀 돕지 않는다.
- **개선안**: 홈(browse) 상단, 기존 바인요청 배너 자리와 같은 패턴으로 '🎫 오늘 예약한 대회' 배너 추가: getMyReservations()에서 date===오늘 건을 골라 '19:00 시작 · OO펍' + 탭하면 포스터 상세(setOpenSchedule) + 길찾기 버튼. D-1이면 '내일' 표기로 확장 가능. 이미 있는 getMyReservations/배너 패턴 재사용이라 저비용.
- **근거**: App.tsx:2076-2088 myBuyinReqs 배너는 존재하나 예약 배너는 없음. getMyReservations(reservations.ts:193)는 CustomerDashboardPage.tsx:17에서만 사용. 홈의 '이어서 하기' 카드(App.tsx:2093)는 localStorage 최근 방문 매장 기반이라 예약과 무관.
- **검증**: 확인됨: App.tsx 홈(browse) 상단에는 바인요청 배너(2076-2088)·이벤트 배너·이어서하기(2093, localStorage 최근매장 기반)만 있고 예약 배너는 없음. getMyReservations(reservations.ts:193, date/startTime/venueName 포함)는 CustomerDashboardPage.tsx(17,62)에서만 사용되며 App.tsx는 FOMO용 getReservationCounts만 임포트 — 당일 예약 홈 노출은 미구현 실제 격차.

#### [5점·S] 이용권 지급이 완전 무음 — 보상 획득 순간을 손님이 모름
- **문제**: 업주가 시상으로 매장이용권을 발급해도(issue_voucher) 받는 손님에게 알림·푸시가 전혀 가지 않는다. store_vouchers에 INSERT 트리거도 없다. 손님이 헤더 🎟를 눌러 대시보드를 열어야만 발견하는데, 이용권 존재를 모르는 손님은 열 이유가 없다 — '체크인→보상' 루프의 보상 체감이 0이 되고, 재방문 유인(이용권 사용하러 오기)도 죽는다.
- **개선안**: issue_voucher RPC 끝에 p_holder_user_id가 있으면 notifications insert 추가: '🎟 매장이용권 도착!' + message에 매장명·수량 + link '/wallet'(클라이언트에 /wallet → 대시보드 열기 분기 1개 추가). 기존 push_on_notification 트리거가 자동으로 웹푸시까지 발사하므로 SQL 몇 줄로 푸시 도달까지 완성.
- **근거**: baseline snapshot issue_voucher 정의: store_vouchers insert 후 return — notifications insert 없음. 트리거 검색 결과 store_vouchers에는 UPDATE 트리거 2개(trg_voucher_redeem_to_ledger, trg_voucher_used_checkin)뿐 INSERT 알림 트리거 부재. push_on_notification(notifications INSERT→send-push edge function)은 이미 라이브.
- **검증**: 최신 issue_voucher(20260817b_columns_expiry_grade_geo.sql:124-162)는 store_vouchers insert 후 return뿐 notifications insert 없음, store_vouchers 트리거는 UPDATE 2개뿐(baseline:4808-4809), 클라이언트(src/api/vouchers.ts)도 무음 — push_on_notification(notifications INSERT 트리거)은 라이브라 제안대로 SQL 몇 줄로 해결 가능

#### [4점·S] '1시간 전' 리마인더 알림을 탭해도 대회로 이동하지 않음
- **문제**: 예약자에게 시작 50~70분 전 '⏰ 1시간 후 시작!' 알림이 오지만(cron), link 컬럼 없이 insert되어 손님이 알림을 탭하면 handleNavigateNotification의 최종 fallback인 toast.show(제목)만 다시 뜬다. 가장 중요한 순간(출발 직전)에 대회 상세·주소·길찾기로 이어지는 문이 닫혀 있다. 또 type 'reminder'는 클라이언트 NotificationType 유니온에 없어 타입 아이콘도 빈 원으로 렌더된다.
- **개선안**: send_tournament_reminders의 notifications insert에 link 컬럼을 추가: format('/schedules/%s', s.id). 클라이언트는 이미 /schedules/:id 링크를 처리한다(App.tsx:1484-1489)이므로 SQL 한 줄 수정으로 끝. 부수로 NotificationType에 'reminder' 추가 + TypeIcon 케이스 1개.
- **근거**: supabase/migrations/20260611c_tournament_reminder_cron.sql:24-30 insert 컬럼이 (user_id,type,title,message,avatar_text,avatar_color)로 link 없음. App.tsx:1482-1528 link 매칭 실패 시 toast.show(n.title)로 종료. notifications.ts:4 NotificationType에 'reminder' 부재, NotificationPanel.tsx:20-56 TypeIcon switch에 해당 케이스 없음.
- **검증**: 2026-07-20 라이브 스냅샷(baseline sql:4100)까지 insert에 link 없음 확인, App.tsx:1528 toast fallback·notifications.ts:4 'reminder' 부재도 사실 — 미구현 실제 격차 (단, avatar_text '⏰'가 메인 아바타로는 뜨므로 빈 원은 소형 타입배지에만 해당)

#### [4점·M] 매장 QR 체크인 성공이 '맥락 없는 홈 착지 + 토스트 3초'로 끝남
- **문제**: 매장에 비치된 QR을 스캔하는 물리적 주경로(?checkin=)는 체크인 후 일반 홈 화면에 떨어지고 보상 피드백은 토스트 한 줄이다. 그 매장 페이지도, 오늘 그 매장 대회도 열리지 않는다. 반면 이용권 사용은 전면 초록 확인 화면까지 있다 — 루프에서 가장 자주 반복되는 순간(체크인)의 보상 체감이 가장 약하다. VenuePage 내 체크인 버튼에는 '오늘 대회 보기' 액션이 있지만 QR 경로엔 없다.
- **개선안**: ?checkin= 성공 시 ① 해당 venueId로 setOpenVenueId를 호출해 그 매장 페이지에 착지시키고 ② 도장 적립 시트(+3점, 🔥연속 N일, '단골 입문까지 2회' 같은 다음 배지 진행도)를 잠깐 보여준다. BADGES 정의(visit5/20/50)와 getMyCheckinStreak가 이미 있어 진행도 계산은 프런트 조합만으로 가능.
- **근거**: App.tsx:777-800 ?checkin= 핸들러는 checkIn→toast→URL 정리만 하고 화면 전환 없음. VenuePage.tsx:190-192는 toast action으로 '오늘 대회 보기'를 제공(QR 경로와 비대칭). CustomerDashboardPage.tsx:382-393 이용권 사용은 전면 확인 화면 존재. loyalty.ts:110-123 BADGES에 visit5/visit20/visit50 정의 완비.
- **검증**: App.tsx:777-800 ?checkin= 핸들러는 checkIn→토스트(연속일 문구 포함)→URL 정리만 하고 setOpenVenueId(752행 존재)·화면 전환·도장 시트 없음 — VenuePage.tsx:191-192의 '오늘 대회 보기' 액션과 비대칭, CustomerDashboardPage.tsx:382-393 전면 확인 화면 대비 보상 체감 격차 실재, BADGES visit5/20/50(loyalty.ts:115-117)·getMyCheckinStreak 미활용 확인

#### [4점·M] 예약과 체크인이 데이터로 연결 안 됨 — '노쇼 방지' 근거 부재
- **문제**: 본인인증 게이트는 '대회 예약 = 노쇼 방지 · 신뢰 좌석 확보'를 약속하지만, check_in RPC는 schedule_reservations를 전혀 건드리지 않고 내 방문 통계는 '지난 날짜 예약 = 방문'으로 셈해 노쇼도 방문으로 집계된다. 업주 화면에서도 예약 명단(ReserveBox 접이식)과 오늘 체크인 명단(CheckinModal)이 분리돼 있어 '예약자 중 누가 실제로 왔는지'를 알 수 없다 — 예약의 신뢰가치가 쌓이지 않는다.
- **개선안**: check_in 시 같은 매장·당일 날짜의 내 예약에 attended_at을 기록(컬럼 1개 추가)하고, ① 업주 예약 내역에 '도착 ✓' 배지 표시 ② getMyVisitStats를 실제 체크인 기준으로 교정 ③ 장기적으로 예약자별 도착률을 노쇼 점수로 노출(펫 프로젝트의 노쇼 점수 패턴 재사용).
- **근거**: VerifyGateSheet.tsx:12 '노쇼 방지 · 신뢰 좌석 확보' 문구. baseline check_in 함수는 checkins insert+customer_profiles 갱신만 수행, schedule_reservations 미참조. reservations.ts:109-115 getMyVisitStats가 'd < today → visits++'로 예약=방문 간주. CheckinModal.tsx(업주 체크인 명단)와 ScheduleDetailModal.tsx:731-754(업주 예약 내역)가 상호 참조 없음.
- **검증**: check_in RPC(baseline:2039-2093)는 checkins+profiles+customer_profiles만 갱신하고 schedule_reservations 미참조, 테이블(baseline:617-623)에 attended 계열 컬럼 전무, reservations.ts:109-115가 지난 예약=방문 집계, ScheduleDetailModal 731-754 예약 내역에 도착 표시 없음 — 격차 실재·미구현

#### [4점·S] 손님용 푸시 온보딩 경로가 없어 리마인더·보상 알림이 앱 안에 갇힘
- **문제**: notifications insert는 push_on_notification 트리거로 웹푸시까지 자동 발송되는 좋은 구조인데, 푸시 구독 유도 배너는 업주·직원·관리자 전용이다. 손님은 프로필 설정 깊숙한 토글을 스스로 찾아야 해서 사실상 구독률이 0에 수렴하고, 1시간 전 리마인더·(개선 후) 이용권 도착 알림이 전부 '앱을 열어야 보이는 종 아이콘'에 갇힌다 — 재방문 루프의 핵심 채널이 잠겨 있다.
- **개선안**: 가치를 느낀 직후에만 맥락형으로 요청한다: ① 첫 예약 성공 시트에 '시작 전 알림 받기'(1번 제안과 통합) ② 첫 체크인 성공 시 '도장·이용권 소식 받기'. localStorage 1회 노출 가드로 스팸화 방지. enablePush는 이미 완성돼 있어 호출 지점만 추가하면 된다.
- **근거**: App.tsx:727 'if (!(isOwner || isAdmin || user?.role === venue_staff) || !pushSupported()) return;'으로 pushNudge가 손님 제외. push.ts:36 enablePush 구현 완비. ProfileModal.tsx:570-580이 손님의 유일한 구독 진입점. baseline push_on_notification 트리거는 모든 notifications INSERT에 대해 send-push 호출 중.
- **검증**: App.tsx:727 게이트로 pushNudge가 업주·직원·관리자 전용임을 확인. enablePush 호출 지점은 그 배너와 ProfileModal.tsx:570-580 설정 토글 두 곳뿐이며, 예약 완료 카드(ScheduleDetailModal.tsx)·체크인 성공(App.tsx:789, VenuePage.tsx:191)에는 푸시 유도가 전혀 없음. push_on_notification 트리거(20260603e 마이그레이션)+send-push 엣지함수도 실재 — 손님 맥락형 구독 유도는 미구현.

### 커뮤니티·장터

#### [5점·S] 게시판 댓글이 글쓴이에게 알림으로 돌아가지 않음 — 참여 루프의 반환 구간 단절
- **문제**: 첫 글을 쓴 손님이 댓글을 받아도 아무 알림이 오지 않는다. 커뮤니티의 핵심 보상인 '내 글에 반응이 왔다'가 전달되지 않아, 글쓴이는 다시 들어와 직접 자기 글을 찾아봐야 하고, 반응을 못 확인한 첫 글 경험은 '써도 아무 일도 안 일어난다'로 끝난다. 좋아요는 알림이 가는데 더 강한 반응인 댓글은 안 가는 역전 상태.
- **개선안**: notify_on_comment 트리거에 post_id 분기 추가: community_posts.user_id 조회 → 본인 제외 후 type='comment', link='/posts/'||new.post_id 로 insert. 프런트는 이미 /posts/:id 링크 내비게이션(App.tsx handleNavigateNotification)이 구현돼 있어 마이그레이션 1개로 루프가 완성된다.
- **근거**: supabase/baseline/2026-07-20-live-snapshot.sql:3365-3373 — notify_on_comment 가 schedule_id/venue_id 만 처리하고 `else return new` 로 post 댓글은 무알림. 댓글 저장은 PostDetailModal.tsx:178 addComment({postId}) 로 정상 동작. 반면 좋아요는 20260623h_notify_on_post_like.sql 로 알림 존재 → 비대칭.
- **검증**: notify_on_comment(20260602h·베이스라인 3358행대)는 schedule/venue만 처리하고 else return new로 post 댓글 무알림, 이후 전 마이그레이션(~20260817b)에 post 분기 추가 없음. 좋아요 알림(20260623h)은 존재해 비대칭 사실이며, /posts/:id 알림 내비는 App.tsx:1494에 이미 구현돼 마이그레이션 1개로 완성 가능

#### [4점·S] 좋아요·댓글 알림에 link 가 없어 탭해도 해당 글로 이동하지 못함
- **문제**: '❤️ 내 글에 좋아요가 달렸어요' 알림을 탭하면 글이 열리는 게 아니라 알림 제목이 토스트로 한 번 더 뜨고 끝난다(폴백 동작). 반응을 확인하러 온 글쓴이가 자기 글을 게시판에서 다시 검색해야 하므로, 알림이 재방문을 만들고도 전환을 흘려보낸다.
- **개선안**: notify_on_post_like insert 에 link='/posts/'||new.post_id 추가(마이그레이션 1개). 포스터/매장 댓글 알림(notify_on_comment)에도 각각 '/schedules/'||id, '/community/'||id 링크를 채운다. App.tsx 의 /posts·/schedules·/community 매칭 코드는 이미 존재하므로 DB 값만 채우면 된다.
- **근거**: supabase/baseline/2026-07-20-live-snapshot.sql:3409-3411 — notify_on_post_like insert 에 link 컬럼 없음(3375-3377 댓글 알림도 동일). App.tsx:1494-1503 에 /posts/:id 열기 로직이 구현돼 있으나 App.tsx:1528 `toast.show(n.title, 'info')` 폴백으로 떨어진다.
- **검증**: 확인됨: notify_on_post_like(20260623h 마이그레이션·베이스라인 3409-3411)와 notify_on_comment(베이스라인 3375-3377) insert에 link 없음, 이후 마이그레이션도 미수정. src/App.tsx 1494-1503에 /posts/:id 열기 로직이 있으나 link가 빈 문자열이라 1528 toast 폴백으로 떨어짐 — 미구현 실제 격차.

#### [4점·S] 비로그인 참여 진입점이 전부 '죽은 안내문' — 눈팅→가입 전환 CTA 부재
- **문제**: 비로그인 손님이 글쓰기 자리에서 보는 것은 클릭 불가능한 회색 문구('로그인하면 게시글을 작성할 수 있습니다')다. 댓글 입력창 자리도, 장터 내 판매목록/메시지함 모달도 '닫기'만 있는 막다른 안내다. 참여 욕구가 생긴 바로 그 순간에 로그인으로 이어지는 버튼이 없어 전환 기회를 버린다. 게다가 피드의 좋아요 버튼은 로그인 가드가 없어 비로그인이 누르면 하트가 켜졌다가 '좋아요 처리 실패' 에러로 롤백되는 오동작 체감까지 준다.
- **개선안**: ① 세 곳의 정적 안내문을 버튼으로 바꿔 promptLogin() 호출(이미 lib/requireLogin.ts 인프라 존재, PostDetailModal 은 사용 중). ② MyMarketModal 의 LoginRequired 모달에 '로그인' 버튼 추가. ③ App.handleLikePost 진입부에 user 체크 → 없으면 promptLogin() 후 return(낙관적 flip 이전에).
- **근거**: CommunityTab.tsx:354-358 (클릭 불가 div), CommentThread.tsx:175-179 (동일), MyMarketModal.tsx:26-35 (LoginRequired 에 닫기만). 피드 좋아요: CommunityTab.tsx:662-671 PostCard 가드 없음 → App.tsx:1600-1611 handleLikePost 도 user 체크 없이 낙관적 토글→서버 실패 롤백. 대비: PostDetailModal.tsx:320 은 promptLogin() 가드 있음.
- **검증**: 4곳 전부 확인 — CommunityTab.tsx:354-358·CommentThread.tsx:175-179 정적 div(promptLogin 미호출), MyMarketModal.tsx:26-35 닫기만, PostCard(662)·App.handleLikePost(1600) user 가드 부재로 비로그인 좋아요가 flip→롤백 에러. requireLogin.ts 인프라는 존재하나 이 지점들엔 미적용

#### [4점·S] 글쓰기 폼: 제목이 필수인데 포커스는 내용에 — 첫 제출이 오류 토스트로 시작
- **문제**: 글쓰기 진입 버튼은 '나누고 싶은 이야기를 적어보세요…'라는 캐주얼 한 줄 톤인데, 열리는 폼은 카테고리+제목(필수)+내용 구조다. 게다가 autoFocus 가 내용 textarea 라 사용자는 자연스럽게 본문부터 쓰고 '게시하기'를 누르는데, 그 순간 '제목을 입력해 주세요' 에러 토스트를 맞는다. 파일 상단 자가진단 주석은 '제목(선택)'이라고 적혀 있어 설계 의도와 코드가 이미 어긋난 상태 — 첫 글 작성의 마지막 관문에서 넘어지게 만든다.
- **개선안**: 제목을 선택 입력으로 되돌린다(원래 설계). 목록 표시는 이미 `post.title || post.content.slice(0,40)` 폴백이 구현돼 있어 무제목 글도 깨지지 않는다. 제목을 유지하려면 autoFocus 를 제목 input 으로 옮기고, 제출 버튼을 제목·내용 채워질 때까지 disabled 처리해 에러 토스트 대신 사전 차단으로 바꾼다.
- **근거**: PostFormModal.tsx:156-157 제목 필수 차단(toast), :245 textarea autoFocus, :3 상단 주석 '제목(선택)' — 코드와 모순. 진입 placeholder: CommunityTab.tsx:189·266. 무제목 폴백 표시: CommunityTab.tsx:599.
- **검증**: PostFormModal.tsx:156-157 제목 필수 toast 차단 + :245 내용 textarea autoFocus + :3 주석 '제목(선택)' 모순 + :387 제출버튼 saving만 disabled — 모두 실재하며 개선안(선택화/포커스이동/사전차단)은 미구현. CommunityTab.tsx:599 무제목 폴백도 확인됨

#### [4점·M] 장터 판매자 신뢰 신호가 전부 가짜값 — '거래 0회' 고정, '본인 인증 ✓'는 업주 여부
- **문제**: 매물 상세의 판매자 카드가 보여주는 '거래 N회'는 등록 시점에 0으로 하드코딩돼 영원히 0이고, 초록 체크(본인 인증 완료)는 실제 CI 본인인증이 아니라 '업주/운영자 역할'로 찍힌다. 정작 이 앱은 전 회원에게 휴대폰 본인인증을 요구하는데 일반 판매자는 체크가 안 떠서, 신뢰 신호가 사실과 반대로 작동한다. '판매상품' 버튼도 눌러보면 '검색창에서 이름으로 찾아보세요' 토스트만 뜨는 막다른 길이라 판매자 평판 확인 동선이 없다.
- **개선안**: ① sellerVerified 를 profiles 의 CI 인증 여부(is_ci_verified 헬퍼 — 이미 존재)로 산출. ② 거래횟수는 해당 판매자의 status='sold' 매물 수를 뷰/RPC 로 집계해 상세 열람 시 조회(스냅샷 컬럼 폐기). ③ '판매상품' 버튼을 실제 sellerId 필터 목록 모달로 교체.
- **근거**: App.tsx:1594-1595 — `sellerTradeCount: 0, sellerVerified: user.role === 'venue_owner' || user.role === 'admin'` 등록 시 1회 기록 후 갱신 없음. 표시: ListingDetailModal.tsx:161-165. 막다른 버튼: ListingDetailModal.tsx:167-172. CI 판정 헬퍼는 메모리(holdem-verification-policy) 기준 is_ci_verified 로 통일돼 있음.
- **검증**: App.tsx:1594-1595에 sellerTradeCount:0·역할기반 sellerVerified 하드코딩 확인, seller_trade_count 갱신 트리거/RPC 부재, ListingDetailModal.tsx:161-173에 '본인 인증 완료' 라벨 및 토스트 막다른 버튼 실존 — is_ci_verified 헬퍼(baseline:2801)는 있으나 장터에 미적용

#### [4점·S] 사기 방지 안내가 상시 노출 지점에 없음 — 채팅·매물 상세 모두 무방비
- **문제**: 선입금 사기 경고는 목업 데이터의 운영자 공지 1건과 약관 조문에만 존재한다. 실제 거래가 시작되는 1:1 채팅(ChatPane)과 매물 상세 어디에도 '선입금 요구 거절·공공장소 직거래' 같은 상시 안전 안내가 없어, 운영자가 공지를 안 쓰면 신규 사용자는 아무 경고 없이 첫 거래에 들어간다. 커뮤니티 규모가 작을수록 사기 1건의 신뢰 타격이 치명적인 구조.
- **개선안**: ① 채팅 스레드 최초 진입 시 상단 고정 시스템 배너 1줄(선입금 거절·직거래 권장·신고 버튼 링크) — ChatPane 에 정적 렌더라 서버 작업 불필요. ② ListingDetailModal 의 '문의 안내' 섹션(:194-199)에 안전거래 문구를 병기. ③ ReportModal 의 '사기/허위' 사유(이미 존재)로 바로 잇는 링크.
- **근거**: grep '사기|선입금|안전거래' → mock/data.ts:347-348(목업 공지), LegalDocsModal.tsx:57(약관)뿐. ChatPane.tsx(115줄 전체)에 경고 요소 없음. ListingDetailModal.tsx:194-199 문의 안내 섹션은 채팅 사용법만 설명. 신고 사유는 ReportModal.tsx:13 에 '사기/허위' 존재.
- **검증**: 사기 경고는 mock/data.ts:347-348 목업 공지·LegalDocsModal.tsx:56-57 약관에만 존재 — ChatPane.tsx(115줄 전체)와 그 양쪽 마운트 지점(ListingDetailModal:373, MyMarketModal:82), 매물 상세 문의 안내(ListingDetailModal.tsx:194-199) 어디에도 상시 안전 안내 없음. ReportModal.tsx:13 '사기/허위' 사유는 존재하나 연결 링크 미구현

### 라이브·클락·TV

#### [5점·S] TV 관전 화면에 '생존/엔트리(PLAYERS)'가 상시 표시되지 않음 — 관전자 1순위 정보 누락
- **문제**: 매장 TV(?display=)를 보는 손님·관전자가 가장 먼저 찾는 숫자는 '몇 명 남았나'인데, TV 하단 스탯 스트립이 리바인·얼리·평균/총스택만 보여주고 엔트리·생존을 의도적으로 제외했다. 생존 인원은 탈락 순간 5초 티커로만 스쳐 지나가, 관전자는 계속 직원에게 물어봐야 한다. 정작 운영자 풀스크린에는 같은 문제를 겪고 'PLAYERS(히어로)'를 신설한 이력이 코드 주석에 남아 있다 — TV에만 반영이 안 된 상태.
- **개선안**: ClockDisplay 하단 BigStat 스트립에 PLAYERS(생존/엔트리)를 첫 칸·최대 크기(accent)로 추가하고, 운영자 클락과 동일하게 '알라이브 / 엔트리' 복합 표기를 쓴다. 4칸 그리드를 5칸으로 늘리거나 총스택을 평균스택에 병기해 자리를 확보.
- **근거**: ClockDisplay.tsx:234 주석 '하단 통계 스트립 — 리바인·얼리·평균/총스택 (엔트리·생존 제외)', 235-244에 PLAYERS 없음. aliveNow(120)는 146의 5초 탈락 티커에만 사용. 대비: TournamentClock.tsx:767-770 '운영자 풀스크린에 생존/엔트리 표시가 없어 손님이 물어봐야 했다 — 신설' 주석과 함께 PLAYERS hero 존재. 실물 클락 4종 공통 1순위라고 스스로 명시(767).
- **검증**: ClockDisplay.tsx:234-244 하단 스트립에 PLAYERS 없음(주석 '엔트리·생존 제외' 실재), aliveNow는 146의 5초 티커에만 사용 — TournamentClock.tsx:767-770의 PLAYERS 히어로가 TV에 미반영된 실제 격차

#### [5점·M] END(조기 종료) 시 입상 순위 입력이 아예 뜨지 않음 — 순위 파이프라인이 '자연 종료'에만 연결됨
- **문제**: 입상 순위 자동 초안(finishRows 모달)은 블라인드 구조를 끝까지 소진한 '자연 종료'(levelCatchUp finished)에서만 발동한다. 실제 토너는 대부분 헤즈업 딜/우승 확정으로 블라인드가 남은 채 운영자가 END를 눌러 끝나는데, 이 경로는 confirm 후 클락을 그냥 지워버려 매장 순위·시즌·머니인킹으로 이어지는 순위 저장 기회를 통째로 건너뛴다. 순위 미입력은 손님 전적·시즌리그 데이터 공백으로 직결된다.
- **개선안**: endClock에서 장부 연동(sessionDate) 클락이면 clearClockState 전에 동일한 finishRows 모달을 띄운다('순위 입력 후 종료 / 입력 없이 종료' 2버튼). 자연 종료와 같은 초안(프라이즈 자리수 + 장부 참가자 자동완성)을 재사용하면 되므로 분기 하나 추가로 끝난다.
- **근거**: TournamentClock.tsx:165-173 endClock은 confirm→clearClockState만 수행. finishRows 세팅은 470-483 advance() 내부 cu.finished 분기에서만 발생. 순위 저장 saveFinishRanks(446-464)는 saveVenueRankings로 매장 순위·시즌·머니인킹에 반영된다고 토스트에 명시(460).
- **검증**: 확인됨 — TournamentClock.tsx endClock(165-173)은 confirm→clearClockState만 수행하고 setState(null)로 상태까지 지움; finishRows 세팅은 advance() cu.finished 분기(477-483)가 유일하며 clearClockState 호출처도 endClock 하나뿐이라 END(조기 종료) 경로엔 순위 입력이 전혀 없음

#### [4점·S] 라이브 카드에서 손님의 핵심 결정 정보 '지금 등록 가능한가'가 최하단 최소 글씨
- **문제**: 손님이 라이브 탭을 보는 실질 동기는 '지금 가면 낄 수 있나'인데, 등록마감 카운트다운이 카드 맨 아래 text-2xs 한 줄에 다음 브레이크와 나란히 묻혀 있다. 카드 상단은 LIVE 배지·레벨·남은시간이 차지해 '구경 정보'가 '참가 결정 정보'보다 앞선다. '오늘 곧 시작' 리스트에도 시작시간·제목뿐 바인비·등록 가능 여부가 없어, 참가 의사가 있는 손님은 결국 포스터까지 들어가야 한다.
- **개선안**: LiveCard 헤더의 LIVE 배지 옆에 상태 배지를 추가: 등록 가능 시 '🟢 등록가능 · 마감 HH:MM', 마감 시 '등록마감'(rose). regClose는 이미 계산돼 있어 배치만 바꾸면 된다. 곧 시작 카드에는 barinAmount(스케줄 buyin)와 '예약' 진입을 붙여 라이브 탭을 '참가 결정 화면'으로 완성.
- **근거**: LiveGamesTab.tsx:289-291 등록마감이 카드 최하단 text-2xs. 233-235 헤더엔 LIVE/일시정지 배지만. regClose 계산은 214에서 이미 수행. 곧 시작 리스트(186-195)는 startTime·title·매장명만 렌더.
- **검증**: LiveGamesTab.tsx 확인: 등록마감은 289-290 최하단 text-2xs, 헤더(233-235)엔 LIVE/일시정지 배지뿐, regClose는 214에서 선계산, 곧시작 리스트(186-195)는 시간·제목·매장명만 — 등록가능 배지는 전 코드베이스에 미구현이며 Schedule.buyIn 필드도 있어 개선안 실현 가능

#### [4점·L] 참가자 시점 기능 공백 — 바인 승인 후 '내 토너' 정보가 어디에도 없음
- **문제**: 손님은 TV QR로 바인 요청하고 승인 배너까지 받지만(App.tsx myBuyinReqs), 그 이후 토너 진행 중 '내 바인·리바인 횟수, 지금까지 쓴 금액, 평균스택 대비 내 스택(BB)' 을 볼 화면이 없다. 데이터는 이미 존재한다: 장부 바인 행은 본인 요청과 연결되고, 클락 liveStats(평균스택·현재 BB)는 공개 데이터다. 앱에 StackCalcs('내 스택' 입력)와 ICM 계산기가 도구로 따로 있지만 라이브 클락 데이터와 연결되지 않아 손님이 블라인드·평균스택을 수동 입력해야 한다.
- **개선안**: 라이브 카드(또는 홈)에 '🎯 내 토너 카드'를 추가: 내 바인 승인된 게임이 진행 중이면 내 엔트리·리바인(장부 조회) + 스택 자가입력 1필드 → 현재 BB 환산·평균 대비 %를 즉시 표시. StackCalcs/ICM으로 넘어갈 때 현재 블라인드·평균스택·프라이즈를 프리필. 자가입력이라 서버 스키마 변경 없이 로컬로 시작 가능.
- **근거**: App.tsx:647·2076 오늘 바인요청 상태 배너까지만 존재. ClockDisplay.tsx:136-140 참가 QR 플로우. tools/StackCalcs.tsx:44 '내 스택' 입력 필드가 클락과 미연결. LiveCard(LiveGamesTab.tsx:205-)에 개인화 요소 전무 — 모든 손님에게 동일 화면.
- **검증**: 확인: App.tsx:2076 승인 배너가 참가자 여정의 끝(엔트리·리바인·스택 정보 전무), LiveCard(LiveGamesTab.tsx:205-304)는 전원 동일 공개 데이터만, ToolsPanel.tsx:87·96에서 ICM/SprCalc가 props 없이 마운트돼 클락 프리필 부재 — 유일한 '내 토너' 유사물은 CustomerDashboardPage:452의 과거 전적 집계뿐이라 미구현 격차 실재

### 업주 콘솔

#### [5점·M] 리바인(재바인) 기록에 '직전과 동일' 원탭이 없어 매 바인마다 모달 왕복
- **문제**: 장부에서 가장 잦은 반복 작업은 같은 손님의 리바인 기록인데, 매번 [+ 셀 탭 → 결제 모달 열림 → 9개 버튼(티켓/현금/이체/카드 × 완납·미수 + 가게지원 + 분납) 중 선택] 2탭+모달 애니메이션을 거친다. 50명 규모 대회에서 하룻밤 100+ 바인이면 수백 번의 불필요한 탭·시선 이동이 생긴다. 대부분의 리바인은 그 손님의 직전 결제수단(예: 현금 완납)과 동일한데도 이를 재사용할 수단이 없다. 또 모달 안에서 얼리 토글(onSetEarly)을 누르면 즉시 저장 후 모달이 닫혀, 얼리+결제를 같이 고치려면 셀을 다시 열어야 한다.
- **개선안**: ① 빈 + 셀 '짧은 탭' = 그 손님의 직전 바인과 동일한 결제수단·할인으로 즉시 기록(토스트에 '되돌리기' 첨부), '길게 누르기' = 기존 모달 — buyins 배열에 직전 기록이 이미 있어 클라이언트만으로 구현 가능. 최소안으로는 PaymentModal 최상단에 "⚡ 직전과 동일: 현금 완납" 원탭 버튼 1개 추가. ② onSetEarly 후 setSelected(null) 제거해 모달을 유지(연속 편집).
- **근거**: src/components/features/NuriPosLedger.tsx:1055-1061(+셀 탭→setSelected로 모달 오픈), 1995-2029(PaymentModal — 매번 티켓·현금·이체·카드×완납/미수+지원+분납 중 선택, 기본값·직전 반복 없음), 1158-1162(onSetEarly가 저장 즉시 setSelected(null)로 모달 닫음). 직전 결제수단 데이터는 이미 로컬 buyins에 있음(392-407 binByKey).
- **검증**: NuriPosLedger.tsx 확인 결과 전부 사실 — +셀은 onClick만으로 모달 오픈(1055-1061), PaymentModal(1896-2029)은 이전 buyin 접근 불가·기본값/직전반복 버튼 없이 9개 선택 강제, onSetEarly는 저장 즉시 setSelected(null)로 모달 닫힘(1158-1162), binByKey(392-396)로 직전 결제 데이터는 클라이언트에 이미 있음. 롱프레스/반복 기능 미구현(전체 grep 확인).

#### [4점·S] 장부 시작 설정 폼이 매일 반복하기엔 과대 — 프리필이 있어도 '바로 시작' 원탭 부재
- **문제**: SessionForm은 게임명·포스터 연결·담당직원·현금/카드 단가·할인 5칸·스타트 시각·스택 2·얼리 4·게임유형·기준엔트리·애드온·이용권 2·비고·딜러까지 15개 이상 필드다. 직전 설정 프리필(getLastLedgerSettings)·프리셋·당일 포스터 자동연동까지 이미 갖춰놓고도, '✅ 직전 게임 설정을 불러왔습니다' 배너만 상단에 뜨고 실행 버튼(장부 시작)은 폼 맨 아래라 매일 긴 스크롤을 끝까지 내려야 시작된다. 모바일(412px)에서 매일 아침 반복되는 첫 동작치고 비용이 크다.
- **개선안**: prefilled/autoLinked 상태일 때 배너 자리에 "이 설정으로 바로 시작" 버튼을 붙이거나(1탭 시작), 하단 '장부 시작' 버튼을 sticky bottom으로 올려 스크롤 없이 항상 보이게 한다. 프리필 요약(게임명·단가·담당)을 배너에 함께 표기해 확인 후 즉시 시작하게.
- **근거**: src/components/features/NuriPosLedger.tsx:1494-1853(SessionForm 전체 — 필드 15+), 1637-1638(프리필/자동연동 배너는 안내만), 1845-1850(실행 버튼은 폼 최하단), 363-379(getLastLedgerSettings 프리필 로직은 이미 존재).
- **검증**: SessionForm(NuriPosLedger.tsx 1494-1853)은 15+필드 단일 스크롤 폼이고, prefilled/autoLinked 배너(1637-1638)는 액션 없는 안내 <p>뿐이며, '장부 시작' 버튼(1845-1850)은 폼 최하단 비-sticky div — '바로 시작' 원탭·sticky 제출은 파일 어디에도 미구현(sticky는 요약바·테이블 헤더에만 사용)

#### [4점·S] 포스터 등록 폼 — 오류가 토스트 1건씩만 뜨고 문제 필드로 스크롤·포커스가 안 됨
- **문제**: 등록하기를 누르면 게임이름→지역→바이인→상금→레지마감 순으로 첫 오류 하나만 토스트로 뜨고 리턴한다. 폼은 이미지·블라인드 표·듀레이션 등으로 매우 길고 '지역' 셀렉트는 폼 하단, '레지마감'은 중간이라, 사장님은 토스트를 보고 어느 칸인지 스크롤로 찾아 헤매야 한다. 오류를 하나 고치면 또 제출해야 다음 오류가 보이는 순차 노출이라 최악의 경우 5회 왕복한다. FieldWrap에는 오류 상태(빨간 테두리 등) 표시가 아예 없다.
- **개선안**: 제출 시 전체 검증 후 ① 오류 필드에 aria-invalid+빨간 테두리를 일괄 표시하고 ② 첫 오류 필드로 scrollIntoView+focus. 토스트는 "필수 3개 항목을 확인하세요" 요약으로. FieldWrap에 error prop 하나 추가하면 전 필드에 일관 적용된다.
- **근거**: src/components/features/PosterFormModal.tsx:219-227(submit — 첫 오류에서 toast 후 즉시 return, 포커스/스크롤 없음), 531-542(지역 select는 폼 하단), 426-447(레지마감은 중단), 781-801(FieldWrap — required 별표만 있고 error 표시 상태 없음).
- **검증**: PosterFormModal.tsx submit(221-227)이 첫 오류만 토스트 후 return, scrollIntoView/focus/aria-invalid 전무, FieldWrap(781-801)에 error prop 없음 — 전부 사실이며 미구현 (바이인·상금 2~3필드만 네이티브 required로 부분 완화)

#### [4점·S] 포스터 폼 단위 혼재(보장상금=만원 · 바이인=원)로 금액 오입력 유발 + 과거 날짜 가드 없음
- **문제**: 같은 2열 그리드에 '보장 상금(만원, placeholder 1100)'과 '바이인(원, placeholder 100000)'이 나란히 있는데 단위 안내는 우측 상단 text-2xs '단위: 만원/원' 글씨뿐이다. 만원 습관으로 바이인에 10을 치면 10원짜리 대회가, 원 습관으로 상금에 1000000을 치면 100억 GTD 포스터가 손님 화면에 그대로 노출된다. 순위입력 화면은 같은 실수를 prizeUnitRisk 경고(입력 중 앰버 테두리+저장 시 confirm)로 막았지만 포스터 폼엔 아무 가드가 없다. 또 날짜 input에 min이 없어 과거 날짜 포스터를 등록해도 조용히 통과된다(일정탐색에 안 뜨는데 이유를 모름).
- **개선안**: ① 입력값 실시간 환산 표기: 바이인 칸 아래 "= 10만원", 상금 칸 아래 "= 1,100만원"을 항상 표시(순위입력의 고정 suffix '만' 패턴 재사용). ② 비정상 범위(바이인<1,000원, 상금≥10만=10억) 시 앰버 경고+제출 confirm — prizeUnitRisk 함수 재사용. ③ 신규 작성 시 date input에 min=오늘, 과거 선택 시 인라인 경고.
- **근거**: src/components/features/PosterFormModal.tsx:487-503(보장상금 만원 vs 바이인 원 — 같은 grid, suffix는 FieldWrap 796의 text-2xs뿐), 355-359(날짜 input — min 없음). 대조: src/components/features/VenueManageTab.tsx:726-731·1069-1080(순위입력은 prizeUnitRisk로 이중 가드), src/api/rankings.ts(prizeUnitRisk 기존 구현).
- **검증**: PosterFormModal.tsx:487-503 같은 그리드에 만원(상금)/원(바이인) 혼재+text-2xs 단위표기뿐, 파일 전체에 prizeUnitRisk·confirm 0건, 날짜 input(357행) min 없음 — 반면 VenueManageTab 726·1048·1072는 prizeUnitRisk 이중 가드 기구현으로 비대칭 실재

#### [4점·M] 장부→순위 명단의 '실명(닉네임)' 합성 표기가 회원 매칭·이용권 자동지급을 깨뜨림
- **문제**: 장부에서 회원을 선택해 추가하면 이름이 '홍길동(nick)' 합성 문자열로 저장된다. 마감 후 '순위 입력하기' 프리필과 순위입력의 '장부 명단 전체 추가'는 이 문자열을 닉네임 칸에 그대로 넣는다. 그런데 ① 회원 여부 체크는 checkNicknameAvailable(합성문자열)이라 실제 회원인데 '⚪ 비회원'으로 표시되고, ② 순위 저장 시 이용권 자동지급은 display 정확일치 필터라 합성 표기는 불일치→'확인필요/미지급'으로 빠지며, ③ 서버의 닉네임 기반 점수 반영도 어긋날 수 있다. 사장님 입장에선 분명 회원인 손님이 계속 비회원·미지급으로 나오는 미스터리가 된다.
- **개선안**: 경계에서 형식을 통일: onMakeRankingDraft·addFromLedger에서 `/^(.+)\((.+)\)$/` 패턴이면 괄호 안 닉네임만 추출해 닉네임 칸에 넣고 실명은 실명 칸에 분리 기입. 근본적으로는 장부 플레이어에 memberUserId를 저장해 명단 전달 시 ID로 넘기면 문자열 매칭 자체가 사라진다.
- **근거**: src/components/features/NuriPosLedger.tsx:536·544(pickMember/pickRegistered — `${realName}(${nickname})` 합성 저장), 877-882(마감 후 순위 프리필로 그대로 전달). src/components/features/VenueManageTab.tsx:662-671(addFromLedger — 합성명을 nickname 칸에 삽입), 648-655(checkNicknameAvailable로 회원 판정→합성명은 비회원 표시), 748-752(이용권 지급 — display 정확일치만 인정, 불일치는 ambiguous 처리).
- **검증**: 확인됨 — NuriPosLedger.tsx:536·544가 `실명(닉네임)` 합성 저장, 879-881 프리필과 VenueManageTab.tsx:585·662-671이 그대로 닉네임 칸에 주입, 648-660 checkNicknameAvailable(합성명)→비회원 오표시, 748-752 display 정확일치 실패→이용권 미지급. 합성 문자열을 되파싱하는 코드는 리포 어디에도 없음(grep 확인)

#### [4점·M] 이용권 발급→고객 전달 고리 단절 — 수령자 알림 없음, 시상 미지급자 후속 동선 없음
- **문제**: 이용권을 손님에게 발급해도(수동 발급·순위 시상·바인 적립 모두) 손님에게는 어떤 알림도 가지 않는다 — issueVoucher는 RPC 호출뿐이고 notifications API에 voucher 타입 자체가 없다. 손님이 스스로 지갑을 열어보기 전까지 받은 줄 모르니 사용률이 떨어지고, 사장님은 '보냈는데 왜 안 쓰냐'를 구두로 안내해야 한다. 또 순위 저장 시 닉네임 불일치로 미지급된 인원은 토스트에 '확인필요 N명' 숫자만 남고 사라진다 — 누가 못 받았는지 명단도, 이어서 발급할 동선도 없다. VoucherManagePanel에 prefillReceiver(받는 사람 자동 검색) 기능이 이미 있는데 이 흐름과 연결돼 있지 않다.
- **개선안**: ① 발급 시 수령자에게 인앱 알림 '🎟 ○○매장 이용권 N개 도착' 생성(장부 시작 알림 notifyLedgerOpen과 같은 클라이언트 패턴으로 즉시 가능). ② 순위 저장 결과에서 미지급/확인필요 명단을 토스트가 아닌 인라인 리스트로 남기고, 각 행에 '이용권 화면에서 발급' 버튼 → 매장이용권 섹션을 prefillReceiver로 오픈. ③ 발급 완료 후 '손님에게 카톡으로 알리기' 공유 시트(수동 전달 보조).
- **근거**: src/api/vouchers.ts:61-69(issueVoucher — RPC만, 알림 없음), src/api/notifications.ts(voucher 관련 0건 — grep 무일치), src/components/features/VenueManageTab.tsx:741-777(시상 지급 — ambiguous/failed는 토스트 카운트만, 명단·후속 액션 없음), src/components/features/VoucherManageModal.tsx:139-149(prefillReceiver 자동검색 기능 기구현·미연결). 참고 패턴: src/components/features/NuriPosLedger.tsx:466-468(notifyLedgerOpen — 클라이언트발 알림 선례).
- **검증**: issueVoucher(vouchers.ts:61-69)와 서버 RPC(20260817b 마이그레이션) 모두 store_vouchers insert뿐 알림 0건, notifications.ts에 voucher 무일치, VenueManageTab 시상은 카운트 토스트만(명단·후속 동선 없음), prefillReceiver는 StoreDashboard 단골 TOP에서만 사용 — 격차 실존·미구현

#### [4점·L] 성과 대시보드 격차 — 포스터 조회수·노출이 아예 추적되지 않아 '왜 예약이 없는지' 알 수 없음
- **문제**: view_count는 커뮤니티 글·장터 매물에만 존재하고 포스터(Schedule)에는 조회 추적 자체가 없다. 게임관리 카드의 미니칩은 예약·바인·매출뿐이고 StoreDashboard도 장부(매출·엔트리·추세) 중심이라, 업주는 마케팅 퍼널의 앞단(내 포스터가 몇 번 노출·조회됐고 그중 몇 %가 예약으로 이어졌는지)을 전혀 볼 수 없다. 예약이 적을 때 '노출이 부족한 건지(포스터 시간대·지역 문제) 전환이 안 되는 건지(바이인·혜택 문제)'를 구분 못 해 부스트·프로모션 의사결정 근거가 없다. TOP(부스트) 구매 효과 증명도 불가능해 수익화에도 걸림돌이다.
- **개선안**: ① schedule_views 테이블(또는 schedules.view_count) 추가 — 포스터 상세(ScheduleDetailModal) 진입 시 +1, 커뮤니티 글의 조회수 +1 로직(community.ts) 재사용. ② PosterRow 미니칩에 '조회 N · 예약 N (전환 X%)' 추가. ③ StoreDashboard에 주간 퍼널 카드(조회→예약→방문 체크인) — 방문 판정은 이미 있는 listVenueCheckins 매칭 재사용. TOP 포스터에는 '부스트 후 조회 +N%' 비교 표기로 부스트 재구매 근거 제공.
- **근거**: 조회 추적 부재: grep 결과 view_count는 src/api/community.ts:574(게시글 +1)·src/api/marketplace.ts:39뿐, src/api/schedules.ts에는 없음. src/components/features/MyPostersTab.tsx:218-233(미니칩 — 예약·바인·매출만), src/components/features/StoreDashboard.tsx:153-172(reload — 장부·클락·예약수·단골만 로드, 노출/조회 지표 없음), MyPostersTab.tsx:56-66(방문 체크인 매칭 로직 기존재 — 퍼널 마지막 단에 재사용 가능).
- **검증**: 확인됨 — view_count는 community_posts(increment_post_view RPC, src/api/community.ts:575)와 marketplace_listings(src/api/marketplace.ts:39)에만 존재하고 schedules에는 조회 추적 필드·RPC·테이블이 전무(src/api/schedules.ts, supabase/baseline 스냅샷 모두 확인). MyPostersTab.tsx:217-233 미니칩은 예약·바인·매출·순위뿐, StoreDashboard.tsx:153-172 reload도 장부·클락·예약·단골만 로드해 노출/조회/전환 지표 없음. main.tsx의 GA(gtag) 스크립트는 로드만 되고 커스텀 이벤트 호출이 src에 0건이라 업주에게 포스터별 조회 데이터를 줄 수 없음 — 격차 실재, 미구현.

### 재방문 장치

#### [5점·S] 대회 1시간 전 리마인더가 프로덕션에서 전혀 발송되지 않음 — notif_type enum에 'reminder' 값이 없어 INSERT가 매번 실패
- **문제**: 예약자를 다시 불러오는 가장 강력한 재방문 트리거(⏰ 1시간 후 시작! 알림+웹푸시)가 런칭 이후 한 번도 작동한 적이 없을 가능성이 큽니다. 크론은 10분마다 돌지만 알림 INSERT가 enum 오류로 실패해 함수 전체가 롤백되고, 오류는 cron 로그에만 남아 아무도 모릅니다. 예약해 놓고 잊은 손님은 리마인더를 못 받고 노쇼하거나 앱을 다시 열 계기를 잃습니다.
- **개선안**: ① `alter type notif_type add value if not exists 'reminder';` 실행(또는 insert 값을 'system'으로 변경). ② 알림 link를 '/schedules/'||s.id 로 넣어 탭 시 해당 포스터가 열리게. ③ 클라이언트 NotificationType 유니온과 TypeIcon에 'reminder' 케이스 추가(src/api/notifications.ts:4, NotificationPanel.tsx TypeIcon). ④ cron.job_run_details에서 실패 이력 확인 후 라이브에서 1회 수동 검증.
- **근거**: supabase/migrations/20260611c_tournament_reminder_cron.sql:25 가 type='reminder' 로 INSERT하지만, 라이브 스냅샷 supabase/baseline/2026-07-20-live-snapshot.sql:18 의 notif_type enum은 ('qna','approval','comment','system','mention') 5종뿐이고 :490 에서 notifications.type이 이 enum입니다. 스냅샷 :4101 의 라이브 함수 본문도 여전히 'reminder'를 넣고 있으며, 리포 전체에 `alter type notif_type add value`가 없습니다(2026-07-20 드리프트 해소 스냅샷 기준 라이브 상태). 예약자가 있는 윈도우에서 enum 캐스팅 오류→함수 abort→reminder_sent_at도 롤백.
- **검증**: 라이브 스냅샷(2026-07-20) notif_type enum 5종에 'reminder' 없음(:18,:490), 라이브 함수(:4101)·마이그레이션(20260611c:25) 모두 'reminder' INSERT, 크론 jobid3 active(:5443), 리포 전체에 notif_type add value 부재 → enum 캐스팅 오류로 함수 abort·롤백이 실제 발생 중이며 미수정

#### [5점·M] 웹푸시 옵트인 유도가 운영자 전용 — 손님은 푸시의 존재조차 모른 채 지나감(앱 닫은 사용자를 부를 채널이 사실상 0)
- **문제**: 푸시 온보딩 넛지가 업주·관리자·스태프 + PWA 설치형에서만 뜨고, 손님의 유일한 옵트인 경로는 프로필 모달 깊숙한 토글뿐입니다. 팔로우 새 포스터·시즌 보상·(수정 후) 대회 리마인더까지 모든 알림이 trg_push_on_notification으로 푸시 발송되도록 배선돼 있는데, 정작 손님 구독자가 없어 앱을 닫은 손님에게는 아무것도 도달하지 않습니다. '앱을 닫은 사용자를 다시 부르는 트리거'가 손님 세그먼트에서 구조적으로 비어 있습니다.
- **개선안**: 가치가 방금 증명된 순간에 1회성 트리거형 옵트인을 넣으세요: ① 매장 팔로우 직후 — '이 매장 새 대회를 알림으로 받아볼까요?' ② 대회 예약 완료 직후 — '시작 1시간 전에 알려드릴까요?' ③ QR 체크인 직후. 거절 시 localStorage로 재노출 억제(기존 nuri:push-nudge-dismissed 패턴 재사용). PWA 미설치 브라우저에서도 pushSupported()면 노출.
- **근거**: src/App.tsx:727 `if (!(isOwner || isAdmin || user?.role === 'venue_staff') || !pushSupported()) return;` + :729 standalone(설치형) 게이트 — 손님은 넛지 대상에서 제외. 손님용 토글은 src/components/features/ProfileModal.tsx:568-616 (프로필 모달 하단)뿐. 팔로우 성공 시(VenuePage.tsx:1067)와 예약 완료 시 어떤 푸시 유도도 없음. 푸시 배선 자체는 완비: 스냅샷 :4793 trg_push_on_notification → supabase/functions/send-push/index.ts.
- **검증**: App.tsx:727-729에서 넛지가 owner/admin/venue_staff+standalone으로 게이트되고, enablePush 호출처는 그 넛지와 ProfileModal.tsx:568-616 토글 단 2곳뿐 — 팔로우(VenuePage.tsx:1067)·예약·체크인 어디에도 손님용 트리거형 옵트인 없음(발송 파이프라인 send-push는 완비)

#### [4점·S] 팔로우 새 포스터 알림이 같은 이벤트에 2건 중복 발송(웹푸시도 2발) — 스팸화로 팔로우 가치 훼손
- **문제**: 포스터가 승인되는 순간 팔로워에게 '팔로우 매장 새 포스터' 알림이 두 개의 트리거에서 각각 INSERT되어 알림함에 같은 내용이 2줄 쌓이고, 알림 INSERT마다 푸시가 나가므로 폰에도 2번 울립니다. 중복 알림은 가장 빠르게 '알림 무시 학습'과 푸시 구독 해제를 유발하는 패턴입니다. 두 버전은 내용도 미묘하게 달라(한쪽만 매장명·날짜 포함, 한쪽만 작성자 제외) 품질 인상도 나쁩니다.
- **개선안**: notify_on_schedule_approved()에서 팔로워 알림 블록(두 번째 insert)을 제거하고 업주 승인 알림만 남기세요. 팔로워 알림은 20260610c의 notify_followers_on_poster(INSERT 자동승인 경로까지 커버, 매장명·날짜 포함)로 단일화. 마이그레이션 1개로 끝납니다.
- **근거**: 라이브 스냅샷 :4805 trg_notify_followers_poster(AFTER INSERT OR UPDATE OF approved)와 :4806 trg_notify_schedule_approved(AFTER UPDATE)가 동시 활성. 승인 flip(UPDATE) 시 notify_followers_on_poster(:3264-3271)와 notify_on_schedule_approved의 팔로워 블록(:3448-3454)이 모두 같은 가드(new.approved=true and old distinct)로 발화 → venue_follows 조인 INSERT 2회 → :4793 push_on_notification이 각각 푸시 발송.
- **검증**: 스냅샷 :4805-4806 두 트리거 동시 활성 + notify_followers_on_poster(:3258-3271)·notify_on_schedule_approved 팔로워 블록(:3448-3454)이 동일 승인 flip 가드로 각각 INSERT하고 push_on_notification(20260603e, 행별 AFTER INSERT)이 건마다 푸시 — 스냅샷 이후 수정 마이그레이션 없음, 미구현 확인

#### [4점·S] 팔로우·시즌보상·초대보상 알림이 전부 link '/' 막다른 길 — 탭해도 해당 포스터/화면으로 못 감
- **문제**: 재방문한 사용자가 알림을 탭했을 때 '팔로우 매장 새 포스터'는 link가 '/'라 어떤 딥링크 분기에도 안 걸리고 최종 fallback인 toast.show(제목)만 실행됩니다 — 방금 읽은 제목을 토스트로 또 보여줄 뿐 포스터가 열리지 않습니다. 시즌 보상(🏆 시즌 보상)·친구초대 보상 알림도 동일하게 link '/'. 알림→상세→예약으로 이어지는 전환 루프의 마지막 한 칸이 끊겨 있습니다. 앱은 이미 /schedules/:id 딥링크 처리를 갖추고 있어 서버 쪽 한 줄 문제입니다.
- **개선안**: notify_followers_on_poster의 link를 '/schedules/'||new.id 로 변경(리마인더도 동일). 시즌 보상 알림은 해당 매장 랭킹 탭으로(예: '/community/'||venue_id 재활용 또는 매장 딥링크 추가), 초대 보상은 대시보드를 여는 link 규약(예: '/me')을 신설해 handleNavigateNotification에 분기 1개 추가.
- **근거**: 스냅샷 :3269 notify_followers_on_poster link '/', :1357-1359 _end_season_internal 시즌보상 link '/', :1380-1382 _grant_referral_reward link '/'. 클라이언트 src/App.tsx:1480-1528 handleNavigateNotification — '/schedules/', '/community/', '/posts/', '/guide/', '/invites', '/my-store/ledger', '/admin', '/support'만 처리하고 '/'는 :1528 `toast.show(n.title, 'info')` 로 종결. /schedules/:id 열기는 :1484-1489에 이미 구현됨.
- **검증**: 스냅샷 :3269 notify_followers_on_poster·:1358 _end_season_internal·:1381-1382 _grant_referral_reward 모두 link '/' 확인, 20260610c·20260623o 마이그레이션도 여전히 '/'이며 이후 수정 없음. 클라이언트 App.tsx:1480-1530 handleNavigateNotification은 '/'를 처리하는 분기가 없어 :1528 toast.show(n.title)로 종결 — /schedules/:id 딥링크(:1484-1489)는 이미 있으므로 서버 link만 고치면 되는 실제 미구현 격차.

#### [4점·M] 시즌리그가 '가야만 보이는' 위치 — D-day 임박·내 순위 변동을 알려주는 장치가 전무
- **문제**: 시즌리그(D-day·상위3 보상·명예의 전당)는 재방문 동기로 설계가 잘 됐지만, 노출이 매장 페이지의 '랭킹' 탭 내부뿐이라 그 매장에 들어가 탭을 눌러야만 존재를 압니다. 시즌 종료 임박(D-3)이나 '3위와 20점 차' 같은 순위 경합 상황에서 아무 알림이 없어, 시즌 막판 방문·참가를 끌어올릴 최적의 순간을 전부 흘려보냅니다. 종료 후 보상 알림 1건이 전부(그마저 link '/' 막다른 길)입니다. 홈의 WeeklyBestStrip도 TOP3만 보여주고 '내 순위'는 없어 남의 잔치로 읽힙니다.
- **개선안**: ① pg_cron에 시즌 D-3/D-1 알림 추가 — current_season_standings 상위권+최근 참가자에게 '시즌 종료 D-3, 현재 4위 (3위와 20점차)' 발송(참가자는 venue_rankings.nickname↔profiles.nickname 매칭으로 식별 가능, _end_season_internal이 이미 쓰는 패턴). ② 홈 상단에 '내가 참가 중인 시즌' 카드(내 순위+D-day) 노출. ③ WeeklyBestStrip에 로그인 사용자의 '내 순위 N위' 꼬리 문구 추가.
- **근거**: SeasonPanel 노출처는 VenuePage.tsx:421(랭킹 탭 내부)과 VenueManageTab.tsx:350(업주용)뿐 — 홈/커뮤니티엔 없음. 시즌 관련 알림은 스냅샷 :1354-1360 _end_season_internal의 종료 보상 1종이 유일하고 D-day·순위변동 크론 없음(cron 목록 :5443-5458). SeasonPanel.tsx:16 daysLeft는 화면 표시 전용. WeeklyBestStrip.tsx:22-31 TOP3 롤링만, 내 순위 미표시.
- **검증**: 시즌 노출은 VenuePage.tsx:421·VenueManageTab.tsx:350 두 곳뿐(홈·커뮤니티 0건), 시즌 알림은 스냅샷 _end_season_internal의 종료 보상 1종(link '/')이 유일하고 cron 6종에 D-day/순위변동 없음, WeeklyBestStrip은 TOP3 롤링만 — 격차 실재·미구현

#### [4점·L] 웹푸시 외 재호출 채널이 전무 — 푸시 거부/미지원(iOS Safari 미설치) 손님에겐 어떤 다이제스트도 가지 않음
- **문제**: 질문하신 '웹푸시 부재 시 대안'이 현재 없습니다. 이메일은 제재 통보(notify-sanction) 전용이고, 주간 리포트 크론은 업주 전용 인앱 알림입니다. iOS Safari는 홈화면 설치 전엔 웹푸시가 불가하고(pushSupported()=false로 토글도 비활성), 푸시를 거부한 안드로이드 사용자도 마찬가지라, 이 세그먼트는 스스로 생각나서 돌아오는 것 외에 어떤 재호출 장치도 없습니다. 한국 유저 특성상 카카오 채널/알림톡이 가장 강한 대안인데 아직 미연결입니다.
- **개선안**: 단계적으로: ① (무료·즉시) 주간 다이제스트 이메일 크론 — '팔로우 매장 이번 주 대회 N개 + 내 시즌 순위' 요약을 Supabase Auth 이메일 주소로 발송(기존 weekly-venue-reports 크론 패턴 복제, 팔로워 대상). ② (중기) 카카오톡 채널 개설 + 알림톡/친구톡으로 대회 리마인더 대체 — Solapi 연동은 NURI PET에서 이미 검토한 자산 재사용 가능. ③ 설치 유도: iOS에서 pushSupported() false일 때 'A2HS 설치하면 알림 가능' 안내를 푸시 토글 자리에 표시.
- **근거**: 이메일 발송은 supabase/functions/notify-sanction(제재 전용)뿐. 주간 리포트는 20260610f_weekly_venue_reports_cron.sql:40-43 — 업주 대상 인앱 notifications INSERT만. 손님 대상 이메일/알림톡 코드 리포 전체에 부재. src/api/push.ts:9-16 pushSupported()는 iOS 미설치 Safari에서 false → ProfileModal.tsx:595 '지원하지 않습니다'로 종결(대안 안내 없음).
- **검증**: 이메일=notify-sanction 전용(Resend), 주간크론=20260610f:38-43 업주 인앱 notifications INSERT뿐, push.ts:9-16 pushSupported는 iOS 미설치 Safari에서 false→ProfileModal.tsx:595 '지원하지 않습니다'로 종결(대안 안내 없음), InstallBanner는 beforeinstallprompt 의존이라 iOS 미노출, 알림톡/Solapi 코드 전무 — 손님 재호출 채널 부재 확인

### 마이크로 디테일

#### [4점·S] 전화·길찾기 등 <a> 링크에 터치 피드백이 전혀 없음 — 전역 프레스 규칙이 button만 커버
- **문제**: 손님이 매장 페이지에서 가장 많이 누르는 '📞 전화'·'🗺 길찾기' 칩(앵커)을 탭해도 아무 시각 반응이 없다. hover 스타일만 있는데 tailwind future.hoverOnlyWhenSupported=true라 모바일에서는 hover가 아예 발화하지 않아, 눌렀는지조차 알 수 없다. 같은 페이지 하단의 MAP_CHIP 앵커는 active:scale-95가 있어 페이지 안에서도 칩마다 반응 유무가 갈린다.
- **개선안**: index.css의 전역 프레스 규칙 셀렉터에 a:not([data-no-press])를 추가해 button과 동일한 :active opacity 0.72(60ms in/200ms out)를 적용. 또는 tel:/지도/mailto 앵커를 .btn 계열 클래스(이미 active:opacity-80 내장)로 통일.
- **근거**: index.css:424-433 — 프레스 opacity 규칙이 `button:not([data-no-press]), [role='button']`만 대상(413행에서 a는 touch-action만 받음). VenuePage.tsx:324-334 — tel/카카오맵 앵커에 hover:text-ink-primary만 존재, active 없음. tailwind.config.js:6 — hoverOnlyWhenSupported로 터치 기기에서 hover 무효. VenuePage.tsx:1278 — MAP_CHIP만 active:scale-95 보유(동일 화면 내 불일치). StoreDashboard.tsx:1055-1061의 mailto/tel 앵커도 동일.
- **검증**: 확인됨: index.css 424-433 프레스 규칙은 button/[role=button]만 대상(413행 a는 touch-action만), VenuePage.tsx(실경로 src/components/features/) 324-334 전화·길찾기 앵커는 hover:text-ink-primary만 있고 active/.btn 없음, tailwind.config.js:6 hoverOnlyWhenSupported=true로 터치에서 hover 미발화, 1278행 MAP_CHIP만 active:scale-95 보유 — 격차 실재·미구현. 단 StoreDashboard.tsx:1055-1061 앵커는 .btn 클래스(active:opacity-80 내장, index.css:173)라 이미 피드백 있음 → 이 근거만 오류.

#### [4점·M] Modal 원자 밖 ad-hoc 시트 4벌 — 열림 모션·딤·닫기버튼·핸들이 화면마다 다름
- **문제**: 공용 Modal은 시트를 sheet-up(0.32s 전체 슬라이드)+딤 black/80 blur-md+44px 닫기+동작하는 드래그 핸들+닫힘 애니메이션으로 완성했는데, AuthModal 약관시트·이용권 사용시트·GTO 해설·장부 다이얼로그는 각자 구현이라 전부 어긋난다. 특히 AuthModal 시트는 slide-up(8px 넛지)으로 여는데 이는 tailwind.config 주석이 '시트가 올라오지 않고 번쩍 나타난다'고 명시한 바로 그 안티패턴이고, 그립 핸들은 터치 핸들러가 없는 장식(Modal 주석이 'UI가 거짓말'이라 부른 상태), 닫기 버튼은 32px, 닫힘은 애니메이션 없이 즉시 소멸한다.
- **개선안**: ad-hoc 오버레이를 Modal(variant='sheet'/'center')로 이관하거나, 최소한 열림 키프레임(sheet-up)·딤 토큰(black/80 blur-md)·닫기 44px·닫힘 200ms를 공통 상수로 강제. 죽은 그립 핸들은 핸들러를 붙이거나 제거.
- **근거**: 기준: Modal.tsx:231-238(sheet-up/slide-down 짝), :206-218(bg-black/80 backdrop-blur-md), :276-284(w-11 h-11 닫기), :259-268(동작하는 핸들). 위반: AuthModal.tsx:64(animate-fade-in만)·79(animate-slide-up 8px 넛지 — tailwind.config.js:137-139가 금지한 문법)·86-88(핸들러 없는 핸들)·97(w-8 h-8 닫기)·61(if(!doc) return null — 닫힘 애니메이션 없음), CustomerDashboardPage.tsx:598-603(딤 black/70 무블러+✕ 문자 닫기), GtoDeepPanel.tsx:160, NuriPosLedger.tsx:1878·1936.
- **검증**: 전 근거 실재 확인 — Modal.tsx는 sheet-up/딤 black/80 blur-md/44px 닫기/동작 핸들+닫힘 애니메이션 완비인데, AuthModal.tsx:59-119(slide-up 넛지·black/70 blur-sm·핸들러 없는 핸들·32px 닫기·닫힘 즉시소멸), CustomerDashboardPage.tsx:598/688(black/70 무블러·✕문자), gto/GtoDeepPanel.tsx:160(black/60·8px 넛지·죽은 핸들), NuriPosLedger.tsx:1878/1936(40px 닫기·닫힘 애니메이션 없음, 단 딤·센터 모션은 일치)이 각자 구현으로 어긋나며 공용 Modal 미사용. 단 NuriPosLedger 2건은 딤 토큰 위반이 아니라 제안문이 다소 과장.

#### [4점·S] 에러 토스트도 2.4초 만에 사라지고, 토스트를 손으로 닫을 방법이 없음 (+되돌리기 버튼 28px)
- **문제**: 실패 사유가 담긴 에러 토스트('요청 실패: …')가 성공 토스트와 같은 2.4초 뒤 자동 소멸해, 어두운 매장에서 화면을 비스듬히 보는 사용자는 원인을 읽기 전에 놓친다. 반대로 6초짜리 액션 토스트는 탭/스와이프로 먼저 치울 수 없어 하단 컨텐츠를 가린 채 버틴다. '삭제됨 · 되돌리기'의 되돌리기 버튼은 py-1.5 text-xs로 약 28px 높이 — 앱이 Modal 닫기에 강제한 44px 표준과 자체 .hit 유틸을 모두 비켜갔다.
- **개선안**: variant='error'의 기본 지속을 4~5초로 상향(또는 action 유무와 동일 로직으로 분기), ToastItem에 탭하면 즉시 dismiss(액션 버튼 제외 영역) 추가, 액션 버튼에 .hit 클래스를 붙여 44px 히트영역 확보.
- **근거**: Toast.tsx:57 — `durationMs = opts?.durationMs ?? (opts?.action ? 6000 : 2400)` (variant 무관). Toast.tsx:95-119 — ToastItem에 onClick/스와이프 dismiss 부재(컨테이너 pointer-events-none, 아이템 auto인데 핸들러 없음). Toast.tsx:113 — 액션 버튼 px-3 py-1.5 text-xs, .hit(index.css:383-390) 미적용. 비교: Modal.tsx:281 닫기 w-11 h-11.
- **검증**: Toast.tsx:57 duration이 variant 무관(에러도 2.4초, 60여 개 에러 호출부 전부 durationMs 미지정)·ToastItem(95-119) 탭/스와이프 dismiss 핸들러 부재·:113 액션 버튼 py-1.5 text-xs ≈28px로 .hit(index.css:383)·Modal 44px(w-11 h-11, Modal.tsx:281) 표준 미적용 — 세 근거 모두 코드에서 확인, 미구현.

### 정보구조

#### [5점·M] '내 것'이 4곳 이상에 파편화 — 내 예약·이용권·전적은 '내 대시보드', 내 거래는 장터 안, 프로필·인증은 아바타 메뉴, '내가 쓴 글' 목록은 아예 없음
- **문제**: 손님이 '내 예약 어디서 보지?'라고 생각했을 때 정답이 헤더 지갑 아이콘(PC) 또는 탭바 5번째 '내 정보'(모바일)인데, 프로필은 아바타 드롭다운의 ProfileModal, 장터 판매목록·찜·메시지는 장터 탭 안의 '내 거래'(MyListingsModal/MyLikesModal/MessagesModal)로 각각 따로 산다. 특히 커뮤니티에 글·댓글을 쓴 사용자가 자기 글을 다시 찾을 수 있는 '내가 쓴 글' 화면은 코드 어디에도 없어, 스크롤을 되짚거나 검색으로 찾아야 한다. '나'라는 멘탈모델 하나가 앱 안에서 최소 4개 진입점으로 쪼개져 있다.
- **개선안**: '내 정보'(CustomerDashboardPage)를 개인 허브로 승격: ①내 예약/이용권/전적(현재 있음)에 ②내가 쓴 글·댓글 섹션(getPosts에 userId 필터 쿼리 1개 추가) ③내 장터 거래 바로가기 ④프로필 관리 진입 링크를 한 화면에 모은다. 아바타 드롭다운·장터 내 거래는 유지하되 같은 허브로 통하는 별칭으로 만든다.
- **근거**: App.tsx:1938-1948(CustomerDashboardPage=예약·이용권·전적·초대, CustomerDashboardPage.tsx:58-79), App.tsx:368-381(프로필은 드롭다운 ProfileModal), MarketplaceTab.tsx:123(내 거래=MyListingsModal·MessagesModal·MyLikesModal), '내 글/내가 쓴' 전역 grep 결과 0건 — 내 게시글 목록 화면 부재
- **검증**: 근거 4곳 모두 실코드로 확인: App.tsx:1938(CustomerDashboardPage=예약·이용권·전적만), App.tsx:368-381(프로필=드롭다운 ProfileModal), MarketplaceTab.tsx:123+252-257(내 거래=별도 모달 3종), community.ts:273 getPosts()는 무인자·userId 필터 없음이고 '내가 쓴 글' 화면은 grep 오탐 1건 외 전무 — 파편화 실존, 통합 허브 미구현

#### [4점·S] 업주·직원·관리자는 모바일에서 개인 대시보드(내 예약·전적) 진입로가 사실상 실종 — 탭바 5번째가 '내 매장'으로 대체되고 헤더 지갑 아이콘은 lg 전용
- **문제**: MobileTabBar는 hasStore면 5번째 칸을 '내 매장'으로 바꾸므로 업주에게 '내 정보' 칸이 없다. 헤더의 이용권 지갑 버튼은 hidden lg:flex라 모바일에서 안 보이고, 유일한 경로는 아바타 → 드롭다운 → '내 매장이용권' 항목뿐이다. 라벨이 '이용권'이라 그 안에 내 예약·대회 전적·초대 현황까지 들어있다고 유추할 수 없다. 업주도 다른 매장에선 손님으로 예약·플레이하는 사용자층인데, 그 절반의 정체성이 메뉴 2뎁스 뒤 오라벨 아래 숨어 있다.
- **개선안**: ①드롭다운 항목 라벨을 '내 대시보드(예약·이용권·전적)'로 변경(1줄 수정으로 즉효) ②중기적으로는 내 매장 탭 상단 또는 헤더 아바타 영역에 '내 개인 기록' 진입 카드를 상설 배치해 업주의 손님 정체성을 1탭 거리로 복원한다.
- **근거**: App.tsx:532·554(hasStore ? '내 매장' : '내 정보' — 업주는 me 슬롯 소멸), App.tsx:263-272(지갑 버튼 'hidden lg:flex' — 모바일 미노출), App.tsx:344-348(모바일 드롭다운 항목명 '내 매장이용권'이 CustomerDashboardPage 전체를 여는 유일 경로), CustomerDashboardPage.tsx:144(실제 화면 제목은 '내 대시보드')
- **검증**: App.tsx:532/554(hasStore면 5번째 칸 '내 매장'으로 대체·onOpenMe 미연결)·268(지갑 hidden lg:flex)·344-348('내 매장이용권'→CustomerDashboardPage)·CustomerDashboardPage.tsx:144('내 대시보드', 예약 315+·전적 452+·초대 761+ 포함) 전부 실증. 단 VenuePage.tsx:408 '내 활동'▸'이용권·포인트 관리'라는 조건부 우회로가 하나 더 있어 '유일한 경로'는 약간 과장(본질 불변). 라벨 변경·상설 진입 카드 모두 미구현

#### [4점·S] ?post= 공유 딥링크가 최근 50건 밖 게시글이면 아무 피드백 없이 조용히 실패 — 알림의 /posts/:id 링크도 동일
- **문제**: 게시글 공유 링크(?post=<id>)는 App이 미리 로드한 posts 배열에서만 찾는데, getPosts()가 limit(50)이라 51번째 이후(며칠 지난) 글의 링크를 받은 사람은 앱이 그냥 홈으로 열리고 끝난다. 에러도 토스트도 없어 '링크가 고장났다'는 인상만 남는다. 알림 패널의 /posts/:id 내비게이션도 같은 posts 배열 탐색이라 오래된 글 알림을 늦게 누르면 똑같이 무반응이다. 공유는 커뮤니티 성장의 핵심 유입 경로인데 시간이 지나면 링크가 죽는 구조다.
- **개선안**: pendingPostId가 posts에 없으면 단건 조회 폴백(supabase에서 id로 1건 fetch → setOpenPost)을 추가하고, 그래도 없으면(삭제됨) '삭제되었거나 찾을 수 없는 글입니다' 토스트를 띄운다. handleNavigateNotification의 /posts/ 분기에도 같은 폴백을 적용한다.
- **근거**: App.tsx:894-903(?post= 파싱)·989-994(posts.find 실패 시 setPendingPostId(null)만 하고 무반응), api/community.ts:278(getPosts limit(50)), App.tsx:1494-1503(알림 /posts/:id도 prev.find로만 탐색, 실패 시 무피드백)
- **검증**: 확인됨: App.tsx:991 posts.find 실패 시 setPendingPostId(null)만 호출(폴백 fetch·토스트 없음), community.ts:278 getPosts limit(50), App.tsx:1497-1501 알림 /posts/도 prev.find만 — 단건 조회 폴백(getPostById류)은 코드베이스에 부재

#### [4점·M] 전역검색이 중고장터 매물·공지를 못 찾고, 장터 매물엔 공유 딥링크 자체가 없음 — 검색·공유 커버리지의 사각지대
- **문제**: GlobalSearchModal은 대회·매장·게시글 3종만 검색한다. '칩셋 중고' 같은 장터 매물이나 이벤트 공지는 통합검색으로 절대 안 나오는데, 검색창 플레이스홀더는 범위를 안 밝혀 사용자는 '없는 것'으로 오해한다. 더해서 대회(?s=)·매장(?v=)·게시글(?post=)·GTO(#gto=)는 공유 URL이 있지만 장터 매물(ListingDetailModal)과 공지는 URL이 없어 카톡으로 '이 매물 봐봐'를 보낼 방법이 없다 — 중고거래는 공유가 곧 거래 성사인 도메인이다. 부수적으로 검색 빈 상태 안내 '단축키 ⌘K / Ctrl+K'는 모바일에서도 그대로 노출된다.
- **개선안**: ①GlobalSearchModal에 listings·notices 그룹 추가(이미 App이 두 배열을 들고 있어 props 2개+필터 2줄) ②?listing=<id> 딥링크와 ListingDetailModal 공유 버튼을 ?post= 패턴 그대로 복제 ③⌘K 힌트는 포인터 미디어쿼리(lg)에서만 표시.
- **근거**: GlobalSearchModal.tsx:44-52(검색 대상 s/v/p 3종뿐, listings·notices 부재)·82(모바일에도 ⌘K 안내), ListingDetailModal.tsx에 share/공유/? 파라미터 grep 0건, App.tsx:1373-1417(?s=·?v= 딥링크는 존재 — 장터만 누락), ScheduleDetailModal.tsx:582-593(대회는 공유 링크 복사 제공)
- **검증**: GlobalSearchModal.tsx:44-52는 s/v/p 3종만 검색하고 82행 ⌘K 힌트는 무조건 노출, ListingDetailModal엔 share/공유/clipboard 0건, App.tsx엔 ?post=(894)·?s=(1373)·?v=(1391) 딥링크만 있고 ?listing= 부재 — 전부 미구현 확인

## 경미 21건 (impact<4 — 검증 생략, 참고용)

- **[3점·S·첫 방문 5분] 예약 벽(로그인+본인인증 2중)이 버튼을 누른 마지막 순간에야 드러남** — 첫 5분의 클라이맥스인 예약 버튼에서 비로그인자는 토스트+로그인 모달로 차단되고, 가입을 마쳐도 곧바로 휴대폰 본인인증 요구가 한 번 더 나온다(2연속 차단). 카드·상세 어디에도 예약 요건이 사전 고지되지 않아, 회원가입까지 마친 사용자가 또 벽을 만나는 최악의 순서… → 비로그인 상태의 상세 예약 섹션에 '예약엔 로그인·본인인증이 필요해요 — 노쇼 방지를 위한 자리 보장' 마이크로카피를 상시 표시해 기대치를 먼저 세팅하고, 로그인 완료 직후 같은 상세 컨텍스트에서 본인인증 시트를 자동 연결해 두 벽을 한 흐름으로 합친다(첫 예약 +50P 혜택 문구 병기).

- **[3점·M·첫 방문 5분] 첫 대회 카드 위 고정 크롬 과다 — 412px에서 필터 줄이 2~3줄로 래핑** — 검색바+날짜 슬라이더 아래에 토너먼트 라디오 4개+등급 라디오 4개+지역 select가 한 flex-wrap 줄에 들어 있는데, 합산 폭이 412px를 훌쩍 넘어 2줄 이상으로 래핑된다(각 h-9=36px). 여기에 카운트/토글 줄, 주간 머니인 킹 스트립, 공지 박스… → 등급 축(데일리/새틀/시리즈)을 지역 select와 같은 드롭다운이나 '필터' 시트로 접어 필터를 한 줄로 고정. 공지 박스는 접힌 1줄 티커로, 주간 머니인 킹은 리스트 2~3번째 카드 뒤 삽입형으로 이동해 첫 뷰포트에 카드 2~3장이 보이게 한다.

- **[3점·S·예약→체크인 루프] 포스터 상세(예약 화면)에 길찾기·지도가 없음** — 예약이 일어나는 포스터 상세에서 주소는 클릭 불가한 회색 텍스트다. 당일 '찾아가는' 손님은 매장명 링크 → 매장 페이지 진입 → Tier1 길찾기까지 2단계를 더 가야 한다. 리마인더 알림(수정 후)이 포스터 상세로 열어줘도 거기서 지도로 못 나가면 동선이 다시 끊긴… → ① 주소 줄(schedule.address)을 카카오맵 검색 링크(https://map.kakao.com/link/search/…)로 감싼다 — VenuePage Tier1과 동일 패턴 복붙 수준. ② 대회 당일에는 CalendarShareRow 자리에 '🗺 길찾기' 버튼을 추가(캘린더 추가는 당일엔 효용이 낮으므로 교체 노출도 가능).

- **[3점·M·커뮤니티·장터] 거래 상태 변경이 '내 판매목록' 깊숙이 숨어 있고, 상태 변화가 상대에게 전달되지 않음** — 판매자가 채팅으로 거래를 확정해도 그 자리에서 '예약중/거래완료'로 바꿀 수 없다 — 장터 탭 → 내 판매목록 → 해당 매물 카드까지 되돌아가야 한다(본인 매물 상세를 열어도 상태 칩이 없다). 그래서 상태 갱신이 잘 안 되고, 팔린 물건이 '판매중'으로 남아 다른 구… → ① ListingDetailModal 에서 본인(sellerId===user.id) 매물이면 하단 CTA 를 상태 토글 칩(판매중/예약중/거래완료)으로 교체 — updateListingStatus API 재사용. ② 채팅 헤더에도 판매자용 상태 칩 노출. ③ 상태 변경 시 listing_likes 보유자·채팅 상대에게 알림 insert 하는 트리거 추가(n

- **[3점·M·커뮤니티·장터] 게시판 댓글이 단층(flat) — 답글 기능이 있는데 게시판만 못 쓴다** — 매장/포스터 댓글(CommentThread)은 답글(parentId)·칭호·장착마크까지 지원하는데, 정작 트래픽이 모이는 게시판 글 상세(PostDetailModal)는 자체 flat 목록이라 답글 버튼이 없다. 댓글에 대댓글로 대화가 이어지는 것이 커뮤니티 체류의 핵… → PostDetailModal 의 자체 댓글 UI(PostReply 타입·목록·입력)를 기존 CommentThread 컴포넌트 재사용으로 교체 — postId 기반 getComments/addComment 에 parentId 만 전달하면 된다. 1번(댓글 알림 트리거)과 함께 넣으면 답글 알림까지 한 번에 해결.

- **[3점·S·라이브·클락·TV] TV 브레이크 화면에 '다음 레벨 블라인드'가 없음 + 탈락 티커가 최대 30초 잔류** — 브레이크 중 관전자·참가자가 알고 싶은 건 '돌아오면 블라인드가 얼마인가'인데 TV CenterPanel은 '휴식'과 타이머만 크게 띄우고 다음 레벨 정보를 생략한다(운영자 클락엔 NEXT LEVEL 표기가 있음). 또 탈락 티커는 5초 만료를 Date.now 비교로만… → CenterPanel에 nextPlayableLabel(운영자 클락 71-77과 동일 함수)을 이식해 브레이크 중엔 'NEXT: 1,000/2,000(2,000)'을 타이머 아래 표시. 탈락 티커는 setElimMsg 시 setTimeout(5초)으로 명시적 해제.

- **[3점·S·라이브·클락·TV] 프라이즈 금액 단위 불일치 — TV는 '만' 고정 접미, 운영자 화면·설정은 단위 없는 raw 값** — TV 상금 보드는 amount에 무조건 '만'을 붙인다. 그런데 업주가 설정에서 상금을 원 단위(1,000,000)로 넣는 경우가 실제로 있다는 걸 코드 스스로 인정한다 — 종료 시 순위 자동채움이 'amount >= 10000이면 만원으로 환산'하는 휴리스틱을 쓰고,… → 표시 단일화: TV·운영자 클락 모두 wonToMan 계열 헬퍼로 'amount >= 10000이면 만 환산' 후 '만' 표기(순위 자동채움과 동일 기준). 근본 해결로는 프라이즈 입력 필드에 '만원 단위' 라벨+prizeUnitRisk 경고를 설정 단계로 앞당겨 오입력 자체를 차단.

- **[3점·S·라이브·클락·TV] 멀티클락 빈 슬롯 '▶ 바로 시작'이 확인 없이 즉시 클락 생성+장부 연동 — 전환 탭과 같은 그리드에 섞여 오터치 위험** — 멀티클락 오버뷰에서 진행 중 클락 탭(전환)과 빈 슬롯(바로 시작)이 같은 2~3열 그리드에 같은 크기(p-1.5, 폰에서 ~폭 절반)로 섞여 있다. 빈 슬롯을 잘못 탭하면 confirm 없이 메인 설정을 복사해 오늘 장부에 연동된 클락이 즉시 생성·저장되고, 장부 세… → 빈 슬롯 탭은 즉시 시작 대신 1단계 확인(작은 confirm 또는 '한 번 더 탭해 시작' 2탭 패턴)을 넣고, 시각적으로도 대시 보더+투명도로 '실행 버튼'임을 구분. 시간 보정(adjustTime)에는 레벨 이동과 동일한 6초 스냅샷 되돌리기를 재사용(armLevelUndo 로직 그대로 적용 가능).

- **[3점·S·업주 콘솔] 이용권 '받는 손님 미지정' 발급이 기본 경로 — 실수로 매장 보관행, 복구는 삭제뿐** — 발급 섹션에서 받는 손님 지정은 선택 사항이고 기본 상태(recvMode='none')에서도 발급 버튼이 활성이다. 손님에게 주려던 사장님이 지정 단계를 건너뛰고 '+ N개 발급'을 누르면 조용히 '매장 보관'으로 들어가고, 이를 손님에게 옮기는 재배정 수단이 없어 삭… → 미지정 상태로 발급 버튼을 누르면 한 번 묻는 중간 확인("받는 손님 없이 매장 보관용으로 N개 발급할까요? [손님 지정] [매장 보관 발급]")을 넣거나, 버튼을 '매장 보관용 발급'으로 명시 라벨링. 병행책으로 매장 보관분에 '손님에게 전달' 재배정 액션(holder 변경 RPC) 추가 — 삭제·재발급 왕복 제거.

- **[3점·S·재방문 장치] 팔로우 버튼이 가치를 설명하지 않음 — '팔로우하면 무엇이 좋은지'를 한 번도 말해주지 않는다** — 팔로우의 실제 혜택은 ①새 포스터 알림 ②일정탐색 '팔로우만' 필터 두 가지인데, 버튼에도 성공 토스트('매장을 팔로우했습니다')에도 이 가치가 드러나지 않습니다. 알림 혜택은 앱을 다시 열어야만 보이니(푸시 미구독 시) 사용자 입장에선 팔로우가 '눌러도 아무 일 없는… → ① 팔로우 성공 토스트를 '팔로우 완료 — 새 대회가 올라오면 알려드려요'로 변경(1줄 수정). ② 첫 팔로우 시에만 푸시 옵트인 시트 연결(2번 제안과 동일 컴포넌트). ③ 일정탐색의 '팔로우' 필터 칩은 팔로우 0명일 때 눌러도 빈 화면이므로, 빈 상태에서 인기 매장 팔로우 유도(EmptyState의 '팔로우한 매장의 예정 대회가 없어요'에 매장 찾기 

- **[3점·M·마이크로 디테일] 아이콘·이모지·특수문자 3중 혼용 — 같은 의미가 화면마다 다른 그림으로 나옴** — Icon.tsx가 'Lucide 스타일 단일 소스'를 선언하고 close/star 아이콘을 보유하는데, 실제로는 닫기가 SVG(Modal)와 ✕ 문자(푸시 배너·이용권 시트)로 갈리고, 별점은 SVG star 대신 ⭐ 이모지, 버튼 라벨에 ✅📷📞 이모지 접두가 붙는다.… → 1) 닫기·별점 등 Icon에 이미 있는 심볼부터 이모지/문자→<Icon>으로 치환(✕→close, ⭐→star-fill). 2) 버튼 라벨 이모지는 제거하거나 phone/map/qr 아이콘을 Icon.tsx PATHS에 추가해 대체. 3) 섹션 장식 이모지(🏁🔥📍)는 '의미 전달용은 Icon, 톤 연출용만 이모지 허용' 규칙을 정해 남긴다.

- **[3점·M·마이크로 디테일] text-[10px] 227곳 — 시스템이 금지한 10px의 부활 + px 고정이라 17px 루트 확대에서 이탈** — 50대 가독성을 위해 html 루트를 17px로 올리고 최소 크기 2xs를 10px→11px로 상향했는데, 임의값 text-[10px]이 48개 파일 227곳(전체 px 고정 폰트 336곳)에 남아 설계가 금지한 10px가 그대로 노출된다. px 고정이라 루트 확대의 … → text-[10px]→text-2xs(11px, rem 기반) 일괄 치환을 1순위로. 나머지 text-[13px]/text-[15px] 등은 sm/base 인접 토큰으로 흡수하고, ESLint(tailwindcss/no-arbitrary-value 계열)로 임의 px 폰트 재유입을 차단.

- **[3점·S·마이크로 디테일] 프레스 물리 불일치 — 가장 많이 탭하는 대회 카드가 버튼보다 5배 느리게 눌리고, 호버 리프트도 부활** — 모션 지시서는 프레스 인 60ms·복귀 200ms 한 벌로 통일했는데, 대회 카드(리스트·그리드)는 active:scale-[0.98]이 duration-300에 묶여 눌림이 0.3초에 걸쳐 미끈거린다 — 앱에서 제일 자주 탭하는 요소가 제일 둔하게 반응한다. 카드의 … → 카드의 transition을 transform 60ms(:active 진입)/200ms(복귀)로 분리하거나 전역 프레스 규칙에 위임(article에 role='button' 부여 시 자동 편입). hover:-translate-y-1은 hover:border-border-strong만 남기고 제거, hover:scale-[0.97]은 active 전용으로 

- **[3점·S·마이크로 디테일] 예약/요청 CTA의 상태 색이 팔레트 밖 — 성공 순간에 앱 어디에도 없는 청록(#19b8e6)이 등장** — StatefulActionButton(예약·인증요청 등 핵심 비동기 CTA)의 성공 배경이 팔레트에 존재하지 않는 청록 #19b8e6이라, 가장 만족스러워야 할 완료 순간에 브랜드와 무관한 색이 나타난다. 유휴 상태 골드 #FCD535도 '골드는 상금·프리미엄 전용, … → success→emerald-400(#0ECB81, 토스트 성공과 동일 계열), idle→accent-300(#5E6AD2, btn-primary와 통일 — 예약만 골드를 유지하려면 gold-300 토큰 참조로), loading/disabled→surface-high 토큰 참조로 교체해 테마 전환에 편입.

- **[3점·M·정보구조] '중고장터'의 이중 정체성 — 상단 GNB·하단 탭바 어디에도 없는 유령 TabId가 살아 있어 헤더 타이틀·활성 탭·뒤로가기가 서로 다른 말을 함** — market은 TabId로 존재하지만 PC GNB는 pcTabs에서 제거하고 모바일 탭바에도 없다(커뮤니티 서브탭 '장터'가 실경로). 그런데 ?tab=market이나 last-tab 복원으로 진입하면 독립 페인이 렌더되고, 이때 모바일 하단바 활성은 '커뮤니티'(ma… → market TabId를 내비게이션에서 은퇴시키고 ?tab=market 진입 시 changeTab('community')+커뮤니티 섹션 'market' 지정으로 리다이렉트한다(lastCommunitySection 모듈 변수를 세팅하면 됨). 독립 market 페인(2261-2277)은 삭제해 렌더 경로를 하나로 만든다.

- **[3점·M·정보구조] 모달을 닫은 직후 600ms 안에 하드웨어 뒤로가기를 누르면 탭 back 레이어가 무반응으로 소진 — 다음 뒤로가기에 앱이 종료됨** — backstack의 overlayJustClosed(600ms) 가드는 탭 back-close의 오발동(모달 닫힘이 browse로 튀는 버그)을 막지만, 부작용이 있다: 비-browse 탭에서 모달을 X로 닫고 600ms 내에 사용자가 진짜 뒤로가기를 누르면 popst… → 가드에 걸렸을 때 레이어를 소비만 하고 끝내지 말고 history.pushState로 탭 레이어를 즉시 재적립(re-arm)하거나, handlePop 단계에서 overlayJustClosed면 pop 자체를 보류한다. 재현 테스트: 커뮤니티 탭→글 상세 열기→X로 닫기→즉시 하드웨어 back 2회.

- **[3점·S·정보구조] 업주의 '마지막 탭 복원'이 항상 무효화 — 부팅 시 auth가 비동기라 my-store가 탭 목록에 없어 last-tab이 browse로 덮어써짐** — 시작 탭은 localStorage nuri:last-tab에서 복원하는데, AuthContext의 user는 null로 시작해 비동기로 채워진다. 업주가 '내 매장'을 보다 앱을 닫으면 다음 부팅에서 activeTab='my-store'로 복원되지만, 그 시점 tabs… → 1310 effect에서 사라진 탭이 역할 전용(my-store/admin)이고 auth loading 중이면 리다이렉트를 보류(loading 완료 후 재판정)하거나, 최소한 이 리다이렉트 경로에서는 last-tab을 덮어쓰지 않는 changeTab 변형을 쓴다. auth 해석 후 isOwner면 보류했던 my-store로 복귀.

- **[2점·S·첫 방문 5분] 카드 한 장의 의사결정 정보 비대칭 — 리스트엔 러닝타임 없음, 그리드엔 예약 인원 없음** — 기본 리스트 카드에는 날짜·시간·바이인·상금은 있지만 대회 러닝타임(duration)이 없어 '저녁 약속 전에 갔다 올 수 있나'를 판단할 수 없다. 반대로 그리드 카드는 duration은 보여주면서 reserveCount를 아예 받지 않아 '예약 N명·마감 임박' 인… → 리스트 카드 3행 바이인 옆에 duration 추가, GridCard에도 reserveCount를 전달해 포스터 오버레이나 본문에 예약 배지를 표시 — 두 뷰의 의사결정 정보 세트를 동일하게 맞춘다.

- **[2점·S·첫 방문 5분] 검색 결과 0건 시 '전부 초기화'만 제공 — 부분 완화 경로가 없음** — '강남'+특정 날짜로 0건이 나온 사용자에게 EmptyState는 '조건 초기화' 단일 버튼만 준다. 누르면 clearAll이 검색어·날짜·지역·등급을 전부 지워, 지역만 풀면 됐을 사용자가 애써 고른 조건을 다 잃는다. 어떤 조건이 결과를 0으로 만들었는지도 알려주지… → EmptyState에 활성 필터 칩(검색어·날짜·지역)을 재노출해 개별 해제를 유도하고, 가능하면 '날짜를 풀면 12개 · 지역을 풀면 3개'처럼 조건별 해제 시 결과 수를 계산해 보여준다(visibleSchedules 필터를 조건 하나씩 빼고 재계산하면 됨 — 이미 useMemo 구조라 저비용).

- **[2점·S·라이브·클락·TV] 핸드 '리플레이어'가 정적 카드 나열 — 스트리트 순차 공개가 없어 커뮤니티 핸드 리뷰의 재미 요소 상실** — HandReplayer는 이름과 달리 리플레이가 없다. 내 핸드·상대 핸드·플랍/턴/리버·액션이 처음부터 전부 펼쳐져 보이므로, 핸드 리뷰 글의 핵심 재미인 '너라면 어떻게 할래?'(스트리트별 추론)가 불가능하다. 결과를 먼저 보고 액션을 읽게 되어 댓글 토론도 결과론… → 탭할 때마다 프리플랍 액션→플랍→턴→리버 순으로 공개되는 스텝 모드를 기본으로 하고 '전체 보기' 토글을 제공. 기존 ReplayData 구조(hero/villain/board/actions per street) 그대로 프론트 상태 하나(공개 단계 인덱스)만 추가하면 된다.

- **[2점·S·마이크로 디테일] 오버레이 z-index 층위 충돌 — 토스트와 이미지 라이트박스가 z-100 동률** — 토스트 컨테이너와 ImageLightbox가 둘 다 z-[100]이라 DOM 순서로 승부가 갈리는데, 토스트는 Provider(루트 근처) 마운트고 라이트박스는 나중에 마운트되므로 라이트박스(불투명 black/95)가 위에 와 사진 확대 중 뜬 토스트('저장됨' 등)가… → z-index 스케일을 토큰화(tailwind theme: overlay=50, sheet=60, celebration=90, lightbox=95, toast=100)하고 토스트를 최상위 단독 층으로 확정. 임의값 z-[..] 사용을 코드리뷰 체크리스트에 추가.

## 검증 탈락 1건
- 재방문 허브(내 전적·공유카드·친구초대·시즌 배지)가 '내 매장이용권' 라벨 뒤에 은닉 — 모바일에선 헤더 진입점조차 없음 — 모바일 하단 탭바 5번째 칸이 이미 '내 정보'(App.tsx:554, 사람 아이콘)로 CustomerDashboardPage를 직접 엶(openMeCb→setVoucherWalletOpen, App.tsx:1859·1969) — "모바일 진입점 없음·드롭다운이 유일한 진입로" 전제가 사실과 다름(제안 ①②는 기구현, 페이지 상단 주석 "헤더 🎟 진입"은 낡은 주석)
