// applyPostflopAnswer — 트레이너·드릴·오답 노트가 같은 규칙으로 기록을 갱신한다는 계약.
// 오답 노트(wrong)는 최근 40개, 중복 없음, 맞히면 빠진다 — applyPreflopAnswer 와 같은 꼴.
import { describe, it, expect } from 'vitest';
import { EMPTY_POSTFLOP_STATS, SCENARIOS, applyPostflopAnswer, type PostflopStats } from './postflop.data';

const sc = SCENARIOS[0];
const fresh = (): PostflopStats => ({ ...EMPTY_POSTFLOP_STATS, byCat: {}, wrong: [] });

describe('applyPostflopAnswer', () => {
  it('오답이면 총계·카테고리 t 만 오르고 오답 노트 맨 뒤에 id 가 들어간다(중복 없이)', () => {
    const once = applyPostflopAnswer(fresh(), sc, false);
    expect(once).toMatchObject({ total: 1, correct: 0, streak: 0, best: 0, wrong: [sc.id] });
    expect(once.byCat[sc.cat]).toEqual({ t: 1, c: 0 });
    const twice = applyPostflopAnswer(once, sc, false);
    expect(twice.wrong).toEqual([sc.id]);
    expect(twice.total).toBe(2);
  });

  it('정답이면 연속·최고가 오르고 오답 노트에서 빠진다', () => {
    const s = applyPostflopAnswer({ ...fresh(), wrong: [7, sc.id, 9], streak: 2, best: 2 }, sc, true);
    expect(s).toMatchObject({ total: 1, correct: 1, streak: 3, best: 3, wrong: [7, 9] });
    expect(s.byCat[sc.cat]).toEqual({ t: 1, c: 1 });
  });

  it('오답 노트는 최근 40개만 남는다', () => {
    const full = { ...fresh(), wrong: Array.from({ length: 40 }, (_, i) => 1000 + i) };
    const s = applyPostflopAnswer(full, sc, false);
    expect(s.wrong).toHaveLength(40);
    expect(s.wrong[0]).toBe(1001);
    expect(s.wrong[39]).toBe(sc.id);
  });

  it('입력 상태를 변형하지 않는다(순수 함수)', () => {
    const s = fresh();
    applyPostflopAnswer(s, sc, false);
    expect(s.wrong).toEqual([]);
    expect(s.byCat).toEqual({});
  });
});
