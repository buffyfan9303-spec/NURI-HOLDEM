import { describe, expect, it } from 'vitest';
import { TDA_RULES } from './tdaRules';

// 2026-09-19 GTO 감사 [low] — 용어집이 GTO 를 'Game Theory Optional' 로 적어 앱 자체 용어사전
// (tools/glossary.data.ts: 'Game Theory Optimal')과 모순됐다. 되돌아가지 않게 잠근다.
describe('TDA 용어집 — GTO 오타', () => {
  it("'Game Theory Optional' 이 아니라 'Game Theory Optimal' 이다", () => {
    const glossary = TDA_RULES.find((r) => r.body.includes('GTO:'));
    expect(glossary, "GTO 항목이 든 규칙을 못 찾았다 — 용어집 구조가 바뀌었는지 확인해라").toBeTruthy();
    expect(glossary!.body).not.toContain('Game Theory Optional');
    expect(glossary!.body).toContain('Game Theory Optimal');
  });
});
