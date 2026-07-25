// 게시글 첨부 사진 표시가 전적으로 의존하는 썸네일 URL 계약을 고정한다.
// 특히 format=webp 누락은 이 리포에서 실제로 겪은 함정이라(빼면 JPEG 로 변환돼 원본보다 커진다)
// 회귀하면 조용히 Egress 만 잡아먹는다 — 눈에 안 보이는 종류의 손해라 테스트로 못 박는다.
import { describe, it, expect } from 'vitest';
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
