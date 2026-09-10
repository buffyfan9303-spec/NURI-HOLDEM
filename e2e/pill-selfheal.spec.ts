// 알약 자기교정 — 어떤 이유로든 어긋나면 스스로 제자리로 돌아온다.
//
// 왜 필요한가(2026-09-10 오너 재보고): 활성 라벨은 '장터'인데 보라색 알약이 레일 맨 왼쪽에
// 남아 있는 화면을 실제로 다시 목격했다. 재현 시나리오 26가지(섹션 6종 전환·탭 왕복·숨은 채
// 섹션 변경·회전·새로고침·뒤로가기 × 360/412px)를 돌려도 어긋남 0건이라 그때는 원인을 못 짚었고,
// '증상이 남아 있을 수 없게' 그물을 쳤다(SlidingPill 의 MutationObserver + visibilitychange + 3·5초 타이머).
// 진짜 원인(프레스 transform 이 offsetParent 를 바꿔 offsetLeft=0)은 같은 날 e2e/pill-press.spec.ts 가
// 잠근다. 이 스펙은 그와 별개로 그물이 실제로 도는지를 잠근다 — 방어선은 남긴다.
//
// 방법: 알약을 강제로 엉뚱한 자리에 박아 놓고, 실제 상황에서 일어나는 신호(바 안의 DOM 변경 ·
// 탭 복귀)를 준 뒤 제자리로 돌아오는지 본다. 운영 DB 에는 쓰지 않는다(_fixtures 가드).
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

/** 알약과 활성 탭의 어긋남(px). 알약이 숨겨져 있으면 null. */
const misalign = (page: Page) => page.evaluate(() => {
  const bar = document.querySelector('[data-community-secbar]');
  const pill = bar?.querySelector('[data-sliding-pill]') as HTMLElement | null;
  const act = bar?.querySelector('[data-pill-active]') as HTMLElement | null;
  if (!bar || !pill || !act) return null;
  if (Number(getComputedStyle(pill).opacity) < 0.05) return null;
  const p = pill.getBoundingClientRect(), a = act.getBoundingClientRect();
  return { dx: +Math.abs(p.left - a.left).toFixed(1), dw: +Math.abs(p.width - a.width).toFixed(1), active: (act.textContent || '').trim() };
});

/** 알약을 레일 맨 왼쪽(오너가 본 그 자리)에 강제로 박는다 — 전환 없이. */
const breakPill = (page: Page) => page.evaluate(() => {
  const pill = document.querySelector('[data-community-secbar] [data-sliding-pill]') as HTMLElement | null;
  if (!pill) return false;
  pill.style.transition = 'none';
  pill.style.transform = 'translate(0px, 0px)';
  pill.style.opacity = '1';
  return true;
});

async function openMarket(page: Page) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  const market = bar.getByRole('button', { name: '장터', exact: true });
  if (await market.count() === 0) test.skip(true, '이 계정/구성에 장터 슬롯이 없다');
  await market.click();
  await page.waitForTimeout(900);
  const m = await misalign(page);
  expect(m, '장터 선택 직후 알약이 없다').not.toBeNull();
  expect(m!.active, '활성 탭이 장터가 아니다').toBe('장터');
  expect(m!.dx, '전제부터 어긋나 있다').toBeLessThan(2);
}

test('🔴 알약이 어긋나면 바 안의 DOM 변경 한 번으로 스스로 제자리로 온다 (PILL-01)', async ({ page }) => {
  test.setTimeout(60_000);
  await openMarket(page);

  expect(await breakPill(page), '알약을 찾지 못했다').toBe(true);
  const broken = await misalign(page);
  expect(broken!.dx, '강제로 어긋내지 못했다 — 이 스펙이 아무것도 검사하지 않는다').toBeGreaterThan(20);

  // 실제 상황에서 늘 일어나는 신호: 바 안의 어떤 노드든 속성이 바뀐다(활성 표시·VT 스냅샷 부착 등)
  await page.evaluate(() => {
    const b = document.querySelector('[data-community-secbar] button') as HTMLElement | null;
    b?.classList.add('nuri-probe'); b?.classList.remove('nuri-probe');
  });

  await expect.poll(async () => (await misalign(page))?.dx ?? 999, {
    timeout: 3_000, message: '바 안의 DOM 이 바뀌었는데도 알약이 어긋난 자리에 그대로 있다',
  }).toBeLessThan(2);
});

