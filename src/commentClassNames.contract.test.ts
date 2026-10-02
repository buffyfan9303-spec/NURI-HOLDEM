// 주석에 적은 클래스명이 빌드 CSS 를 만들지 않는다 — 계약 테스트.
// 실행: npx vitest run src/commentClassNames.contract.test.ts
//
// 왜: Tailwind 는 소스를 **평문으로** 훑는다. 주석에 `ml-5` · `py-24` · `text-amber-500` 처럼 클래스 모양의 글자가 있으면
//   실제로 쓰지 않아도 그 유틸 규칙이 CSS 에 실린다(2026-10-03 실측: 주석에서만 나온 규칙 23개 · 1.4KB raw · gz 169B,
//   CSS 예산 34.9/35KB 에 여유가 없었다). 규칙이 죽은 채 실리는 것도 문제지만, 그 클래스를 **동적으로 이어 붙여 쓰는 코드**가 있다면
//   주석 덕에 우연히 동작하다 주석을 고치는 날 조용히 깨진다.
//
// 무엇을 검사하나: 훑는 파일(index.html · src/**/*.{js,ts,jsx,tsx} 중 *.test.* 제외 — src/index.css 의 @source 와 같다)에서
//   ① 원본 그대로 ② 주석만 공백으로 지운 것, 두 번 Tailwind 후보(Oxide 스캐너)를 뽑아 **같은 컴파일러로** CSS 를 만들고 비교한다.
//   둘이 다르면 그 차이가 곧 '주석 때문에 생긴 규칙'이다.
//
// 고치는 법: 주석 안의 클래스명을 클래스로 읽히지 않게 쓴다 — 하이픈을 비분리 하이픈(‑ U+2011)으로 바꾸거나(`ml‑5`)
//   설명어로 풀어 쓴다("둥근 모서리"). 의미는 그대로고 CSS 는 늘지 않는다.
//   ⛔ `@source not inline(...)` 에 넣어 끄지 마라 — 그 클래스를 나중에 진짜로 쓰는 순간 조용히 빠지는 함정이 된다.
//
// 음성 대조: 아무 `.tsx` 주석에 `py-24` 한 줄을 적으면 ① 이 실패한다(2026-10-03 확인).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { Scanner } from '@tailwindcss/oxide';
import { compile } from 'tailwindcss';

const SRC = fileURLToPath(new URL('./', import.meta.url));
const ROOT = join(SRC, '..');
const blank = (s: string) => s.replace(/[^\r\n]/g, ' ');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(js|ts|jsx|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const kindOf = (f: string) => (f.endsWith('.tsx') ? ts.ScriptKind.TSX : f.endsWith('.jsx') ? ts.ScriptKind.JSX : f.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS);

/** 파일 안의 모든 주석 구간. JSX 글자(`<p>// 안녕</p>`)는 주석이 아니므로 건너뛴다. */
function commentRanges(file: string, text: string): { pos: number; end: number }[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));
  const leaves: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const kids = n.getChildren(sf);
    if (kids.length === 0) leaves.push(n); else kids.forEach(visit);
  };
  visit(sf);
  const isJsxText = (n: ts.Node) => n.kind === ts.SyntaxKind.JsxText;
  const ranges = new Map<number, { pos: number; end: number }>();
  const add = (rs: ts.CommentRange[] | undefined) => rs?.forEach((r) => ranges.set(r.pos, { pos: r.pos, end: r.end }));
  leaves.forEach((leaf, i) => {
    if (isJsxText(leaf)) return;
    add(ts.getLeadingCommentRanges(text, leaf.getFullStart()));
    const next = leaves[i + 1];
    if (!(next && isJsxText(next))) add(ts.getTrailingCommentRanges(text, leaf.getEnd()));
  });
  return [...ranges.values()].sort((a, b) => a.pos - b.pos);
}

