// NuriClassicLogo 의 글린트 — 로고 위에 겹친 형제 svg 의 마스크 안에서 그라디언트만 SMIL 로 옮긴다(설명은 NuriClassicLogo 머리말).
// 2026-10-09 오너 "처음에 한번 나오고 안 나와서 인지를 못 한다" → 첫 표시 한 번(세션당 1회)이 아니라 PERIOD 마다 다시 지나간다.
//   반복 시계·멈춤 조건(숨은 문서·화면 밖·reduced-motion·입력 중)은 lib/glintLoop.ts 한 곳.
import { Component, useEffect, useId, useRef, type ReactNode } from 'react';
import { startGlintLoop } from '../../lib/glintLoop';
import { CLASSIC_HOLDEM, CLASSIC_NURI, CLASSIC_VIEWBOX } from './classicLogo';

// 띠(기울기 ≈ 20°)는 x ≈ tx+2.5(위)~tx+27.3(아래)를 덮는다 → tx −18 이하·94 이상이면 로고 상자(x 9.18~95.94) 밖이다.
// 이동 범위를 여기에 맞추고 길이를 850ms 로 줄였다 — 종전 −26→96·1.3s 는 앞 0.26s·뒤 0.44s 가 상자 밖이었다(PR #239 검토).
// PERIOD 8s(2026-10-09): 회차 사이 쉼 ≈7.2s(점유 ≈11%). 4~5s 이하면 글 읽는 동안 시선을 계속 끌고(WCAG 2.2.2 의 '5초' 기준과 같은 감각),
//   10s 이상이면 한 화면 체류(홈 15~20s) 동안 한 번 보기도 어렵다 → 첫 회차 0.35s 뒤, 그 뒤 8s 마다.
const GLINT_FROM = -18, GLINT_TO = 94, GLINT_GEM_TO = 22, GLINT_FIRST = 350, GLINT_DUR = 850, GLINT_PERIOD = 8000;

