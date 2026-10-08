import { describe, expect, it } from 'vitest';
import { breakLabelEm, breakLabelFontSize } from './breakLabelFit';

// 2026-10-09 실측(1920×1080 TV 보드의 브레이크 라벨과 같은 computed font · 800 · tabular-nums, em = 폭 ÷ font-size).
//   on = Pretendard Variable, off = 폰트 차단(크기 맞춘 폴백). 추정이 이보다 작으면 한 줄 크기로 두 줄이 되어 칸 높이를 넘는다.
const MEASURED: [string, number, number][] = [
  ['BREAK', 3.295, 3.192],
  ['BREAK 8Min.', 6.253, 6.232],
  ['BREAK 10 MINS', 7.591, 7.693],
  ['BREAK TIME 8 MINS', 9.563, 9.86],
  ['BREAK TIME 8 MINS / 1,000칩 레이스', 17.023, 17.934],
  ['REG CLOSE 8 MINS / 500칩 레이스', 15.58, 16.423],
  ['저녁 식사 휴식 30분', 8.06, 9.214],
  ['Color Up 25s', 6.261, 6.228],
];

describe('breakLabelEm — 칸 폭 맞춤용 글자 폭 추정', () => {
  it.each(MEASURED)('%s: 실측(on %f · off %f) 이상이고, 과대 추정은 15% 이내', (text, on, off) => {
    const em = breakLabelEm(text);
    expect(em).toBeGreaterThanOrEqual(Math.max(on, off));
    expect(em).toBeLessThanOrEqual(Math.max(on, off) * 1.15);
  });

  it('글자 크기 식은 칸 폭(--clk-half − 패딩 4cqmin)을 em 으로 나누고, 종전 한 줄 크기(상한)와 그 ÷2.2(두 줄 하한) 사이에 묶인다', () => {
    const f = breakLabelFontSize('BREAK TIME 8 MINS');
    expect(f).toBe(`max(calc(clamp(24px, 6.4cqmin, 108px) / 2.2), min(clamp(24px, 6.4cqmin, 108px), calc((var(--clk-half, 50cqw) - 4cqmin) / ${breakLabelEm('BREAK TIME 8 MINS').toFixed(3)})))`);
  });
});
