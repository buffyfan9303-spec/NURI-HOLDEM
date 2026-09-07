// 오픈 기념 이벤트 — 진입할 때 화면이 깜빡이지 않는가.
//
// 오너 보고(2026-09-08): "오픈 기념 이벤트 탭으로 들어가면 blink 느낌이 있어".
// 실측(375×812, preview 4173)으로 잡힌 정체는 **진입 한 번에 화면이 네 번 갈아끼워지는 것**이었다:
//     홈 → [불투명 스피너 283ms] → [스켈레톤 33~67ms] → 본문
//
// 원인 ①(큰 쪽) — `{eventOpen && <Suspense fallback={<OverlayFallback/>}>…}`.
//   Suspense 경계가 **그 업데이트에서 처음 마운트되면** 리액트는 트랜지션이어도 폴백을 반드시 커밋하고,
//   한 번 커밋한 폴백은 최소 ~300ms 유지한다(폴백이 번쩍이는 걸 막으려는 스로틀).
//   그래서 청크를 미리 받아 둬도 283ms 빈 화면이 남았다 — 그 구간에 긴 프레임 0 · 네트워크 0,
//   계산도 대기도 아닌 순수 스로틀이었다. 경계를 조건 **밖**으로 빼면 사라진다.
// 원인 ②(작은 쪽) — 보드 응답이 40~70ms 라 스켈레톤이 2~5프레임만 떴다 사라졌다.
//   70ms 대기에 로딩 표시는 안내가 아니라 잡음이다 → 200ms 넘게 걸릴 때만 띄운다.
//
// 이 스펙이 잠그는 것: ① 진입 구간에 폴백 오버레이가 **한 프레임도** 뜨지 않는다.
//                    ② 화면 교체 횟수가 2회를 넘지 않는다. ③ 느릴 때는 스켈레톤이 그대로 뜬다.
import { test, expect } from './_fixtures';

const DIALOG = '[role="dialog"][aria-label="이벤트"]';

/** 매 프레임 '지금 화면이 무엇인가'를 적는다. 상태가 바뀐 횟수가 곧 사용자가 느끼는 깜빡임 횟수다. */
const RECORDER = () => {
  const w = window as unknown as { __f: string[]; __raf: number };
  w.__f = [];
  const tick = () => {
    // OverlayFallback = fixed inset-0 z-[45] aria-busy + 스피너.
    //   셀렉터는 여기 인라인으로 둔다 — 이 함수는 브라우저 안에서 돌아 바깥 상수를 못 본다.
    //   클래스 이스케이프(.z-\[45\])를 피하려고 속성 셀렉터로 잡는다.
    const fb = document.querySelector('[class*="z-[45]"][aria-busy="true"]');
    const root = document.querySelector('[role="dialog"][aria-label="이벤트"]');
    const sk = root?.querySelector('[aria-busy="true"] .skeleton') ?? null;
    const foil = root ? root.querySelectorAll('.foil').length : 0;
    const s = root && foil > 0 ? '본문' : root && sk ? '스켈레톤' : root ? '껍데기' : fb ? '폴백' : '홈';
    if (w.__f[w.__f.length - 1] !== s) w.__f.push(s);
    w.__raf = requestAnimationFrame(tick);
  };
  w.__raf = requestAnimationFrame(tick);
};

const stop = (page: import('@playwright/test').Page) =>
  page.evaluate(() => { const w = window as unknown as { __f: string[]; __raf: number }; cancelAnimationFrame(w.__raf); return w.__f; });

/** 홈의 이벤트 배너. 진행 중인 이벤트가 없으면 아예 렌더되지 않으므로 없으면 건너뛴다. */
const bannerOf = (page: import('@playwright/test').Page) =>
  page.locator('button').filter({ hasText: /오픈 기념|카드 오픈|이벤트/ }).first();

