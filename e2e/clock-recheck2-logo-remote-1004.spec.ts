/// <reference types="vite/client" />
// ↑ 판정 함수(clockTheme.ts)를 그대로 가져오려고 — 그 파일이 import.meta.env 를 읽는다(노드에서는 undefined 라 무해).
// 재점검 2회차(2026-10-04) 클락 하 3건 — 하-A 로고-바탕 대비 · 하-C 세로로 긴 로고 크기 · 하-5 리모컨 가로 safe-area.
// 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\recheck2-screens-1004.md '변화 없이 남은 하'
//       C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-recheck1-clock-1003.md '재검토 a911a44f' 하-A·하-C
// 운영 쓰기 0 — TV 는 읽기 셋을 전부 목킹하고, 리모컨 쓰기는 이 파일의 라우트가 받고 끝난다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { stabilizeBackstack, SUPABASE_URL } from './_session';
import { TV_VENUE } from './_clock';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';
import { clockLogoPlateKind } from '../src/components/features/clock/clockTheme';

const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const F = 'font-family="Arial, sans-serif" font-weight="bold"';

/** 재검토 하네스와 같은 시험 그림 5종(빨강 가로 · 파랑 세로 · 금색 원형 · 검은 글자 · 흰 글자). */
const LOGOS: Record<string, string> = {
  red: `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="360"><rect x="10" y="10" width="1780" height="340" rx="70" fill="#C8102E"/><text x="900" y="225" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>GOLDEN ACE HOLDEM</text></svg>`,
  blue: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1000"><rect x="10" y="10" width="340" height="980" rx="50" fill="#1E88E5"/><text x="180" y="300" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>A</text><text x="180" y="560" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>C</text><text x="180" y="820" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>E</text></svg>`,
  gold: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><circle cx="400" cy="400" r="370" fill="#D4AF37"/><circle cx="400" cy="400" r="330" fill="none" stroke="#7A5A10" stroke-width="12"/><text x="400" y="380" font-size="150" text-anchor="middle" fill="#3B1F00" ${F}>NURI</text><text x="400" y="520" font-size="90" text-anchor="middle" fill="#3B1F00" ${F}>PUB</text></svg>`,
  black: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><text x="600" y="260" font-size="200" text-anchor="middle" fill="#111111" ${F}>BLACK PUB</text></svg>`,
  white: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><text x="600" y="260" font-size="200" text-anchor="middle" fill="#FFFFFF" ${F}>WHITE PUB</text></svg>`,
};

/** 업로드(clockBgImage plateOf)와 같은 표본 — 40×40 으로 줄인 그림의 불투명(알파 ≥160) 픽셀. [r,g,b] 목록. */
const sample = (page: Page, svg: string) => page.evaluate(async (svg) => {
  const im = new Image(); im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await im.decode();
  const c = document.createElement('canvas'); c.width = 40; c.height = 40; const x = c.getContext('2d')!;
  x.drawImage(im, 0, 0, 40, 40); const d = x.getImageData(0, 0, 40, 40).data;
  const out: number[][] = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 160) out.push([d[i], d[i + 1], d[i + 2]]);
  return out;
}, svg);

/** 업로드가 붙이는 이름표와 같은 파일 이름(-m 은 -d 앞, -k 는 끝). */
const fileOf = (key: string, plate: string) => `${key}${plate === 'dark' ? '-m' : ''}-d0-t000000${plate === 'light' ? '-k' : ''}.png`;

async function openTv(page: Page, w: number, h: number, theme: () => unknown) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: w, height: h });
  const row = { venue_id: TV_VENUE, game_seq: 1, session_date: null, title: '재점검 2회차',
    config: { title: '재점검 2회차', startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, isAddon: true, earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 2, maxLevel: 20,
      earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
      prizes: [{ place: '1', amount: 400 }, { place: '2', amount: 150 }], levels: [{ kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 }] },
    current_index: 0, running: false, ends_at: null, remaining_ms: 12 * 60_000, adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0,
    live_stats: { entries: 42, rebuys: 6, earlies: 3, addons: 2, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 } };
  await page.route(/\/rest\/v1\/clock_states/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row]) }));
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    const v = { id: TV_VENUE, name: '재점검 펍', page_config: theme() };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? v : [v]) });
  });
  await page.route(/\/storage\/v1\/object\/public\/clock_bg\//, (r) => {
    const name = decodeURIComponent(r.request().url().split('/').pop() ?? '');
    const svg = LOGOS[name.split('-')[0]];
    return svg ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }) : r.fulfill({ status: 404, body: '' });
  });
  await page.goto(`/?display=${TV_VENUE}&g=1&auto=0`);
  await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
}
const themeOf = (file: string | null, size = 2) => ({ clockTheme: { version: 1, palette: { preset: 'nuri-signature' },
  background: { kind: 'gradient', preset: 'nuri-signature', ...(file ? { image: `${SUPABASE_URL}/storage/v1/object/public/clock_bg/${TV_VENUE}/${file}`, fit: 'center', ...(size !== 2 ? { size } : {}) } : {}) } } });

/** 보이는 로고 img 하나 — 그리는 사각형(받침 패딩 안, object-contain) · 자리(머리줄/타이머 위) · 받침색 · 글자와 겹친 비율. */
const logoGeo = (page: Page) => page.evaluate(() => {
  const root = [...document.querySelectorAll<HTMLElement>('[data-amb-root]')].find((e) => e.getClientRects().length)!;
  const im = [...root.querySelectorAll<HTMLImageElement>('img[data-testid="clk-logo"], [data-testid="clk-logo-tall"] img')]
    .find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0);
  if (!im) return null;
  const r = im.getBoundingClientRect(); const cs = getComputedStyle(im);
  const cw = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ch = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const ar = im.naturalWidth / im.naturalHeight; const dw = Math.min(cw, ch * ar), dh = dw / ar;
  const dx = r.left + parseFloat(cs.paddingLeft) + (cw - dw) / 2, dy = r.top + parseFloat(cs.paddingTop) + (ch - dh) / 2;
  const texts: DOMRect[] = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement!.closest('[aria-hidden="true"]')) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 1) texts.push(q);
  }
  let hit = 0; for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) { const x = dx + (i + 0.5) / 20 * dw, y = dy + (j + 0.5) / 20 * dh; if (texts.some((q) => x >= q.left && x <= q.right && y >= q.top && y <= q.bottom)) hit++; }
  im.setAttribute('data-t-logo', '1');
  const sr = root.getBoundingClientRect();
  const col = im.closest<HTMLElement>('[data-testid="clk-rails"]');
  return { where: im.closest('header') ? 'head' : col ? 'rails' : 'tall', x: dx, y: dy, w: dw, h: dh, boxH: r.height, plate: cs.backgroundColor, overlapPct: hit / 4,
    colOverflow: col ? col.scrollHeight - col.clientHeight : 0,
    inStage: dx >= sr.left - 0.5 && dx + dw <= sr.right + 0.5 && dy >= sr.top - 0.5 && dy + dh <= sr.bottom + 0.5 };
});

/** 로고 불투명 픽셀 vs 로고를 숨긴 뒤 같은 자리의 바탕(받침이 있으면 받침색 합성) — 하위 10% 대비. 재검토 하네스와 같은 방법. */
async function logoBgContrast(page: Page, svg: string, g: { x: number; y: number; w: number; h: number; plate: string }) {
  await page.addStyleTag({ content: '[data-t-logo]{visibility:hidden!important}' });
  await page.waitForTimeout(120);
  const shot = PNG.sync.read(await page.screenshot({ clip: { x: g.x, y: g.y, width: Math.max(2, g.w), height: Math.max(2, g.h) } }));
  await page.evaluate(() => { document.querySelectorAll('style').forEach((s) => { if (s.textContent?.includes('[data-t-logo]')) s.remove(); }); document.querySelector('[data-t-logo]')?.removeAttribute('data-t-logo'); });
  const pix = await page.evaluate(async (svg) => {
    const im = new Image(); im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await im.decode();
    const c = document.createElement('canvas'); c.width = 40; c.height = 40; const x = c.getContext('2d')!; x.drawImage(im, 0, 0, 40, 40);
    return [...x.getImageData(0, 0, 40, 40).data];
  }, svg);
  const pm = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(g.plate);
  const pa = pm ? (pm[4] == null ? 1 : Number(pm[4])) : 0;
  const rs: number[] = [];
  for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
    const k = (j * 40 + i) * 4; if (pix[k + 3] < 160) continue;
    const bx = Math.min(shot.width - 1, Math.floor((i + 0.5) / 40 * shot.width)), by = Math.min(shot.height - 1, Math.floor((j + 0.5) / 40 * shot.height));
    const b = (by * shot.width + bx) * 4; let bg = [shot.data[b], shot.data[b + 1], shot.data[b + 2]];
    if (pm && pa > 0) bg = bg.map((v, q) => pa * Number(pm[q + 1]) + (1 - pa) * v);
    rs.push(ratio(lum(pix[k], pix[k + 1], pix[k + 2]), lum(bg[0], bg[1], bg[2])));
  }
  rs.sort((a, b) => a - b);
  return rs[Math.floor(rs.length * 0.1)];
}

// ── 하-A · 하-C — 가로 TV 1920×1080, 그림 5종 × 크기 3단계 ──────────────────────────────
test('하-A·하-C 가로 TV 1920×1080(일시정지) — 로고 5종 × 크기 3단계: 바탕(받침)과 3:1 이상 · 높이 48px 이상(세로 로고는 폭도) · 글자와 겹침 0 · 타이머 자리 불변', async ({ page }) => {
  test.setTimeout(240_000);
  let theme: unknown = themeOf(null);
  await openTv(page, 1920, 1080, () => theme);
  const timerY = async () => page.getByTestId('clk-timer').evaluate((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  const y0 = await timerY();
  const rows: string[] = []; const fails: string[] = [];
  for (const key of Object.keys(LOGOS)) {
    const plate = clockLogoPlateKind((await sample(page, LOGOS[key])).map(([r, g, b]) => lum(r, g, b)));
    for (const size of [1, 2, 3]) {
      theme = themeOf(fileOf(key, plate), size);
      await page.reload();
      await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(700);
      const g = await logoGeo(page);
      if (!g) { fails.push(`${key}/${size} 로고 없음`); continue; }
      const c = await logoBgContrast(page, LOGOS[key], g);
      const ty = await timerY();
      rows.push(`${key}/${size} ${plate} ${g.where} ${g.w.toFixed(0)}×${g.h.toFixed(0)}(칸 높이 ${g.boxH.toFixed(0)}) 대비p10 ${c.toFixed(2)} 겹침 ${g.overlapPct}% 열넘침 ${g.colOverflow} 타이머y ${ty}`);
      if (c < 3) fails.push(`${key}/${size} 대비 ${c.toFixed(2)}`);
      if (g.boxH < 48) fails.push(`${key}/${size} 로고 칸 높이 ${g.boxH.toFixed(0)}px`);
      // 세로로 긴 로고(파랑 360×1000) — 머리줄이 아닌 자리에서 짧은 변(폭)도 48px 이상
      if (key === 'blue' && (g.where === 'head' || Math.min(g.w, g.h) < 48)) fails.push(`${key}/${size} 세로 로고 ${g.where} ${g.w.toFixed(0)}×${g.h.toFixed(0)}`);
      if (g.colOverflow > 0) fails.push(`${key}/${size} 지표 열 넘침 ${g.colOverflow}px`);
      if (g.overlapPct > 0) fails.push(`${key}/${size} 글자 겹침 ${g.overlapPct}%`);
      if (!g.inStage) fails.push(`${key}/${size} 화면 밖`);
      if (Math.abs(ty - y0) > 1) fails.push(`${key}/${size} 타이머 y ${y0}→${ty}`);
    }
  }
  console.log(`[하-A·C 1920]\n${rows.join('\n')}`);
  expect(fails).toEqual([]);
});

// 세로 TV 는 깨짐만 본다(오너 우선순위) — 세로 로고가 여전히 타이머 위 한 자리에만 있고 겹침·화면 밖이 없다.
test('하-C 세로 TV 1080×1920 회귀 — 세로 로고는 타이머 위 한 자리, 머리줄에는 없음 · 겹침 0', async ({ page }) => {
  await openTv(page, 1080, 1920, () => themeOf(fileOf('blue', 'none')));
  await page.waitForTimeout(700);
  const g = await logoGeo(page);
  console.log(`[하-C 세로] ${JSON.stringify(g)}`);
  expect(g?.where).toBe('tall');
  expect(g?.overlapPct).toBe(0);
  expect(g?.inStage).toBe(true);
  // 보이는 로고는 한 장뿐(머리줄·지표 열의 것은 세로 보드에서 숨는다)
  expect(await page.evaluate(() => [...document.querySelectorAll('[data-amb-root] img')].filter((e) => e.getClientRects().length && (e.closest('[data-testid="clk-logo-tall"]') || e.matches('[data-testid="clk-logo"]'))).length)).toBe(1);
});

// 운영자 스테이지(PC 1440, 내 매장 › 클락 16:9 박스) — 세로 로고가 머리줄(8×23px)이 아니라 지표 열 위에 선다.
test('하-C 운영자 스테이지 1440 — 세로 로고는 머리줄이 아닌 지표 열 위 · 글자 겹침 0', async ({ page }) => {
  test.setTimeout(90_000);
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 }, clock: { ...clockRow(), running: true, ends_at: new Date(Date.now() + 600_000).toISOString() },
    pageConfig: { clockTheme: { version: 1, palette: { preset: 'nuri-signature' }, background: { kind: 'gradient', preset: 'nuri-signature',
      image: `${SUPABASE_URL}/storage/v1/object/public/clock_bg/${MOCK_VENUE}/blue-d0-t000000.png`, fit: 'center' } } },
    extra: async (p) => { await p.route(/\/storage\/v1\/object\/public\/clock_bg\//, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: LOGOS.blue })); },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button')].find((x) => getComputedStyle(x).display !== 'none' && x.textContent?.trim() === '클락')?.click();
  });
  await expect(page.getByTestId('clk-timer').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.locator('[data-amb-root]').first().scrollIntoViewIfNeeded();
  const g = await logoGeo(page);
  console.log(`[하-C 운영자] ${JSON.stringify(g)}`);
  expect(g?.where).toBe('rails');
  expect(g?.overlapPct).toBe(0);
  expect(g?.colOverflow).toBe(0);
});

// ── 하-5 리모컨 가로 — 노치·펀치홀(safe-area) 흉내 ─────────────────────────────────────
const level = (sb: number, bb: number) => ({ kind: 'level', sb, bb, ante: bb, minutes: 20 });
const clockRow = () => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: '수요 딥스택',
  config: { title: '수요 딥스택', startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, isAddon: true, earlyBonus: 5_000, doubleEarlyBonus: 10_000,
    regCloseLevel: 12, maxLevel: 18, earlyDoubleLevel: 2, earlySingleLevel: 4, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
    prizes: [], levels: [level(100, 200), level(200, 400), level(300, 600)] },
  current_index: 1, running: false, ends_at: null, remaining_ms: 20 * 60_000,
  adj_entries: 3, adj_rebuys: 1, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null, updated_at: new Date().toISOString(),
});
async function openRemote(page: Page, w: number, h: number) {
  const writes: Record<string, unknown>[] = [];
  await bootOwner(page, {
    viewport: { width: w, height: h }, clock: clockRow(), goto: false,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/clock_states/, async (r) => {
        if (r.request().method() === 'GET') return r.fallback();
        const b = r.request().postDataJSON(); const body = (Array.isArray(b) ? b[0] : b) as Record<string, unknown>;
        writes.push(body);
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...clockRow(), ...body }]) });
      });
    },
  });
  await page.goto(`/?remote=${MOCK_VENUE}&g=1`);
  await expect(page.getByRole('button', { name: '엔트리 더하기' })).toBeEnabled({ timeout: 20_000 });
  return writes;
}
/** 조작 버튼들 — 안전 영역(inset) 밑에 깔린 것 · 화면 밖 · 본문 스크롤 */
const underInset = (page: Page) => page.evaluate(() => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:env(safe-area-inset-left,0px);height:env(safe-area-inset-bottom,0px);border-right:solid 0 transparent;padding-right:env(safe-area-inset-right,0px)';
  document.body.appendChild(probe); const pr = probe.getBoundingClientRect(); const inset = { l: pr.width - parseFloat(getComputedStyle(probe).paddingRight), r: parseFloat(getComputedStyle(probe).paddingRight), b: pr.height }; probe.remove();
  const btns = [...document.querySelectorAll<HTMLElement>('[data-scroll-lock] button')].filter((b) => b.getClientRects().length);
  const bad: string[] = [];
  for (const b of btns) {
    const r = b.getBoundingClientRect(); const n = (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 12);
    if (r.left < inset.l - 0.5 || r.right > innerWidth - inset.r + 0.5) bad.push(`${n}@x${Math.round(r.left)}-${Math.round(r.right)}`);
    if (r.bottom > innerHeight + 0.5 || r.top < -0.5) bad.push(`${n} 화면 밖 y${Math.round(r.top)}-${Math.round(r.bottom)}`);
  }
  const sc = document.querySelector<HTMLElement>('[data-scroll-lock] > div.overflow-y-auto')!;
  const prev = [...btns].find((b) => b.textContent?.includes('이전 레벨'))!.getBoundingClientRect();
  return { inset, n: btns.length, bad, scroll: sc.scrollHeight - sc.clientHeight, prev: { x: prev.left, y: prev.top + prev.height / 2 } };
});

for (const [w, h] of [[844, 390], [740, 360]] as const) for (const side of ['left', 'right'] as const) {
  test(`하-5 리모컨 가로 ${w}×${h} — ${side} 47px 노치 흉내에서 조작 버튼이 안전 영역 밑에 깔리지 않는다`, async ({ page }) => {
    await openRemote(page, w, h);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { left: side === 'left' ? 47 : 0, right: side === 'right' ? 47 : 0, top: 0, bottom: 21 } } as never);
    await page.waitForTimeout(400);
    const m = await underInset(page);
    console.log(`[하-5 ${w}x${h} ${side}] ${JSON.stringify({ inset: m.inset, n: m.n, bad: m.bad, scroll: m.scroll })}`);
    expect(m.inset[side === 'left' ? 'l' : 'r'], '안전 영역 흉내가 적용되지 않았다(측정 무효)').toBeCloseTo(47, 0);
    expect(m.bad).toEqual([]);
  });
}

test('하-5 리모컨 가로 844×390 좌 47px — 실제 터치(CDP 120ms)로 이전 레벨이 눌린다', async ({ page }) => {
  const writes = await openRemote(page, 844, 390);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { left: 47, right: 0, top: 0, bottom: 21 } } as never);
  await page.waitForTimeout(400);
  const m = await underInset(page);
  // 버튼 왼쪽 끝에서 4px 안 — 노치 바로 옆 손가락 자리
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: m.prev.x + 4, y: m.prev.y }] });
  await new Promise((r) => setTimeout(r, 120));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => writes.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  console.log(`[하-5 터치] x=${(m.prev.x + 4).toFixed(0)} 쓰기 ${JSON.stringify(writes[0]).slice(0, 120)}`);
  expect(writes[0].current_index).toBe(0);
});

test('하-5 리모컨 세로 390×844 회귀 — inset 0 에서 좌우 여백은 종전 px-4(1rem)', async ({ page }) => {
  await openRemote(page, 390, 844);
  const pad = await page.evaluate(() => {
    const sc = document.querySelector<HTMLElement>('[data-scroll-lock] > div.overflow-y-auto')!; const hd = document.querySelector<HTMLElement>('[data-scroll-lock] > header')!;
    return { rem: getComputedStyle(document.documentElement).fontSize, p: [getComputedStyle(sc).paddingLeft, getComputedStyle(sc).paddingRight, getComputedStyle(hd).paddingLeft, getComputedStyle(hd).paddingRight] };
  });
  expect(pad.p).toEqual([pad.rem, pad.rem, pad.rem, pad.rem]);   // 루트 글자 17px — px-4 = 17px
});
