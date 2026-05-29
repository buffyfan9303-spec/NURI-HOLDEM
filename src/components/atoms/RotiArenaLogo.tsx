/**
 * RotiArenaLogo — 헤럴드 스타일 로고 (방패 + 왕관 + R + 두 마리 말 + 배너)
 *
 * 변형:
 *   - full:    헤더용 가로형 (아이콘 + 텍스트)
 *   - mark:    아이콘만 (정사각)
 *   - banner:  큰 사이즈 (랜딩/스플래시)
 */

interface RotiArenaLogoProps {
  variant?: 'full' | 'mark' | 'banner';
  className?: string;
}

const GOLD = '#C9A961';

// ── 헤럴드 마크 SVG (방패 + 왕관 + R + 좌우 말 + 배너) ──────────────────────

function HeraldicMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 130"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ROTI ARENA 로고"
    >
      <defs>
        <linearGradient id="gold-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#E5C77A" />
          <stop offset="50%" stopColor="#C9A961" />
          <stop offset="100%" stopColor="#8C7032" />
        </linearGradient>
      </defs>

      {/* 왕관 */}
      <g fill="url(#gold-grad)">
        <circle cx="60" cy="6" r="2.5" />
        <path d="M44 22 L48 12 L52 18 L60 8 L68 18 L72 12 L76 22 Z" />
        <rect x="42" y="22" width="36" height="3" rx="0.5" />
        <circle cx="48" cy="13" r="1.5" />
        <circle cx="72" cy="13" r="1.5" />
      </g>

      {/* 좌측 말 (헤럴드 스타일 — 단순 실루엣) */}
      <g fill="url(#gold-grad)" transform="translate(8, 32)">
        <path d="
          M 0 35
          C -1 25, 4 18, 12 16
          L 16 12
          C 17 8, 19 6, 22 7
          L 21 11
          L 25 10
          L 23 14
          L 19 16
          L 22 22
          L 26 26
          L 26 36
          L 22 44
          L 24 50
          L 20 52
          L 18 46
          L 14 50
          L 10 48
          L 12 42
          L 8 40
          L 4 44
          L 1 42
          Z
        " />
      </g>

      {/* 우측 말 (좌측 미러) */}
      <g fill="url(#gold-grad)" transform="translate(112, 32) scale(-1, 1)">
        <path d="
          M 0 35
          C -1 25, 4 18, 12 16
          L 16 12
          C 17 8, 19 6, 22 7
          L 21 11
          L 25 10
          L 23 14
          L 19 16
          L 22 22
          L 26 26
          L 26 36
          L 22 44
          L 24 50
          L 20 52
          L 18 46
          L 14 50
          L 10 48
          L 12 42
          L 8 40
          L 4 44
          L 1 42
          Z
        " />
      </g>

      {/* 방패 */}
      <g>
        <path
          d="M 40 32 L 80 32 L 80 70 Q 80 88 60 98 Q 40 88 40 70 Z"
          fill="#0A0C0F"
          stroke="url(#gold-grad)"
          strokeWidth="2.2"
        />
        {/* 방패 내부 가는 외곽선 */}
        <path
          d="M 43 35 L 77 35 L 77 69 Q 77 85 60 94 Q 43 85 43 69 Z"
          fill="none"
          stroke="url(#gold-grad)"
          strokeWidth="0.6"
          opacity="0.5"
        />
      </g>

      {/* R 문자 */}
      <text
        x="60" y="74"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="32"
        fontWeight="900"
        textAnchor="middle"
        fill="url(#gold-grad)"
      >
        R
      </text>

      {/* 좌우 잎사귀 장식 */}
      <g fill="url(#gold-grad)" opacity="0.85">
        <path d="M 28 92 Q 36 88 42 94 Q 38 96 32 98 Q 30 96 28 92 Z" />
        <path d="M 92 92 Q 84 88 78 94 Q 82 96 88 98 Q 90 96 92 92 Z" />
      </g>

      {/* 하단 배너 */}
      <g>
        <path
          d="M 14 104 L 106 104 L 102 118 L 18 118 Z"
          fill="url(#gold-grad)"
        />
        {/* 배너 양끝 접힘 */}
        <path d="M 6 108 L 14 104 L 18 118 L 10 116 Z" fill="#8C7032" />
        <path d="M 114 108 L 106 104 L 102 118 L 110 116 Z" fill="#8C7032" />
        <text
          x="60" y="114"
          fontFamily="Georgia, serif"
          fontSize="8"
          fontWeight="700"
          textAnchor="middle"
          fill="#0A0C0F"
          letterSpacing="2"
        >
          ROTI ARENA
        </text>
      </g>
    </svg>
  );
}

// ── 익스포트 ─────────────────────────────────────────────────────────────────

export default function RotiArenaLogo({ variant = 'full', className = '' }: RotiArenaLogoProps) {
  if (variant === 'mark') {
    return <div className={className}><HeraldicMark size={40} /></div>;
  }

  if (variant === 'banner') {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <HeraldicMark size={120} />
        <div className="text-center">
          <p className="font-serif font-extrabold text-2xl tracking-[0.3em]" style={{ color: GOLD }}>
            ROTI ARENA
          </p>
          <p className="text-xs text-ink-muted tracking-widest mt-1">PREMIUM HOLDEM ARENA</p>
        </div>
      </div>
    );
  }

  // full (헤더용)
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <HeraldicMark size={36} />
      <div className="flex flex-col leading-none">
        <span
          className="font-serif font-extrabold text-base tracking-[0.15em]"
          style={{ color: GOLD }}
        >
          ROTI
        </span>
        <span
          className="font-serif font-bold text-2xs tracking-[0.25em]"
          style={{ color: GOLD, opacity: 0.85 }}
        >
          ARENA
        </span>
      </div>
    </div>
  );
}
