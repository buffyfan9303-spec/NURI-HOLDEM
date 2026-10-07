// 내 정보 — 프로필 사진 크롭(오너 2026-09-27 요청 3) · 머리 배경(요청 2).
//
// P1 크롭: 실제 손가락(CDP 터치)으로 한 손가락 드래그 + 두 손가락 함께 끌기(핀치 중 이동)를 한 뒤 '적용' → '저장하기'.
//   왼쪽 절반 빨강 · 오른쪽 절반 파랑(800×400) 사진을 오른쪽 끝까지 밀면 원 안은 전부 파랑이다.
//   · 업로드된 이미지(스토리지 POST 본문의 WEBP)를 디코드해 256×256 이고 왼쪽 끝·가운데·오른쪽 끝이 파랑인지 본다(원 안에 보인 것 = 저장된 것).
//   · 저장 뒤 헤더 아바타·대시보드 머리 아바타가 **같은 URL**(방금 저장한 것)을 쓴다.
//   음성 대조: 23ec3007 빌드는 두 손가락을 함께 끌어도 사진이 안 움직여(핀치 = 확대만) 원 왼쪽에 빨간 띠가 남는다 → 왼쪽 끝 빨강으로 FAIL.
// P2 머리 배경: 설정 탭에 대시보드와 같은 밴드가 보이고, 고르면 미리보기가 바뀌고, 저장하면 profile_cover 가 실리고 대시보드 밴드도 같은 값.
// P3 서버에 칸이 아직 없으면(마이그레이션 전) 배경 고르기를 숨기고 저장에 profile_cover 를 싣지 않는다.
// 운영 DB 에 쓰지 않는다 — 프로필 PATCH·스토리지를 route 로 받는다.
import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';
import { LEGAL_VERSION } from '../src/lib/legalVersion';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const SHOT = process.env.PAC_SHOT_DIR;
/** stubLogin 의 기본 프로필과 같은 값(PATCH 응답 = 저장된 행) */
const BASE = { id: '00000000-0000-4000-8000-0000000000f1', email: 'verify@example.test', name: '검증계정', nickname: '검증계정', role: 'user', approved: true,
  status: 'active', agreed_to_terms: true, agreed_to_marketing: false, consented_legal_version: LEGAL_VERSION, activity_points: 10, badges: [], avatar_color: '#8B5CF6', avatar_url: null };

async function boot(page: Page, scheme: 'dark' | 'light', w: number, over: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.addInitScript((s) => { try { localStorage.setItem('nuri-theme', s); } catch { /* 차단 */ } }, scheme);
  await stabilizeBackstack(page);
  await stubLogin(page, over);
  const st = { patch: [] as Record<string, unknown>[], webp: null as Buffer | null, row: {} as Record<string, unknown> };
  // stubLogin 의 profiles 목킹 위에 PATCH 를 받아 행에 합친다(나중에 등록한 route 가 먼저 돈다)
  await page.route(/\/rest\/v1\/profiles\?/, async (r) => {
    if (r.request().method() === 'PATCH') {
      const body = JSON.parse(r.request().postData() ?? '{}');
      st.patch.push(body);
      Object.assign(st.row, body);
      return r.fulfill(json({ ...BASE, ...over, ...st.row }));
    }
    return r.fallback();
  });
  await page.route(/\/storage\/v1\/object\/avatars\//, (r) => {
    if (r.request().method() === 'GET') return st.webp ? r.fulfill({ status: 200, contentType: 'image/webp', body: st.webp }) : r.fulfill({ status: 404, body: '' });
    const buf = r.request().postDataBuffer() ?? Buffer.alloc(0);
    const i = buf.indexOf('RIFF');
    if (i >= 0) st.webp = buf.subarray(i, i + 8 + buf.readUInt32LE(i + 4));
    return r.fulfill(json({ Key: 'avatars/x/avatar.webp', Id: 'x' }));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '검증계정 메뉴' })).toBeVisible({ timeout: 20_000 });
  const cdp = await page.context().newCDPSession(page);
  return { st, cdp };
}
async function openSettings(page: Page) {
  await page.getByRole('button', { name: '검증계정 메뉴' }).click();
  await page.getByRole('button', { name: '내 정보 열기' }).click();
  await expect(page.locator('div.fixed.inset-0:has(> header h1:text-is("내 정보"))')).toHaveJSProperty('inert', false);
  await page.locator('[data-profile-tabbar] [role="tab"]', { hasText: '설정' }).evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-profile-tabbar] [role="tab"]', { hasText: '설정' })).toHaveAttribute('aria-selected', 'true');
}
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });

