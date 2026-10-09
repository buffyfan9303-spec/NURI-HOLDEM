// NURI SPOT 대표 카드의 흐르는 빛(SpotHeroSheen) — 2026-10-09 오너 "모션그래픽 넣은 부분들 처음에 한번 나오고 안나와서 내가 인지를 못하는 것 같아
// 이거 계속 반복되게 해야될 것 같아". 종전 빛줄기는 정적 그림이었다(운영 실측 2.5초 간격 픽셀 차이 0) → 옅은 사선 빛 띠가 9초마다 천천히 지나간다.
// 헤더 로고 글린트의 같은 계약은 e2e/logo-glint.spec.ts(반복 시계는 둘이 같은 lib/glintLoop.ts).
//
// 잠그는 것:
//   ① 반복 — 탭에 들어오고 첫 회차가 실제로 지나가고(이동량이 카드 안), 대기 위치로 돌아간 뒤 약 9초 뒤 두 번째 회차.
//      그 사이 카드·제목·안내 줄·두 버튼 상자는 0px 도 안 바뀐다(레이아웃·글자·버튼 위치 불변).
//   ② 멈춤 — GTO 판이 숨으면(다른 탭) 0회, 돌아오면 새 주기로 재개.
//   ③ reduced-motion — 0회(정적 그림만).
//   ④ 대비 — 빛 띠 한가운데가 제목·안내 줄·'내 스팟' 글자 위에 있을 때도 글자 대 배경 최악 픽셀이 AA(4.5:1) 이상(다크·라이트).
//      'btn-primary'('새 스팟 작성')는 불투명 파랑 면이 띠를 가려 대상이 아니다.
// 음성 대조(2026-10-09, build.md): 반복 시계를 '첫 회차만' 으로 되돌린 빌드 사본에서 ① 의 두 번째 회차 단언이 실패한다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack } from './_session';

const SHEEN = '[data-testid="spot-hero-sheen"]';
const PERIOD = 9000;

/** 빛 띠 그라디언트의 이동량(gradientTransform — 카드는 rAF 30fps 로 속성을 직접 쓴다, SpotHeroSheen 머리말) */
const sheenX = (page: Page) => page.evaluate(() => {
  const t = (document.querySelector('[data-testid="spot-hero-sheen"] linearGradient') as SVGLinearGradientElement | null)?.gradientTransform.animVal;
  return t && t.numberOfItems ? t.getItem(0).matrix.e : null;
});
/** 대기 위치(SpotHeroSheen REST) — 띠 전체가 카드 왼쪽 밖 */
const REST_X = -260;
/** 카드·제목·안내 줄·두 버튼 상자 */
const cardBoxes = (page: Page) => page.getByTestId('spot-hero').evaluate((el) =>
  [el, ...el.querySelectorAll('p, button')].map((e) => {
    const r = e.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].join(',');
  }));
const maxSheenX = async (page: Page, ms: number) => {
  let max = -Infinity;
  for (let t = 0; t < ms; t += 100) {
    max = Math.max(max, (await sheenX(page)) ?? -Infinity);
    await page.waitForTimeout(100);
  }
  return max;
};
const gotoTab = (page: Page, tab: string) => page.evaluate((t) => {
  window.location.hash = '';
  window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: t }));
}, tab);

async function openTools(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 저장소 차단 */ } }, theme);
  await page.setViewportSize({ width: 390, height: 844 });
  await stabilizeBackstack(page);
  await page.goto('/?tab=tools');
  await expect(page.getByTestId('spot-hero')).toBeVisible({ timeout: 30_000 });
  await page.locator(SHEEN).waitFor({ state: 'attached' });
}

