// 내 매장 — 단계 바 하나로 왕복하는가.
//
// 막는 결함 ①(오너 2026-09-07): VenueManageTab 의 '내 매장 탭 재탭 → 대시보드' 효과가 deps 에
//   gotoSection 을 갖고 있었다. gotoSection ← firstSettingsTab ← canSettingsTab ← idOn(이용권
//   킬스위치, **비동기 도착**). 사용자가 장부·클락으로 옮긴 **뒤** 그 값이 도착하면 함수 정체성이
//   바뀌고 효과가 다시 돌아 화면이 대시보드로 되돌아갔다. 누르지도 않았는데.
//   그래서 이 스펙은 '이동 직후'가 아니라 **비동기가 다 도착한 뒤**를 본다 — 결함이 사는 창이다.
//
// 막는 결함 ②(오너 2026-09-08 "2번으로 통일시켜서 한 페이지에서 왔다갔다"):
//   단계 바가 **두 벌**이었다 — 대시보드엔 숫자 스트립, 게임 진행엔 알약 바. 스트립을 누르면
//   알약 바가 있는 다른 화면으로 넘어가, 거기서 또 눌러야 했다. 지금은 한 벌이고 대시보드에서도
//   같은 자리에 있다. 이 스펙이 그 '한 벌'과 '왕복'을 잠근다.
import { test, expect } from './_fixtures';
import { loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const BAR = '[aria-label="매장 단계 이동"]';
const TAB = `${BAR} [role=tab]`;

/** 지금 활성인 알약의 글자. 요약이 활성이면 '요약' — 즉 대시보드를 보고 있다는 뜻이다. */
const activeTab = (page: import('@playwright/test').Page) =>
  page.locator(`${TAB}[aria-selected="true"]`).textContent();

async function openStore(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, EMAIL!, PASSWORD!);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // ⚠ '내 매장'은 ≥lg 에서 role=tab, 모바일에서 button 이다 — 한쪽만 쓰면 조용히 skip 된다.
  const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
  if (await store.count() === 0) return false;
  await store.first().click();
  await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  return true;
}

