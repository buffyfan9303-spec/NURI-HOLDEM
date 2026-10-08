import { useRef, useState } from 'react';
import Icon from '../atoms/Icon';

/**
 * UP-03 장터 상세 사진 — 여러 장을 손가락으로 넘기고(네이티브 scroll-snap), 탭하면 ImageLightbox 로 확대한다.
 * - 레이아웃 고정: 예전과 같은 정사각(sm 이상 4:3) 상자 안에서만 움직인다 — 넘기는 동안 아래 본문이 1px 도 안 밀린다.
 * - 가벼움: 넘김은 브라우저 스크롤(합성 스레드)이 맡는다. JS 는 scroll 이벤트에서 현재 장 번호만 읽는다(RAF 상주·타이머 0).
 * - 한 장이어도 버튼이라 확대가 열린다. 키보드 ←/→ 와 PC 화살표 버튼은 같은 goTo 를 쓴다.
 * - 슬라이드 버튼에 data-no-press: 전역 button:active scale(.97) 이 사진 전체(큰 면적)를 흔들지 않게 뺀다.
 */
export default function ListingGallery({ images, title, onZoom }: { images: string[]; title: string; onZoom: (i: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const count = images.length;
  const many = count > 1;
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    setIdx((p) => (p === i ? p : i));
  };
  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const n = Math.max(0, Math.min(count - 1, i));
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: n * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!many) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(idx - 1); }
  };
  return (
    <div data-listing-gallery className="relative aspect-square sm:aspect-4/3 overflow-hidden bg-surface-mid">
      <div
        ref={trackRef}
        onScroll={many ? onScroll : undefined}
        onKeyDown={onKeyDown}
        role={many ? 'region' : undefined}
        aria-roledescription={many ? '사진 넘기기' : undefined}
        aria-label={many ? `${title} 사진 ${count}장` : undefined}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none"
      >
        {images.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            data-no-press
            data-listing-slide={i}
            onClick={() => onZoom(i)}
            aria-label={many ? `사진 ${i + 1}/${count} 크게 보기` : '사진 크게 보기'}
            className="relative h-full w-full shrink-0 snap-center snap-always focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          >
            <img
              src={src}
              alt={i === 0 ? title : `${title} 사진 ${i + 1}`}
              draggable={false}
              loading={i === 0 ? undefined : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover select-none"
            />
          </button>
        ))}
      </div>
      {many && (
        <>
          {/* 현재 장 — 점은 opacity 만 바뀐다(작은 면적, 150ms 감속 — 기존 유틸만 써서 첫 화면 CSS 증가 0). 숫자는 6장 넘어도 정확하게. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
            {images.slice(0, 8).map((_, i) => (
              <span
                key={i}
                className={[
                  'h-1.5 w-1.5 rounded-full bg-white transition-opacity ease-out motion-reduce:transition-none',
                  i === Math.min(idx, 7) ? 'opacity-100' : 'opacity-50',
                ].join(' ')}
              />
            ))}
          </div>
          <span
            data-listing-counter
            aria-live="polite"
            className="pointer-events-none absolute bottom-2 right-3 rounded-full bg-black/55 px-2 py-0.5 text-2xs font-semibold tabular-nums text-white"
          >
            {idx + 1} / {count}
          </span>
          {/* PC(sm 이상) 넘김 버튼 — 모바일은 손가락 스와이프가 맡는다. 끝에 닿으면 흐려지고(opacity .3) 눌리지 않는다. */}
          <button
            type="button"
            onClick={() => goTo(idx - 1)}
            disabled={idx === 0}
            aria-label="이전 사진"
            className="absolute left-2 top-1/2 z-10 hidden h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-surface-base/55 text-ink-primary backdrop-blur-sm transition-opacity hover:bg-surface-base/80 disabled:pointer-events-none disabled:opacity-30 sm:flex"
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <button
            type="button"
            onClick={() => goTo(idx + 1)}
            disabled={idx === count - 1}
            aria-label="다음 사진"
            className="absolute right-2 top-1/2 z-10 hidden h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-surface-base/55 text-ink-primary backdrop-blur-sm transition-opacity hover:bg-surface-base/80 disabled:pointer-events-none disabled:opacity-30 sm:flex"
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </>
      )}
    </div>
  );
}