test.describe('NURI SPOT 카드 흐르는 빛(주기 반복)', () => {
  test('① 반복 — 첫 회차 → 대기 → 약 9초 뒤 두 번째 회차 · 카드 상자 불변', async ({ page }) => {
    test.setTimeout(60_000);
    await openTools(page);
    const rest = REST_X;
    const width = await page.getByTestId('spot-hero').evaluate((el) => el.getBoundingClientRect().width);
    expect(await sheenX(page), '빛 띠 그라디언트를 잡았다').not.toBeNull();
    const before = await cardBoxes(page);
    expect(before.length, '카드·제목·안내·버튼 2 를 잡았다').toBe(5);

    // 카드 한가운데를 지나는 중 — 띠가 실제로 카드 위에 있다
    const t0 = Date.now();
    await expect.poll(() => sheenX(page), { timeout: PERIOD + 4_000, intervals: [50] }).toBeGreaterThan(-width / 4);
    const t1 = Date.now();
    // 첫 회차는 탭에 들어온 직후(1.8s 뒤 시작)다 — 무언가에 거둬지면 다음 주기(≈11s)로 밀린다
    expect(t1 - t0, `첫 회차 관측까지 ${t1 - t0}ms`).toBeLessThan(5_000);
    const mid1 = await cardBoxes(page);
    await expect.poll(() => sheenX(page), { timeout: 4_000, intervals: [50] }).toBeLessThanOrEqual(rest);
    await expect.poll(() => sheenX(page), { timeout: PERIOD + 4_000, intervals: [50] }).toBeGreaterThan(-width / 4);
    const gap = Date.now() - t1;
    const mid2 = await cardBoxes(page);
    expect(gap, `두 회차 간격 ${gap}ms`).toBeGreaterThan(PERIOD - 1_500);
    expect(gap).toBeLessThan(PERIOD + 2_500);
    expect(mid1).toEqual(before);
    expect(mid2).toEqual(before);
    // 카드 안 CSS·WAAPI 애니메이션은 여전히 0 — 빛은 SVG 그라디언트 속성으로만 움직인다(합성층 0)
    expect(await page.getByTestId('spot-hero').evaluate((el) =>
      el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)).toBe(0);
  });

  test('② GTO 판이 숨으면 0회 · 돌아오면 재개', async ({ page }) => {
    test.setTimeout(60_000);
    await openTools(page);
    const rest = REST_X;
    await expect.poll(() => sheenX(page), { timeout: PERIOD + 4_000, intervals: [50] }).toBeGreaterThan(rest + 40); // 먼저 실제로 돈다
    await gotoTab(page, 'browse');
    await expect(page.getByTestId('spot-hero')).toBeHidden();
    // IntersectionObserver 통지는 다음 프레임에 온다 — 짧게 기다려 거둔 것을 확인한다
    await expect.poll(() => sheenX(page), { timeout: 1_000, intervals: [20], message: '판이 숨은 뒤에도 띠가 카드 위에 있다' }).toBeLessThanOrEqual(rest);
    expect(await maxSheenX(page, PERIOD + 2_000), '숨은 GTO 판에서 회차가 돌았다').toBeLessThanOrEqual(rest);
    await gotoTab(page, 'tools');
    await expect(page.getByTestId('spot-hero')).toBeVisible();
    await expect.poll(() => sheenX(page), { timeout: 5_000, intervals: [50] }).toBeGreaterThan(rest + 40); // 새 주기 첫 회차(1.8s 뒤)
  });

  test('③ reduced-motion — 0회(정적 그림만)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openTools(page);
    const rest = REST_X;
    expect(await sheenX(page), '대기 위치를 실제로 읽었다').toBe(rest);
    expect(await maxSheenX(page, 4_000), '동작 줄이기인데 띠가 움직였다').toBeLessThanOrEqual(rest); // 첫 회차(1.8s)·수명(2.8s)을 덮는 창
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`④ ${theme} — 띠 한가운데가 글자 위일 때도 대비 AA`, async ({ page }) => {
      // 동작 줄이기로 반복을 세워 두고(정적 측정), 띠 위치는 그라디언트 기본값으로 직접 놓는다.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openTools(page, theme);
      const card = page.getByTestId('spot-hero');
      // 위쪽 데이터가 들어와 카드가 밀리는 동안은 재지 않는다 — 카드 위치가 1초 동안 그대로일 때까지
      let last = '';
      await expect.poll(async () => {
        const b = JSON.stringify(await card.boundingBox());
        const same = b === last;
        last = b;
        return same;
      }, { timeout: 15_000, intervals: [1_000] }).toBe(true);
      const targets = [
        ['제목', 'p:not([data-testid])'],
        ['안내 줄', '[data-testid="spot-hero-ai"]'],
        ['내 스팟', 'button:nth-of-type(2)'],
      ] as const;
      const report: string[] = [];
      for (const [label, sel] of targets) {
        // 글자색은 손대기 전에 한 번만 읽고, 색 전환(transition)을 끈다 — 투명→원래 색이 전환으로 번지는 동안 읽으면
        //   반투명 글자색·반쯤 남은 글자 픽셀로 대비가 엉뚱하게 나왔다(실측 1.43·16.69·3.20)
        const color = await card.evaluate((el, s) => {
          const t = el.querySelector(s) as HTMLElement;
          t.style.setProperty('transition', 'none', 'important');
          return getComputedStyle(t).color;
        }, sel);
        for (const placed of [false, true]) {
          // 띠 가운데를 글자 Range 사각형 중심에 놓는 이동량
          const geo = await card.evaluate((el, s) => {
            const range = document.createRange();
            range.selectNodeContents(el.querySelector(s)!);
            const r = range.getBoundingClientRect();
            const svg = el.querySelector('[data-testid="spot-hero-sheen"]')!.getBoundingClientRect();
            const cx = r.x + r.width / 2 - svg.x, cy = r.y + r.height / 2 - svg.y;
            return { tx: cx - (0.5 * (140 * 140 + 50 * 50) + 50 * cy) / 140 };
          }, sel);
          await card.evaluate((el, a) => {
            const g = el.querySelector('[data-testid="spot-hero-sheen"] linearGradient')!;
            if (a.placed) g.setAttribute('gradientTransform', `translate(${a.tx} 0)`);
            else g.setAttribute('gradientTransform', 'translate(-260 0)');
            (el.querySelector(a.sel) as HTMLElement).style.setProperty('color', 'transparent', 'important');
          }, { placed, tx: geo.tx, sel });
          // 스타일을 바꾼 프레임이 실제로 그려진 뒤에 찍는다
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          // 찍기 직전에 글자 사각형을 다시 잰다(clip 은 화면 좌표)
          const at = await card.evaluate((el, s) => {
            const range = document.createRange();
            range.selectNodeContents(el.querySelector(s)!);
            const r = range.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }, sel);
          const png = await page.screenshot({ clip: at });
          await card.evaluate((el, s) => (el.querySelector(s) as HTMLElement).style.removeProperty('color'), sel);
          const min = await page.evaluate(async ({ b64, color }) => {
            const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
            const L = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
            // 글자색 문자열(rgb·oklab 무엇이든)을 캔버스에 칠해 8비트 sRGB 로 읽는다
            const one = new OffscreenCanvas(1, 1).getContext('2d')!;
            one.fillStyle = color;
            one.fillRect(0, 0, 1, 1);
            const [r0, g0, b0] = one.getImageData(0, 0, 1, 1).data;
            const lt = L(r0, g0, b0);
            const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
            const cv = new OffscreenCanvas(bmp.width, bmp.height);
            const cx = cv.getContext('2d')!;
            cx.drawImage(bmp, 0, 0);
            const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
            let worst = Infinity;
            for (let i = 0; i < d.length; i += 4) {
              const lb = L(d[i], d[i + 1], d[i + 2]);
              worst = Math.min(worst, (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
            }
            return worst;
          }, { b64: png.toString('base64'), color });
          report.push(`${label} ${placed ? '띠 위' : '대기'} ${min.toFixed(2)}`);
          expect(min, `${theme} ${label}(${placed ? '빛 띠 한가운데' : '대기'}) 글자 대 배경 최악 대비 ${min.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        }
      }
      test.info().annotations.push({ type: 'contrast', description: `${theme}: ${report.join(' · ')}` });
      console.log(`[contrast ${theme}] ${report.join(' · ')}`);
    });
  }
});
