// 홈 캐러셀 단일 정본 — 2026-09-29 오너 "배너가 메인에서는 3개인데 설정하는 것은 1개야".
//  홈(PosterCarousel)과 관리자(HomeBannersCard)가 같은 함수로 목록을 만든다는 계약.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeCarouselPlan, homeCarouselPreview, type HomeCarouselItem, type HomeCarouselInput } from './homeCarousel';
import { homeBannerFeed, type HomeBanner } from '../api/homeBanners';

const T = '2026-09-29';
const banner = (over: Partial<HomeBanner> = {}): HomeBanner => ({
  id: 'b1', title: '배너', subtitle: '', imageUrl: 'https://x/y.webp', linkUrl: '', sortOrder: 0,
  startsAt: null, endsAt: null, active: true, ...over,
});
const kinds = (xs: HomeCarouselItem[]) => xs.map((x) => (x.kind === 'banner' ? `banner:${x.banner.id}` : x.kind === 'brand' ? `brand:${x.key}` : 'event'));
const NO_EVENT = { slug: undefined, pending: false, live: false };
const LIVE = { slug: 'rotiarena-attend', pending: false, live: true };

describe('homeCarouselPlan — 홈 최종 목록', () => {
  it('등록 배너 켜짐 + 이벤트 안내(비live) + 브랜드 → 배너 · 브랜드 2 · 이벤트(맨 뒤)', () => {
    expect(kinds(homeCarouselPlan({ banners: [banner()], showEvent: true, showBrand: true, event: NO_EVENT })))
      .toEqual(['banner:b1', 'brand:mind', 'brand:nuri', 'event']);
  });
  it('live 이벤트는 등록 배너 바로 뒤·브랜드 앞', () => {
    expect(kinds(homeCarouselPlan({ banners: [banner()], showEvent: true, showBrand: true, event: LIVE })))
      .toEqual(['banner:b1', 'event', 'brand:mind', 'brand:nuri']);
  });
  it('등록 배너 없음·이벤트 스위치 꺼짐 → 브랜드 2장만', () => {
    expect(kinds(homeCarouselPlan({ banners: [], showEvent: false, showBrand: true, event: LIVE })))
      .toEqual(['brand:mind', 'brand:nuri']);
  });
  it('브랜드 끔 → 브랜드 0장', () => {
    expect(kinds(homeCarouselPlan({ banners: [banner()], showEvent: true, showBrand: false, event: NO_EVENT })))
      .toEqual(['banner:b1', 'event']);
  });
  it('중복 제거: 게재 중 배너가 같은 캠페인으로 가면 이벤트 슬라이드를 넣지 않는다', () => {
    const b = banner({ linkUrl: '/?event=rotiarena-attend' });
    expect(kinds(homeCarouselPlan({ banners: [b], showEvent: true, showBrand: true, event: LIVE })))
      .toEqual(['banner:b1', 'brand:mind', 'brand:nuri']);
    // 다른 캠페인은 중복이 아니다(2026-09-15 사고)
    const other = banner({ linkUrl: '/?event=spring-2027' });
    expect(kinds(homeCarouselPlan({ banners: [other], showEvent: true, showBrand: true, event: LIVE })))
      .toContain('event');
    // 응답 전(pending)이면 이벤트 링크 배너가 있을 때 중복으로 본다
    expect(kinds(homeCarouselPlan({ banners: [other], showEvent: true, showBrand: true, event: { slug: undefined, pending: true, live: false } })))
      .not.toContain('event');
  });
  it('전부 꺼지면 0장', () => {
    expect(homeCarouselPlan({ banners: [], showEvent: false, showBrand: false, event: NO_EVENT })).toEqual([]);
  });
});

