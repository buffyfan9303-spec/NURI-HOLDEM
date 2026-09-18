// e2e 스펙이 **수집 가능한가**를 단위 테스트에서 10초 안에 확인한다.
//
// 🔴 왜 만들었나 — 2026-09-18 에 실제로 난 사고:
//   `src/lib/emojiPolicy.ts` 를 지우면서 `e2e/emoji-glyphs.spec.ts` 의 import 가 깨졌다.
//   Playwright 는 스펙 하나라도 **수집 단계**에서 터지면 그 자리에서 멈춘다 —
//   즉 `npm run test:e2e` 가 **한 줄도 안 돌고** 있었다. 게이트가 빨간 게 아니라 **없었다.**
//   그 상태로 1시간(15:50 ca891a4 → 16:49 cbd7a1e)을 달렸고, 그동안 쌓인 stale 단언 5건이
//   한꺼번에 터져 나왔다. **빨간 것보다 안 도는 것이 나쁘다.**
//
// 무엇을 보나: e2e 스펙이 상대경로로 끌어오는 `../src/**` 모듈이 **실제로 존재하는가**.
//   (패키지 import 는 node_modules 해석이라 여기서 보지 않는다 — 그건 설치 문제고 즉시 드러난다.)
//
// 왜 vitest 인가: 이 검사는 **삭제와 같은 순간**에 돌아야 값어치가 있다.
//   `npm run test:e2e` 는 6분이라 "나중에 한 번" 이 되고, 그 '나중' 이 오늘은 1시간이었다.
//   단위 스위트는 10초라 파일을 지운 직후에 돈다.
//
// ⚠ 이 검사가 못 보는 것: 런타임 오류·셀렉터 불일치·논리 오류. 그건 실제 실행의 몫이다.
//   여기서는 **스위트가 시동은 걸리는가**만 본다.
//
// 실행: npx vitest run src/lib/e2eCollect.contract.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const E2E = join(process.cwd(), 'e2e');

function specs(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) specs(p, out);
    else if (/\.(spec|ts)$/.test(f)) out.push(p);
  }
  return out;
}

/** TS 는 확장자를 생략한다 — 실제 파일을 찾을 때 붙여 본다. */
const CANDIDATES = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

interface Broken { spec: string; imported: string }

function brokenImports(): Broken[] {
  const bad: Broken[] = [];
  for (const p of specs(E2E)) {
    const src = readFileSync(p, 'utf8');
    // `from '…'` 과 `import('…')` 둘 다 — 상대경로만 본다.
    const rels = [
      ...src.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g),
      ...src.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    for (const rel of rels) {
      const base = resolve(dirname(p), rel);
      if (!CANDIDATES.some((ext) => existsSync(base + ext))) {
        bad.push({ spec: p.replace(process.cwd(), '').replace(/\\/g, '/'), imported: rel });
      }
    }
  }
  return bad;
}

describe('e2e 스위트 시동 — 수집 단계에서 멈추지 않는다', () => {
  it('🔴 검사가 실제로 스펙을 읽고 있다 — 0개면 통과가 아니다', () => {
    // 경로가 틀리면 빈 배열을 조용히 통과시킨다. 그게 이 검사가 막으려는 바로 그 부류다.
    expect(specs(E2E).length, 'e2e 스펙을 하나도 못 찾았다 — 경로가 바뀌었다').toBeGreaterThan(50);
  });

  it('🔴 스펙이 끌어오는 src 모듈이 전부 실재한다', () => {
    const bad = brokenImports();
    expect(
      bad.map((b) => `${b.spec} → '${b.imported}'`),
      '깨진 import 가 있다. Playwright 는 스펙 하나만 터져도 **수집 단계에서 멈춰**\n'
      + '스위트 전체가 한 줄도 안 돈다(2026-09-18 에 1시간 그랬다).\n'
      + '→ 지운 모듈을 스펙이 아직 쓰고 있다면, 그 스펙이 **무엇을 지키던 검사인지 먼저 읽어라.**\n'
      + '  emojiPolicy 때는 "이모지 금지 규약" 과 "두부(□) 렌더 검사" 가 한 파일에 있었고,\n'
      + '  규약만 지우면 됐는데 파일째 지워서 멀쩡한 검사까지 죽었다.',
    ).toEqual([]);
  });
});
