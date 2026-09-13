// 매장이용권 지갑 — 승인 대기를 '사용 완료'로 단정하지 않는다 (V07, 2026-09-12 재현/고정)
//
// 근본 원인: redeem_my_voucher_by_qr/_by_phone 이 store_vouchers.status 를 'used' 로 바꾸면
// 트리거(voucher_redeem_to_ledger_request)가 **승인 대기(pending)** 바인 요청을 만든다 — 운영자가
// 승인해야 확정이고, 거절·취소·자동마감이면 지갑으로 돌아온다(_restore_voucher). 예전 화면은
// 이 상태를 '사용 완료'라 단정했고, 잔량도 화면이 들고 있던 배열 길이에서 그냥 1을 빼서 보여줬다
// (서버 정본이 아니다). 복원도 realtime 구독이 없어 재진입 전까지 반영되지 않았다.
//
// 렌더 트리 테스트로 잡기 어렵다 — 소스 계약 테스트로 잠근다(NuriPosLedgerRace.contract.test.ts 와 같은 결).
// 실행: npx vitest run src/components/features/VoucherWalletPending.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'VoucherWallet.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('V07 · 사용 확인 화면이 승인 대기를 확정으로 단정하지 않는다', () => {
  it('전면 확인 문구가 더는 "사용 완료"라고 단정하지 않는다', () => {
    expect(code).not.toContain('이용권 1장 사용 완료');
  });

  it('확인 화면에 승인 대기·거절 시 복원을 알리는 문구가 있다', () => {
    expect(code).toMatch(/승인 후 확정/);
    expect(code).toMatch(/거절되면 지갑으로 돌아/);
  });
});

describe('V07 · 잔량은 서버 정본에서 센다(화면이 들고 있던 배열 길이 - 1 로 추측하지 않는다)', () => {
  it('RedeemSheet 의 onDone 계약에 remain 이 없다(부모가 재조회해서 계산한다)', () => {
    const m = code.match(/onDone: \(used: \{[^}]*\}\) => void \}\) \{/);
    expect(m, 'RedeemSheet onDone 시그니처를 찾지 못했다').not.toBeNull();
    expect(m![0]).not.toMatch(/remain/);
    expect(m![0]).toMatch(/venueId/);
  });

  it('doQr·doPhone 이 stack.ids.length - 1 로 remain 을 추측하지 않는다(회귀 방지)', () => {
    expect(code).not.toMatch(/remain:\s*stack\.ids\.length\s*-\s*1/);
  });

  it('redeemDone 은 load() 가 돌려준 신선한 목록에서 remain 을 센다', () => {
    const idx = code.indexOf('onDone={(used) => {');
    expect(idx, 'onDone 콜백을 찾지 못했다').toBeGreaterThan(-1);
    const body = code.slice(idx, idx + 500);
    expect(body).toMatch(/load\(\)\.then\(/);
    expect(body).toMatch(/isHeldVoucher\(x, now\)/);
  });
});

describe('V07 · 거절·취소로 되돌아온 이용권이 재진입 없이 보인다(복원 지연 방지)', () => {
  it('내 이용권 realtime 구독(subscribeMyVouchers)을 쓴다', () => {
    expect(code).toContain('subscribeMyVouchers');
    expect(code).toMatch(/useEffect\(\(\) => \{\s*if \(!uid \|\| !idOn\) return;\s*return subscribeMyVouchers\(load\);/);
  });

  it('load() 가 재조회 결과를 반환한다(호출부가 await/then 으로 신선한 값을 쓸 수 있게)', () => {
    const m = code.match(/const load = useCallback\(\(\): Promise<[^{]*=> \{[\s\S]*?\n {2}\}, \[uid, idOn\]\);/);
    expect(m, 'load() 정의를 찾지 못했다').not.toBeNull();
    expect(m![0]).toMatch(/return listMyVouchers\(\)/);
    expect(m![0]).toMatch(/return v;/);
  });
});
