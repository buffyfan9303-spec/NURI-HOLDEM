// src/components/atoms/VenueThumb.tsx
import Icon from './Icon';
import { thumbUrl } from '../../lib/imageUrl';
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
// [DS] IMG-2: 유니코드 수트(♥♦)는 iOS·일부 안드로이드가 컬러 이모지로 승격시켜
// text-white/10 워터마크 색 제어가 무력화된다 → Icon 글리프로 교체(픽셀 결정론).
const SUITS = ['spade', 'heart-suit', 'diamond', 'club'] as const;

function hashOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

export default function VenueThumb({ name, imageUrl, size = 'md', className = '' }: {
  name: string;
  imageUrl?: string | null;
  /** sm=40px(밀도 높은 목록) md=48px lg=56px */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sz = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-10 w-10' : 'h-12 w-12';
  const base = `${sz} shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10 select-none ${className}`;

  if (imageUrl) {
    // 🔴 2026-09-19 실측 — 여기서 **원본을 그대로** 받고 있었다.
    //   roti-arena.webp 15,970B 를 40~56px 타일에 쓰고 있었다(-64 변형본은 1,322B · 92% 작다).
    //   `thumbUrl` 은 `/venues/`·`/banners/` 로컬 파일이면 폭별 변형본을 가리키고, 대상이 아니면
    //   원본을 그대로 돌려준다(Supabase 이미지는 변환 파라미터를 붙인다) — 호출부는 몰라도 된다.
    // ⚠ 변형본이 없을 수 있다(`scripts/gen-thumbs.mjs` 가 안 돈 빌드·새로 올린 파일).
    //   404 로 깨진 아이콘이 되면 안 되므로 **원본으로 되돌리는 폴백**을 같이 둔다 —
    //   ScheduleCard 의 PosterArea 와 같은 조리법이다. 폴백이 없으면 화면이 깨지고,
    //   폴백만 있고 변형본이 없으면 조용히 느려지기만 한다(그래서 gen-thumbs 의 DIRS 와 한 쌍이다).
    const w = size === 'lg' ? 128 : 64;   // lg=56px → 2배 밀도까지 감당
    return (
      <img
        src={thumbUrl(imageUrl, w)}
        alt={`${name} 사진`}
        loading="lazy"
        decoding="async"
        className={`${base} object-cover bg-surface-high`}
        onError={(e) => {
          const el = e.currentTarget;
          if (el.dataset.fb) return;      // 원본도 실패하면 더 시도하지 않는다(무한 루프 방지)
          el.dataset.fb = '1';
          el.src = imageUrl;
        }}
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
      <span className="absolute -bottom-1.5 -right-1 rotate-[-14deg] text-white/10 leading-none"><Icon name={suit} size={30} /></span>
      <span className={`relative font-extrabold text-white/95 ${size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base'}`}>
        {(name || '?').slice(0, 1)}
      </span>
    </div>
  );
}
