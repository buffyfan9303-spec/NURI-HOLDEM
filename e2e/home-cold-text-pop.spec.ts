// 홈 콜드 진입 — 첫 앱 프레임의 '글자 없음(FOIT)' 게이트. 오너 2026-09-26 "메인화면도 블링크되는 게 있어".
//
// 무엇을 잡나: 정적 셸이 앱으로 교체된 **첫 프레임**에 글자가 비어 있다가 몇 프레임 뒤 한꺼번에 나타나는 것.
//   실측(2026-09-26 · 프로덕션 빌드 · Pixel 7 · CPU 4×): 앱 첫 프레임에 아이콘·상자만 그려지고 퀵카드 라벨·
//   일정 제목·탭 라벨이 **11프레임(185ms)** 비어 있다가 한 번에 떴다. 원인은 코드가 아니라 폰트 정책 —
//   `public/fonts/pretendard/pretendardvariable-dynamic-subset.css` 의 `font-display: fallback` 은 100ms 차단
//   구간에 글자를 **투명**으로 그리는데, 첫 커밋(4× 에서 500~700ms)이 메인스레드를 쥔 동안 서브셋 12개의
//   디코드가 끝나지 못해 앱 첫 페인트가 그 차단 구간 안에 떨어진다. woff2 를 끊으면 4프레임, `swap` 은 0프레임.
//
// 어떻게 재나: CDP 스크린캐스트 프레임을 받아 **글자 영역의 밝은 픽셀 수**를 센다(픽셀이 유일한 진실 —
//   `document.fonts.check()` 는 없는 폰트에도 true, computed style 은 FOIT 를 모른다). PNG 디코드는 의존성 없이
//   보조 페이지의 canvas 로 한다. 영역은 DOM 사각형에서 얻는다(좌표 하드코딩 없음).
//
// 판정: 앱 첫 프레임(퀵카드 아이콘이 보이는 첫 프레임) 뒤 글자 영역이 최종 밝기의 60% 에 닿기까지 **2프레임 이내**.
//   수집 건수를 단언한다 — 프레임 0개·영역 0px 로 초록이 되는 것을 막는다.
import { test, expect } from './_fixtures';
import type { Locator, Page } from '@playwright/test';

type Frame = { t: number; data: string };
type Rect = { x: number; y: number; w: number; h: number };

const SCALE_W = 390; // 스크린캐스트 축소 폭(Pixel 7 412 → 390). 영역 좌표도 같은 배율로 줄인다.

/** PNG(base64) 안 사각형들의 '밝은 픽셀' 수 — 보조 페이지 canvas 로 디코드(라이브러리 0). */
async function brightCounts(helper: Page, png: string, rects: Rect[]): Promise<number[]> {
  return helper.evaluate(async ({ png, rects }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return rects.map((r) => {
      const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
      const w = Math.min(c.width - x0, Math.ceil(r.w)), h = Math.min(c.height - y0, Math.ceil(r.h));
      if (w <= 0 || h <= 0) return 0;
      const d = ctx.getImageData(x0, y0, w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 90) n++;
      return n;
    });
  }, { png, rects });
}

