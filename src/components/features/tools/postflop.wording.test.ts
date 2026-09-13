// src/components/features/tools/postflop.wording.test.ts
// §3.4 근거·채점 신뢰성 (2026-09-12) — 포스트플랍 80문항 해설에서 "EV 최대"·"자동 이익" 같이
// 실제 계산 없이 확정적 정밀함을 주장하는 표현을 걷어냈다. 문항 자체(정답·조건)는 그대로 두고
// 문구만 "이론상 우세" 류로 조건부화한다. 되돌리면(문구를 원복하면) 실패해야 하는 음성 대조.
import { describe, it, expect } from 'vitest';
import { SCENARIOS } from './postflop.data';

describe('포스트플랍 80문항 해설 — 근거 없는 확정 표현 금지', () => {
  it("해설에 'EV 최대'· '자동 이익' 같은 미계산 확정 표현이 없다", () => {
    const banned = ['EV 최대', '자동 이익'];
    const offenders = SCENARIOS.filter((s) => banned.some((b) => s.why.includes(b)))
      .map((s) => `#${s.id}: ${s.why.slice(0, 30)}...`);
    expect(offenders, `확정 표현이 남아 있다: ${offenders.join(' / ')}`).toEqual([]);
  });

  it('문항 수(80)는 그대로다 — 문구 정리는 문항 삭제가 아니다', () => {
    expect(SCENARIOS.length).toBe(80);
  });
});
