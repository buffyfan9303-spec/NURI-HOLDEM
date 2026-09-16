// 모든 소스 파일이 **실제로 파싱된다**.
//
// 왜 이 계약이 필요한가 (2026-09-17 — 배포가 실제로 깨졌다)
//   커밋 8dab9d1 은 Vercel 빌드가 state=ERROR 로 실패했고, 라이브는 그 전 커밋에 머물렀다.
//   원인은 JSX 두 곳에서 `return (` · `&& (` **바로 뒤**에 `{/* 주석 */}` 을 넣은 것이다.
//   그 자리는 식(expression) 자리라 주석 컨테이너가 올 수 없다(children 자리에서만 유효).
//
//   🔴 그런데 아무도 못 잡았다:
//     · `npx tsc --noEmit` — **무의미하다.** 루트 tsconfig.json 은 `"files": []` + references 라
//       루트 프로젝트에 파일이 0개다. 0개를 검사하고 exit 0 을 준다. 진짜 검사는 **`tsc -b`** 다
//       (package.json 의 build 가 쓰는 것).
//     · `npm run lint` — 오류로 보고**했다**. 그런데 경고가 316건이라 요약줄에 묻혔다.
//     · `vitest` — 계약 테스트들이 이 파일들을 **문자열로** 읽지(readFileSync) import 하지 않아 침묵.
//     · `cmd | tail -3 && echo OK` — 파이프의 종료코드는 **tail** 의 것이다. 앞이 실패해도 OK 가 찍힌다.
//
//   그래서 '늘 돌리는 그물'(vitest)에 구문 검사를 둔다. tsc -b 와 중복이 아니다 —
//   tsc -b 는 build 에서만 돌고 ~60초다. 이건 1초 안에 **파일명과 줄번호를 집어** 준다.
//
// 이 파일이 보는 것: 구문(syntax)뿐이다. 타입은 안 본다(그건 tsc -b 의 일이다).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';

const SRC = join(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);

describe('소스 구문 — 빌드가 깨질 파일이 하나도 없다', () => {
  it('파일을 실제로 여럿 찾았다 — 탐색이 죽으면 조용히 통과하는 것을 막는다', () => {
    expect(FILES.length, 'src 아래 .ts/.tsx 를 못 찾았다(walk 가 죽었다)').toBeGreaterThan(200);
  });

  it('🔴 전부 구문 오류 0 — 하나라도 깨지면 vite build 가 실패해 배포가 옛 커밋에 멈춘다', () => {
    const broken: string[] = [];
    for (const f of FILES) {
      const src = ts.createSourceFile(
        f, readFileSync(f, 'utf8'), ts.ScriptTarget.ESNext, true,
        f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      // parseDiagnostics 는 공개 타입에 없지만 파서가 채운다(구문 오류 전용 — 타입 오류는 안 들어온다).
      const diags = (src as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] }).parseDiagnostics ?? [];
      for (const d of diags.slice(0, 3)) {
        const { line } = src.getLineAndCharacterOfPosition(d.start);
        broken.push(`${f.slice(SRC.length + 1).split(sep).join('/')}:${line + 1} — ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
      }
    }
    expect(broken, `구문 오류:\n  ${broken.join('\n  ')}`).toEqual([]);
  });
});
