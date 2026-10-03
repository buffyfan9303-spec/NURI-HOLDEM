// settle-fix 후속 ⑤(2026-10-03) — 매장 순위 지표의 '머니인'은 순위 등재(입상) **횟수**다. 정산 판의 '머니인 가치'(넣은 금액)와
//   같은 단어면 두 화면이 다른 뜻이 된다(dummy-1003 O4 · 리드 결정, CustomerAnalytics 와 같은 정리). 라벨·설명에 '머니인'이 없어야 한다.
//   음성 대조: rankings.ts 의 라벨을 '머니인 횟수' 로 되돌리면 빨개진다.
import { describe, it, expect } from 'vitest';
import { RANK_METRIC_LABEL, RANK_METRIC_DESC } from './rankings';

describe('매장 순위 지표 라벨 — 입상', () => {
  it("라벨·설명에 '머니인'이 없다(입상 횟수·입상 비율)", () => {
    const all = [...Object.values(RANK_METRIC_LABEL), ...Object.values(RANK_METRIC_DESC)];
    expect(all.filter((s) => s.includes('머니인'))).toEqual([]);
    expect(RANK_METRIC_LABEL.moneyin_count).toBe('입상 횟수');
    expect(RANK_METRIC_LABEL.moneyin_rate).toBe('입상 비율');
  });
});
