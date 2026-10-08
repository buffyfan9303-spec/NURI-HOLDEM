// 동의 게이트 닉네임 칸이 늦게 도착해도 아래 체크 목록이 밀리지 않는다 — 11회차 모션 점검 M11-01(P2, 2026-10-08).
//
// 사고: ConsentGateModal 의 닉네임 칸은 지연 청크 + `Suspense fallback={null}` 이라 도착 전 자리가 0px 이었다.
//   시트 진입 애니(≈240ms)가 끝난 뒤 칸이 도착하면 '전체 동의'와 필수 체크 6줄이 통째로 125px 밀렸다(CLS 0.0933, 5/5).
//   손가락이 '전체 동의' 로 가는 순간 그 자리가 닉네임 안내문으로 바뀐다. 소셜 가입자 전원이 처음 한 번 지나는 화면이다.
// 수정: fallback 이 칸의 처음 높이(라벨+입력+안내 2줄)만큼 자리를 예약한다.
// 음성 대조: ConsentGateModal 의 fallback 을 null 로 되돌리면 세 폭 모두 '전체 동의' y 변화·CLS 단언에서 실패한다.
//
// 운영 DB 에 쓰지 않는다 — 세션·프로필은 stubLogin(page.route)으로 만든다. 청크 응답만 늦춘다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

declare global { interface Window { __cls: number } }

// ⚠ 서비스워커를 막아야 한다 — 허용하면 SW 가 activate·claim 한 뒤(느린 CI 러너, 게이트가 늦게 뜨는 경우)의 청크 요청이
//   SW 를 거쳐 page.route 에 안 보인다. 그러면 붙잡기가 안 걸려 '청크를 요청하지 않았다' 로 실패한다(2026-10-08 CI e2e(1) 3폭 모두).
//   프로필 응답을 3초 늦춰 재현했고, 막으면 통과한다. lazy-chunk-retry-1008·mystore-followup-1003 도 같은 이유로 막는다.
test.use({ serviceWorkers: 'block' });

for (const width of [360, 390, 412]) {
  test(`🔴 동의 게이트 — 닉네임 칸이 시트 정착 뒤 도착해도 '전체 동의' 가 밀리지 않는다 (${width}px · M11-01)`, async ({ page }) => {
    test.setTimeout(60_000);
    await stubLogin(page, { agreed_to_terms: false, consented_legal_version: null });
    await stabilizeBackstack(page);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      window.__cls = 0;
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
            if (!e.hadRecentInput) window.__cls += e.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch { /* layout-shift 미지원 */ }
    });

    // 닉네임 칸 청크를 붙잡았다가 시트가 정착한 뒤에 놓는다 — 느린 모바일 망에서 정착(≈240ms)을 넘겨 도착하는 조건.
    let release!: () => void;
    const held = new Promise<void>((res) => { release = res; });
    let chunkRequested = false;
    await page.route(/\/assets\/SocialNicknameField-[^/]*\.js/, async (r) => {
      chunkRequested = true;
      await held;
      await r.continue();
    });

    await page.goto('/');
    const gate = page.locator('[role="dialog"]').filter({ has: page.getByRole('heading', { name: '서비스 이용 동의' }) }).first();
    await expect(gate, '동의 미이행 회원인데 게이트가 뜨지 않았다').toBeVisible({ timeout: 15_000 });
    await expect.poll(() => chunkRequested, { message: '닉네임 칸 청크를 요청하지 않았다 — 가로챈 경로가 틀렸다(거짓 통과 방지)' }).toBe(true);
    await expect(gate.getByTestId('social-nickname'), '칸이 아직 도착하면 안 된다(붙잡는 조건이 안 걸렸다)').toHaveCount(0);

    // 진입 애니가 끝나 '전체 동의' 줄이 멈출 때까지 기다린 뒤 y 를 잰다.
    const allAgree = gate.locator('label').filter({ hasText: '전체 동의' }).first();
    const yOf = () => allAgree.evaluate((el) => el.getBoundingClientRect().top);
    let prev = -1;
    await expect.poll(async () => { const y = await yOf(); const still = Math.abs(y - prev) < 0.5; prev = y; return still; }, { timeout: 5_000, intervals: [100] }).toBe(true);
    await page.waitForTimeout(300);
    const y0 = await yOf();
    const cls0 = await page.evaluate(() => window.__cls);

    release();
    await expect(gate.getByTestId('social-nickname'), '놓았는데 닉네임 칸이 뜨지 않았다').toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const y1 = await yOf();
    const cls1 = await page.evaluate(() => window.__cls);

    expect(Math.abs(y1 - y0), `칸이 도착하자 '전체 동의' 가 ${y0.toFixed(1)} → ${y1.toFixed(1)}px 로 밀렸다`).toBeLessThanOrEqual(1);
    expect(cls1 - cls0, `칸 도착 뒤 레이아웃 이동 합 ${(cls1 - cls0).toFixed(4)}`).toBeLessThan(0.005);
  });
}
