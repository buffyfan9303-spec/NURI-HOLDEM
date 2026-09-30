import { describe, it, expect } from 'vitest';
import { pickActiveAds, checkClockAdMeta, type ClockAd } from './clockAds';

const V = 'venue-a';
const ad = (id: string, o: Partial<ClockAd>): ClockAd => ({
  id, imageUrl: `https://x/${id}.webp`, startsAt: '2026-09-30T00:00:00Z', endsAt: '2026-10-01T00:00:00Z', venueIds: null, sortOrder: 0, ...o,
});

describe('클락 광고 — 지금 이 매장에 걸 것만, 순번대로', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  it('기간 밖(시작 전·끝난 뒤)은 뺀다 — 끝 시각은 포함하지 않는다', () => {
    const r = pickActiveAds([
      ad('in', {}), ad('future', { startsAt: '2026-10-02T00:00:00Z', endsAt: '2026-10-03T00:00:00Z' }),
      ad('past', { startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-30T12:00:00Z' }),
    ], V, now);
    expect(r.map((a) => a.id)).toEqual(['in']);
  });
  it('대상 매장 — null·빈 배열 = 전체, 지정이면 그 매장만', () => {
    const r = pickActiveAds([ad('all', {}), ad('empty', { venueIds: [] }), ad('mine', { venueIds: [V] }), ad('other', { venueIds: ['venue-b'] })], V, now);
    expect(r.map((a) => a.id).sort()).toEqual(['all', 'empty', 'mine']);
  });
  it('순번(sort_order) 오름차순', () => {
    expect(pickActiveAds([ad('b', { sortOrder: 2 }), ad('a', { sortOrder: 1 })], V, now).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('클락 광고 규격 — 840×1120 · 500KB · webp/jpg/png', () => {
  const ok = { type: 'image/webp', size: 400_000, width: 840, height: 1120 };
  it('규격이면 통과', () => expect(checkClockAdMeta(ok)).toBeNull());
  it('형식·용량·가로세로 각각 거절', () => {
    expect(checkClockAdMeta({ ...ok, type: 'image/gif' })).toMatch(/webp/);
    expect(checkClockAdMeta({ ...ok, size: 500 * 1024 + 1 })).toMatch(/500KB/);
    expect(checkClockAdMeta({ ...ok, size: 500 * 1024 })).toBeNull();
    expect(checkClockAdMeta({ ...ok, width: 841 })).toMatch(/840×1120/);
    expect(checkClockAdMeta({ ...ok, width: 1120, height: 840 })).toMatch(/840×1120/);
  });
});
