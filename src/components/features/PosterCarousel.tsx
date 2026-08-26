// src/components/features/PosterCarousel.tsx
// APIS식 상단 포스터 오토 캐러셀 — 예정 대회 포스터가 가로 직사각형 카드로 천천히 흐른다.
// · 모션: 무한 루프 마퀴(transform 전용) — 모션 헌법의 허용 예외 2종 중 '무한 루프'.
//   호버/터치 중 일시정지, prefers-reduced-motion 은 수동 가로 스크롤로 폴백(index.css).
// · DAI-2b/6 시그니처: 이 한 곳에만 펠트 그린 텍스처(.felt-hero, 순수 CSS·egress 0)를 깐다.
// · 부스트(isPremium) 우선 → 시작 임박 순. 포스터 없는 대회는 제외. 0건이면 통째로 접힘.
import { useMemo } from 'react';
import { thumbUrl } from '../../lib/imageUrl';
import type { Schedule } from '../../api/schedules';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export default function PosterCarousel({ schedules, loaded, onSelect }: {
  schedules: Schedule[];
  loaded: boolean;
  onSelect: (s: Schedule) => void;
}) {
  const items = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return schedules
      .filter((s) => s.approved && !!s.posterUrl && s.date >= today)
      .sort((a, b) =>
        Number(b.isPremium) - Number(a.isPremium)
        || (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
      .slice(0, 8);
  }, [schedules]);

  // 로딩 중엔 자리를 예약(도착 시 밀림 방지 — MO-7 삽입 규칙), 없음 확정 시에만 접는다
  if (!loaded) {
    return (
      <div className="pt-3" aria-hidden>
        <div className="flex gap-3 overflow-hidden px-page-x">
          <div className="skeleton h-28 w-60 shrink-0 rounded-card" />
          <div className="skeleton h-28 w-60 shrink-0 rounded-card" />
        </div>
      </div>
    );
  }
  if (items.length === 0) return null;

  // 3장 이상일 때만 루프(2배 복제 + translateX(-50%)) — 적으면 정적 가로 스크롤
  const looping = items.length >= 3;
  const track = looping ? [...items, ...items] : items;

  const card = (s: Schedule, i: number) => {
    const dup = i >= items.length; // 복제 세트는 보조기기·탭 순회에서 숨김
    const d = new Date(s.date);
    return (
      <button
        key={`${s.id}:${i}`}
        type="button"
        onClick={() => onSelect(s)}
        aria-hidden={dup || undefined}
        tabIndex={dup ? -1 : undefined}
        className="relative mr-3 h-28 w-60 shrink-0 overflow-hidden rounded-card border border-border-subtle bg-surface-mid text-left"
      >
        <img
          src={thumbUrl(s.posterUrl!, 480)}
          alt=""
          className="h-full w-full object-cover"
          loading={i < 3 ? 'eager' : 'lazy'}
          decoding="async"
        />
        {/* 하단 스크림 — 포스터 위 고정 다크(테마 무관 가독) */}
        <span
          className="absolute inset-x-0 bottom-0 px-2.5 pb-1.5 pt-6"
          style={{ background: 'linear-gradient(to top, rgba(6,8,11,0.92) 25%, transparent)' }}
        >
          <span className="block truncate text-xs font-bold text-white">{s.title}</span>
          <span className="block truncate text-2xs tabular-nums text-white/70">
            {d.getMonth() + 1}/{d.getDate()}({DAYS_KO[d.getDay()]}) {s.startTime || ''} · {s.pubName}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="pt-3">
      <div className="felt-hero poster-marquee-viewport overflow-hidden py-2">
        <div className={looping ? 'poster-marquee flex w-max pl-page-x' : 'flex overflow-x-auto scrollbar-none pl-page-x'}>
          {track.map(card)}
        </div>
      </div>
    </div>
  );
}
