// 재점검 2회차(2026-10-04) 클락 하 3건 — 하-A 로고-바탕 대비 · 하-C 세로로 긴 로고 크기 · 하-5 리모컨 가로 safe-area.
// 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\recheck2-screens-1004.md '변화 없이 남은 하'
//       C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-recheck1-clock-1003.md '재검토 a911a44f' 하-A·하-C
//       C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-recheck2-clock-1004.md 중-1·중-2·중-3·하-1·하-2·⑥
// 받침 판정은 **실제 업로드 경로**(내 매장 › 클락 › 설정 › 파일 선택 → resizeImage → webp → plateOf → 이름표)로 만든 파일로 잰다.
// 운영 쓰기 0 — 스토리지 업로드·page_config 저장·클락 쓰기 전부 이 파일의 라우트가 받고 끝난다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { stabilizeBackstack, SUPABASE_URL } from './_session';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const F = 'font-family="Arial, sans-serif" font-weight="bold"';
const PUB = `${SUPABASE_URL}/storage/v1/object/public/clock_bg/`;

/** 검토 하네스와 같은 시험 그림 6종. outline = 흰 글자 + 검은 테두리(스티커형). */
const SVG: Record<string, string> = {
  red: `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="360"><rect x="10" y="10" width="1780" height="340" rx="70" fill="#C8102E"/><text x="900" y="225" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>GOLDEN ACE HOLDEM</text></svg>`,
  blue: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1000"><rect x="10" y="10" width="340" height="980" rx="50" fill="#1E88E5"/><text x="180" y="300" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>A</text><text x="180" y="560" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>C</text><text x="180" y="820" font-size="150" text-anchor="middle" fill="#FFFFFF" ${F}>E</text></svg>`,
  gold: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><circle cx="400" cy="400" r="370" fill="#D4AF37"/><circle cx="400" cy="400" r="330" fill="none" stroke="#7A5A10" stroke-width="12"/><text x="400" y="380" font-size="150" text-anchor="middle" fill="#3B1F00" ${F}>NURI</text><text x="400" y="520" font-size="90" text-anchor="middle" fill="#3B1F00" ${F}>PUB</text></svg>`,
  black: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><text x="600" y="260" font-size="200" text-anchor="middle" fill="#111111" ${F}>BLACK PUB</text></svg>`,
  white: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><text x="600" y="260" font-size="200" text-anchor="middle" fill="#FFFFFF" ${F}>WHITE PUB</text></svg>`,
  outline: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><text x="600" y="270" font-size="210" text-anchor="middle" fill="#FFFFFF" stroke="#000000" stroke-width="18" paint-order="stroke" ${F}>ACE PUB</text></svg>`,
};
/** 기대 받침(이름표) — 빨강만 검은 받침(-m), 검정만 밝은 받침(-k). 금색(안쪽 갈색)·테두리(흰 면 50%)는 받침 없음. */
const EXPECT: Record<string, 'none' | 'dark' | 'light'> = { red: 'dark', blue: 'none', gold: 'none', black: 'light', white: 'none', outline: 'none' };
const plateOfName = (p: string) => (/-k\.\w+$/.test(p) ? 'light' : /-m-d\d/.test(p) ? 'dark' : 'none');

