// 게임 프리셋 저장·조회의 매장 경계 (audit-link-1002 L-05 · L-14, 2026-10-02)
//
//  ① L-05 수정 저장은 행을 다른 매장으로 옮기지 않는다 — update 본문에 venue_id 가 없고 (id, 매장)이 함께 맞는 행만 고친다.
//     예전엔 update 에 venue_id 를 실어, 매장 B 화면에 남은 A 프리셋 편집을 저장하면 그 행이 B 로 이사했다.
//  ② L-05 (id, 매장)이 안 맞아 0행이면 성공이 아니라 오류다(mustAffect).
//  ③ L-14 조회 오류를 [] 로 삼키지 않는다 — 화면이 '프리셋 없음'으로 위장하지 않게.
// 실행: npx vitest run src/api/presets.scope.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let updateBody: Record<string, unknown> | null = null;
let filters: [string, unknown][] = [];
let updateRows: unknown[] = [{ id: 'p1' }];
let listResult: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: () => {
      const chain = {
        update: (b: Record<string, unknown>) => { updateBody = b; return chain; },
        select: () => chain,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
        order: () => Promise.resolve(listResult),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: updateRows, error: null }).then(res, rej),
      };
      return chain;
    },
  },
}));

const { saveGamePreset, listGamePresets } = await import('./presets');

beforeEach(() => { updateBody = null; filters = []; updateRows = [{ id: 'p1' }]; listResult = { data: [], error: null }; });

describe('saveGamePreset 수정 — 매장 경계', () => {
  it('🔴 update 본문에 venue_id 를 싣지 않는다(행이 매장을 옮기지 않는다)', async () => {
    await saveGamePreset('venue-B', 'A-딥스택', { title: 'x' }, 'p1');
    expect(updateBody).not.toBeNull();
    expect(updateBody!).not.toHaveProperty('venue_id');
    expect(updateBody!.name).toBe('A-딥스택');
  });
  it('🔴 id 와 지금 매장이 함께 맞는 행만 고친다', async () => {
    await saveGamePreset('venue-B', 'n', {}, 'p1');
    expect(filters).toEqual(expect.arrayContaining([['id', 'p1'], ['venue_id', 'venue-B']]));
  });
  it('(id, 매장)이 안 맞아 0행이면 오류로 올린다', async () => {
    updateRows = [];
    await expect(saveGamePreset('venue-B', 'n', {}, 'p1')).rejects.toThrow();
  });
});

describe('listGamePresets — 못 읽음 ≠ 없음 (L-14)', () => {
  it('🔴 조회 오류를 [] 로 삼키지 않고 던진다', async () => {
    listResult = { data: null, error: { code: '42501', message: 'permission denied' } };
    await expect(listGamePresets('venue-A')).rejects.toBeTruthy();
  });
  it('정상 0행은 빈 배열(양성 대조)', async () => {
    listResult = { data: [], error: null };
    await expect(listGamePresets('venue-A')).resolves.toEqual([]);
  });
});
