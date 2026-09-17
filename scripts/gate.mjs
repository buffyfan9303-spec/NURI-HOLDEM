#!/usr/bin/env node
// scripts/gate.mjs — 배포 전 단일 게이트. `npm run gate`
//
// 🔴 왜 이 파일이 생겼나 (2026-09-17)
//   이날 배포가 두 번 막혔는데, 두 번 다 **게이트가 통과했다고 말한 뒤** 막혔다:
//
//   ① `npx tsc --noEmit` 이 **0개 파일을 검사**하고 exit 0 을 줬다.
//      루트 tsconfig.json 이 `"files": []` + project references 라 루트 프로젝트에 파일이 없다.
//      진짜 검사는 `tsc -b` 다(package.json 의 build 가 쓰는 것). 그 사이 JSX 구문 오류 2곳이
//      그대로 나가 Vercel 빌드가 ERROR 로 죽었고, 라이브는 이전 커밋에 멈춘 채였다.
//
//   ② `npx tsc --noEmit | tail -3 && echo OK` 로 확인했다.
//      파이프의 종료코드는 **tail** 의 것이다. 앞이 죽어도 OK 가 찍힌다.
//
//   그래서 이 스크립트의 규칙은 둘이다:
//     · **파이프를 쓰지 않는다.** 각 단계를 stdio:inherit 으로 직접 돌리고 status 를 본다.
//     · **한 단계라도 실패하면 즉시 멈추고, 무엇이 왜 실패했는지 이름으로 말한다.**
//
// 🔴 오너 보호 파일
//   `npm run build` 는 `scripts/gen-sitemap.mjs` 를 돌려 **public/sitemap.xml 을 덮어쓴다**.
//   그 파일은 오너가 손으로 관리하는 보호 파일이라 CLAUDE.md 가 `git checkout --` 을 금지한다.
//   → 빌드 전에 **바이트를 통째로 백업**하고, 빌드 직후 **무조건 복원**한 뒤 해시를 대조한다.
//     (빌드가 실패해도 복원한다 — finally 로 감싼다.)
//
// 쓰는 법
//   npm run gate            전체(타입·단위·린트·빌드·번들예산·비밀스캔) — ci.yml 과 같은 집합(E2E 만 제외)
//   npm run gate -- --quick 빌드 빼고(타입·단위·린트만) — 편집 중 빠른 확인용

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const QUICK = process.argv.includes('--quick');
const SITEMAP = 'public/sitemap.xml';
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

let stepNo = 0;
const results = [];

/** 한 단계 실행 — 파이프 없음, 종료코드 그대로. 실패하면 즉시 던진다. */
function step(name, cmd, args) {
  stepNo += 1;
  const started = Date.now();
  console.log(`\n── [${stepNo}] ${name}\n   $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    results.push({ name, ok: false, secs });
    const e = new Error(`GATE_FAIL:${name}`);
    e.gateName = name;
    e.gateStatus = r.status;
    throw e;
  }
  results.push({ name, ok: true, secs });
}

function summary(failed) {
  console.log('\n═════ 게이트 요약 ═════');
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}  (${r.secs}s)`);
  if (failed) {
    console.log(`\n❌ 게이트 실패 — ${failed}\n   위 출력에서 그 단계의 오류를 읽어라. 다음 단계는 돌지 않았다.`);
  } else {
    console.log(`\n✅ 게이트 통과${QUICK ? ' (--quick: 빌드 생략 — 배포 전에는 빌드까지 돌려라)' : ''}`);
  }
}

let sitemapBefore = null;
try {
  // ① 타입 — `tsc -b` 여야 한다. `--noEmit` 은 0개를 검사한다(맨 위 주석 참고).
  step('타입체크 (tsc -b)', 'npx', ['tsc', '-b']);

  // ② 단위·계약 테스트
  step('단위·계약 테스트 (vitest)', 'npx', ['vitest', 'run']);

  // ③ 린트 — 경고는 통과, **오류는 실패**(eslint 기본 동작).
  //    경고가 300건대라 사람이 요약줄만 보면 오류가 묻힌다 — 그래서 사람이 아니라 종료코드가 판정한다.
  step('린트 (eslint + 공회전 가드)', 'npm', ['run', 'lint']);

  if (!QUICK) {
    if (existsSync(SITEMAP)) sitemapBefore = readFileSync(SITEMAP);
    // ④ 실제 빌드 — Vercel 이 돌리는 것과 같은 명령. 여기서 통과해야 배포가 산다.
    step('프로덕션 빌드 (npm run build)', 'npm', ['run', 'build']);

    // ⑤⑥ 🔴 2026-09-17: 이 둘이 **게이트에 없어서** 로컬 4단계 통과 → CI 실패가 났다.
    //   ci.yml 은 lint → build → **bundle:budget** → test:e2e → **secrets** 를 돈다.
    //   게이트가 CI 보다 느슨하면 로컬 초록은 거짓말이다 — 오늘 아침 반대 방향의 같은 구멍
    //   ('CI 는 gate 가 아니라 lint 를 부른다')을 고쳤는데, 이쪽이 남아 있었다.
    //   ⚠ test:e2e 는 일부러 뺀다(17분 + 운영 데이터 의존). 그건 CI 가 잰다.
    //   ⚠ bundle:budget 은 `.env.local` 이 없는 체크아웃에서 **임계 경로를 재지 못한다** —
    //     그 경우 스스로 '측정 불가' 라고 말하고 판정에서 뺀다(bundle-budget.mjs 참고).
    step('번들 예산 (bundle:budget)', 'npm', ['run', 'bundle:budget']);
    step('비밀 스캔 (secretlint)', 'npm', ['run', 'secrets']);
  }
  summary(null);
} catch (err) {
  summary(err?.gateName ?? String(err?.message ?? err));
  process.exitCode = 1;
} finally {
  // 빌드 성공·실패와 무관하게 **항상** 복원한다.
  if (sitemapBefore) {
    const after = existsSync(SITEMAP) ? readFileSync(SITEMAP) : null;
    const changed = !after || !after.equals(sitemapBefore);
    if (changed) {
      writeFileSync(SITEMAP, sitemapBefore);
      console.log(`\n♻️  ${SITEMAP} 복원 — 빌드가 덮어썼다 (백업 ${sha(sitemapBefore)} 로 되돌림)`);
    }
    const now = readFileSync(SITEMAP);
    if (!now.equals(sitemapBefore)) {
      console.log(`\n❌ ${SITEMAP} 복원 실패 — 직접 확인해라 (before ${sha(sitemapBefore)} / now ${sha(now)})`);
      process.exitCode = 1;
    }
  }
}
