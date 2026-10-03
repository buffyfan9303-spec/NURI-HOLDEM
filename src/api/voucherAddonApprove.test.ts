// #8(오너 결정 2026-09-29) — 손님 QR 이용권 사용 요청을 접수대가 승인할 때 용도(바인/애드온)를 고른다.
// 서버 계약: supabase/migrations/20260929u_approve_voucher_addon.sql (초안 — 리드 리허설 후 적용).
// 음성 대조: ledger.ts approveBuyinRequest 의 `voucherUse === 'addon' ? { p_voucher_use: 'addon' } : {}` 를 항상 보내게 바꾸면
//            '바인 승인은 옛 서명' 이, voucherFeed.ts 의 usedFor 키 추가를 지우면 '용도가 다르면 다른 줄' 이 빨개진다.
// 실행: npx vitest run src/api/voucherAddonApprove.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rpcCalls: [string, Record<string, unknown>][] = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { rpc: (name: string, args: Record<string, unknown>) => { rpcCalls.push([name, args]); return Promise.resolve(rpcResult); } },
}));
import { approveBuyinRequest, VOUCHER_ADDON_RPC_MISSING_TEXT } from './ledger';
import { toFeedRows } from '../lib/voucherFeed';
import type { Voucher } from './vouchers';

const src = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');

describe('#8 approveBuyinRequest — 용도 인자', () => {
  beforeEach(() => { rpcCalls.length = 0; rpcResult = { data: null, error: null }; });

  it('바인 승인(기본)은 옛 서명 그대로 — p_voucher_use 를 보내지 않는다(서버 적용 전에도 동작)', async () => {
    await approveBuyinRequest('r1', 1, false, 'cash', undefined, 0);
    expect(rpcCalls[0][0]).toBe('approve_buyin_request');
    expect(rpcCalls[0][1]).not.toHaveProperty('p_voucher_use');
  });
  it('애드온 승인은 p_voucher_use=addon 을 보낸다', async () => {
    await approveBuyinRequest('r1', 2, false, 'cash', undefined, 0, 'addon');
    expect(rpcCalls[0][1]).toMatchObject({ p_request_id: 'r1', p_game_seq: 2, p_record_buyin: false, p_voucher_use: 'addon' });
  });
  it('🔴 서버에 새 함수가 없으면(PGRST202) 바인으로 조용히 떨어지지 않고 알린다', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    await expect(approveBuyinRequest('r1', 1, false, 'cash', undefined, 0, 'addon')).rejects.toThrow(VOUCHER_ADDON_RPC_MISSING_TEXT);
    expect(rpcCalls).toHaveLength(1);   // 재시도(바인)로 두 번째 호출을 하지 않는다
  });
  it('다른 서버 오류는 그대로 올린다(코드 보존 — 23514 애드온 게임 아님 등)', async () => {
    const e = { code: '23514', message: '애드온 게임이 아닙니다' };
    rpcResult = { data: null, error: e };
    await expect(approveBuyinRequest('r1', 1, false, 'cash', undefined, 0, 'addon')).rejects.toBe(e);
  });
});

describe('#8 레일·이용권 탭 — 사용 줄에 애드온 표시', () => {
  const v = (o: Partial<Voucher>): Voucher => ({
    id: 'x', venueId: 'v', venueName: null, issuedBy: 'o', holderUserId: 'u1', holderName: '홍길동', title: '매장이용권', status: 'used',
    usedVenueId: 'v', usedVenueName: null, usedAt: '2026-09-29T12:00:00Z', createdAt: '2026-09-29T10:00:00Z', expiresAt: null,
    issueReason: null, eventCampaignId: null, usedFor: null, ...o,
  });
  it('사용 줄이 용도를 싣고, 같은 순간이어도 용도가 다르면 다른 줄이다', () => {
    const rows = toFeedRows([v({ id: 'a', usedFor: 'addon' }), v({ id: 'b', usedFor: 'buyin' })]).filter((r) => r.kind === 'used');
    expect(rows.map((r) => r.usedFor).sort()).toEqual(['addon', 'buyin']);
  });
  it('발급 줄·승인 전 사용은 용도 없음(null)', () => {
    const rows = toFeedRows([v({ id: 'a', usedFor: null })]);
    expect(rows.every((r) => r.usedFor === null)).toBe(true);
  });
  it('배선 — 레일과 이용권 탭이 애드온 사용에 \'애드온\' 을 붙인다', () => {
    expect(src('../components/features/LedgerVoucherRail.tsx')).toContain("{r.usedFor === 'addon' ? ' · 애드온' : ''}");
    // 이용권 탭 내역 줄은 lib/voucherFeed.manageFeedRows 가 만든다(dummy-1003 D2 — 전송 취소 장수와 함께 한 함수로 옮김).
    const m = src('../components/features/VoucherManageModal.tsx');
    expect(m).toContain('return manageFeedRows(list, whoOf);');
    expect(src('../lib/voucherFeed.ts')).toContain("addon: v.usedFor === 'addon'");
    expect(m).toContain("{e.addon ? ' · 애드온' : ''}");
  });
});

