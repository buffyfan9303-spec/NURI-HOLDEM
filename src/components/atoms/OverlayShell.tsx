// 전체화면 오버레이의 본문 셸 — **PC 폭 계약의 정본 한 곳** (2026-09-21)
//
// 🔴 2026-09-18 오너: "PC 버젼에서 모든 탭이 제대로 잘 움직이다가 이벤트만 가면 갑자기
//    전체화면으로 바뀌면서 지혼자서 이상하게 돼 이 부분도 수정 다른 탭들처럼".
//    원인: 이벤트는 탭 pane 이 아니라 `fixed inset-0` 오버레이인데(App.tsx 의 'event' 는 pane 이 없다)
//    안에 폭 제한이 하나도 없어 1440px 에서 **혼자만 풀블리드**로 펼쳐졌다.
//    다른 탭은 전부 App.tsx 의 앱 셸(`mx-auto w-full max-w-6xl xl:border-x`) 안에서 그려진다.
//    → 오버레이 **본문에 같은 셸**을 씌운다. 오버레이 자체(fixed inset-0)는 그대로 둔다 —
//      배경이 화면을 덮어야 뒤 탭이 비쳐 보이지 않고, 뒤로가기 계약(useBackClose)도 그대로다.
//
// 🔴 왜 컴포넌트로 뽑았나(2026-09-21): 위 처방이 `EventPage.tsx`·`EventListPage.tsx` 에 **두 벌**이었다.
//    회귀 스펙이 목록만 재던 동안 보드 쪽 폭을 지우는 음성 대조가 **초록으로 통과했다**(실측).
//    계약이 두 벌이면 한 벌만 고쳐지고, 그때부터 앱은 같은 계약을 화면마다 다르게 말한다.
//    **새 전체화면 오버레이는 이 컴포넌트를 쓴다.** 클래스 문자열을 다시 적지 마라 —
//    복제 금지 계약이 `overlayShell.contract.test.ts` 에서 `max-w-6xl` 참조 수를 파일별로 고정한다.
//
// ⚠ `xl:min-h-full` 이 필요하다. 없으면 xl 의 세로 테두리가 내용 높이에서 끊겨 셸이 반만 그려진다.
// ⚠ 오버레이의 **직계 자식**으로 두어라. `e2e/pc-store-regression.spec.ts` 는 오버레이 직계 자식 중
//    가장 넓은 것을 '본문' 으로 보고 폭·좌우 여백을 잰다 — 한 겹 더 감싸면 재는 대상이 바뀐다.
// ⚠ 모바일(xl 미만)에서는 `max-w-6xl` 이 화면 폭보다 커서 아무 일도 하지 않는다. 이 처방은 PC 전용이고,
//    전 폭에 바르는 순간 모바일이 깨진다 — 390px 회귀를 같은 스펙이 함께 잠근다.
import type { ReactNode } from 'react';

export default function OverlayShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl xl:min-h-full xl:border-x xl:border-border-subtle">
      {children}
    </div>
  );
}
