// Play Console 피처 그래픽(1024×500) 생성.
//
// Play 규격: 정확히 1024×500 · PNG/JPEG · 알파 없음 · 8MB 이하.
// Play 가 싫어하는 것: 기기 목업(폰 프레임), 'Google Play 에서 받기' 배지, 잘린 글자,
//   작아서 안 읽히는 글자(목록에서 축소돼 표시된다), 스크린샷을 그대로 넣는 것.
// 그래서 **기기 프레임 없이** 워드마크 + 한 줄 가치제안 + 앱 아우라 배경으로만 간다.
//
// 색은 앱 토큰 그대로(src/index.css): 바탕 #06080F, 블룸 violet #8B5CF6 · indigo #6366F1 · fuchsia #D946EF.
// 실행: node scripts/playstore-feature.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('playstore');
mkdirSync(OUT, { recursive: true });

// 스페이드 글리프 — src/components/atoms/Icon.tsx 의 도메인 글리프와 같은 패스(24 viewBox)
const SPADE =
  'M12 3C10.03 7.03 5.72 9.19 5.72 13.03c0 2.72 2.25 4.13 4.5 3.28-.38 1.78-1.22 2.82-2.53 3.75h8.62c-1.31-.93-2.15-1.97-2.53-3.75 2.25.85 4.5-.56 4.5-3.28C18.28 9.19 13.97 7.03 12 3Z';

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1024px;height:500px;overflow:hidden}
  body{
    background:#06080F;
    font-family:"Pretendard Variable",Pretendard,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;
    position:relative;
  }
  /* 아우라 배경 — 앱과 같은 3색 블룸. blur 대신 radial-gradient(앱 규약 §20.4 #6) */
  .bloom{position:absolute;border-radius:50%;pointer-events:none}
  .b1{width:620px;height:620px;left:-140px;top:-210px;
      background:radial-gradient(circle,rgba(139,92,246,.34) 0%,rgba(139,92,246,0) 68%)}
  .b2{width:700px;height:700px;left:330px;top:-260px;
      background:radial-gradient(circle,rgba(99,102,241,.30) 0%,rgba(99,102,241,0) 68%)}
  .b3{width:560px;height:560px;right:-150px;bottom:-240px;
      background:radial-gradient(circle,rgba(217,70,239,.26) 0%,rgba(217,70,239,0) 68%)}

  .wrap{position:relative;height:100%;display:flex;align-items:center;
        padding:0 76px;gap:56px}
  .left{flex:1;min-width:0}

  .brand{display:flex;align-items:center;gap:18px;margin-bottom:26px}
  .spade{width:62px;height:62px;flex-shrink:0}
  .word{line-height:.94}
  .word .n{font-size:62px;font-weight:800;letter-spacing:-1.5px;color:#fff;display:block}
  .word .h{font-size:27px;font-weight:700;letter-spacing:7.5px;color:#8B9BB4;display:block;margin-top:5px}

  h1{font-size:41px;font-weight:800;color:#fff;letter-spacing:-1.2px;line-height:1.28;
     margin-bottom:20px;word-break:keep-all}
  h1 .g{background:linear-gradient(100deg,#A78BFA 0%,#818CF8 45%,#E879F9 100%);
        -webkit-background-clip:text;background-clip:text;color:transparent}
  p{font-size:23px;color:#8B9BB4;line-height:1.5;word-break:keep-all;font-weight:500}

  /* 오른쪽 — 기기 목업 대신 추상 카드 스택(포커 도메인 기호) */
  .art{width:290px;height:330px;position:relative;flex-shrink:0}
  .card{position:absolute;width:176px;height:246px;border-radius:19px;
        background:linear-gradient(150deg,#141A2E 0%,#0E1322 100%);
        border:1px solid rgba(148,163,184,.30);
        box-shadow:0 26px 52px -18px rgba(0,0,0,.72), inset 0 1px 0 rgba(255,255,255,.07);
        display:flex;align-items:center;justify-content:center}
  .c1{left:2px;top:52px;transform:rotate(-14deg)}
  .c2{left:60px;top:32px;transform:rotate(-2deg)}
  .c3{left:118px;top:16px;transform:rotate(11deg);
      border-color:rgba(129,140,248,.62);
      box-shadow:0 0 0 3px rgba(129,140,248,.20), 0 0 26px rgba(139,92,246,.30),
                 0 26px 52px -18px rgba(0,0,0,.72), inset 0 1px 0 rgba(255,255,255,.07)}
  .pip{width:76px;height:76px}
</style></head><body>
  <div class="bloom b1"></div><div class="bloom b2"></div><div class="bloom b3"></div>
  <div class="wrap">
    <div class="left">
      <div class="brand">
        <svg class="spade" viewBox="0 0 24 24" fill="#E8B84B"><path d="${SPADE}"/></svg>
        <span class="word"><span class="n">NURI</span><span class="h">HOLDEM</span></span>
      </div>
      <h1>전국 홀덤 대회 일정을<br><span class="g">한 곳에서</span></h1>
      <p>매장·일정·예약부터 커뮤니티와 GTO 학습까지</p>
    </div>
    <div class="art">
      <div class="card c1"><svg class="pip" viewBox="0 0 24 24" fill="#475569"><path d="${SPADE}"/></svg></div>
      <div class="card c2"><svg class="pip" viewBox="0 0 24 24" fill="#64748B"><path d="${SPADE}"/></svg></div>
      <div class="card c3"><svg class="pip" viewBox="0 0 24 24" fill="#A78BFA"><path d="${SPADE}"/></svg></div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(600);

const out = `${OUT}/feature-graphic-1024x500.png`;
// omitBackground:false → 알파 없는 불투명 PNG (Play 는 투명도를 허용하지 않는다)
await page.screenshot({ path: out, omitBackground: false });
await browser.close();

console.log(`✓ ${out}`);
console.log('  1024×500 · 기기 목업/스토어 배지 없음 · 앱 아우라 토큰 사용');
