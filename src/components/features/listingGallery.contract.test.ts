// UP-03(장터 상세 첫 사진만) · UP-12(매장 hero 포스터 1장이면 탭 불가) 회귀 방지.
// 근거: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit12\triage-user.md 의 UP-03·UP-12 절.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ListingGallery from './ListingGallery';
import { heroTouchIntent } from '../../lib/heroTouch';

const render = (images: string[]) =>
  renderToStaticMarkup(createElement(ListingGallery, { images, title: '테스트 매물', onZoom: () => {} }));

describe('UP-03 장터 상세 — 여러 장을 모두 볼 수 있다', () => {
  it('3장이면 사진 3장이 모두 그려지고, 각 장이 확대 버튼이다', () => {
    const html = render(['a.jpg', 'b.jpg', 'c.jpg']);
    for (const src of ['a.jpg', 'b.jpg', 'c.jpg']) expect(html).toContain(`src="${src}"`);
    expect(html.match(/data-listing-slide="/g)?.length).toBe(3);
    expect(html).toContain('1 / 3');
    expect(html).toContain('aria-label="다음 사진"');
  });
  it('1장이어도 확대 버튼이 있고, 넘김 표시는 없다', () => {
    const html = render(['only.jpg']);
    expect(html.match(/data-listing-slide="/g)?.length).toBe(1);
    expect(html).toContain('사진 크게 보기');
    expect(html).not.toContain('data-listing-counter');
  });
  it('레이아웃 고정 — 예전과 같은 정사각(sm 4:3) 상자 하나 안에서만 넘긴다', () => {
    const html = render(['a.jpg', 'b.jpg']);
    expect(html).toMatch(/data-listing-gallery="true" class="[^"]*aspect-square sm:aspect-4\/3[^"]*overflow-hidden/);
    expect(html).toContain('snap-mandatory');
  });
  it('상세 모달이 갤러리와 확대 뷰(ImageLightbox)를 실제로 쓴다', () => {
    const src = readFileSync(resolve(__dirname, 'ListingDetailModal.tsx'), 'utf8');
    expect(src).toMatch(/<ListingGallery[\s\S]{0,80}images=\{listing\.images\}/);
    expect(src).toMatch(/<ImageLightbox[^>]*src=\{zoomSrc\}/);
    // hero 는 갤러리 하나다(판매자 채팅 머리의 작은 썸네일은 images[0] 을 쓰는 게 맞아 여기서 보지 않는다).
    expect(src).toMatch(/hasImage \? \([\s\S]{0,400}<ListingGallery/);
  });
});

describe('UP-12 매장 hero — 포스터 1장이어도 탭하면 열린다', () => {
  it('1장: 탭은 tap, 스와이프는 무시', () => {
    expect(heroTouchIntent(2, 3, 1)).toBe('tap');
    expect(heroTouchIntent(-80, 5, 1)).toBeNull();
  });
  it('여러 장: 스와이프는 next/prev, 탭은 tap', () => {
    expect(heroTouchIntent(-80, 5, 3)).toBe('next');
    expect(heroTouchIntent(80, 5, 3)).toBe('prev');
    expect(heroTouchIntent(0, 0, 3)).toBe('tap');
  });
  it('0장이면 아무것도 하지 않는다', () => {
    expect(heroTouchIntent(0, 0, 0)).toBeNull();
  });
  it('VenuePage 가 터치 핸들러를 1장일 때도 붙인다', () => {
    const src = readFileSync(resolve(__dirname, 'VenuePage.tsx'), 'utf8');
    expect(src).toContain('onTouchStart={slides.length > 0 ? onTouchStart : undefined}');
    expect(src).toContain('onTouchEnd={slides.length > 0 ? onTouchEnd : undefined}');
    expect(src).not.toContain('onTouchEnd={slides.length > 1');
  });
});
