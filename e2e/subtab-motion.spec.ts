// 하위 탭 모션 실측 게이트(오너 #10) — "코드가 있다"가 아니라 "실제로 애니메이트된다"를 잰다.
//
// 왜 Playwright 인가: 브라우저 페인(MCP)은 document.hidden 이 항상 true 라
// startViewTransition 이 아예 호출되지 않는다(viewTransition.ts 의 폴백 경로로 빠진다).
// 즉 거기서는 '모션이 없다'와 '모션이 안 도는 환경이다'를 구분할 수 없다.
//
// 무엇을 재나: 탭을 누른 직후 프레임마다 document.getAnimations() 를 훑어
//   ① 하위 탭 전환에 View Transition 이 **한 번도 안 도는지**(expectNoViewTransition)
//   ② 탭바·헤더가 1px 도 안 움직이는지(제자리 고정)
//   ③ 알약이 중간 프레임을 거쳐 미끄러지는지(CSS FLIP 이 살아 있는지)
// 를 확인한다. ②가 깨지면 헤더·히어로까지 통째로 밀리는 예전 회귀다.
//
// ⚠ 2026-09-18 정정 — 예전 머리말은 ①을 "`::view-transition-old/new(<패널>)` 이 vt-panel-* 키프레임으로
//   **실제 애니메이트되는지**" 라고 적어 뒀다. 지금은 정반대다: 하위 탭 본문에서 VT 를 걷어냈고
//   (`src/lib/subTabTransition.ts`, 이유는 아래 expectNoViewTransition JSDoc 의 1,300px 낙하)
//   `vt-panel-*` 키프레임은 사용처 0 이 되어 `src/index.css` 에서 삭제했다.
//   본문은 이미 새 판정으로 바뀌어 있었는데 **머리말만 옛 설계를 설명하고 있었다** — 읽는 사람이
//   "이 스펙은 VT 가 돌기를 기대한다"고 거꾸로 이해하게 된다. 주석도 계약의 일부라 같이 고친다.
import { test, expect } from './_fixtures';
import { type Page, type Locator } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays, loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

declare global {
  interface Window {
    __VT_SAMPLES?: string[];
    __GEO?: { barYs: number[]; aboveYs: number[]; pillXs: number[] };
  }
}

/** 전환이 도는 동안 프레임마다 의사요소 애니메이션을 수집한다(앱 코드는 건드리지 않는다). */
/** 한 번의 전환에서 거둔 것 — VT 스냅샷 목록 + 프레임별 기하(중복 제거). */
interface Probe {
  samples: string[];
  /** 탭바의 화면 y — 값이 하나면 '1px 도 안 움직였다'. */
  barYs: number[];
  /** 탭바 **위쪽**(앱 헤더)의 y — 같은 의미. */
  aboveYs: number[];
  /** 알약의 x — 값이 여러 개여야 '미끄러졌다'. 알약이 없는 바면 빈 배열. */
  pillXs: number[];
}

