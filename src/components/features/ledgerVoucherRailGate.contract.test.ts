// 이용권 레일은 **이용권 열람 권한이 있을 때만** 그린다.
//
// 왜 계약이 필요한가 (2026-09-17)
//   서버에서 장부 권한과 이용권 권한은 갈린다(라이브 pg_get_functiondef 실측):
//     can_access_ledger  = can_manage_pos ‖ ledger_access
//     can_view_vouchers  = can_manage_pos ‖ voucher_access
//   그리고 직원 초대 화면에 grant_ledger · grant_voucher 가 **따로** 있다 —
//   '장부만 준 직원' 조합이 실제로 만들어진다.
//
//   그 사람에게 레일을 그리면 RLS(store_vouchers_select)가 **에러 없이 0행**을 준다.
//   PostgREST 는 RLS 거부를 에러가 아니라 빈 배열로 돌려주므로 `if (error) throw` 로는 못 잡는다
//   (src/api/_mustAffect.ts 머리말이 이 저장소에서 두 번 났다고 기록한 바로 그 부류).
//   그 0행을 레일이 **'보낸 기록이 없어요' 라고 단언**한다 — 카운터에서 손님에게 틀린 답을 하는 자리다.
//   화면이 유일한 가드인 것도 아니고, **화면이 서버의 거부를 사실로 바꿔 말하는** 더 나쁜 경우다.
//
// 라이브 노출(2026-09-17 SELECT): store_vouchers 0행 · voucher_access 0행 · ledger_access 0행.
//   **오늘 사고는 0건.** 직원에게 장부 권한을 처음 주는 날 즉시 켜지는 잠복 결함이라 그 전에 닫는다.
//
// ⚠ 레일 div 만 감싸면 안 된다 — 일반 판은 2열 그리드라 선언이 남으면 **19rem 빈 거터**가 그대로 생겨
//   장부가 계속 좁아진다(매장 운영주 = PC 99%). 그래서 그리드 선언까지 같은 조건에 묶였는지도 본다.
//
// 이 저장소 vitest 는 environment: 'node' 라 렌더 테스트가 안 된다 → 소스 계약으로 잠근다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
// 주석 안의 문구가 단언을 거짓 통과시키지 않도록 코드만 남긴다.
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const WORKSPACE = read('./LedgerWorkspace.tsx');
const VMT = read('./VenueManageTab.tsx');
const WS = codeOnly(WORKSPACE);
const VM = codeOnly(VMT);

const GATE = 'canViewVouchers';

describe('이용권 레일 — 권한이 있을 때만 그린다', () => {
  it('정규식이 죽으면 조용히 통과하는 것을 막는다 — 재료가 실제로 있다', () => {
    expect(WORKSPACE.length).toBeGreaterThan(1_000);
    expect(WS).toContain('LedgerVoucherRail');
    expect(VM).toContain('LedgerWorkspaceM');
  });

  it('🔴 LedgerWorkspace 가 권한을 인자로 받는다', () => {
    expect(WS, `LedgerWorkspace 가 ${GATE} 를 받지 않는다`).toContain(`${GATE}`);
    expect(WS, `${GATE} 가 프롭 타입에 선언되지 않았다`).toMatch(new RegExp(`${GATE}\\s*:\\s*boolean`));
  });

  it('🔴 레일을 그리는 모든 자리가 권한 뒤에 있다', () => {
    // `<LedgerVoucherRail` 각각에 대해, 그 앞 400자 안에 게이트가 있어야 한다.
    const hits = [...WS.matchAll(/<LedgerVoucherRail/g)].map((m) => m.index ?? 0);
    expect(hits.length, '레일 렌더 자리를 못 찾았다(정규식이 죽었다)').toBeGreaterThanOrEqual(2);
    for (const i of hits) {
      const before = WS.slice(Math.max(0, i - 400), i);
      expect(before, `레일 렌더(offset ${i})가 ${GATE} 게이트 밖에 있다`).toContain(`${GATE} &&`);
    }
  });

  it('🔴 2열 그리드 선언도 같은 조건에 묶여 있다 — 안 그러면 19rem 빈 거터가 남는다', () => {
    // 그리드 클래스가 조건부(삼항)로 들어가야 한다. 통짜 className="lg:grid …" 로 남아 있으면 실패.
    expect(WS, '2열 그리드가 무조건 선언돼 있다 — 권한 없는 직원 화면에 빈 거터가 남는다')
      .not.toMatch(/className="lg:grid lg:grid-cols-\[minmax\(0,1fr\)_19rem\]/);
    expect(WS, '그리드 선언이 권한 조건 안에 없다')
      .toMatch(new RegExp(`${GATE}\\s*\\?\\s*'lg:grid`));
  });

  it('🔴 호출부가 이용권 권한 단일 지점(caps.voucher)을 그대로 넘긴다 — 새 판정을 만들지 않는다', () => {
    const call = VM.match(/<LedgerWorkspaceM[^>]*>/)?.[0] ?? '';
    expect(call, 'VenueManageTab 에서 LedgerWorkspaceM 호출부를 못 찾았다').not.toBe('');
    expect(call, `호출부가 ${GATE} 를 넘기지 않는다`).toContain(`${GATE}={caps.voucher}`);
    // caps.voucher 가 실제로 이용권 열람 판정이어야 한다(다른 값으로 슬쩍 바뀌면 게이트가 무의미해진다).
    expect(VM, 'caps.voucher 정의가 바뀌었다 — 이용권 열람 판정인지 다시 확인해라')
      .toMatch(/voucher:\s*idOn\s*&&\s*\(manageOk\s*\|\|\s*voucherView\)/);
  });

  it('레일 자체와 빈 상태 문구는 건드리지 않았다 — 권한이 있으면 종전과 같다', () => {
    // 권한이 있는 사람(업주·공동사장·관리자·이용권권한직원)에게는 DOM 이 한 노드도 바뀌면 안 된다.
    expect(WS).toContain('LedgerVoucherRail venueId={venueId} active dense');
    expect(WS).toContain('LedgerVoucherRail venueId={venueId} active={active}');
  });
});
