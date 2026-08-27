// src/components/features/PosterCarousel.tsx
// APIS식 상단 포스터 오토 캐러셀 — 고정 슬라이드(브랜드 배너·대회 포스터) + 예정 대회
// 포스터가 화면 가로를 꽉 채우는 풀폭 1장 배너로 흐른다.
// · 슬롯 규격(오너 지시 2026-08-27 4차): 카드 폭 = 스크롤러 clientWidth(w-full — 100vw 는
//   PC 세로 스크롤바에서 가로 오버플로라 금지), 높이 = aspect 960/448(래스터 원본 비율 그대로 —
//   어떤 기종에서도 크롭 0), 카드 간 여백 0. PC(lg+)는 풀폭이 과대해져 '스크롤러 자체'를
//   max-w-[512px] 중앙 정렬로 캡(512×448/960≈239px ≤ 240px 캡) — 카드는 여전히 w-full 이라
//   스텝 = clientWidth 불변식이 전 기종 단일 코드로 유지되고 비율 크롭도 없다.
//   포스터 크롭 2종만 래스터(960×448 WebP ≤120KB), 브랜드 배너 4종은 DOM(CSS+실텍스트 —
//   전송 0B·PC 뭉개짐 없음), 일정 포스터는 thumbUrl(960) 서버 리사이즈 상한(풀폭 확대에 맞춤 —
//   구 224px 슬롯 시절의 480 상한은 폐기).
// · 고정 슬라이드는 마감 없이 상시 게시(오너 지시) — 날짜 필터는 일정 포스터에만 적용.
//   항상 3장 이상이 확보되므로 캐러셀은 로딩과 무관하게 즉시 그려진다(빈 상태·스켈레톤 없음).
// · 모션: APIS식 스텝 캐러셀 — 3.2초 정지 후 카드 한 장씩 rAF 트윈 이동(--ease 동일 곡선 420ms,
//   구 UA smooth 는 프레임 제어 불가로 교체 — 오너 지시 3차·5차) + 유저 가로 스크롤 겸용
//   (상호작용 시 6초 정지 + 트윈 즉시 취소, 양방향 무한 랩).
//   prefers-reduced-motion 은 자동 스텝 없이 수동 스크롤만.
// · 배경 없음(오너 지시 2026-08-27): 펠트 띠·패딩 없이 배너 카드만 흐른다.
import { useEffect, useMemo, useRef } from 'react';
import { thumbUrl } from '../../lib/imageUrl';
import type { Schedule } from '../../api/schedules';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

// --ease(cubic-bezier(0.32,0.72,0,1)) 의 JS 평가 — 앱 유일 곡선(모션 헌법 §20.4)을 그대로 쓴다.
// 기존 코드베이스에 JS 이징 헬퍼 없음(SlidingPill 은 CSS transition) — 로컬 함수로 둔다.
// x(진행 시간 0..1) → t 를 뉴턴 5회로 풀고(발산 시 이분 20회 폴백), y(진행 거리)를 돌려준다.
const EASE = (() => {
  const x1 = 0.32, y1 = 0.72, x2 = 0, y2 = 1;
  const ax = 1 - 3 * x2 + 3 * x1, bxc = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1, byc = 3 * y2 - 6 * y1, cy = 3 * y1;
  const sampleX = (t: number) => ((ax * t + bxc) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + byc) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bxc) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 5; i++) {
      const d = slopeX(t);
      if (d < 1e-6) break;
      t -= (sampleX(t) - x) / d;
    }
    if (t < 0 || t > 1 || Math.abs(sampleX(t) - x) > 1e-4) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; if (sampleX(t) < x) lo = t; else hi = t; }
    }
    return sampleY(t);
  };
})();

/** 자동 스텝 트윈 길이(ms) — 카드 1장 이동에 딱 맞는 짧은 감속. duration 토큰은 최대 .26s(panel)라
 *  화면폭 이동에는 부족 — §20.4 예외가 아니라 '거리에 맞춘 스크롤 트윈'으로 오너 승인 범위(사유 보고). */
const STEP_MS = 420;

