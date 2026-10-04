// NURI SPOT 작성 A안 + 'AI 아쉬운 포인트' (2026-09-23 오너 결정 SPOT-WRITE-UX-AI)
//
// 잠그는 것
//  ① 네 단계(게임·자리/카드/액션/확인 — 2026-09-24 G3 합침) · 하단 고정 [이전][다음](44px, 창 바닥) · 체크는 [다음] 으로 확정한 단계에만
//  ② '작성 내용'(저장·공유·AI)은 확인 단계에만 선다
//  ③ AI 버튼 — 서버 status 가 꺼짐이면 없다 / 미완성 스팟이면 막힌다 / 완성이면 확인 시트 → 결과
//  ④ 코드별 안내(DAILY_LIMIT · AI_FAILED 환불)
//  ⑤ (2026-10-04 오너: 30P 유지 + 하루 3회) GTO 탭 NURI SPOT 카드의 AI 안내 한 줄 · 포인트 부족 이유(보유·필요)와 모으는 길 ·
//     이미 받은 코칭은 시트 없이 '다시 보기 (무료)'(서버도 같은 스냅샷은 한도·포인트 검사 전에 무료)
//
// ⚠ 운영 무접촉: stubLogin + spot_ai_status·spot_reviews·spot_ai_reviews·spot-review 를 전부 가로챈다. _fixtures 가 나머지 쓰기를 끊는다.
//   기능은 **라이브에서 켜져 있다**(2026-10-04 실측: shop_skus.spot_ai active=true · price 30). 여기서는 status 목킹으로 상태를 고른다.
import { test, expect } from './_fixtures';
import type { Locator, Page, Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const SPOT_ID = '3f1c2b9e-2c1a-4d7e-9f00-1a2b3c4d5e6f';
const ON = { enabled: true, price: 30, used_today: 1, limit: 3, available: 48 };
const OFF = { enabled: false, price: null };
const AI_BODY = '1. 프리플랍 오픈 크기를 포지션에 맞춰 줄여 볼 수 있습니다.\n2. 드라이 보드에서는 작은 벳을 고려해 볼 수 있습니다.\n\n참고용 코칭이며 솔버 결과가 아닙니다.';

type FnHandler = (route: Route) => Promise<void>;

/** prior: 저장된 같은 스팟에 끝난 코칭이 이미 있다(내 스팟에서 다시 연 경우). */
/** status 가 함수면 매 호출마다 서버의 '지금' 상태를 돌려준다(다른 탭·성공 뒤 재조회를 흉내). */
async function openSpot(page: Page, status: object | (() => object), fn?: FnHandler, opts: { prior?: boolean } = {}) {
  await stubLogin(page, { activity_points: 48 });
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/rpc\/spot_ai_status/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(typeof status === 'function' ? status() : status) }));
  // 같은 내용 행 조회(GET)는 빈 목록, 저장(POST)은 고정 id — 운영 spot_reviews 에 쓰지 않는다.
  await page.route(/\/rest\/v1\/spot_reviews/, (r) => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: opts.prior ? JSON.stringify([{ id: SPOT_ID }]) : '[]' })
    : r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: SPOT_ID }) }));
  await page.route(/\/rest\/v1\/spot_ai_reviews/, (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: opts.prior ? JSON.stringify([{ spot_review_id: SPOT_ID, body: AI_BODY, created_at: '2026-10-04T01:00:00Z' }]) : '[]' }));
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
    let srv = { ...ON };   // 서버의 지금 상태 — 성공하면 서버가 30P 를 쓴다
    const dlg = await openSpot(page, () => srv, async (r) => {
      sent = r.request().postDataJSON();
      srv = { ...srv, used_today: 2, available: 18 };
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: false, body: AI_BODY, free: false, free_left: 0 }) });
    });
    await fillComplete(dlg);
    const open = dlg.getByTestId('spot-ai-open');
    await expect(open).toBeEnabled();
    await open.click();
    const sheet = page.locator('[data-spot-ai-confirm]');
    await expect(sheet).toContainText('30P가 차감됩니다');
    await sheet.getByTestId('spot-ai-confirm').click();
    await expect(dlg.getByTestId('spot-ai-result')).toContainText('드라이 보드');
    expect(sent).toEqual({ spotId: SPOT_ID });
    await expect(dlg.getByTestId('spot-ai-meta')).toHaveText('30P · 오늘 2/3 · 사용 가능 18P (부족)');
    // 공유 확인 시트의 본문에는 AI 코칭이 없다
    await dlg.getByRole('button', { name: '스팟 토론에 공유' }).click();
    await expect(page.locator('[data-share-preview]')).toBeVisible();
    await expect(page.locator('[data-share-preview]')).not.toContainText('드라이 보드');
  });

  test('🔴 GTO 탭 NURI SPOT 카드가 AI 코칭(첫 3회 무료 · 이후 30P · 하루 3회)을 알린다 — 카드는 여전히 첫 화면을 다 먹지 않는다', async ({ page }) => {
    await stubLogin(page, { activity_points: 48 });
    await stabilizeBackstack(page);
    await page.goto('/?tab=tools');
    await dismissOverlays(page);
    const hero = page.getByTestId('spot-hero');
    await expect(hero.getByTestId('spot-hero-ai')).toHaveText('AI 코칭 첫 3회 무료 · 이후 회당 30P · 하루 3회');
    const box = await hero.boundingBox();
    expect(box!.height, `대표 카드가 ${box!.height}px`).toBeLessThan(200);
    const over = await hero.getByTestId('spot-hero-ai').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(over, '안내 줄이 넘친다').toBeLessThanOrEqual(0);
  });

  test('🔴 무료 회차가 남으면 포인트가 0 이어도 열리고 "무료 n/3 남음" · 시트는 무료로 받기 · 성공하면 무료가 하나 준다', async ({ page }) => {
    let srv = { enabled: true, price: 30, used_today: 0, limit: 3, available: 0, free_limit: 3, free_left: 2 };
    const dlg = await openSpot(page, () => srv, async (r) => {
      srv = { ...srv, used_today: 1, free_left: 1 };
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: false, body: AI_BODY, free: true, free_left: 1 }) });
    });
    await fillComplete(dlg);
    await expect(dlg.getByTestId('spot-ai-meta')).toHaveText('무료 2/3 남음 · 오늘 0/3');
    const open = dlg.getByTestId('spot-ai-open');
    await expect(open).toHaveText('AI 아쉬운 포인트 보기 (무료 2/3 남음)');
    await expect(open).toBeEnabled();
    await expect(dlg.getByTestId('spot-ai-poor'), '무료가 남았는데 포인트 부족을 말한다').toHaveCount(0);
    await open.click();
    const sheet = page.locator('[data-spot-ai-confirm]');
    await expect(sheet).toContainText('포인트가 들지 않습니다');
    await expect(sheet).not.toContainText('차감됩니다');
    await sheet.getByTestId('spot-ai-confirm').click();
    await expect(dlg.getByTestId('spot-ai-result')).toContainText('드라이 보드');
    await expect(dlg.getByTestId('spot-ai-meta')).toHaveText('무료 1/3 남음 · 오늘 1/3');
  });

  // critical P3(2026-10-04): status 를 화면 처음에만 받으면 다른 탭에서 마지막 무료를 쓴 뒤에도 '무료로 코칭 받기' 가 뜨고
  //   서버는 30P 를 쓴다. 시트를 열 때 서버 상태로 다시 맞춘다 — 수정 전 빌드에서 FAIL, 수정 뒤 PASS 확인.
  test('🔴 다른 탭에서 무료를 다 쓰면 시트가 30P 안내로 바뀐다(화면 첫 조회값을 믿지 않는다)', async ({ page }) => {
    let srv = { enabled: true, price: 30, used_today: 0, limit: 3, available: 48, free_limit: 3, free_left: 1 };
    let calls = 0;
    const dlg = await openSpot(page, () => srv, async (r) => {
      calls++;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: false, body: AI_BODY, free: false, free_left: 0 }) });
    });
    await fillComplete(dlg);
    await expect(dlg.getByTestId('spot-ai-meta')).toHaveText('무료 1/3 남음 · 오늘 0/3');
    // 다른 탭(같은 계정)에서 마지막 무료를 썼다
    srv = { ...srv, used_today: 1, free_left: 0 };
    await dlg.getByTestId('spot-ai-open').click();
    const sheet = page.locator('[data-spot-ai-confirm]');
    await expect(sheet).toContainText('30P가 차감됩니다');
    await expect(sheet).not.toContainText('포인트가 들지 않습니다');
    await expect(sheet.getByTestId('spot-ai-confirm')).toHaveText('30P로 코칭 받기');
    await expect(dlg.getByTestId('spot-ai-meta')).toHaveText('30P · 오늘 1/3 · 사용 가능 48P→18P');
    expect(calls, '시트만 열었는데 서버를 불렀다').toBe(0);
  });

  test('🔴 시트를 띄운 사이 무료가 소진되면 무료로 받지 않고 멈춰 30P 시트로 다시 묻는다', async ({ page }) => {
    let srv = { enabled: true, price: 30, used_today: 0, limit: 3, available: 48, free_limit: 3, free_left: 1 };
    let calls = 0;
    const dlg = await openSpot(page, () => srv, async (r) => {
      calls++;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: false, body: AI_BODY, free: false, free_left: 0 }) });
    });
    await fillComplete(dlg);
    await dlg.getByTestId('spot-ai-open').click();
    const sheet = page.locator('[data-spot-ai-confirm]');
    await expect(sheet.getByTestId('spot-ai-confirm')).toHaveText('무료로 코칭 받기');
    srv = { ...srv, used_today: 1, free_left: 0 };   // 시트가 떠 있는 동안 다른 탭에서 마지막 무료 사용
    await sheet.getByTestId('spot-ai-confirm').click();
    await expect(sheet.getByTestId('spot-ai-confirm')).toHaveText('30P로 코칭 받기');
    await expect(sheet).toContainText('30P가 차감됩니다');
    expect(calls, '무료로 보여 준 시트에서 서버(과금 가능)를 불렀다').toBe(0);
  });

  test('🔴 포인트가 모자라면 버튼 아래에 이유(보유·필요)와 모으는 길을 말한다', async ({ page }) => {
    const dlg = await openSpot(page, { enabled: true, price: 30, used_today: 0, limit: 3, available: 9 });
    await fillComplete(dlg);
    await expect(dlg.getByTestId('spot-ai-open')).toBeDisabled();
    const poor = dlg.getByTestId('spot-ai-poor');
    await expect(poor).toContainText('보유 9P · 필요 30P');
    await expect(poor).toContainText('접속·글쓰기·댓글');
  });

  test('🔴 이미 코칭받은 스팟은 시트 없이 "다시 보기 (무료)" — 한도·포인트가 바닥이어도 열리고 서버를 부르지 않는다', async ({ page }) => {
    let calls = 0;
    const dlg = await openSpot(page, { enabled: true, price: 30, used_today: 3, limit: 3, available: 9 }, async (r) => {
      calls++;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: true, body: AI_BODY }) });
    }, { prior: true });
    await fillComplete(dlg);
    const open = dlg.getByTestId('spot-ai-open');
    await expect(open).toHaveText('AI 코칭 다시 보기 (무료)');
    await expect(open).toBeEnabled();
    await expect(dlg.getByTestId('spot-ai-result')).toContainText('드라이 보드');
    await expect(dlg.getByTestId('spot-ai-poor'), '받은 코칭을 다시 보는데 포인트 부족을 말한다').toHaveCount(0);
    await open.click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-spot-ai-confirm]'), '무료 다시 보기인데 차감 시트가 뜬다').toHaveCount(0);
    expect(calls, '다시 보기가 서버(spot-review)를 불렀다').toBe(0);
  });

  for (const [code, status, text] of [
    ['DAILY_LIMIT', 409, '3회를 모두 사용했습니다'],
    ['AI_FAILED', 502, '포인트를 돌려 드렸습니다'],
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
