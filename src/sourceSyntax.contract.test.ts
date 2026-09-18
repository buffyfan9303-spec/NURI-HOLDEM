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
    // 🔴 명시적 타임아웃 — vitest 기본 5,000ms 는 여유가 없다.
    //   실측(2026-09-19 · 12코어 단독): 소스 700여 개를 TS 파서로 전부 훑는 데 **3,076ms**.
    //   여유가 1.6배뿐이고 파일 수는 계속 는다 — 전체 suite 를 병렬로 돌리면 실제로 터졌다.
    //   이 계약이 터지면 '구문 오류가 있다'가 아니라 '검사를 못 했다'인데 CI 는 똑같이 빨갛다.
    //   빌드를 지키는 계약이 시간 때문에 죽는 것은 막는다 — 단언은 그대로다.
  }, 60_000);
});

// 🔴 2026-09-17 — 보이지 않는 제어문자가 계약을 **조용히 무력화**한 실례에서 나왔다.
//   `nash.data.test.ts` 의 정규식 `/const BIG_ANTE\b/` 가 소스에는 **진짜 백스페이스 바이트(0x08)** 로
//   들어가 있었다. 그러면 "BIG_ANTE 뒤에 백스페이스 문자가 오는 것" 을 찾게 되어 **영원히 매치되지 않는다** —
//   즉 그 계약은 아무것도 지키지 않으면서 초록이었다(음성 대조를 해 보고서야 드러났다).
//
//   eslint 의 no-control-regex 가 잡아 주긴 했지만 그건 **정규식 안**일 때뿐이다.
//   같은 바이트가 문자열이나 JSX 텍스트에 섞이면 아무도 보지 않는다:
//     · 화면 문구에 섞이면 사용자에게 깨진 글자로 나간다
//     · 비교식에 섞이면 영원히 거짓인 조건이 된다
//   눈에 보이지 않는다는 것이 이 부류의 본질이라 **기계가 세는 수밖에 없다.**
//
//   ⚠ 무엇을 **세지 않는지**가 중요하다:
//     · 탭(0x09)·LF(0x0A)·CR(0x0D) 은 제외한다. 특히 CR 을 세면 **거짓 경보 공장**이 된다 —
//       이 저장소는 core.autocrlf=true 라 줄끝이 파일 속성이 아니라 **체크아웃 속성**이고,
//       계정·머신이 바뀌면 값이 통째로 뒤집힌다(CLAUDE.md 참고). 그건 다른 문제다.
//     · 한글·이모지(U+00A0 이상)는 정상이다.
//   남는 것은 C0 제어문자(0x00~0x08 · 0x0B · 0x0C · 0x0E~0x1F)와 DEL(0x7F) 뿐이고,
//   이건 **소스에 원시 바이트로 들어갈 정당한 이유가 없다.** 값이 꼭 필요하면 `\u0000` 처럼 이스케이프로 쓴다
//   (그래야 diff·리뷰·복붙에서 살아남는다 — pendingViewIntent.test.ts 의 NUL 을 그렇게 바꿨다).
describe('소스에 보이지 않는 제어문자가 없다', () => {
  it('🔴 C0 제어문자·DEL 이 원시 바이트로 박힌 소스가 없다 — 계약을 조용히 무력화한다', () => {
    // 이 줄만 no-control-regex 예외다 — **제어문자를 찾는 것이 이 테스트의 목적**이라 규칙과 의도가 정반대다.
    // eslint-disable-next-line no-control-regex
    const BAD_CHAR = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    const bad: string[] = [];
    for (const f of FILES) {
      // CR 은 여기서 통째로 지운다(줄끝 문제와 섞이지 않게).
      const lines = readFileSync(f, 'utf8').replace(/\r/g, '').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(BAD_CHAR);
        if (m) {
          const cp = m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
          bad.push(f + ':' + (i + 1) + ' 에 U+' + cp + ' — 이스케이프(\\u' + cp + ')로 바꿔라');
        }
      }
    }
    expect(bad, '원시 제어문자:' + '\n  ' + bad.join('\n  ')).toEqual([]);
  });
});
