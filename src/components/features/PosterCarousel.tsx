// src/components/features/PosterCarousel.tsx
// 홈 상단 **프로모션 배너** — 관리자 등록 배너(home_banners) + 브랜드 슬라이드.
//
// 2026-09-13 §6-2 재구성. 바뀐 계약 세 가지와 그 이유:
//
//  ① **높이가 비율이 아니라 값이다.** 예전엔 `aspect-[960/448]`(2.143:1) 이라 폭이 커질수록 높이가 같이
//     커졌다 — 390px 에서 166px, 캡을 풀면 PC 에서 500px 을 넘는다. §6-2 는 배너 높이를 모바일
//     104~116px · PC 180~220px 로 못박는다(홈 첫 화면을 배너 하나가 먹지 않게). 그래서 **공통 프레임**에
//     `min-h` 를 주고 트랙의 flex stretch 로 **모든 슬라이드가 같은 높이**를 갖게 한다.
//     `min-h` 라서 글자 확대로 내용이 커지면 프레임이 같이 늘어난다(고정 높이 잘림 없음).
//
//  ② **일정 포스터는 더 이상 여기 없다.** 세로 포스터를 2:1 배너 비율에 우겨 넣으면 크롭이 생긴다
//     (§6-2: "포스터 전체 정보가 중요한 콘텐츠는 배너 비율에 억지로 잘라 넣지 않는다. 포스터는
//     추천 카드 또는 상세에서 원본 비율로 볼 수 있게 한다"). 같은 대회·같은 `onSelect` 목적지가
//     HomeTab 의 '추천 대회' 가로 레일로 옮겨 갔다 — **사라진 진입점은 없다**.
//
//  ③ **자동 넘김을 쓰지 않는다**(§6-2: "자동 넘김은 기본 사용하지 않는다"). 3.2초 인터벌 + rAF 트윈
//     (EASE/STEP_MS/tweenTo/pause)이 통째로 빠졌다. 읽는 중 글자가 도망가지 않고, reduced-motion
//     분기·탭 비활성 분기·상호작용 정지 타이머가 **존재할 이유 자체가 없어진다**.
//     수동 스와이프·휠·드래그·스냅·양방향 무한 랩은 그대로다(2배 복제 + scrollLeft ±half).
//
//  ④ **PC 512px 중앙 캡 제거.** 캡은 ①의 비율 때문에 생긴 것이었다(풀폭 PC = 500px 배너).
//     높이가 값으로 고정된 지금은 필요 없고, `(hover:hover)+(pointer:fine)` 미디어가 **모바일 폭에서도**
//     공통 여백(mx-page-x)을 mx-auto 로 덮어 입력 방식마다 여백이 달라지던 문제도 같이 사라진다.
//     폭은 **컨테이너**(HomeTab 의 max-w-[1200px] 두 칸 그리드)가 정한다.
//
// 유지: 카드 폭 = 스크롤러 clientWidth(w-full) 불변식 — 랩·스냅·스텝 경계가 전부 여기에 걸려 있다.
//       트랙에 gap 을 넣거나 카드마다 폭을 달리하면 정착 위치가 깨진다. 여백은 **트랙 바깥**에 둔다.
//       링크 없는 배너는 <div> 로 그린다(죽은 버튼 금지). 관리자 배너의 활성·정렬·기간 규칙은 API 담당.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { thumbUrl } from '../../lib/imageUrl';
import Icon from '../atoms/Icon';
import type { HomeBanner } from '../../api/homeBanners';

export type BannerAction = 'tools' | 'explore' | 'nurimind';

// 하드코딩 포스터(로티 단독 1000만 GTD · 8th 홀덤 마스터스)와 로티아레나 브랜드 슬라이드는 2026-09-10 런칭 정리로
// 제거했다(오너 지시 "포스터 배너 로티 및 wpl 다 지워"). 고정 포스터 자리는 **관리자 등록 배너(home_banners)만** 쓴다 —
// 비어 있으면 브랜드 슬라이드로만 돈다. 폴백 포스터를 다시 넣지 않는다(지웠는데 되살아나는 것이 사고다).

