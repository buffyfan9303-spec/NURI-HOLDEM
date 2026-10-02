// 게시판 핸드 분석 모달의 "상위 N%" 는 스타팅 핸드 순위 화면과 **같은 데이터·같은 계산**(기본 = 10인 기준)이다 — 2026-10-01.
// 예전엔 Chen 공식(preflop.ts RANK_PCT)이라 같은 앱이 77 에 "상위 23%" / "3.9%" 를 따로 말하고, AA 가 "상위 0%" 였다.
// 음성 대조: 모달을 RANK_PCT(Chen)로 되돌리거나 10인 대신 헤즈업 기준으로 바꾸면 아래 숫자가 어긋나 실패한다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HandGtoModal from './HandGtoModal';
import StartingHandRankPanel from './tools/StartingHandRankPanel';
import { STARTING_HAND_BY_HAND, STARTING_HAND_ROWS } from './tools/startingHandRank';

/** 모달의 강도 문장만 뽑는다(태그 제거). */
function strengthText(hero: string[]): string {
  const h = renderToStaticMarkup(<HandGtoModal hero={hero} onClose={() => {}} />);
  const m = h.match(/<p[^>]*data-testid="hand-strength"[^>]*>([\s\S]*?)<\/p>/);
  expect(m, '강도 문장(data-testid=hand-strength)이 렌더되지 않았다').toBeTruthy();
  // 태그 사이 글자만 모은다(정규식 치환 대신 '<' 로 자르고 '>' 뒤만 남김 — CodeQL 불완전 정화 경고 회피, #84 와 같은 방식).
  return m![1].split('<').map((s, i) => (i === 0 ? s : s.slice(s.indexOf('>') + 1))).join('').replace(/\s+/g, ' ').trim();
}

const ten = (hand: string) => STARTING_HAND_BY_HAND.ten.get(hand)!;

describe('HandGtoModal 핸드 강도 = 순위 화면(10인 기준)과 같은 값', () => {
  // [카드 2장, 라벨] — Chen 은 이 넷을 크게 어긋나게 냈다(54s 상위 31% · 77 상위 23% · 32o 상위 73% · AA 상위 0%)
  const CASES: [string[], string][] = [
    [['5s', '4s'], '54s'],
    [['7h', '7d'], '77'],
    [['3c', '2d'], '32o'],
    [['As', 'Ad'], 'AA'],
  ];
  for (const [hero, label] of CASES) {
    it(`${label}: 순위 화면의 n위·상위 x.x% 와 글자까지 같다`, () => {
      const r = ten(label);
      const t = strengthText(hero);
      expect(t).toContain(`${r.rank}위`);
      expect(t).toContain(`상위 ${r.topPct.toFixed(1)}%`);
      expect(t).toContain('10인 테이블 기준');
    });
  }

  it('구체값(10인) — 77 은 29위, JTs 는 16위, 54s 는 65위, 72o 는 169위', () => {
    expect(strengthText(['7h', '7d'])).toContain('29위');
    expect(strengthText(['Jh', 'Th'])).toContain('16위');
    expect(strengthText(['5s', '4s'])).toContain('65위');
    expect(strengthText(['7c', '2d'])).toContain('169위');
    expect(strengthText(['7c', '2d'])).toContain('상위 100.0%');
  });

  it('헤즈업 기준 값이 섞여 나오지 않는다 — 헤즈업 77 9위 · 32o 169위 · 승률 숫자', () => {
    const t77 = strengthText(['7h', '7d']);
    expect(t77).not.toMatch(/(^|\D)9위/);
    expect(t77).not.toContain('헤즈업');
    expect(t77).not.toMatch(/승률|\d%\)/);
    // 32o 는 헤즈업에선 169위(꼴찌)지만 10인에선 159위
    expect(strengthText(['3c', '2d'])).toContain('159위');
  });

  it('AA 는 "상위 0%" 가 아니다(자기 포함 누적 0.5%)', () => {
    const t = strengthText(['As', 'Ad']);
    expect(t).toContain('1위');
    expect(t).toContain('상위 0.5%');
    expect(t).not.toMatch(/상위 0%/);
  });
});

describe('스타팅 핸드 순위 화면 — 기본값은 10인 기준', () => {
  const html = renderToStaticMarkup(<StartingHandRankPanel />);

  it('기본으로 10인 기준 문구와 순위 목록(AA 1 · KK 2 · QQ 3 · AKs 4)이 나온다', () => {
    expect(html).toContain('10인 테이블 기준');
    expect(html).toContain('aria-label="AA 1위"');
    expect(html).toContain('aria-label="AKs 4위"');
    // 헤즈업 기준 4위는 JJ 다 — 기본이 헤즈업으로 바뀌면 여기서 갈린다
    expect(html).not.toContain('aria-label="JJ 4위');
    expect(html).toContain('aria-label="77 29위"');
  });

  it('10인 모드에서는 헤즈업 승률(%)을 한 군데도 싣지 않는다', () => {
    expect(html).not.toMatch(/승률 \d/);
    expect(html).not.toMatch(/aria-label="[A-Z0-9]{2,3} \d+위 승률/);
    // 목록 오른쪽 칸은 승률 대신 상위 %
    expect(html).toContain('상위 0.5%');
  });

  it('두 기준의 행 수는 169 로 같고 데이터는 각자 그대로다(헤즈업 정확 데이터 보존)', () => {
    expect(STARTING_HAND_ROWS.ten).toHaveLength(169);
    expect(STARTING_HAND_ROWS.hu).toHaveLength(169);
    expect(STARTING_HAND_ROWS.hu[0].eq).toBe(85.2);
    expect(STARTING_HAND_ROWS.ten[0].eq).toBeNull();
    expect(STARTING_HAND_BY_HAND.hu.get('77')!.rank).toBe(9);
    expect(STARTING_HAND_BY_HAND.ten.get('77')!.rank).toBe(29);
    for (const b of ['ten', 'hu'] as const) expect(STARTING_HAND_ROWS[b][168].topPct).toBeCloseTo(100, 9);
  });
});
