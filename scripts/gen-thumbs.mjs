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

// 2026-09-18: `public/venues` 추가(매장 로고). 짝이 되는 `src/lib/imageUrl.ts` 의 localVariant
// 정규식도 같은 폴더 목록을 본다 — **둘은 항상 같이 고쳐야 한다.**
const DIRS = ['public/banners', 'public/venues'];
export const WIDTHS = [64, 128, 256, 400, 800, 960];
const QUALITY = 72;

const PRESENT = DIRS.filter((d) => existsSync(d));
if (PRESENT.length === 0) {
  console.log(`gen-thumbs: ${DIRS.join(' / ')} 없음 — 건너뜀`);
  process.exit(0);
}

// 이미 생성된 변형본(-숫자.webp)은 원본으로 취급하지 않는다.
const isVariant = (f) => /-\d+\.webp$/i.test(f);

let made = 0, skipped = 0, total = 0;
for (const DIR of PRESENT) {
  const sources = readdirSync(DIR).filter((f) => /\.webp$/i.test(f) && !isVariant(f));
  total += sources.length;
  for (const f of sources) {
    const src = join(DIR, f);
    const srcMtime = statSync(src).mtimeMs;
    const meta = await sharp(src).metadata();
    for (const w of WIDTHS) {
      // 🔴 2026-09-19 — 예전엔 `if (w >= meta.width) continue` 로 **건너뛰었다.** 그게 화면을 깨뜨렸다.
      //   `thumbUrl` 은 고정 목록(LOCAL_WIDTHS)에서 폭을 고르지 사용 가능한 변형본을 모른다.
      //   원본이 256px 인 매장 로고에 VenuePage 가 144px 를 요구하면 `-256.webp` 를 가리키는데
      //   그 파일이 없다 → SPA 폴백이 **index.html 을 200 으로** 돌려준다(Content-Type: text/html, 24KB).
      //   `<img>` 는 그걸 디코드 못 해 **깨진 이미지 아이콘**이 된다(오너 리포트: "프로필 카드가 깨졌어").
      //   404 였으면 onError 라도 탔을 텐데, 200 이라 더 조용하고 더 나쁘다.
      // → 이제 **목록의 모든 폭을 만든다.** `withoutEnlargement` 가 있어 원본보다 커지지 않으므로
      //   큰 폭 파일은 원본과 같은 픽셀이고 바이트도 늘지 않는다(재인코딩으로 오히려 조금 작다).
      //   '이름이 가리키는 파일은 항상 있다' 가 이 스크립트와 thumbUrl 사이의 계약이다.
      const out = join(DIR, f.replace(/\.webp$/i, `-${w}.webp`));
      // 원본이 더 낡았으면 다시 만들지 않는다(빌드마다 재인코딩하면 느리고 diff 가 흔들린다).
      if (existsSync(out) && statSync(out).mtimeMs >= srcMtime) { skipped++; continue; }
      await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(out);
      made++;
    }
  }
}
console.log(`gen-thumbs: 폴더 ${PRESENT.length} · 원본 ${total}개 · 생성 ${made} · 최신 ${skipped}`);
