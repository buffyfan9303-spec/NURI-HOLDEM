#!/usr/bin/env node
// scripts/bundle-budget.mjs — 번들 예산 게이트.
//
// 왜 이게 필요한가: 이 프로젝트는 **같은 함정을 이미 한 번 밟았다.**
//   ① 구글 폰트 CSS(95KB/124 @font-face)가 임계 경로에 들어와 React 렌더 앞을 막았다.
//      A/B 실측에서 `display=optional` 로는 오히려 나빠졌고(422→637ms) 결국 링크 자체를 걷어냈다.
//      → 걷어낸 것을 **다시 넣는 순간 아무도 모르게 되돌아간다.** 그래서 규칙으로 박는다.
//   ② dist 가 42분 낡은 상태로 "번들에 포함됐다"고 판단한 적이 있다.
//      → 낡은 dist 를 재는 것은 측정이 아니라 **거짓 통과**다. 소스보다 오래됐으면 아예 실패시킨다.
//   ③ 청크가 조용히 불어난다(현재 최대 104KB gz). 임계값이 없으면 아무도 못 본다.
//
// 사용: npm run build && node scripts/bundle-budget.mjs
//       node scripts/bundle-budget.mjs --update   (현재 값으로 예산 재작성 — 의도적으로 올릴 때만)

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const BUDGET_FILE = 'bundle-budget.json';
const SRC_DIRS = ['src', 'index.html', 'tailwind.config.js', 'vite.config.ts'];

const kb = (n) => +(n / 1024).toFixed(1);
const fail = [];
const warn = [];

// ── ② 낡은 dist 거부 ────────────────────────────────────────────────────────
function newestMtime(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    max = Math.max(max, newestMtime(join(p, e.name)));
  }
  return max;
}

if (!existsSync(ASSETS)) {
  console.error('✗ dist/assets 가 없다. `npm run build` 를 먼저 돌려라.');
  process.exit(1);
}
const srcMtime = Math.max(...SRC_DIRS.map(newestMtime));
const distMtime = newestMtime(ASSETS);
if (srcMtime > distMtime) {
  const lag = Math.round((srcMtime - distMtime) / 1000);
  console.error(`✗ dist 가 소스보다 ${lag}초 낡았다 — 이 상태로 잰 값은 **현재 코드의 크기가 아니다.**`);
  console.error('  (과거에 42분 낡은 dist 를 재고 "번들에 포함됐다"고 잘못 판단한 적이 있다)');
  console.error('  `npm run build` 를 다시 돌려라.');
  process.exit(1);
}

// ── 자산 크기 ──────────────────────────────────────────────────────────────
const files = readdirSync(ASSETS).map((f) => {
  const buf = readFileSync(join(ASSETS, f));
  return { f, ext: extname(f), raw: buf.length, gz: gzipSync(buf).length };
});
const sum = (ext) => files.filter((x) => x.ext === ext).reduce((a, b) => a + b.gz, 0);
const totalJs = sum('.js');
const totalCss = sum('.css');
const biggest = files.filter((x) => x.ext === '.js').sort((a, b) => b.gz - a.gz)[0] ?? { f: '(없음)', gz: 0 };

// ── ① 첫 화면이 실제로 받는 것 ──────────────────────────────────────────────
// index.html 이 직접 참조하는 로컬 자산만 센다(지연 청크는 제외) — 이게 임계 경로다.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const localRefs = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((m) => m[1]);
const entryGz = files.filter((x) => localRefs.includes(x.f)).reduce((a, b) => a + b.gz, 0);

// 외부 스타일시트 = 렌더 블로킹. preconnect/dns-prefetch 는 블로킹이 아니라 제외한다.
const extStyles = [...html.matchAll(/<link\b[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => /rel=["']?stylesheet/i.test(tag) && /href=["']https?:/i.test(tag));

const actual = {
  totalJsGzipKb: kb(totalJs),
  totalCssGzipKb: kb(totalCss),
  entryGzipKb: kb(entryGz),
  largestChunkGzipKb: kb(biggest.gz),
  externalStylesheets: extStyles.length,
};

if (process.argv.includes('--update')) {
  const pad = (v) => Math.ceil(v * 1.08);   // 8% 여유
  const next = {
    _주석: '번들 예산(gzip KB). 올릴 때는 왜 올리는지 커밋 메시지에 남길 것. --update 로 재작성.',
    totalJsGzipKb: pad(actual.totalJsGzipKb),
    totalCssGzipKb: pad(actual.totalCssGzipKb),
    entryGzipKb: pad(actual.entryGzipKb),
    largestChunkGzipKb: pad(actual.largestChunkGzipKb),
    externalStylesheets: 0,
  };
  writeFileSync(BUDGET_FILE, JSON.stringify(next, null, 2) + '\n');
  console.log('예산을 현재 값 기준으로 재작성했다:', JSON.stringify(next, null, 2));
  process.exit(0);
}

if (!existsSync(BUDGET_FILE)) {
  console.error(`✗ ${BUDGET_FILE} 이 없다. \`node scripts/bundle-budget.mjs --update\` 로 만들어라.`);
  process.exit(1);
}
const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));

const check = (key, label, unit = 'KB gz') => {
  const cap = budget[key];
  if (cap == null) return;
  const got = actual[key];
  const line = `${label.padEnd(26)} ${String(got).padStart(7)} / ${String(cap).padStart(6)} ${unit}`;
  if (got > cap) { fail.push(`${line}   ← ${(got - cap).toFixed(1)} 초과`); return; }
  const head = (1 - got / cap) * 100;
  // 여유가 5% 밑이면 통과지만 알려 준다 — '다음 커밋에서 터진다'는 신호다.
  if (head < 5) warn.push(`${label}: 여유 ${head.toFixed(0)}% 밖에 없다`);
  console.log(`  ${line}   (여유 ${head.toFixed(0)}%)`);
};

console.log('번들 예산 검사 (gzip)');
check('entryGzipKb', '첫 화면 임계 경로');
check('totalJsGzipKb', 'JS 전체');
check('totalCssGzipKb', 'CSS 전체');
check('largestChunkGzipKb', `최대 청크(${biggest.f})`);

if (actual.externalStylesheets > (budget.externalStylesheets ?? 0)) {
  fail.push(
    `외부 스타일시트 ${actual.externalStylesheets}개 (허용 ${budget.externalStylesheets ?? 0})\n` +
    `    ${extStyles.join('\n    ')}\n` +
    '    → 렌더 블로킹이다. 구글 폰트 CSS 를 걷어낸 이유가 정확히 이것이다(실측 422→637ms).\n' +
    '      정말 필요하면 @font-face 를 인라인하거나 self-host 하고, 예산을 명시적으로 올려라.',
  );
}

if (fail.length) {
  console.error('\n✗ 번들 예산 초과\n' + fail.map((l) => '  ' + l).join('\n'));
  console.error('\n  의도한 증가라면 `node scripts/bundle-budget.mjs --update` 로 예산을 올리고');
  console.error('  **왜 올렸는지 커밋 메시지에 남겨라.** 조용히 커지는 것이 문제지 커지는 것 자체가 문제가 아니다.');
  process.exit(1);
}
if (warn.length) {
  console.log('\n! 여유 부족(통과지만 다음 커밋에서 터질 수 있다)\n' + warn.map((l) => '  ' + l).join('\n'));
}
console.log('\n✓ 번들 예산 통과');
