// 헤더 아래 붙는 sticky 들이 **헤더와 같은 높이를 본다** (2026-09-19 오너 지시)
//
// 오너: "홈, 라이브, GTO, 내매장에서는 최상단 header 에 있는 누리홀덤 아이콘과 프로필등 위치가
//        동일한데 커뮤니티에서는 살짝 올라가 이거 직접 실측해서 제대로 변경해"
//
// 실측으로 밝혀진 것 — **헤더는 범인이 아니었다.**
//   5개 탭(home·live·tools·community·mystore) 전부 스크롤 0 에서 헤더 높이 60.5 ·
//   종 아이콘 top 10.63 으로 **완전히 동일**했다. 탭 전환 경로로도 동일.
//   범인은 그 아래 붙는 **sticky 의 top 값**이었다:
//     스크롤 0   → 헤더 밑면 60.50 · 커뮤니티 서브탭 60.50 → 틈 0
//     스크롤 57~ → 헤더 밑면 **47.75** · 서브탭 **51.00** → **3.25px 틈**(본문이 그 사이로 비친다)
//   헤더는 스크롤하면 줄어드는데(App.tsx `shrunk` · lib/headerShrink.ts 내림 56 / 올림 40)
//   sticky 는 `theme(spacing.header-h)` 라는 고정 토큰을 쓰고 있었다.
//   → `--header-now`(src/index.css) 하나로 묶었다. 헤더가 줄면 매달린 것들이 같이 따라온다.
//
// ⚠ 음성 대조: CommunityTab 의 `var(--header-now)` 를 `theme(spacing.header-h)` 로 되돌리면
//   아래 ①의 '스크롤 뒤' 단언이 실패한다(틈 3.25px). 실제로 되돌려 확인했다.
// ⚠ 이 스펙은 **모바일 폭에서만** 의미가 있다 — md(768px) 이상에서는 헤더가 줄지 않는다
//   (`shrunk ? 'h-11 md:h-header-h' : 'h-header-h'`).
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';

const PHONE = { width: 390, height: 844 };
/** 헤더 축소 임계값(lib/headerShrink.HEADER_SHRINK_DOWN = 56)을 확실히 넘는 값 */
const PAST_SHRINK = 150;

/** 헤더 밑면과 대상 sticky 의 윗면 사이 간격(px). 양수 = 틈(본문이 비친다). */
async function gapUnderHeader(page: Page, pick: string) {
  return page.evaluate((sel) => {
    const bell = document.querySelector('button[aria-label^="알림"]');
    const header = bell?.closest('header');
    const target = document.querySelector(sel);
    if (!header || !target) return null;
    let sticky: HTMLElement | null = target as HTMLElement;
    while (sticky && !/sticky|fixed/.test(getComputedStyle(sticky).position)) sticky = sticky.parentElement;
    if (!sticky) return null;
    return {
      headerBottom: +header.getBoundingClientRect().bottom.toFixed(2),
      stickyTop: +sticky.getBoundingClientRect().top.toFixed(2),
      gap: +(sticky.getBoundingClientRect().top - header.getBoundingClientRect().bottom).toFixed(2),
      cssTop: getComputedStyle(sticky).top,
    };
  }, pick);
}

test('🔴 ① 커뮤니티 서브탭 — 헤더가 줄어도 틈이 생기지 않는다', async ({ page }) => {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize(PHONE);
  await page.goto('/?tab=community');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await page.waitForTimeout(2200);

  const at0 = await gapUnderHeader(page, '[data-community-secbar]');
  expect(at0, '커뮤니티 서브탭(data-community-secbar)을 찾지 못했다 — 이 검사가 아무것도 안 보고 있다').not.toBeNull();

  await page.evaluate((y) => window.scrollTo(0, y), PAST_SHRINK);
  await page.waitForTimeout(800);
  const after = await gapUnderHeader(page, '[data-community-secbar]');
  expect(after).not.toBeNull();

  // 🔴 잴 것이 실제로 있었는지: 스크롤이 먹지 않았으면 위아래가 같은 상태라 검사가 무의미하다.
  const scrolled = await page.evaluate(() => Math.round(window.scrollY));
  expect(scrolled, `스크롤이 ${scrolled}px 에 그쳐 헤더 축소 임계값(56)을 못 넘었다 — 빈 검사다`)
    .toBeGreaterThan(56);
  expect(after!.headerBottom, '스크롤했는데 헤더가 줄지 않았다 — 축소 자체가 죽었으면 이 검사는 무의미하다')
    .toBeLessThan(at0!.headerBottom);

  // 본론: 헤더가 줄어든 상태에서도 틈이 없어야 한다(겹침은 괜찮다 — 이음매를 감추는 장치다).
  expect(after!.gap, `헤더가 줄자 서브탭과의 사이에 ${after!.gap}px 틈이 생겼다`
    + ` (헤더 밑면 ${after!.headerBottom} · 서브탭 ${after!.stickyTop} · css top ${after!.cssTop})`
    + ' — 그 사이로 본문이 비친다. 오너가 "커뮤니티에서는 살짝 올라가" 라고 한 자리다.')
    .toBeLessThanOrEqual(0.5);
});

test('🔴 ② 알림 패널도 같은 값을 본다 — 헤더가 줄면 같이 올라온다', async ({ page }) => {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize(PHONE);
  await page.goto('/?tab=home');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await page.waitForTimeout(2200);

  // 헤더를 줄인 상태로 만든 뒤 연다(패널은 fixed 라 연 뒤에도 헤더를 따라야 한다).
  await page.evaluate((y) => window.scrollTo(0, y), PAST_SHRINK);
  await page.waitForTimeout(700);
  await page.evaluate(() => (document.querySelector('button[aria-label^="알림"]') as HTMLElement)?.click());
  await page.waitForTimeout(900);

  const r = await gapUnderHeader(page, '[role="dialog"], [data-notif-panel]');
  if (r === null) {
    // 패널을 못 열었으면 **조용히 통과시키지 않는다** — 빈 통과가 이 저장소 최다 함정이다.
    test.fail(true, '알림 패널을 열지 못해 잴 것이 없었다 — 셀렉터나 진입이 바뀌었는지 확인해라');
    return;
  }
  expect(r.gap, `알림 패널이 헤더 밑면에서 ${r.gap}px 떨어져 있다(css top ${r.cssTop})`
    + ' — 헤더가 줄었는데 패널이 옛 높이에 남아 있다')
    .toBeLessThanOrEqual(12);
});
