// src/components/features/clock/ClockLogoLayer.tsx — N-2(2026-10-03) '가운데 크게'(로고) 층.
//
// 왜 루트 배경(--clk-bg)이 아니라 따로 된 층인가: 로고는 **짧은 변 대비** 크기로 놓고 어떤 비율이든 잘리지 않아야 한다.
//   background-size 의 % 는 축마다 따로 잡혀 '짧은 변 기준' 을 못 쓰고, 루트 자신에게는 cq 단위가 듣지 않는다(컨테이너는 자기 자식에게만).
//   그래서 루트의 첫 자식으로 상자(높이 = 짧은 변 × n%, 폭 = 보드 폭 − 여백)를 깔고 그 안에서 contain 한다 — 잘림이 구조적으로 없다.
// 놓는 법: ClockAmbienceSlot 처럼 스테이지 루트의 첫 자식 · z-index −1. 루트는 이 층이 있을 때 isolation:isolate 여야 한다
//   (clockLayerIsolation). 그래야 루트 배경 위 · 보드 글자 아래에 깔린다.
// unit: 짧은 변 1% 의 길이. TV·운영자 스테이지는 루트가 size 컨테이너라 '1cqmin'. 설정 미리보기(em 축소판)는 호출부가 em 으로 준다.
export default function ClockLogoLayer({ vars, unit = '1cqmin' }: { vars: Record<string, string>; unit?: string }) {
  const img = vars['--clk-logo'];
  if (!img) return null;
  const size = Number(vars['--clk-logo-size']) || 48;
  const pos = vars['--clk-logo-pos'] ?? 'center';
  const u = (n: number) => `calc(${n} * ${unit})`;
  const place = pos === 'top' ? { top: u(9) } : pos === 'bottom' ? { bottom: u(13) } : { top: '50%', transform: 'translateY(-50%)' };
  return (
    <div aria-hidden data-testid="clk-logo" className="pointer-events-none absolute"
      style={{ zIndex: -1, left: u(3), right: u(3), height: u(size), ...place, background: `${img} center/contain no-repeat` }} />
  );
}

/** 이 층(또는 모션 테마)이 있을 때 루트에 거는 쌓임 맥락 — 없으면 null(종전 루트 그대로). */
export const clockLayerIsolation = (vars: Record<string, string>, ambience: string | null | undefined) =>
  (ambience || vars['--clk-logo'] ? { isolation: 'isolate' as const } : null);
