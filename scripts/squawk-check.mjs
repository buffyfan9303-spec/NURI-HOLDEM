#!/usr/bin/env node
// scripts/squawk-check.mjs — 2026-09-28 도구 도입.
//
// 왜: 마이그레이션을 라이브 DB 에 MCP execute_sql 로 **직접 적용**하는 구조라(CLAUDE.md),
//   잠금이 긴 DDL(인덱스 비동시 생성·기본값 있는 NOT NULL 추가 등)이 적용 즉시 운영 정지로 이어진다.
//   squawk 는 그 부류를 정적으로 잡는다. RLS·GRANT·SECURITY DEFINER 는 안 본다 — 그건
//   nuri-migration 스킬과 Supabase MCP get_advisors 몫이다(중복 아님).
//
// 범위: **새 마이그레이션 파일만**. 옛 287개 전체를 돌리면 경고 폭탄이라 신호가 죽는다(연구 보고서 §4).
//   "새 파일" = 인자로 준 파일, 없으면 git 에서 아직 origin/main 에 없는 supabase/migrations/*.sql
//   (untracked + staged-added + committed-but-not-on-main 전부 포함).
//
// 씀:
//   node scripts/squawk-check.mjs                        # 자동 감지
//   node scripts/squawk-check.mjs supabase/migrations/20260928a_x.sql ...  # 지정

import { spawnSync } from 'node:child_process';

function detectNewMigrations() {
  const base = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' });
  const mergeBase = base.status === 0 ? base.stdout.trim() : 'HEAD';

  const committed = spawnSync('git', ['diff', '--name-only', '--diff-filter=A', `${mergeBase}..HEAD`, '--', 'supabase/migrations'], { encoding: 'utf8' });
  const working = spawnSync('git', ['status', '--porcelain', '--', 'supabase/migrations'], { encoding: 'utf8' });

  const files = new Set();
  for (const line of (committed.stdout || '').split('\n')) {
    const f = line.trim();
    if (f) files.add(f);
  }
  for (const line of (working.stdout || '').split('\n')) {
    const m = /^(\?\?|A |M ) (.+\.sql)$/.exec(line);
    if (m) files.add(m[2].trim());
  }
  return [...files].filter((f) => f.endsWith('.sql'));
}

const args = process.argv.slice(2);
const files = args.length > 0 ? args : detectNewMigrations();

if (files.length === 0) {
  console.log('squawk: 새 마이그레이션 파일 없음 — 건너뜀');
  process.exit(0);
}

console.log(`squawk: 검사 대상 ${files.length}개\n  ${files.join('\n  ')}`);

let failed = false;
for (const f of files) {
  const r = spawnSync('npx', ['--yes', 'squawk-cli', f], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
