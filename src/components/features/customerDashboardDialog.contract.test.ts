// 내 정보 전면 판(z-60)은 대화상자다(P3, 2026-10-06) — role=dialog · aria-modal · 이름이 두 루트(로그인·비로그인)에 있고,
// 포커스 이동·Tab 트랩·복원은 공유 훅(useDialogFocus)을 쓴다. 종전엔 셋 다 없어 스크린리더가 뒤 화면을 그대로 읽었다.
// ⚠ 훅은 early return(`if (!open && !everOpenedRef.current) return null`) 앞에 있어야 한다 — 뒤에 두면 hooks 순서가 깨진다.
// 음성 대조: 두 루트 중 한 곳의 role/aria-modal/aria-label 을 지우거나, useDialogFocus 줄을 early return 뒤로 옮기면 실패한다.
// 실행: npx vitest run src/components/features/customerDashboardDialog.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./CustomerDashboardPage.tsx', import.meta.url), 'utf8');

describe('CustomerDashboardPage 대화상자 계약', () => {
  it('로그인 루트: ref + role=dialog + aria-modal + 이름', () => {
    expect(src).toMatch(/<div ref=\{dialogRef\} role="dialog" aria-modal="true" aria-label="내 정보"\s/);
  });
  it('비로그인(LoginLanding) 루트도 같은 계약 + ref 를 prop 으로 받는다', () => {
    expect(src).toMatch(/<div ref=\{dialogRef\} role="dialog" aria-modal="true" aria-label="내 정보 로그인"\s/);
    expect(src).toMatch(/<LoginLanding [^>]*dialogRef=\{dialogRef\}/);
  });
  it('useDialogFocus(open, dialogRef) 는 early return 보다 앞이다', () => {
    const hook = src.indexOf('useDialogFocus(open, dialogRef)');
    const early = src.indexOf('if (!open && !everOpenedRef.current) return null;');
    expect(hook).toBeGreaterThan(-1);
    expect(early).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(early);
  });
});
