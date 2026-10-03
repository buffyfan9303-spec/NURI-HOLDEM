// 재점검 1회차(2026-10-03) 클락 결함 — 세로 TV 상금 띠(N-1) · 매장 이미지 표시 방식(N-2) · 다른 기기 TV 테마 반영(N-3).
// 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\recheck1-screens-1003.md
//
// 매장·계정 없이 TV 화면만 연다(_clock.ts 와 같은 방식). 읽기 셋(clock_states · venues.page_config · 이미지)을 전부 목킹한다 — 운영 쓰기 0.
// 이미지는 우리 스토리지 접두사(허용 URL)로 부르되 라우트가 SVG 를 돌려준다(크기·투명·색을 정확히 아는 그림).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { mkdirSync } from 'node:fs';
import { stabilizeBackstack, SUPABASE_URL } from './_session';
import { TV_VENUE } from './_clock';

const SHOTS = process.env.CLK_SHOTS;   // 지정하면 판정 화면을 남긴다(사람 눈 확인용)
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const IMG = (name: string) => `${SUPABASE_URL}/storage/v1/object/public/clock_bg/${TV_VENUE}/${name}`;

const LEVELS = [
  { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
];
type Prize = { place: string; amount: number };
const row = (prizes: Prize[]) => ({
  venue_id: TV_VENUE, game_seq: 1, session_date: null, title: '재점검 1회차',
  config: {
    title: '재점검 1회차', startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, isAddon: true,
    earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 2, maxLevel: 20,
    earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100,
    mysteryBounty: 0, prizes, levels: LEVELS,
  },
  current_index: 0, running: true, ends_at: new Date(Date.now() + 9 * 60_000).toISOString(),
  remaining_ms: 0, adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
  live_stats: { entries: 42, rebuys: 6, earlies: 3, addons: 2, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
});
const table = (n: number, amount: number): Prize[] => Array.from({ length: n }, (_, i) => ({ place: String(i + 1), amount: Math.max(1, amount - i) }));

/** 그림 — 크기를 정확히 아는 SVG. 투명 로고·가로 긴 로고·세로 로고·큰 흰 사진(최악 밝기). */
const SVG: Record<string, string> = {
  'logo-sq.png': '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><circle cx="400" cy="400" r="380" fill="#E0A94E"/><text x="400" y="460" font-size="180" text-anchor="middle" fill="#3B1F00">LOGO</text></svg>',
  'logo-wide.png': '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="300"><rect x="10" y="10" width="1780" height="280" rx="60" fill="#22C55E"/></svg>',
  'logo-tall.png': '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="900"><rect x="10" y="10" width="280" height="880" rx="40" fill="#38BDF8"/></svg>',
  'photo-white-d72.png': '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000"><rect width="4000" height="3000" fill="#FFFFFF"/></svg>',
  'logo-white-sq.png': '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#FFFFFF"/></svg>',
};

/** TV 하나를 띄운다. pageConfig 는 함수라 테스트 도중 '서버 값' 을 바꿀 수 있다(다른 기기 저장 흉내). */
async function openTv(page: Page, opts: { w: number; h: number; prizes?: Prize[]; config?: () => unknown }) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: opts.w, height: opts.h });
  const body = row(opts.prizes ?? [{ place: '1', amount: 400 }, { place: '2', amount: 150 }]);
  await page.route(/\/rest\/v1\/clock_states/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([body]) }));
  const counter = { configGets: 0 };
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    counter.configGets++;
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    const v = { id: TV_VENUE, name: '재점검 펍', page_config: opts.config?.() ?? null };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? v : [v]) });
  });
  await page.route(/\/storage\/v1\/object\/public\/clock_bg\//, (r) => {
    const name = decodeURIComponent(r.request().url().split('/').pop() ?? '');
    const svg = SVG[name];
    return svg ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }) : r.fulfill({ status: 404, body: '' });
  });
  await page.goto(`/?display=${TV_VENUE}&g=1&auto=0`);
  await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
  return counter;
}
const theme = (image: string, display: Record<string, unknown> = {}) => ({
  clockTheme: { version: 1, palette: { preset: 'nuri-signature' }, background: { kind: 'gradient', preset: 'nuri-signature', image: IMG(image), ...display } },
});
const rootBg = (page: Page) => page.locator('[data-amb-root]').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--clk-bg'));