type Files = Map<string, { buf: Buffer; type: string }>;
function multipartFile(buf: Buffer, ct: string): { buf: Buffer; type: string } {
  const m = /boundary=([^;]+)/.exec(ct); if (!m) return { buf, type: ct };
  const b = Buffer.from(`--${m[1]}`); let i = buf.indexOf(b);
  while (i >= 0) {
    const j = buf.indexOf(b, i + b.length); if (j < 0) break;
    const part = buf.subarray(i + b.length + 2, j - 2); const h = part.indexOf('\r\n\r\n');
    const t = /content-type:\s*([^\r\n]+)/i.exec(part.subarray(0, h).toString())?.[1];
    if (t && /image\//.test(t)) return { buf: Buffer.from(part.subarray(h + 4)), type: t.trim() };
    i = j;
  }
  return { buf, type: ct };
}
/** 스토리지 공개 읽기(업로드한 바이트 그대로). delay = 그림 도착 지연(첫 렌더 시험). */
async function serveFiles(page: Page, files: Files, delay = 0) {
  await page.route(/\/storage\/v1\/object\/public\/clock_bg\//, async (r) => {
    const path = decodeURIComponent(new URL(r.request().url()).pathname.replace(/^.*\/clock_bg\//, ''));
    const f = files.get(path); if (delay) await new Promise((s) => setTimeout(s, delay));
    return f ? r.fulfill({ status: 200, contentType: f.type, body: f.buf }) : r.fulfill({ status: 404, body: '' });
  });
}

const level = (sb: number, bb: number) => ({ kind: 'level', sb, bb, ante: bb, minutes: 20 });
const clockRow = (running = false) => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: '수요 딥스택',
  config: { title: '수요 딥스택', startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, isAddon: true, earlyBonus: 5_000, doubleEarlyBonus: 10_000,
    regCloseLevel: 12, maxLevel: 18, earlyDoubleLevel: 2, earlySingleLevel: 4, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
    prizes: [{ place: '1', amount: 400 }, { place: '2', amount: 150 }], levels: [level(100, 200), level(200, 400), level(300, 600)] },
  current_index: 1, running, ends_at: running ? new Date(Date.now() + 600_000).toISOString() : null, remaining_ms: 20 * 60_000,
  adj_entries: 3, adj_rebuys: 1, adj_earlies: 0, adj_addons: 0, eliminations: 0,
  live_stats: { entries: 42, rebuys: 6, earlies: 3, addons: 2, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
  updated_at: new Date().toISOString(),
});
const themeOf = (path: string | null, size = 2) => ({ clockTheme: { version: 1, palette: { preset: 'nuri-signature' },
  background: { kind: 'gradient', preset: 'nuri-signature', ...(path ? { image: PUB + path, fit: 'center', ...(size !== 2 ? { size } : {}) } : {}) } } });

/** 설정 화면에서 6종을 실제로 올린다 → 업로드된 경로(이름표 포함)와 바이트. */
async function uploadAll(page: Page): Promise<{ paths: Record<string, string>; files: Files }> {
  const files: Files = new Map(); let cfg: unknown = null;
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootOwner(page, { viewport: { width: 1440, height: 900 }, clock: clockRow(), goto: false, extra: async (p) => {
    await p.route(/\/storage\/v1\/object\//, async (r: Route) => {
      const q = r.request(); const u = new URL(q.url());
      const up = /\/storage\/v1\/object\/clock_bg\/(.+)$/.exec(u.pathname);
      if (up && q.method() === 'POST') { const path = decodeURIComponent(up[1]); files.set(path, multipartFile(q.postDataBuffer() ?? Buffer.alloc(0), q.headers()['content-type'] ?? '')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `clock_bg/${path}` }) }); }
      if (q.method() === 'DELETE') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return r.fallback();
    });
    await serveFiles(p, files);
    await p.route(/\/rest\/v1\/rpc\/set_venue_page_config/, (r) => { cfg = (r.request().postDataJSON() as { p_config: unknown }).p_config; return r.fulfill({ status: 204, body: '' }); });
    await p.route(/\/rest\/v1\/venues\?/, (r) => {
      if (r.request().method() !== 'GET' || !r.request().url().includes('page_config') || cfg == null) return r.fallback();
      const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
      const v = { id: MOCK_VENUE, name: '재점검 펍', page_config: cfg };
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? v : [v]) });
    });
  } });
  page.on('dialog', (d) => { void d.dismiss(); });
  await page.goto('/'); await page.waitForLoadState('networkidle');
  await openMyStore(page);
  await page.locator('[aria-label="매장 단계 이동"] [role=tab]').filter({ hasText: '클락' }).first().click();
  const preview = page.locator('[aria-label="클락 화면 미리보기"]');
  if (!(await preview.isVisible({ timeout: 3000 }).catch(() => false))) await page.getByRole('button', { name: '설정', exact: true }).first().click();
  await expect(preview).toBeVisible({ timeout: 20_000 });
  const input = page.locator('section').filter({ has: preview }).first().locator('input[type=file]');
  const paths: Record<string, string> = {};
  for (const k of Object.keys(SVG)) {
    const before = files.size;
    await input.setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: await sharp(Buffer.from(SVG[k])).png().toBuffer() });
    await expect.poll(() => files.size, { timeout: 30_000 }).toBe(before + 1);
    paths[k] = [...files.keys()].pop()!;
    await page.waitForTimeout(800);
  }
  return { paths, files };
}

/** TV(1920 등) — 업로드된 파일 그대로. */
async function openTv(page: Page, files: Files, w: number, h: number, theme: () => unknown, o: { running?: boolean; delay?: number } = {}) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: w, height: h });
  await page.route(/\/rest\/v1\/clock_states/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([clockRow(o.running)]) }));
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    const v = { id: MOCK_VENUE, name: '재점검 펍', page_config: theme() };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? v : [v]) });
  });
  await serveFiles(page, files, o.delay);
}