describe('관리자 목록 개수 == 홈 슬라이드 개수(같은 입력)', () => {
  // 오너 스크린샷 그대로: 등록 1장(꺼짐) + 이벤트 켜짐 + 브랜드 켜짐 → 홈 3장, 관리 목록 1행이던 것.
  const rows = [
    banner({ id: 'off', title: '로티아레나 출석 이벤트', active: false, linkUrl: '/?event=rotiarena-attend', startsAt: '2026-09-14', endsAt: '2026-10-14' }),
    banner({ id: 'on', title: '켜진 배너' }),
    banner({ id: 'soon', startsAt: '2026-10-01' }),
    banner({ id: 'noimg', imageUrl: ' ' }),
  ];
  const cases: { name: string; sw: { showEvent: boolean; showBrand: boolean; eventMenu: boolean }; ev: HomeCarouselInput['event'] }[] = [
    { name: '전부 켜짐·비live', sw: { showEvent: true, showBrand: true, eventMenu: true }, ev: NO_EVENT },
    { name: 'live', sw: { showEvent: true, showBrand: true, eventMenu: true }, ev: LIVE },
    { name: '이벤트 메뉴 꺼짐', sw: { showEvent: true, showBrand: true, eventMenu: false }, ev: NO_EVENT },
    { name: '브랜드 끔', sw: { showEvent: true, showBrand: false, eventMenu: true }, ev: LIVE },
  ];
  for (const c of cases) {
    it(c.name, () => {
      // 홈 경로 — App: getActiveHomeBanners(=homeBannerFeed) → showEventSlide = showEvent && eventMenuOn → HomeTab 이 plan
      const feed = homeBannerFeed(rows, T, false, { showEvent: c.sw.showEvent, showBrand: c.sw.showBrand });
      const home = homeCarouselPlan({ banners: feed.banners, showEvent: feed.showEvent !== false && c.sw.eventMenu, showBrand: feed.showBrand !== false, event: c.ev });
      const admin = homeCarouselPreview(rows, T, c.sw, c.ev);
      expect(admin.onHome.length).toBe(home.length);
      expect(kinds(admin.onHome)).toEqual(kinds(home));
      // 모든 등록 행은 정확히 한 곳(홈에 뜸 / 홈에 안 뜸)에 선다 — 목록에서 사라지는 배너 없음
      const onIds = admin.onHome.flatMap((x) => (x.kind === 'banner' ? [x.banner.id] : []));
      expect([...onIds, ...admin.offHome.map((b) => b.id)].sort()).toEqual(rows.map((b) => b.id).sort());
    });
  }
  it('오너 스크린샷 상태 → 홈 3장, 꺼진 등록 배너는 홈에 안 뜸', () => {
    const p = homeCarouselPreview([rows[0]], T, { showEvent: true, showBrand: true, eventMenu: true }, NO_EVENT);
    expect(p.onHome.length).toBe(3);
    expect(p.offHome.map((b) => b.id)).toEqual(['off']);
  });
});

describe('두 벌 계산 금지 — 홈과 관리자가 같은 정본을 부른다', () => {
  const dir = join(__dirname, '..', 'components', 'features');
  const PC = readFileSync(join(dir, 'PosterCarousel.tsx'), 'utf8');
  const HOME = readFileSync(join(dir, 'HomeTab.tsx'), 'utf8');
  const ADMIN = readFileSync(join(dir, 'HomeBannersCard.tsx'), 'utf8');
  it('PosterCarousel 은 받은 plan 을 그대로 그리고 자기 순서 규칙이 없다', () => {
    expect(PC).toMatch(/plan\.flatMap\(/);
    expect(PC).not.toMatch(/\[\.\.\.posters/);
  });
  it('HomeTab 은 homeCarouselPlan 으로 목록을 만들고 중복 제거를 따로 하지 않는다', () => {
    expect(HOME).toMatch(/homeCarouselPlan\(/);
    expect(HOME).not.toMatch(/bannerCoversEvent\(/);
  });
  it('관리자 카드는 homeCarouselPreview 로 목록과 장수를 만든다', () => {
    expect(ADMIN).toMatch(/homeCarouselPreview\(/);
    expect(ADMIN).toMatch(/data-testid="home-carousel-count"/);
  });
});
