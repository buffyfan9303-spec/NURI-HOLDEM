// V05 재현/고정 — 열린 이용권 화면(지갑 · 이용권·출석 시트)의 늦은 응답 격리 누락.
//
// 렌더 트리 테스트로 잡기 어렵다(auth·supabase·모달 트리를 다 채워야 한다). 저장소가 이미 쓰는
// 소스 계약 테스트 방식으로 잠근다(remoteContract.test.ts·fullscreenContract.test.ts 와 같은 결).
//
// 근거: VoucherWallet.tsx·MyVoucherSheet.tsx 는 listMyVouchers() 응답을 `.then(setVouchers)` /
//   `.then(setHeld)` 로 바로 반영했다 — 계정이 바뀐 뒤에도 이전 계정으로 나간 요청이 도착하면
//   그대로 그려진다(N01 과 같은 함정). 새 가드를 만들지 않고 이미 있는 계약(staleResponse.ts 의
//   isStaleResponse({ seq, owner }, …))을 쓴다.
//
// 음성 대조: isStaleResponse 가드(또는 owner:uid 연결)를 지우면 아래 테스트가 실패한다.
//
// 실행: npx vitest run src/components/features/voucherStaleGuard.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const WALLET = strip(readFileSync(join(__dirname, 'VoucherWallet.tsx'), 'utf-8'));
const SHEET = strip(readFileSync(join(__dirname, 'MyVoucherSheet.tsx'), 'utf-8'));

describe('VoucherWallet.tsx — listMyVouchers 응답을 isStaleResponse 로 거른다', () => {
  it('staleResponse 계약을 가져와 쓴다(새 가드를 따로 만들지 않는다)', () => {
    expect(WALLET).toContain("from '../../lib/staleResponse'");
    expect(WALLET).toContain('isStaleResponse(');
  });

  it('load() 의 owner 가 uid 에 묶여 있다 — 계정이 바뀌면 다른 owner 가 된다', () => {
    const m = WALLET.match(/const load = useCallback\(\(\): Promise<[^{]*=> \{[\s\S]*?\n {2}\}, \[uid, idOn\]\)/);
    expect(m, 'load() 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toMatch(/const owner = uid/);
    expect(body).toContain('isStaleResponse({ seq, owner }');
  });

  it('then/catch/finally 세 곳 모두 stale 이면 state 를 건드리지 않고 반환한다', () => {
    const m = WALLET.match(/listMyVouchers\(\)[\s\S]*?\.finally\([\s\S]*?\}\);/);
    expect(m, 'listMyVouchers() 체인을 찾지 못했다').not.toBeNull();
    const chain = m![0];
    // then / catch / finally 각 콜백 안에 stale() 가드가 있어야 한다(문자열 등장 횟수로 확인)
    const guardCount = (chain.match(/if \(stale\(\)\)|if \(!stale\(\)\)/g) ?? []).length;
    expect(guardCount).toBeGreaterThanOrEqual(3);
  });

  it('🔴 재조회 실패(catch)는 vouchers 를 지우지 않는다 — 마지막 정상 결과를 유지한다(V04)', () => {
    const m = WALLET.match(/\.catch\(\(e\) => \{ if \(stale\(\)\) return undefined; setErr\(e\); return undefined; \}\)/);
    expect(m, "catch 가 setVouchers 없이 setErr 만 해야 한다").not.toBeNull();
  });

  it('계정이 바뀌면(uid 의존 effect) vouchers·err·everLoaded·redeem 을 즉시 지운다', () => {
    const m = WALLET.match(/useEffect\(\(\) => \{\s*setVouchers\(\[\]\); setErr\(null\); setEverLoaded\(false\);\s*setRedeem\(null\); setRedeemDone\(null\);[\s\S]*?\}, \[uid\]\);/);
    expect(m, 'uid 변경 시 초기화 effect를 찾지 못했다').not.toBeNull();
  });
});

describe('MyVoucherSheet.tsx — reloadHeld 도 같은 계약을 쓴다', () => {
  it('staleResponse 계약을 가져와 쓴다', () => {
    expect(SHEET).toContain("from '../../lib/staleResponse'");
    expect(SHEET).toContain('isStaleResponse(');
  });

  it('reloadHeld() 의 owner 가 uid 에 묶여 있다', () => {
    const m = SHEET.match(/const reloadHeld = useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[uid\]\)/);
    expect(m, 'reloadHeld() 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toMatch(/const owner = uid/);
    expect(body).toContain('isStaleResponse({ seq, owner }');
  });

  it('🔴 재조회 실패는 held 를 [] 로 바꾸지 않는다 — 마지막 정상 결과를 유지한다(V04)', () => {
    const m = SHEET.match(/\.catch\(\(e\) => \{ if \(!stale\(\)\) setHeldErr\(e\); \}\)/);
    expect(m, 'catch 가 setHeld 없이 setHeldErr 만 해야 한다').not.toBeNull();
  });

  it('계정이 바뀌면 held·heldErr·plan 을 즉시 지운다(V04)', () => {
    const m = SHEET.match(/useEffect\(\(\) => \{ setHeld\(null\); setHeldErr\(null\); setPlan\(null\); \}, \[uid\]\);/);
    expect(m, 'uid 변경 시 초기화 effect를 찾지 못했다').not.toBeNull();
  });
});
