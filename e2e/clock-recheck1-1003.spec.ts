// 재점검 1회차(2026-10-03) 클락 결함 — 세로 TV 상금 띠(N-1·리뷰 중-1) · 매장 이미지 표시 방식(N-2·리뷰 중-2·중-3) · 다른 기기 TV 테마 반영(N-3).
// 리뷰: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-recheck1-clock-1003.md
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

/** 화면에 보이는 '로고' 사각형들 — 로고로 넣기의 이미지(머리줄 칸 또는 타이머 위 칸 안). 숨은 쪽(display:none)은 크기 0 이라 빠진다. */
const visibleLogos = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('[data-amb-root] img')]
  .filter((im) => im.src.includes('/clock_bg/'))
  .map((im) => { const r = im.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, nw: im.naturalWidth, nh: im.naturalHeight }; })
  .filter((r) => r.w > 0 && r.h > 0));

/** 로고가 다른 것에 가려진 비율 — 로고 안 격자 점마다 맨 위 요소가 로고 자신인지 본다(글자·판이 위에 있으면 가림). */
const logoOcclusion = (page: Page) => page.evaluate(() => {
  const ims = [...document.querySelectorAll<HTMLImageElement>('[data-amb-root] img')].filter((im) => im.src.includes('/clock_bg/') && im.getBoundingClientRect().width > 0);
  let total = 0, hidden = 0;
  for (const im of ims) {
    const r = im.getBoundingClientRect();
    for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) {
      const x = r.left + (r.width * i) / 20, y = r.top + (r.height * j) / 20;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { total++; hidden++; continue; }   // 화면 밖 = 안 보임
      total++;
      if (document.elementFromPoint(x, y) !== im) hidden++;
    }
  }
  return { n: ims.length, pct: total ? (100 * hidden) / total : 100 };
});

