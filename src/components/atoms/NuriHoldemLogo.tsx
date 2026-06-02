/**
 * NuriHoldemLogo — 플랫폼 브랜드 로고 (테마별 자동 전환)
 *  - 다크 테마 : /2.png        (흰 글자 + 투명 배경)
 *  - 라이트 테마: /nuri-logo.png (검은 글자 + 투명 배경)
 *  두 이미지는 동일한 워드마크(같은 크기·형태·여백)라 테마를 바꿔도 위치가 동일하다.
 *  배경이 투명이라 별도 칩 없이 헤더에 직접 얹어도 깔끔하게 보인다.
 */
import { useTheme } from '../../contexts/ThemeContext';

interface NuriHoldemLogoProps {
  className?: string;
  /** compact: 헤더용 | full: 스플래시/소개 화면용 */
  variant?: 'compact' | 'full';
}

export default function NuriHoldemLogo({ className = '', variant = 'compact' }: NuriHoldemLogoProps) {
  const { theme } = useTheme();
  const src = theme === 'dark' ? '/2.png' : '/nuri-logo.png';

  if (variant === 'full') {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <img src={src} alt="NURI HOLDEM" className="w-48 object-contain" draggable={false} />
      </div>
    );
  }

  // compact: 헤더 — 높이 고정, 가로 자동. 투명 배경이라 테마 무관 동일 위치.
  return (
    <img
      src={src}
      alt="NURI HOLDEM"
      className={`h-8 w-auto object-contain select-none ${className}`}
      draggable={false}
    />
  );
}
