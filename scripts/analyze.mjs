#!/usr/bin/env node
// scripts/analyze.mjs — ANALYZE=1 로 vite build 를 돌려 번들 treemap(stats.html)을 만든다.
// `npm run build`(sitemap 재생성 포함)를 부르지 않는다 — vite build 만 직접 실행하고,
// 산출물은 OS 임시 폴더로 보내 dist/(번들 예산 게이트가 보는 곳)를 건드리지 않는다.
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] || join(tmpdir(), 'nuri-analyze-dist');
console.log(`[analyze] ANALYZE=1 vite build --outDir ${outDir}`);
const r = spawnSync('npx', ['vite', 'build', '--outDir', outDir], {
  stdio: 'inherit',
  env: { ...process.env, ANALYZE: '1' },
  shell: true,
});
if (r.status === 0) console.log('[analyze] stats.html → .analyze/stats.html (project root 기준, vite.config.ts 의 visualizer filename)');
process.exit(r.status ?? 1);