/** 브랜드 배너 — DOM 렌더(오너 리포트 2026-08-27: PC에서 래스터 글자가 뭉개짐 →
 *  텍스트는 실텍스트로 그려 어떤 배율·DPR에서도 선명하게. 배경은 CSS 그라데이션 + 수트 글리프).
 *  ⚠ 텍스트·aria-label 은 e2e 잠금 문구(nav 라벨 exact·'전체 일정')와 겹치면 안 된다.
 *
 *  2026-09-13 — **'GTO 도구' 슬라이드를 뺐다.** §6-1: "같은 GTO 설명을 거대한 히어로와 또 다른 대형
 *  카드에서 반복하지 않는다. GTO 진입은 한 곳으로 합친다." 홈의 GTO 진입은 이제 하단 'GTO 도구' 줄
 *  하나뿐이다(`onTools` — 목적지 동일).
 *
 *  2026-09-13 — **NURI MIND 부제를 목적지에 맞췄다.** 부제가 '매일 한 문제 · GTO 트레이닝' 이었는데
 *  실제 목적지는 외부 nurimind.co.kr(오늘의 운세)이다. 같은 서비스를 HomeTab 날짜 줄은 '오늘의 운을
 *  점쳐보세요', CustomerDashboardPage 는 '오늘의 운세'라고 부른다 — 여기만 어긋나 있었고, 우리가
 *  제공하지 않는 기능(GTO 트레이닝)으로 유도하고 있었다. 외부 이동이라는 사실도 부제에 적는다. */
const BRAND_SLIDES: {
  key: string; action: BannerAction; alt: string;
  bg: string;
  /** 2026-09-14 오너 지시 — 관리자 배너와 같은 '아트워크 + 왼쪽 스크림 + 글자' 구조로 통일.
   *  ⚠ 아트워크에는 **글자를 넣지 않는다**(제목·부제는 아래 DOM 이 그린다 — 두 벌로 겹치면 안 된다).
   *  ⚠ 볼거리는 오른쪽에 두되 **오른쪽 끝 ~200px(1200 기준)은 비운다** — 모바일(390×110)의
   *     object-cover 가 좌우를 각 80px(원본 175px) 잘라내 끝에 붙인 그림이 잘린다(실측 2026-09-14). */
  img: string;
  title: string; sub: string; titleColor: string; subColor: string;
}[] = [
  /* 배경 — 딥 그라운드 위 저채도 바이올렛 빔(정적 CSS 그라데이션, 애니메이션 없음).
     대비 실측(피크 최악 겹침 기준): mind title 10.21/sub 5.67 · nuri 6.74/10.41 — 전부 AA 이상. */
  {
    key: 'mind', action: 'nurimind', alt: '오늘의 NURI MIND · 외부 사이트 nurimind.co.kr 에서 오늘의 운세 보기',
    bg: 'radial-gradient(140% 180% at 85% -15%, rgba(224,130,255,0.12) 0%, transparent 55%), radial-gradient(150% 200% at 8% 110%, rgba(128,95,218,0.16) 0%, transparent 60%), linear-gradient(180deg, #1a162e 0%, #110f20 100%)',
    img: '/banners/mind.webp',
    title: '오늘의 NURI MIND', sub: '오늘의 운세 보기 · 외부 사이트 ›', titleColor: '#EEECFA', subColor: '#B2ACEC',
  },
  {
    key: 'nuri', action: 'explore', alt: 'NURI HOLDEM · 전국 홀덤 일정 한곳에서 보기',
    bg: 'radial-gradient(140% 180% at 85% -15%, rgba(224,130,255,0.07) 0%, transparent 55%), radial-gradient(150% 200% at 10% 110%, rgba(128,95,218,0.18) 0%, transparent 60%), linear-gradient(180deg, #151221 0%, #0d0b18 100%)',
    img: '/banners/nuri.webp',
    title: 'NURI HOLDEM', sub: '전국 홀덤 일정, 한곳에서 ›', titleColor: '#D9B25A', subColor: '#DCE4DC',
  },
];

/** N06(2026-09-13, 실행문 §7.1): 홈 이벤트 진입을 **이 캐러셀 안의 DOM 슬라이드**로 — 독립 카드(home-event-banner/menu)를 없앤다.
 *  이미지 없는 DOM 슬라이드다(가짜 이미지 URL·home_banners 행을 만들지 않는다 — §7.1-6). 판정은 HomeTab 이 evaluateEvent 로 하고
 *  여기는 받은 문구만 그린다: `live` 가 참일 때만 강조 배경 — 참여 가능 상태를 거짓 표시하지 않는다(§7.1-2·4). */
