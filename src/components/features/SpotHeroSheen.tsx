/**
 * NURI SPOT 대표 카드(ToolsPanel SpotHeroCard)의 흐르는 빛 — 넓고 옅은 사선 빛 띠가 카드 왼쪽 밖에서 오른쪽 밖으로 천천히 지나간다.
 *
 * 2026-10-09 오너 "모션그래픽 넣은 부분들 처음에 한번 나오고 안나와서 인지를 못 한다 · 계속 반복되게" — 종전 빛줄기(오른쪽 위 곡선)는
 *   움직이지 않는 정적 그림이라 '모션' 으로 읽히지 않았다(운영 실측 2.5초 간격 픽셀 차이 0). 곡선은 그대로 두고 이 띠만 더한다.
 * 어떻게: 카드 크기 그대로의 svg 한 장 안에서 linearGradient 의 gradientTransform 만 옮긴다 —
 *   레이아웃·transform·opacity 0 (합성층 승격/해제가 삼성에서 밝기 점프로 보인 기록). 반복 시계·멈춤 조건은 lib/glintLoop.ts.
 * 왜 SMIL 이 아니라 rAF 30fps 인가(2026-10-09 실측, 390 · CPU×4 · 24초 창 메인 스레드 TaskDuration):
 *   띠 없음 2.36s → SMIL 60fps 3.66s · rAF 60fps 3.83s · **rAF 30fps 3.16s**. 띠는 넓고 흐릿해 30fps 계단이 눈에 안 띄고,
 *   덧붙는 메인 스레드 몫이 약 40% 준다. SMIL discrete(30단)는 매 프레임 처리가 그대로라 줄지 않았다(4.0~4.2s).
 * 주기·속도: 한 번 2.8s(카드 390 기준 ≈210px/s — 눈으로 따라갈 수 있는 '흐름') · 9s 마다(쉼 ≈6.2s).
 *   탭에 들어오면 1.8s 뒤 첫 회차 — 탭 버튼을 누른 입력의 조용한 구간(1.5s)을 지난 뒤라 건너뛰지 않는다.
 *   헤더 로고(8s)와 주기를 달리 해 둘이 늘 같이 번쩍이지 않는다.
 * 대비: 띠 가운데 최대 불투명도 .19, 양 날개 .07(다크 흰빛 · 라이트 --sh-ray 청회). .14 는 정지 프레임에서도 눈에 거의 안 띄었고(실측 캡처),
 *   .22 는 다크 안내 줄(accent-200)이 띠 한가운데에서 4.48:1 로 AA 에 못 미쳤다(실측) — 그 사이 값이다. 띠가 버튼·글자 뒤를 지나도(카드 내용은 이 층 위에 그린다)
 *   본문 글자·안내 줄 대비는 AA(4.5:1) 이상이다 — e2e/motion-loop-1009.spec.ts ④.
 * 쉬는 동안·reduced-motion 에서는 띠가 카드 왼쪽 밖(대기 위치)에 있어 정적 그림만 남는다(종전과 같은 화면).
 */
import { useEffect, useId, useRef } from 'react';
import { startGlintLoop } from '../../lib/glintLoop';

// 띠 기울기 벡터(오른쪽 위로 ≈20° — 오른쪽 위 곡선 빛줄기와 같은 '\' 방향으로 눕는다). 카드 높이 H 에서 띠는 가로로 [tx, tx+BAND_X+0.36·H] 를 덮는다.
const VX = 140, VY = -50, BAND_X = 158;
const REST = -260; // 카드 높이 ≤ 150 이면 띠 전체가 왼쪽 밖(tx + 158 + 0.36·150 < 0)
const FIRST = 1800, DUR = 2800, PERIOD = 9000;
/** 갱신 간격(ms) — 60Hz 에선 2프레임, 120Hz 에선 4프레임마다(≈30fps). 프레임 간격 흔들림을 감안해 33 보다 조금 작게. */
const STEP = 32;
const rest = `translate(${REST} 0)`;

export default function SpotHeroSheen() {
  const gid = `spot-sheen-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svg = useRef<SVGSVGElement>(null);
  const grad = useRef<SVGLinearGradientElement>(null);
  useEffect(() => {
    const el = svg.current, g = grad.current;
    if (!el || !g) return;
    let raf = 0;
    // SMIL 요소와 같은 모양의 재생기 — 반복 시계(glintLoop)는 beginElement·endElement 만 부른다.
    const player = {
      beginElement() {
        cancelAnimationFrame(raf);
        // 매 회차 카드 폭·높이로 출발·도착을 정한다(회전·창 크기 변화). 출발은 띠 전체가 왼쪽 밖, 도착은 오른쪽 밖.
        const r = el.getBoundingClientRect();
        const from = Math.min(-(BAND_X + 0.36 * r.height) - 8, REST), to = Math.ceil(r.width) + 8;
        let t0 = -1, last = -Infinity;
        const tick = (t: number) => {
          if (t0 < 0) t0 = t;
          const p = (t - t0) / DUR;
          if (p >= 1) { g.setAttribute('gradientTransform', rest); return; }
          if (t - last >= STEP) {
            last = t;
            const e = 0.5 - 0.5 * Math.cos(Math.PI * p); // 사인 이징 — 들어오고 나갈 때 천천히
            g.setAttribute('gradientTransform', `translate(${(from + (to - from) * e).toFixed(1)} 0)`);
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      endElement() {
        cancelAnimationFrame(raf);
        g.setAttribute('gradientTransform', rest);
      },
    };
    return startGlintLoop(el, player, { first: FIRST, period: PERIOD, dur: DUR });
  }, []);
  return (
    <svg ref={svg} data-testid="spot-hero-sheen" className="absolute inset-0 h-full w-full" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient ref={grad} id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VX} y2={VY} gradientTransform={rest}>
          <stop offset="0" style={{ stopColor: 'var(--sh-ray)', stopOpacity: 0 }} />
          <stop offset="0.38" style={{ stopColor: 'var(--sh-ray)', stopOpacity: 0.07 }} />
          <stop offset="0.5" style={{ stopColor: 'var(--sh-ray)', stopOpacity: 0.19 }} />
          <stop offset="0.62" style={{ stopColor: 'var(--sh-ray)', stopOpacity: 0.07 }} />
          <stop offset="1" style={{ stopColor: 'var(--sh-ray)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${gid})`} />
    </svg>
  );
}
