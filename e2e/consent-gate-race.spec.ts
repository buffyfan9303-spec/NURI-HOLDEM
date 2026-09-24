// 법적 동의 게이트는 **첫 화면부터** 떠 있어야 한다 — 지연 청크가 늦어도(2026-09-24 verifier 반려 건).
//
// 사고: 번들 여유(요구 D)를 만들면서 ConsentGateModal 을 지연 청크(shellDeferred)로 옮겼더니, 청크를 3초 늦추자
//   agreed_to_terms=false 회원에게 0~2500ms 동안 게이트 dialog 가 0개이고 앱을 그대로 조작할 수 있었다.
//   클라이언트에서 미동의를 막는 곳은 이 모달뿐이다(requireLogin·AuthContext·API 에 agreedToTerms 검사 없음).
// 재현: 지연 청크(shellDeferred 와 그 안의 모듈)를 3초 붙잡은 채로, 그 사이에 게이트가 보이고 뒤 화면(탭 전환)이 막히는지 본다.
// 음성 대조: ConsentGateModal 을 다시 shellDeferred 로 옮기면 게이트가 붙잡힌 동안 안 떠 실패한다.
// 운영 DB 에 쓰지 않는다 — 세션·프로필은 stubLogin(page.route)으로 만든다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

// prod 빌드에선 SW 가 /assets 를 가져가 page.route 가 못 잡는다(tab-cover TC5 와 같은 이유).
test.use({ serviceWorkers: 'block' });

// dev: /src/components/features/<이름>.tsx · prod: /assets/<이름>-<해시>.js
const DEFERRED = /\/(shellDeferred|NotificationPanel|VerifyGateSheet|StaffInviteBanner|LevelUpCelebration)[-.][^/]*$/;
const HOLD_MS = 3000;

test('🔴 동의 미이행 회원 — 지연 청크가 3초 늦어도 그 사이 동의 게이트가 떠 있고 탭 전환이 막힌다', async ({ page }) => {
  test.setTimeout(60_000);
  let held = 0, released = 0;
  await page.route(DEFERRED, async (r) => {
    held++;
    await new Promise((res) => setTimeout(res, HOLD_MS));
    released++;
    await r.continue();
  });
  await stubLogin(page, { agreed_to_terms: false, consented_legal_version: null });
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const gate = page.locator('[role="dialog"]').filter({ has: page.getByRole('heading', { name: '서비스 이용 동의' }) }).first();
  await expect(gate, '지연 청크가 붙잡힌 동안 동의 게이트가 뜨지 않았다 — 게이트가 지연 청크에 들어갔는지 확인').toBeVisible({ timeout: HOLD_MS - 500 });
  expect(held, '지연 청크 요청을 한 건도 못 잡았다 — 패턴이 빗나가면 이 테스트는 거짓 통과한다').toBeGreaterThan(0);
  expect(released, '게이트가 지연 청크가 풀린 뒤에야 떴다').toBe(0);

  // 뒤 화면이 가려졌는가 — 탭바 라이브 칸 좌표에 **하단 내비가 아닌 것**이 잡혀야 한다.
  //   ⚠ 그 좌표를 실제로 누르지 않는다(2026-09-24 간헐 실패 원인): 390×844 에서 동의 시트(높이 622)가 탭바를 덮어
  //     라이브 칸 중심이 정착한 시트의 '로그아웃' 버튼이다. 누르면 로그아웃→게이트 소멸로 12회 중 2회 실패했다.
  const liveBtn = page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: '라이브', exact: true });
  const box = await liveBtn.boundingBox();
  expect(box, '하단 탭바 라이브 칸을 못 찾았다 — 가려졌는지 알 수 없다').not.toBeNull();
  const navHit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return !!el?.closest('nav[aria-label="하단 내비게이션"]');
  }, [box!.x + box!.width / 2, box!.y + box!.height / 2]);
  expect(navHit, '동의 게이트가 떠 있는데 하단 내비가 손가락에 그대로 닿는다').toBe(false);

  // 실제 누르기는 **시트 위쪽 딤**에 한다 — 뒤 화면(헤더·홈 본문) 위라 가림막이 없으면 뒤로 샌다.
  const gateTop = (await gate.boundingBox())?.y ?? 0;
  expect(gateTop, '게이트 시트 위쪽에 딤 영역이 없다 — 누를 자리를 못 잡았다').toBeGreaterThan(40);
  const dimY = Math.round(gateTop / 2);
  const dimHit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return !!el && !el.closest('[role="dialog"]') && !!el.closest('[data-scroll-lock]');
  }, [195, dimY]);
  expect(dimHit, '시트 위쪽 좌표에 모달 딤이 아닌 것이 잡힌다 — 뒤 화면이 노출돼 있다').toBe(true);
  await page.mouse.click(195, dimY);
  await page.waitForTimeout(400);
  await expect(page.locator('.tab-pane[data-tab="live"]'), '동의 게이트 뒤에서 탭 전환이 먹혔다').toBeHidden();
  await expect(gate, '딤을 눌렀더니 동의 게이트가 사라졌다').toBeVisible();
  expect(released, '측정이 지연 창(3초)을 넘겼다 — 위 단언이 청크 도착 뒤를 본 것일 수 있다').toBe(0);
});

// 양성 대조 — 같은 좌표 클릭이 게이트가 없을 때는 실제로 탭을 넘긴다(위 '막혔다' 가 클릭 방식의 헛발이 아님을 보인다).
test('대조: 동의한 회원은 같은 좌표 클릭으로 라이브 탭으로 넘어간다', async ({ page }) => {
  test.setTimeout(60_000);
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const liveBtn = page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: '라이브', exact: true });
  await expect(liveBtn).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  const box = await liveBtn.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.locator('.tab-pane[data-tab="live"]')).toBeVisible({ timeout: 10_000 });
});
