// src/components/features/PosterCarousel.tsx
// APIS식 상단 포스터 오토 캐러셀 — 고정 슬라이드(브랜드 배너·대회 포스터) + 예정 대회
// 포스터가 가로 직사각형 카드로 천천히 흐른다.
// · 슬롯 규격(용량 규약, 오너 지시 2026-08-27): 표시 240×112(w-60 h-28) 고정.
//   정적 에셋은 public/banners 원본 960×448 WebP·파일당 ≤120KB, 일정 포스터는
//   thumbUrl(480) 서버 리사이즈로 같은 상한 — 슬라이드가 늘어도 전송량이 붙지 않는다.
// · 고정 슬라이드는 마감 없이 상시 게시(오너 지시) — 날짜 필터는 일정 포스터에만 적용.
//   항상 3장 이상이 확보되므로 캐러셀은 로딩과 무관하게 즉시 그려진다(빈 상태·스켈레톤 없음).
// · 모션: 무한 루프 마퀴(transform 전용) — 모션 헌법의 허용 예외 2종 중 '무한 루프'.
//   호버/터치 중 일시정지, prefers-reduced-motion 은 수동 가로 스크롤로 폴백(index.css).
//   일정 포스터가 뒤늦게 도착하면 트랙 폭이 바뀌므로 key 로 애니메이션을 재시작한다
//   (시작 수 초 내 ~수십 px 리셋 1회 — 진행 중 폭 변경으로 인한 프레임 점프를 막는 쪽을 택함).
// · DAI-2b/6 시그니처: 이 한 곳에만 펠트 그린 텍스처(.felt-hero, 순수 CSS·egress 0)를 깐다.
import { useMemo } from 'react';
import { thumbUrl } from '../../lib/imageUrl';
import type { Schedule } from '../../api/schedules';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type BannerAction = 'roti-community' | 'tools' | 'explore';

/** 오너 게시 고정 슬라이드 — 에셋 규격은 파일 상단 규약 참조 */
const STATIC_SLIDES: { src: string; alt: string; action: BannerAction; title?: string; sub?: string }[] = [
  {
    src: '/banners/poster-roti-0827.webp', alt: '로티 단독 1000만 GTD 대회',
    action: 'roti-community', title: '로티 단독 1000만 GTD', sub: '8/27(목) 17:00 · 로티아레나',
  },
  {
    src: '/banners/poster-masters-8th.webp', alt: '8th 홀덤 마스터스 20억 GTD',
    action: 'roti-community', title: '8th 홀덤 마스터스 20억 GTD', sub: '8/3–10/5 · 야자수 서울센터',
  },
  { src: '/banners/roti-arena.webp', alt: '로티아레나 매장 커뮤니티 바로가기', action: 'roti-community' },
  { src: '/banners/tools.webp', alt: '홀덤 도구 — GTO 트레이너·ICM·타이머', action: 'tools' },
  // ⚠ alt 는 e2e 잠금 문구('전체 일정'·nav 라벨)와 겹치면 안 된다 — 마퀴는 상시 이동이라
  //    셀렉터가 이 버튼을 잡으면 안정성 대기 타임아웃으로 플레이크가 된다.
  { src: '/banners/nuri-holdem.webp', alt: 'NURI HOLDEM — 홀덤 일정 한곳에서', action: 'explore' },
];

type Slide = {
  key: string; src: string; alt: string;
  title?: string; sub?: string;
  onClick: () => void;
};

export default function PosterCarousel({ schedules, onSelect, onBanner }: {
  schedules: Schedule[];
  onSelect: (s: Schedule) => void;
  onBanner: (action: BannerAction) => void;
}) {
  const slides = useMemo<Slide[]>(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const dyn = schedules
      .filter((s) => s.approved && !!s.posterUrl && s.date >= today)
      .sort((a, b) =>
        Number(b.isPremium) - Number(a.isPremium)
        || (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
      .slice(0, 8)
      .map((s): Slide => {
        const d = new Date(s.date);
        return {
          key: `s:${s.id}`, src: thumbUrl(s.posterUrl!, 480) ?? s.posterUrl!, alt: s.title || '대회 포스터',
          title: s.title,
          sub: `${d.getMonth() + 1}/${d.getDate()}(${DAYS_KO[d.getDay()]}) ${s.startTime || ''} · ${s.pubName}`,
          onClick: () => onSelect(s),
        };
      });
    const fixed = STATIC_SLIDES.map((b, i): Slide => ({
      key: `b:${i}`, src: b.src, alt: b.alt, title: b.title, sub: b.sub,
      onClick: () => onBanner(b.action),
    }));
    return [...fixed, ...dyn];
  }, [schedules, onSelect, onBanner]);

  // 고정 슬라이드만으로도 3장 이상 — 항상 루프(2배 복제 + translateX(-50%))
  const track = [...slides, ...slides];

  const card = (s: Slide, i: number) => {
    const dup = i >= slides.length; // 복제 세트는 보조기기·탭 순회에서 숨김
    return (
      <button
        key={`${s.key}:${dup ? 'd' : 'o'}`}
        type="button"
        onClick={s.onClick}
        aria-hidden={dup || undefined}
        tabIndex={dup ? -1 : undefined}
        aria-label={dup ? undefined : s.alt}
        className="relative mr-3 h-28 w-60 shrink-0 overflow-hidden rounded-card border border-border-subtle bg-surface-mid text-left"
      >
        <img
          src={s.src}
          alt=""
          width={480}
          height={224}
          className="h-full w-full object-cover"
          loading={i < 3 ? 'eager' : 'lazy'}
          decoding="async"
        />
        {/* 하단 스크림 — 포스터 위 고정 다크(테마 무관 가독). 자체 텍스트가 있는 브랜드 배너는 생략 */}
        {s.title && (
          <span
            className="absolute inset-x-0 bottom-0 px-2.5 pb-1.5 pt-6"
            style={{ background: 'linear-gradient(to top, rgba(6,8,11,0.92) 25%, transparent)' }}
          >
            <span className="block truncate text-xs font-bold text-white">{s.title}</span>
            {s.sub && (
              <span className="block truncate text-2xs tabular-nums text-white/70">{s.sub}</span>
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="pt-3">
      <div className="felt-hero poster-marquee-viewport overflow-hidden py-2">
        {/* key=슬라이드 수: 일정 포스터 도착 시 1회 재시작(폭 변경 중 점프 방지) */}
        <div key={slides.length} className="poster-marquee flex w-max pl-page-x">
          {track.map(card)}
        </div>
      </div>
    </div>
  );
}
