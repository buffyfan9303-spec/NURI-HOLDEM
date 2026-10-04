// --header-now 소비처 표식 계약 (M3-02, 2026-10-04)
//
// 무엇을 막는가
//   헤더 축소값(2.75rem)을 :root 상속 변수로 바꾸면 문서 전체가 스타일을 다시 계산한다 — 스크롤된 탭에서
//   다른 탭을 누를 때마다 헤더가 펴지며 CPU4 64ms 를 클릭 프레임에 더했다(트레이스 data-header-shrunk → 전체 recalc).
//   그래서 src/index.css 는 축소값을 **표식이 붙은 소비처에만** 건다(data-community-secbar · data-header-now).
//   새로 이 변수를 쓰면서 표식을 빼먹으면 그 요소만 헤더가 줄어도 옛 높이에 남는다(2026-09-19 의 3.25px 틈 부류) —
//   화면 하나를 스크롤해야만 보이는 결함이라 소스에서 막는다.
// 판정: var(--header-now) 를 쓰는 줄마다 가장 가까운 여는 태그(`<`)부터 그 줄까지 안에 표식이 있어야 한다.
// 실행: npx vitest run src/components/headerNowConsumers.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(__dirname, '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
});
const MARK = /data-header-now|data-community-secbar/;
/** 사용처 하나 → 그 요소의 여는 태그부터 사용 줄까지(JSX 한 요소의 속성 목록). */
const owner = (lines: string[], i: number): string => {
  for (let k = i; k >= Math.max(0, i - 40); k--) if (/<[A-Za-z]/.test(lines[k])) return lines.slice(k, i + 1).join('\n');
  return lines[i];
};

describe('--header-now 소비처는 표식을 단다', () => {
  const uses: { file: string; line: number; ok: boolean }[] = [];
  for (const f of walk(SRC)) {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((l, i) => {
      if (!l.includes('var(--header-now)') || /^\s*(\/\/|\*|\/\*)/.test(l)) return;
      uses.push({ file: relative(SRC, f).split(sep).join('/'), line: i + 1, ok: MARK.test(owner(lines, i)) });
    });
  }
  it('사용처가 있다(0개 수집 거짓 통과 방지)', () => {
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
  it('모든 사용처 요소에 data-header-now(또는 data-community-secbar)가 있다', () => {
    expect(uses.filter((u) => !u.ok)).toEqual([]);
  });
  it('index.css 는 축소값을 :root 자신이 아니라 표식 붙은 요소에만 건다', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/:root\[data-header-shrunk='1'\]\s*\{\s*--header-now/);
    expect(css).toMatch(/:root\[data-header-shrunk='1'\]\s*:is\(\[data-community-secbar\],\s*\[data-header-now\]\)\s*\{\s*--header-now:\s*2\.75rem/);
  });
});