/** 보이는 로고 img — **그림이 실제로 그려지는 사각형**(object-contain, 패딩 제외) · 자리 · 받침색 · 글자 겹침. */
const logoGeo = (page: Page) => page.evaluate(() => {
  const root = [...document.querySelectorAll<HTMLElement>('[data-amb-root]')].find((e) => e.getClientRects().length)!;
  const im = [...root.querySelectorAll<HTMLImageElement>('img[data-testid="clk-logo"], [data-testid="clk-logo-tall"] img')]
    .find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0 && e.naturalWidth > 0);
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
  const col = im.closest<HTMLElement>('[data-testid="clk-rails"]');
  const label = col?.querySelector('p')?.getBoundingClientRect();
  return { where: im.closest('header') ? 'head' : col ? 'rails' : 'tall', x: dx, y: dy, w: dw, h: dh, slotH: cs.maxHeight !== 'none' ? parseFloat(cs.maxHeight) : r.height,
    plate: cs.backgroundColor, overlapPct: hit / 4, colOverflow: col ? col.scrollHeight - col.clientHeight : 0, leftGap: label ? Math.round(r.left - label.left) : null };
});

/** 로고 원본 40² 불투명 픽셀 vs 로고만 숨긴 같은 자리(받침색 합성) — 하위 10% 대비. bright = 밝은 면(휘도 ≥ 0.6)만. */
async function logoBgContrast(page: Page, buf: Buffer, g: { x: number; y: number; w: number; h: number; plate: string }, bright = false) {
  await page.addStyleTag({ content: '[data-t-logo]{visibility:hidden!important}' });
  await page.waitForTimeout(120);
  const shot = PNG.sync.read(await page.screenshot({ clip: { x: g.x, y: g.y, width: Math.max(2, g.w), height: Math.max(2, g.h) } }));
  await page.evaluate(() => { document.querySelectorAll('style').forEach((s) => { if (s.textContent?.includes('[data-t-logo]')) s.remove(); }); document.querySelector('[data-t-logo]')?.removeAttribute('data-t-logo'); });
  const { data: pix } = await sharp(buf).resize(40, 40, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pm = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(g.plate);
  const pa = pm ? (pm[4] == null ? 1 : Number(pm[4])) : 0;
  const rs: number[] = [];
  for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
    const k = (j * 40 + i) * 4; if (pix[k + 3] < 160) continue;
    const L = lum(pix[k], pix[k + 1], pix[k + 2]); if (bright && L < 0.6) continue;
    const bx = Math.min(shot.width - 1, Math.floor((i + 0.5) / 40 * shot.width)), by = Math.min(shot.height - 1, Math.floor((j + 0.5) / 40 * shot.height));
    const b = (by * shot.width + bx) * 4; let bg = [shot.data[b], shot.data[b + 1], shot.data[b + 2]];
    if (pm && pa > 0) bg = bg.map((v, q) => pa * Number(pm[q + 1]) + (1 - pa) * v);
    rs.push(ratio(L, lum(bg[0], bg[1], bg[2])));
  }
  rs.sort((a, b) => a - b);
  return rs[Math.floor(rs.length * 0.1)];
}

