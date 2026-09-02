// 매장 설정의 카카오톡 링크 저장 게이트 — 비움은 삭제('')로, 형식 오류는 null 로 갈라져야
// 화면이 '삭제'와 '거부'를 구분한다.
import { describe, it, expect } from 'vitest';
import { normalizeKakaoUrl } from './venueContacts';

describe('normalizeKakaoUrl', () => {
  it('비우면 삭제 신호("")', () => {
    expect(normalizeKakaoUrl('')).toBe('');
    expect(normalizeKakaoUrl('   ')).toBe('');
  });
  it('http(s) URL 은 trim 해서 통과', () => {
    expect(normalizeKakaoUrl('  https://open.kakao.com/o/gAbCdEf  ')).toBe('https://open.kakao.com/o/gAbCdEf');
    expect(normalizeKakaoUrl('http://example.com/room')).toBe('http://example.com/room');
  });
  it('URL 이 아니거나 http(s) 가 아니면 거부(null)', () => {
    expect(normalizeKakaoUrl('open.kakao.com/o/gAbCdEf')).toBeNull();
    expect(normalizeKakaoUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeKakaoUrl('카톡 주세요')).toBeNull();
  });
});
