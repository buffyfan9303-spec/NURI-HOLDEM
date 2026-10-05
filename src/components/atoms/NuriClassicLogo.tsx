/**
 * NuriClassicLogo — 오너 C안 가로형 로고(2026-10-06): 골드 다이아(래스터, BrandDiamond) + 'NURI'(크림)·'HOLDEM'(골드) 글자 벡터.
 * 원본 SVG(914KB)는 base64 PNG 를 품고 있어 그대로 쓰지 않는다 — 글자 path 만 classicLogo.ts 로 뽑고 심볼은 작은 이미지로 분리했다.
 * 상자는 원본 100×41 에서 투명 여백을 뺀 내용 영역(86.76×28 비율)이라 높이만 주면 가로가 정해진다(CLS 0).
 * ⚠ 라이트: 크림 'NURI'(#F1EADB)는 밝은 헤더(#F2F5FA) 위 대비 약 1.1 로 사라진다 → 라이트에서만 본문 잉크로 바꾼다(종전 워드마크도 ink-primary 였다).
 *   골드 'HOLDEM'·다이아는 두 테마 같은 색(라이트 대비는 PR 보고 — 오너 판단 대기).
 * 정적 셸(index.html 의 #nuri-c 스프라이트)이 같은 path·같은 상자를 쓴다 — 형태를 바꾸면 둘 다.
 */
import BrandDiamond from './BrandDiamond';
import { CLASSIC_HOLDEM, CLASSIC_NURI, CLASSIC_VIEWBOX } from './classicLogo';

export default function NuriClassicLogo({ className = '', textClassName = '', priority = false }: {
  /** 높이(h-*)와 반응형 접기 */
  className?: string;
  /** 글자 층만 숨기는 등(좁은 폭에서 심볼만 남길 때) */
  textClassName?: string;
  priority?: boolean;
}) {
  return (
    <span role="img" aria-label="NURI HOLDEM" className={`relative inline-block aspect-[86.76/28] shrink-0 select-none ${className}`}>
      <BrandDiamond width={20} height={28} priority={priority} className="absolute left-0 top-0 h-full" />
      <svg viewBox={CLASSIC_VIEWBOX} aria-hidden="true" focusable="false"
        className={`absolute inset-0 h-full w-full text-[#F1EADB] [--holdem:#D9BA79] [html.light_&]:text-ink-primary [html.light_&]:[--holdem:rgb(var(--achieve))] ${textClassName}`}>
        <path fill="currentColor" transform={CLASSIC_NURI.transform} d={CLASSIC_NURI.d} />
        {/* 'HOLDEM' — 다크는 원본 골드(#D9BA79), 라이트는 업적 금색 토큰(#7A591C, 흰 헤더 위 약 6.4:1). 원본 골드는 라이트에서 약 1.9:1 이었다(2026-10-06). */}
        <path style={{ fill: `var(--holdem, ${CLASSIC_HOLDEM.fill})` }} transform={CLASSIC_HOLDEM.transform} d={CLASSIC_HOLDEM.d} />
      </svg>
    </span>
  );
}
