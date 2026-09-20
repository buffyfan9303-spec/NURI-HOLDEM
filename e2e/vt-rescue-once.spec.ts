// N05 §9.4 — 전환 중 입력 구조(rescue)가 **한 번만** 전달된다: 구매/제출 버튼이 두 번 실행되는 반례가 없다 (2026-09-13).
//
// 왜: viewTransition.ts 의 onClickCapture 는 <html>/<body> 로 떨어진(=스냅샷에 먹힌) 클릭만 좌표로 대상을 되찾아
//   target.click() 으로 다시 보낸다. 이 게이트가 없으면 "정상 전달된 클릭까지 되보내는" 회귀(버튼 1회 → 2회 실행)가
//   조용히 들어온다 — 상점 구매·바인 승인처럼 돈이 걸린 버튼에서 치명적이다.
// 무엇을 재나(앱 코드 무수정, 로그인 불필요):
//   ① PC 대메뉴를 재방문해 rescue 리스너가 설치된 상태를 만든다(withViewTransition → ensureInputRescue).
//   ② 화면에 카운터 버튼을 만든다. 버튼 자신에게 click → 정확히 1회(되보내지 않는다).
//   ③ 같은 좌표로 <html> 에 click(먹힌 클릭의 재현) → 정확히 +1회(구조는 되지만 두 번은 아니다).
// 음성 대조(실측 2026-09-13): viewTransition.ts 의 `target.click();` 을 `target.click(); target.click();` 로 바꾸면 ③이 3회가 되어 실패한다.
//   ⚠ `if (!wasSwallowed(e.target)) return;` 을 지우는 변형은 이 검사가 못 본다 — 그 변형은 이중 실행이 아니라
//     캡처 단계 stopPropagation + 재귀 click 이 되어(스택 오버플로) 원래 클릭 자체가 사라진다. 그건 별개 결함이다.
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/vt-rescue-once.spec.ts
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

test('🔴 전환 중 구조된 클릭은 한 번만 전달된다 — 정상 클릭은 되보내지 않는다', async ({ page }) => {
  await stabilizeBackstack(page);
  // 모바일 대메뉴는 이제 VT를 쓰지 않는다. 실제 VT가 남아 있는 PC 경로로 rescue를 검증한다.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await dismissOverlays(page);
  // 🔴 2026-09-18 — rescue 설치 경로가 바뀌었다. 종전엔 하위 탭 클릭(goSubTab)이
  //   withViewTransition 을 타서 ensureInputRescue 를 설치했는데, 하위 탭에서 View Transition 을
  //   걷어내면서(알약 1,300px 낙하의 근본 원인) 그 경로가 사라졌다.
  //   ⚠ rescue 자체는 멀쩡하다 — **VT 를 쓰는 경로**(최상위 탭 전환)에서는 그대로 설치되고 동작한다.
  //     바뀐 것은 '어디서 설치되는가' 뿐이라 검사도 그 경로로 옮긴다.
  //   ⚠ 최상위 탭도 **재방문일 때만** VT 를 탄다(App.tsx: `if (visitedTabs.has(t))`).
  //     첫 방문은 lazy 청크 때문에 startTransition 경로다 — 그래서 GTO 를 두 번 들어간다.
  const nav = page.locator('[data-stack-tabbar]');
  await nav.getByRole('tab', { name: 'GTO', exact: true }).click();
  await expect(page.locator('[data-tools-lanebar]')).toBeVisible({ timeout: 15_000 });
  await nav.getByRole('tab', { name: '홈', exact: true }).click();
  await page.waitForTimeout(400);
  await nav.getByRole('tab', { name: 'GTO', exact: true }).click();  // 재방문 → withViewTransition → rescue 설치
  await page.waitForTimeout(700);                     // 이번 전환이 끝난 뒤에 잰다(전환 중 클릭과 섞지 않는다)

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
  expect(counts.afterSwallowed, '<html> 로 먹힌 클릭은 정확히 한 번 구조된다').toBe(2);
});
