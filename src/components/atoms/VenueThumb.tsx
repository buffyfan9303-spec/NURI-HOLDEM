// src/components/atoms/VenueThumb.tsx
// 매장 썸네일 — 사진이 있으면 사진, 없으면 이름 기반 딥톤 타일(이니셜+옅은 수트 마크).
// 카드 목록에서 themeColor 원색을 그대로 쓰면 조잡해 보여(골드 떡칠), 채도 낮춘 고정 팔레트를 해시로 배정한다.
const PALETTE = [
  '#2E3A52', // 슬레이트 네이비
  '#1F4037', // 딥 펠트 그린
  '#4A2230', // 버건디
  '#36284E', // 딥 퍼플
  '#1D3D43', // 딥 틸
  '#3E2F23', // 웜 브라운
];
const SUITS = ['♠', '♥', '♦', '♣'];

function hashOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

export default function VenueThumb({ name, imageUrl, size = 'md', className = '' }: {
  name: string;
  imageUrl?: string | null;
  /** md=48px(목록 카드) lg=56px */
  size?: 'md' | 'lg';
  className?: string;
}) {
  const sz = size === 'lg' ? 'h-14 w-14' : 'h-12 w-12';
  const base = `${sz} shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10 select-none ${className}`;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`${name} 사진`}
        loading="lazy"
        className={`${base} object-cover bg-surface-high`}
      />
    );
  }

  const h = hashOf(name || '?');
  const c = PALETTE[h % PALETTE.length];
  const suit = SUITS[(h >> 3) % SUITS.length];
  return (
    <div
      aria-hidden
      className={`${base} relative flex items-center justify-center`}
      style={{ background: `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${c} 82%, white) 0%, ${c} 52%, color-mix(in srgb, ${c} 55%, black) 100%)` }}
    >
      <span className="absolute -bottom-1.5 -right-1 text-3xl text-white/10 rotate-[-14deg] leading-none">{suit}</span>
      <span className={`relative font-extrabold text-white/95 ${size === 'lg' ? 'text-xl' : 'text-base'}`}>
        {(name || '?').slice(0, 1)}
      </span>
    </div>
  );
}
