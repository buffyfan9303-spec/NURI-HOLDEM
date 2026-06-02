/**
 * NuriHoldemLogo — 플랫폼 브랜드 로고
 *
 * 헤더(compact) 및 풀사이즈(full) 두 가지 변형 지원.
 * dark 배경 위에서 이미지의 검은 배경이 자연스럽게 블렌딩됨.
 */

interface NuriHoldemLogoProps {
  className?: string;
  /** compact: 헤더용 가로 레이아웃 | full: 스플래시/소개 화면용 */
  variant?: 'compact' | 'full';
}

export default function NuriHoldemLogo({ className = '', variant = 'compact' }: NuriHoldemLogoProps) {
  if (variant === 'full') {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <img
          src="/nuri-logo.png"
          alt="NURI HOLDEM"
          className="w-64 object-contain"
          draggable={false}
        />
      </div>
    );
  }

  // compact: 헤더에서 사용 — 남색 로고가 어두운 헤더에 묻히지 않도록 흰 둥근 칩 위에 배치
  return (
    <span className={`inline-flex items-center rounded-lg bg-white px-2 py-1 shadow-sm ${className}`}>
      <img
        src="/nuri-logo.png"
        alt="NURI HOLDEM"
        className="h-7 w-auto object-contain select-none"
        draggable={false}
      />
    </span>
  );
}