// ── 하-A · 하-C — 실제 업로드 6종 → 가로 TV 1920×1080 × 크기 3단계 ─────────────────────────
test('하-A·하-C 실제 업로드 6종 → 1920 TV: 받침 판정 · 바탕(받침)과 3:1 · 그림 실제 높이(받침에 안 먹힘) · 세로 로고는 지표 열 · 겹침 0', async ({ page }) => {
  test.setTimeout(300_000);
  const { paths, files } = await uploadAll(page);
  const names = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, p.split('/').pop()]));
  console.log(`[업로드 이름표] ${JSON.stringify(names)}`);
  const got = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, plateOfName(p)]));
  expect(got, '받침 판정(이름표)').toEqual(EXPECT);
  for (const p of Object.values(paths)) expect(p, '비율 이름표(-a) 없음').toMatch(/-a\d+(-m)?-d\d/);

  const tv = await page.context().newPage();
  let theme: unknown = themeOf(null);
  await openTv(tv, files, 1920, 1080, () => theme);
  const rows: string[] = []; const fails: string[] = [];
  for (const k of Object.keys(SVG)) for (const size of [1, 2, 3]) {
    theme = themeOf(paths[k], size);
    await tv.goto(`/?display=${MOCK_VENUE}&g=1&auto=0`);
    await expect(tv.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    await tv.waitForTimeout(700);
    const g = await logoGeo(tv);
    if (!g) { fails.push(`${k}/${size} 로고 없음`); continue; }
    const f = files.get(paths[k])!;
    const c = await logoBgContrast(tv, f.buf, g, k === 'outline');
    rows.push(`${k}/${size} ${got[k]} ${g.where} 그림 ${g.w.toFixed(1)}×${g.h.toFixed(1)} 칸 ${g.slotH.toFixed(1)} 받침 ${g.plate} 대비p10 ${c.toFixed(2)} 겹침 ${g.overlapPct}% 열넘침 ${g.colOverflow} 왼끝차 ${g.leftGap}`);
    if (c < 3) fails.push(`${k}/${size} 대비 ${c.toFixed(2)}`);
    if (Math.min(g.w, g.h) < 48 && k === 'blue') fails.push(`${k}/${size} 세로 로고 짧은 변 ${Math.min(g.w, g.h).toFixed(0)}px`);
    if (k === 'blue' && g.where !== 'rails') fails.push(`${k}/${size} 세로 로고 자리 ${g.where}`);
    if (k === 'blue' && g.leftGap !== 0) fails.push(`${k}/${size} 지표 라벨과 왼쪽 끝 ${g.leftGap}px 차이`);
    // 머리줄 로고: 그림 높이가 칸(로고 크기 단계) 높이를 그대로 쓴다 — 받침이 칸을 먹지 않는다(여백 방식은 52→33px)
    if (g.where === 'head' && g.w < 380 && g.h < g.slotH - 1) fails.push(`${k}/${size} 그림 높이 ${g.h.toFixed(1)} < 칸 ${g.slotH.toFixed(1)}`);
    if (g.h < 48) fails.push(`${k}/${size} 그림 높이 ${g.h.toFixed(1)}px`);
    if (g.overlapPct > 0) fails.push(`${k}/${size} 글자 겹침 ${g.overlapPct}%`);
    if (g.colOverflow > 0) fails.push(`${k}/${size} 지표 열 넘침 ${g.colOverflow}px`);
  }
  console.log(`[하-A·C 1920]\n${rows.join('\n')}`);
  expect(fails).toEqual([]);
});

