// DRILL-REPORT-STALE — 약점 리포트는 마운트 때 로컬 기록을 한 번 읽는다(useMemo []).
// 드릴 화면에 고정 마운트하면 방금 푼 답이 리포트에 안 보인다 → 답·다음 문제마다 key 로 새로 만든다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const code = readFileSync(join(__dirname, 'DailyDrill.tsx'), 'utf-8');

describe('DailyDrill — 약점 리포트가 답을 따라간다', () => {
  it('리포트 key 가 진행 수와 답 여부를 담는다', () => {
    expect(code).toMatch(/<WeaknessReport key=\{`\$\{done\}-\$\{ans \|\| preAns \? 1 : 0\}`\} \/>/);
    expect(code).not.toMatch(/<WeaknessReport \/>/);
  });
  it('기록 저장이 답 처리 안에 있다(그래서 답 직후 다시 읽으면 반영된다)', () => {
    expect(code).toMatch(/setAns\(\{ picked: a, ok \}\);[\s\S]{0,300}savePostflopStats\(/);
    expect(code).toMatch(/setPreAns\(\{ ok \}\);[\s\S]{0,300}savePreflopStats\(/);
  });
});