export type BannerAction = 'roti-community' | 'tools' | 'explore' | 'nurimind';

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
  /* gto·mind·nuri 배경 — 어워드 레퍼런스(DatawizzAI) 오로라 문법(2026-08-27): 딥 그라운드 위
     저채도 바이올렛 빔 + 슬라이드 고유 힌트(gto 블루 · mind 마젠타 · nuri 는 골드가 주인공이라
     배경만 딥 플럼). 정적 CSS 그라데이션 — 애니메이션 없음. 대비 실측(피크 최악 겹침 기준):
     gto title 10.96/sub 5.92 · mind 10.21/5.67 · nuri 6.74/10.41 — 전부 AA 이상. */
  {
    key: 'gto', action: 'tools', alt: 'GTO 도구 — 차트·계산기·트레이너',
    bg: 'radial-gradient(140% 180% at 82% -20%, rgba(130,177,255,0.12) 0%, transparent 55%), radial-gradient(150% 200% at 8% 110%, rgba(128,95,218,0.16) 0%, transparent 60%), linear-gradient(180deg, #131520 0%, #0e101a 100%)',
    glyph: '♠', glyphColor: '#232a42',
    title: 'GTO 도구', sub: '차트 · 계산기 · 트레이너 ›', titleColor: '#F0F2FA', subColor: '#A9B1E8',
  },
  {
    key: 'mind', action: 'nurimind', alt: 'NURI MIND — nurimind.co.kr 바로가기',
    bg: 'radial-gradient(140% 180% at 85% -15%, rgba(224,130,255,0.12) 0%, transparent 55%), radial-gradient(150% 200% at 8% 110%, rgba(128,95,218,0.16) 0%, transparent 60%), linear-gradient(180deg, #1a162e 0%, #110f20 100%)',
    glyph: '♥', glyphColor: '#262142',
    title: '오늘의 NURI MIND', sub: '매일 한 문제 · GTO 트레이닝 ›', titleColor: '#EEECFA', subColor: '#B2ACEC',
  },
  {
    key: 'nuri', action: 'explore', alt: 'NURI HOLDEM — 홀덤 일정 한곳에서',
    bg: 'radial-gradient(140% 180% at 85% -15%, rgba(224,130,255,0.07) 0%, transparent 55%), radial-gradient(150% 200% at 10% 110%, rgba(128,95,218,0.18) 0%, transparent 60%), linear-gradient(180deg, #151221 0%, #0d0b18 100%)',
    glyph: '♦', glyphColor: '#2A2247',
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
          key: `s:${s.id}`, src: thumbUrl(s.posterUrl!, 960) ?? s.posterUrl!, alt: s.title || '대회 포스터',
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

  // 고정 슬라이드만으로도 3장 이상 — 항상 루프(2배 복제 + scrollLeft ±half 랩).
  // ⚠ 풀폭 전환으로 세트 안 w-page-x 스페이서는 제거 — 카드 폭 = clientWidth 라 세트 폭이
  //    정확히 N×clientWidth 가 되어야 half 경계·snap 경계·스텝 경계가 전부 일치한다.
  //    (구 224px 슬롯 시절엔 좌측 여백 스페이서를 세트 '안'에 넣어 -50% 지점을 맞췄다 —
  //    트랙 패딩으로 주면 랩 시 '뚝' 점프, 오너 실기기 리포트. 그 함정은 스페이서 제거로 소멸.)

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
        // 오너 지시(2026-08-27 4차): 풀폭 1장 — w-full(=스크롤러 clientWidth) × aspect 960/448.
        // 풀블리드 배너라 rounded 는 카드가 아니라 lg 캡 상태의 뷰포트에만(모바일은 모서리 없음).
        className="relative aspect-[960/448] w-full shrink-0 snap-start overflow-hidden border border-border-subtle bg-surface-mid text-left"
        style={b ? { background: b.bg } : undefined}
      >
        {b ? (
          <>
            {/* DOM 브랜드 배너 — 텍스트가 래스터가 아니라 어떤 화면에서도 선명(PC 뭉개짐 해결).
                풀폭 전환(4차)으로 글리프·로고·타이포 스케일 상향 — 카피는 불변. */}
            {b.glyph && (
              <span aria-hidden className="absolute -right-2 -top-7 select-none text-[150px] font-bold leading-none" style={{ color: b.glyphColor }}>
                {b.glyph}
              </span>
            )}
            {b.logo && (
              <img src={b.logo} alt="" width={144} height={122} loading="eager" decoding="async"
                className="absolute left-5 top-1/2 h-[112px] w-[112px] -translate-y-1/2 object-contain" />
            )}
            <span className={['absolute inset-y-0 right-5 flex flex-col justify-center', b.logo ? 'left-[150px]' : 'left-6'].join(' ')}>
              <span className="font-display text-xl font-extrabold leading-tight" style={{ color: b.titleColor }}>{b.title}</span>
              <span className="mt-1 text-[13px] font-medium" style={{ color: b.subColor }}>{b.sub}</span>
            </span>
          </>
        ) : (
          <>
            <img
              src={s.src}
              alt=""
              width={960}
              height={448}
              className="h-full w-full object-cover"
              // ⚠ 마퀴 안에서 lazy 는 '빈 배너'가 된다 — transform 이동은 스크롤이 아니라
              //    브라우저 지연 로딩 휴리스틱이 안 깨어난다(오너 실기기 리포트). 고정 슬라이드는
              //    전부 eager, 일정 포스터(thumbUrl 960)만 4장째부터 lazy.
              loading={i < STATIC_COUNT + 3 ? 'eager' : 'lazy'}
              decoding="async"
            />
            {/* 하단 스크림 — 포스터 위 고정 다크(테마 무관 가독) */}
            {s.title && (
              <span
                className="absolute inset-x-0 bottom-0 px-4 pb-2.5 pt-8"
                style={{ background: 'linear-gradient(to top, rgba(6,8,11,0.92) 25%, transparent)' }}
              >
                <span className="block truncate text-[15px] font-bold text-white">{s.title}</span>
                {s.sub && (
                  <span className="block truncate text-xs tabular-nums text-white/70">{s.sub}</span>
                )}
              </span>
            )}
          </>
        )}
      </button>
    );
  };

  // 풀폭 전환으로 세트 = 카드 나열뿐(스페이서 없음) — 세트 폭이 정확히 N×카드 폭.
  const set = (dup: boolean) => slides.map((s, i) => card(s, i, dup));

  // APIS식 스텝 캐러셀(오너 지시 2026-08-27 3차: "물 흐르듯 말고 잠깐 멈췄다 한 칸씩").
  // 3.2초마다 카드 한 장 폭만큼 smooth 스크롤 + 유저 가로 스크롤 겸용(상호작용 시 6초 정지).
  // 랩(양방향 무한): 절반 경계를 넘으면 같은 픽셀의 반대쪽 세트로 즉시 되감아 끝없이 돈다.
  // 스텝 폭 = 첫 카드 실측(getBoundingClientRect — 서브픽셀 포함). 상수 224 는 폐기 —
  // 풀폭 카드는 기종·리사이즈마다 폭이 다르므로 스텝 '시점'마다 재실측한다(옵저버 불요).
  const vpRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const wrap = () => {
      const half = vp.scrollWidth / 2;
      const w = vp.clientWidth; // 카드 폭 = clientWidth(w-full) — 스크롤 이벤트 핫패스라 실측 대신 이걸 쓴다
      if (half <= w) return;
      // ⚠ 우측 랩 임계 = half + 카드 1장 — 풀폭 전환으로 half 가 정확히 카드·snap 경계가 되면서
      //   구식 (>=half → −half) ↔ (<=0 → +half) 짝은 0↔half 를 서로 되던지는 무한 스크롤 이벤트
      //   루프가 됐다(같은 픽셀이라 눈엔 안 보이고 메인스레드만 영원히 돈다 — 브라우저 실측.
      //   구 레이아웃은 세트 안 스페이서 탓에 half 가 경계가 아니라서 도달 불가였을 뿐).
      //   half+w 에서 −half 하면 w(>0), 0 에서 +half 하면 half(<half+w) — 어느 랩도 반대쪽
      //   임계를 못 건드려 진동이 원천 차단된다. 자동 스텝의 최대 타깃도 half+w 라 랩이
      //   '비행 중'이 아닌 '착지 후'에만 일어난다(smooth 취소 → snap 역행 없음). 랩 전후는
      //   복제 세트의 같은 카드라 픽셀 동일 — 텔레포트는 보이지 않는다.
      if (vp.scrollLeft >= half + w) vp.scrollLeft -= half;
      else if (vp.scrollLeft <= 0) vp.scrollLeft += half;
    };
    vp.addEventListener('scroll', wrap, { passive: true });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => vp.removeEventListener('scroll', wrap); // 자동 스텝 없이 수동만(랩은 유지)
    }
    // 자동 스텝 = rAF 트윈(구 scrollTo smooth 교체 — 오너 리포트 2026-08-27 '프레임이 낮다').
    // UA smooth 는 곡선·듀레이션 제어 불가 + 풀폭 960px 페인트와 겹치면 뚝뚝해 보였다.
    // scrollLeft 를 --ease 동일 곡선으로 STEP_MS 트윈. ⚠ snap-x mandatory 컨테이너는
    // 프로그램적 scrollLeft 대입도 '스크롤 조작'이라 UA 가 중간 프레임을 snap 경계로 되당길 수
    // 있다(스펙상 허용) — 트윈 동안만 인라인 scroll-snap-type:none 으로 해제하고 착지 후 복원.
    // 착지점 = 정확한 카드 경계(N×w)라 복원 순간 snap 재정착 이동 0(시각 점프 없음).
    // (대안이던 'smooth 유지'는 원인 그 자체, '트랙 transform 트윈'은 수동 스크롤·랩과 좌표계가
    //  갈라져 기각 — scrollLeft 트윈 + snap 일시 해제가 유일하게 랩 로직 불변으로 안전.)
    let tweenRaf = 0;
    const cancelTween = () => {
      if (!tweenRaf) return;
      cancelAnimationFrame(tweenRaf);
      tweenRaf = 0;
      vp.style.scrollSnapType = ''; // 수동 조작으로 넘어갈 땐 snap 즉시 복원
    };
    const tweenTo = (from: number, to: number) => {
      cancelTween();
      const t0 = performance.now();
      vp.style.scrollSnapType = 'none';
      const frame = (now: number) => {
        const p = Math.min((now - t0) / STEP_MS, 1);
        vp.scrollLeft = from + (to - from) * EASE(p);
        if (p < 1) { tweenRaf = requestAnimationFrame(frame); return; }
        tweenRaf = 0;
        vp.style.scrollSnapType = ''; // 착지 = 카드 경계 — 복원해도 재정착 이동 없음
      };
      tweenRaf = requestAnimationFrame(frame);
    };
    let pauseUntil = 0;
    const pause = () => { pauseUntil = performance.now() + 6000; cancelTween(); }; // 수동 스와이프 감지 → 트윈 즉시 취소
    const step = window.setInterval(() => {
      if (document.hidden || performance.now() < pauseUntil) return;
      if (vp.scrollWidth / 2 <= vp.clientWidth) return;
      const w = vp.querySelector<HTMLElement>('button')?.getBoundingClientRect().width || vp.clientWidth;
      if (!w) return; // 탭 keep-alive 로 display:none 인 동안은 0 — 스텝 무의미
      // 유저가 손으로 어중간하게 세워도 다음 카드 '경계'로 정렬해 이동(스냅 감각).
      // ⚠ round(≠floor): snap 정착점이 경계 ±서브픽셀이라 floor 는 '경계-ε'에서
      //   같은 경계를 재타깃해 한 사이클 제자리걸음이 된다 — round 로 현재 인덱스를 잡는다.
      //   랩 유지 위치(≤ half)에서 타깃 최대치는 half + w — 착지 직후 wrap 이 w 로 되감는다
      //   (트윈은 단조 증가라 중간 프레임이 half+w 임계를 먼저 건드릴 수 없다 — 랩은 착지 후에만).
      const target = (Math.round(vp.scrollLeft / w) + 1) * w;
      tweenTo(vp.scrollLeft, target);
    }, 3200);
    vp.addEventListener('touchstart', pause, { passive: true });
    vp.addEventListener('wheel', pause, { passive: true });
    vp.addEventListener('pointerdown', pause, { passive: true });
    return () => {
      window.clearInterval(step);
      cancelTween();
      vp.removeEventListener('scroll', wrap);
      vp.removeEventListener('touchstart', pause);
      vp.removeEventListener('wheel', pause);
      vp.removeEventListener('pointerdown', pause);
    };
  }, []);

  return (
    <div className="pt-3">
      {/* 오너 지시(2026-08-27): 배너만 — 펠트 배경·어두운 띠 없음. 스크롤바는 숨김.
          snap-x mandatory: 수동 스와이프 1장 정렬 전담 — 자동 스텝(rAF 트윈)은 트윈 동안만
          인라인 scroll-snap-type:none 으로 해제하고 카드 경계(N×clientWidth)에 착지 후 복원(점프 0).
          lg 캡: 스크롤러 자체를 512px 중앙 정렬(≈239px 높이) — 카드 w-full 불변식 유지.
          트랙은 w-max 금지 — 카드 w-full(%)가 스크롤러 폭에 대해 확정 해석되려면
          트랙 폭 = 스크롤러 content 폭이어야 한다(w-max 면 순환 참조로 깨짐). */}
      <div ref={vpRef} className="poster-marquee-viewport scrollbar-none snap-x snap-mandatory overflow-x-auto lg:mx-auto lg:max-w-[512px] lg:rounded-card">
        <div className="flex">
          {set(false)}
          {set(true)}
        </div>
      </div>
    </div>
  );
}
