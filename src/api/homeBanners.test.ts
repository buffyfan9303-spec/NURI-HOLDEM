// 홈 배너 폴백 계약 — '아직 등록 전'과 '관리자가 전부 숨김'은 다른 상태다.
//  이 구분이 없으면 관리자가 배너를 모두 끈 순간 코드에 박힌 기본 배너가 되살아나 '내렸는데 그대로'가 된다.
import { describe, it, expect } from 'vitest';
import { homeBannerFeed, type HomeBanner } from './homeBanners';
import { parseSlideOn } from './settings';

/** PosterCarousel 의 폴백 판정과 같은 식(한 곳에서만 정의되도록 여기서 계약을 고정한다) */
const useFallback = (bannerCount: number, configured: boolean) => bannerCount === 0 && !configured;

const banner = (over: Partial<HomeBanner> = {}): HomeBanner => ({
  id: 'b1', title: '', subtitle: '', imageUrl: 'https://x/y.webp', linkUrl: '', sortOrder: 0,
  startsAt: null, endsAt: null, active: true, ...over,
});
const T = '2026-09-10';

// F08: 비관리자에게는 RLS 가 '게재 중인 행'만 주므로(20260904g) rows.length 로 '등록됨'을 판정하면
//  관리자(전량 조회)와 손님(게재분만)의 configured 가 갈린다 — 판정은 역할과 무관한 두 값으로만.
describe('homeBannerFeed — 역할과 무관한 폴백 판정', () => {
  it('아무 행도 안 왔고 스위치도 없으면 폴백(도입 첫날 회귀 없음)', () => {
    const f = homeBannerFeed([], T, false);
    expect(f.banners).toEqual([]);
    expect(useFallback(f.banners.length, f.configured)).toBe(true);
  });
  it('🔴 킬스위치 off 면 행이 하나도 안 와도(손님 RLS 결과) 기본 배너를 되살리지 않는다', () => {
    const f = homeBannerFeed([], T, true);
    expect(useFallback(f.banners.length, f.configured)).toBe(false);
  });
  it('🔴 관리자에게만 보이는 꺼진 행은 판정에 들어가지 않는다 — 손님과 같은 결과', () => {
    const adminRows = [banner({ active: false }), banner({ id: 'b2', endsAt: '2026-01-01' })];
    expect(homeBannerFeed(adminRows, T, false).configured).toBe(homeBannerFeed([], T, false).configured);
  });
  it('게재 중인 배너가 하나라도 있으면 configured', () => {
    const f = homeBannerFeed([banner(), banner({ id: 'b2', active: false })], T, false);
    expect(f.banners.map((b) => b.id)).toEqual(['b1']);
    expect(f.configured).toBe(true);
  });
  it('기간 필터 — 시작 전·만료·이미지 없음은 게재 목록에서 빠진다', () => {
    const rows = [
      banner({ id: 'future', startsAt: '2026-09-11' }),
      banner({ id: 'past', endsAt: '2026-09-09' }),
      banner({ id: 'noimg', imageUrl: ' ' }),
      banner({ id: 'live', startsAt: '2026-09-10', endsAt: '2026-09-10' }),
    ];
    expect(homeBannerFeed(rows, T, false).banners.map((b) => b.id)).toEqual(['live']);
  });
});

describe('홈 배너 하드코딩 폴백', () => {
  it('아직 한 줄도 등록하지 않았으면 기본 배너를 쓴다(도입 첫날 회귀 없음)', () => {
    expect(useFallback(0, false)).toBe(true);
  });
  it('관리자가 등록했다가 전부 껐으면 기본 배너를 되살리지 않는다', () => {
    expect(useFallback(0, true)).toBe(false);
  });
  it('게재 중인 배너가 있으면 당연히 기본 배너를 쓰지 않는다', () => {
    expect(useFallback(2, true)).toBe(false);
  });
  it('기간이 지나 오늘 게재분이 0이어도(행은 있음) 기본 배너로 돌아가지 않는다', () => {
    expect(useFallback(0, true)).toBe(false);
  });
});

describe('캐러셀 슬라이드 스위치 (2026-09-18 오너: "이것도 끌 수 있게 만들어줘")', () => {
  // ⚠ 이 둘을 '기본 꺼짐'으로 만들면 조회가 한 번 실패한 손님 홈에서 캐러셀이 통째로 비어 보인다.
  //   home_banner_fallback 이 'off' 일 때만 동작하는 것과 같은 이유다.
  it('미설정·깨진 값·조회 실패(null)는 전부 노출이다 — 기본 켜기', () => {
    expect(parseSlideOn(null)).toBe(true);
    expect(parseSlideOn(undefined)).toBe(true);
    expect(parseSlideOn('')).toBe(true);
    expect(parseSlideOn('on')).toBe(true);
    expect(parseSlideOn('yes')).toBe(true);
  });
  it("'off' 일 때만 끈다", () => {
    expect(parseSlideOn('off')).toBe(false);
  });
  it('피드가 스위치를 그대로 실어 보낸다 — 인자를 빼면 둘 다 켜짐', () => {
    expect(homeBannerFeed([], T, false)).toMatchObject({ showEvent: true, showBrand: true });
    expect(homeBannerFeed([], T, false, { showEvent: false, showBrand: true }))
      .toMatchObject({ showEvent: false, showBrand: true });
  });
  it('🔴 스위치는 배너 목록을 건드리지 않는다 — 슬라이드를 꺼도 등록한 배너는 그대로 돈다', () => {
    const rows = [banner({ id: 'a' }), banner({ id: 'b' })];
    const off = homeBannerFeed(rows, T, false, { showEvent: false, showBrand: false });
    expect(off.banners.map((b) => b.id)).toEqual(['a', 'b']);
    expect(off.configured).toBe(true);
  });
});
