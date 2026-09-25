// src/lib/notifBootTab.ts — 푸시 부팅 딥링크(?nl=<알림 원문 링크>)가 **권한 탭**으로 가는지.
//
// 🔴 2026-09-26(auth-boot-gap G7) — `?nl=/admin` 으로 부팅하면 권한(프로필)이 오기 전 약 100~150ms 동안 **홈이 먼저** 그려졌다가
//   관리자 화면으로 바뀌었다(깜빡임). `?tab=my-store`·`?tab=admin` 은 시작 탭을 그 탭으로 잡고 권한을 기다리는데(App pendingDeepTab),
//   알림 링크는 그 길을 안 탔다. → 알림 링크가 가리키는 권한 탭을 **시작 탭**으로 삼는다. 권한이 없으면 App 의 탭 가드가 홈으로 보낸다.
// 알림 처리(App handleNavigateNotification)와 같은 목적지 표를 쓴다: /admin(포스터 승인) · /my-store/* · /staff-schedule.
//   ⚠ '/admin' 은 업주에게도 온다(내 포스터 승인 → 내 매장). 시작 탭은 'admin' 으로 잡고, 권한 확인 뒤 App 이 역할에 맞게 옮긴다.
export type BootPermTab = 'admin' | 'my-store';

export function bootTabForNotifLink(link: string | null | undefined): BootPermTab | null {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  const path = link.split(/[?#]/)[0];
  if (path === '/admin') return 'admin';
  if (path === '/my-store' || path.startsWith('/my-store/') || path === '/staff-schedule') return 'my-store';
  return null;
}
