// src/lib/homeCarousel.ts — 홈 상단 캐러셀에 **실제로 뜨는 장과 그 순서**의 단일 정본.
//
// 🔴 2026-09-29 오너: "배너가 메인에서는 3개인데 설정하는 것은 1개야 — 제대로 수정".
//   홈은 [게재 중 등록 배너] + [이벤트 슬라이드] + [브랜드 2장] 을 이어 붙이는데, 그 조립이
//   HomeTab(이벤트 중복 제거) · PosterCarousel(순서) 두 곳에 흩어져 있었고 관리자 화면은 등록 배너만 셌다.
//   이제 홈(PosterCarousel)과 관리자(HomeBannersCard)가 **이 함수 하나**로 목록을 만든다 — 두 벌 계산 금지.
//
// 순수 함수다 — React 없음. `eventState` 는 타입만 가져온다(홈 임계 경로에 판정 모듈을 싣지 않는다).
// api/homeBanners 는 노출 필터(homeBannerFeed) 하나 때문에 가져온다 — App 이 이미 부팅 때 싣는 모듈이라 번들 증가 없음.
import { homeBannerFeed, type HomeBanner } from '../api/homeBanners';
import type { EventBoard } from '../api/events';
import type { EventState } from './eventState';
import { bannerCoversEvent } from './eventSlug';

/** 브랜드 슬라이드(순서 = 캐러셀 순서). 그림·색·목적지는 PosterCarousel 의 BRAND_SLIDES 가 이 키로 찾는다. */
export const BRAND_SLIDE_TITLES = { mind: '오늘의 NURI MIND', nuri: 'NURI HOLDEM' } as const;
export type BrandSlideKey = keyof typeof BRAND_SLIDE_TITLES;

export type HomeCarouselItem =
  | { kind: 'banner'; banner: HomeBanner }
  | { kind: 'event' }
  | { kind: 'brand'; key: BrandSlideKey };

export interface HomeCarouselInput {
  /** **게재 중인** 등록 배너만(homeBannerFeed 가 거른 것) — 순서 그대로 */
  banners: readonly HomeBanner[];
  /** 이벤트 슬라이드 스위치(home_slide_event) AND 이벤트 메뉴 표시(event_menu_visible) */
  showEvent: boolean;
  /** 브랜드 슬라이드 스위치(home_slide_brand) */
  showBrand: boolean;
  /** 홈이 열 이벤트 — 중복 제거(slug·pending)와 자리(live) 판정에 쓴다 */
  event: { slug: string | null | undefined; pending: boolean; live: boolean };
}

/**
 * 홈 캐러셀 최종 목록.
 *  · 이벤트 슬라이드는 스위치가 켜져 있고, 게재 중 배너가 **같은 캠페인**으로 가지 않을 때만 들어간다(§7.1-3, bannerCoversEvent).
 *  · 참여 가능(live) 이벤트는 등록 배너 바로 뒤·브랜드 앞, 그 밖(안내 문구)은 맨 뒤(2026-09-25 오너 결정 HOME-BANNER-REDESIGN).
 */
export function homeCarouselPlan(p: HomeCarouselInput): HomeCarouselItem[] {
  const posters: HomeCarouselItem[] = p.banners.map((banner) => ({ kind: 'banner', banner }));
  const hasEvent = p.showEvent && !bannerCoversEvent(p.banners.map((b) => b.linkUrl), p.event.slug, p.event.pending);
  const events: HomeCarouselItem[] = hasEvent ? [{ kind: 'event' }] : [];
  const brands: HomeCarouselItem[] = p.showBrand
    ? (Object.keys(BRAND_SLIDE_TITLES) as BrandSlideKey[]).map((key) => ({ kind: 'brand', key }))
    : [];
  return p.event.live ? [...posters, ...events, ...brands] : [...posters, ...brands, ...events];
}

/**
 * 관리자 미리보기 — **전량 행**(꺼진 것·예약·만료 포함)에서 홈과 같은 길로 목록을 만든다.
 *  홈 경로: getActiveHomeBanners → homeBannerFeed → App 의 `showEvent && eventMenuOn` → homeCarouselPlan.
 *  여기도 homeBannerFeed → homeCarouselPlan 을 그대로 탄다(관리자 화면 전용 필터를 새로 만들지 않는다).
 *  `offHome` = 등록했지만 지금 홈에 안 뜨는 배너(꺼짐·예약·만료·이미지 없음), 원래 순서.
 */
export function homeCarouselPreview(
  rows: readonly HomeBanner[], today: string,
  sw: { showEvent: boolean; showBrand: boolean; eventMenu: boolean },
  event: HomeCarouselInput['event'],
): { onHome: HomeCarouselItem[]; offHome: HomeBanner[] } {
  const feed = homeBannerFeed([...rows], today, false, { showEvent: sw.showEvent, showBrand: sw.showBrand });
  const onHome = homeCarouselPlan({
    banners: feed.banners, showEvent: feed.showEvent && sw.eventMenu, showBrand: feed.showBrand, event,
  });
  const live = new Set(feed.banners.map((b) => b.id));
  return { onHome, offHome: rows.filter((b) => !live.has(b.id)) };
}

type EventStateMod = typeof import('./eventState');

/** 아직 안 열린 카드 수. `b.cards` 가 배열이 아닐 수 있다(RPC 응답 무검증 단언 — 2026-09-13 홈 전체 오류 사고). */
export const remainCardsOf = (b: EventBoard): number | null =>
  (Array.isArray(b.cards) ? b.cards.filter((c) => !c.opened).length : null);
const totalCardsOf = (b: EventBoard): number | null => (Array.isArray(b.cards) ? b.cards.length : null);

/** 이벤트 보드 → 단일 판정(evaluateEvent). 모듈을 인자로 받는 이유: 홈은 eventState 를 비차단 lazy 로 받는다.
 *  `hiddenAt` 은 EventBoard 에 없다(= 서버가 모름 = 공개로 본다). 홈과 관리자 미리보기가 같이 쓴다. */
export const eventStateOf = (m: EventStateMod, b: EventBoard): EventState => m.evaluateEvent({
  status: b.status,
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  totalCards: totalCardsOf(b),
  remainCards: remainCardsOf(b),
}, m.eventNow()).state;
