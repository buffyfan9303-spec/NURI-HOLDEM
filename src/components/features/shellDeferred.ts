// src/components/features/shellDeferred.ts — App 셸의 **평소엔 null 을 그리는** 상시 마운트를 한 청크로 묶는다(2026-09-24, 번들 여유 D).
// 넷을 따로 lazy 로 떼면 청크 4개 + 공유 조각(dbError·josa)이 따로 떨어져 JS 전체가 +3.8KB 늘었다(작은 청크는 압축이 안 된다).
// 하나로 묶으면 첫 화면에서 빠지는 양은 같고 늘어나는 양은 청크 하나분이다. 쓰는 곳: App.tsx 의 lazyWithReload 4줄.
// 🔴 보안·법적 게이트(동의 게이트 ConsentGateModal 등)는 여기 넣지 않는다 — 청크가 늦는 동안 앱이 무방비로 열린다
//   (2026-09-24 verifier 실측: 청크 3초 지연 시 미동의 사용자에게 0~2500ms 게이트 0개). e2e/consent-gate-race.spec.ts 가 지킨다.
export { default as VerifyGateSheet } from './VerifyGateSheet';
export { default as StaffInviteBanner } from './StaffInviteBanner';
export { default as LevelUpWatcher } from './LevelUpCelebration';
export { default as NotificationPanel } from './NotificationPanel';
export { default as BrowseSideRail } from './BrowseSideRail';
export { default as PastTournaments } from './PastTournaments';