for (const [w, scheme] of [[390, 'dark'], [360, 'light']] as const) {
  test(`P1 크롭 ${w} ${scheme} — 손가락으로 고른 부분이 그대로 저장되고 헤더·대시보드가 같은 사진을 쓴다`, async ({ page }) => {
    test.setTimeout(90_000);
    const { st, cdp } = await boot(page, scheme, w);
    await openSettings(page);
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 400;
      const g = c.getContext('2d')!; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 400, 400); g.fillStyle = '#0000ff'; g.fillRect(400, 0, 400, 400);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('[data-profile-panel] input[type="file"]').setInputFiles({ name: 'half.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    const box = page.locator('[aria-labelledby="avatar-cropper-title"] .touch-none'); // testid 없던 옛 빌드에서도 잡히게(음성 대조)
    await expect(box).toBeVisible();
    // 원형 미리보기(헤더 32 · 대시보드 104) — soft: 없던 빌드에서도 아래 픽셀 판정까지 간다
    await expect.soft(page.getByTestId('avatar-crop-preview-32')).toBeVisible();
    await expect.soft(page.getByTestId('avatar-crop-preview-104')).toBeVisible();
    await page.waitForTimeout(300);
    const b = (await box.boundingBox())!;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    // 한 손가락 — 왼쪽으로 100px(사진이 왼쪽으로 = 오른쪽 부분을 본다)
    await touch(cdp, 'touchStart', [[cx, cy]]);
    for (let k = 1; k <= 10; k++) { await touch(cdp, 'touchMove', [[cx - 10 * k, cy]]); await page.waitForTimeout(16); }
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(150);
    // 두 손가락 — 벌리지 않고 함께 왼쪽으로 60px(핀치 중 이동)
    await touch(cdp, 'touchStart', [[cx - 40, cy], [cx + 40, cy]]);
    for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [[cx - 40 - 10 * k, cy], [cx + 40 - 10 * k, cy]]); await page.waitForTimeout(16); }
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(200);
    if (SHOT) await page.screenshot({ path: `${SHOT}/crop-${w}-${scheme}.png` });
    await page.getByRole('button', { name: '적용' }).click();
    await expect(box).toHaveCount(0);
    await page.getByRole('button', { name: '저장하기' }).click();
    await expect.poll(() => st.patch.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(st.webp, '업로드 본문에서 WEBP 를 못 찾았다').not.toBeNull();
    // 저장된 이미지 디코드 — 원 안에 보인 것(전부 파랑)이 저장됐나
    const px = await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/webp' }));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0);
      const at = (x: number) => Array.from(g.getImageData(x, Math.floor(bmp.height / 2), 1, 1).data.slice(0, 3));
      return { w: bmp.width, h: bmp.height, left: at(3), mid: at(Math.floor(bmp.width / 2)), right: at(bmp.width - 4) };
    }, st.webp!.toString('base64'));
    expect([px.w, px.h]).toEqual([256, 256]);
    const blue = (p: number[]) => p[2] > 200 && p[0] < 60;
    expect(blue(px.left), `저장 이미지 왼쪽 끝이 파랑이 아니다(${px.left}) — 두 손가락으로 끈 만큼 사진이 안 움직였다`).toBe(true);
    expect(blue(px.mid) && blue(px.right), `가운데·오른쪽이 파랑이 아니다(${px.mid} / ${px.right})`).toBe(true);
    const url = String(st.patch[st.patch.length - 1].avatar_url ?? '');
    expect(url).toMatch(/\/avatars\/.+avatar\.webp\?v=\d+/);
    // 소비처 — 헤더 아바타와 대시보드 머리가 방금 저장한 같은 URL
    await page.locator('[data-profile-tabbar] [role="tab"]', { hasText: '대시보드' }).evaluate((x) => (x as HTMLElement).click());
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => /avatar\.webp/.test(i.src)).map((i) => i.src)), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([url]));
    const srcs = await page.evaluate(() => [...new Set([...document.querySelectorAll('img')].filter((i) => /avatar\.webp/.test(i.src)).map((i) => i.src))]);
    expect(srcs, '소비처마다 다른 사진 URL 을 쓴다').toEqual([url]);
    if (SHOT) await page.screenshot({ path: `${SHOT}/after-save-${w}-${scheme}.png` });
  });
}