// ── N-1 세로 TV 상금 띠 ─────────────────────────────────────────────────────
for (const [w, h] of [[1080, 1920], [390, 844]] as const) {
  test(`N-1 세로 ${w}×${h} — 상금이 띠로 보이고 자릿수 7~10·등수 3~200 어디서도 넘치지 않는다`, async ({ page }) => {
    test.setTimeout(180_000);
    let prizes: Prize[] = table(3, 1_000_000);
    await openTv(page, { w, h, prizes });
    await page.unroute(/\/rest\/v1\/clock_states/);
    await page.route(/\/rest\/v1\/clock_states/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row(prizes)]) }));
    const out: string[] = [];
    for (const n of [3, 10, 15, 20, 200]) {
      for (const amt of [1_000_000, 9_999_999_999]) {
        prizes = table(n, amt);
        await page.reload();
        await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
        const band = page.getByTestId('clk-prizes-band');
        await expect(band, `세로 ${w}×${h} 에 상금 띠가 없다(${n}줄·${amt})`).toBeVisible();
        await expect(page.getByTestId('clk-prize-total-band')).toBeVisible();
        const m = await page.evaluate(() => {
          const q = (s: string) => document.querySelector<HTMLElement>(`[data-testid="${s}"]`)!;
          const b = q('clk-prizes-band').getBoundingClientRect();
          const t = q('clk-timer').getBoundingClientRect();
          const stage = document.querySelector<HTMLElement>('[data-amb-root]')!;
          const sr = stage.getBoundingClientRect();
          // 보이는 장의 줄들 — 띠 밖으로 나가거나 자기 칸을 넘치면(scrollWidth) 잘림이다
          const sheet = q('clk-prizes-band').querySelector<HTMLElement>('[data-prize-sheet]:not([aria-hidden])')!;
          let worst = 0, outside = 0;
          for (const li of sheet.querySelectorAll<HTMLElement>('li')) {
            worst = Math.max(worst, li.scrollWidth - li.clientWidth);
            for (const sp of li.querySelectorAll<HTMLElement>('span')) {
              const r = sp.getBoundingClientRect();
              if (r.left < b.left - 0.5 || r.right > b.right + 0.5) outside++;
            }
          }
          const tot = q('clk-prize-total-band');
          return {
            overflowX: worst, outside, totalClip: tot.scrollWidth - tot.clientWidth,
            timerBandGap: b.top - t.bottom, bandInStage: b.bottom <= sr.bottom + 0.5 && b.top >= sr.top,
            stageOverflow: stage.scrollHeight - stage.clientHeight, timerH: t.height,
          };
        });
        out.push(`${n}줄·${String(amt).length}자리 ${JSON.stringify(m)}`);
        expect(m.overflowX, `줄이 칸을 넘친다 ${n}·${amt}`).toBeLessThanOrEqual(1);
        expect(m.outside, `글자가 띠 밖 ${n}·${amt}`).toBe(0);
        expect(m.totalClip, '총액이 잘린다').toBeLessThanOrEqual(1);
        expect(m.timerBandGap, '띠가 타이머를 덮는다').toBeGreaterThan(0);
        expect(m.bandInStage, '띠가 화면 밖').toBe(true);
        expect(m.stageOverflow, '보드가 화면을 넘친다').toBeLessThanOrEqual(1);
      }
    }
    console.log(`[N-1 ${w}x${h}]\n${out.join('\n')}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/n1-${w}x${h}-200rows-10digit.png` });
  });
}

test('N-1 가로 1920×1080 — 상금은 종전 왼쪽 열, 띠는 숨는다(가로 화면 불변)', async ({ page }) => {
  await openTv(page, { w: 1920, h: 1080, prizes: table(20, 5_000_000) });
  await expect(page.getByTestId('clk-prizes')).toBeVisible();
  await expect(page.getByTestId('clk-prizes-band')).toBeHidden();
});

