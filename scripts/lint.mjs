#!/usr/bin/env node
// scripts/lint.mjs — `npm run lint` 의 실체. eslint 를 돌리되 **몇 개를 봤는지**까지 확인한다.
//
// 🔴 왜 (2026-09-17)
//   이 저장소가 반복해서 밟은 부류는 "검사가 실패했다"가 아니라 **"검사가 아무것도 안 보고 통과했다"** 다.
//   같은 날 `npx tsc --noEmit` 이 루트 tsconfig 의 `"files": []` 때문에 **0개 파일을 검사하고 exit 0** 을 줬고,
//   그 사이 JSX 구문 오류가 나가 Vercel 빌드가 죽었다(scripts/gate.mjs 머리말 참고).
//
//   eslint 도 같은 모양이 가능하다. ignore 가 과도하게 넓어지면 **소스트리를 통째로 건너뛰고 조용히 통과**한다.
//   (완전히 0개면 eslint 가 exit 2 로 크게 울지만, **1~몇 개만 남는 경우**는 조용하다 — 그쪽이 위험한 모양이다.)
//   eslint.config.js 는 사고가 날 때마다 ignore 를 덧대 온 파일이라 이 노출면이 실재한다.
//
//   그래서 통과 조건을 하나 더 둔다: **린트한 파일 수가 문턱을 넘어야 한다.**
//
// 🔴 자리가 중요하다 — `scripts/gate.mjs` 가 아니라 **여기**다.
//   CI(.github/workflows/ci.yml)는 `npm run gate` 를 부르지 않고 `npm run lint` 를 부른다.
//   가드를 gate.mjs 에만 두면 '게이트를 기억해서 친 사람'만 보호받는다 — 이 저장소가 이미 두 번 썩은 경로다.
//   package.json 의 lint 엔트리를 이 파일로 돌려 두면 **CI 와 게이트가 같은 한 곳**을 지난다.

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 최소 린트 대상 수. 2026-09-17 실측 682개(ts 486 · tsx 173 · mjs 15 · js 8).
 *  1.7배 여유 — 파일이 조금 오가는 것으로는 안 울고, **스캔이 무너질 때만** 운다.
 *  ⚠ 저장소가 정말로 줄어서 여기 걸리면 숫자를 고치는 **명시적 커밋**을 남겨라.
 *    그 커밋이 곧 "우리가 검사 범위를 줄였다"는 기록이다 — 조용히 썩는 면제 목록과 다른 점이 이것이다. */
const MIN_FILES = 400;

const dir = mkdtempSync(join(tmpdir(), 'nuri-lint-'));
const out = join(dir, 'eslint.json');
try {
  // ⚠ 반드시 `-o` 파일로 받는다. JSON 이 2MB 를 넘어(실측 2,157,707바이트)
  //   spawnSync 기본 maxBuffer(1MB)로는 조용히 잘린다 — 그 자체가 또 하나의 거짓 초록이 된다.
  const r = spawnSync('npx', ['eslint', '.', '-f', 'json', '-o', out], {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });

  let results;
  try {
    results = JSON.parse(readFileSync(out, 'utf8'));
  } catch {
    console.error(`\n❌ 린트 결과를 읽지 못했다 (eslint exit ${r.status}). 위 출력을 확인해라.`);
    process.exit(1);
  }

  const files = results.length;
  const errors = results.reduce((n, f) => n + f.errorCount, 0);
  const warnings = results.reduce((n, f) => n + f.warningCount, 0);

  // 오류는 사람이 읽을 수 있게 직접 찍는다(json 포맷터라 stylish 출력이 없다).
  for (const f of results) {
    for (const m of f.messages) {
      if (m.severity !== 2) continue;
      console.error(`  ${f.filePath}:${m.line}:${m.column}  error  ${m.message}  ${m.ruleId ?? ''}`);
    }
  }

  console.log(`\n린트: 파일 ${files}개 · 오류 ${errors} · 경고 ${warnings}`);

  if (files < MIN_FILES) {
    console.error(
      `\n❌ 린트가 ${files}개만 봤다 (최소 ${MIN_FILES}).\n` +
        `   검사가 통과한 것이 아니라 **대상을 거의 못 찾은 것**이다.\n` +
        `   eslint.config.js 의 ignores 와 실행 위치(cwd)를 확인해라.`,
    );
    process.exit(1);
  }
  if (errors > 0) {
    console.error(`\n❌ 린트 오류 ${errors}건 — 위 목록을 보라. (경고 ${warnings}건은 통과시킨다)`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\n❌ eslint 가 exit ${r.status} 로 끝났다(오류 0인데도). 설정·플러그인 문제일 수 있다.`);
    process.exit(1);
  }
  console.log('✅ 린트 통과');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
