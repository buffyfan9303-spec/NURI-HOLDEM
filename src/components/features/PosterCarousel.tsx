// src/components/features/PosterCarousel.tsx
// APIS식 상단 포스터 오토 캐러셀 — 고정 슬라이드(브랜드 배너·대회 포스터) + 예정 대회
// 포스터가 가로 직사각형 카드로 천천히 흐른다.
// · 슬롯 규격(용량 규약, 오너 지시 2026-08-27): 표시 240×112(w-60 h-28) 고정.
//   포스터 크롭 2종만 래스터(960×448 WebP ≤120KB), 브랜드 배너 4종은 DOM(CSS+실텍스트 —
//   전송 0B·PC 뭉개짐 없음), 일정 포스터는 thumbUrl(480) 서버 리사이즈 상한.
// · 고정 슬라이드는 마감 없이 상시 게시(오너 지시) — 날짜 필터는 일정 포스터에만 적용.
//   항상 3장 이상이 확보되므로 캐러셀은 로딩과 무관하게 즉시 그려진다(빈 상태·스켈레톤 없음).
// · 모션: scrollLeft 기반 자동 진행(rAF ~30px/s) + 유저 가로 스크롤 겸용(오너 지시 —
//   "유저도 스크롤할 수 있게"). 상호작용 시 4초 일시정지 후 재개, 절반 지점 되감기 루프.
//   prefers-reduced-motion 은 자동 진행 없이 수동 스크롤만. 폭이 뒤늦게 늘어도(일정 포스터
//   도착) 스크롤 위치가 유지되므로 재시작 점프가 없다.
// · 배경 없음(오너 지시 2026-08-27): 펠트 띠·패딩 없이 배너 카드만 흐른다. 속도는
//   슬라이드 수 × 8초 — 장수가 늘어도 픽셀 속도 일정(~31px/s).
import { useEffect, useMemo, useRef } from 'react';
import { thumbUrl } from '../../lib/imageUrl';
import type { Schedule } from '../../api/schedules';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type BannerAction = 'roti-community' | 'tools' | 'explore';

/** 오너 게시 고정 포스터 슬라이드(래스터 — 사진성 콘텐츠라 이미지 유지) */
const POSTER_SLIDES: { src: string; alt: string; action: BannerAction; title: string; sub: string }[] = [
  {
    src: '/banners/poster-roti-0827.webp', alt: '로티 단독 1000만 GTD 대회',
    action: 'roti-community', title: '로티 단독 1000만 GTD', sub: '8/27(목) 17:00 · 로티아레나',
  },
  {
    src: '/banners/poster-masters-8th.webp', alt: '8th 홀덤 마스터스 20억 GTD',
    action: 'roti-community', title: '8th 홀덤 마스터스 20억 GTD', sub: '8/3–10/5 · 야자수 서울센터',
  },
];

/** 브랜드 배너 — DOM 렌더(오너 리포트 2026-08-27: PC에서 래스터 글자가 뭉개짐 →
 *  텍스트는 실텍스트로 그려 어떤 배율·DPR에서도 선명하게. 배경은 CSS 그라데이션 + 수트 글리프).
 *  ⚠ 텍스트·aria-label 은 e2e 잠금 문구(nav 라벨 exact·'전체 일정')와 겹치면 안 된다 —
 *    마퀴는 상시 이동이라 셀렉터가 이 버튼을 잡으면 안정성 대기 타임아웃으로 플레이크가 된다.
 *    (탭 진입 스펙들은 nav 스코프 셀렉터라 innerText 'GTO' 포함은 안전.) */
