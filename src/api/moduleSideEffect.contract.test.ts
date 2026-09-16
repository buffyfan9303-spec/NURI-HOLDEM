// 모듈 최상위 부작용 계약 (2026-09-16) — 체크아웃이 달라도 단위 게이트가 같은 답을 내게 한다.
//
// 왜 있나(실제로 밟은 것)
//   `src/api/events.ts` 가 모듈 최상위에서 `supabase.auth.onAuthStateChange(...)` 를 불렀다.
//   `.env.local` 은 gitignore 라 **새 git worktree 에는 따라오지 않는다** → `IS_MOCK` 이 참 →
//   `supabase` 가 null → 그 줄이 **import 순간** TypeError 를 던진다.
//   그러면 그 파일을 import 하는 테스트 파일이 통째로 `(0 test)` 가 되어 조용히 사라진다.
//   2026-09-16 실측: `events.slug.test.ts`·`events.current.test.ts` 가 0건이 되어 단위 테스트가
//   `2229 passed` → `2188 passed / 2 failed` 로 보였다. **코드 회귀가 아니라 환경이었다.**
//   이어받은 사람이 events.ts 를 뜯게 만드는 종류의 함정이라 계약으로 잠근다.
//
// 이 파일이 보는 것: `src/api/**`·`src/lib/**` 의 **최상위(들여쓰기 0칸) 실행문**이
//   `supabase.` 를 가드 없이 만지지 않는다. 함수 안에서 쓰는 것은 자유다(호출 시점엔 env 가 있다).
//
// 못 보는 것: 다른 전역 객체(localStorage 등)의 최상위 접근. 그쪽은 이미 try/catch 관용구가 있다.
//
// 음성 대조: `src/api/events.ts` 의 `if (!IS_MOCK) ` 를 지우면 이 계약이 빨개진다(2026-09-16 확인).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 줄끝 정규화 — core.autocrlf=true 라 체크아웃마다 작업트리 줄끝이 다르다(CLAUDE.md 참고 메모). */
const eol = (s: string) => s.split('\r\n').join('\n');

const DIRS = ['api', 'lib'];
const files = DIRS.flatMap((d) => {
  const dir = join(__dirname, '..', d);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map((f) => ({ rel: `src/${d}/${f}`, path: join(dir, f) }));
});

describe('모듈 최상위 부작용 — env 없는 체크아웃에서도 import 가 살아 있어야 한다', () => {
  it('🔴 src/api·src/lib 에 파일이 실제로 잡힌다(빈 목록이면 이 계약은 무의미하다)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('🔴 최상위 실행문이 supabase 를 가드 없이 만지지 않는다', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = eol(readFileSync(f.path, 'utf-8')).split('\n');
      lines.forEach((line, i) => {
        // 들여쓰기 0칸 = 모듈 최상위. 주석·import·export 선언은 제외한다.
        if (/^\s/.test(line) || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return;
        if (/^(import|export|type|interface|const|let|function|class|async function)\b/.test(line)) return;
        if (!/\bsupabase\s*\./.test(line)) return;
        // 허용: IS_MOCK 로 막아 둔 형태
        if (/\bIS_MOCK\b/.test(line)) return;
        offenders.push(`${f.rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(
      offenders,
      `모듈 최상위에서 supabase 를 가드 없이 만진다 — .env.local 이 없는 체크아웃에서 import 가 터진다.\n` +
        `\`if (!IS_MOCK) …\` 로 감싸라(src/api/_session.ts:41 의 관용구).\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
