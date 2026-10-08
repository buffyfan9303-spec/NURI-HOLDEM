// NuriClassicLogo 의 첫 표시 글린트 — 글자 마스크 안에서 그라디언트만 SMIL 로 한 번 옮기고, 끝나면 노드를 지운다(설명은 NuriClassicLogo 머리말).
import { useEffect, useId, useRef, useState } from 'react';
import { CLASSIC_HOLDEM, CLASSIC_NURI } from './classicLogo';

const GLINT_DELAY = 350, GLINT_DUR = 1300;

export default function LogoGlint() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const anim = useRef<SVGAnimateTransformElement>(null);
  const gem = useRef<SVGImageElement>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    // 다이아는 래스터라 path 가 없다 — 옆 <img> 를 그대로 알파 마스크로 써서 빛이 다이아→NURI→HOLDEM 으로 흐르게 한다(이미 디코드된 같은 src).
    const img = gem.current?.closest('[role="img"]')?.querySelector('img');
    if (img) gem.current?.setAttribute('href', img.currentSrc || img.src);
    const t1 = setTimeout(() => anim.current?.beginElement?.(), GLINT_DELAY);
    const t2 = setTimeout(() => setOn(false), GLINT_DELAY + GLINT_DUR + 50);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!on) return null;
  const light = document.documentElement.classList.contains('light');
  return (
    <g data-testid="logo-glint" pointerEvents="none">
      <mask id={`m${id}`} style={{ maskType: 'alpha' }}>
        <image ref={gem} x="9.18" y="7" width="20" height="28" preserveAspectRatio="xMinYMin meet" />
        <path transform={CLASSIC_NURI.transform} d={CLASSIC_NURI.d} />
        <path transform={CLASSIC_HOLDEM.transform} d={CLASSIC_HOLDEM.d} />
      </mask>
      {/* 비스듬한 빛 띠(가로 ≈ 20, 기울기 ≈ 20°) — 시작(-26)·끝(96) 위치에선 상자(x 9.18~95.94) 밖이라 아무것도 안 칠한다.
          흰빛만 얹으면 크림색 NURI(#F1EADB) 위에서 안 보인다(실측) → 앞쪽에 옅은 금빛 그늘을 두어 금박 반사처럼 '그늘→빛' 이 지나가게 한다. */}
      <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="18" y2="-6.5">
        <stop offset="0" stopColor="#B08A45" stopOpacity="0" />
        <stop offset=".32" stopColor="#B08A45" stopOpacity={light ? 0.2 : 0.5} />
        <stop offset=".52" stopColor="#fff" stopOpacity={light ? 0.5 : 0.95} />
        <stop offset=".72" stopColor="#fff" stopOpacity="0" />
        <animateTransform ref={anim} attributeName="gradientTransform" type="translate" from="-26 0" to="96 0"
          dur={`${GLINT_DUR}ms`} begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .2 1" />
      </linearGradient>
      <rect x="9.18" y="7" width="86.76" height="28" fill={`url(#g${id})`} mask={`url(#m${id})`} />
    </g>
  );
}
