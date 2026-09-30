// 순위 인증 승인·반려 — 점검 A-05(2026-10-01)
//   · 사유 창 '취소' = 중단(예전엔 사유 없이 반려되고 신분증이 지워졌다)
//   · 승인도 확인 창(신분증 즉시 삭제)
//   · 이미 처리된 건은 덮어쓰지 않는다 — update 에 status='pending' 조건
// 실행: npx vitest run src/api/rankverify.decide.test.ts
import { describe, it, expect, vi } from 'vitest';

const win = (o: { confirm?: boolean; prompt?: string | null }) => ({
  confirm: vi.fn(() => o.confirm ?? true),
  prompt: vi.fn(() => (o.prompt === undefined ? '' : o.prompt)),
});

describe('askRankDecision', () => {
  it('🔴 반려 사유 창에서 취소(null) → 중단', async () => {
    const { askRankDecision } = await import('./rankverify');
    expect(askRankDecision(false, win({ prompt: null }))).toEqual({ go: false });
  });
  it('반려 사유를 적으면 공백을 잘라 넘기고, 비우면 사유 없이 진행', async () => {
    const { askRankDecision } = await import('./rankverify');
    expect(askRankDecision(false, win({ prompt: '  증빙 불일치 ' }))).toEqual({ go: true, note: '증빙 불일치' });
    expect(askRankDecision(false, win({ prompt: '   ' }))).toEqual({ go: true, note: undefined });
  });
  it('승인은 확인 창을 거치고, 취소하면 중단', async () => {
    const { askRankDecision } = await import('./rankverify');
    const w1 = win({ confirm: true });
    expect(askRankDecision(true, w1)).toEqual({ go: true });
    expect(w1.confirm).toHaveBeenCalledTimes(1);
    expect(w1.prompt).not.toHaveBeenCalled();
    expect(askRankDecision(true, win({ confirm: false }))).toEqual({ go: false });
  });
});

describe('adminDecideRankVerification', () => {
  it("update 가 status='pending' 조건을 건다(다른 관리자가 처리한 건 덮어쓰기 금지)", async () => {
    vi.resetModules();
    const eqs: [string, unknown][] = [];
    const chain: Record<string, unknown> = {};
    chain.update = () => chain;
    chain.eq = (k: string, v: unknown) => { eqs.push([k, v]); return chain; };
    chain.select = () => Promise.resolve({ data: [{ id: 'v1' }], error: null });
    vi.doMock('../lib/supabase', () => ({
      IS_MOCK: false,
      supabase: { from: () => chain, storage: { from: () => ({ remove: async () => ({ error: null }) }) } },
    }));
    const m = await import('./rankverify');
    await m.adminDecideRankVerification({ id: 'v1', idCardPath: 'p/x.jpg', eventKind: 'official' } as never, false, { note: 'n' });
    expect(eqs).toContainEqual(['id', 'v1']);
    expect(eqs).toContainEqual(['status', 'pending']);
  });
  it('이미 처리돼 0행이면 던진다(성공으로 위장하지 않는다)', async () => {
    vi.resetModules();
    const chain: Record<string, unknown> = {};
    chain.update = () => chain;
    chain.eq = () => chain;
    chain.select = () => Promise.resolve({ data: [], error: null });
    vi.doMock('../lib/supabase', () => ({
      IS_MOCK: false,
      supabase: { from: () => chain, storage: { from: () => ({ remove: async () => ({ error: null }) }) } },
    }));
    const m = await import('./rankverify');
    await expect(m.adminDecideRankVerification({ id: 'v1', idCardPath: null, eventKind: 'official' } as never, true)).rejects.toThrow();
  });
});
