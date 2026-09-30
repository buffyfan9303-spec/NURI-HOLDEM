// src/components/features/clock/ambience/ClockAmbienceSlot.tsx — 클락 화면의 모션 테마 자리(정적 import 용, 아주 작다).
//
// 호출처(ClockDisplay·TournamentClock·ClockThemePanel)는 이 파일만 정적으로 부른다. 그림 코드(장면·엔진·영상)는
// 테마 id 가 있을 때만 lazy 청크로 받는다 — 모션 테마를 안 쓰는 매장·첫 화면 번들에는 0 바이트.
//
// 놓는 법: 스테이지 루트의 **첫 자식**. 루트는 `isolation:isolate`(쌓임 맥락) + `position:relative` + `data-amb-root` 를 가진다.
//   층은 z-index:-1 이라 루트 배경(--clk-bg, 장면이 뜨기 전 바탕) 위, 보드 글자 아래에 깔린다.
import { lazy, Suspense } from 'react';

const Layer = lazy(() => import('./ClockAmbienceLayer'));

export default function ClockAmbienceSlot({ id, still }: { id?: string | null; still?: boolean }) {
  if (!id) return null;
  return (
    <Suspense fallback={null}>
      <Layer id={id} still={still} />
    </Suspense>
  );
}