describe('#8 접수대 배선 — 애드온 게임의 이용권 요청에만 [애드온] 승인', () => {
  it('장부 요청 칸', () => {
    const s = src('../components/features/NuriPosLedger.tsx');
    expect(s).toMatch(/\{r\.voucherId != null && gameIsAddon\(wantSeq\(r\)\) && \(\s*<button type="button" data-testid="approve-voucher-addon" onClick=\{\(\) => approveReq\(r, false, 'cash', undefined, 'addon'\)\}/);
    expect(s).toContain('approveBuyinRequest(r.id, target, withBuyin, payMethod, split, discIdx, voucherUse)');
  });
  it('대시보드 위젯', () => {
    const s = src('../components/features/StoreDashboard.tsx');
    expect(s).toMatch(/\{r\.voucherId != null && gameIsAddon\(r\.requestedGameSeq\) && \(\s*<button type="button" data-testid="dash-approve-voucher-addon"[^>]*onClick=\{\(\) => quickApprove\(r, 'addon'\)\}/);
  });
});

describe('#8 서버 초안 20260929u', () => {
  const sql = src('../../supabase/migrations/20260929u_approve_voucher_addon.sql').replace(/^\s*--.*$/gm, '');
  it('서명이 바뀌므로 옛 9인자를 DROP 하고 ACL 을 되살린다(anon·PUBLIC 없음)', () => {
    expect(sql).toMatch(/drop function if exists public\.approve_buyin_request\(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer\);/);
    expect(sql).toMatch(/revoke all on function public\.approve_buyin_request\(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.approve_buyin_request\([^)]*, text\) to authenticated, service_role;/);
    expect(sql).toMatch(/security definer\s+set search_path to 'public', 'pg_temp'/);
  });
  it('권한 검사가 용도 검사보다 먼저이고, 이용권 요청이 아니면 애드온을 거절한다', () => {
    const iPerm = sql.indexOf("if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'");
    const iUse = sql.indexOf("if v_use not in ('buyin', 'addon')");
    expect(iPerm).toBeGreaterThan(0);
    expect(iUse).toBeGreaterThan(iPerm);
    expect(sql).toMatch(/if v_use = 'addon' and r\.voucher_id is null then\s+raise exception/);
  });
  it('🔴 RISK-A — 최신 바인 한 행만 잠그고, 이미 애드온이면 거절(옛 엔트리로 내려가지 않는다)', () => {
    // 음성 대조: 선택 조건에 `and b.addon_method is null` 을 되살리면 이 단언이 빨개진다(리허설 반례 1:ticket,2:cash).
    expect(sql).toMatch(/and b\.player_name = r\.player_name\s+order by b\.entry_no desc\s+limit 1\s+for update;/);
    expect(sql).toMatch(/if v_target_addon is not null then\s+raise exception/);
  });
  it('🔴 RISK-B — 애드온 요청을 행에 연결하고, 삭제·애드온 제거·수단 변경 때 바인과 같은 함수로 이용권을 되돌린다', () => {
    expect(sql).toMatch(/update ledger_buyins set addon_method = 'ticket', addon_unpaid = false, addon_request_id = r\.id where id = v_target;/);
    expect(sql).toMatch(/perform public\._restore_voucher_for_request\(old\.addon_request_id\);/);
    expect(sql).toMatch(/before update of addon_method, addon_request_id or delete on public\.ledger_buyins/);
    expect(sql).toMatch(/before insert or update of addon_request_id on public\.ledger_buyins/);   // 화면이 연결을 못 만든다
    for (const f of ['_ledger_buyins_addon_request_guard()', '_ledger_buyins_addon_voucher_restore()']) {
      expect(sql).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
  });
  it('애드온 = 새 바인 없음 · 용도 기록', () => {
    expect(sql).toMatch(/update store_vouchers set used_for = v_use where id = r\.voucher_id;/);
    expect(sql).toMatch(/check \(used_for is null or used_for in \('buyin', 'addon'\)\)/);
  });
});