for (const [w, scheme] of [[390, 'light'], [360, 'dark']] as const) {
  test(`P2 머리 배경 ${w} ${scheme} — 설정에서 대시보드와 같은 밴드를 보고 바꿔 저장한다`, async ({ page }) => {
    test.setTimeout(90_000);
    const { st } = await boot(page, scheme, w, { profile_cover: null });
    await page.getByRole('button', { name: '검증계정 메뉴' }).click();
    await page.getByRole('button', { name: '내 정보 열기' }).click();
    const bandOf = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="profile-cover-band"]')].filter((e) => e.getClientRects().length)
      .map((e) => ({ cover: e.dataset.cover, img: getComputedStyle(e.firstElementChild as Element).backgroundImage, h: Math.round(e.getBoundingClientRect().height) })));
    await expect.poll(async () => (await bandOf()).length, { timeout: 15_000 }).toBe(1);
    const dash0 = (await bandOf())[0];
    expect(dash0.cover).toBe('tier');
    await page.locator('[data-profile-tabbar] [role="tab"]', { hasText: '설정' }).evaluate((b) => (b as HTMLElement).click());
    await expect(page.getByTestId('profile-cover-picker')).toBeVisible();
    const set0 = (await bandOf())[0];
    expect(set0, '설정 탭의 머리 배경이 대시보드와 다르다').toEqual(dash0);
    await page.getByTestId('profile-cover-ocean').click();
    await expect(page.getByTestId('profile-cover-ocean')).toHaveAttribute('aria-pressed', 'true');
    const set1 = (await bandOf())[0];
    expect(set1.cover).toBe('ocean');
    expect(set1.img).not.toBe(dash0.img);
    if (SHOT) await page.screenshot({ path: `${SHOT}/cover-${w}-${scheme}.png` });
    await page.getByRole('button', { name: '저장하기' }).click();
    await expect.poll(() => st.patch.length, { timeout: 15_000 }).toBe(1);
    expect(st.patch[0].profile_cover).toBe('ocean');
    await page.locator('[data-profile-tabbar] [role="tab"]', { hasText: '대시보드' }).evaluate((b) => (b as HTMLElement).click());
    await expect.poll(async () => (await bandOf())[0]?.cover, { timeout: 10_000 }).toBe('ocean');
    expect((await bandOf())[0].img).toBe(set1.img);
  });
}

test('P3 서버에 칸이 없으면(마이그레이션 전) 배경 고르기를 숨기고 저장에 싣지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  const { st } = await boot(page, 'dark', 390);
  await openSettings(page);
  await expect(page.getByTestId('profile-cover-band').filter({ visible: true })).toHaveCount(1); // 밴드는 늘 보인다(기본 등급색)
  await expect(page.getByTestId('profile-cover-picker')).toHaveCount(0);
  await page.getByRole('button', { name: '저장하기' }).click();
  await expect.poll(() => st.patch.length, { timeout: 15_000 }).toBe(1);
  expect('profile_cover' in st.patch[0], '칸이 없는 서버에 profile_cover 를 실었다(저장 전체가 실패한다)').toBe(false);
});
