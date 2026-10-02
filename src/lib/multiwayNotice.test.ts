// 2026-10-02 오너 결정 "푸시폴드 2~5bb 전부 공개(설명 표시)" — 2~5bb 뒤 3명+ 다인 균형 칸의 안내가 세 곳(차트·드릴·스팟 평가)에 붙는지 잠근다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptySpot, type SpotReview } from './spot';
import { evaluateSpot } from './spotEvaluate';
import { makeQuiz } from './preflopQuiz';
import { isMultiwayUncapped, MULTIWAY_NOTICE_FULL } from './nash.data';

const spot = (over: Partial<SpotReview>): SpotReview => ({ ...emptySpot(), hero: ['As', 'Ks'], ...over });

describe('2~5bb 다인 균형 안내', () => {
  it('판별식: 빅앤티 · 뒤 3명+ · 2~5bb 만', () => {
    expect(isMultiwayUncapped(3, 3, true)).toBe(true);
    expect(isMultiwayUncapped(5, 8, true)).toBe(true);
    expect(isMultiwayUncapped(6, 3, true)).toBe(false);   // 6~10bb 는 추정 배지가 따로 있다
    expect(isMultiwayUncapped(3, 2, true)).toBe(false);   // BTN·SB 는 정확 균형
    expect(isMultiwayUncapped(3, 3, false)).toBe(false);  // 노앤티는 이 표가 아니다
  });

  it('안내 문장은 오너가 정한 뜻을 담는다(환전·수익 표현 없음)', () => {
    expect(MULTIWAY_NOTICE_FULL).toContain('콜 인원 제한 없음');
    expect(MULTIWAY_NOTICE_FULL).toContain('숏스택');
    expect(MULTIWAY_NOTICE_FULL).not.toMatch(/환전|현금|수익/);
  });

  it('스팟 평가: CO 3bb 빅앤티는 notes 에 안내가 붙고, 판정 등급은 그대로 chart_nash', () => {
    const e = evaluateSpot(spot({ tableSize: 9, heroPos: 'CO', villainPos: 'BB', effectiveBb: 4, anteBb: 1 }));   // S = 4 − 1(BB앤티) = 3
    expect(e.kind).toBe('chart_nash');
    expect(e.notes).toContain(MULTIWAY_NOTICE_FULL);
  });

  it('스팟 평가: 12bb · SB 3bb 에는 안내가 없다', () => {
    expect(evaluateSpot(spot({ tableSize: 9, heroPos: 'CO', villainPos: 'BB', effectiveBb: 13, anteBb: 1 })).notes).not.toContain(MULTIWAY_NOTICE_FULL);
    expect(evaluateSpot(spot({ tableSize: 9, heroPos: 'SB', villainPos: 'BB', effectiveBb: 4, anteBb: 1 })).notes).not.toContain(MULTIWAY_NOTICE_FULL);
  });

  it('드릴: 2~5bb k≥3 푸시·콜 문제에만 multiway 가 켜진다', () => {
    expect(makeQuiz('push', 'push|3-3|AKs').multiway).toBe(true);
    expect(makeQuiz('call', 'call|bb-3-4|AKs').multiway).toBe(true);
    expect(makeQuiz('push', 'push|2-3|AKs').multiway).toBeUndefined();
    expect(makeQuiz('push', 'push|3-12|AKs').multiway).toBeUndefined();
  });

  it('화면 연결: 차트와 문제 카드가 같은 컴포넌트를 쓴다', () => {
    const rd = (p: string) => readFileSync(p, 'utf8');
    expect(rd('src/components/features/tools/PushFoldChart.tsx')).toMatch(/isMultiwayUncapped\(stack, k, true\) && <MultiwayNotice/);
    expect(rd('src/components/features/tools/quizCards.tsx')).toMatch(/quiz\.multiway && <MultiwayNotice/);
  });
});