test('🔴 알약이 어긋난 채 탭을 떠났다 돌아와도 제자리로 온다 (PILL-02)', async ({ page }) => {
  test.setTimeout(60_000);
  await openMarket(page);
  await breakPill(page);

  // 최상위 탭은 언마운트하지 않고 display 로만 꺼진다 — 숨었다 다시 보이는 경로
  await page.getByRole('button', { name: '홈', exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '커뮤니티', exact: true })
    .or(page.getByRole('tab', { name: '커뮤니티', exact: true })).first().click();

  await expect.poll(async () => (await misalign(page))?.dx ?? 999, {
    timeout: 5_000, message: '탭 복귀 후에도 알약이 어긋난 자리에 남아 있다',
  }).toBeLessThan(2);
});

// PILL-03(자기교정이 슬라이드를 죽이지 않는가)은 여기 두지 않는다 — 전제가 틀렸다.
// View Transition 경로에서는 **실제 요소가 의도적으로 즉시 최종 위치로 간다**(SlidingPill 주석 참조):
// 미끄러짐은 라이브 요소가 아니라 VT 스냅샷이 담당한다. 그래서 요소의 rect 를 프레임마다 재면
// 정상 동작에서도 '중간 위치가 없다'로 나온다. 그 보간은 e2e/subtab-motion.spec.ts:223 이,
// '보이는 동안 언제나 활성 탭 자리'는 e2e/sliding-pill-hidden.spec.ts 가 이미 잠그고 있다.

test('🔴 근본원인 — 한 틱에 전환이 두 번 열려도 vt-scope 마커가 남지 않는다 (PILL-04)', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);

  // '내 장터 거래'·'랭킹 상점' 바로가기와 **같은 순서**: 섹션 이벤트(scope 있는 전환) →
  // 곧바로 탭 이동(scope 없는 전환). 예전엔 두 번째가 첫 번째의 마커를 지우지도 덮지도 않아
  // html[data-vt-scope='community-sec'] 가 영구히 눌러앉았고, 그때부터 서브탭 바·알약·활성 라벨에
  // view-transition-name 이 상시 붙어 옛 스냅샷이 얼어붙은 채 남았다(= 알약이 첫 칸에 박히는 화면).
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('nuri:community-section', { detail: 'market' }));
    try { sessionStorage.setItem('nuri:community-section', 'market'); } catch { /* 차단 */ }
  });
  await page.getByRole('button', { name: '커뮤니티', exact: true })
    .or(page.getByRole('tab', { name: '커뮤니티', exact: true })).first().click();
  await page.waitForTimeout(1500);

  const scope = await page.evaluate(() => document.documentElement.dataset.vtScope ?? null);
  expect(scope, 'vt-scope 마커가 전환이 끝난 뒤에도 남아 있다 — 옛 스냅샷이 얼어붙는다').toBeNull();

  // 마커가 걷혔으면 서브탭 요소에 view-transition-name 이 붙어 있지 않아야 한다
  const names = await page.evaluate(() => {
    const bar = document.querySelector('[data-community-secbar]');
    if (!bar) return [];
    const pick = (el: Element | null) => (el ? getComputedStyle(el).viewTransitionName : 'none');
    return [pick(bar), pick(bar.querySelector('[data-sliding-pill]')), pick(bar.querySelector('[data-pill-active]'))];
  });
  expect(names.filter((n) => n && n !== 'none'), '전환이 끝났는데 view-transition-name 이 상시로 붙어 있다').toEqual([]);

  // 그리고 알약은 활성 탭 자리에 있다
  const m = await misalign(page);
  if (m) expect(m.dx, `알약이 활성 탭(${m.active})이 아닌 자리에 있다`).toBeLessThan(2);
});

test('🔴 업주 전용 커뮤니티는 폐기됐다 — 매장 서브탭이 없다 (PILL-05)', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(bar.getByRole('button', { name: '매장', exact: true }), '폐기한 업주 커뮤니티 탭이 남아 있다').toHaveCount(0);
  await expect(page.locator('[data-sec="owner"]'), '업주 커뮤니티 판이 남아 있다').toHaveCount(0);
  // 탭 수 상한 6 — --tab-cols(=5+장터) 계산과 정확히 맞아야 레일이 넘치지 않는다
  const n = await bar.locator('button').count();
  expect(n, `서브탭이 ${n}개다 — --tab-cols 계산(최대 6)과 어긋나면 레일이 넘친다`).toBeLessThanOrEqual(6);
});
