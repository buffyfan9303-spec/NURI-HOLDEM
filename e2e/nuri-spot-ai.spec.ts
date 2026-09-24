// NURI SPOT 작성 A안 + 'AI 아쉬운 포인트' (2026-09-23 오너 결정 SPOT-WRITE-UX-AI)
//
// 잠그는 것
//  ① 네 단계(게임·자리/카드/액션/확인 — 2026-09-24 G3 합침) · 하단 고정 [이전][다음](44px, 창 바닥) · 체크는 [다음] 으로 확정한 단계에만
//  ② '작성 내용'(저장·공유·AI)은 확인 단계에만 선다
//  ③ AI 버튼 — 서버 status 가 꺼짐이면 없다 / 미완성 스팟이면 막힌다 / 완성이면 확인 시트 → 결과
//  ④ 코드별 안내(DAILY_LIMIT · AI_FAILED 환불)
//
// ⚠ 운영 무접촉: stubLogin + spot_ai_status·spot_reviews·spot-review 를 전부 가로챈다. _fixtures 가 나머지 쓰기를 끊는다.
//   기능은 라이브에서 꺼져 있다(shop_skus.spot_ai active=false) — 켜짐 상태는 status 목킹으로만 본다.
import { test, expect } from './_fixtures';
import type { Locator, Page, Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const SPOT_ID = '3f1c2b9e-2c1a-4d7e-9f00-1a2b3c4d5e6f';
const ON = { enabled: true, price: 30, used_today: 1, limit: 3, available: 48 };
const OFF = { enabled: false, price: null };
const AI_BODY = '1. 프리플랍 오픈 크기를 포지션에 맞춰 줄여 볼 수 있습니다.\n2. 드라이 보드에서는 작은 벳을 고려해 볼 수 있습니다.\n\n참고용 코칭이며 솔버 결과가 아닙니다.';

type FnHandler = (route: Route) => Promise<void>;

async function openSpot(page: Page, status: object, fn?: FnHandler) {
  await stubLogin(page, { activity_points: 48 });
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/rpc\/spot_ai_status/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }));
  // 같은 내용 행 조회(GET)는 빈 목록, 저장(POST)은 고정 id — 운영 spot_reviews 에 쓰지 않는다.
  await page.route(/\/rest\/v1\/spot_reviews/, (r) => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: SPOT_ID }) }));
  await page.route(/\/functions\/v1\/spot-review/, fn ?? ((r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: false, body: AI_BODY }) })));
  await page.goto('/?tab=tools');
  await dismissOverlays(page);
  await page.getByTestId('spot-hero').getByRole('button', { name: '새 스팟 작성' }).click();
  const dlg = page.getByRole('dialog').first();
  await expect(dlg.getByText('NURI SPOT', { exact: true })).toBeVisible({ timeout: 20_000 });
  return dlg;
}

const nav = (dlg: Locator) => dlg.locator('[data-spot-stepnav]');
const steps = (dlg: Locator) => dlg.getByRole('group', { name: '입력 단계' });
const next = (dlg: Locator) => nav(dlg).getByRole('button', { name: /^다음/ }).click();

/** 카드 2장 + 액션 1개 + 내 선택(레이즈 3BB) → 확인 단계 */
async function fillComplete(dlg: Locator) {
  await next(dlg);                                        // 게임·자리 → 카드
  await dlg.locator('button[data-card="As"]').click();
  await dlg.locator('button[data-card="Ks"]').click();
  await next(dlg);                                        // → 액션
  await dlg.getByRole('button', { name: '액션 추가' }).click();
  await dlg.getByRole('button', { name: '레이즈', exact: true }).last().click();   // '그때 나는'
  await dlg.getByRole('spinbutton').last().fill('3');
  await next(dlg);                                        // → 확인
}

