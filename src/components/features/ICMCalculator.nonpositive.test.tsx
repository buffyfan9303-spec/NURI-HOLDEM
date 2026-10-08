// H03-02 — 미입력·0·비정상 스택이면 **어느 결과 탭에서도** 금액·차이를 그리지 않는다(경고문과 금액 표가 동시에 보이던 결함).
// 스택 초기값만 바꿔 렌더한다: useState 를 감싸 기본 스택 [5000,3000,2000] 자리에 시험 값을 넣는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ stacks: null as number[] | null }));
vi.mock('react', async (orig) => {
  const R = await orig<typeof import('react')>();
  const useState = ((init: unknown) =>
    R.useState(h.stacks && Array.isArray(init) && init.join() === '5000,3000,2000' ? h.stacks : init)) as typeof R.useState;
  return { ...R, default: { ...R, useState }, useState };
});
const { default: ICMCalculator } = await import('./ICMCalculator');

const td = (html: string) =>
  [...(html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].split(/<[^>]*>/).join('')));

beforeEach(() => { h.stacks = null; });

describe('ICM — 비정상 스택이면 금액 0칸', () => {
  for (const bad of [[5000, 0, 0], [5000, 3000, 0], [5000, NaN, 2000], [5000, -10, 2000]]) {
    it(`[${bad}] — 딜 비교 표·찹 표·기대 지분 금액 없음`, () => {
      h.stacks = bad;
      const deal = renderToStaticMarkup(<ICMCalculator initialMode="deal" />);
      expect(deal).toContain('1 이상</b>이어야 계산합니다');
      expect(deal).not.toContain('ICM 딜</th>');
      expect(deal).not.toContain('>차이<');
      const chop = renderToStaticMarkup(<ICMCalculator variant="chop" />);
      expect(chop).not.toContain('icm-chop-table');
      const eq = renderToStaticMarkup(<ICMCalculator />);
      expect(eq).toContain('1 이상</b>이어야 계산합니다');
      expect(eq).not.toMatch(/\d+\.\d\d<span[^>]*>\(/); // '39.53 (50.0%)' 꼴 금액 없음
      const pr = renderToStaticMarkup(<ICMCalculator initialMode="pressure" />);
      expect(pr).toContain('1 이상의 스택을 넣어야');
    });
  }
});

describe('ICM — 유효 입력은 독립 계산과 같다', () => {
  it('[5000,3000,2000] · 상금 40/24/15 — Malmuth-Harville 순열 직접 합산', () => {
    const s = [5000, 3000, 2000], p = [40, 24, 15], T = 10000;
    const ev = [0, 0, 0];
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      const pr = (s[a] / T) * (s[b] / (T - s[a]));
      ev[a] += pr * p[0]; ev[b] += pr * p[1]; ev[c] += pr * p[2];
    }
    // 손 계산 P1: 1위 0.5×40=20 · 2위 (0.3×5/7+0.2×5/8=0.3393)×24=8.143 · 3위 0.1607×15=2.411 → 30.554
    expect(ev.map((v) => +v.toFixed(3))).toEqual([30.554, 25.875, 22.571]);
    const rows = td(renderToStaticMarkup(<ICMCalculator initialMode="deal" />));
    const icm = rows.map((r) => Number(r[2])), chopCol = rows.map((r) => Number(r[3]));
    icm.forEach((v, i) => expect(Math.abs(v - ev[i])).toBeLessThanOrEqual(0.1 + 1e-9)); // 최대잔여법 반올림 = 표시 단위(0.1) 1칸 이내
    expect(icm.reduce((a, b) => a + b, 0)).toBeCloseTo(79, 9);
    expect(chopCol).toEqual([39.5, 23.7, 15.8]);
    expect(chopCol.reduce((a, b) => a + b, 0)).toBeCloseTo(79, 9);
  });
});
