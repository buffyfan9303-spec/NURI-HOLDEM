// 화면에 서버 오류 원문(`e.message`)을 그대로 내보내는 관용구가 다시 생기지 않는다 — 보안 표준 6(내부 식별자·SQL 노출 금지).
//
// 왜 필요한가: PostgrestError 는 `extends Error` 라 `e instanceof Error ? e.message : '실패'` 가 'permission denied for table …' 같은
//   DB 원문을 그대로 토스트한다(src/lib/dbError.ts 머리말). 2026-10-02 C2 에서 164곳을 `msgOf(e, 기본문구)` 로 바꿨다.
//   표시는 msgOf(서버 한국어 문장만 통과)·authMsgOf(Auth 코드 표)만 쓴다.
//
// 2026-10-03 D1 — 내 매장 파일(store-team)까지 전부 바꿔 예외 목록을 없앴다. **예외 목록을 다시 만들어 통과시키지 마라.**
//
// 음성 대조: 아무 화면 파일에 `toast.show(e instanceof Error ? e.message : '실패', 'error')` 를 되돌려 넣으면 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = __dirname;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// 화면으로 가는 원문 관용구 3종: ① X instanceof Error ? X.message ② toast.show(X.message ③ 템플릿 ${X.message}
const RAW_IDIOMS: Array<[string, RegExp]> = [
  ['instanceof Error ? e.message', /(\w+) instanceof Error (?:&& \1\.message )?\? \1\.message\b(?! : '')/],
  ['toast.show(error.message', /toast\.show\(\s*(?:e|e2|err|error)\.message\b/],
  ['toast.show(`…${e.message}`', /toast\.show\(.*\$\{\s*(?:e|e2|err|error)\.message\s*\}/],
];

describe('화면에 서버 오류 원문을 내보내는 관용구가 없다', () => {
  const files = walk(SRC)
    .map((p) => ({ p, rel: relative(SRC, p).split(sep).join('/') }))
    .filter(({ rel }) => /^(App\.tsx|components\/|lib\/|pages\/)/.test(rel));

  it('파일을 실제로 여럿 읽었다 — 탐색이 죽으면 조용히 통과하는 것을 막는다', () => {
    expect(files.length).toBeGreaterThan(150);
    // 내 매장 파일도 검사 대상이다(D1 이전엔 예외 목록이 이 파일들을 뺐다)
    for (const f of ['components/features/StoreDashboard.tsx', 'components/features/clock/TournamentClock.tsx', 'components/features/VenueCustomizePanel.tsx'])
      expect(files.some(({ rel }) => rel === f), f).toBe(true);
  });

  it('원문 관용구 0건', () => {
    const hits: string[] = [];
    for (const { p, rel } of files) {
      const lines = readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;   // 주석은 설명이다
        for (const [name, re] of RAW_IDIOMS) if (re.test(line)) hits.push(`${rel}:${i + 1} ${name}`);
      });
    }
    expect(hits, `msgOf(e, '기본 문구') 로 바꿔라 — ${hits.length}곳`).toEqual([]);
  });
});
