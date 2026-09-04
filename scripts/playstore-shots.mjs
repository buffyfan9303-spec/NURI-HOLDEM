// Play Console 업로드용 스크린샷 생성 — 라이브 사이트를 폰 뷰포트로 찍는다.
//
// 왜 라이브인가: TWA 는 nuriholdem.com 을 그대로 띄우므로 **웹 화면 = 앱 화면**이다.
// 로컬 dev 를 찍으면 데이터가 다르고 SW 캐시 상태도 달라 실제 앱과 어긋난다.
//
// Play 폰 스크린샷 요건(2026 기준): PNG/JPEG · 각 변 320~3840px · 세로형 권장 · 2~8장.
// 1080×1920(9:16)은 Play 가 예시로 드는 표준 해상도라 이걸 쓴다.
//
// 실행: node scripts/playstore-shots.mjs [--base https://nuriholdem.com]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg('--base', 'https://nuriholdem.com');
// 로티아레나 — 대회·포스터가 실제로 등록된 매장이라 매장 페이지 예시로 쓴다
const VENUE = 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
// BLOCKED.md #14 — 로티아레나 상표 사용 허락이 미결이고, 그 기본값이 '캡처는 가명 픽스처로 촬영' 이다.
// 스토어 스크린샷은 마케팅 자료라 제3자 상호·로고·주소가 그대로 들어가면 안 된다.
// --fixture 로 켜면 제휴 매장 식별정보를 가명으로 덮고 포스터 이미지를 가린다.
const FIXTURE = process.argv.includes('--fixture');
const OUT = resolve(FIXTURE ? 'playstore/screenshots' : 'playstore/screenshots-real');
mkdirSync(OUT, { recursive: true });

// 찍을 화면 — 스토어에서 보일 순서대로. 첫 장이 가장 중요하다(목록에서 유일하게 보이는 장).
const SHOTS = [
  // ⚠ 첫 장은 스토어 목록에서 유일하게 보이는 장이다. **반드시 내용이 차 있어야 한다.**
  //   /?tab=browse 는 그날 예정 대회가 0건이면 '예정된 대회가 아직 없어요' 가 헤드라인으로 박힌다(실측).
  //   대회 상세(포스터+정보)와 매장 페이지는 데이터에 상관없이 항상 차 있어 첫 장으로 안전하다.
  { file: '01-detail', path: '/?tab=browse', click: true, desc: '대회 상세 — 포스터·바이인·구조' },
  { file: '02-venue', path: '/?v=' + VENUE, wait: null, desc: '매장 페이지 — 대회·정보·체크인' },
  { file: '03-home', path: '/?tab=home', wait: null, desc: '홈 — 배너·오늘의 대회' },
  { file: '04-tools', path: '/?tab=tools', wait: null, desc: 'GTO 학습 도구' },
  { file: '05-community', path: '/?tab=community', wait: null, desc: '커뮤니티' },
  { file: '06-browse', path: '/?tab=browse', wait: null, desc: '일정 탐색 — 날짜별' },
  { file: '07-market', path: '/?tab=market', wait: null, desc: '중고장터' },
];

const browser = await chromium.launch();
// ⚠ CSS 뷰포트를 1080 으로 주면 앱이 **데스크톱 레이아웃**으로 분기한다(상단 가로 내비가 나온다).
// 실기기처럼 보이려면 CSS 폭은 폰(360)으로 두고 deviceScaleFactor 로 출력 해상도만 올린다.
// 360×640 @3x = 정확히 1080×1920(9:16) — Play 의 종횡비 상한(2:1) 안쪽이라 안전하다.
const ctx = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  // 실기기처럼 보이게 — 데스크톱 UA 로 찍으면 PC 레이아웃이 나온다
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
});

