/**
 * NuriClassicLogo — 오너 C안 가로형 로고(2026-10-06): 골드 다이아(래스터, BrandDiamond) + 'NURI'(크림)·'HOLDEM'(골드) 글자 벡터.
 * 원본 SVG(914KB)는 base64 PNG 를 품고 있어 그대로 쓰지 않는다 — 글자 path 만 classicLogo.ts 로 뽑고 심볼은 작은 이미지로 분리했다.
 * 상자는 원본 100×41 에서 투명 여백을 뺀 내용 영역(86.76×28 비율)이라 높이만 주면 가로가 정해진다(CLS 0).
 * ⚠ 라이트: 크림 'NURI'(#F1EADB)는 밝은 헤더(#F2F5FA) 위 대비 약 1.1 로 사라진다 → 라이트에서만 본문 잉크로 바꾼다(종전 워드마크도 ink-primary 였다).
 *   'HOLDEM' 은 라이트에서 업적 금색 토큰(--achieve)으로 바꾼다(원본 골드는 흰 헤더 위 1.9:1 → 6.4:1, 0908bd74). 다이아(래스터)만 두 테마 같은 색이다.
 * 정적 셸(index.html 의 #nuri-c 스프라이트)이 같은 path·같은 상자를 쓴다 — 형태를 바꾸면 둘 다.
 *
 * 글린트(2026-10-08 오너 "메인에 최고의 모션 딱 1개"): 글자 위로 빛 한 줄기가 지나간다.
 *   글자 모양을 마스크로 쓰고 그 안의 그라디언트만 SMIL 로 옮긴다 — 레이아웃·transform·opacity 를 건드리지 않아
 *   합성층이 생기지 않는다(삼성 밝기 점프 부류 회피). reduced-motion 이면 청크도 안 받고 아예 안 그린다.
 *   2026-10-09 오너 "처음에 한번 나오고 안 나와서 인지를 못 한다" → 세션당 1회를 걷고 8초마다 반복한다
 *   (숨은 문서·화면 밖·입력 중에는 멈춘다 — LogoGlint·lib/glintLoop.ts). 쉬는 동안 빛은 상자 밖 대기 위치라 보이지 않는다.
 */
import { lazy, Suspense, type ComponentType } from 'react';
import BrandDiamond from './BrandDiamond';
import { CLASSIC_HOLDEM, CLASSIC_NURI, CLASSIC_VIEWBOX } from './classicLogo';

// 모듈 평가 때 한 번 정한다 — 헤더의 PC·모바일 두 인스턴스가 같은 판정을 쓴다.
// 2026-10-09: 세션당 1회(sessionStorage 'nuri-glint')와 '로드 순간 숨은 탭이면 끔' 을 걷었다 — 반복 시계가 숨은 동안만 멈춘다.
//   reduced-motion 은 여기서 청크째 끄고, 도중에 켜지면 반복 시계가 멈춘다.
const GLINT_ON = (() => {
  try {
    if (typeof window === 'undefined') return false;
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
})();
// 첫 화면 임계 경로에 싣지 않는다 — 켜진 세션만 작은 청크를 받는다(첫 회차가 어차피 350ms 뒤라 기다림 0).
// 장식이라 청크를 못 받으면(끊김·배포 사이 옛 주소가 index.html 로 오는 경우) 조용히 안 그린다 — 앱 오류 화면까지 올리지 않는다(PR #239 검토 P1).
const Glint = GLINT_ON ? lazy<ComponentType<{ textClassName?: string }>>(() => import('./LogoGlint').catch(() => ({ default: () => null }))) : null;

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
      {/* 글자 svg 의 형제 — 좁은 폭에서 글자 층이 접혀도 다이아 위로는 빛이 지나간다 */}
      {Glint && <Suspense fallback={null}><Glint textClassName={textClassName} /></Suspense>}
    </span>
  );
}
