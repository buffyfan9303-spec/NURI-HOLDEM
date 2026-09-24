// NURI SPOT '스팟 작성' ↔ '내 스팟' 전환 — 두 판 유지(SPOT-MYSPOT-JANK, 오너 신고 2026-09-24)
//
// 잠그는 것
//  ① 작성 3단계(카드)에서 목록을 3번 왕복해도 단계가 '카드' 그대로다(예전: 매번 1단계 '게임' 으로 초기화 — 기능 결함)
//  ② 목록은 보일 때마다 **한 번만** 조용히 다시 읽는다 — 두 번째 진입부터 스켈레톤([aria-busy=true]) 0
//  ③ 다시 보일 때 목록 판 높이가 계단지지 않는다(스켈레톤 307px → 행 745px 이던 자리)
//  ④ 목록 스크롤이 왕복 뒤에도 그대로다(예전: 스켈레톤이 매번 0 으로 깎았다)
//
// ⚠ 운영 무접촉: stubLogin + spot_reviews·spot_ai_reviews GET 목킹. _fixtures 가 나머지 쓰기를 끊는다.
// ⚠ 탭은 page.evaluate 로 누른다 — locator.click() 은 대상까지 자동 스크롤해 스크롤 측정을 오염시킨다.
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const CARDS = [['As', 'Kd'], ['Qh', 'Qc'], ['7s', '8s'], ['Ah', '5h'], ['Jc', 'Td'], ['9d', '9s'], ['Kc', 'Qs'], ['6h', '7h'], ['Ad', 'Jd'], ['2c', '2d']];
const ROWS = CARDS.map((hero, i) => ({
  id: `00000000-0000-4000-8000-00000000${100 + i}`, coverage_kind: 'math_only', source_label: null, dataset_version: 'v1',
  created_at: new Date(Date.UTC(2026, 8, 20, 12 - i)).toISOString(),
  spot: { v: 3, game: 'nlhe', format: 'mtt', tableSize: 6, sbBb: 0.5, anteBb: 0, effectiveBb: 40, heroPos: 'BTN', villainPos: 'BB',
    hero, villain: [], board: [], street: 'preflop', actions: [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }], heroAction: 'raise', heroActionSizeBb: 3 },
}));

