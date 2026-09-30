import { describe, it, expect } from 'vitest';
import { clockPagesBlocked } from './clockSlides';

describe('§28 — 클락 시상 문구·추가 페이지 금칙 표현 사전 검사(서버 contains_blocked_ugc 와 같은 칸)', () => {
  it('정상 문구는 통과', () => {
    expect(clockPagesBlocked([{ text: '시드권 + 트로피', note: '결승 직행' }],
      [{ kind: 'bounty', title: '바운티 안내', rows: [{ label: '헤드', content: '1만 칩' }] }])).toBeNull();
  });
  it('시상 메모·추가 페이지 내용의 환전 표현을 막는다', () => {
    expect(clockPagesBlocked([{ note: '현금 환전 해드림' }], [])).toMatch(/현금 환전 해드림/);
    expect(clockPagesBlocked([], [{ kind: 'notice', title: '안내', rows: [{ label: '칩', content: '칩 환전 가능' }] }])).toMatch(/칩 환전 가능/);
  });
});
