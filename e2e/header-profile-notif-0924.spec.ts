// 헤더 프로필·쪽지/알림 패널 — 오너 2026-09-24 H1·H5 회귀 잠금.
//
// H1: 라이트 모드 헤더에서 프로필 사진이 사라졌다(오너 캡처: 흰 원만 남음).
//   실측 원인 — 오너 아바타는 256×151 webp 로고, 57.6% 투명 + 불투명 픽셀 100% 순백.
//   Avatar 아톰의 <img> 받침이 `bg-surface-high` 라 라이트에서 #EEF2F8 → 흰 위에 흰 글자(≈1.1:1).
//   고침: 받침을 테마 무관 고정색(#1B243C)으로(src/components/atoms/Avatar.tsx).
//   판정은 **픽셀**로 한다 — computed style 은 받침만 알고 그 위에 무엇이 그려졌는지 모른다.
//   원 안쪽(가장자리 2px 제외) 픽셀의 최대/최소 상대휘도 대비가 비텍스트 기준 3:1 이상이어야 한다.
//   외부 저장소에 기대지 않게 같은 성질의 이미지(투명 + 순백 글자판)를 SVG 로 만들어 라우트로 준다.
//
// H5: 쪽지·알림 패널을 열면 알림 탭부터 보인다. 쪽지로 옮겼다 닫아도 다음 열림은 알림이다.
//   알림 탭으로 열려도 쪽지 목록 조회는 열 때 한 번 나간다(헤더 배지의 쪽지 몫 갱신 계약).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';

const LOGO = 'https://e2e-avatar.invalid/logo.svg';
// 투명 바탕 + 흰 글자판 — 오너 아바타와 같은 성질(비율 256×151, 불투명 부분은 순백)
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="151" viewBox="0 0 256 151">
  <rect x="20" y="30" width="216" height="40" fill="#ffffff"/><rect x="40" y="85" width="176" height="36" fill="#ffffff"/></svg>`;

async function boot(page: Page, theme: 'light' | 'dark', over: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t as string); } catch { /* 차단 환경 */ } }, theme);
  await stubLogin(page, over);
  await stabilizeBackstack(page);
  await page.route(LOGO, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }));
  await page.goto('/?tab=home');
}

for (const theme of ['light', 'dark'] as const) {
  test(`🔴 H1 헤더 프로필 — 투명·흰 로고 아바타가 ${theme} 에서 3:1 이상으로 보인다`, async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page, theme, { role: 'admin', avatar_url: LOGO, avatar_color: '#FFD100', activity_points: 50158 });
    const img = page.locator('button[aria-label="검증계정 메뉴"] img');
    await expect(img, '헤더 아바타 이미지가 그려지지 않았다(이니셜 폴백이면 라우트가 안 먹은 것)').toBeVisible({ timeout: 20_000 });
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await page.waitForTimeout(300);

    const png = (await img.screenshot({ animations: 'disabled' })).toString('base64');
    const m = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
      const g = cv.getContext('2d')!; g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      const cx = cv.width / 2, cy = cv.height / 2, r = Math.min(cx, cy) - 2 * devicePixelRatio;
      let lo = 1, hi = 0, n = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
        const i = (y * cv.width + x) * 4;
        const L = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
        lo = Math.min(lo, L); hi = Math.max(hi, L); n++;
      }
      return { n, lo, hi, ratio: (hi + 0.05) / (lo + 0.05) };
    }, png);

    expect(m.n, '원 안쪽 픽셀을 하나도 못 모았다 — 측정 대상이 틀렸다').toBeGreaterThan(100);
    expect(m.ratio, `아바타 원 안 최대/최소 대비 ${m.ratio.toFixed(2)}:1 — 흰 로고가 받침에 묻혔다(lo=${m.lo.toFixed(3)} hi=${m.hi.toFixed(3)})`)
      .toBeGreaterThanOrEqual(3);
  });
}

test('🔴 H5 쪽지·알림 패널 — 열면 알림 탭, 쪽지로 옮겼다 닫아도 다음 열림은 알림, 쪽지 조회는 열 때 나간다', async ({ page }) => {
  test.setTimeout(60_000);
  let threadGets = 0;
  await page.route(/\/rest\/v1\/user_messages\?/, (r) => {
    const req = r.request();
    if (req.method() === 'GET' && decodeURIComponent(req.url()).includes('order=created_at.desc')) {
      threadGets++;
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return r.fallback();
  });
  await boot(page, 'dark');
  const bell = page.locator('button[aria-label^="알림"]');
  await expect(bell).toBeVisible({ timeout: 20_000 });
  const panel = page.getByRole('dialog', { name: '알림' });
  const tab = (name: string) => panel.getByRole('tab', { name, exact: true });

  const before = threadGets;
  await bell.click();
  await expect(panel).toBeVisible();
  await expect(tab('알림'), '패널을 열었는데 알림 탭이 선택돼 있지 않다').toHaveAttribute('aria-selected', 'true');
  await expect(tab('쪽지')).toHaveAttribute('aria-selected', 'false');
  await expect.poll(() => threadGets, { message: '알림 탭으로 열었을 때 쪽지 목록 조회가 안 나갔다(배지 갱신 계약)' })
    .toBeGreaterThan(before);

  await tab('쪽지').click();
  await expect(tab('쪽지')).toHaveAttribute('aria-selected', 'true');
  await page.mouse.click(4, 400);          // 바깥(스크림) 클릭 닫기 — account-isolation 과 같은 동선
  await expect(panel).toHaveCount(0);

  await bell.click();
  await expect(panel).toBeVisible();
  await expect(tab('알림'), '쪽지로 옮겼다 닫은 뒤 다시 열었는데 알림 탭으로 돌아오지 않았다').toHaveAttribute('aria-selected', 'true');
});
