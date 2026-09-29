// D9(2026-09-29, docs/handoff-2026-09-29/store-deep.md) — 일괄 되돌리기에 같은 id 가 두 번 가면
//   서버 revoke_vouchers 는 {"ok":1,"failed":1,"reasons":[]} 를 돌려준다(리허설 실측) — 화면이 '사유 없는 실패 1건'을 띄운다.
// 음성 대조: revokeVouchers 의 `const ids = [...new Set(rawIds)];` 를 지우면(원래 인자를 그대로 보내면) 빨개진다.
// 실행: npx vitest run src/api/vouchers.revokeDedupe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let calls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const n = (args.p_ids as string[]).length;
      return Promise.resolve({ data: { ok: n, failed: 0, reasons: [] }, error: null });
    },
  },
}));

beforeEach(() => { calls = []; });

describe('revokeVouchers — 중복 id 는 한 번만 보낸다', () => {
  it('🔴 [a, a, b] → p_ids = [a, b]', async () => {
    const { revokeVouchers } = await import('./vouchers');
    const r = await revokeVouchers(['a', 'a', 'b']);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('revoke_vouchers');
    expect(calls[0].args.p_ids).toEqual(['a', 'b']);
    expect(r).toEqual({ ok: 2, failed: 0, reasons: [] });
  });
});
