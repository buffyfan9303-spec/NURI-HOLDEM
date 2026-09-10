// 홈 배너 폴백 계약 — '아직 등록 전'과 '관리자가 전부 숨김'은 다른 상태다.
//  이 구분이 없으면 관리자가 배너를 모두 끈 순간 코드에 박힌 기본 배너가 되살아나 '내렸는데 그대로'가 된다.
import { describe, it, expect } from 'vitest';
import { homeBannerFeed, type HomeBanner } from './homeBanners';

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