const BRAND_SLIDES: {
  key: string; action: BannerAction; alt: string;
  bg: string; glyph?: string; glyphColor?: string; logo?: string;
  title: string; sub: string; titleColor: string; subColor: string;
}[] = [
  {
    key: 'roti', action: 'roti-community', alt: '로티아레나 매장 커뮤니티 바로가기',
    bg: 'radial-gradient(120% 160% at 0% 50%, #17130a 0%, #050506 62%)',
    logo: '/banners/roti-arena-logo.webp',
    title: '로티아레나', sub: '매장 커뮤니티 ›', titleColor: '#E8D6A0', subColor: '#C4B58A',
  },
  {
    key: 'gto', action: 'tools', alt: 'GTO 도구 — 차트·계산기·트레이너',
    bg: 'linear-gradient(180deg, #131520 0%, #0e101a 100%)', glyph: '♠', glyphColor: '#232a42',
    title: 'GTO 도구', sub: '차트 · 계산기 · 트레이너 ›', titleColor: '#F0F2FA', subColor: '#A9B1E8',
  },
  {
    key: 'mind', action: 'tools', alt: '오늘의 NURI MIND — 매일 한 문제 GTO 트레이닝',
    bg: 'linear-gradient(180deg, #1a162e 0%, #110f20 100%)', glyph: '♥', glyphColor: '#262142',
    title: '오늘의 NURI MIND', sub: '매일 한 문제 · GTO 트레이닝 ›', titleColor: '#EEECFA', subColor: '#B2ACEC',
  },
  {
    key: 'nuri', action: 'explore', alt: 'NURI HOLDEM — 홀덤 일정 한곳에서',
    bg: 'linear-gradient(180deg, #0a2218 0%, #06120d 100%)', glyph: '♦', glyphColor: '#1e3325',
    title: 'NURI HOLDEM', sub: '전국 홀덤 일정, 한곳에서 ›', titleColor: '#D9B25A', subColor: '#DCE4DC',
  },
];
const STATIC_COUNT = POSTER_SLIDES.length + BRAND_SLIDES.length;

type Slide = {
  key: string; alt: string;
  onClick: () => void;
  /* 래스터 슬라이드(포스터) */
  src?: string; title?: string; sub?: string;
  /* DOM 브랜드 슬라이드 */
  brand?: (typeof BRAND_SLIDES)[number];
};

