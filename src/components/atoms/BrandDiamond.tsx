/**
 * BrandDiamond — 오너 C안(2026-10-06) 골드 다이아 심볼, 배경 없음.
 * 원본 1254² PNG 를 알파 기준으로 잘라(705×1006, 투명 여백 0) 높이 48/96/144 의 AVIF·WebP·PNG 로 둔다(public/brand/nuri-diamond-*).
 * 여백이 없어 표시 상자 = 다이아 크기다. width/height 는 표시 크기(CSS px) — 비율 0.7008 을 예약해 CLS 0.
 */
const set = (ext: string) => `/brand/nuri-diamond-48.${ext} 34w, /brand/nuri-diamond-96.${ext} 67w, /brand/nuri-diamond-144.${ext} 101w`;

// 정적 셸(index.html)은 다이아를 data URI 로 인라인한다(받기·디코드 지연으로 글자만 먼저 그려지는 M9-01 방지).
// 헤더(priority)가 **같은 문자열**을 쓰면 셸→React 교체 때 이미 디코드된 이미지를 이어받아 빈 프레임이 없다 —
// 다른 URL(/brand/….avif)을 새로 받으면 교체 순간에 다시 비는 것을 실측했다. 셸이 아직 #root 에 있는 모듈 평가 시점에 한 번 읽는다.
const SHELL_SRC = typeof document === 'undefined' ? null
  : document.querySelector<HTMLImageElement>('#root img[src^="data:image/webp"]')?.getAttribute('src') ?? null;

export default function BrandDiamond({ width, height, className = '', priority = false }: {
  width: number;
  height: number;
  className?: string;
  /** 첫 화면(헤더) — eager + fetchpriority=high */
  priority?: boolean;
}) {
  if (priority && SHELL_SRC) {
    return (
      <picture className={`block ${className}`}>
        <img src={SHELL_SRC} alt="" width={width} height={height} className="block h-full w-auto" draggable={false} decoding="sync" />
      </picture>
    );
  }
  const sizes = `${width}px`;
  // className 은 <picture>(블록 상자)에 준다 — 높이를 정하면 이미지가 비율대로 채운다.
  // ⚠ picture 를 display:contents 로 두면 <source> 두 개가 그리드 칸을 먹어 빈 행 + gap 이 생긴다(SPOT 카드 +2~8px 실측).
  return (
    <picture className={`block ${className}`}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img src="/brand/nuri-diamond-96.png" srcSet={set('png')} sizes={sizes} alt="" width={width} height={height}
        className="block h-full w-auto" draggable={false} decoding="async"
        loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} />
    </picture>
  );
}