for (const vp of [{ w: 390, h: 844 }, { w: 320, h: 640 }]) {
  test.describe(`A안 단계 작성 — ${vp.w}px`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: vp.w, height: vp.h }); });

    test('🔴 네 단계 · 하단 [이전][다음] 이 창 바닥에 붙고 44px · 가로 넘침 0', async ({ page }) => {
      const dlg = await openSpot(page, OFF);
      const labels = await steps(dlg).getByRole('button').allInnerTexts();
      expect(labels.map((t) => t.replace(/\s+/g, ''))).toEqual(['1게임·자리', '2카드', '3액션', '4확인']);

      await next(dlg);   // 가장 긴 카드 단계
      const m = await page.evaluate(() => {
        const bar = document.querySelector('[data-spot-stepnav]') as HTMLElement;
        const sc = bar.closest('.overflow-y-auto') as HTMLElement;
        sc.scrollTop = 400;   // 스크롤해도 바닥에 남는가
        const r = bar.getBoundingClientRect();
        const btns = [...bar.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height);
        const stepBar = document.querySelector('[data-spot-steps]') as HTMLElement;
        return {
          barBottom: r.bottom, vh: window.innerHeight, btns,
          scOverflowX: sc.scrollWidth - sc.clientWidth,
          stepOverflow: [...stepBar.querySelectorAll('button')].map((b) => b.scrollWidth - b.clientWidth),
          docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      console.log(`[${vp.w}] stepnav`, JSON.stringify(m));
      expect(Math.abs(m.barBottom - m.vh), '하단 바가 창 바닥에 붙지 않았다').toBeLessThanOrEqual(1);
      for (const h of m.btns) expect(h, '하단 버튼이 44px 미만').toBeGreaterThanOrEqual(44);
      expect(m.scOverflowX, '창 가로 넘침').toBeLessThanOrEqual(0);
      expect(m.docOverflowX, '문서 가로 넘침').toBeLessThanOrEqual(0);
      for (const o of m.stepOverflow) expect(o, '단계 칸 글자가 넘친다').toBeLessThanOrEqual(0);

      // 끝까지 내려도 마지막 줄(임시 저장 안내)이 바에 가려지지 않는다 — 가장 긴 확인 단계에서
      await steps(dlg).getByRole('button', { name: /확인/ }).click();
      await page.waitForTimeout(300);
      const gap = await page.evaluate(() => {
        const bar = document.querySelector('[data-spot-stepnav]') as HTMLElement;
        const sc = bar.closest('.overflow-y-auto') as HTMLElement;
        sc.scrollTop = sc.scrollHeight;
        const last = [...document.querySelectorAll('[aria-live="polite"]')].pop() as HTMLElement;
        return bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
      });
      console.log(`[${vp.w}] last-line gap`, gap);
      expect(gap, '마지막 줄이 하단 바에 가려진다').toBeGreaterThanOrEqual(0);
    });

    test('🔴 체크는 [다음] 으로 확정한 단계에만 · 작성 내용은 확인 단계에만', async ({ page }) => {
      const dlg = await openSpot(page, OFF);
      await expect(steps(dlg).getByLabel('완료'), '아무것도 안 했는데 체크가 있다').toHaveCount(0);
      await expect(dlg.getByLabel('작성 내용'), '입력 단계에 작성 내용이 보인다').toHaveCount(0);
      await next(dlg);
      await expect(steps(dlg).locator('[aria-current="step"]')).toContainText('카드');
      await expect(steps(dlg).getByRole('button').nth(0).getByLabel('완료')).toHaveCount(1);
      await expect(steps(dlg).getByLabel('완료'), '확정 안 한 단계에 체크').toHaveCount(1);
      // 단계바로 건너뛰면 확정이 아니다
      await steps(dlg).getByRole('button', { name: /확인/ }).click();
      await expect(dlg.getByLabel('작성 내용')).toBeVisible();
      await expect(steps(dlg).getByLabel('완료')).toHaveCount(1);
      // 저장·공유 버튼은 그대로(기능 보존)
      await expect(dlg.getByRole('button', { name: /내 스팟에 저장/ })).toBeVisible();
      await expect(dlg.getByRole('button', { name: /스팟 토론에 공유/ })).toBeVisible();
      await nav(dlg).getByRole('button', { name: /이전/ }).click();
      await expect(dlg.getByLabel('작성 내용')).toHaveCount(0);
    });
  });
}

test.describe('AI 아쉬운 포인트', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 서버가 꺼짐이면 AI 버튼 자체가 없다', async ({ page }) => {
    const dlg = await openSpot(page, OFF);
    await fillComplete(dlg);
    await expect(dlg.getByLabel('작성 내용')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(dlg.getByTestId('spot-ai')).toHaveCount(0);
  });

  test('🔴 미완성 스팟에서는 AI 버튼이 막히고, 저장·공유는 막히지 않는다', async ({ page }) => {
    const dlg = await openSpot(page, ON);
    await steps(dlg).getByRole('button', { name: /확인/ }).click();
    await expect(dlg.getByTestId('spot-ai-meta')).toHaveText('30P · 오늘 1/3 · 사용 가능 48P→18P');
    await expect(dlg.getByTestId('spot-ai-open'), '미완성인데 AI 가 열린다').toBeDisabled();
    await expect(dlg.getByTestId('spot-ai-missing')).toContainText('내 카드 2장');
    await expect(dlg.getByRole('button', { name: /내 스팟에 저장/ })).toBeEnabled();
  });

  test('🔴 완성 스팟 → 확인 시트 → spotId 하나만 보내고 결과를 보여 준다(공유 본문에는 없다)', async ({ page }) => {
    let sent: unknown = null;
    const dlg = await openSpot(page, ON, async (r) => {
      sent = r.request().postDataJSON();
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: false, body: AI_BODY }) });
    });
    await fillComplete(dlg);
    const open = dlg.getByTestId('spot-ai-open');
    await expect(open).toBeEnabled();
    await open.click();
    const sheet = page.locator('[data-spot-ai-confirm]');
    await expect(sheet).toContainText('30P 가 차감됩니다');
    await sheet.getByTestId('spot-ai-confirm').click();
    await expect(dlg.getByTestId('spot-ai-result')).toContainText('드라이 보드');
    expect(sent).toEqual({ spotId: SPOT_ID });
    await expect(dlg.getByTestId('spot-ai-meta')).toHaveText('30P · 오늘 2/3 · 사용 가능 18P (부족)');
    // 공유 확인 시트의 본문에는 AI 코칭이 없다
    await dlg.getByRole('button', { name: '스팟 토론에 공유' }).click();
    await expect(page.locator('[data-share-preview]')).toBeVisible();
    await expect(page.locator('[data-share-preview]')).not.toContainText('드라이 보드');
  });

  for (const [code, status, text] of [
    ['DAILY_LIMIT', 409, '3회를 모두 썼어요'],
    ['AI_FAILED', 502, '포인트를 돌려드렸어요'],
  ] as const) {
    test(`🔴 ${code} 안내`, async ({ page }) => {
      const dlg = await openSpot(page, ON, (r) =>
        r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'x', code }) }));
      await fillComplete(dlg);
      await dlg.getByTestId('spot-ai-open').click();
      await page.locator('[data-spot-ai-confirm]').getByTestId('spot-ai-confirm').click();
      await expect(page.getByText(text).first()).toBeVisible();
      await expect(dlg.getByTestId('spot-ai-result')).toHaveCount(0);
    });
  }
});
