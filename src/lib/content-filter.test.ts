// UGC 금칙어 — '환전' 계열(2026-09-27 오너). 막을 것과 **막으면 안 되는 것**을 같이 잠근다.
// 막을 것: 대상 없는 권유("환전 해드립니다")까지. 통과: 부정·경고문(운영 공지·매장 안내) · 여행 환전 · 일반 글.
// 서버(contains_blocked_ugc · shout_blocked)는 같은 원문(CASH_OUT_SOURCE)을 써야 한다 — 같은 표를 운영 DB 리허설로도 돌렸다.
// 실행: npx vitest run src/lib/content-filter.test.ts
import { describe, it, expect } from 'vitest';
import { filterContent, CASH_OUT_SOURCE } from './content-filter';

export const MUST_BLOCK = [
  '환전 해드립니다 연락주세요',
  '환전해드려요',
  '칩 환전 가능',
  '포인트 환전 문의',
  '환전 문의 주세요',
  '환전 가능합니다',
  '환전합니다 카톡 주세요',
  '현금화 문의',
  '상금 환전 해줌',
  'GP환전',
  '게임머니 환전',
  '환전 업체 소개',
  '환전 가능한 곳 있나요',
];
export const MUST_PASS = [
  '환전 안 됩니다',
  '환전은 불가합니다',
  '칩 환전은 안 됩니다',
  '현금화는 불법입니다',
  '현금화 절대 금지',
  '환전 문의는 사절합니다',
  '환전 문의 받지 않습니다',
  '환전 해드리지 않습니다',
  '환전 불가능',
  '마카오 가서 달러 환전했어요',
  '엔화 환전 어디서 하나요',
  '환전 요청 받으면 신고해 주세요',
  '버블에서 숏스택일 때 푸시 레인지 질문',
];

describe('filterContent — 환전 계열', () => {
  it.each(MUST_BLOCK)('막는다: %s', (t) => {
    const r = filterContent(t);
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain('현금화·환전');
  });
  it.each(MUST_PASS)('통과시킨다(오탐 아님): %s', (t) => {
    expect(filterContent(t).blocked).toBe(false);
  });
  it('서버와 공유하는 원문은 PostgreSQL ARE 가 못 읽는 문법(뒤돌아보기·이름 그룹)을 쓰지 않는다', () => {
    expect(CASH_OUT_SOURCE).not.toMatch(/\(\?<[=!]|\(\?<\w/);
  });
});