// ── N-3 다른 기기 TV 반영 ────────────────────────────────────────────────────
test('N-3 — 다른 기기에서 바꾼 배경을 새로고침 없이 받는다(화면 복귀 즉시 · 주기 30초 안)', async ({ page }) => {
  test.setTimeout(90_000);
  let cfg: unknown = null;
  const c = await openTv(page, { w: 1920, h: 1080, config: () => cfg });
  expect(await rootBg(page)).not.toContain('url(');
  // 운영자 PC(다른 브라우저)가 저장했다 — 이 TV 에는 같은 탭 이벤트·localStorage 신호가 오지 않는다. 서버 값만 바뀐다.
  cfg = theme('photo-white-d72.png');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // 화면 복귀(전원·탭 전환)
  await expect.poll(() => rootBg(page), { timeout: 5_000, message: '화면 복귀에도 새 배경을 다시 읽지 않는다' }).toContain('photo-white-d72.png');
  // 두 번째 변경은 아무 신호 없이 — 주기 재조회만으로 와야 한다(표시 방식 변경 = N-2 의 다른 기기 반영).
  const before = c.configGets;
  cfg = theme('logo-sq.png', { fit: 'center', size: 3 });
  await expect.poll(async () => (await page.getByTestId('clk-logo').count()) > 0, { timeout: 35_000, intervals: [1000], message: '30초 주기 재조회가 없다' }).toBe(true);
  console.log(`[N-3] page_config GET ${before} → ${c.configGets}`);
});

// ── N-2 표시 방식 × 그림 × TV 가로·세로 ──────────────────────────────────────
const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const lum = (c: number[]) => 0.2126 * lin(c[0] / 255) + 0.7152 * lin(c[1] / 255) + 0.0722 * lin(c[2] / 255);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** 글자마다 실제 화면 픽셀로 대비를 잰다 — 바탕은 글자 상자 바로 바깥 4점(판 여백 안)의 중앙값, 글자색은 계산된 색(알파는 바탕 위 합성). */
async function measureContrast(page: Page) {
  const items = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-amb-root]')!;
    const out: { t: string; x: number; y: number; w: number; h: number; c: string; fs: number; fw: number }[] = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement!;
      if (!n.textContent?.trim() || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('button') || el.closest('[aria-hidden="true"]')) continue;   // TV 조작 버튼(마우스 근거리) · 숨은 장
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      if (/^[/·]$/.test(n.textContent.trim())) continue;   // 장식 구분자(SB/BB 사이 '/')
      out.push({ t: n.textContent.trim().slice(0, 18), x: r.left, y: r.top, w: r.width, h: r.height, c: cs.color, fs: parseFloat(cs.fontSize), fw: Number(cs.fontWeight) });
    }
    return out;
  });
  const png = PNG.sync.read(await page.screenshot());
  const k = png.width / (page.viewportSize()?.width ?? png.width);   // 기기 배율(DPR) — 스크린샷은 CSS 픽셀 × DPR
  const px = (cx: number, cy: number) => {
    const x = cx * k, y = cy * k;
    const xi = Math.min(png.width - 1, Math.max(0, Math.round(x))), yi = Math.min(png.height - 1, Math.max(0, Math.round(y)));
    const i = (yi * png.width + xi) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  let worstNormal = 99, worstLarge = 99, wn = '', wl = '';
  for (const it of items) {
    const pts = [px(it.x - 2, it.y + it.h / 2), px(it.x + it.w + 2, it.y + it.h / 2), px(it.x + it.w / 2, it.y - 2), px(it.x + it.w / 2, it.y + it.h + 2)];
    const bg = pts.sort((a, b) => lum(a) - lum(b))[2];   // 4점 중 두 번째로 밝은 점(이웃 글자 한 점은 버리고 보수적으로)
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(it.c);
    if (!m) continue;
    const a = m[4] == null ? 1 : Number(m[4]);
    const fg = [1, 2, 3].map((k, j) => a * Number(m[k]) + (1 - a) * bg[j]);
    const r = ratio(lum(fg), lum(bg));
    const large = it.fs >= 24 || (it.fs >= 18.66 && it.fw >= 700);
    if (large) { if (r < worstLarge) { worstLarge = r; wl = it.t; } } else if (r < worstNormal) { worstNormal = r; wn = it.t; }
  }
  return { n: items.length, worstNormal: +worstNormal.toFixed(2), worstNormalText: wn, worstLarge: +worstLarge.toFixed(2), worstLargeText: wl };
}