export default function PosterCarousel({ schedules, onSelect, onBanner }: {
  schedules: Schedule[];
  onSelect: (s: Schedule) => void;
  onBanner: (action: BannerAction) => void;
}) {
  const slides = useMemo<Slide[]>(() => {
    const today = new Date().toLocaleDateString('en-CA');
    // 같은 포스터의 연속 회차(기간제 게임)는 첫 회차 1장만 — 마퀴에 동일 카드 도배 방지
    const seenPoster = new Set<string>();
    const dyn = schedules
      .filter((s) => s.approved && !!s.posterUrl && s.date >= today)
      .sort((a, b) =>
        Number(b.isPremium) - Number(a.isPremium)
        || (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
      .filter((s) => !seenPoster.has(s.posterUrl!) && (seenPoster.add(s.posterUrl!), true))
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
    const posters = POSTER_SLIDES.map((b, i): Slide => ({
      key: `p:${i}`, src: b.src, alt: b.alt, title: b.title, sub: b.sub,
      onClick: () => onBanner(b.action),
    }));
    const brands = BRAND_SLIDES.map((b): Slide => ({
      key: `b:${b.key}`, alt: b.alt, brand: b, onClick: () => onBanner(b.action),
    }));
    // 포스터 → 브랜드 순으로 섞어 배치(포스터 2 · 브랜드 4 · 일정 포스터)
    return [posters[0], posters[1], ...brands, ...dyn];
  }, [schedules, onSelect, onBanner]);

  // 고정 슬라이드만으로도 3장 이상 — 항상 루프(2배 복제 + translateX(-50%)).
  // ⚠ 좌측 여백을 트랙의 pl-page-x 로 주면 패딩이 트랙 폭에 포함돼 -50% 지점이
  //    패딩/2 만큼 어긋난다(랩 시 '뚝' 점프 — 오너 실기기 리포트). 여백은 세트 '안'의
  //    스페이서로 넣어 한 세트 주기가 정확히 트랙의 절반이 되게 한다(완전 무이음).

  const card = (s: Slide, i: number, dup: boolean) => {
    // 복제 세트는 보조기기·탭 순회에서 숨김
    const b = s.brand;
    return (
      <button
        key={`${s.key}:${dup ? 'd' : 'o'}`}
        type="button"
        onClick={s.onClick}
        aria-hidden={dup || undefined}
        tabIndex={dup ? -1 : undefined}
        aria-label={dup ? undefined : s.alt}
        className="relative mr-3 h-28 w-60 shrink-0 overflow-hidden rounded-card border border-border-subtle bg-surface-mid text-left"
        style={b ? { background: b.bg } : undefined}
      >
        {b ? (
          <>
            {/* DOM 브랜드 배너 — 텍스트가 래스터가 아니라 어떤 화면에서도 선명(PC 뭉개짐 해결) */}
            {b.glyph && (
              <span aria-hidden className="absolute -right-1 -top-5 select-none text-[100px] font-bold leading-none" style={{ color: b.glyphColor }}>
                {b.glyph}
              </span>
            )}
            {b.logo && (
              <img src={b.logo} alt="" width={144} height={122} loading="eager" decoding="async"
                className="absolute left-2 top-1/2 h-[88px] w-[88px] -translate-y-1/2 object-contain" />
            )}
            <span className={['absolute inset-y-0 right-2.5 flex flex-col justify-center', b.logo ? 'left-[100px]' : 'left-3.5'].join(' ')}>
              <span className="font-display text-[15px] font-extrabold leading-tight" style={{ color: b.titleColor }}>{b.title}</span>
              <span className="mt-0.5 text-2xs font-medium" style={{ color: b.subColor }}>{b.sub}</span>
            </span>
          </>
        ) : (
          <>
            <img
              src={s.src}
              alt=""
              width={480}
              height={224}
              className="h-full w-full object-cover"
              // ⚠ 마퀴 안에서 lazy 는 '빈 배너'가 된다 — transform 이동은 스크롤이 아니라
              //    브라우저 지연 로딩 휴리스틱이 안 깨어난다(오너 실기기 리포트). 고정 슬라이드는
              //    전부 eager, 일정 포스터(thumbUrl 480)만 4장째부터 lazy.
              loading={i < STATIC_COUNT + 3 ? 'eager' : 'lazy'}
              decoding="async"
            />
            {/* 하단 스크림 — 포스터 위 고정 다크(테마 무관 가독) */}
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
          </>
        )}
      </button>
    );
  };

  const set = (dup: boolean) => (
    <>
      <span aria-hidden className="w-page-x shrink-0" />
      {slides.map((s, i) => card(s, i, dup))}
    </>
  );

  // 자동 진행 + 유저 스크롤 겸용(오너 지시 2026-08-27: "유저도 스크롤할 수 있게 — 클릭 유도").
  // 뷰포트가 실제 가로 스크롤러이고, rAF 가 scrollLeft 를 천천히 민다(~30px/s).
  // 터치·휠·드래그가 감지되면 4초 쉬었다 재개. 절반(한 세트) 지나면 -절반으로 되감아 무한 루프.
  // 스크롤 랩은 같은 픽셀의 복제 세트로 점프하므로 눈에는 이어져 보인다.
  const vpRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // 수동 스크롤만
    let raf = 0;
    let pauseUntil = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      if (t > pauseUntil && !document.hidden) {
        const half = vp.scrollWidth / 2;
        if (half > vp.clientWidth) {
          vp.scrollLeft += 30 * dt / 1000;
          if (vp.scrollLeft >= half) vp.scrollLeft -= half;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const pause = () => { pauseUntil = performance.now() + 4000; };
    vp.addEventListener('touchstart', pause, { passive: true });
    vp.addEventListener('wheel', pause, { passive: true });
    vp.addEventListener('pointerdown', pause, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      vp.removeEventListener('touchstart', pause);
      vp.removeEventListener('wheel', pause);
      vp.removeEventListener('pointerdown', pause);
    };
  }, []);

  return (
    <div className="pt-3">
      {/* 오너 지시(2026-08-27): 배너만 — 펠트 배경·어두운 띠 없음. 스크롤바는 숨김 */}
      <div ref={vpRef} className="poster-marquee-viewport scrollbar-none overflow-x-auto">
        <div className="flex w-max">
          {set(false)}
          {set(true)}
        </div>
      </div>
    </div>
  );
}