const rulesOf = (css: string) => new Set(css.split('\n').filter((l) => /^\s*[.@]/.test(l) && l.trimEnd().endsWith('{')).map((l) => l.trim()));

describe('주석 속 클래스명은 CSS 를 만들지 않는다', () => {
  it('① 주석을 지운 소스와 원본 소스에서 Tailwind 가 만드는 CSS 가 같다', async () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    // 이 테스트가 훑는 범위가 index.css 의 @source 와 어긋나면 조용히 다른 것을 검사하게 된다.
    expect(css, "index.css 의 @source 범위가 바뀌었다 — 이 테스트의 sourceFiles()/index.html 도 같이 고쳐라").toContain("@source './**/*.{js,ts,jsx,tsx}';");
    expect(css).toContain("@source not './**/*.test.{ts,tsx}';");
    expect(css).toContain("@source '../index.html';");

    const files = sourceFiles(SRC).map((f) => ({ file: f, ext: f.split('.').pop() as string, text: readFileSync(f, 'utf8') }));
    files.push({ file: join(ROOT, 'index.html'), ext: 'html', text: readFileSync(join(ROOT, 'index.html'), 'utf8') });

    const comments: { file: string; text: string; pos: number }[] = [];
    const full: { content: string; extension: string }[] = [];
    const stripped: { content: string; extension: string }[] = [];
    for (const f of files) {
      const rs = f.ext === 'html'
        ? [...f.text.matchAll(/<!--[\s\S]*?-->/g)].map((m) => ({ pos: m.index as number, end: (m.index as number) + m[0].length }))
        : commentRanges(f.file, f.text);
      let code = '';
      let last = 0;
      for (const r of rs) {
        code += f.text.slice(last, r.pos) + blank(f.text.slice(r.pos, r.end));
        last = r.end;
        comments.push({ file: f.file, text: f.text.slice(r.pos, r.end), pos: r.pos });
      }
      code += f.text.slice(last);
      full.push({ content: f.text, extension: f.ext });
      stripped.push({ content: code, extension: f.ext });
    }

    const candidates = (list: { content: string; extension: string }[]) => new Scanner({}).scanFiles(list);
    // 컴파일러는 후보를 누적하므로(build 를 다시 부르면 이전 후보가 남는다) 매번 새로 만든다.
    const render = async (cands: string[]) => {
      const c = await compile(css, {
        base: SRC,
        loadStylesheet: async (id: string, base: string) => {
          const path = fileURLToPath(import.meta.resolve(id.endsWith('.css') ? id : `${id}/index.css`));
          return { path, base, content: readFileSync(path, 'utf8') };
        },
      });
      return c.build(cands);
    };

    const a = await render(candidates(full));
    const b = await render(candidates(stripped));
    if (a === b) {
      expect(a).toBe(b);
      return;
    }
    // 실패 — 주석 때문에 생긴 규칙과 그 주석 자리를 보여 준다.
    const ra = rulesOf(a);
    const rb = rulesOf(b);
    const extra = [...ra].filter((r) => !rb.has(r));
    const names = extra.map((r) => r.replace(/\\(.)/g, '$1').replace(/^\./, '').split(/[\s{,:>]/)[0]);
    const where = names.flatMap((n) => comments.filter((c) => c.text.includes(n)).slice(0, 2).map((c) => {
      const line = readFileSync(c.file, 'utf8').slice(0, c.pos + c.text.indexOf(n)).split('\n').length;
      return `${c.file.replace(ROOT, '').replace(/\\/g, '/')}:${line}  ${n}`;
    }));
    expect.fail(
      `주석 때문에 CSS 규칙 ${extra.length}개가 더 생긴다. 그 글자를 클래스로 읽히지 않게 고쳐라(하이픈 → ‑ U+2011, 또는 설명어):\n  ${extra.join('\n  ')}\n주석 위치:\n  ${where.join('\n  ')}`,
    );
  }, 180_000);
});
