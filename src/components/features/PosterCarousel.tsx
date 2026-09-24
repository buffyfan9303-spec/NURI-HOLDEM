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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    // 🔴 2026-09-25 오너 결정(HOME-BANNER-REDESIGN) — **참여 가능(live)이 아닌** 이벤트 안내는 맨 뒤로 보낸다.
    //   관리자 배너가 0개가 되자 '매장 이벤트 · 지금 진행 중인 이벤트가 없어요' 평면 슬라이드가 홈에서 가장 큰 자리의
    //   첫 장이 됐다(실측 360~1440 전부). 빼지 않는 이유: 이 슬라이드가 시작 전·소진·종료·조회 실패를 사실대로 말하는
    //   자리이고 e2e 5개 파일의 진입점이다(home-event-menu). 라이브가 되면 종전처럼 관리자 배너 바로 뒤·브랜드 앞(§7.1-3).
    return eventSlide?.live ? [...posters, ...events, ...brands] : [...posters, ...brands, ...events];
  }, [onBanner, banners, onBannerUrl, eventSlide, showBrand]);

  const n = slides.length;
  const multi = n > 1;
  const vpRef = useRef<HTMLDivElement>(null);
  /** 점·화살표가 건 스무스 스크롤의 목표 scrollLeft — 도착 전엔 랩하지 않는다(아래 onScroll). */
  const navRef = useRef<number | null>(null);
  const [idx, setIdx] = useState(0);
  // §7.1-9: 데이터가 늦게 도착해 슬라이드 수가 변하면 현재 인덱스를 유효 범위로 맞춘다(점 표시·aria-current 가 없는 장을 가리키지 않게).
  useEffect(() => { if (idx >= n) setIdx(Math.max(0, n - 1)); }, [n, idx]);
  /** 사용자가 캐러셀을 한 번이라도 움직였나(스와이프·휠·점·화살표). */
  const touchedRef = useRef(false);
  // 🔴 2026-09-24 — 관리자 배너가 이벤트·브랜드 슬라이드보다 **늦게** 오면 앞에 끼워진다. 그때 브라우저의
  //   스냅 재정렬(re-snap)이 보던 장(이벤트)을 붙잡아 scrollLeft 가 끼워진 폭만큼 밀려, 첫 화면이 1번째 배너가
  //   아니었다(실측 390: scrollLeft 708 = 2장 뒤 '매장 이벤트'). 아직 손대지 않았으면 첫 장으로 되돌린다 —
  //   페인트 전(layout effect)이라 밀린 장이 보이지 않는다. 손댄 뒤엔 보던 장을 지키는 재정렬이 맞다.
  const firstKey = slides[0]?.key;
  /** 스크롤 핸들러가 읽는 장 수 — 재구독 전(passive effect 전)에 온 스크롤 이벤트가 **옛 n** 으로 인덱스를 셈하지 않게.
   *  실측: 되돌린 직후 첫 스크롤 이벤트가 옛 핸들러(n=3)로 half=5w 를 5%3=2 로 읽어 점이 3번째 장을 가리켰다. */
  const nRef = useRef(n);
  useLayoutEffect(() => {
    nRef.current = n;
    const vp = vpRef.current;
    if (vp && !touchedRef.current && vp.scrollLeft !== 0) vp.scrollLeft = 0;
  }, [firstKey, n]);

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
      // 🔴 2026-09-24 — 점·화살표의 스무스 스크롤 **도중**엔 랩하지 않는다. 랩(scrollLeft 대입)은 진행 중인
      //   스무스 스크롤을 끊는다: 다음→이전(=half)→'3번째 점' 이 half+w 를 지나며 잘려 2번째 장에 멈췄다(3/3).
      //   ⚠ go() 에서 '원본 세트로 먼저 옮기기'(대칭 사전 이동)는 답이 아니다 — 첫 장의 원본 자리는 0 이라
      //   첫 스크롤 이벤트가 0 을 보고 왼쪽 랩(+half)이 돌아 '다음' 까지 멈췄다(실측 12/12 실패).
      //   도착하면(±1px) 가드를 풀고 그 자리에서 한 번 랩한다 — 화면은 같은 픽셀이다.
      const nav = navRef.current;
      if (nav !== null && Math.abs(vp.scrollLeft - nav) < 1) navRef.current = null;
      if (w > 0 && half > w && navRef.current === null) {
        // ⚠ 우측 임계 = half + 카드 1장. (>=half → −half) ↔ (<=0 → +half) 짝은 0↔half 를 서로
        //   되던지는 무한 스크롤 이벤트 루프가 된다(같은 픽셀이라 눈엔 안 보이고 메인스레드만 돈다).
        if (vp.scrollLeft >= half + w) vp.scrollLeft -= half;
        else if (vp.scrollLeft <= 0) vp.scrollLeft += half;
      }
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!w) return;
        const k = nRef.current;
        const i = ((Math.round(vp.scrollLeft / w) % k) + k) % k;
        setIdx((prev) => (prev === i ? prev : i));
      });
    };
    vp.addEventListener('scroll', onScroll, { passive: true });
    // 가드가 도착 판정 없이 남는 경우(손가락이 끼어듦·스냅이 다른 장에 세움) — 사용자 입력이나 스크롤 끝에서 푼다.
    const release = () => { if (navRef.current === null) return; navRef.current = null; onScroll(); };
    const releaseOnInput = () => { navRef.current = null; touchedRef.current = true; };
    vp.addEventListener('scrollend', release);
    vp.addEventListener('pointerdown', releaseOnInput, { passive: true });
    vp.addEventListener('touchstart', releaseOnInput, { passive: true });
    vp.addEventListener('wheel', releaseOnInput, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', markGeoDirty);
      vp.removeEventListener('scroll', onScroll);
      vp.removeEventListener('scrollend', release);
      vp.removeEventListener('pointerdown', releaseOnInput);
      vp.removeEventListener('touchstart', releaseOnInput);
      vp.removeEventListener('wheel', releaseOnInput);
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
    // 앞선 이동이 아직 복제 세트 깊숙이(랩 임계 너머) 있으면 같은 픽셀의 원본 쪽으로 옮기고 시작한다(끝을 넘어 클램프되지 않게).
    else if (half > w && from >= half + w) { from -= half; vp.scrollLeft = from; }
    touchedRef.current = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const left = from + delta * w;
    navRef.current = reduced || !delta ? null : left; // 제자리(delta 0)는 스크롤 이벤트가 안 나 가드가 남는다
    vp.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
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
          'relative min-h-[152px] w-full shrink-0 snap-start snap-always overflow-hidden bg-surface-mid text-left md:min-h-[170px] lg:min-h-[200px]',
          s.onClick ? '' : 'cursor-default',
        ].join(' ')}
        style={b ? { background: b.bg } : evBg ? { background: evBg } : undefined}
      >
        {ev ? (
          /* 🔴 2026-09-25 HOME-BANNER-REDESIGN — 다른 슬라이드와 같은 구도(글자 **왼쪽 아래**, 오른쪽 36% 는 'n / N' 칩 자리).
             ⚠ 이 슬라이드만 글자가 **흐름 안**(relative)이다 — 그림이 없어 글자가 곧 높이이고, 루트 글자 200% 에서
               프레임이 같이 자라야 잘리지 않는다. absolute 로 빼면 min-h 에 갇혀 잘린다. min-h 는 버튼 값을 상속한다. */
          <span className="relative flex h-full min-h-[inherit] flex-col justify-end gap-1 px-4 pb-4 pr-[36%] pt-3 md:px-6 md:pb-5">
            <span className="flex flex-wrap items-center gap-1.5">
              {/* 강조는 EVENT 칩 색으로만 — live 일 때 accent, 아니면 중립 */}
              <span className={['shrink-0 rounded-chip px-1.5 py-px t-meta font-bold tracking-wide', ev.live ? 'bg-accent-300/25 text-accent-200' : 'bg-white/10 text-white/60'].join(' ')}>EVENT</span>
              <span className="font-display text-[21px] font-extrabold leading-[28px] text-[#EEECFA] md:text-[22px] md:leading-[30px]">{ev.title}</span>
            </span>
            <span className="text-[13px] font-medium leading-[19px] tabular-nums text-[#B2ACEC]" aria-busy={ev.pending || undefined}>{ev.sub}</span>
          </span>
        ) : b ? (
          <>
            {/* 2026-09-13 — **수트 글리프를 뺐다.** 104px 글리프가 116px 배너에서 카드 밖으로 나가
                (실측 scrollWidth 367 / clientWidth 354, 세로 121/104) 잘린 채로만 보였고, 글자 자리를
                92px 먹어 긴 제목을 밀었다. 깊이는 배경 그라데이션이 낸다 — 장식을 더 쌓지 않는다. */}
            {/* 🔴 2026-09-25 HOME-BANNER-REDESIGN — 400px 변형본(400×80)을 **원본(1200×240, 2,262B)** 으로 되돌렸다.
                배너가 152px 로 높아진 뒤 5:1 아트는 cover 로 가로 51% 만 보이고(390), 400 변형본을 기기 픽셀 780 에 맞춰
                ~3.8배 늘려 흐렸다(실측). 원본이면 ~1.27배다. 늘어난 전송량 +1.7KB/장.
                초점 72% — 볼거리(MIND 구슬·NURI 핀)가 오른쪽에 있어 가운데 크롭이면 오른끝에서 잘렸다.
                (종전 09-19: 원본 → -400 변형본으로 74.7% 줄였었다 — 그땐 배너가 110px 이었다.)
                onError 폴백은 그대로 둔다(원본이 없을 일은 없지만 같은 조리법 유지). */}
            <img
              src={b.img}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[72%_50%]"
              /* 관리자 배너와 같은 규칙 — 마퀴 안에서 lazy 는 '빈 배너'가 된다(오너 실기기 리포트). */
              loading={i < 2 ? 'eager' : 'lazy'}
              decoding="async"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.dataset.fb) return;   // 한 번만 다시 시도한다(무한 루프 방지)
                el.dataset.fb = '1';
                el.src = b.img;
              }}
            />
            {/* 2026-09-25 — 그림이 판 전체, 글자는 **왼쪽 아래**(레퍼런스 다수: 무신사·야놀자·번개장터). 스크림은 아래→위 + 왼쪽 옅게
                한 레이어(배경 두 겹 = 한 요소). 오른쪽 36% 는 'n / N' 칩 자리라 글자를 두지 않는다. 관리자 배너와 동일. */}
            <span
              className="absolute inset-0 flex flex-col justify-end gap-0.5 px-4 pb-4 pr-[36%] md:px-6 md:pb-5"
              style={{ background: 'linear-gradient(to top, rgba(6,8,11,0.92) 0%, rgba(6,8,11,0.5) 48%, rgba(6,8,11,0.05) 100%), linear-gradient(to right, rgba(6,8,11,0.6) 0%, transparent 62%)' }}
            >
              {/* §5 역할표: 홈 짧은 제목 18/26(PC 22/30) · 보조 설명 13/19 */}
              <span className="font-display text-[21px] font-extrabold leading-[28px] md:text-[22px] md:leading-[30px]" style={{ color: b.titleColor }}>{b.title}</span>
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
            {/* §6-2: 짧은 제목은 **왼쪽**(2026-09-25 부터 왼쪽 **아래**), 이미지는 판 전체. 스크림은 브랜드 슬라이드와 같은 한 요소. */}
            {(s.title || s.sub) && (
              <span
                className="absolute inset-0 flex flex-col justify-end gap-0.5 px-4 pb-4 pr-[36%] md:px-6 md:pb-5"
                style={{ background: 'linear-gradient(to top, rgba(6,8,11,0.92) 0%, rgba(6,8,11,0.5) 48%, rgba(6,8,11,0.05) 100%), linear-gradient(to right, rgba(6,8,11,0.6) 0%, transparent 62%)' }}
              >
                {s.title && <span className="font-display text-[21px] font-extrabold leading-[28px] text-white md:text-[22px] md:leading-[30px]">{s.title}</span>}
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
    <div className="pt-0 md:pt-2.5 lg:pt-0">
      {/* 🔴 2026-09-24 HOME-LAYOUT-STRETCH(오너: "메인 배너 가로폭을 늘리고 싶다") — 모바일(≤767)은 **풀블리드**:
          좌우 여백 17px·좌우 테두리·둥근 모서리를 빼고 화면 폭 그대로(375: 341 → 375px).
          🔴 높이 132 → **152** — 2026-09-24 오너 지시(2차: "조금 더", 148~156 · 첫 화면 카드 수보다 배너 우선).
            152 를 고른 이유: 390 에서 온전한 일정 카드 4장이 남는 최대 단계(실측 여유 25px → 5px, 156 이면 1px).
          (1차) 높이 116 → **132** — 2026-09-24 오너 지시("모바일 메인 배너 세로 폭을 조금 더 늘려라", 132~140 범위).
          §6-2 의 104~116 과 e2e home-flow-fit 게이트를 오너 지시로 새 범위(104~140)로 옮겼다. 132 를 고른 이유: 390 에서
          온전한 일정 카드 4장이 남는 최대치다(실측 여유 23px → 7px, 140 이면 −1px 로 3장).
          md 이상은 종전 카드 모양 그대로(PC 폭은 HomeTab 의 두 칸 비율 4:8 이 키운다). 글자는 안쪽 px-4(17px)라 본문 여백과 같은 세로선이다.
          ⚠ index.html 정적 셸의 배너 예약도 같은 모양으로 맞췄다(첫 페인트 CLS).
          🔴 2026-09-25 HOME-BANNER-REDESIGN — 모바일은 위아래 헤어라인·카드 그림자도 뺐다(border-0·shadow-none). 풀블리드 그림 판에
            선이 두 줄 그어져 '띠'로 읽혔다. 높이 154 → 152(테두리 2px) — 셸도 같이 바꿨다. md~ 카드 모양은 그대로. */}
      <div className="poster-frame relative overflow-hidden border card-aura max-md:rounded-none max-md:border-0 max-md:shadow-none md:mx-page-x md:rounded-aura lg:mx-0">
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
        {/* §6-2: **배너 1개면 점·이전/다음 제어를 숨긴다.**
            🔴 2026-09-24 HOME-DENSITY(오너: "나머지 공백들도 조금 줄여서 한 페이지에 들어가는 콘텐츠 양을 늘려줘") —
            배너 **밑의 별도 줄**(34px + 여백)이던 제어를 배너 **안쪽 아래 띠**로 옮겼다. 첫 화면에서 37px 가 돌아온다.
            · 화살표는 **실박스 44×44** 다(종전 32×32 는 기준 미달이었다). 점은 28×32(e2e design-tokens: 아이콘형 28 이상 — 24 로 줄였다가 빨개졌다).
            · 상자는 전부 프레임 **안**이다 — overflow-hidden 프레임 밖으로 오버행을 내면 잘리거나
              조상 scrollHeight 가 부푼다(종전 주석의 229/238 실측, K-18). 그래서 `.hit` 도 쓰지 않는다.
            · 글자와 겹치지 않게 여러 장일 때만 슬라이드 글자 칸을 띠 위로 올린다(이벤트 pb-8 · 그림 배너 pb-6).
              실측(390): 글자 아래 65.6 < 터치 상자 위 72. ⚠ 320 에서 관리자 문구가 4줄로 접히면 글자 아래가
              92 까지 내려와 화살표 상자(72~116)와 겹쳤다(윗변에 붙어 답답했다) → 320~359 는 글자 칸 오른쪽 여백을
              38%→30% 로 줄여 한 줄로 되돌린다(실측 제목 164 · 부제 181 / 칸 184). 문구 길이에 따라 다시 접힐 수 있다.
            · 보이는 부분은 어두운 알약 하나 — 배너 그림이 밝아도 흰 점·화살표가 읽힌다(테마 무관).
            🔴 2026-09-25 HOME-BANNER-REDESIGN(오너 결정 B) — 가운데 '‹ ● ● ● ›' 알약 → **오른쪽 아래 '‹ 1 / 3 ›' 칩**.
            · 레퍼런스 390 실측: 오른쪽 아래 숫자 칩 4곳(무신사·인터파크·야놀자·번개장터), 가운데 점+화살표 알약 0곳.
              종전 알약은 판 높이의 29%(44/152)를 쓰며 글자를 위로 밀었고, 장 수만큼 넓어졌다(5장이면 ~210px). 칩은 폭이 일정하다.
            · 화살표 실박스 44×44 그대로. 점 버튼은 **DOM 에 남기고 display:none** — e2e 가 aria-current·evaluate click 으로
              장 위치를 재는 손잡이다. ⚠ sr-only(1×1)로 두면 design-tokens 히트 게이트(아이콘형 28px)에 걸린다.
            · 스크린리더에는 칩이 '배너 N장 중 i번째' 로 읽힌다(role=img + aria-label — sr-only 1×1 은 잘림 검사에 잡혔다). */}
        {multi && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end pr-1.5 md:pr-3" data-testid="home-banner-dots">
            {/* 보이는 알약(24px)은 **숫자 칩 자신의 배경**이다 — 좌우로 34px 씩 화살표 칸 밑까지 펼친다(-mx·px 로 레이아웃 폭은 글자 폭 그대로).
                · 형제 레이어로 깔면 대비 검사가 지면색(라이트: 흰색)과 비교해 거짓 미달이 났다(2026-09-25 실측).
                · 화살표 44×44 를 알약 밖으로 -my 오버행시키면 알약의 scrollWidth/Height 가 부풀어 잘림 검사에 걸렸다(101/107 × 24/34) —
                  그래서 행 높이 = 화살표 높이(44)로 두고 알약을 그 가운데에 그린다. 모든 상자가 행 안이다.
                · bg-black/65: 가장 밝은 관리자 그림(흰색) 위에서도 합성 rgb(89) → 흰 글자 7.0:1 · 흰 90% 6.0:1(AA 4.5 이상, 계산).
                · 화살표는 z-10 으로 알약 위에 그린다(아이콘이 알약에 덮이지 않게), 칩은 pointer-events-none(누름은 화살표가 받는다). */}
            <div className="pointer-events-auto relative flex h-[44px] items-center">
              <button type="button" onClick={() => go(-1)} aria-label="이전 배너"
                className="relative z-10 flex h-[44px] w-[44px] items-center justify-end pr-[8px] text-white/85 transition-colors hover:text-white">
                <Icon name="chevron-left" size={13} aria-hidden />
              </button>
              <span data-testid="home-banner-counter" role="img" aria-label={`배너 ${n}장 중 ${idx + 1}번째`}
                className="pointer-events-none relative -mx-[34px] flex h-[24px] items-center rounded-full bg-black/65 px-[34px] text-[12px] font-semibold leading-[16px] tabular-nums text-white backdrop-blur-sm">
                {idx + 1}<span className="mx-[3px] font-medium text-white/90">/</span><span className="font-medium text-white/90">{n}</span>
              </span>
              {slides.map((s, i) => (
                <button key={s.key} type="button" onClick={() => goTo(i)}
                  aria-label={`${i + 1}번째 배너`} aria-current={i === idx ? 'true' : undefined}
                  className="hidden" />
              ))}
              <button type="button" onClick={() => go(1)} aria-label="다음 배너"
                className="relative z-10 flex h-[44px] w-[44px] items-center justify-start pl-[8px] text-white/85 transition-colors hover:text-white">
                <Icon name="chevron-right" size={13} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
