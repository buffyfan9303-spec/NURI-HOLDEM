// scripts/gen-owner-pdf.mjs — 업주 가이드 인쇄본(public/guide/owner.pdf)을 owner.html 에서 만든다.
//
// 정본은 owner.html 하나다(인쇄 모양 = 그 파일의 @media print). PDF 를 따로 편집하지 않는다 —
// 2026-07 구판 PDF 는 원본 없이 남아 없는 메뉴·개인 메일·틀린 법령 인용이 석 달 동안 그대로였다(2026-10-01 대조).
// Chromium 인쇄 경로(page.pdf)라 Pretendard 가변 글꼴이 PDF 안에 글리프(Type3)로 들어간다.
//
// 실행: 정적 서버로 public/ 또는 dist/ 를 띄운 뒤
//   node scripts/gen-owner-pdf.mjs http://localhost:4173 [출력 경로 = public/guide/owner.pdf]
// ⚠ 사진(public/guide/img/*.webp)을 새로 찍은 뒤에 돌린다 — 옛 사진으로 만들면 PDF 도 옛 화면이 된다.
import { chromium } from '@playwright/test';

const BASE = process.argv[2];
const OUT = process.argv[3] ?? 'public/guide/owner.pdf';
if (!BASE) { console.error('사용: node scripts/gen-owner-pdf.mjs <base-url> [out]'); process.exit(1); }

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })).newPage();
await page.goto(BASE + '/guide/owner.html', { waitUntil: 'networkidle' });
// lazy 이미지까지 받고 글꼴이 다 붙은 뒤에 인쇄한다(빈 사진 칸·폴백 글꼴 방지)
await page.evaluate(async () => {
  for (const im of document.images) im.loading = 'eager';
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  await document.fonts.ready;
});
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
await browser.close();
console.log('[owner-pdf] →', OUT);
