// 게시글 첨부 사진 표시가 전적으로 의존하는 썸네일 URL 계약을 고정한다.
// 특히 format=webp 누락은 이 리포에서 실제로 겪은 함정이라(빼면 JPEG 로 변환돼 원본보다 커진다)
// 회귀하면 조용히 Egress 만 잡아먹는다 — 눈에 안 보이는 종류의 손해라 테스트로 못 박는다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { thumbUrl, thumbSrcSet } from './imageUrl';

// 게시글 첨부 사진이 실제로 저장되는 형태의 공개 URL
const PUBLIC = 'https://idsxiqspecrucvfvtgbw.supabase.co/storage/v1/object/public/community_images/community/u1/1700000000000-0.webp';

describe('thumbUrl', () => {
  it('공개 스토리지 URL을 render/image 변환 경로로 바꾼다', () => {
    const u = thumbUrl(PUBLIC, 480)!;
    expect(u).toContain('/storage/v1/render/image/public/');
    expect(u).not.toContain('/storage/v1/object/public/');
    expect(u).toContain('width=480');
  });

  it('🔴 format=webp 를 반드시 붙인다', () => {
    // 왜: 빼면 Supabase 가 JPEG 로 변환해 원본 webp 보다 커진다(159KB → 88KB vs 60KB).
    expect(thumbUrl(PUBLIC, 88)).toContain('format=webp');
    expect(thumbSrcSet(PUBLIC, 88)!.split(',').every((s) => s.includes('format=webp'))).toBe(true);
  });

  it("🔴 기본값 = resize=contain(오너 결정 2026-09-30) — 폭만 주는 cover 는 원본 높이의 가운데 세로 띠를 돌려준다", () => {
    // 실측: 715×1440 포스터 width=400 → cover 400×1440(띠) · contain 400×806(비율 유지)
    expect(thumbUrl(PUBLIC, 400)).toContain('resize=contain');
    expect(thumbSrcSet(PUBLIC, 400)!.split(',').every((x) => x.includes('resize=contain') && !x.includes('resize=cover'))).toBe(true);
    expect(thumbUrl(PUBLIC, 400, { fit: 'cover' })).toContain('resize=cover');
  });

  // 소비처 URL 스냅샷 — 소비처가 실제로 넘기는 폭 그대로. 기본값이 바뀌면 여기서 한꺼번에 빨개진다.
  const R = 'https://idsxiqspecrucvfvtgbw.supabase.co/storage/v1/render/image/public/community_images/community/u1/1700000000000-0.webp';
  it.each([
    ['ScheduleCard PosterArea(포스터 카드)', 400],
    ['ScheduleCard PosterArea(목록 로고)', 128],
    ['MyPostersTab 내 포스터', 200],
    ['PostRowCard 글 목록 첨부', 96],
    ['PostDetailModal 첨부', 480],
    ['MyMarketModal 장터', 160],
    ['VenueThumb 매장 사진(lg)', 128],
    ['VenuePage 매장 프로필', 144],
  ])('%s — width=%i 원본 비율 URL', (_name, w) => {
    expect(thumbUrl(PUBLIC, w)).toBe(`${R}?width=${w}&quality=70&format=webp&resize=contain`);
    expect(thumbSrcSet(PUBLIC, w)).toBe(`${R}?width=${w}&quality=70&format=webp&resize=contain 1x, ${R}?width=${w * 2}&quality=70&format=webp&resize=contain 2x`);
  });

  it("소비처는 fit 을 따로 넘기지 않는다 — 누가 cover 를 붙이면 그 화면만 다시 띠가 된다(필요하면 이 목록에 사유와 함께 올린다)", () => {
    const files = ['components/features/ScheduleCard.tsx', 'components/features/MyPostersTab.tsx', 'components/features/community/PostRowCard.tsx',
      'components/features/PostDetailModal.tsx', 'components/features/MyMarketModal.tsx', 'components/atoms/VenueThumb.tsx', 'components/features/VenuePage.tsx'];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), 'src', f), 'utf8');
      expect(src, f).toMatch(/thumbUrl\(/);
      expect(src, f).not.toMatch(/fit:\s*'cover'/);
    }
  });

  it('스토리지가 아닌 URL·빈 값은 변환하지 않는다', () => {
    expect(thumbUrl('blob:http://localhost/abc', 480)).toBe('blob:http://localhost/abc');
    expect(thumbUrl('https://example.com/a.png', 480)).toBe('https://example.com/a.png');
    expect(thumbUrl(undefined, 480)).toBeUndefined();
    expect(thumbUrl('', 480)).toBeUndefined();
  });

  it('srcSet 은 1x/2x 두 폭을 낸다', () => {
    const s = thumbSrcSet(PUBLIC, 88)!;
    expect(s).toContain('width=88');
    expect(s).toContain('width=176');
    expect(s).toContain(' 1x,');
    expect(s).toContain(' 2x');
  });

  it('변환 대상이 아니면 srcSet 자체를 만들지 않는다(브라우저가 깨진 후보를 고르지 않게)', () => {
    expect(thumbSrcSet('blob:http://localhost/abc', 88)).toBeUndefined();
    expect(thumbSrcSet(undefined, 88)).toBeUndefined();
  });
});
