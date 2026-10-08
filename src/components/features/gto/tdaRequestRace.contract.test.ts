// TDA-REQUEST-RACE — A 대기 중 B 를 물으면 A 의 늦은 답·오류·finally 가 B 화면을 건드리면 안 된다.
// vitest 가 node 라 렌더 대신 소스 계약으로 잠근다(세대 비교 셋 + busy 중 예시 칩 잠금).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const code = readFileSync(join(__dirname, 'TdaRulesTool.tsx'), 'utf-8');

describe('TdaRulesTool — 최신 요청만 반영', () => {
  it('답·오류·busy 해제 모두 세대가 같을 때만', () => {
    expect(code).toMatch(/const gen = \+\+reqRef\.current;/);
    expect(code).toMatch(/if \(gen === reqRef\.current\) setAnswer\(out\);/);
    expect(code).toMatch(/if \(gen === reqRef\.current\) setAiErr\(msgOf\(e,/);
    expect(code).toMatch(/finally \{ if \(gen === reqRef\.current\) setBusy\(false\); \}/);
  });
  it('요청 중에는 예시 칩도 눌리지 않는다(질문 버튼과 같은 잠금 — AI 일일 한도 소모 방지)', () => {
    expect(code).toMatch(/onClick=\{\(\) => \{ setQ\(ex\); ask\(ex\); \}\} disabled=\{busy\}/);
  });
});