function Glint({ textClassName }: { textClassName: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const anim = useRef<SVGAnimateTransformElement>(null);
  const gem = useRef<SVGImageElement>(null);
  const textMask = useRef<SVGGElement>(null);
  useEffect(() => {
    const host = svg.current?.parentElement;
    const a = anim.current;
    if (!host || !a) return;
    // 헤더의 PC·모바일 인스턴스 중 한쪽은 늘 display:none 이다 — 반복 시계가 IntersectionObserver 로 보이는 쪽만 돌린다.
    // 매 회차 직전에 정한다(테마 전환·폭 변화가 회차 사이에 있을 수 있다):
    const prep = () => {
      // 다이아는 래스터라 path 가 없다 — 옆 <img> 를 그대로 알파 마스크로 써서 빛이 다이아→NURI→HOLDEM 으로 흐르게 한다(이미 디코드된 같은 src).
      const img = host.querySelector('img');
      const src = img ? img.currentSrc || img.src : '';
      if (src && gem.current && gem.current.getAttribute('href') !== src) gem.current.setAttribute('href', src);
      // 라이트: 남색 NURI·짙은 금 HOLDEM 위 흰빛은 회색·베이지로 바랜다(검토 P3) → 두 테마 같은 색인 다이아에만 건다.
      const light = document.documentElement.classList.contains('light');
      if (textMask.current) textMask.current.style.display = light ? 'none' : '';
      // 다이아만 보일 때(라이트 · <373 — 글자 층이 접힌다)는 같은 850ms 동안 다이아 몫만 등속으로 지난다.
      // 글자까지 가는 범위·곡선 그대로면 빛이 다이아 위에 82~101ms(5~6프레임)만 있어 '반짝' 으로 읽혔다(review-239b P3-a).
      // −18→22 등속: 밝은 띠가 다이아 위에 ≈450ms 있고, 끝(22)에서는 이미 다이아를 벗어나 기본값으로 돌아가도 튀지 않는다.
      // 판정: 라이트이거나, 형제 글자 svg(호스트의 첫 svg)가 접혀 상자가 없을 때. 마스크 안 path 는 다크 390 에서도 상자가 없어 쓸 수 없다(실측).
      const textShown = !light && !!host.querySelector(':scope > svg')?.getClientRects().length;
      if (textShown) {
        a.setAttribute('to', `${GLINT_TO} 0`);
        a.setAttribute('calcMode', 'spline');
        a.setAttribute('keySplines', '.45 0 .2 1');
      } else {
        a.setAttribute('to', `${GLINT_GEM_TO} 0`);
        a.setAttribute('calcMode', 'linear');
        a.removeAttribute('keySplines');
      }
    };
    // ⚠ 시작을 첫 유휴 구간 뒤로 미뤄 봤지만 CPU×4 에서 rAF 50ms 초과가 3회 모두 4회 그대로였다(2026-10-08 실측) — 그래서 고정 지연이다.
    // 장식은 입력에 양보한다 — 누르면 지나가던 빛을 바로 거둔다(마스크 래스터가 눌림 프레임을 밀지 않게, PR #239 CI press-align ①). 다음 주기에 다시.
    return startGlintLoop(host, a, { first: GLINT_FIRST, period: GLINT_PERIOD, dur: GLINT_DUR }, prep);
  }, []);
  return (
    // 글자 svg 의 형제 — 좁은 폭(<373)에서 글자 svg 가 접혀도 다이아 위로는 빛이 지나간다. slice 라 상자가 다이아 폭(w-6)으로 줄어도 다이아에 맞는다.
    <svg ref={svg} viewBox={CLASSIC_VIEWBOX} preserveAspectRatio="xMinYMin slice" aria-hidden="true" focusable="false"
      data-testid="logo-glint" pointerEvents="none" className="absolute inset-0 h-full w-full">
      <mask id={`m${id}`} style={{ maskType: 'alpha' }}>
        <image ref={gem} x="9.18" y="7" width="20" height="28" preserveAspectRatio="xMinYMin meet" />
        {/* 글자 몫은 보이는 글자 층과 같은 규칙으로 접는다 — 접힌 글자 자리에 빛만 떠다니지 않게. 라이트에서는 prep 이 감춘다. */}
        <g ref={textMask} className={textClassName}>
          <path transform={CLASSIC_NURI.transform} d={CLASSIC_NURI.d} />
          <path transform={CLASSIC_HOLDEM.transform} d={CLASSIC_HOLDEM.d} />
        </g>
      </mask>
      {/* 흰빛만 얹으면 크림색 NURI(#F1EADB) 위에서 안 보인다(실측) → 앞쪽에 금빛 그늘을 두어 금박 반사처럼 '그늘→빛' 이 지나가게 한다.
          2026-10-09 반복 전환과 함께 그늘 .5→.8 · 빛 .95→1: 크림 위 그늘 대비 1.58→2.14:1(상대휘도 계산) — 크림 위 흰빛은 1.20:1 이 한계라
          보이는 신호는 금빛 그늘 쪽이다. 색(#B08A45)·띠 폭·경로는 그대로 두고 농도만 올렸다(글자가 금빛으로 한 번 물들었다 풀리는 정도).
          gradientTransform 의 기본값이 대기 위치다 — 비우면 시작 전 띠가 항등 위치(다이아 한가운데)에 멈춰 보였다(검토 P2).
          fill="remove": 회차가 끝나거나(상자 밖 94·22) 입력으로 거두면 이 대기 위치(−18, 상자 밖)로 돌아간다. */}
      <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="18" y2="-6.5" gradientTransform={`translate(${GLINT_FROM} 0)`}>
        <stop offset="0" stopColor="#B08A45" stopOpacity="0" />
        <stop offset=".32" stopColor="#B08A45" stopOpacity=".8" />
        <stop offset=".52" stopColor="#fff" stopOpacity="1" />
        <stop offset=".72" stopColor="#fff" stopOpacity="0" />
        <animateTransform ref={anim} attributeName="gradientTransform" type="translate" from={`${GLINT_FROM} 0`} to={`${GLINT_TO} 0`}
          dur={`${GLINT_DUR}ms`} begin="indefinite" end="indefinite" fill="remove" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .2 1" />
      </linearGradient>
      <rect x="9.18" y="7" width="86.76" height="28" fill={`url(#g${id})`} mask={`url(#m${id})`} />
    </svg>
  );
}

// 장식이라 그리다 실패해도(렌더·커밋·effect 오류) 아무것도 안 그리고 끝낸다 — 앱 전체 경계(main.tsx)까지 올리지 않는다.
export default class LogoGlint extends Component<{ textClassName?: string }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render(): ReactNode { return this.state.err ? null : <Glint textClassName={this.props.textClassName ?? ''} />; }
}
