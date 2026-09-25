// composePlan — 간격 반복 우선순위 계약: 오늘 due 복습(오래된 순, 최대 4) → 프리플랍 오답 큐 → 약점 카테고리.
// 복원 안 되는 SRS 키는 조용히 버려지고 저장소에서도 지워진다. 날짜는 시드이자 '오늘'(고정).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { composePlan } from './drillPlan';
import { SCENARIOS } from './postflop.data';
import { PREFLOP_STAT_KEY } from '../../../lib/preflopQuiz';
import { SRS_KEY, type SrsMap } from '../../../lib/srs';

function makeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 } as Storage;
}
beforeEach(() => { vi.stubGlobal('localStorage', makeStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

const TODAY = '2026-09-03';
const seed = (srs: SrsMap, wrong: string[] = []) => {
  localStorage.setItem(SRS_KEY, JSON.stringify(srs));
  localStorage.setItem(PREFLOP_STAT_KEY, JSON.stringify({ total: 0, correct: 0, streak: 0, best: 0, wrong }));
};
const [s0, s1, s2, s3, s4] = SCENARIOS.map((s) => s.id);
// ⚠ 푸시 픽스처는 **게시 중인 깊이**여야 한다 — 격리된 조합(빅앤티 k≥2 의 2~10bb)은 makeQuiz 가 복원을 거부해서
//   이 계약이 "복원 안 되는 키" 쪽으로 새어 나간다. 2026-09-19 에 10bb → 15bb 로 옮겼다(nash.data.ts 의 NASH_ANTE_QUARANTINE).

describe('composePlan · 간격 반복 우선', () => {
  it('오늘 due 인 복습이 오래된 순으로 앞에 서고, 내일 due 는 빠진다', () => {
    seed({
      [`post|${s0}`]: { box: 1, due: '2026-09-02' },
      'push|2-15|A5s': { box: 0, due: '2026-08-30' },
      [`post|${s1}`]: { box: 0, due: TODAY },
      [`post|${s2}`]: { box: 0, due: '2026-09-04' },
    });
    const p = composePlan(TODAY);
    expect(p.items.slice(0, 3)).toEqual([
      { kind: 'preflop', key: 'push|2-15|A5s', reason: '복습 · 5일 만에', review: true },
      { kind: 'postflop', id: s0, reason: '복습 · 4일 만에', review: true },
      { kind: 'postflop', id: s1, reason: '복습 · 1일 만에', review: true },
    ]);
    expect(p.items).toHaveLength(5);
    expect(p.items.filter((it) => it.review)).toHaveLength(3);
    expect(p.items.some((it) => it.kind === 'postflop' && it.id === s2)).toBe(false);
  });

  it('복습은 최대 4개 — 새 문제 1개는 남긴다', () => {
    seed(Object.fromEntries([s0, s1, s2, s3, s4].map((id) => [`post|${id}`, { box: 0, due: '2026-09-01' }])));
    const p = composePlan(TODAY);
    expect(p.items.filter((it) => it.review)).toHaveLength(4);
    expect(p.items).toHaveLength(5);
    expect(p.items[4].review).toBeUndefined();
  });

  it('복습 다음은 프리플랍 오답 큐(최근 것부터, 복습에 든 키 제외) → 나머지는 포스트플랍', () => {
    seed({ 'push|2-15|A5s': { box: 0, due: '2026-09-01' } }, ['push|1-5|K9o', 'push|2-15|A5s', 'push|3-12|QJs']);
    const p = composePlan(TODAY);
    expect(p.items[0]).toMatchObject({ kind: 'preflop', key: 'push|2-15|A5s', review: true });
    // 프리플랍 슬롯 2 중 1 은 복습이 썼다 → 큐에서 1개(최근 것)만
    expect(p.items[1]).toEqual({ kind: 'preflop', key: 'push|3-12|QJs', reason: '오답 노트 · 틀렸던 핸드' });
    expect(p.items.slice(2).every((it) => it.kind === 'postflop')).toBe(true);
    expect(p.items).toHaveLength(5);
  });

  it('복원 안 되는 키는 건너뛰고 SRS 에서 지운다', () => {
    seed({ 'rfi|no_such_spot|AKs': { box: 0, due: '2026-09-01' }, 'post|999999': { box: 2, due: '2026-09-01' }, [`post|${s0}`]: { box: 0, due: '2026-09-01' } });
    const p = composePlan(TODAY);
    expect(p.items.filter((it) => it.review)).toEqual([{ kind: 'postflop', id: s0, reason: '복습 · 3일 만에', review: true }]);
    expect(Object.keys(JSON.parse(localStorage.getItem(SRS_KEY)!))).toEqual([`post|${s0}`]);
  });

  it('복원 안 되는 오답 큐 키(격리 구간)는 건너뛰고 오답 큐 저장소에서도 지운다', () => {
    // push|3-5|A5s: 빅앤티 k=3(CO) · 5bb — NASH_ANTE_QUARANTINE 격리 구간이라 makeQuiz 가 복원을 거부한다.
    //   (2026-09-25 까지는 push|2-5 였다 — k=2 는 정확 3인 균형으로 격리에서 빠져 이제 복원된다. 아래 양성 대조.)
    seed({}, ['push|3-5|A5s', 'push|3-12|QJs']);
    const p = composePlan(TODAY);
    const preflopKeys = p.items.filter((it) => it.kind === 'preflop').map((it) => (it as { key: string }).key);
    expect(preflopKeys).not.toContain('push|3-5|A5s');
    expect(JSON.parse(localStorage.getItem(PREFLOP_STAT_KEY)!).wrong).toEqual(['push|3-12|QJs']);
  });

  it('BTN(k=2) 5bb 오답 큐 키는 복원된다 — 정확 3인 균형이라 격리가 아니다(2026-09-25 양성 대조)', () => {
    seed({}, ['push|2-5|A5s']);
    const p = composePlan(TODAY);
    expect(p.items.filter((it) => it.kind === 'preflop').map((it) => (it as { key: string }).key)).toContain('push|2-5|A5s');
    expect(JSON.parse(localStorage.getItem(PREFLOP_STAT_KEY)!).wrong).toEqual(['push|2-5|A5s']);
  });

  it('SRS 가 비면 예전 편성 그대로(프리플랍 1 + 포스트플랍 4, 같은 날 같은 결과)', () => {
    seed({});
    const a = composePlan(TODAY);
    const b = composePlan(TODAY);
    expect(a.items.filter((it) => it.kind === 'preflop')).toHaveLength(1);
    expect(a.items.filter((it) => it.kind === 'postflop')).toHaveLength(4);
    expect(a.items.filter((it) => it.kind === 'postflop')).toEqual(b.items.filter((it) => it.kind === 'postflop'));
  });
});
