// N05 §9.4 — 버튼 클릭은 **정확히 한 번** 전달된다: 구매/제출 버튼이 두 번 실행되는 반례가 없다 (2026-09-13, 2026-09-26 개정).
//
// 🔴 2026-09-26 — View Transition 을 앱에서 **전부 걷었다**(src/components/transitionDevices.contract.test.ts (a)).
//   예전엔 VT 스냅샷이 전환 동안 히트테스트를 <html> 로 떨어뜨려 viewTransition.ts 의 rescue 가 그 클릭을 좌표로 되찾아
//   다시 보냈고, 이 검사는 '되보내기가 한 번뿐인가' 를 잠갔다. 이제 스냅샷도 rescue 도 없다 — 삼켜질 입력이 없으니
//   되보낼 것도 없어야 한다. 그래서 같은 두 반례를 거꾸로 잠근다:
//   ① VT 가 남아 있던 마지막 PC 경로(매장 페이지 열기)가 스냅샷을 **만들지 않는다**(startViewTransition 호출 0).
//   ② 버튼 자신에게 click → 정확히 1회. ③ 같은 좌표로 <html> 에 click → **그대로 1회**(누가 되살린 구조기가 되보내면 2).
// 음성 대조: ③ 은 옛 rescue(viewTransition.ts)가 설치된 빌드에서 2 가 되어 빨개진다(2f2a7dcf 빌드 실행).
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/vt-rescue-once.spec.ts
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

test('🔴 클릭은 한 번만 전달된다 — 스냅샷도 되보내기도 없다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.addInitScript(() => {
    let n = 0;
    Object.defineProperty(window, '__vtCalls', { get: () => n });
    const native = document.startViewTransition?.bind(document);
    if (native) document.startViewTransition = ((cb: () => void) => { n += 1; return native(cb); }) as typeof document.startViewTransition;
  });
  // 모바일 대메뉴는 이제 VT를 쓰지 않는다. 실제 VT가 남아 있는 PC 경로로 rescue를 검증한다.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await dismissOverlays(page);
  // 🔴 2026-09-18 — rescue 설치 경로가 바뀌었다. 종전엔 하위 탭 클릭(goSubTab)이
  //   withViewTransition 을 타서 ensureInputRescue 를 설치했는데, 하위 탭에서 View Transition 을
  //   걷어내면서(알약 1,300px 낙하의 근본 원인) 그 경로가 사라졌다.
  //   ⚠ rescue 자체는 멀쩡하다 — **VT 를 쓰는 경로**(최상위 탭 전환)에서는 그대로 설치되고 동작한다.
  //     바뀐 것은 '어디서 설치되는가' 뿐이라 검사도 그 경로로 옮긴다.
  //   🔵 2026-09-24 MOTION-UNIFY — PC 최상위 탭도 VT 를 걷어냈다(메인·하위 탭 모두 덮개 한 장, src/lib/tabCover.ts).
  //     VT 가 남은 PC 경로는 **매장 페이지 열기**(handleVenueClick → withViewTransition)·포스터 모핑·내 정보다.
  //     rescue 는 그 경로에서 설치되므로 검사도 매장 페이지 열기로 옮긴다(설치 뒤 리스너는 상주한다).
  const nav = page.locator('[data-stack-tabbar]');
  await nav.getByRole('tab', { name: '커뮤니티', exact: true }).click();
  await page.locator('[data-community-secbar]').getByRole('button', { name: /^홀덤펍/ }).click();
  await page.locator('[data-testid="venue-card"]').first().click();   // 예전 VT 경로(매장 페이지 열기)
  const venue = page.getByRole('dialog', { name: /매장 페이지$/ });
  await expect(venue).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);                     // 전환이 끝난 뒤에
  await page.keyboard.press('Escape');
  await expect(venue).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(400);                     // 닫힘 페이드가 끝난 뒤에 잰다(전환 중 클릭과 섞지 않는다)

  const counts = await page.evaluate(async () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'rescue-probe';
    btn.style.cssText = 'position:fixed;left:40px;top:200px;width:120px;height:44px;z-index:2147483647;';
    let n = 0;
    btn.addEventListener('click', () => { n += 1; });
    document.body.appendChild(btn);
    const r = btn.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const evt = () => new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    btn.dispatchEvent(evt());                          // ② 정상 전달
    const afterDirect = n;
    document.documentElement.dispatchEvent(evt());     // ③ 먹힌 클릭(타깃 <html>)의 재현
    await new Promise((res) => setTimeout(res, 50));
    const afterSwallowed = n;
    btn.remove();
    return { afterDirect, afterSwallowed, hit: document.elementFromPoint(x, y)?.textContent ?? null };
  });
  expect(counts.afterDirect, '정상 전달된 클릭을 되보내면 2회가 된다(구매 이중 실행)').toBe(1);
  expect(counts.afterSwallowed, '<html> 로 떨어진 클릭을 누가 되보냈다 — 스냅샷이 없는데 구조기가 살아 있다(이중 실행 위험)').toBe(1);
  expect(await page.evaluate(() => Reflect.get(window, '__vtCalls') as number), '매장 페이지 열기가 document View Transition 을 만들었다').toBe(0);
});
