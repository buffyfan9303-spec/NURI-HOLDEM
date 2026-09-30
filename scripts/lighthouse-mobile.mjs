#!/usr/bin/env node
// 수동 실행용 Lighthouse(모바일) — CI 게이트가 아니다. 사전: `npm run build && npm run preview`(4173).
// 사용: npm run perf:lighthouse [-- <url>]   결과: lighthouse-reports/*.json (gitignore)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
mkdirSync('lighthouse-reports', { recursive: true });
const out = `lighthouse-reports/mobile-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const r = spawnSync(
  'npx',
  ['lighthouse', url, '--form-factor=mobile', '--output=json', `--output-path=${out}`,
   '--only-categories=performance,accessibility,seo,best-practices', '--chrome-flags=--headless=new --no-sandbox', '--quiet'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
if (r.status !== 0) process.exit(r.status ?? 1);
const lhr = JSON.parse(readFileSync(out, 'utf8'));
for (const [k, c] of Object.entries(lhr.categories)) console.log(`${k}: ${Math.round(c.score * 100)}`);
console.log(`LCP: ${lhr.audits['largest-contentful-paint'].displayValue} · TBT: ${lhr.audits['total-blocking-time'].displayValue} · CLS: ${lhr.audits['cumulative-layout-shift'].displayValue}`);
console.log(`저장: ${out}`);