async function startSampler(page: Page, barSel: string | null): Promise<void> {
  await page.evaluate((sel) => {
    window.__VT_SAMPLES = [];
    window.__GEO = { barYs: [], aboveYs: [], pillXs: [] };
    const bar = sel ? (document.querySelector(sel) as HTMLElement | null) : null;
    const pill = bar?.querySelector('[data-sliding-pill]') as HTMLElement | null;
    const header = document.querySelector('header') as HTMLElement | null;
    const g = window.__GEO!;
    const t0 = performance.now();
    const tick = () => {
      for (const a of document.getAnimations()) {
        const eff = a.effect as KeyframeEffect | null;
        const pe = eff?.pseudoElement ?? null;
        if (!pe || !pe.startsWith('::view-transition')) continue;
        const name = (a as unknown as { animationName?: string }).animationName ?? '';
        window.__VT_SAMPLES!.push(`${pe} :: ${name}`);
      }
      if (bar) g.barYs.push(+bar.getBoundingClientRect().y.toFixed(1));
      if (header) g.aboveYs.push(+header.getBoundingClientRect().y.toFixed(1));
      if (pill) g.pillXs.push(+pill.getBoundingClientRect().x.toFixed(1));
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, barSel);
}

async function collect(page: Page): Promise<Probe> {
  await page.waitForTimeout(950);
  return page.evaluate(() => ({
    samples: [...new Set(window.__VT_SAMPLES ?? [])].sort(),
    barYs: [...new Set(window.__GEO?.barYs ?? [])],
    aboveYs: [...new Set(window.__GEO?.aboveYs ?? [])],
    pillXs: [...new Set(window.__GEO?.pillXs ?? [])],
  }));
}

/** 탭 하나를 누르고 전환을 계측한다.
 *  @param barSel 탭바의 CSS 셀렉터 — 주면 바·헤더·알약 기하까지 같이 잰다.
 *  ⚠ 표본을 시작하기 **전에** 대상을 화면 안으로 넣는다 — Playwright 의 click 은 대상까지
 *    자동 스크롤해서, 그대로 두면 바 y 가 스크롤 때문에 움직여 '바가 움직였다' 고
 *    거짓 보고한다(CLAUDE.md 의 측정 오염 항목). */
async function probe(page: Page, target: Locator, barSel: string | null = null): Promise<Probe> {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await startSampler(page, barSel);
  await target.click();
  return collect(page);
}

/**
 * 🔴 오너가 직접 지정한 요구(2026-09-18):
 *   "메뉴는 그대로 유지하고 안에 있는 콘텐츠만 바뀌었으면 좋겠는데 자꾸 메뉴가 있는 쪽도
 *    전환되거나 그 위쪽 콘텐츠 변환이 없는 부분도 같이 가는 것 같아"
 *
 * 두 가지를 잠근다.
 *   ① 탭바와 그 위쪽(헤더)은 전환 내내 **값이 하나** — 1px 도 안 움직인다.
 *   ② 알약은 **여러 프레임에 걸쳐** 이동한다(순간이동이 아니다).
 *     — 2026-09-18 실측: SlidingPill 의 FLIP 은 ResizeObserver 의 **관찰 시작 콜백**에
 *       한 프레임 뒤 덮어쓰였다(82.0 → 208.0, dur 0.22s → 0s). 그동안은 VT 가 제 손으로
 *       보간해 가려져 있었고, VT 를 걷어내자 드러났다. 이 판정이 그 복귀를 막는다.
 */
function expectMenuStill(r: Probe, where: string) {
  expect(r.barYs.length, `${where}: 탭바가 움직였다 — 메뉴는 제자리여야 한다.
관측된 y: ${r.barYs.join(' → ')}`).toBe(1);
  expect(r.aboveYs.length, `${where}: 탭바 위쪽(헤더)이 움직였다 — 바뀔 것이 없는 자리다.
관측된 y: ${r.aboveYs.join(' → ')}`).toBeLessThanOrEqual(1);
  if (r.pillXs.length === 0) return;   // 알약이 없는 바(밑줄·색만 바뀌는 곳)는 여기서 판정하지 않는다
  expect(r.pillXs.length, `${where}: 알약이 제자리에서 튀었다(중간 프레임 없음) — CSS FLIP 이 죽었다.
관측된 x: ${r.pillXs.join(' → ')}`).toBeGreaterThanOrEqual(3);
}

/**
 * 계약 판정 — 본문만 밀고 탭바·root 는 제자리.
 * @param panel index.css 에 등록된 본문 스냅샷 이름
 * @param bar   탭바 스냅샷 이름
 */
/**
 * 🔴 2026-09-18 새 계약 — **하위 탭 전환에는 View Transition 이 없다.**
 *
 * 왜 바뀌었나: 오너가 같은 증상을 네 번 지적했다("화면 전체가 왔다 갔다", "알약이 위에서 뚝 떨어진다",
 * "두드득 끊기는 것처럼 보인다", "책처럼 덮는다"). 원인은 **하나**였고 명세에 적혀 있다 —
 * VT 스냅샷의 transform 은 **뷰포트(snapshot containing block) 원점 기준**이다:
 *   https://drafts.csswg.org/css-view-transitions-1/  §4.1·§7.3.1
 *   열린 WG 이슈: https://github.com/w3c/csswg-drafts/issues/10197
 * 하위 탭은 판마다 문서 높이가 크게 다르다(내 매장 3544px → 1023px). 짧은 판으로 가면 브라우저가
 * scrollY 를 깎는데(클램프), 그 순간 old 스냅샷은 옛 좌표에 박혀 있어 이름 붙은 요소가 그만큼 날아간다.
 * 실측: 스크롤 1500 → 23, 알약 궤적 (291,−1305) → (411,172) — **1,300px 낙하**, 3/3 재현.
 *
 * 그래서 하위 탭 본문에서 VT 를 걷어냈다(`src/lib/subTabTransition.ts`). Ant Design 탭의 기본값이
 * `{ inkBar: true, tabPane: false }`(본문 무애니)이고 Radix·MUI 도 인디케이터만 움직인다.
 * 이 저장소에도 같은 방식이 이미 5곳 있었고 **그 화면들엔 이 신고가 한 번도 없었다.**
 *
 * 이 판정이 지키는 것: 누가 하위 탭에 VT 를 **다시 넣으면** 빨개진다. 그러면 위 낙하가 함께 돌아온다.
 */
function expectNoViewTransition(samples: string[], where: string) {
  const joined = samples.join('\n');
  expect(
    samples,
    `${where}: 하위 탭 전환에 View Transition 이 다시 들어왔다.\n` +
    'VT 스냅샷은 뷰포트 좌표계라, 판 높이가 달라 스크롤이 깎이는 순간 알약·바가 그 차이만큼 날아간다\n' +
    '(실측 1,300px 낙하 · csswg-drafts#10197). 본문은 즉시 교체하고 알약만 CSS FLIP 으로 움직여라.\n' +
    `실측:\n${joined}`,
  ).toEqual([]);
}

// CI 러너(공유 vCPU)에서는 VT/스프링 프레임 타이밍이 흔들려 간헐 실패한다(2026-09-02 실측: 로컬 14/14 통과·CI 1회 실패 후 재실행 통과).
// 임계는 그대로, 재시도만 CI 에서 2회 — perf.spec 과 같은 규약.
test.describe.configure({ retries: process.env.CI ? 2 : 0 });
test.describe('하위 탭 — VT 없이 알약만 움직인다', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정 — 로그인 화면들을 잴 수 없다');

  async function boot(page: Page) {
    await stabilizeBackstack(page);
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
    await dismissOverlays(page);
  }

  async function gotoCommunitySection(page: Page, secId: string) {
    await page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first().click();
    const tab = page.getByTestId(`sec-tab-${secId}`).first();
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();
    await page.waitForTimeout(600); // 섹션 전환(VT)이 끝난 뒤에 재야 이번 전환과 안 섞인다
  }

  test('🔴 도구 탭 레인 필터(tools-lane)', async ({ page }) => {
    await boot(page);
    await page.locator('nav').getByRole('button', { name: 'GTO', exact: true }).first().click();
    const bar = page.locator('[data-tools-lanebar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    // ⚠ 라벨이 아니라 data-lane 으로 짚는다 — 예전엔 '계산기' 라는 이름으로 짚었는데 레인 라벨이
    //    '규칙 · 수학' 으로 바뀌면서 **이 계측이 조용히 죽어 있었다**(클릭 타임아웃으로만 드러났다).
    //    CLAUDE.md 규약: 라벨에 묶인 셀렉터는 라벨을 바꾸는 커밋에서 data-* 로 갈아탄다.
    const r = await probe(page, bar.locator('[data-lane="rules"]'), '[data-tools-lanebar]');
    expectNoViewTransition(r.samples, 'tools-lanepanel');
    expectMenuStill(r, 'tools-lane');
  });

  test('🔴 장터 카테고리(market-cat)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, 'market');
    const bar = page.locator('[data-market-catbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const r = await probe(page, bar.getByRole('button', { name: '용품', exact: true }), '[data-market-catbar]');
    expectNoViewTransition(r.samples, 'market-panel');
    expectMenuStill(r, 'market-cat');
  });

  test('🔴 딜러 커뮤니티 구인·구직 필터(dealer-kind)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, 'dealer');
    const bar = page.locator('[data-dealer-kindbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const r = await probe(page, bar.getByRole('button', { name: /^구인/ }), '[data-dealer-kindbar]');
    expectNoViewTransition(r.samples, 'dealer-panel');
    expectMenuStill(r, 'dealer-kind');
  });

  test('🔴 랭킹 허브 세부 탭(rank-tab · 오너가 지목한 화면)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, 'rank');
    const bar = page.locator('[data-rank-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const r = await probe(page, bar.getByRole('button', { name: /명예/ }).first(), '[data-rank-tabbar]');
    expectNoViewTransition(r.samples, 'rank-panel');
    expectMenuStill(r, 'rank-tab');
  });

  test('🔴 내 정보 통합 페이지 탭(profile-tab)', async ({ page }) => {
    await boot(page);
    // 헤더 아바타 → 사용자 메뉴 → '내 정보'(2026-09-04 통합: 대시보드·프로필·설정·보안 4탭 — 앱의 실제 동선)
    await page.locator('button[aria-label$="메뉴"]').first().click();
    await page.getByRole('button', { name: '내 정보 열기' }).click();
    const bar = page.locator('[data-profile-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const r = await probe(page, bar.getByRole('tab', { name: '설정', exact: true }), '[data-profile-tabbar]');
    expectNoViewTransition(r.samples, 'profile-panel');
    expectMenuStill(r, 'profile-tab');
  });

  test('🔴 알림 패널 쪽지·알림(notif-tab) — 방향성 푸시가 아니라 페이드아웃만 돈다', async ({ page }) => {
    await boot(page);
    await page.locator('button[aria-label^="알림"]').first().click();
    const bar = page.locator('[data-notif-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    // 2026-09-24 H5 — 기본 탭이 알림이 됐다. 이미 선택된 탭을 누르면 전환이 안 일어나 측정이 비므로 쪽지로 옮긴다.
    const r = await probe(page, bar.getByRole('tab', { name: '쪽지', exact: true }), '[data-notif-tabbar]');
    // ⚠ 다른 스코프처럼 expectPanelPush(방향성 푸시)를 쓰지 않는다 — notif-panel 은 예외다.
    //   근거는 expectNotifPanelFadeOnly 주석 참고(팝업 카드 좌우 여백 17px < 푸시 이동량 18px).
    expectNoViewTransition(r.samples, 'notif-panel');
    expectMenuStill(r, 'notif-tab');
  });
});

// ── 스코프 마커 수명 = 전환 수명(2026-09-05 오너 지적: "랭킹 소메뉴를 옮기면 내 등급부터 맨 위까지 흐릿해졌다 돌아온다") ──
// 빠른 PC 에선 재현되지 않고 CPU×8 에서만 난다: 마커가 고정 450ms 타이머로 풀리면 전환 **도중**에 root 정지
// 규칙이 사라져 root 에 vt-push-*(blur) 가 새로 걸린다(수정 전 실측: 459ms 마커 삭제 → 487ms root vt-push-in-r).
// 랭킹 허브는 비로그인으로도 보이므로 이 게이트는 자격 증명 없이 돈다.
test.describe('하위 탭 — 느린 기기에서도 root 는 끝까지 정지', () => {
  test('🔴 CPU ×8 랭킹 세부 탭: 마커가 전환 도중 풀리지 않는다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.goto('/');
    const community = page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first();
    await expect(community).toBeVisible({ timeout: 20_000 });
    await dismissOverlays(page);
    await community.click();
    const tab = page.getByTestId('sec-tab-rank').first();
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();
    const bar = page.locator('[data-rank-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(900); // 섹션 전환(VT)과 초기 로드가 끝난 뒤에 잰다

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
    try {
      const r = await probe(page, bar.getByRole('button', { name: /명예/ }).first(), '[data-rank-tabbar]');
      const samples = r.samples;
      const joined = samples.join('\n');
      // root 가 한 프레임이라도 밀리면(blur) 실패 — 마커가 전환보다 먼저 풀렸다는 뜻.
      expect(samples.filter((x) => /\(root\) :: vt-push-/.test(x)), `느린 기기에서 root 가 밀렸다(마커가 전환 도중 풀림)
실측:
${joined}`).toEqual([]);
      // 2026-09-18: 하위 탭은 VT 를 안 타므로 **느린 기기에서도 스냅샷이 아예 안 생긴다.**
      //   예전 이 테스트가 잡던 것(마커가 전환 도중 풀려 root 가 blur 로 밀림)은 구조적으로 불가능해졌다 —
      //   마커 자체가 안 켜진다. 그래도 이 케이스는 남긴다: 느린 기기에서 누가 VT 를 되살리면 여기서 걸린다.
      expectNoViewTransition(samples, 'rank-tab(CPU×8)');
      // 느린 기기에서도 메뉴는 제자리·알약은 미끄러진다 — CPU×8 이 진짜 손가락에 가장 가깝다.
      expectMenuStill(r, 'rank-tab(CPU×8)');
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });
});

// ── 커뮤니티 서브탭(community-sec) — 본문은 **즉시** 바뀌고 알약만 미끄러진다 ──────────────
//
// 2026-09-18 이전 이 자리의 계약은 "본문이 방향성 푸시(VT)로 밀린다" 였다. 그 구조가 오너가 네 번
// 지적한 증상(알약 낙하·화면 왔다 갔다·두드득·책장 덮기)의 원인이어서 하위 탭에서 VT 를 걷어냈다
// (근거는 위 expectNoViewTransition 주석 — 명세 §7.3.1 · csswg-drafts#10197 · 실측 1,300px 낙하).
//
// 지금 지키는 것 셋:
//   ① 전환에 VT 스냅샷이 **하나도 없다**(다시 넣으면 낙하가 함께 돌아온다)
//   ② 본문이 **실제로 바뀐다** — 즉시 교체가 "아무 일도 안 일어남" 으로 퇴화하지 않았는지
//   ③ 알약이 **미끄러진다** — SlidingPill 의 CSS FLIP(레이아웃 좌표라 스크롤 클램프와 무관).
//      제자리 점프면 인디케이터의 의미가 없다.
// 비로그인으로도 보이므로 자격 증명 없이 돈다. 클릭은 page.evaluate 로 — locator.click 은 대상까지
// 자동 스크롤해 측정을 오염시킨다(CLAUDE.md).
test.describe('하위 탭 — 본문은 즉시, 알약만 미끄러진다', () => {
  test('🔴 커뮤니티 서브탭(community-sec): VT 0 · 본문 교체됨 · 알약 이동', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.goto('/');
    const community = page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first();
    await expect(community).toBeVisible({ timeout: 20_000 });
    await dismissOverlays(page);
    await community.click();
    const board = page.getByTestId('sec-tab-board').first();
    await expect(board).toBeVisible({ timeout: 15_000 });
    await board.click();
    await page.waitForTimeout(900);

    const bar = page.locator('[data-community-secbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    expect(await bar.locator('[data-sliding-pill]').count(), '알약이 없다 — 이 바의 인디케이터 구조가 바뀌었다').toBe(1);

    const r = await page.evaluate(async () => {
      const barEl = document.querySelector('[data-community-secbar]') as HTMLElement;
      const pill = barEl.querySelector('[data-sliding-pill]') as HTMLElement;
      const panel = document.querySelector('[data-community-secpanel]') as HTMLElement;
      const target = document.querySelector('[data-testid="sec-tab-rank"]') as HTMLElement;
      if (!pill || !panel || !target) return null;

      // ⚠ innerText — `textContent` 는 keep-alive 로 `display:none` 된 다른 섹션까지 읽어
      //   탭을 바꿔도 앞 80자가 그대로였다(실제로 이 검사가 거짓 실패했다). 보이는 글자만 본다.
      const before = { pillX: pill.getBoundingClientRect().x, text: (panel.innerText ?? '').replace(/\s+/g, ' ').slice(0, 80) };
      const vt: string[] = [];
      const pillXs: number[] = [];
      // 🔴 오너 요구(2026-09-18): "메뉴는 그대로 유지하고 **안에 있는 콘텐츠만** 바뀌었으면 좋겠는데
      //   자꾸 메뉴가 있는 쪽도 전환되거나 그 위쪽 콘텐츠도 같이 간다" — 바와 그 위쪽을 프레임마다 잰다.
      const barYs: number[] = [];
      const aboveYs: number[] = [];
      const above = document.querySelector('[data-stack-header]') as HTMLElement | null;
      const t0 = performance.now();
      const tick = () => {
        for (const a of document.getAnimations()) {
          const pe = (a.effect as KeyframeEffect | null)?.pseudoElement ?? null;
          if (pe?.startsWith('::view-transition')) vt.push(`${pe} :: ${(a as unknown as { animationName?: string }).animationName ?? ''}`);
        }
        pillXs.push(+pill.getBoundingClientRect().x.toFixed(1));
        barYs.push(+barEl.getBoundingClientRect().y.toFixed(1));
        if (above) aboveYs.push(+above.getBoundingClientRect().y.toFixed(1));
        if (performance.now() - t0 < 700) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      target.click();
      await new Promise((f) => setTimeout(f, 800));
      return {
        vt: [...new Set(vt)].sort(),
        pillXs: [...new Set(pillXs)],
        barYs: [...new Set(barYs)],
        aboveYs: [...new Set(aboveYs)],
        before,
        after: { pillX: pill.getBoundingClientRect().x, text: (panel.innerText ?? '').replace(/\s+/g, ' ').slice(0, 80) },
      };
    });
    expect(r, '커뮤니티 서브탭의 바·본문·알약을 못 찾았다').not.toBeNull();

    // ① VT 가 하나도 없다
    expectNoViewTransition(r!.vt, 'community-sec');

    // ② 본문이 실제로 바뀌었다 — '즉시 교체' 가 '아무 일도 안 함' 이 되지 않았는지
    expect(r!.after.text, `본문이 그대로다 — 탭을 눌렀는데 판이 안 바뀌었다.
전: ${r!.before.text}
후: ${r!.after.text}`).not.toBe(r!.before.text);

    // ③ 알약이 미끄러진다 — 중간 좌표가 있어야 '이동' 이다(둘뿐이면 순간이동)
    expect(r!.after.pillX, '알약이 안 움직였다').not.toBe(r!.before.pillX);
    expect(r!.pillXs.length, `알약이 제자리에서 튀었다(중간 프레임 없음) — CSS FLIP 전환이 죽었다.
관측된 x: ${r!.pillXs.join(' → ')}`).toBeGreaterThanOrEqual(3);

    // ④ 🔴 메뉴(탭바)와 그 위쪽은 **1px 도** 움직이지 않는다 — 오너가 직접 지적한 요구다.
    //   VT 를 쓰던 시절에는 바·헤더가 스냅샷으로 떠서 같이 밀리거나, root 가 얼어 t=0 에 점프했다.
    //   지금은 DOM 이 그대로라 애초에 움직일 이유가 없다 — 그 사실을 계약으로 못 박는다.
    expect(r!.barYs.length, `탭바가 전환 중에 움직였다 — 메뉴는 제자리에 있어야 한다.
관측된 y: ${r!.barYs.join(' → ')}`).toBe(1);
    expect(r!.aboveYs.length, `탭바 **위쪽** 콘텐츠가 움직였다 — 바뀌지 않는 부분은 가만히 있어야 한다.
관측된 y: ${r!.aboveYs.join(' → ')}`).toBeLessThanOrEqual(1);
  });
});
