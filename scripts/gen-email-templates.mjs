// scripts/gen-email-templates.mjs — 메일 디자인 체계의 생성물을 만든다(2026-09-30).
//
//   ① supabase/functions/_shared/email/brand.gen.ts ← src/components/features/BusinessFooter.tsx 의
//      BIZ_REQUIRED · BIZ_EXTRA(고객센터) · AGE_HELPLINE. 사업자 정보를 메일에 **손으로 베끼지 않는다** —
//      주소·전화가 바뀌면(2026-09-29 이전처럼) 푸터만 고치고 이 스크립트를 돌린다.
//   ② supabase/templates/auth/*.html · subjects.json ← supabase/templates/auth/templates.ts
//   ③ --logo: public/email/logo.png(메일 전용 로고, 배경 구움 2x) ← public/brand 심벌 + atoms/wordmark.ts 경로
//
// 사용: node scripts/gen-email-templates.mjs            (①② 생성)
//       node scripts/gen-email-templates.mjs --check    (일치만 확인 — src/lib/emailTemplates.test.ts 도 같은 대조를 한다)
//       node scripts/gen-email-templates.mjs --logo     (③ 로고 PNG 재생성 — Playwright chromium 필요)
// TS/TSX 를 파싱하지 않는다: vite 의 SSR 로더로 실제 모듈을 import 한다(값이 곧 진실).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND_OUT = join(ROOT, 'supabase/functions/_shared/email/brand.gen.ts');
const AUTH_DIR = join(ROOT, 'supabase/templates/auth');
const CHECK = process.argv.includes('--check');

const server = await createServer({
  root: ROOT, configFile: false, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  esbuild: { jsx: 'automatic' },
});

const outputs = []; // [path, text]
try {
  const footer = await server.ssrLoadModule('/src/components/features/BusinessFooter.tsx');
  const support = footer.BIZ_EXTRA.find(([k]) => k === '고객센터')?.[1];
  if (!support) throw new Error('BIZ_EXTRA 에 고객센터 항목이 없다');
  const brand = `// 자동 생성 — scripts/gen-email-templates.mjs (수정 금지, 재생성할 것)
// 원본: src/components/features/BusinessFooter.tsx 의 BIZ_REQUIRED · BIZ_EXTRA('고객센터') · AGE_HELPLINE
export const BIZ_REQUIRED: [string, string][] = ${JSON.stringify(footer.BIZ_REQUIRED)};
export const AGE_HELPLINE = ${JSON.stringify(footer.AGE_HELPLINE)} as const;
export const SUPPORT_EMAIL = ${JSON.stringify(support)};
`;
  outputs.push([BRAND_OUT, brand]);
  // 템플릿은 방금 만든 brand 를 읽어야 한다 — 생성 모드에서는 먼저 쓰고 불러온다.
  if (!CHECK) writeFileSync(BRAND_OUT, brand);

  const { AUTH_TEMPLATES } = await server.ssrLoadModule('/supabase/templates/auth/templates.ts');
  const subjects = {};
  for (const [key, tpl] of Object.entries(AUTH_TEMPLATES)) {
    outputs.push([join(AUTH_DIR, `${key}.html`), tpl.html]);
    subjects[key] = { subjectKey: tpl.subjectKey, contentKey: tpl.contentKey, subject: tpl.subject };
  }
  outputs.push([join(AUTH_DIR, 'subjects.json'), JSON.stringify(subjects, null, 2) + '\n']);
} finally {
  await server.close();
}

if (CHECK) {
  const bad = outputs.filter(([p, text]) => !existsSync(p) || readFileSync(p, 'utf-8').replace(/\r\n/g, '\n') !== text);
  if (bad.length) {
    console.error('[email] 생성물이 원본과 다르다 — node scripts/gen-email-templates.mjs 로 재생성하라:\n  ' + bad.map(([p]) => p).join('\n  '));
    process.exit(1);
  }
  console.log(`[email] --check OK — ${outputs.length}개 파일이 원본과 일치한다`);
} else {
  for (const [p, text] of outputs) writeFileSync(p, text);
  console.log(`[email] ${outputs.length}개 파일 생성`);
}

if (process.argv.includes('--logo')) {
  const { chromium } = await import('@playwright/test');
  const wm = readFileSync(join(ROOT, 'src/components/atoms/wordmark.ts'), 'utf-8');
  const d = wm.match(/WORDMARK_D = "([^"]+)"/)?.[1];
  if (!d) throw new Error('wordmark.ts 에서 WORDMARK_D 를 못 찾았다');
  const layoutSrc = readFileSync(join(ROOT, 'supabase/functions/_shared/email/layout.ts'), 'utf-8');
  const W = Number(layoutSrc.match(/LOGO_W = (\d+)/)[1]);
  const H = Number(layoutSrc.match(/LOGO_H = (\d+)/)[1]);
  const PAGE = layoutSrc.match(/page: '(#[0-9A-Fa-f]{6})'/)[1];
  // 심벌(viewBox 240, 실내용 x40~200·y18~216) 높이 40 · 워드마크(viewBox 1118×518, 실내용 y10~509) 높이 36.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8C97C"/><stop offset="1" stop-color="#C79A3F"/></linearGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="240"><rect width="240" height="240" fill="#fff"/><rect x="28" y="118" width="184" height="9" rx="4.5" fill="#000"/><path d="M 96 110 A 24 24 0 0 1 144 110 L 96 110 Z" fill="#000"/></mask></defs>
<rect width="${W}" height="${H}" fill="${PAGE}"/>
<g transform="translate(0 4) scale(${40 / 198}) translate(-40 -18)"><g mask="url(#m)"><path fill="url(#g)" d="M 120 18 C 96 58 40 96 40 138 C 40 172 66 190 92 184 C 103 181 111 175 116 167 C 112 194 100 208 84 216 L 156 216 C 140 208 128 194 124 167 C 129 175 137 181 148 184 C 174 190 200 172 200 138 C 200 96 144 58 120 18 Z"/></g></g>
<g transform="translate(${160 * 40 / 198 + 12} 6) scale(${36 / 499}) translate(0 -10)"><path fill="#F0F4FF" d="${d}"/></g>
</svg>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: W, height: H } });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  mkdirSync(join(ROOT, 'public/email'), { recursive: true });
  await page.locator('svg').screenshot({ path: join(ROOT, 'public/email/logo.png') });
  await browser.close();
  console.log(`[email] public/email/logo.png 생성 (${W * 2}×${H * 2})`);
}
