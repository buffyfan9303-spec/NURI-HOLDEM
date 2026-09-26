// 전면 판(화면 전체가 새로 열리는 곳) 열기·닫기 — **한 벌**.
//   오너 2026-09-27: "매장·이벤트·내 정보처럼 화면 전체가 새로 열리는 곳의 여는 방식이 두 가지 — 통일해".
//   그전: 매장·그룹은 slide-up(8px 넛지 + 투명도 0→1, 0.25s), Modal page(게시글·일정 상세·도구)는 fade-in(0.45→1, 0.16s),
//   이벤트 목록·보드·내 정보는 효과 없이 한 프레임에 나타났다(내 정보는 닫힘도 한 프레임 컷).
//   닫기는 이미 fade-out 한 벌이었다 — 열기도 그 대칭(투명도만)으로 맞춘다. 고른 근거(390·360 · DPR3 · CPU4 실측)는
//   src/components/transitionDevices.contract.test.ts (e) 머리말.
// 쓰는 곳: Modal page 변형 · VenuePage · GroupPage · EventPage · EventListPage · CustomerDashboardPage(내 정보·로그인 랜딩) · AdminTab 장부/통계.
//   새 전면 판은 이 두 값을 쓴다 — 다른 진입 효과를 붙이면 (e) 계약이 빨개진다.
/** 열기 — 투명도 0.45→1, 0.16s(index.css `.animate-fade-in`). 판 한 겹의 투명도만 움직인다(이동 없음). */
export const PAGE_ENTER = 'animate-fade-in';
/** 닫기 — 투명도 1→0, 0.18s forwards. 부르는 쪽이 그동안 판을 붙잡아 둔다(useDelayedUnmount 220ms). */
export const PAGE_LEAVE = 'animate-fade-out';