test.describe('내 매장 — 이동 안정성', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 없음');

  test('🔴 게임 스텝으로 이동한 뒤 비동기 해제가 도착해도 대시보드로 되돌아가지 않는다', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await openStore(page)), '내 매장 없음');

    // 대시보드가 그려지자마자(= 비동기들이 아직 도착 중일 때) 곧바로 이동한다 — 결함이 사는 창.
    const clock = page.locator(TAB).filter({ hasText: '클락' });
    await clock.first().waitFor({ timeout: 20_000 });
    await clock.first().click();

    // 비동기(권한·킬스위치·프리셋)가 전부 도착할 시간을 준 뒤에도 그 자리인지.
    await page.waitForTimeout(6000);
    const active = await activeTab(page);
    console.log('[nav] active =', JSON.stringify(active));
    expect(await page.locator(BAR).isVisible(), '단계 바가 사라졌다').toBe(true);
    expect(active, '이동한 뒤 대시보드(요약)로 되돌아갔다 — homeNonce 효과가 누르지 않았는데 돌고 있다').not.toContain('요약');
    expect(active, '활성 탭이 클락이 아니다').toContain('클락');
  });

  test('단계 바 각 단계가 그 판으로 전환된다(대시보드로 튀지 않는다)', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await openStore(page)), '내 매장 없음');
    await page.waitForTimeout(2500);
    await expect(page.locator(BAR)).toBeVisible({ timeout: 20_000 });

    for (const name of ['포스터', '클락', '순위', '장부']) {
      const tab = page.locator(TAB).filter({ hasText: name });
      if (await tab.count() === 0) continue;
      await tab.first().click();
      await page.waitForTimeout(1500);
      const active = await activeTab(page);
      expect(active, `${name} 를 눌렀는데 활성 탭이 «${active}» 다`).toContain(name);
    }
  });

  test('한 바에서 왕복한다 — 단계 → 요약 → 다른 단계로 가는 동안 바가 계속 같은 자리에 있다', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await openStore(page)), '내 매장 없음');
    await page.waitForTimeout(2500);
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible({ timeout: 20_000 });

    // 바의 세로 위치가 왕복 내내 흔들리지 않아야 "페이지를 옮긴 게 아니라 판만 바뀐다"로 읽힌다.
    const topOf = async () => Math.round((await bar.boundingBox())!.y);
    const tops = [await topOf()];

    for (const name of ['클락', '요약', '순위', '요약']) {
      const tab = page.locator(TAB).filter({ hasText: name });
      if (await tab.count() === 0) continue;
      await tab.first().click();
      await page.waitForTimeout(1200);
      await expect(bar, `${name} 로 간 뒤 단계 바가 사라졌다 — 다른 페이지로 넘어간 것이다`).toBeVisible();
      expect(await activeTab(page), `${name} 를 눌렀는데 활성이 다르다`).toContain(name);
      tops.push(await topOf());
    }
    console.log('[왕복] 바 top =', JSON.stringify(tops));
    // 단계 바는 **모든 섹션에서 맨 위 고정**이다(2026-09-08). 예전엔 게임 화면에만 있는 문맥 줄
    //   (매장 › 날짜 › 게임)이 바보다 위에 있어 대시보드 239 ↔ 게임 268 로 29px 튀었다.
    //   바를 그 줄 위로 올려 0 으로 만들었으니, 여기서 다시 벌어지면 그 배치가 되돌아간 것이다.
    const spread = Math.max(...tops) - Math.min(...tops);
    expect(spread, `왕복 중 단계 바가 ${spread}px 움직였다 — 문맥 줄이 다시 바 위로 올라갔는지 보라`).toBeLessThanOrEqual(4);
  });

  // F03(2026-09-10 감사): 내 매장 섹션 겹(useBackClose)이 tabActive 로 게이트되지 않았다. 이 탭은 keep-alive 라
  //   섹션에 들어간 뒤 하단 '홈'을 눌러도 숨은 내 매장이 겹을 계속 들고 있었고, 홈에서 뒤로가기를 누르면
  //   보이지 않는 곳에서 gotoSection('dashboard') 만 돌고 화면은 그대로 — 두 번이 통째로 죽었다.
  //   (nav-stability J-1 과 같은 기전. 커뮤니티 탭은 `active &&` 로 고쳐져 있었고 내 매장만 빠져 있었다.)
  test('🔴 섹션에 들어간 뒤 홈 탭을 누르면 숨은 내 매장이 뒤로가기 겹을 들고 있지 않다', async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!(await openStore(page)), '내 매장 없음');
    // 겹이 하나라도 남아 있으면 history 현재 항목에 __layer 토큰이 찍힌다(backstack.spec · nav-stability J-1 과 같은 단언).
    const layerOf = () => page.evaluate(() => {
      const st = history.state as { __layer?: number } | null;
      return st && typeof st.__layer === 'number' ? st.__layer : 0;
    });
    const clock = page.locator(TAB).filter({ hasText: '클락' });
    await clock.first().waitFor({ timeout: 20_000 });
    await clock.first().click();
    await page.waitForTimeout(1500);
    // 전제: 섹션 겹이 실제로 올라가 있다 — 0 이면 아래 단언이 공허하다.
    expect(await layerOf(), '클락 섹션이 뒤로가기 겹을 등록하지 않았다 — 전제부터 어긋남').not.toBe(0);

    await page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: '홈', exact: true }).click();
    await expect(page.locator('[data-tab="home"]')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600); // dead-tail 정리(go(-k))가 반영될 시간 — backstack.spec 과 같은 대기
    // ⚠ 뒤로가기를 실제로 누르면 정상일 때 앱을 벗어나 페이지가 닫힌다 — 토큰으로 본다.
    expect(await layerOf(), '보이지도 않는 내 매장이 뒤로가기 겹을 들고 있다 — 홈에서 뒤로가기 2회가 화면 변화 없이 죽는다')
      .toBe(0);
  });

  test('375 에서 알약이 전부 한 화면에 들어온다(요약 + 5단계)', async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!(await openStore(page)), '내 매장 없음');
    await page.waitForTimeout(2500);
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible({ timeout: 20_000 });

    const m = await bar.evaluate((el) => ({
      넘침: el.scrollWidth - el.clientWidth,
      칸: [...el.querySelectorAll<HTMLElement>('[role=tab], button')].map((b) => ({
        글자: b.textContent?.trim() ?? '', 폭: Math.round(b.getBoundingClientRect().width),
      })),
    }));
    console.log('[375 알약]', JSON.stringify(m, null, 1));
    // 마지막 단계(정산)가 잘려 스크롤해야 보이면, 그 단계가 있는 줄도 모른다(오너 2026-09-07).
    expect(m.넘침, '알약 바가 375 에서 넘친다 — 요약을 더하면서 넘겼다').toBeLessThanOrEqual(0);
    for (const c of m.칸) expect(c.폭, `«${c.글자}» 칸이 너무 좁다`).toBeGreaterThanOrEqual(28);
  });
});
