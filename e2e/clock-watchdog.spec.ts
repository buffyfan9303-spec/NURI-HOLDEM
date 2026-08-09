// 운영자 워치독 E2E — '장부 섹션에 머무는 동안에도 레벨이 전진하는가'.
//
// 이 결함의 본질: 전진이 250ms 표시 틱의 재렌더에 얹혀 있었고 그 틱은 `!active` 면 죽었다.
//   업주가 장부로 옮기면 클락 섹션은 display:none 으로 마운트만 남아 전진이 멈췄고,
//   손님 TV 가 00:00 에 얼었다. 그래서 검증의 핵심은 **화면이 안 보이는 동안** 이다.
//
// 사전 조건(테스트 매장에 심는다 — 실 운영 매장 금지):
//   clock_states 에 running=true, 짧은 레벨(0.1분=6초), ends_at = now()+5초 인 행.
// 환경변수: E2E_EMAIL / E2E_PASSWORD (테스트 업주 계정), E2E_WATCHDOG_VENUE(선택)
//
// 실행: npx playwright test e2e/clock-watchdog.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs, dismissOverlays } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('운영자 워치독 — 클락 화면을 안 보고 있어도 전진한다', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정');
  // 레벨이 여러 번 넘어가길 기다려야 해서 기본 30초로는 부족하다
  test.setTimeout(120_000);

  test('🔴 장부 섹션에 머무는 동안 clock_states 가 전진 기록된다', async ({ page }) => {
    const clockWrites: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      const u = r.url();
      if (u.includes('/rest/v1/clock_states') && r.method() !== 'GET') {
        clockWrites.push(`${r.method()} @${new Date().toISOString().slice(11, 19)}`);
      }
    });

    // ── 로그인(세션 직접 주입 — 로그인 UI 를 거치지 않는다) ──────────────────
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    // 세션이 실제로 붙었는지: 헤더의 '로그인' 버튼이 사라진다
    await expect(page.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 20_000 });
    await dismissOverlays(page); // 온보딩 '시작하기' 모달이 하단 탭바 클릭을 가로챈다

    // ── 내 매장 → 클락 섹션(ClockLive 마운트) ──────────────────────────────
    // 워치독은 ClockLive 안에 있으므로, 한 번은 클락 섹션을 열어 마운트시켜야 한다.
    // (마운트조차 안 된 경우는 장부 리모컨 백업 워치독이 담당 — 별도 경로)
    await page.getByRole('button', { name: /내 ?매장/ }).first().click();
    await page.waitForTimeout(2500);

    const clockNav = page.getByRole('button', { name: /클락|타이머/ }).first();
    if (await clockNav.count()) {
      await clockNav.click();
      await page.waitForTimeout(2500);
    }

    // ── 장부 섹션으로 이동 = 클락은 display:none 으로 숨는다 ────────────────
    const ledgerNav = page.getByRole('button', { name: /장부/ }).first();
    if (await ledgerNav.count()) {
      await ledgerNav.click();
    }
    await page.waitForTimeout(1500);

    const writesBefore = clockWrites.length;

    // ── 여기가 검증의 핵심: 클락이 안 보이는 채로 레벨 경계를 여러 번 지나간다 ──
    // 레벨이 6초이므로 25초면 3~4레벨이 넘어간다.
    await page.waitForTimeout(25_000);

    const gained = clockWrites.length - writesBefore;
    expect(
      gained,
      `클락 섹션이 숨겨진 동안 clock_states 쓰기가 없었다 — 워치독이 안 돈다는 뜻.\n`
      + `전체 쓰기 기록: ${clockWrites.join(', ') || '(없음)'}`,
    ).toBeGreaterThan(0);

    expect(errors, `실행 중 예외: ${errors.join(' | ')}`).toEqual([]);
  });
});
