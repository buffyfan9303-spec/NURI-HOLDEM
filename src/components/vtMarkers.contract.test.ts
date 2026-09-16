// index.css 가 이름을 주는 **모든** VT 표식이 소스에 실재한다.
//
// 왜 이 계약이 필요한가 (2026-09-17)
//   `html[data-vt-scope='x'] [data-foo] { view-transition-name: … }` 는 `[data-foo]` 가 사라져도
//   **아무것도 안 잡고 조용히 성공한다.** CSS 에서 0개를 잡는 셀렉터는 오류가 아니다.
//   그러면 그 요소는 다시 조상 스냅샷 안으로 빨려 들어가 패널과 함께 미끄러지는데,
//   테스트는 전부 초록이고 화면만 예전으로 돌아간다.
//
//   🔴 이 파일이 생긴 이유는 **범위** 다. 같은 날 만든 vtRailMarkers.contract.test.ts 는
//      내가 그날 건드린 표식 **2개만** 하드코딩했다. 나머지 35개는 여전히 무방비였다 —
//      "오늘 고친 것만 지키는 계약"은 다음에 같은 사고를 그대로 허용한다.
//      그래서 여기서는 **index.css 를 읽어 표식 목록을 뽑아** 전수로 대조한다.
//      새 표식이 생기면 이 테스트가 **자동으로** 그것도 지킨다(목록을 손으로 늘릴 필요가 없다).
//
// 반대 방향(소스에 표식은 있는데 CSS 규칙이 없는 것)은 **일부러 보지 않는다** —
//   표식은 VT 말고 다른 용도(e2e 셀렉터·스크롤 소유자 표시)로도 쓰이고, 그건 결함이 아니다.
//
// 이 저장소 vitest 는 environment: 'node' 라 렌더 테스트가 안 된다 → 소스 계약으로 잠근다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** 주석 안의 표식 이름이 '있다'고 거짓 통과시키지 않도록 코드만 남긴다. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const ALL_TSX = walk(SRC).map((f) => codeOnly(readFileSync(f, 'utf8'))).join('\n');

/** index.css 가 VT 스코프 아래에서 잡는 표식 전부 */
const markers = [
  ...new Set(
    [...CSS.matchAll(/html\[data-vt-scope='[a-z0-9-]+'\]\s+\[(data-[a-z-]+)\]/g)].map((m) => m[1]),
  ),
].sort();

describe('VT 표식 — CSS 가 잡는 것이 소스에 실재한다', () => {
  it('정규식이 죽으면 조용히 통과하는 것을 막는다 — 표식이 여럿 잡힌다', () => {
    expect(markers.length, 'index.css 에서 VT 표식을 못 찾았다(정규식이 죽었다)').toBeGreaterThanOrEqual(20);
    expect(ALL_TSX.length, 'src 아래 .tsx 를 못 읽었다').toBeGreaterThan(500_000);
  });

  it('🔴 표식 전부가 소스에 있다 — 없으면 그 셀렉터는 0개를 잡고 조용히 성공한다', () => {
    const missing = markers.filter((m) => !ALL_TSX.includes(m));
    expect(
      missing,
      `index.css 가 이 표식들에 view-transition-name 을 주는데 소스에 없다 — ` +
        `그 요소는 조상 스냅샷에 갇혀 패널과 함께 미끄러진다: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
