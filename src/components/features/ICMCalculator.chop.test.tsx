// 딜러 탭 찹 분배(variant="chop") — 2026-09-30 오너 "딜러들이 파이널테이블에서 찹 제안이 나오면 ICM 계산기를 돌려
// 상금을 ICM대로 분배 — 그 계산기만 남기고 다른 건 다 빼줘". 딜러 탭(DealerCommunity)만 바뀌고
// GTO 도구 탭(ToolsPanel 'icm'·'deal')은 기본 variant 라 그대로여야 한다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ICMCalculator from './ICMCalculator';

/** 셀 안 태그를 글자만 남을 때까지 지운다(한 번만 지우면 겹친 태그가 남는다 — CodeQL js/incomplete-multi-character-sanitization). */
function stripTags(html: string): string {
  let prev: string;
  let s = html;
  do { prev = s; s = s.replace(/<[^>]*>/g, ''); } while (s !== prev);
  return s;
}

/** 표의 n번째 열(0부터) 숫자를 tbody 행 순서대로 뽑는다 */
function column(html: string, col: number): number[] {
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  return [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => {
    const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1]));
    return Number(cells[col].replace(/,/g, ''));
  });
}

describe('ICMCalculator variant="chop" — 딜러 탭 찹 분배', () => {
  const chop = renderToStaticMarkup(<ICMCalculator variant="chop" />);
  const deal = renderToStaticMarkup(<ICMCalculator initialMode="deal" />);

  it('ICM 분배 하나만 — 모드 탭·콜 압박·칩찹·차이·버블 프리셋이 없다', () => {
    expect(chop).toContain('찹(딜) 분배 — ICM');
    expect(chop).toContain('data-testid="icm-chop-table"');
    for (const gone of ['기대 지분', '콜 압박', '딜 비교', '칩찹', '>차이<', '버블', 'role="tablist"']) {
      expect(chop, `딜러 탭에 '${gone}' 이 남았다`).not.toContain(gone);
    }
  });

  it('분배 금액 = 딜 비교 모드의 ICM 딜 열(같은 계산·같은 반올림), 합계 = 분배 상금', () => {
    const shares = column(chop, 2);
    expect(shares).toHaveLength(3);
    expect(shares).toEqual(column(deal, 2));
    // 기본 입력: 3명 · 상금 [40,24,15,10,7,4] → 인원만큼 상위 3자리 = 79 가 분배된다
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(79, 9);
    expect(chop).toMatch(/합계<\/th><td[^>]*>10,000<\/td><td[^>]*>79\.0<\/td>/);
    // 상금 자리 > 인원 안내는 남는다(입력 검증)
    expect(chop).toContain('상위 3개만 분배에 반영됩니다');
  });

  it('기본 variant(GTO 도구 탭)는 세 모드·칩찹 비교를 그대로 가진다', () => {
    const equity = renderToStaticMarkup(<ICMCalculator />);
    for (const kept of ['기대 지분', '콜 압박', '딜 비교', '버블: 4명 · 3자리 시상']) expect(equity).toContain(kept);
    expect(equity).not.toContain('icm-chop-table');
    expect(deal).toContain('칩찹');
    expect(deal).not.toContain('찹(딜) 분배 — ICM');
  });
});