test('홈 콜드 진입 — 앱 첫 프레임 뒤 글자가 비어 있는 프레임이 2개를 넘지 않는다', async ({ page, context }) => {
  test.setTimeout(90_000);
  // 셸 교체 시각(epoch ms) — 스크린캐스트 timestamp 와 같은 축.
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const hook = () => {
      const root = document.getElementById('root');
      if (!root) return;
      const shell = root.firstElementChild;
      const mo = new MutationObserver(() => {
        if (shell && !root.contains(shell)) { (window as unknown as { __shellAt: number }).__shellAt = performance.timeOrigin + performance.now(); mo.disconnect(); }
      });
      mo.observe(root, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const frames: Frame[] = [];
  cdp.on('Page.screencastFrame', (ev) => {
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    frames.push({ t: ev.metadata.timestamp! * 1000, data: ev.data });
  });
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: SCALE_W, maxHeight: 900, everyNthFrame: 1 });
  await page.goto('/');
  await expect(page.getByTestId('home-schedule-title')).toBeVisible();
  await page.waitForTimeout(2500); // 글자가 나타난 뒤 최종 프레임까지
  await cdp.send('Page.stopScreencast').catch(() => {});

  const shellAt = await page.evaluate(() => (window as unknown as { __shellAt?: number }).__shellAt ?? 0);
  expect(shellAt, '정적 셸 교체 시각을 잡지 못했다 — 셸 구조가 바뀌었으면 hook 을 고쳐라').toBeGreaterThan(0);
  // 글자 영역 3곳 — DOM 사각형(뷰포트 좌표) → 스크린캐스트 배율.
  const vw = page.viewportSize()!.width;
  const k = SCALE_W / vw;
  const rectOf = async (sel: string | Locator): Promise<Rect> => {
    const r = await (typeof sel === 'string' ? page.locator(sel) : sel).first().evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
  };
  const rects = [
    await rectOf(page.getByTestId('home-quick-checkin').getByText('이용권 · 출석')), // 퀵카드 제목(흰 글자)
    await rectOf('[data-testid="home-schedule-title"]'),              // 일정 제목
    await rectOf('nav[aria-label="하단 내비게이션"] button:nth-child(2) span.t-tab'), // 탭 라벨 '라이브'
  ];
  for (const r of rects) expect(r.w * r.h, '글자 영역이 비어 있다(셀렉터 확인)').toBeGreaterThan(50);
  // 아이콘 영역 — '앱 첫 프레임' 판정용(퀵카드 아이콘은 글자와 무관하게 첫 프레임부터 그려진다).
  const iconRect = await rectOf('[data-testid="home-quick-checkin"] svg');

  const helper = await context.newPage();
  const after = frames.filter((f) => f.t >= shellAt - 20 && f.t <= shellAt + 2500);
  expect(after.length, '셸 교체 뒤 스크린캐스트 프레임을 충분히 받지 못했다').toBeGreaterThanOrEqual(12);
  const rows: { rel: number; icon: number; text: number[] }[] = [];
  for (const f of after) {
    const [icon, ...text] = await brightCounts(helper, f.data, [iconRect, ...rects]);
    rows.push({ rel: Math.round(f.t - shellAt), icon, text });
  }
  await helper.close();
  const finalRow = rows[rows.length - 1];
  for (let i = 0; i < rects.length; i++) expect(finalRow.text[i], `영역 ${i} 의 최종 프레임에 글자가 없다 — 영역이 틀렸다`).toBeGreaterThan(20);
  const firstApp = rows.findIndex((r) => r.icon >= Math.max(5, finalRow.icon * 0.6));
  expect(firstApp, '앱 첫 프레임(아이콘)을 찾지 못했다').toBeGreaterThanOrEqual(0);
  // 앱 첫 프레임부터 세 영역 모두 최종 밝기의 60% 에 닿은 첫 프레임까지의 프레임 수.
  const reached = rows.findIndex((r, i) => i >= firstApp && r.text.every((v, j) => v >= finalRow.text[j] * 0.6));
  const blankFrames = reached < 0 ? rows.length - firstApp : reached - firstApp;
  console.log(`[text-pop] 셸교체 뒤 앱첫프레임 +${rows[firstApp].rel}ms · 글자 도달 +${reached >= 0 ? rows[reached].rel : '없음'}ms · 빈 프레임 ${blankFrames}개 · 프레임 ${rows.length}개`);
  console.log('[text-pop] ' + rows.slice(firstApp, firstApp + 16).map((r) => `${r.rel}:${r.icon}/${r.text.join(',')}`).join(' '));
  expect(blankFrames, `앱 첫 프레임 뒤 글자가 비어 있는 프레임 ${blankFrames}개 — 폰트 차단(FOIT) 번쩍임`).toBeLessThanOrEqual(2);
});
