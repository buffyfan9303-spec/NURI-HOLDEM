// #6(오너 결정 2026-09-29) — 대시보드 이용권 카드 '전송' 수 = 실제로 보낸 장수(store_vouchers), 장부 수기 칸이 아니다.
// 음성 대조: StoreDashboard 의 weekVoucher 를 `s.voucherIssued` 합산으로 되돌리면 '배선' 이,
//            countVenueVouchersSent 의 `.neq('status', 'revoked')` 를 지우면 '조회 모양' 이 빨개진다.
// 실행: npx vitest run src/api/voucherSentCount.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: [string, ...unknown[]][] = [];
let result: { count: number | null; error: unknown } = { count: 7, error: null };
vi.mock('../lib/supabase', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'lt']) q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q; };
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return { IS_MOCK: false, supabase: { from: (t: string) => { calls.push(['from', t]); return q; } } };
});
import { countVenueVouchersSent } from './vouchers';

describe('countVenueVouchersSent — 실제 전송 장수', () => {
  it('조회 모양: 이 매장 · 전송 취소 제외 · KST 날짜 [from, to) · 개수만', async () => {
    calls.length = 0;
    expect(await countVenueVouchersSent('v1', '2026-09-23', '2026-09-30')).toBe(7);
    expect(calls).toEqual([
      ['from', 'store_vouchers'],
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'venue_id', 'v1'],
      ['neq', 'status', 'revoked'],
      ['gte', 'created_at', '2026-09-23T00:00:00+09:00'],
      ['lt', 'created_at', '2026-09-30T00:00:00+09:00'],
    ]);
  });
  it('실패를 0 으로 위장하지 않는다', async () => {
    result = { count: null, error: { code: '42501', message: 'denied' } };
    await expect(countVenueVouchersSent('v1', '2026-09-29', '2026-09-30')).rejects.toBeTruthy();
    result = { count: 7, error: null };
  });
  it('배선 — 대시보드 7일·오늘 전송은 이 조회이고 장부 수기 칸(voucherIssued)을 더하지 않는다', () => {
    const s = readFileSync(join(__dirname, '../components/features/StoreDashboard.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(s).not.toMatch(/voucherIssued/);
    expect(s).toMatch(/countVenueVouchersSent\(venueId, wk\[0\], nextDay\(wk\[wk\.length - 1\]\)\)/);
    expect(s).toMatch(/countVenueVouchersSent\(venueId, d, nextDay\(d\)\)/);
    expect(s).toMatch(/const weekVoucher = sent\?\.week \?\? 0;/);
    expect(s).toMatch(/const todayVoucher = sent\?\.today \?\? 0;/);
  });
});
