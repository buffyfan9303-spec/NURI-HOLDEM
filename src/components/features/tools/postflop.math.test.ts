// 2026-10-01 글 감사(gto-text-audit-1001.md A1~A4·A8·A13·A17) — 드릴 해설의 수학·카드 사실과 용어 표기를 식으로 잠근다.
// 해설 문장은 사람이 쓰므로 틀리기 쉽다. 숫자는 이 파일의 식으로 재현하고, 문구는 되돌리면 실패하는 음성 대조로 둔다.
// 계산 로직·정답은 건드리지 않는다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SCENARIOS } from './postflop.data';
import { GLOSSARY_TERMS } from './glossary.data';

const why = (id: number) => SCENARIOS.find((s) => s.id === id)!.why;

/** 지오메트릭 벳(팟 비율): f = ((1 + 2·S/P)^(1/n) − 1) / 2. S 유효 스택, P 팟, n 남은 벳 횟수. */
const geometric = (S: number, P: number, n: number) => (Math.pow(1 + (2 * S) / P, 1 / n) - 1) / 2;
/** 팟 P 에 비율 f 로 n 번 벳·콜할 때 들어가는 총 칩. */
const invested = (P: number, f: number, n: number) => {
  let pot = P, sum = 0;
  for (let i = 0; i < n; i++) { const bet = pot * f; sum += bet; pot += 2 * bet; }
  return sum;
};

describe('드릴 해설 수치 — 식으로 재현', () => {
  it('#42 팟 12 · 스택 88 · 2스트리트의 지오메트릭은 약 148% 팟이고 ⅔팟은 26.7bb 만 넣는다', () => {
    expect(geometric(88, 12, 2)).toBeCloseTo(1.479, 2);
    expect(invested(12, 2 / 3, 2)).toBeCloseTo(26.67, 1);
    expect(invested(12, geometric(88, 12, 2), 2)).toBeCloseTo(88, 5); // 식 자체의 자가검증
    expect(why(42)).toContain('148%');
    expect(why(42), '지오메트릭 ≈⅔팟씩 이라는 틀린 문구가 되살아났다').not.toMatch(/지오메트릭[^)]*≈⅔/);
  });

  it('#45 팟 20 · 스택 90 에서 ⅓팟 3번은 약 36bb(스택의 40%)뿐이고, 3스트리트 지오메트릭은 약 58%', () => {
    expect(invested(20, 1 / 3, 3)).toBeCloseTo(36.3, 1);
    expect(geometric(90, 20, 3)).toBeCloseTo(0.577, 2);
    expect(why(45), '⅓팟으로 스택이 자연히 들어간다는 틀린 설명이 되살아났다').not.toContain('자연히');
  });

  it('#34 보드 T9427 에서 8x+6x 는 스트레이트가 완성된 밸류다(블러프가 아님)', () => {
    const ranks = [8, 6, 10, 9, 7]; // 영웅 아닌 상대 86 + 보드 T·9·7
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(sorted.every((r, i) => i === 0 || r === sorted[i - 1] + 1)).toBe(true);
    expect(why(34), '86 을 미스드 스트레이트 블러프라 부르는 틀린 문구').not.toContain('QJ·86류');
    expect(why(34)).toContain('86·J8');
  });

  it('#13 턴 스팟(리버 한 장 남음)에는 백도어 드로우가 없다', () => {
    expect(why(13)).not.toContain('백도어');
  });

  it('#47 KK 승률은 AK·AA·88·33 전수 기준 약 5%다(~25% 아님) — scratchpad audit2/q47.py 5.3%', () => {
    expect(why(47)).toContain('약 5%');
    expect(why(47)).not.toContain('~25%');
  });
});

describe('용어 표기 통일 (A8·A13·A17)', () => {
  const terms = GLOSSARY_TERMS.map((t) => t.term);
  it('용어사전은 "아웃츠"(앱 전체 표기)이며 옛 표기 "아우츠"는 설명 안 동의어로만 남는다', () => {
    expect(terms).toContain('아웃츠');
    expect(terms).not.toContain('아우츠');
    expect(GLOSSARY_TERMS.find((t) => t.term === '아웃츠')!.desc).toContain('아우츠');
  });
  it('시벳 항목이 있고 C벳으로도 검색된다', () => {
    const e = GLOSSARY_TERMS.find((t) => t.term === '시벳');
    expect(e).toBeTruthy();
    expect(`${e!.term}${e!.en}${e!.desc}`).toContain('C벳');
  });
  it('수딧으로 통일 — 옛 표기 수티드는 설명 동의어로만 남는다', () => {
    expect(terms).toContain('수딧');
    expect(terms).toContain('수딧 커넥터');
    expect(terms.some((t) => t.includes('수티드'))).toBe(false);
    for (const s of SCENARIOS) expect(s.why).not.toContain('수티드');
  });
  it('TDA 리바인 표기 통일 · 규칙 날짜는 공식 페이지(9월 7일)', () => {
    const tda = readFileSync(join(process.cwd(), 'src/data/tdaRules.ts'), 'utf-8');
    expect(tda).not.toContain('리바이(Re-buys)');
    expect(tda).toContain('2026년 9월 7일');
    expect(tda).not.toContain('2026 권장 절차');
  });
});
