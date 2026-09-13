// 이용권 QR 사용의 게임(메인/사이드) 지정이 서버까지 가는가 (V06, 2026-09-12 재현/고정)
//
// 사이드 게임 QR 로 스캔해도 hit.gameSeq 가 소비 RPC 로 전달되지 않으면, 그 소비가 만드는 대기
// 바인 요청은 requested_game_seq 가 NULL 로 남고, 운영자가 승인할 때(buyinApproval.planBuyinApprovals)
// '지금 보고 있는 게임'으로 대체되어 손님이 고른 게임과 다른 게임에 들어간다.
// 소스 계약 테스트로 잠근다(NuriPosLedgerRace.contract.test.ts 와 같은 결) — vitest environment 가
// node 라 렌더 테스트를 못 쓴다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VOUCHERS_SRC = readFileSync(join(__dirname, 'vouchers.ts'), 'utf-8');
const SHEET_SRC = readFileSync(join(__dirname, '..', 'components', 'features', 'MyVoucherSheet.tsx'), 'utf-8');
const MIGRATION_PATH = join(__dirname, '..', '..', 'supabase', 'migrations', '20260912b_voucher_qr_game_seq.sql');
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf-8');

describe('V06 · 클라이언트가 QR 게임 번호를 소비 RPC 까지 들고 간다', () => {
  it('redeemMyVoucherByQr 이 p_game_seq 를 RPC 파라미터로 보낸다', () => {
    const idx = VOUCHERS_SRC.indexOf('export async function redeemMyVoucherByQr');
    expect(idx, 'redeemMyVoucherByQr 정의를 찾지 못했다').toBeGreaterThan(-1);
    const body = VOUCHERS_SRC.slice(idx, idx + 500);
    expect(body).toMatch(/redeem_my_voucher_by_qr'.*p_game_seq/s);
  });

  it('redeemMyVoucherByPhone 도 같은 계약으로 p_game_seq 를 보낸다(전화 경로도 시그니처를 맞춘다)', () => {
    const idx = VOUCHERS_SRC.indexOf('export async function redeemMyVoucherByPhone');
    expect(idx, 'redeemMyVoucherByPhone 정의를 찾지 못했다').toBeGreaterThan(-1);
    const body = VOUCHERS_SRC.slice(idx, idx + 500);
    expect(body).toMatch(/redeem_my_voucher_by_phone'.*p_game_seq/s);
  });

  it('일괄 사용 redeemMyVouchersByQr 가 gameSeq 인자를 받아 단건 함수로 그대로 전달한다', () => {
    const idx = VOUCHERS_SRC.indexOf('export const redeemMyVouchersByQr');
    expect(idx, 'redeemMyVouchersByQr 정의를 찾지 못했다').toBeGreaterThan(-1);
    const body = VOUCHERS_SRC.slice(idx, idx + 300);
    expect(body).toMatch(/redeemMyVoucherByQr\(id, venueId, gameSeq\)/);
  });

  it('MyVoucherSheet.send() 가 plan.gameSeq 를 redeemMyVouchersByQr 에 넘긴다(빠뜨리면 사이드 QR 이 게임 미지정으로 소비된다)', () => {
    const idx = SHEET_SRC.indexOf('const send = async () => {');
    expect(idx, 'send 정의를 찾지 못했다').toBeGreaterThan(-1);
    const body = SHEET_SRC.slice(idx, idx + 400);
    expect(body).toMatch(/redeemMyVouchersByQr\(ids, plan\.venueId, plan\.gameSeq\)/);
  });
});

describe('V06 · 서버 초안 — 트리거와 RPC 가 게임 번호를 원자적으로 주고받는다(초안, 미적용)', () => {
  it('트리거가 트랜잭션 범위 세션 변수(nuri.voucher_game_seq)를 읽어 requested_game_seq 에 싣는다', () => {
    expect(MIGRATION_SQL).toMatch(/current_setting\('nuri\.voucher_game_seq', true\)/);
    expect(MIGRATION_SQL).toMatch(/insert into public\.ledger_buyin_requests\([^)]*requested_game_seq\)/);
  });

  it('두 RPC 모두 p_game_seq 를 받고, UPDATE 이전에 set_config 로 싣는다(비원자 사후보정이 아니다)', () => {
    for (const fn of ['redeem_my_voucher_by_qr', 'redeem_my_voucher_by_phone']) {
      const idx = MIGRATION_SQL.indexOf(`create or replace function public.${fn}(`);
      expect(idx, `${fn} 정의를 찾지 못했다`).toBeGreaterThan(-1);
      // 2026-09-13 NULL-safe 보강(auth.uid() 명시 체크 줄 + 주석)으로 본문이 길어졌다 — 함수 끝($function$;)까지 본다
      const body = MIGRATION_SQL.slice(idx, MIGRATION_SQL.indexOf('$function$;', idx));
      expect(body).toContain('p_game_seq smallint default null');
      const setIdx = body.indexOf("set_config('nuri.voucher_game_seq'");
      const updateIdx = body.indexOf('update public.store_vouchers');
      expect(setIdx, `${fn} 에 set_config 가 없다`).toBeGreaterThan(-1);
      expect(updateIdx, `${fn} 에 UPDATE 가 없다`).toBeGreaterThan(-1);
      expect(setIdx).toBeLessThan(updateIdx);
    }
  });

  it('마감된 게임을 지정하면 명확히 거절한다(조용히 다른 게임으로 흘려보내지 않는다)', () => {
    expect(MIGRATION_SQL).toMatch(/ledger_is_closed\(p_venue_id, v_biz, p_game_seq\)/);
    expect(MIGRATION_SQL).toMatch(/ledger_is_closed\(v_venue, v_biz, p_game_seq\)/);
    expect(MIGRATION_SQL).toMatch(/이미 마감된 게임입니다/);
  });

  it('두 RPC 모두 PUBLIC/anon 회수 + authenticated·service_role 재부여(보안표준 §3)', () => {
    expect(MIGRATION_SQL).toContain('revoke all on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) from public, anon;');
    expect(MIGRATION_SQL).toContain('grant execute on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) to authenticated, service_role;');
    expect(MIGRATION_SQL).toContain('revoke all on function public.redeem_my_voucher_by_phone(uuid, text, smallint) from public, anon;');
    expect(MIGRATION_SQL).toContain('grant execute on function public.redeem_my_voucher_by_phone(uuid, text, smallint) to authenticated, service_role;');
  });
});
