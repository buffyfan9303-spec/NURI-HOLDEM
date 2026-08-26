/**
 * NuriHoldemLogo — 플랫폼 브랜드 워드마크.
 * [DS] IMG-1: PNG 2장(다크/라이트) + useTheme 분기 → 인라인 SVG(fill=currentColor) 하나.
 * 다크/라이트는 CSS 색 상속으로 자동 해결(테마 전환 시 FOUC·이미지 재요청 0).
 * 형태의 단일 소스는 wordmark.ts(gen-wordmark.mjs 생성) — 정적 셸·클락 워터마크와 공유.
 */
import { WORDMARK_D, WORDMARK_VIEWBOX } from './wordmark';

interface NuriHoldemLogoProps {
  className?: string;
  /** compact: 헤더용 | full: 스플래시/소개 화면용 */
  variant?: 'compact' | 'full';
}

export default function NuriHoldemLogo({ className = '', variant = 'compact' }: NuriHoldemLogoProps) {
  const svg = (cls: string) => (
    <svg viewBox={WORDMARK_VIEWBOX} className={cls} role="img" aria-label="NURI HOLDEM">
      <path fill="currentColor" d={WORDMARK_D} />
    </svg>
  );

  if (variant === 'full') {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        {svg('w-48 text-ink-primary select-none')}
      </div>
    );
  }

  // compact: 헤더 — 높이 고정, 가로 자동. 텍스트 색을 그대로 상속받는다.
  return svg(`h-8 w-auto text-ink-primary select-none ${className}`);
}
