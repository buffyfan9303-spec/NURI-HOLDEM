// NuriClassicLogo 의 첫 표시 글린트 — 로고 위에 겹친 형제 svg 의 마스크 안에서 그라디언트만 SMIL 로 한 번 옮기고, 끝나면 노드를 지운다(설명은 NuriClassicLogo 머리말).
import { Component, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CLASSIC_HOLDEM, CLASSIC_NURI, CLASSIC_VIEWBOX } from './classicLogo';

// 띠(기울기 ≈ 20°)는 x ≈ tx+2.5(위)~tx+27.3(아래)를 덮는다 → tx −18 이하·94 이상이면 로고 상자(x 9.18~95.94) 밖이다.
// 이동 범위를 여기에 맞추고 길이를 850ms 로 줄였다 — 종전 −26→96·1.3s 는 앞 0.26s·뒤 0.44s 가 상자 밖이었다(PR #239 검토).
const FROM = -18, TO = 94, DELAY = 350, DUR = 850, KEY = 'nuri-glint';

function Glint({ textClassName }: { textClassName: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const anim = useRef<SVGAnimateTransformElement>(null);
  const gem = useRef<SVGImageElement>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    const end = () => setOn(false);
    const host = svg.current?.parentElement;
    // 헤더의 PC·모바일 인스턴스 중 한쪽은 늘 display:none 이다 — 숨은 쪽은 아무것도 안 하고 빠진다(세션 표시도 안 쓴다).
    if (!host?.getClientRects().length || sessionStorage.getItem(KEY)) {
      const t0 = setTimeout(end);
      return () => clearTimeout(t0);
    }
    sessionStorage.setItem(KEY, '1');
    // 다이아는 래스터라 path 가 없다 — 옆 <img> 를 그대로 알파 마스크로 써서 빛이 다이아→NURI→HOLDEM 으로 흐르게 한다(이미 디코드된 같은 src).
    const img = host.querySelector('img');
    if (img) gem.current?.setAttribute('href', img.currentSrc || img.src);
    // 시작은 첫 유휴 구간 뒤(상한 700ms) — 홈 데이터 렌더 긴 작업과 겹치면 SMIL(메인 스레드) 프레임이 끊긴다(CPU×4 rAF 145ms, 검토).
    let t: ReturnType<typeof setTimeout>;
    const go = () => { anim.current?.beginElement?.(); t = setTimeout(end, DUR + 50); };
    t = setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 700 }) : go()), DELAY);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  // 라이트: 남색 NURI·짙은 금 HOLDEM 위 흰빛은 회색·베이지로 바랜다(검토 P3) → 두 테마 같은 색인 다이아에만 건다.
  const light = document.documentElement.classList.contains('light');
  return (
    // 글자 svg 의 형제 — 좁은 폭(<373)에서 글자 svg 가 접혀도 다이아 위로는 빛이 지나간다. slice 라 상자가 다이아 폭(w-6)으로 줄어도 다이아에 맞는다.
    <svg ref={svg} viewBox={CLASSIC_VIEWBOX} preserveAspectRatio="xMinYMin slice" aria-hidden="true" focusable="false"
      data-testid="logo-glint" pointerEvents="none" className="absolute inset-0 h-full w-full">
      <mask id={`m${id}`} style={{ maskType: 'alpha' }}>
        <image ref={gem} x="9.18" y="7" width="20" height="28" preserveAspectRatio="xMinYMin meet" />
        {/* 글자 몫은 보이는 글자 층과 같은 규칙으로 접는다 — 접힌 글자 자리에 빛만 떠다니지 않게 */}
        {!light && (
          <g className={textClassName}>
            <path transform={CLASSIC_NURI.transform} d={CLASSIC_NURI.d} />
            <path transform={CLASSIC_HOLDEM.transform} d={CLASSIC_HOLDEM.d} />
          </g>
        )}
      </mask>
      {/* 흰빛만 얹으면 크림색 NURI(#F1EADB) 위에서 안 보인다(실측) → 앞쪽에 옅은 금빛 그늘을 두어 금박 반사처럼 '그늘→빛' 이 지나가게 한다.
          gradientTransform 의 기본값을 시작 위치로 둔다 — 비우면 시작 전(begin 전) 띠가 항등 위치(다이아 한가운데)에 멈춰 보였다(검토 P2). */}
      <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="18" y2="-6.5" gradientTransform={`translate(${FROM} 0)`}>
        <stop offset="0" stopColor="#B08A45" stopOpacity="0" />
        <stop offset=".32" stopColor="#B08A45" stopOpacity=".5" />
        <stop offset=".52" stopColor="#fff" stopOpacity=".95" />
        <stop offset=".72" stopColor="#fff" stopOpacity="0" />
        <animateTransform ref={anim} attributeName="gradientTransform" type="translate" from={`${FROM} 0`} to={`${TO} 0`}
          dur={`${DUR}ms`} begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .2 1" />
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