for (const [w, h] of [[1920, 1080], [1080, 1920], [390, 844]] as const) {
  test(`N-2 ${w}×${h} — 맞추기·로고로 넣기는 어떤 비율의 이미지도 잘리지 않고, 로고는 글자와 겹치지 않으며(가림 ≤5%), 순백 이미지 위 글자 대비 4.5(대형 3) 이상`, async ({ page }) => {
    test.setTimeout(240_000);
    let cfg: unknown = null;
    await openTv(page, { w, h, prizes: table(5, 3_000_000), config: () => cfg });
    const log: string[] = [];
    for (const img of ['logo-sq.png', 'logo-wide.png', 'logo-tall.png', 'photo-white-d72.png']) {
      for (const disp of [{}, { fit: 'contain' }, { fit: 'contain', pos: 'top' }, { fit: 'center', size: 3 }, { fit: 'center', size: 1 }, { fit: 'center', size: 2 }]) {
        cfg = theme(img, disp);
        await page.reload();
        await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
        const fit = (disp as { fit?: string }).fit ?? 'cover';
        if (fit === 'cover') { expect(await rootBg(page)).toContain('/cover'); continue; }
        if (fit === 'contain') {
          const geo = await page.evaluate(() => {
            const stage = document.querySelector<HTMLElement>('[data-amb-root]')!;
            const cs = getComputedStyle(stage);
            return { size: cs.backgroundSize, img: cs.backgroundImage.includes('clock_bg'), plate: cs.getPropertyValue('--clk-plate').trim() };
          });
          log.push(`${img} ${JSON.stringify(disp)} ${JSON.stringify(geo)}`);
          expect(geo.img).toBe(true);
          expect(geo.size).toContain('contain');   // contain = 잘림 0(정의상)
          expect(geo.plate, '맞추기에 글자 판이 없다').not.toBe('');
          continue;
        }
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-amb-root] img')].some((i) => i.src.includes('/clock_bg/') && i.complete && i.naturalWidth > 0));
        const logos = await visibleLogos(page);
        const occ = await logoOcclusion(page);
        const stage = await page.locator('[data-amb-root]').first().boundingBox();
        log.push(`${img} ${JSON.stringify(disp)} logos=${JSON.stringify(logos.map((l) => [Math.round(l.w), Math.round(l.h)]))} 가림 ${occ.pct.toFixed(1)}%`);
        expect(logos.length, `${img} 로고가 화면에 하나여야 한다`).toBe(1);
        const L = logos[0];
        // 잘림 0 — 그려진 상자 비율이 원본 비율과 같고(contain), 상자가 스테이지 안이다
        expect(Math.abs(L.w / L.h - L.nw / L.nh) / (L.nw / L.nh), `${img} 비율이 바뀌었다(잘림/늘림)`).toBeLessThan(0.03);
        expect(L.x >= stage!.x - 0.5 && L.x + L.w <= stage!.x + stage!.width + 0.5 && L.y >= stage!.y - 0.5 && L.y + L.h <= stage!.y + stage!.height + 0.5, `${img} 로고가 스테이지 밖`).toBe(true);
        expect(occ.pct, `${img} ${JSON.stringify(disp)} 로고가 ${occ.pct.toFixed(1)}% 가려졌다`).toBeLessThanOrEqual(5);
        if (SHOTS && img !== 'photo-white-d72.png') await page.screenshot({ path: `${SHOTS}/n2-${w}x${h}-${img.replace('.png', '')}-${fit}-${(disp as { size?: number }).size ?? ''}.png` });
      }
    }
    console.log(`[N-2 geo ${w}x${h}]\n${log.join('\n')}`);
    // 최악 바탕 — 화면 전체가 순백(맞추기) · 순백 로고(로고로 넣기)
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

// ── 리뷰 중-3: 어두운 로고 — 검은 워드마크 · 흰 워드마크 · 컬러 로고, 로고와 바로 뒤 바탕 대비 3:1 이상 ──
// 워드마크 = 투명 바탕에 글자 대신 막대 3개(x 100~300·500~700·900~1100, y 100~300 / 1200×400). 막대 = 로고색, 막대 사이 = 바로 뒤 바탕.
const WORDMARKS: [string, string, string][] = [
  ['wm-black-d0-t111111-k.png', '#000000', '검은 워드마크'],
  ['wm-white-d72-t3a3a3a.png', '#FFFFFF', '흰 워드마크'],
  ['wm-gold-d30-t2d220f.png', '#E0A94E', '컬러 로고'],
];
for (const [name, color] of WORDMARKS) {
  SVG[name] = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect x="100" y="100" width="200" height="200" fill="${color}"/><rect x="500" y="100" width="200" height="200" fill="${color}"/><rect x="900" y="100" width="200" height="200" fill="${color}"/></svg>`;
}

/** 로고 막대 위 점과 막대 사이 점의 픽셀을 읽어 대비를 낸다. rect = 그림이 그려진 사각형(이미지 좌표 1200×400 이 여기에 대응). 판·글자에 덮인 점은 뺀다. */
async function logoContrast(page: Page, rect: { x: number; y: number; w: number; h: number }, self: (x: number, y: number) => Promise<boolean>) {
  const png = PNG.sync.read(await page.screenshot());
  const k = png.width / (page.viewportSize()?.width ?? png.width);
  const px = (cx: number, cy: number) => { const i = (Math.round(cy * k) * png.width + Math.round(cx * k)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const at = (ix: number, iy: number) => [rect.x + (ix / 1200) * rect.w, rect.y + (iy / 400) * rect.h] as const;
  const bar: number[][] = [], gap: number[][] = [];
  // 촘촘한 격자 — 가로 TV '맞추기' 는 막대 대부분이 글자 판 밑이라(설계상) 판 사이로 보이는 점을 찾아야 한다.
  for (let iy = 115; iy <= 285; iy += 17) {
    for (let ix = 115; ix <= 1085; ix += 15) {
      const inBar = [100, 500, 900].some((b0) => ix >= b0 + 12 && ix <= b0 + 188);
      const inGap = [300, 700].some((g0) => ix >= g0 + 12 && ix <= g0 + 188);
      if (!inBar && !inGap) continue;
      const [x, y] = at(ix, iy);
      if (!(await self(x, y))) continue;
      (inBar ? bar : gap).push(px(x, y));
    }
  }
  const med = (a: number[][]) => a.map((c) => [lum(c), c] as const).sort((p, q) => p[0] - q[0])[Math.floor(a.length / 2)]?.[1];
  const b = med(bar), g = med(gap);
  return { bars: bar.length, gaps: gap.length, ratio: b && g ? +ratio(lum(b), lum(g)).toFixed(2) : 0, bar: b, gap: g };
}

for (const [w, h] of [[1920, 1080], [1080, 1920]] as const) {
  test(`중-3 ${w}×${h} — 검은·흰·컬러 워드마크 모두 로고와 바로 뒤 바탕 대비 3:1 이상(로고로 넣기 · 맞추기)`, async ({ page }) => {
    test.setTimeout(180_000);
    let cfg: unknown = null;
    await openTv(page, { w, h, prizes: table(3, 400_000), config: () => cfg });
    for (const [name, , label] of WORDMARKS) {
      for (const fit of ['center', 'contain'] as const) {
        cfg = theme(name, { fit, size: 3 });
        await page.reload();
        await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(300);
        let rect: { x: number; y: number; w: number; h: number };
        let self: (x: number, y: number) => Promise<boolean>;
        if (fit === 'center') {
          await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-amb-root] img')].some((i) => i.src.includes('/clock_bg/') && i.complete && i.naturalWidth > 0));
          rect = await page.evaluate(() => {
            const im = [...document.querySelectorAll<HTMLImageElement>('[data-amb-root] img')].find((i) => i.src.includes('/clock_bg/') && i.getBoundingClientRect().width > 0)!;
            const r = im.getBoundingClientRect(); const cs = getComputedStyle(im);
            const pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop);
            // object-fit: contain — 내용 상자 안에서 그림이 그려지는 사각형
            const cw = r.width - pl - parseFloat(cs.paddingRight), ch = r.height - pt - parseFloat(cs.paddingBottom);
            const s = Math.min(cw / 1200, ch / 400);
            return { x: r.left + pl + (cw - 1200 * s) / 2, y: r.top + pt + (ch - 400 * s) / 2, w: 1200 * s, h: 400 * s };
          });
          self = (x, y) => page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLImageElement | null)?.src?.includes('/clock_bg/') ?? false, [x, y] as const);
        } else {
          rect = await page.evaluate(() => {
            const r = document.querySelector<HTMLElement>('[data-amb-root]')!.getBoundingClientRect();
            const s = Math.min(r.width / 1200, r.height / 400);
            return { x: r.left + (r.width - 1200 * s) / 2, y: r.top + (r.height - 400 * s) / 2, w: 1200 * s, h: 400 * s };
          });
          self = (x, y) => page.evaluate(([x, y]) => {
            const el = document.elementFromPoint(x, y) as HTMLElement | null;
            if (!el) return false;
            // 판(글자 덩어리)이 덮은 점은 뺀다 — 루트 자신이거나, 배경이 투명한 빈 칸이어야 로고 바탕이다
            let e: HTMLElement | null = el;
            while (e && !e.hasAttribute('data-amb-root')) { const bg = getComputedStyle(e).backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return false; if (e.innerText?.trim() && e.children.length === 0) return false; e = e.parentElement; }
            return !!e;
          }, [x, y] as const);
        }
        const c = await logoContrast(page, rect, self);
        console.log(`[중-3 ${w}x${h}] ${label} ${fit} ${JSON.stringify(c)}`);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/m3-${w}x${h}-${name.split('-')[1]}-${fit}.png` });
        expect(c.bars, `${label} ${fit}: 로고 막대 표본 없음`).toBeGreaterThan(0);
        expect(c.gaps, `${label} ${fit}: 바탕 표본 없음`).toBeGreaterThan(0);
        expect(c.ratio, `${label} ${fit}: 로고-바탕 대비 ${c.ratio}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
}

// ── 리뷰 중-1: 세로 비 1.11~2.05 여섯 화면 — 상금 띠 단계와 무관하게 보드 글자끼리 겹침 0 ──
const textOverlaps = (page: Page) => page.evaluate(() => {
  const root = document.querySelector<HTMLElement>('[data-amb-root]')!;
  const sr = root.getBoundingClientRect();
  const els = [...root.querySelectorAll<HTMLElement>('p, span, li')].filter((e) => {
    if (e.closest('[aria-hidden="true"]') || e.closest('button')) return false;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  });
  const out: string[] = [];
  let outside = 0;
  const R = els.map((e) => e.getBoundingClientRect());
  for (let i = 0; i < els.length; i++) {
    const a = R[i];
    if (a.top < sr.top - 1 || a.bottom > sr.bottom + 1) outside++;
    for (let j = i + 1; j < els.length; j++) {
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      // 한 칸 안의 라벨·숫자 줄 상자(라벨 p 와 숫자 p>span — 글자는 안 닿고 줄 높이만 1~2px 겹친다)는 겹침이 아니다
      if (els[i].parentElement?.contains(els[j]) || els[j].parentElement?.contains(els[i])) continue;
      const b = R[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) out.push(`${els[i].textContent!.trim().slice(0, 12)}×${els[j].textContent!.trim().slice(0, 12)} ${Math.round(oy)}px`);
    }
  }
  const vis = (id: string) => { const e = document.querySelector<HTMLElement>(`[data-testid="${id}"]`); return !!e && e.getBoundingClientRect().height > 0; };
  return { overlaps: out, outside, tier: vis('clk-prizes-band') ? 'full' : vis('clk-prizes-short') ? 'short' : 'none', stage: `${Math.round(sr.width)}×${Math.round(sr.height)}` };
});

test('중-1 세로 6화면(768×1024 · 1080×1200 · 1080×1440 · 360×640 · 390×844 · 1080×1920) — 상금 띠가 있어도 글자 겹침 0 · 보드 밖 0', async ({ page }) => {
  test.setTimeout(180_000);
  const out: string[] = [];
  await openTv(page, { w: 1080, h: 1920, prizes: table(20, 9_999_999_999) });
  for (const [w, h] of [[768, 1024], [1080, 1200], [1080, 1440], [360, 640], [390, 844], [1080, 1920]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const m = await textOverlaps(page);
    out.push(`${w}×${h} 스테이지 ${m.stage} 띠 ${m.tier} 겹침 ${m.overlaps.length} 밖 ${m.outside} ${m.overlaps.slice(0, 4).join(' / ')}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/m1-${w}x${h}.png` });
    expect.soft(m.overlaps, `${w}×${h} 글자 겹침: ${m.overlaps.join(', ')}`).toEqual([]);
    expect.soft(m.outside, `${w}×${h} 보드 밖 글자`).toBe(0);
    if (h / w >= 1.9) expect.soft(m.tier, `${w}×${h} 은 충분히 길어 전체 띠가 서야 한다`).toBe('full');
  }
  console.log(`[중-1]\n${out.join('\n')}`);
});