for (const [w, h] of [[1920, 1080], [1080, 1920]] as const) {
  test(`N-2 ${w}×${h} — 맞추기·가운데 크게는 어떤 비율의 이미지도 잘리지 않고, 순백 이미지 위 글자 대비 4.5(대형 3) 이상`, async ({ page }) => {
    test.setTimeout(180_000);
    let cfg: unknown = null;
    await openTv(page, { w, h, prizes: table(5, 3_000_000), config: () => cfg });
    const log: string[] = [];
    for (const img of ['logo-sq.png', 'logo-wide.png', 'logo-tall.png', 'photo-white-d72.png']) {
      for (const disp of [{}, { fit: 'contain' }, { fit: 'contain', pos: 'top' }, { fit: 'center', size: 3 }, { fit: 'center', size: 1, pos: 'bottom' }, { fit: 'center', size: 2, pos: 'top' }]) {
        cfg = theme(img, disp);
        await page.reload();
        await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
        const fit = (disp as { fit?: string }).fit ?? 'cover';
        const geo = await page.evaluate(async ({ url, fit }) => {
          const im = new Image(); im.src = url; await im.decode();
          const ar = im.naturalWidth / im.naturalHeight;
          const stage = document.querySelector<HTMLElement>('[data-amb-root]')!;
          const sr = stage.getBoundingClientRect();
          const box = fit === 'center' ? document.querySelector<HTMLElement>('[data-testid="clk-logo"]') : stage;
          if (!box) return { err: 'no-logo-layer' };
          const b = box.getBoundingClientRect();
          const cs = getComputedStyle(box);
          // contain 으로 상자 안에 그려지는 실제 그림 사각형
          const dw = Math.min(b.width, b.height * ar), dh = dw / ar;
          return {
            size: cs.backgroundSize, img: cs.backgroundImage.includes('clock_bg'),
            draw: { w: Math.round(dw), h: Math.round(dh) },
            inStage: b.left >= sr.left - 0.5 && b.right <= sr.right + 0.5 && b.top >= sr.top - 0.5 && b.bottom <= sr.bottom + 0.5,
            plate: getComputedStyle(stage).getPropertyValue('--clk-plate').trim(),
          };
        }, { url: IMG(img), fit });
        log.push(`${img} ${JSON.stringify(disp)} ${JSON.stringify(geo)}`);
        if (fit === 'cover') {
          expect(await rootBg(page)).toContain('/cover');
          continue;
        }
        expect(geo, `${img} ${fit}`).toMatchObject({ img: true, inStage: true });
        expect(String((geo as { size: string }).size)).toContain('contain');
        expect((geo as { plate: string }).plate, '글자 판이 없다').not.toBe('');
        if (SHOTS && img !== 'photo-white-d72.png') await page.screenshot({ path: `${SHOTS}/n2-${w}x${h}-${img.replace('.png', '')}-${fit}-${(disp as { pos?: string }).pos ?? 'c'}-${(disp as { size?: number }).size ?? ''}.png` });
      }
    }
    console.log(`[N-2 geo ${w}x${h}]\n${log.join('\n')}`);
    // 최악 바탕 — 화면 전체가 순백(맞추기 · 가운데 크게 둘 다)
    for (const disp of [{ fit: 'contain' }, { fit: 'center', size: 3 }]) {
      cfg = theme(disp.fit === 'contain' ? 'photo-white-d72.png' : 'logo-white-sq.png', disp);
      await page.reload();
      await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(400);
      const c = await measureContrast(page);
      console.log(`[N-2 contrast ${w}x${h} ${disp.fit}] ${JSON.stringify(c)}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/n2-${w}x${h}-white-${disp.fit}.png` });
      expect(c.n).toBeGreaterThan(10);
      expect(c.worstNormal, `일반 글자 최악 '${c.worstNormalText}'`).toBeGreaterThanOrEqual(4.5);
      expect(c.worstLarge, `대형 글자 최악 '${c.worstLargeText}'`).toBeGreaterThanOrEqual(3);
    }
  });
}