test.describe('오픈 기념 이벤트 — 진입', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // 청크 프리페치(warm)가 idle 에 돌 시간을 준다 — 이 스펙은 '데워진 뒤에도 남는' 깜빡임을 본다.
    await page.waitForTimeout(2500);
  });

  test('🔴 진입에 폴백 빈 화면이 끼지 않는다 — Suspense 경계를 조건 안에 넣지 말 것', async ({ page }) => {
    const banner = bannerOf(page);
    test.skip(await banner.count() === 0, '진행 중인 이벤트가 없다(홈 배너 없음)');

    await page.evaluate(RECORDER);
    await banner.click();
    await expect(page.locator(`${DIALOG} .foil`).first()).toBeVisible({ timeout: 15_000 });
    const seen = await stop(page);
    console.log('[이벤트 진입] 화면 전환 =', seen.join(' → '));

    expect(seen, `진입 중 폴백(불투명 스피너)이 떴다 — <Suspense> 를 {eventOpen && …} 안에 다시 넣으면
      경계가 새로 마운트되어 리액트가 폴백을 커밋하고 ~300ms 붙잡는다. 경계는 조건 밖에 둔다`)
      .not.toContain('폴백');

    // 홈 → (껍데기) → 본문. 그 이상이면 사용자가 '뭔가 스쳤다'로 느낀다.
    const 전환 = seen.length - 1;
    expect(전환, `진입 한 번에 화면이 ${전환}번 갈아끼워졌다: ${seen.join(' → ')}`).toBeLessThanOrEqual(2);
  });

  // ⚠ 이 테스트는 **딥링크(?event=)로** 들어간다. 배너 경로로는 씨앗 없는 상태에 도달할 수 없다 —
  //   배너가 보인다는 것 자체가 홈이 보드를 이미 받았다는 뜻이고(HomeTab 이 배너 렌더 조건으로 쓴다),
  //   그러면 EventPage 는 cachedEventBoard() 씨앗으로 곧장 본문을 그려 로딩 상태가 아예 없다.
  //   씨앗이 없는 실제 경로는 두 가지뿐이다: QR 딥링크로 바로 들어오는 콜드 진입, 그리고 로그인 직후
  //   (auth 변화에 캐시를 버린다). 앞의 것이 실사용 경로라 그것으로 잠근다.
  test('씨앗이 없고 보드가 느리면(QR 딥링크 콜드 진입) 스켈레톤이 뜨고, 그 격자는 본문과 같은 칸 수다', async ({ page }) => {
    test.setTimeout(90_000);
    // 실제 응답을 그대로 되돌려주되 900ms 늦춘다 — 200ms 지연 게이트를 넘겨 로딩 표시가 살아 있는지 본다.
    //   (게이트를 넣으면서 스켈레톤을 통째로 죽이지 않았는지가 이 테스트의 요지다.)
    await page.route(/\/rest\/v1\/rpc\/event_board/, async (route) => {
      // 요청을 **보내기 전에** 늦춘다. 응답을 미리 받아 두었다가 늦춰 되돌려주면, 어설션이 먼저 끝났을 때
      //   그 응답이 이미 폐기돼 'Response has been disposed' 로 스펙이 깨진다(실제로 깨졌다).
      await new Promise((r) => setTimeout(r, 900));
      // fallback 이라 _fixtures 의 쓰기 차단 규칙을 그대로 거친다. 정리 중 도착한 호출은 조용히 버린다.
      await route.fallback().catch(() => { /* 테스트 종료 후 도착 */ });
    });

    await page.goto('/?event=1');
    const dialog = page.locator(DIALOG);
    // 진행 중인 이벤트가 없으면 딥링크로도 판이 안 열린다 — 그때는 잴 것이 없다.
    await dialog.waitFor({ timeout: 20_000 }).catch(() => {});
    test.skip(await dialog.count() === 0, '진행 중인 이벤트가 없다');

    const sk = page.locator(`${DIALOG} [aria-busy="true"] .skeleton`).first();
    await expect(sk, '느린 응답인데도 스켈레톤이 안 뜬다 — 지연 게이트가 로딩 표시를 아예 죽였다')
      .toBeVisible({ timeout: 10_000 });

    const 스켈레톤칸 = await page.locator(`${DIALOG} [aria-busy="true"] .skeleton.aspect-square`).count();
    await expect(page.locator(`${DIALOG} .foil`).first()).toBeVisible({ timeout: 15_000 });
    const 본문칸 = await page.locator(`${DIALOG} .foil`).count();
    console.log('[스켈레톤] 칸', 스켈레톤칸, '/ 본문 칸', 본문칸);

    // 칸 수가 다르면 교체 순간 격자가 통째로 늘었다 줄었다 한다 — 그것도 깜빡임이다.
    expect(스켈레톤칸, `스켈레톤 ${스켈레톤칸}칸 ≠ 본문 ${본문칸}칸 — 교체 순간 격자가 튄다`).toBe(본문칸);
  });

  test('배너로 들어가면 씨앗이 있어 로딩 표시 자체가 없다 — 느린 응답에도 본문이 먼저 선다', async ({ page }) => {
    test.setTimeout(90_000);
    const banner = bannerOf(page);
    test.skip(await banner.count() === 0, '진행 중인 이벤트가 없다(홈 배너 없음)');
    // 홈이 이미 보드를 받아 둔 뒤에 재조회만 느리게 만든다 — 씨앗이 있으면 그 지연이 보이면 안 된다.
    await page.route(/\/rest\/v1\/rpc\/event_board/, async (route) => {
      // 요청을 **보내기 전에** 늦춘다. 응답을 미리 받아 두었다가 늦춰 되돌려주면, 어설션이 먼저 끝났을 때
      //   그 응답이 이미 폐기돼 'Response has been disposed' 로 스펙이 깨진다(실제로 깨졌다).
      await new Promise((r) => setTimeout(r, 1500));
      // fallback 이라 _fixtures 의 쓰기 차단 규칙을 그대로 거친다. 정리 중 도착한 호출은 조용히 버린다.
      await route.fallback().catch(() => { /* 테스트 종료 후 도착 */ });
    });

    await banner.click();
    // 재조회가 아직 도는 중(1.5s)인데도 본문이 서 있어야 한다.
    await expect(page.locator(`${DIALOG} .foil`).first(),
      '씨앗이 있는데도 본문이 늦게 선다 — cachedEventBoard 씨앗이 끊겼다').toBeVisible({ timeout: 1_000 });
    expect(await page.locator(`${DIALOG} [aria-busy="true"] .skeleton`).count(),
      '씨앗이 있는데 스켈레톤이 떴다 — 낡은 내용을 조용히 갱신해야지 로딩판으로 되돌아가면 안 된다').toBe(0);
  });
});
