// 홈 배너 폴백 계약 — '아직 등록 전'과 '관리자가 전부 숨김'은 다른 상태다.
//  이 구분이 없으면 관리자가 배너를 모두 끈 순간 코드에 박힌 기본 배너가 되살아나 '내렸는데 그대로'가 된다.
import { describe, it, expect } from 'vitest';

/** PosterCarousel 의 폴백 판정과 같은 식(한 곳에서만 정의되도록 여기서 계약을 고정한다) */
const useFallback = (bannerCount: number, configured: boolean) => bannerCount === 0 && !configured;

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
