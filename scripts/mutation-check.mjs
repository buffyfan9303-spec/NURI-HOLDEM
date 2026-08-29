#!/usr/bin/env node
// scripts/mutation-check.mjs — 뮤테이션 검증(테스트가 진짜 잡는가).
//
// 왜 이게 필요한가: 이 프로젝트에는 **"통과하는데 아무것도 안 지키는" 테스트가 실제로 있었다.**
//   e2e/design-tokens.spec.ts 주석에 그대로 남아 있다 —
//   "계산된 스타일만 재면 규칙을 지워도 테스트가 통과한다 (회귀 주입 실험에서 이 테스트만 못 잡았다)".
//   통과하는 테스트 수를 세는 것은 안전의 증거가 아니다. **깨뜨렸을 때 실패하는가**가 증거다.
//
// 방식: 소스에 작은 변이(>= → > 등)를 심고 그 파일의 테스트를 돌린다.
//   · 테스트가 실패하면  → 그 줄은 **지켜지고 있다**(뮤턴트 사살).
//   · 테스트가 통과하면  → 그 줄은 **아무도 안 보고 있다**(뮤턴트 생존). 이게 찾으려는 것이다.
//
// 사용:
//   node scripts/mutation-check.mjs                 # 기본 목록, 파일당 최대 6개
//   node scripts/mutation-check.mjs --max 12        # 더 깊게
//   node scripts/mutation-check.mjs --file src/lib/icm.ts
//   node scripts/mutation-check.mjs --ci            # 생존자가 있으면 종료코드 1

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAX_PER_FILE = Number(argOf('--max', 6));
const ONLY_FILE = argOf('--file', null);
const CI = args.includes('--ci');

// ── 주석·문자열 마스킹 ──────────────────────────────────────────────────────
// 주석 안의 `>=` 를 바꾸면 동작이 안 변하니 테스트가 당연히 통과하고, 그건 **가짜 생존자**다.
// (뮤테이션 도구가 신뢰를 잃는 가장 흔한 이유가 이것이다)
function maskable(src) {
  const ok = new Array(src.length).fill(true);
  let i = 0;
  const mark = (a, b) => { for (let k = a; k < b && k < ok.length; k++) ok[k] = false; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; mark(i, end); i = end; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; mark(i, end); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
      mark(i, j + 1); i = j + 1; continue;
    }
    i++;
  }
  return ok;
}

// ── 변이 연산자 ────────────────────────────────────────────────────────────
// 길이가 바뀌어도 되도록 '한 지점씩' 적용하고 매번 원본에서 다시 만든다.
const OPS = [
  { find: '>=', to: '>',  label: '>= → >' },
  { find: '<=', to: '<',  label: '<= → <' },
  { find: '===', to: '!==', label: '=== → !==' },
  { find: '!==', to: '===', label: '!== → ===' },
  { find: '&&', to: '||', label: '&& → ||' },
  { find: 'Math.max', to: 'Math.min', label: 'max → min' },
  { find: 'Math.min', to: 'Math.max', label: 'min → max' },
  { find: 'Math.floor', to: 'Math.ceil', label: 'floor → ceil' },
];

function mutantsOf(src) {
  const ok = maskable(src);
  const out = [];
  for (const op of OPS) {
    let from = 0;
    for (;;) {
      const at = src.indexOf(op.find, from);
      if (at < 0) break;
      from = at + 1;
      if (!ok[at]) continue;                                   // 주석·문자열 안
      if (op.find === '>=' && src[at - 1] === '=') continue;    // '>>=' 류 회피
      if (op.find === '===' && src[at + 3] === '=') continue;
      const line = src.slice(0, at).split('\n').length;
      out.push({
        at, op: op.label, line,
        mutated: src.slice(0, at) + op.to + src.slice(at + op.find.length),
        snippet: src.split('\n')[line - 1].trim().slice(0, 72),
      });
    }
  }
  return out;
}

// ── 대상: 테스트가 있는 소스만 ──────────────────────────────────────────────
function pairs() {
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.test.ts')) continue;
      const src = p.replace(/\.test\.ts$/, '.ts');
      if (existsSync(src)) found.push({ src: src.replace(/\\/g, '/'), test: p.replace(/\\/g, '/') });
    }
  };
  walk('src');
  return ONLY_FILE ? found.filter((x) => x.src === ONLY_FILE.replace(/\\/g, '/')) : found;
}

// 결정적 표본 — 파일마다 같은 뮤턴트를 고르게 해 실행 간 결과가 흔들리지 않게 한다.
const spread = (arr, n) => {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
};

const runTest = (testFile) => {
  try {
    execSync(`npx vitest run ${testFile} --reporter=dot`, { stdio: 'pipe', timeout: 120_000 });
    return true;   // 통과 = 뮤턴트 생존
  } catch { return false; }   // 실패 = 뮤턴트 사살
};

const targets = pairs();
if (!targets.length) { console.error('대상이 없다(테스트 있는 소스를 못 찾음).'); process.exit(1); }

console.log(`뮤테이션 검증 — 대상 ${targets.length}개 파일, 파일당 최대 ${MAX_PER_FILE}개\n`);
const survivors = [];
let killed = 0, total = 0;

for (const { src, test } of targets) {
  const original = readFileSync(src, 'utf8');
  const picks = spread(mutantsOf(original), MAX_PER_FILE);
  if (!picks.length) { console.log(`- ${src}  (변이 지점 없음)`); continue; }
  let k = 0;
  const local = [];
  try {
    for (const m of picks) {
      writeFileSync(src, m.mutated);
      total++;
      if (runTest(test)) local.push(m); else { k++; killed++; }
    }
  } finally {
    writeFileSync(src, original);   // 무슨 일이 있어도 되돌린다
  }
  const bad = local.length;
  console.log(`${bad ? '✗' : '✓'} ${src.padEnd(38)} 사살 ${k}/${picks.length}${bad ? `  ← 생존 ${bad}` : ''}`);
  for (const m of local) {
    console.log(`    L${String(m.line).padStart(4)}  ${m.op.padEnd(12)} ${m.snippet}`);
    survivors.push({ src, ...m });
  }
}

console.log(`\n총 ${total}개 중 ${killed}개 사살 · ${survivors.length}개 생존 (사살률 ${total ? Math.round((killed / total) * 100) : 0}%)`);
if (survivors.length) {
  console.log('\n생존한 뮤턴트 = **그 줄을 깨뜨려도 테스트가 통과한다**는 뜻이다.');
  console.log('전부 고칠 필요는 없다(방어적 분기·불가능한 경로도 생존한다). 다만');
  console.log('**금액 계산·권한·순서 판정**에서 생존자가 나오면 그건 진짜 구멍이다.');
}
if (CI && survivors.length) process.exit(1);
