// 하위 탭 모션 실측 게이트(오너 #10) — "코드가 있다"가 아니라 "실제로 애니메이트된다"를 잰다.
//
// 왜 Playwright 인가: 브라우저 페인(MCP)은 document.hidden 이 항상 true 라
// startViewTransition 이 아예 호출되지 않는다(viewTransition.ts 의 폴백 경로로 빠진다).
// 즉 거기서는 '모션이 없다'와 '모션이 안 도는 환경이다'를 구분할 수 없다.
//
// 무엇을 재나: 탭을 누른 직후 프레임마다 document.getAnimations() 를 훑어
//   ① ::view-transition-old/new(<패널>) 이 vt-panel-* 키프레임으로 실제 애니메이트되고
//   ② ::view-transition-old/new(root) 와 탭바 스냅샷은 애니메이트되지 **않는지**(제자리 고정)
// 를 확인한다. ②가 깨지면 헤더·히어로까지 통째로 밀리는 예전 회귀다.
import { test, expect } from './_fixtures';
import { type Page, type Locator } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays, loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

declare global {
  interface Window { __VT_SAMPLES?: string[] }
}

/** 전환이 도는 동안 프레임마다 의사요소 애니메이션을 수집한다(앱 코드는 건드리지 않는다). */
async function startSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__VT_SAMPLES = [];
    const t0 = performance.now();
    const tick = () => {
      for (const a of document.getAnimations()) {
        const eff = a.effect as KeyframeEffect | null;
        const pe = eff?.pseudoElement ?? null;
        if (!pe || !pe.startsWith('::view-transition')) continue;
        const name = (a as unknown as { animationName?: string }).animationName ?? '';
        window.__VT_SAMPLES!.push(`${pe} :: ${name}`);
      }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function collect(page: Page): Promise<string[]> {
  await page.waitForTimeout(950);
  return page.evaluate(() => [...new Set(window.__VT_SAMPLES ?? [])].sort());
}

/** 탭 하나를 누르고 전환을 계측한다. */
async function probe(page: Page, target: Locator): Promise<string[]> {
  await startSampler(page);
  await target.click();
  return collect(page);
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

function expectPanelPush(samples: string[], panel: string, bar: string) {
  const joined = samples.join('\n');
  const has = (prefix: string) => samples.some((x) => x.startsWith(prefix));

  // ① 본문이 방향성 푸시로 애니메이트된다(old 는 빠지고 new 는 들어온다).
  expect(has(`::view-transition-old(${panel}) :: vt-panel-out-`),
    `본문(${panel})의 old 스냅샷이 vt-panel-out-* 로 애니메이트되지 않았다 — 전환이 안 돌았거나 이름이 안 붙었다
실측:
${joined}`)
    .toBe(true);
  expect(has(`::view-transition-new(${panel}) :: vt-panel-in-`),
    `본문(${panel})의 new 스냅샷이 vt-panel-in-* 로 애니메이트되지 않았다
실측:
${joined}`)
    .toBe(true);

  // ② root 는 정지 — 여기가 살아 있으면 헤더·히어로까지 페이지 전체가 밀린다(2026-08-29 회귀).
  const moved = (name: string) => samples.filter((x) =>
    (x.startsWith(`::view-transition-old(${name}) :: `) || x.startsWith(`::view-transition-new(${name}) :: `))
    && !x.endsWith(':: '));
  expect(moved('root'), `root 가 애니메이트됐다 — 탭바 위쪽까지 통째로 밀린다
실측:
${joined}`).toEqual([]);

  // ③ 탭바도 정지 — 손가락이 짚고 있는 바가 같이 움직이면 '어디를 눌렀는지'가 흔들린다.
  expect(moved(bar), `탭바(${bar})가 애니메이트됐다 — 제자리에 고정돼야 한다
실측:
${joined}`).toEqual([]);
}

/**
 * notif-tab 전용 계약(2026-09-14, 오너 리포트: "쪽지·알림 왔다갔다 할 때 박스가 팝업 밖으로
 * 왼쪽/오른쪽으로 갔다가 온다") — 위 expectPanelPush 와 **반대** 방향으로 건다.
 *
 * 왜 notif-panel 만 다른가: 다른 본문(admin-secpanel·venue-tab·rank-tab 등)은 뷰포트 폭을 쓰는
 * 전체화면 패널이라 방향성 푸시(vt-panel-in-r/out-l, ±18px translateX)가 안전하다. notif-panel 은
 * 좌우 여백 17px 짜리 **뜨는 작은 카드**인데(390px 모바일 실측: 카드 left=17·right=373), View
 * Transition 스냅샷은 top layer 로 올라가 카드의 overflow-hidden·rounded-card 클립을 안 받는다 —
 * 18px(여백 17px 초과) 를 밀면 카드 테두리를 넘어 화면 가장자리까지 삐져나갔다(실측: 전환 시작
 * 프레임의 실제 transform 이 `matrix(1,0,0,1,18,0)`). 그래서 notif-panel 만 old 를 페이드아웃만
 * 시키고(vt-fade-out, opacity 만), new 는 애니메이션 없이 즉시 자리를 지키게 바꿨다(index.css) —
 * new 에 페이드를 안 넣는 이유는 두 스냅샷이 동시에 반투명이면 글자가 두 벌로 겹쳐 보이던 옛
 * 버그(venue-tab 주석·검은 번쩍임 수정 때와 동일)가 돌아오기 때문이다.
 *
 * 이 계약이 지키는 것 — 누가 notif-panel 을 다시 공동 방향성 푸시 목록에 넣으면 빨개진다:
 *   ① old 는 vt-fade-out 을 쓴다(방향성 푸시 vt-panel-out-* 를 쓰면 안 된다)
 *   ② new 는 애니메이션이 전혀 없다(방향성 푸시 vt-panel-in-* 는 물론 어떤 키프레임도 없다)
 *   ③ root·탭바(notif-tabbar)는 여전히 정지 — 이건 다른 스코프와 같은 공용 계약이다.
 * notif-pill(알약)은 이 계약 대상이 아니다 — 전용 애니메이션 규칙이 원래 없어 브라우저 기본
 * 크로스페이드(-ua-view-transition-fade-*)를 그대로 쓰는 것이 기존 동작이다(내가 바꾼 적 없다).
 */
function expectNotifPanelFadeOnly(samples: string[]) {
  const joined = samples.join('\n');
  const has = (prefix: string) => samples.some((x) => x.startsWith(prefix));

  expect(has('::view-transition-old(notif-panel) :: vt-fade-out'),
    `notif-panel old 스냅샷이 vt-fade-out 으로 애니메이트되지 않았다
실측:
${joined}`).toBe(true);

  expect(has('::view-transition-old(notif-panel) :: vt-panel-out'),
    `notif-panel old 스냅샷이 방향성 푸시(vt-panel-out-*)를 다시 쓴다 — 팝업 카드 여백(17px)보다
큰 이동량(18px)이라 top layer 스냅샷이 카드 밖으로 삐져나간다(2026-09-14 오너 리포트 재발 조건)
실측:
${joined}`).toBe(false);

  expect(has('::view-transition-new(notif-panel) ::'),
    `notif-panel new 스냅샷에 애니메이션이 붙었다 — new 는 즉시 자리를 지켜야 한다(방향성 푸시로
되돌리면 위와 같은 재발 조건이고, 페이드를 넣으면 old 와 겹쳐 글자가 두 벌로 보이는 옛 버그가 온다)
실측:
${joined}`).toBe(false);

  const moved = (name: string) => samples.filter((x) =>
    (x.startsWith(`::view-transition-old(${name}) :: `) || x.startsWith(`::view-transition-new(${name}) :: `))
    && !x.endsWith(':: '));
  expect(moved('root'), `root 가 애니메이트됐다 — 탭바 위쪽까지 통째로 밀린다
실측:
${joined}`).toEqual([]);
  expect(moved('notif-tabbar'), `탭바(notif-tabbar)가 애니메이트됐다 — 제자리에 고정돼야 한다
실측:
${joined}`).toEqual([]);
}

// CI 러너(공유 vCPU)에서는 VT/스프링 프레임 타이밍이 흔들려 간헐 실패한다(2026-09-02 실측: 로컬 14/14 통과·CI 1회 실패 후 재실행 통과).
// 임계는 그대로, 재시도만 CI 에서 2회 — perf.spec 과 같은 규약.
test.describe.configure({ retries: process.env.CI ? 2 : 0 });
test.describe('하위 탭 — 방향성 푸시가 실제로 돈다', () => {
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
    const samples = await probe(page, bar.locator('[data-lane="rules"]'));
    expectNoViewTransition(samples, 'tools-lanepanel');
  });

  test('🔴 장터 카테고리(market-cat)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, 'market');
    const bar = page.locator('[data-market-catbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('button', { name: '용품', exact: true }));
    expectNoViewTransition(samples, 'market-panel');
  });

  test('🔴 딜러 커뮤니티 구인·구직 필터(dealer-kind)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, 'dealer');
    const bar = page.locator('[data-dealer-kindbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('button', { name: /^구인/ }));
    expectNoViewTransition(samples, 'dealer-panel');
  });

  test('🔴 랭킹 허브 세부 탭(rank-tab · 오너가 지목한 화면)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, 'rank');
    const bar = page.locator('[data-rank-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('button', { name: /명예/ }).first());
    expectNoViewTransition(samples, 'rank-panel');
  });

  test('🔴 내 정보 통합 페이지 탭(profile-tab)', async ({ page }) => {
    await boot(page);
    // 헤더 아바타 → 사용자 메뉴 → '내 정보'(2026-09-04 통합: 대시보드·프로필·설정·보안 4탭 — 앱의 실제 동선)
    await page.locator('button[aria-label$="메뉴"]').first().click();
    await page.getByRole('button', { name: '내 정보 열기' }).click();
    const bar = page.locator('[data-profile-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('tab', { name: '설정', exact: true }));
    expectNoViewTransition(samples, 'profile-panel');
  });

  test('🔴 알림 패널 쪽지·알림(notif-tab) — 방향성 푸시가 아니라 페이드아웃만 돈다', async ({ page }) => {
    await boot(page);
    await page.locator('button[aria-label^="알림"]').first().click();
    const bar = page.locator('[data-notif-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('tab', { name: '알림', exact: true }));
    // ⚠ 다른 스코프처럼 expectPanelPush(방향성 푸시)를 쓰지 않는다 — notif-panel 은 예외다.
    //   근거는 expectNotifPanelFadeOnly 주석 참고(팝업 카드 좌우 여백 17px < 푸시 이동량 18px).
    expectNoViewTransition(samples, 'notif-panel');
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
      const samples = await probe(page, bar.getByRole('button', { name: /명예/ }).first());
      const joined = samples.join('\n');
      // root 가 한 프레임이라도 밀리면(blur) 실패 — 마커가 전환보다 먼저 풀렸다는 뜻.
      expect(samples.filter((x) => /\(root\) :: vt-push-/.test(x)), `느린 기기에서 root 가 밀렸다(마커가 전환 도중 풀림)
실측:
${joined}`).toEqual([]);
      // 2026-09-18: 하위 탭은 VT 를 안 타므로 **느린 기기에서도 스냅샷이 아예 안 생긴다.**
      //   예전 이 테스트가 잡던 것(마커가 전환 도중 풀려 root 가 blur 로 밀림)은 구조적으로 불가능해졌다 —
      //   마커 자체가 안 켜진다. 그래도 이 케이스는 남긴다: 느린 기기에서 누가 VT 를 되살리면 여기서 걸린다.
      expectNoViewTransition(samples, 'rank-tab(CPU×8)');
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
