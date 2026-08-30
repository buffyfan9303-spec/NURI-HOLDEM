#!/usr/bin/env node
// scripts/gen-thumbs.mjs — public/banners 정적 이미지의 폭별 변형본 생성.
//
// 왜 필요한가 (모바일 실측, 2026-08-30):
//   `src/lib/imageUrl.ts` 의 thumbUrl 은 **Supabase Storage 공개 URL 만** 변환한다.
//   그런데 일정 포스터 일부는 자체 도메인의 정적 파일(https://nuriholdem.com/banners/*.webp)이라
//   변환이 걸리지 않고 **원본이 그대로** 내려간다 — 홈 일정 목록의 **64px 썸네일이 118KB 원본**을 받았다.
//   이 앱의 모바일 체감은 CPU 가 아니라 내려보내는 바이트가 지배한다
//   (1.6Mbps LCP 3,612ms vs 무제한망 672ms — 5.4배).
//
// 무엇을 하는가: 원본마다 아래 폭의 webp 변형본을 만든다. thumbUrl 이 `<name>-<w>.webp` 로 매핑한다.
//   64/128 = 목록 썸네일(1x/2x) · 256/400 = 카드 · 800/960 = 캐러셀 풀폭
//
// 생성물은 **커밋한다**(public/legal/*.html 과 같은 선례). 원본을 바꾼 커밋에는 변형본도 함께 들어가야 한다.
// 변형본이 없으면 ScheduleCard 의 onError 폴백이 원본으로 되돌아가므로 화면이 깨지지는 않는다(느려질 뿐).

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const DIR = 'public/banners';
export const WIDTHS = [64, 128, 256, 400, 800, 960];
const QUALITY = 72;

if (!existsSync(DIR)) {
  console.log('gen-thumbs: public/banners 없음 — 건너뜀');
  process.exit(0);
}

// 이미 생성된 변형본(-숫자.webp)은 원본으로 취급하지 않는다.
const isVariant = (f) => /-\d+\.webp$/i.test(f);
const sources = readdirSync(DIR).filter((f) => /\.webp$/i.test(f) && !isVariant(f));

let made = 0, skipped = 0;
for (const f of sources) {
  const src = join(DIR, f);
  const srcMtime = statSync(src).mtimeMs;
  const meta = await sharp(src).metadata();
  for (const w of WIDTHS) {
    // 원본보다 큰 폭은 만들지 않는다(확대는 바이트만 늘린다).
    if (meta.width && w >= meta.width) { skipped++; continue; }
    const out = join(DIR, f.replace(/\.webp$/i, `-${w}.webp`));
    // 원본이 더 낡았으면 다시 만들지 않는다(빌드마다 재인코딩하면 느리고 diff 가 흔들린다).
    if (existsSync(out) && statSync(out).mtimeMs >= srcMtime) { skipped++; continue; }
    await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(out);
    made++;
  }
}
console.log(`gen-thumbs: 원본 ${sources.length}개 · 생성 ${made} · 최신 ${skipped}`);
