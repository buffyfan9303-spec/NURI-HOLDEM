/**
 * NuriMark — NH CI 스페이드 심벌(정본: public/brand/nuri-holdem-symbol.svg 와 동일 지오메트리).
 * 골드 그라디언트 스페이드 + 지평선·떠오르는 해 네거티브 스페이스(mask).
 * ⚠ mask/gradient 는 display:none 조상 아래에서 리소스가 죽는다(Chromium 실측) — 그래서
 *   인스턴스마다 defs 를 자체 포함하고, 같은 화면에 복수 렌더(모바일/PC 헤더)돼도 참조가
 *   섞이지 않게 uid 로 id 를 분리한다. 정적 셸(index.html <symbol id="nuri-mark">)과 동일 픽셀 —
 *   형태를 바꾸면 셸 스프라이트·scripts/gen-favicons.mjs 도 함께 갱신할 것.
 */
interface NuriMarkProps {
  className?: string;
  /** 같은 문서에 복수 인스턴스가 있을 때 SVG id 충돌 방지용 접미사 */
  uid?: string;
}

export default function NuriMark({ className = '', uid = '' }: NuriMarkProps) {
  const gold = `nuri-mark-gold${uid ? `-${uid}` : ''}`;
  const cut = `nuri-mark-cut${uid ? `-${uid}` : ''}`;
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8C97C" />
          <stop offset="1" stopColor="#C79A3F" />
        </linearGradient>
        <mask id={cut}>
          <rect width="240" height="240" fill="#fff" />
          <rect x="28" y="118" width="184" height="9" rx="4.5" fill="#000" />
          <path d="M 96 110 A 24 24 0 0 1 144 110 L 96 110 Z" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${cut})`}>
        <path
          fill={`url(#${gold})`}
          d="M 120 18 C 96 58 40 96 40 138 C 40 172 66 190 92 184 C 103 181 111 175 116 167 C 112 194 100 208 84 216 L 156 216 C 140 208 128 194 124 167 C 129 175 137 181 148 184 C 174 190 200 172 200 138 C 200 96 144 58 120 18 Z"
        />
      </g>
    </svg>
  );
}
