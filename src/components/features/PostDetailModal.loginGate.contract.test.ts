// FULL-ERROR-SWEEP-B(2026-09-25) — 글 상세의 비로그인 게이트는 **로그인 시트만** 연다.
// 토스트를 같이 띄우면 fixed 하단 토스트가 시트의 'Google로 계속하기' CTA 를 덮는다(390·360 실측 히트 높이 18/46).
// 화면 측정은 e2e/post-login-gate.spec.ts. 여기서는 같은 줄에서 toast.show + promptLogin 을 같이 부르는 자리가 0 인지 잠근다.
// 실행: npx vitest run src/components/features/PostDetailModal.loginGate.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, 'PostDetailModal.tsx'), 'utf8').split(/\r?\n/);

describe('PostDetailModal — 로그인 시트를 여는 길에 토스트가 없다', () => {
  it('promptLogin() 과 toast.show( 가 한 줄에 같이 있는 자리 0', () => {
    const both = src.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => l.includes('promptLogin()') && l.includes('toast.show('));
    expect(both.map(({ n, l }) => `${n}: ${l.trim().slice(0, 100)}`)).toEqual([]);
  });
  it('비로그인 게이트 자체는 남아 있다(좋아요·반응 → promptLogin)', () => {
    expect(src.filter((l) => l.includes('if (!user) { promptLogin(); return; }')).length).toBeGreaterThanOrEqual(3);
  });
});