test('🔴 작성↔내 스팟 3왕복 — 단계 유지 · 재조회 1회 · 스켈레톤 0 · 높이 계단 0 · 스크롤 보존', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubLogin(page);
  await stabilizeBackstack(page);
  let listGets = 0;
  await page.route(/\/rest\/v1\/spot_reviews\?/, async (r) => {
    if (r.request().method() !== 'GET') return r.abort();
    listGets++;
    await new Promise((z) => setTimeout(z, 150));   // 운영 왕복처럼 늦게 — 스켈레톤이 있으면 반드시 보인다
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS) });
  });
  await page.route(/\/rest\/v1\/spot_ai_reviews\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('/?tab=tools');
  await dismissOverlays(page);
  await page.getByTestId('spot-hero').getByRole('button', { name: '새 스팟 작성' }).click();
  const dlg = page.getByRole('dialog').first();
  await expect(dlg.getByText('NURI SPOT', { exact: true })).toBeVisible({ timeout: 20_000 });

  const current = dlg.getByRole('group', { name: '입력 단계' }).locator('[aria-current="step"]');
  const nextBtn = dlg.locator('[data-spot-stepnav]').getByRole('button', { name: /^다음/ });
  await nextBtn.click();                                  // 게임·자리 → 카드
  await expect(current).toContainText('카드');

  const tap = (name: string) => page.evaluate((n) => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-testid="spot-primary-nav"] [role=tab]')].find((x) => x.textContent?.trim() === n);
    if (!b) throw new Error(`탭 없음: ${n}`);
    b.click();
  }, name);
  const box = () => page.evaluate(() => {
    const sc = document.querySelector<HTMLElement>('[role="dialog"] .overflow-y-auto');
    return sc ? Math.round(sc.scrollTop) : -1;
  });

  // 첫 진입 — 여기서만 스켈레톤·요청이 허용된다(dev StrictMode 는 첫 마운트 이펙트를 두 번 돌린다).
  await tap('내 스팟');
  const rows = dlg.getByRole('listitem');
  await expect(rows).toHaveCount(ROWS.length, { timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector<HTMLElement>('[role="dialog"] .overflow-y-auto')!.scrollTop = 240; });
  await page.waitForTimeout(100);
  const listScroll = await box();
  expect(listScroll, '목록을 내릴 만큼 길지 않다 — 측정이 빈 검사다').toBeGreaterThan(100);

  // 두 번째 진입부터: 스켈레톤 등장·목록 판 높이 변화를 프레임마다 기록한다.
  await page.evaluate(() => {
    const w = window as unknown as { __busy: number; __hs: number[] };
    w.__busy = 0; w.__hs = [];
    new MutationObserver(() => { if (document.querySelector('[role="dialog"] [aria-busy="true"]')) w.__busy++; })
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
  });

  for (let round = 1; round <= 3; round++) {
    await tap('스팟 작성');
    await expect(current, `${round}회차: 작성 단계가 초기화됐다`).toContainText('카드');
    await expect(dlg.locator('[data-spot-stepnav]'), `${round}회차: 하단 [이전][다음] 이 없다`).toBeVisible();
    await page.waitForTimeout(200);

    const before = listGets;
    await page.evaluate(() => {
      const w = window as unknown as { __hs: number[] };
      w.__hs = [];
      const t0 = performance.now();
      const step = () => {
        const ul = [...document.querySelectorAll<HTMLElement>('[role="dialog"] ul:has(> li)')].find((u) => u.offsetParent);
        w.__hs.push(ul ? Math.round(ul.getBoundingClientRect().height) : -1);
        if (performance.now() - t0 < 900) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await tap('내 스팟');
    await page.waitForTimeout(1000);
    await expect(rows, `${round}회차: 행 수가 달라졌다`).toHaveCount(ROWS.length);
    await expect(dlg.locator('[data-spot-stepnav]'), `${round}회차: 목록에 작성 하단 바가 떠 있다`).toBeHidden();
    expect(listGets - before, `${round}회차: 목록 재조회는 보일 때 정확히 1회`).toBe(1);
    const hs = await page.evaluate(() => (window as unknown as { __hs: number[] }).__hs.filter((h) => h >= 0));
    expect(hs.length, `${round}회차: 목록 판이 한 프레임도 안 보였다`).toBeGreaterThan(3);
    expect([...new Set(hs)], `${round}회차: 목록 높이가 계단졌다`).toHaveLength(1);
    expect(await box(), `${round}회차: 목록 스크롤이 보존되지 않았다`).toBe(listScroll);
  }
  expect(await page.evaluate(() => (window as unknown as { __busy: number }).__busy), '두 번째 진입부터 스켈레톤이 떴다').toBe(0);
});

test('🔴 목록의 공유·수정하기는 작성 판을 새로 연다 — 확인 시트는 한 번만, 탭 왕복으로 다시 안 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubLogin(page);
  await stabilizeBackstack(page);
  let shared = 0;
  await page.route(/\/rest\/v1\/rpc\/share_spot_post/, (r) => { shared++; return r.abort(); });
  await page.route(/\/rest\/v1\/spot_reviews\?/, (r) => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS.slice(0, 2)) })
    : r.abort());
  await page.route(/\/rest\/v1\/spot_ai_reviews\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/?tab=tools');
  await dismissOverlays(page);
  await page.getByTestId('spot-hero').getByRole('button', { name: '새 스팟 작성' }).click();
  const dlg = page.getByRole('dialog').first();
  await expect(dlg.getByText('NURI SPOT', { exact: true })).toBeVisible({ timeout: 20_000 });
  const current = dlg.getByRole('group', { name: '입력 단계' }).locator('[aria-current="step"]');
  const tab = (name: string) => dlg.getByRole('tab', { name, exact: true }).click();
  const sheet = page.locator('[data-share-confirm]');

  // 작성 판을 먼저 2단계로 옮겨 둔다 — 공유로 열면 이 상태가 아니라 새 판(확인 단계)이어야 한다.
  await dlg.locator('[data-spot-stepnav]').getByRole('button', { name: /^다음/ }).click();
  await expect(current).toContainText('카드');

  await tab('내 스팟');
  await dlg.getByRole('listitem').first().getByRole('button', { name: '게시판에 공유' }).click();
  await expect(current, '공유로 열었는데 확인 단계가 아니다').toContainText('확인');
  await expect(sheet, '공유 확인 시트가 열리지 않는다').toBeVisible({ timeout: 10_000 });
  await sheet.getByRole('button', { name: '취소', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });

  for (let i = 0; i < 2; i++) {
    await tab('내 스팟');
    await tab('스팟 작성');
    await expect(current).toContainText('확인');
    await page.waitForTimeout(300);
    await expect(sheet, '탭 왕복으로 확인 시트가 다시 열렸다').toBeHidden();
  }

  // 수정하기 — 확인 단계에 머물던 판이 아니라 새 판(1단계 게임)으로 연다.
  await tab('내 스팟');
  const row = dlg.getByRole('listitem').first();
  await row.getByRole('button', { name: '상세 보기' }).click();
  await row.getByRole('button', { name: '수정하기' }).click();
  await expect(current, '수정하기가 이전 판의 단계를 이어받았다').toContainText('게임');
  await expect(sheet).toBeHidden();
  expect(shared, '확인 없이 글이 올라갔다').toBe(0);
});