// 검토 하-2 — 세로 로고는 첫 렌더부터 지표 열에 선다(머리줄 프레임 0 · 지표 묶음 이동 0). 그림이 600ms 늦게 와도.
test('하-C 첫 렌더 — 세로 로고(-a 이름표)는 처음부터 지표 열 자리, 머리줄 프레임 0 · 지표 이동 0(그림 600ms 지연)', async ({ page }) => {
  const files: Files = new Map([[`${MOCK_VENUE}/1-a36-d0-t000000.png`, { buf: await sharp(Buffer.from(SVG.blue)).png().toBuffer(), type: 'image/png' }]]);
  await openTv(page, files, 1920, 1080, () => themeOf(`${MOCK_VENUE}/1-a36-d0-t000000.png`), { delay: 600 });
  await page.addInitScript(() => {
    const w = window as unknown as { __f: string[] };
    w.__f = [];
    const tick = () => {
      const head = [...document.querySelectorAll<HTMLElement>('[data-amb-root] header img[data-testid="clk-logo"]')].some((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0);
      const lab = [...document.querySelectorAll<HTMLElement>('[data-testid="clk-rails"] p')].find((e) => e.getClientRects().length);
      if (lab || head) w.__f.push(`${head ? 'H' : '-'}${lab ? Math.round(lab.getBoundingClientRect().top) : 'x'}`);
      if (w.__f.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`/?display=${MOCK_VENUE}&g=1&auto=0`);
  await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1800);
  const fr = await page.evaluate(() => (window as unknown as { __f: string[] }).__f);
  const tops = [...new Set(fr.filter((s) => !s.endsWith('x')).map((s) => s.slice(1)))];
  console.log(`[하-2] 프레임 ${fr.length} · 머리줄 ${fr.filter((s) => s[0] === 'H').length} · 지표 top ${tops.join(',')}`);
  expect(fr.filter((s) => s[0] === 'H').length, '머리줄에 선 프레임').toBe(0);
  expect(tops.length, '지표 묶음이 움직였다').toBe(1);
  expect((await logoGeo(page))?.where).toBe('rails');
});

// 세로 TV 는 깨짐만 본다(오너 우선순위).
test('하-C 세로 TV 1080×1920 회귀 — 세로 로고는 타이머 위 한 자리 · 겹침 0', async ({ page }) => {
  const files: Files = new Map([[`${MOCK_VENUE}/1-a36-d0-t000000.png`, { buf: await sharp(Buffer.from(SVG.blue)).png().toBuffer(), type: 'image/png' }]]);
  await openTv(page, files, 1080, 1920, () => themeOf(`${MOCK_VENUE}/1-a36-d0-t000000.png`));
  await page.goto(`/?display=${MOCK_VENUE}&g=1&auto=0`);
  await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700);
  const g = await logoGeo(page);
  console.log(`[하-C 세로] ${JSON.stringify(g)}`);
  expect(g?.where).toBe('tall');
  expect(g?.overlapPct).toBe(0);
  expect(await page.evaluate(() => [...document.querySelectorAll('[data-amb-root] img')].filter((e) => e.getClientRects().length && (e.closest('[data-testid="clk-logo-tall"]') || e.matches('[data-testid="clk-logo"]'))).length)).toBe(1);
});

// 운영자 스테이지(PC 1440) — 세로 로고가 머리줄(8×23px)이 아니라 지표 열 위.
test('하-C 운영자 스테이지 1440 — 세로 로고는 지표 열 위 · 글자 겹침 0', async ({ page }) => {
  test.setTimeout(90_000);
  const path = `${MOCK_VENUE}/1-a36-d0-t000000.png`;
  const files: Files = new Map([[path, { buf: await sharp(Buffer.from(SVG.blue)).png().toBuffer(), type: 'image/png' }]]);
  await bootOwner(page, { viewport: { width: 1440, height: 900 }, clock: clockRow(true), pageConfig: themeOf(path), extra: (p) => serveFiles(p, files) });
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
  probe.style.cssText = 'position:fixed;left:0;top:0;width:env(safe-area-inset-left,0px);height:env(safe-area-inset-bottom,0px);padding-right:env(safe-area-inset-right,0px)';
  document.body.appendChild(probe); const pr = probe.getBoundingClientRect(); const pR = parseFloat(getComputedStyle(probe).paddingRight); probe.remove();
  const inset = { l: pr.width - pR, r: pR, b: pr.height };
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
const setInset = async (page: Page, insets: { left: number; right: number; top: number; bottom: number }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never);
  await page.waitForTimeout(400);
  return cdp;
};

for (const [w, h] of [[844, 390], [740, 360]] as const) for (const side of ['left', 'right'] as const) {
  test(`하-5 리모컨 가로 ${w}×${h} — ${side} 47px 노치 흉내에서 조작 버튼이 안전 영역 밑에 깔리지 않는다`, async ({ page }) => {
    await openRemote(page, w, h);
    await setInset(page, { left: side === 'left' ? 47 : 0, right: side === 'right' ? 47 : 0, top: 0, bottom: 21 });
    const m = await underInset(page);
    console.log(`[하-5 ${w}x${h} ${side}] ${JSON.stringify({ inset: m.inset, n: m.n, bad: m.bad, scroll: m.scroll })}`);
    expect(m.inset[side === 'left' ? 'l' : 'r'], '안전 영역 흉내가 적용되지 않았다(측정 무효)').toBeCloseTo(47, 0);
    expect(m.bad).toEqual([]);
  });
}

// 실제 터치(CDP 120ms) — 노치 **안쪽**(x 20) 은 아무 버튼도 아니어야 하고(main 은 '이전 레벨' 이 x 17 부터라 눌렸다). x 43 은 브라우저 터치 보정이 4px 옆 버튼에 붙여 수정본에서도 눌린다(실측) — 그래서 20.
// 노치 바로 바깥(버튼 왼끝 + 4) 은 '이전 레벨' 이 눌린다.
test('하-5 리모컨 가로 844×390 좌 47px — 실제 터치: 노치 안(x 20)은 버튼 없음, 노치 밖은 이전 레벨', async ({ page }) => {
  const writes = await openRemote(page, 844, 390);
  const cdp = await setInset(page, { left: 47, right: 0, top: 0, bottom: 21 });
  const m = await underInset(page);
  const tap = async (x: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: m.prev.y }] });
    await new Promise((r) => setTimeout(r, 120));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1200);
  };
  await tap(20);
  console.log(`[하-5 터치] 노치 안 x=20 쓰기 ${writes.length}`);
  expect(writes.length, '노치 안쪽 터치가 버튼을 눌렀다(버튼이 노치 밑에 깔림)').toBe(0);
  await tap(m.prev.x + 4);
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
