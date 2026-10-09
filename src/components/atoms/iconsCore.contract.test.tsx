// 2026-10-07 번들 감축 PR A ③ — lucide 아이콘을 '첫 화면 핵심(Icon.tsx)' 과 '나중 청크(iconsExtra.ts)' 로 나눈 계약.
// 첫 화면 파일이 나중 청크 아이콘을 쓰면 그 아이콘은 빈 칸으로 떴다가 채워진다(깜빡임) — 그걸 소스에서 막는다.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import Icon, { type IconName } from './Icon';
import { loadIconsExtra } from './iconsExtraLoader';
import { entryGraph, iconNames, namesIn, staticImports } from './iconEntryGraph';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const keysOf = (src: string, start: string) => {
  const a = src.indexOf(start);
  const block = src.slice(a, src.indexOf('\n};', a));
  return new Set([...block.matchAll(/^\s*(?:'([a-z0-9-]+)'|([a-z0-9]+)):/gm), ...block.matchAll(/,\s*(?:'([a-z0-9-]+)'|([a-z0-9]+)):/g)].map((m) => m[1] ?? m[2]));
};
const CORE = keysOf(read('src/components/atoms/Icon.tsx'), 'const LUCIDE:');
const EXTRA = keysOf(read('src/components/atoms/iconsExtra.ts'), 'export const EXTRA:');

describe('아이콘 핵심/나중 분리', () => {
  it('키 파싱이 실제로 무언가를 읽었다(빈 집합 거짓 통과 방지)', () => {
    expect(CORE.size).toBeGreaterThan(30);
    expect(EXTRA.size).toBeGreaterThan(60);
    expect(CORE.has('close') && EXTRA.has('swords')).toBe(true);
  });

  it('같은 이름을 두 곳에 두지 않는다', () => {
    expect([...CORE].filter((n) => EXTRA.has(n))).toEqual([]);
  });

  // ⚠ 이 테스트는 아래 '청크를 받은 뒤' 테스트보다 **먼저** 돈다(같은 파일 안 순서) — 아직 안 받은 상태에서 동기로 그려지는지 본다.
  it('첫 화면(entry) 정적 그래프의 파일이 쓰는 아이콘은 청크 없이 동기로 그려진다', () => {
    const g = entryGraph(ROOT);
    expect(g.size).toBeGreaterThan(50);
    expect([...g].some((f) => /iconsExtra\.ts$/.test(f)), 'iconsExtra.ts 가 첫 화면에 정적으로 딸려 들어왔다').toBe(false);
    const names = iconNames(ROOT);
    const used = new Map<string, string>();
    for (const f of g) {
      if (/atoms[\\/]Icon\.tsx$/.test(f)) continue;
      for (const n of namesIn(readFileSync(f, 'utf8'), names)) used.set(n, f.slice(ROOT.length));
    }
    expect(used.size, '첫 화면 아이콘 이름을 하나도 못 찾았다(스캔 고장)').toBeGreaterThan(20);
    const bad = [...used].filter(([n]) => renderToStaticMarkup(<Icon name={n as IconName} />).includes('data-icon-pending'))
      .map(([n, f]) => `${f}: '${n}'`);
    expect(bad, '이 이름들을 iconsExtra.ts 에서 Icon.tsx 의 LUCIDE(핵심)로 옮겨라').toEqual([]);
  });

  it('lazy 화면은 아이콘 청크를 같이 기다린다', () => {
    expect(read('src/lib/lazyWithReload.ts')).toMatch(/Promise\.all\(\[factory\(\), loadIconsExtra\(\)/);
  });

  // PR #205 verifier P3 — 원시 React.lazy 는 아이콘 청크를 안 기다린다(GroupPosterSection → PosterFormModal 'clipboard' 가 빈 칸으로 열렸다).
  //   원시 lazy 로 여는 화면(과 그 화면만의 정적 그래프)은 나중 청크 아이콘을 쓰지 않거나, lazyWithReload 로 바꿔야 한다.
  it('원시 lazy() 로 여는 화면은 나중 청크 아이콘을 쓰지 않는다', () => {
    const entry = entryGraph(ROOT);
    const names = iconNames(ROOT);
    const srcFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? srcFiles(join(dir, d.name)) : /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
    const lazyTargets: [string, string][] = [];
    for (const f of srcFiles(join(ROOT, 'src'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\blazy\(\s*(?:async\s*)?\(\)\s*=>\s*import\(\s*['"](\.[^'"]+)['"]/g)) {
        const t = staticImports(f, `import x from '${m[1]}';`)[0];
        if (t) lazyTargets.push([f.slice(ROOT.length), t]);
      }
    }
    expect(lazyTargets.length, '원시 lazy 호출을 하나도 못 찾았다(스캔 고장)').toBeGreaterThan(2);
    const bad: string[] = [];
    for (const [from, t] of lazyTargets) {
      const seen = new Set<string>();
      const stack = [t];
      while (stack.length) {
        const f = stack.pop()!;
        if (seen.has(f) || entry.has(f)) continue;
        seen.add(f);
        const src = readFileSync(f, 'utf8');
        // 아이콘을 다루는 파일만(Icon 컴포넌트·IconName 타입) — 'filter' 같은 CSS 문자열 오탐을 뺀다(실측: 클락 sceneKit.ts)
        if (/\bIcon(Name)?\b/.test(src)) for (const n of namesIn(src, names)) if (EXTRA.has(n)) bad.push(`${from} → ${f.slice(ROOT.length)}: '${n}'`);
        stack.push(...staticImports(f, src));
      }
    }
    expect(bad, '이 화면을 lazyWithReload 로 열거나 아이콘을 Icon.tsx 핵심으로 옮겨라').toEqual([]);
  });

  it('모든 IconName 이 (청크를 받은 뒤) 실제 도형을 그린다 — 분리로 사라진 아이콘 0', async () => {
    await loadIconsExtra();
    const empty: string[] = [];
    for (const n of iconNames(ROOT)) {
      const html = renderToStaticMarkup(<Icon name={n as IconName} />);
      if (html.includes('data-icon-pending') || !/<(path|circle|rect|line|polyline|polygon|ellipse|g)\b/.test(html)) empty.push(n);
    }
    expect(empty).toEqual([]);
  });
});