// 제3자 식별정보 → 가명. 텍스트 노드만 바꾸므로 레이아웃은 그대로다.
// 포스터·로고는 이미지에 상호가 박혀 있어 텍스트 치환으로 못 지운다 → 자체 브랜드 면으로 덮는다.
async function applyFixture(page) {
  await page.evaluate(() => {
    const MAP = [
      [/로티\s*아레나/g, '누리아레나'],
      [/ROTI\s*ARENA/gi, 'NURI ARENA'],
      [/로티\s*단독/g, '누리 단독'],
      [/야자수\s*서울센터/g, '누리 서울센터'],
      [/남양주시[^,\n]*/g, '서울시 강남구 테헤란로 1길'],
      [/010-\d{3,4}-\d{4}/g, '010-0000-0000'],
    ];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) hits.push(n);
    for (const n of hits) {
      let t = n.nodeValue;
      for (const [re, to] of MAP) t = t.replace(re, to);
      if (t !== n.nodeValue) n.nodeValue = t;
    }
    // 캐러셀이 자동으로 넘어가면 방금 덮은 장이 밀려나고 원본 포스터가 다시 올라온다(실측 —
    // 로티 GP 문구가 그대로 찍혔다). 애니메이션·전환을 통째로 멈춘 뒤 덮는다.
    const stop = document.createElement('style');
    stop.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.head.appendChild(stop);

    // 상호가 박힌 이미지는 자체 브랜드 면으로 대체.
    // src 패턴으로 거르면 캐러셀의 다음 장을 놓친다 → **로컬 자체 아이콘만 남기고 전부** 덮는다.
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      const own = /\/(icon-|favicon|nuri-logo)/.test(src) || src.startsWith('data:');
      if (!own) {
        img.style.background = 'linear-gradient(135deg,#5850EC 0%,#7C3AED 60%,#D946EF 100%)';
        img.style.objectFit = 'cover';
        img.removeAttribute('srcset');
        img.src =
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
               <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                 <stop offset="0" stop-color="#5850EC"/><stop offset="0.6" stop-color="#7C3AED"/>
                 <stop offset="1" stop-color="#D946EF"/></linearGradient></defs>
               <rect width="600" height="800" fill="url(#g)"/>
               <text x="300" y="400" fill="#fff" font-size="52" font-weight="700"
                     text-anchor="middle" font-family="sans-serif">NURI HOLDEM</text>
             </svg>`
          );
      }
    }
    // CSS background-image 로 깔린 포스터도 있다 — 원격 URL 이면 자체 그라데이션으로 덮는다
    for (const el of document.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg.includes('url(') && /https?:/.test(bg)) {
        el.style.backgroundImage = 'linear-gradient(135deg,#5850EC 0%,#7C3AED 60%,#D946EF 100%)';
      }
    }
  });
  await page.waitForTimeout(400);
}

const page = await ctx.newPage();
const results = [];

for (const s of SHOTS) {
  const url = BASE + s.path;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // 데이터가 들어와 화면이 채워질 때까지 — 스켈레톤 상태로 찍히면 스토어에서 빈 앱처럼 보인다
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
    if (s.wait) {
      await page.getByText(s.wait, { exact: false }).first()
        .waitFor({ timeout: 15_000 }).catch(() => {});
    }
    if (s.click) {
      // 일정 행을 눌러 상세 모달을 연다. 딥링크가 없어 실제 클릭이 유일한 경로다.
      await page.waitForTimeout(1500);
      // ⚠ /GTD/ 로 잡으면 상단 **필터 칩** 'GTD' 가 먼저 걸린다(실측 — 모달이 안 열렸다).
      //   일정 행은 'MM/DD(요일)' 배지를 갖고 있으니 그걸로 특정한다.
      const row = page.locator('button, [role="button"], a')
        .filter({ hasText: /\d{2}\/\d{2}\([월화수목금토일]\)/ }).first();
      await row.click({ timeout: 15_000 }).catch(() => {});
      await page.waitForSelector('[role="dialog"]', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    // 진입 애니메이션이 끝나고 레이아웃이 안정될 때까지
    await page.waitForTimeout(2500);

    if (FIXTURE) await applyFixture(page);

    const out = `${OUT}/${s.file}.png`;
    await page.screenshot({ path: out, fullPage: false });
    const empty = (await page.evaluate(() => document.body.innerText.trim().length)) < 200;
    results.push({ ...s, out, empty });
    console.log(`  ${empty ? '⚠ 내용 빈약' : '✓'} ${s.file}.png  ${s.desc}`);
  } catch (e) {
    results.push({ ...s, error: String(e).slice(0, 120) });
    console.log(`  ✗ ${s.file} — ${String(e).slice(0, 120)}`);
  }
}

await browser.close();

const good = results.filter((r) => !r.error && !r.empty);
console.log(`\n${good.length}/${SHOTS.length}장 정상 (Play 최소 2장)`);
console.log(`저장 위치: ${OUT}`);
if (good.length < 2) {
  console.error('✗ Play 최소 요건(2장) 미달 — 위 오류 확인 필요');
  process.exit(1);
}
