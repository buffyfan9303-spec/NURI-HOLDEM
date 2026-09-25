// 20260925g N14 — 승인된 포스터 재심사 안내는 여섯 칸이 **실제로** 바뀌었을 때만.
import { describe, it, expect } from 'vitest';
import { posterCoreChanged, type PosterCoreForm, type PosterCoreSaved } from './posterReview';

const saved: PosterCoreSaved = { title: '데일리 메인', buyIn: { amount: 100_000 }, guaranteed: true, prizePool: 5_000_000, date: '2026-10-01', startTime: '19:00' };
const same: PosterCoreForm = { title: '데일리 메인', buyIn: 100_000, prizeType: 'GTD', prizeAmount: 500, date: '2026-10-01', startTime: '19:00' };

describe('posterCoreChanged', () => {
  it('같은 값(제목 앞뒤 공백 포함)은 안 바뀐 것', () => {
    expect(posterCoreChanged(same, saved)).toBe(false);
    expect(posterCoreChanged({ ...same, title: ' 데일리 메인 ' }, saved)).toBe(false);
  });
  it('여섯 칸 각각이 바뀌면 true', () => {
    expect(posterCoreChanged({ ...same, title: '위클리' }, saved)).toBe(true);
    expect(posterCoreChanged({ ...same, buyIn: 120_000 }, saved)).toBe(true);
    expect(posterCoreChanged({ ...same, prizeAmount: 600 }, saved)).toBe(true);
    expect(posterCoreChanged({ ...same, prizeType: 'ENTRY' }, saved)).toBe(true);
    expect(posterCoreChanged({ ...same, date: '2026-10-02' }, saved)).toBe(true);
    expect(posterCoreChanged({ ...same, startTime: '20:00' }, saved)).toBe(true);
  });
  it('ENTRY 포스터: 저장본 prizePool 이 null/0 이면 만원 칸 값과 무관하게 같다', () => {
    const entrySaved: PosterCoreSaved = { ...saved, guaranteed: false, prizePool: null };
    expect(posterCoreChanged({ ...same, prizeType: 'ENTRY', prizeAmount: 999 }, entrySaved)).toBe(false);
    expect(posterCoreChanged({ ...same, prizeType: 'ENTRY', prizeAmount: 0 }, { ...entrySaved, prizePool: 0 })).toBe(false);
  });
});
