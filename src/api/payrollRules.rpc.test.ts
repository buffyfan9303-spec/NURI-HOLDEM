// getPayRules — 표 SELECT 가 0행(직원은 RLS 로 못 읽음)이면 직원용 RPC my_venue_pay_rules(20261004c)로 한 번 더 묻는다.
// 함수 적용 전(PGRST202)·권한 없음(42501)은 종전대로 기본값(null), 그 밖의 오류는 던진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let tableRow: Record<string, unknown> | null = null;
let rpcData: unknown = null;
let rpcError: { code?: string; message?: string } | null = null;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tableRow, error: null }) }) }) }),
    rpc: async (fn: string, args?: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return { data: rpcData, error: rpcError }; },
  },
}));

const { getPayRules } = await import('./payrollRules');
const ROW = { early_credit: false, auto_break: true, five_plus: true, weekly_holiday: false };
const RULES = { earlyCredit: false, autoBreak: true, fivePlus: true, weeklyHoliday: false };

beforeEach(() => { tableRow = null; rpcData = null; rpcError = null; rpcCalls.length = 0; });

describe('getPayRules 직원 폴백', () => {
  it('업주: 표에서 읽히면 RPC 를 부르지 않는다', async () => {
    tableRow = ROW;
    expect(await getPayRules('v1')).toEqual(RULES);
    expect(rpcCalls).toEqual([]);
  });
  it('직원: 표 0행 → RPC 결과를 쓴다', async () => {
    rpcData = [ROW];
    expect(await getPayRules('v1')).toEqual(RULES);
    expect(rpcCalls).toEqual([{ fn: 'my_venue_pay_rules', args: { p_venue_id: 'v1' } }]);
  });
  it('설정 행 없음(RPC 0행) → null(기본값)', async () => {
    rpcData = [];
    expect(await getPayRules('v1')).toBeNull();
  });
  it('함수 적용 전(PGRST202)·권한 없음(42501) → null(종전 동작)', async () => {
    rpcError = { code: 'PGRST202' };
    expect(await getPayRules('v1')).toBeNull();
    rpcError = { code: '42501' };
    expect(await getPayRules('v1')).toBeNull();
  });
  it('그 밖의 오류는 삼키지 않는다', async () => {
    rpcError = { code: '08006', message: 'network' };
    await expect(getPayRules('v1')).rejects.toBe(rpcError);
  });
});
