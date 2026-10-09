// 첫 화면(entry) 정적 import 그래프와 그 안에서 쓰는 아이콘 이름 — Icon 분리 계약(iconsCore.contract.test.ts)과 측정 스크립트가 같이 쓴다.
// 테스트 전용 도구다(앱 번들에 들어가지 않는다 — node:fs 를 쓴다).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const EXT = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveRel(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const e of EXT) {
    const p = base + e;
    if (/\.(ts|tsx)$/.test(p) && existsSync(p)) return p;
  }
  return null;
}

/** 값 import(정적)만 따라간다 — `import type`·`export type`·`import()` 는 제외. 주석 안의 import 문도 세지만 과대 포함이라 안전하다. */
export function staticImports(file: string, src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    if (m[2]) continue;
    if (!m[3].startsWith('.')) continue;
    const p = resolveRel(file, m[3]);
    if (p) out.push(p);
  }
  return out;
}

export function entryGraph(root: string): Set<string> {
  const seen = new Set<string>();
  const stack = [join(root, 'src/main.tsx')];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...staticImports(f, readFileSync(f, 'utf8')));
  }
  return seen;
}

export function iconNames(root: string): Set<string> {
  const src = readFileSync(join(root, 'src/components/atoms/Icon.tsx'), 'utf8');
  const body = /export type IconName =([\s\S]*?);/.exec(src)![1];
  return new Set([...body.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
}

/** 파일에 문자열 리터럴로 나오는 아이콘 이름(과대 포함 — 'home' 같은 탭 id 도 잡힌다. 그래도 안전하다). */
export function namesIn(src: string, names: Set<string>): string[] {
  return [...new Set([...src.matchAll(/['"`]([a-z0-9-]+)['"`]/g)].map((m) => m[1]).filter((n) => names.has(n)))];
}
