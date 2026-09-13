// 이용권 사용 RPC 의 fail-open(N04 감사, 적대 반증 생존 · high) — 초안 20260912b 의 보강이 SQL 에 적혀 있는가 (2026-09-13)
//
// 결함: 20260829c 의 `if v_holder is null or v_holder <> auth.uid()` 는 비로그인(auth.uid() NULL)에서 `false OR NULL = NULL` 이라
//   IF 를 건너뛴다(fail-open). 두 RPC 는 REVOKE 가 저장소 어디에도 없어 PUBLIC EXECUTE 도 잔존했다.
//   기존 초안 20260912b 는 REVOKE 는 넣었으나 비교는 `<>` 그대로였고, 헤더가 "함수 내부가 auth.uid() 를 강제해 실질 피해 없음" 이라 적었다 —
//   그 주장이 NULL 경로를 놓쳤다. 이 파일은 보강된 초안이 ① NULL 명시 체크 + is distinct from ② REVOKE/GRANT ③ search_path pg_temp
//   ④ 헤더의 정정을 담고 있는지를 잠근다. ⚠ 초안이다 — 적용은 오너 승인 사항. 현재 실피해 0(킬스위치 OFF · store_vouchers 0행).
// 못 보는 것: SQL 이 실제 PG 에서 그렇게 동작하는지(격리 컨테이너 검증은 적용 절차에서 nuri-migration 이 한다).
// 음성 대조: 20260912b 의 `is distinct from auth.uid()` 한 곳을 `<> auth.uid()` 로 되돌리면 첫 케이스가 실패한다.
// 실행: npx vitest run src/api/voucherRedeemNullSafe.migration.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20260912b_voucher_qr_game_seq.sql'), 'utf-8');
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const bodyOf = (name: string) => {
  const s = CODE.indexOf(`create or replace function public.${name}(`);
  expect(s, `${name} 정의가 없다`).toBeGreaterThan(-1);
  return CODE.slice(s, CODE.indexOf('$function$;', s));
};

describe('20260912b(보강) — 이용권 사용 RPC 는 비로그인에서 열리지 않는다', () => {
  for (const fn of ['redeem_my_voucher_by_qr', 'redeem_my_voucher_by_phone'] as const) {
    it(`🔴 ${fn}: auth.uid() NULL 명시 체크 + is distinct from — \`<> auth.uid()\` 가 남아 있지 않다`, () => {
      const b = bodyOf(fn);
      expect(b).toMatch(/if auth\.uid\(\) is null then raise exception/);
      expect(b).toMatch(/if v_holder is null or v_holder is distinct from auth\.uid\(\) then raise exception/);
      expect(b).not.toMatch(/<> auth\.uid\(\)/);
      // 보유자 검사가 UPDATE 보다 앞에 있다
      expect(b.indexOf('is distinct from auth.uid()')).toBeLessThan(b.indexOf('update public.store_vouchers'));
    });
    it(`🔴 ${fn}: SECURITY DEFINER + search_path public, pg_temp`, () => {
      const b = bodyOf(fn);
      expect(b).toMatch(/security definer/);
      expect(b).toMatch(/set search_path to 'public', 'pg_temp'/);
    });
  }
  it('🔴 REVOKE ALL FROM PUBLIC, anon + GRANT authenticated·service_role (3-인자 시그니처), 옛 2-인자 DROP', () => {
    expect(CODE).toContain('revoke all on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) from public, anon;');
    expect(CODE).toContain('grant execute on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) to authenticated, service_role;');
    expect(CODE).toContain('revoke all on function public.redeem_my_voucher_by_phone(uuid, text, smallint) from public, anon;');
    expect(CODE).toContain('grant execute on function public.redeem_my_voucher_by_phone(uuid, text, smallint) to authenticated, service_role;');
    expect(CODE).toContain('drop function if exists public.redeem_my_voucher_by_qr(uuid, uuid);');
    expect(CODE).toContain('drop function if exists public.redeem_my_voucher_by_phone(uuid, text);');
    // 트리거 함수도 SECURITY DEFINER 라 같은 search_path 고정이 필요하다(음성 대조에서 느슨한 정규식이 첫 pg_temp 제거를 놓쳤다 — 본문으로 본다)
    expect(bodyOf('voucher_redeem_to_ledger_request')).toMatch(/set search_path to 'public', 'pg_temp'/);
  });
  it('🔴 헤더가 옛 주장("실질 피해 없음")을 정정하고 NULL 경로·실피해 0·초안임을 적는다', () => {
    const head = SQL.slice(0, 4000);
    expect(head).toMatch(/NULL 경로를 놓쳤다/);
    expect(head).toMatch(/fail-open/);
    expect(head).toMatch(/실피해 0/);
    expect(head).toMatch(/초안\(DRAFT\)/);
    expect(head).toMatch(/기능을 켜는 첫날부터 유효/);
    // 옛 주장이 인용(옛 문장) 밖에서 다시 주장되지 않는다
    expect(head.split('\n').filter((l) => /실질 피해는 없지만 규약을 맞춘다/.test(l) && !/\(옛 문장\)/.test(l))).toEqual([]);
  });
});
