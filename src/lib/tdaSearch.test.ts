// TDA 검색 계약 — 이 단계가 AI 답변의 **근거**를 고른다.
// 여기서 엉뚱한 규칙을 집으면 AI 는 그 엉뚱한 번호를 확신에 차서 인용한다. 그래서 실제 데이터로 못박는다.
import { describe, it, expect } from 'vitest';
import { searchTda, toContext } from './tdaSearch';
import { TDA_RULES } from '../data/tdaRules';

const nos = (q: string, n = 6) => searchTda(TDA_RULES, q, n).map((h) => h.rule.no);
const titles = (q: string, n = 6) => searchTda(TDA_RULES, q, n).map((h) => h.rule.title);

describe('TDA 데이터 자체의 건전성', () => {
  it('규칙 1~71 이 빠짐없이 있다 — 번호가 틀리면 이 기능은 해롭다', () => {
    const numbered = new Set(TDA_RULES.filter((r) => r.section !== '2024 실전 예제 부록' && r.no !== null).map((r) => r.no));
    const missing = Array.from({ length: 71 }, (_, i) => i + 1).filter((n) => !numbered.has(n));
    expect(missing, `빠진 규칙 번호: ${missing.join(', ')}`).toEqual([]);
  });

  it('본문·제목이 빈 항목이 없고, 매 쪽 저작권 머리말이 본문에 섞여 있지 않다', () => {
    for (const r of TDA_RULES) {
      expect(r.title.trim().length, `빈 제목: ${r.no}`).toBeGreaterThan(0);
      expect(r.body.trim().length, `빈 본문: ${r.title}`).toBeGreaterThan(0);
      expect(r.body).not.toContain('© Copyright');
    }
  });

  it('모든 항목에 검색 키워드가 충분히 있다 — 검색 품질의 대부분이 여기서 나온다', () => {
    for (const r of TDA_RULES) expect(r.keywords.length, r.title).toBeGreaterThanOrEqual(5);
  });
});

describe('구어체 질문 → 관련 규칙', () => {
  it('"딜러가 카드를 쏟았어요" — 노출·낙장 관련 규칙이 최상위에 온다', () => {
    const t = titles('딜러가 카드를 쏟았어요');
    expect(t.length).toBeGreaterThan(0);
    // 카드가 바닥에 떨어지거나 노출된 상황을 다루는 규칙이 걸려야 한다
    expect(t.join(' ')).toMatch(/카드|딜|노출|낙장|바닥/);
  });

  it('조사가 붙어도 찾는다 — "칩을", "칩이", "칩" 이 같은 곳을 가리킨다', () => {
    const a = nos('칩을 세는 방법');
    const b = nos('칩 세는 방법');
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]).toBe(b[0]);
  });

  it('번호로 바로 찾을 수 있다 — "규칙 43"', () => {
    expect(nos('규칙 43')[0]).toBe(43);
    expect(nos('43번')[0]).toBe(43);
  });

  it('아무 관련 없는 말은 **빈 결과**다 — 억지로 채우면 AI 가 없는 조항을 만든다', () => {
    expect(searchTda(TDA_RULES, 'zzzzqqq')).toEqual([]);
    expect(searchTda(TDA_RULES, 'ㅋ')).toEqual([]);  // 2글자 미만은 검색하지 않는다
  });

  it('결과 수는 요청한 만큼만 — AI 프롬프트가 무한정 길어지지 않게', () => {
    expect(searchTda(TDA_RULES, '플레이어 카드 칩 액션', 3).length).toBeLessThanOrEqual(3);
  });
});

describe('AI 근거 묶음', () => {
  it('규칙 번호를 반드시 포함한다 — 인용의 근거이자 이 기능의 존재 이유', () => {
    const ctx = toContext(searchTda(TDA_RULES, '올인 콜', 3));
    expect(ctx).toMatch(/규칙 \d+\./);
    expect(ctx).toMatch(/쪽\)/);
  });

  it('결과가 없으면 빈 문자열 — 근거 없이 AI 를 부르지 않는다', () => {
    expect(toContext(searchTda(TDA_RULES, 'zzzzqqq'))).toBe('');
  });
});