export interface EventSlide {
  /** 이벤트 제목(live) 또는 '매장 이벤트' 같은 안내 제목 */
  title: string;
  /** 상태 한 줄 — '진행 중' 허위 문구 금지는 HomeTab 의 eventMenuSubtitle 이 지킨다 */
  sub: string;
  alt: string;
  /** e2e 계약: 'home-event-banner'(참여 가능) | 'home-event-menu'(그 밖) */
  testId: 'home-event-banner' | 'home-event-menu';
  live: boolean;
  /** 응답 전 — 문구는 '불러오는 중…' 이고 그래도 누를 수 있다 */
  pending?: boolean;
  onClick: () => void;
}

type Slide = {
  key: string; alt: string;
  /** 없으면 클릭 목적지가 없는 슬라이드다 — 버튼이 아니라 그림으로 그린다(죽은 버튼 금지). */
  onClick?: () => void;
  /* 래스터 슬라이드(관리자 배너) */
  src?: string; title?: string; sub?: string;
  /* DOM 브랜드 슬라이드 */
  brand?: (typeof BRAND_SLIDES)[number];
  /* DOM 이벤트 슬라이드(N06) */
  event?: EventSlide;
};

export default function PosterCarousel({ onBanner, banners = [], onBannerUrl, eventSlide = null, showBrand = true }: {
  onBanner: (action: BannerAction) => void;
  /** 관리자 등록 배너(home_banners) 중 **지금 게재 중인 것**. 비어 있으면 브랜드 슬라이드만 돈다(폴백 없음). */
  banners?: HomeBanner[];
  onBannerUrl?: (url: string) => void;
  /** N06: 이벤트 진입 슬라이드 — 관리자 배너 뒤·브랜드 슬라이드 앞(§7.1-3: 관리자/광고 순서는 그대로). null 이면 없음. */
  eventSlide?: EventSlide | null;
  /** 관리자 스위치(app_settings.home_slide_brand). false 면 브랜드 2장을 빼고 돈다.
   *  🔴 2026-09-18 오너 요청 — 종전엔 코드 고정이라 노출관리에서 끌 수 없었다.
   *  ⚠ 기본 true. 세 종류가 전부 꺼지면 슬라이드가 0장이고, 그때 이 컴포넌트는 **자리까지** 비운다(n===0 → null). */
  showBrand?: boolean;
}) {
  const slides = useMemo<Slide[]>(() => {
    // 관리자 배너가 앞에 선다 — 등록 순서(sort_order)·활성·기간 판정은 api/homeBanners 가 이미 걸렀다.
    // ⚠ 링크 없는 배너는 **누를 수 없어야 한다**(2026-09-11). 관리 화면에서 링크는 '선택' 이라
    //   실제로 빈 배너가 등록될 수 있다. 목적지가 없으면 배너는 그냥 '보는 것' 으로 둔다.
    const posters: Slide[] = banners.map((b): Slide => ({
      key: `db:${b.id}`, src: b.imageUrl, alt: b.title || '배너', title: b.title, sub: b.subtitle,
      onClick: b.linkUrl ? () => onBannerUrl?.(b.linkUrl) : undefined,
    }));
    const events: Slide[] = eventSlide ? [{ key: 'ev:home', alt: eventSlide.alt, event: eventSlide, onClick: eventSlide.onClick }] : [];
    const brands = showBrand ? BRAND_SLIDES.map((b): Slide => ({
      key: `b:${b.key}`, alt: b.alt, brand: b, onClick: () => onBanner(b.action),
    })) : [];
    return [...posters, ...events, ...brands];
  }, [onBanner, banners, onBannerUrl, eventSlide, showBrand]);

  const n = slides.length;
  const multi = n > 1;
  const vpRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  // §7.1-9: 데이터가 늦게 도착해 슬라이드 수가 변하면 현재 인덱스를 유효 범위로 맞춘다(점 표시·aria-current 가 없는 장을 가리키지 않게).
  useEffect(() => { if (idx >= n) setIdx(Math.max(0, n - 1)); }, [n, idx]);

  // ── 무한 랩 + 현재 장 추적 ────────────────────────────────────────────────
  // 자동 스텝이 사라져 이 effect 가 하는 일은 둘뿐이다: 경계 랩, 그리고 점 표시용 인덱스.
  // 기하는 캐시한다(스크롤 핫패스에서 scrollWidth/clientWidth 를 읽으면 write→read 스래싱이 난다 —
  // 2026-08-29 실측, 탭 전환 구간 프레임 39.5ms). 관찰자는 플래그만 세우고 측정은 지연 실행한다.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp || !multi) return;
    const track = vp.firstElementChild as HTMLElement | null;
    let vpW = 0, trackW = 0, geoDirty = true;
    const markGeoDirty = () => { geoDirty = true; };
    const geo = () => {
      if (!geoDirty) return;
      geoDirty = false;
      vpW = vp.clientWidth;
      trackW = vp.scrollWidth;
    };
    let ro: ResizeObserver | undefined;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(markGeoDirty); ro.observe(vp); }
    let mo: MutationObserver | undefined;
    if (track && 'MutationObserver' in window) { mo = new MutationObserver(markGeoDirty); mo.observe(track, { childList: true }); }
    window.addEventListener('resize', markGeoDirty);

    let raf = 0;
    const onScroll = () => {
      geo();
      const half = trackW / 2;
      const w = vpW; // 카드 폭 = clientWidth(w-full)
      if (w > 0 && half > w) {
        // ⚠ 우측 임계 = half + 카드 1장. (>=half → −half) ↔ (<=0 → +half) 짝은 0↔half 를 서로
        //   되던지는 무한 스크롤 이벤트 루프가 된다(같은 픽셀이라 눈엔 안 보이고 메인스레드만 돈다).
        if (vp.scrollLeft >= half + w) vp.scrollLeft -= half;
        else if (vp.scrollLeft <= 0) vp.scrollLeft += half;
      }
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!w) return;
        const i = ((Math.round(vp.scrollLeft / w) % n) + n) % n;
        setIdx((prev) => (prev === i ? prev : i));
      });
    };
    vp.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', markGeoDirty);
      vp.removeEventListener('scroll', onScroll);
    };
  }, [multi, n]);

  /** 점·화살표 이동 — UA 스무스 스크롤에 맡긴다(자체 트윈 없음 → 관성과 싸우지 않는다). */
  const go = useCallback((delta: number) => {
    const vp = vpRef.current;
    if (!vp) return;
    const w = vp.clientWidth;
    if (!w) return;
    // ⚠ 마운트 직후 scrollLeft 는 **0**이다. 여기서 '이전'을 누르면 음수로 클램프되어
    //   스크롤 이벤트조차 안 나고 → 랩도 안 돌아 **첫 장에서 '이전'이 먹통**이 된다.
    //   (자동 넘김이 있던 시절엔 위치가 알아서 밀려 있어 드러나지 않던 자리다.)
    //   왼쪽으로 갈 자리가 없으면 **먼저 복제 세트의 같은 픽셀로 옮겨 둔다** — 화면은 그대로다.
    const half = vp.scrollWidth / 2;
    let from = vp.scrollLeft;
    if (delta < 0 && from <= 0 && half > w) { vp.scrollLeft = half; from = half; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    vp.scrollTo({ left: from + delta * w, behavior: reduced ? 'auto' : 'smooth' });
  }, []);
  const goTo = useCallback((i: number) => {
    const vp = vpRef.current;
    if (!vp) return;
    const w = vp.clientWidth;
    if (!w) return;
    const cur = ((Math.round(vp.scrollLeft / w) % n) + n) % n;
    go(i - cur);
  }, [go, n]);

  const card = (s: Slide, i: number, dup: boolean) => {
    const b = s.brand;
    const ev = s.event;
    // 목적지가 없으면 <div> 로 그린다 — 커서·hover·포커스가 '누를 수 있다'고 거짓말하지 않게.
    const Tag = (s.onClick ? 'button' : 'div') as 'button' | 'div';
    // 이벤트 슬라이드 배경 — live 만 브랜드 보라 빔, 그 밖은 중립(참여 가능을 색으로 거짓말하지 않는다). 정적 그라데이션, 애니메이션 없음.
    const evBg = ev
      ? (ev.live
        ? 'radial-gradient(140% 180% at 85% -15%, rgba(224,130,255,0.16) 0%, transparent 55%), radial-gradient(150% 200% at 8% 110%, rgba(128,95,218,0.22) 0%, transparent 60%), linear-gradient(180deg, #1c1633 0%, #120f22 100%)'
        : 'linear-gradient(180deg, #15131f 0%, #0f0e18 100%)')
      : undefined;
    return (
      <Tag
        key={`${s.key}:${dup ? 'd' : 'o'}`}
        {...(s.onClick ? { type: 'button' as const, onClick: s.onClick } : {})}
        aria-hidden={dup || undefined}
        tabIndex={dup ? -1 : undefined}
        aria-label={dup ? undefined : s.alt}
        {...(ev && !dup ? { 'data-testid': ev.testId } : {})}
        /* 폭 = 스크롤러 clientWidth(w-full) — 랩·스냅 경계가 전부 이 불변식에 걸려 있다.
           높이 = min-h(§6-2: 모바일 104~116 · PC 180~220). 트랙이 flex 라 **모든 슬라이드가
           가장 큰 높이로 함께 늘어난다** — 슬라이드마다 높이가 달라지지 않으면서, 글자 확대에는
           프레임이 같이 커져 잘리지 않는다(고정 h- 였다면 200%에서 글자가 잘린다). */
        className={[
          'relative min-h-[116px] w-full shrink-0 snap-start snap-always overflow-hidden bg-surface-mid text-left md:min-h-[170px] lg:min-h-[200px]',
          s.onClick ? '' : 'cursor-default',
        ].join(' ')}
        style={b ? { background: b.bg } : evBg ? { background: evBg } : undefined}
      >
        {ev ? (
          <span className="relative flex h-full flex-col justify-center gap-1 px-4 py-3 md:px-6">
            <span className="flex flex-wrap items-center gap-1.5">
              {/* 강조는 EVENT 칩 색으로만 — live 일 때 accent, 아니면 중립 */}
              <span className={['shrink-0 rounded-chip px-1.5 py-px t-meta font-bold tracking-wide', ev.live ? 'bg-accent-300/25 text-accent-200' : 'bg-white/10 text-white/60'].join(' ')}>EVENT</span>
              <span className="font-display text-[18px] font-extrabold leading-[26px] text-[#EEECFA] md:text-[22px] md:leading-[30px]">{ev.title}</span>
            </span>
            <span className="text-[13px] font-medium leading-[19px] tabular-nums text-[#B2ACEC]" aria-busy={ev.pending || undefined}>{ev.sub}</span>
          </span>
        ) : b ? (
          <>
            {/* 2026-09-13 — **수트 글리프를 뺐다.** 104px 글리프가 116px 배너에서 카드 밖으로 나가
                (실측 scrollWidth 367 / clientWidth 354, 세로 121/104) 잘린 채로만 보였고, 글자 자리를
                92px 먹어 긴 제목을 밀었다. 깊이는 배경 그라데이션이 낸다 — 장식을 더 쌓지 않는다. */}
            {/* 🔴 2026-09-19 실측 — 브랜드 배너도 **원본**을 받고 있었다
                (mind.webp 2,262B → -400 변형본 572B · 74.7%↓). 배너는 가로를 꽉 채우므로 400px 변형본.
                변형본이 없으면 아래 onError 가 원본으로 되돌린다(VenueThumb·PosterArea 와 같은 조리법). */}
            <img
              src={thumbUrl(b.img, 400)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              /* 관리자 배너와 같은 규칙 — 마퀴 안에서 lazy 는 '빈 배너'가 된다(오너 실기기 리포트). */
              loading={i < 2 ? 'eager' : 'lazy'}
              decoding="async"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.dataset.fb) return;   // 원본도 실패하면 더 시도하지 않는다(무한 루프 방지)
                el.dataset.fb = '1';
                el.src = b.img;
              }}
            />
            {/* 아트워크 위 글자가 읽히도록 왼쪽에서 오른쪽으로 빠지는 스크림 하나만 — 관리자 배너와 동일(여러 겹 금지). */}
            <span
              className="absolute inset-0 flex flex-col justify-center gap-1 px-4 pr-[38%] md:px-6"
              style={{ background: 'linear-gradient(to right, rgba(6,8,11,0.92) 0%, rgba(6,8,11,0.78) 45%, transparent 100%)' }}
            >
              {/* §5 역할표: 홈 짧은 제목 18/26(PC 22/30) · 보조 설명 13/19 */}
              <span className="font-display text-[18px] font-extrabold leading-[26px] md:text-[22px] md:leading-[30px]" style={{ color: b.titleColor }}>{b.title}</span>
              <span className="text-[13px] font-medium leading-[19px]" style={{ color: b.subColor }}>{b.sub}</span>
            </span>
          </>
        ) : (
          <>
            <img
              src={s.src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              /* ⚠ 마퀴 안에서 lazy 는 '빈 배너'가 된다 — 첫 두 장은 eager(오너 실기기 리포트). */
              loading={i < 2 ? 'eager' : 'lazy'}
              decoding="async"
            />
            {/* §6-2: 짧은 제목은 **왼쪽**, 이미지는 오른쪽 일부가 보이게. 이미지 위 글자가 읽히도록
                왼쪽에서 오른쪽으로 빠지는 스크림 하나만 쓴다(여러 겹 금지). */}
            {(s.title || s.sub) && (
              <span
                className="absolute inset-0 flex flex-col justify-center gap-1 px-4 pr-[38%] md:px-6"
                style={{ background: 'linear-gradient(to right, rgba(6,8,11,0.92) 0%, rgba(6,8,11,0.78) 45%, transparent 100%)' }}
              >
                {s.title && <span className="font-display text-[18px] font-extrabold leading-[26px] text-white md:text-[22px] md:leading-[30px]">{s.title}</span>}
                {s.sub && <span className="text-[13px] font-medium leading-[19px] text-white/80">{s.sub}</span>}
              </span>
            )}
            {/* ⚠ '광고' 라벨은 **실제 광고 배너가 생길 때** 여기에 붙인다(§6-2: 실제 광고일 때만 광고라고
                표시한다). 지금 `home_banners` 는 전부 자사 공지라 붙일 대상이 하나도 없어, 항상 false 인
                죽은 분기를 남기지 않았다. 광고 상품이 생기면 HomeBanner 에 그 축을 추가하고 여기서 그린다. */}
          </>
        )}
      </Tag>
    );
  };

  // 세트 = 카드 나열뿐(스페이서·gap 없음) — 세트 폭이 정확히 N×카드 폭이라 half 경계 = 스냅 경계.
  const set = (dup: boolean) => slides.map((s, i) => card(s, i, dup));

  if (n === 0) return null; // 폴백 배너를 만들지 않는다 — 자리도 만들지 않는다.

  return (
    <div className="pt-3 lg:pt-0">
      <div className="poster-frame mx-page-x overflow-hidden rounded-aura border card-aura lg:mx-0">
        <div
          ref={vpRef}
          data-testid="home-banner-viewport"
          className="poster-marquee-viewport scrollbar-none snap-x snap-mandatory overflow-x-auto rounded-[inherit]"
        >
          {/* 트랙은 w-max 금지 — 카드 w-full(%)가 스크롤러 폭에 대해 확정 해석되려면
              트랙 폭 = 스크롤러 content 폭이어야 한다(w-max 면 순환 참조로 깨짐).
              블록 트랙 + flex 자식 — 원래 구조 그대로다(scroller 에 flex 를 걸면 트랙이 flex item 이
              되어 폭 해석이 달라진다). */}
          <div className="flex">
            {set(false)}
            {/* 복제 세트는 **2장 이상일 때만** — 1장이면 랩할 것도 없고 복제는 낭비다. */}
            {multi && set(true)}
          </div>
        </div>
      </div>
      {/* §6-2: **배너 1개면 점·이전/다음 제어를 숨긴다.** 여러 개면 제어 영역 16~20px 을 쓰되
          작은 점 자체만 터치 대상이 되지 않게 — 점은 6px 이고 눌리는 범위는 28×32px 이다. */}
      {multi && (
        <div className="mx-page-x mt-0.5 flex items-center justify-center gap-0.5 lg:mx-0" data-testid="home-banner-dots">
          {/* ⚠ 행에 고정 높이(h-5)를 주고 버튼을 -my 로 넘치게 두면 **조상의 scrollHeight 가 9px 부푼다**
              (실측 229/238) — 잘림 검사가 거짓 양성을 내고, 실제로도 버튼이 이웃 영역을 덮는다.
              행 높이 = 버튼 높이로 두고, 시각적인 '제어 영역'은 6px 점 + 16px 화살표가 만든다. */}
          <button type="button" onClick={() => go(-1)} aria-label="이전 배너"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink-secondary">
            <Icon name="chevron-left" size={16} aria-hidden />
          </button>
          {slides.map((s, i) => (
            <button key={s.key} type="button" onClick={() => goTo(i)}
              aria-label={`${i + 1}번째 배너`} aria-current={i === idx ? 'true' : undefined}
              className="flex h-8 w-7 items-center justify-center">
              <span aria-hidden className={['block h-1.5 w-1.5 rounded-full transition-colors', i === idx ? 'bg-accent-300' : 'bg-border-strong'].join(' ')} />
            </button>
          ))}
          <button type="button" onClick={() => go(1)} aria-label="다음 배너"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink-secondary">
            <Icon name="chevron-right" size={16} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
