// 운영자 워치독 E2E — '장부 섹션에 머무는 동안에도 레벨이 전진하는가'.
//
// 이 결함의 본질: 전진이 250ms 표시 틱의 재렌더에 얹혀 있었고 그 틱은 `!active` 면 죽었다.
//   업주가 장부로 옮기면 클락 섹션은 display:none 으로 마운트만 남아 전진이 멈췄고,
//   손님 TV 가 00:00 에 얼었다. 그래서 검증의 핵심은 **화면이 안 보이는 동안** 이다.
//
// 사전 조건: **테스트가 직접 심는다.**
//   ⚠ 예전에는 사람이 SQL 로 미리 넣어둔 clock_states 행에 기대고 있었다.
//     그 행이 만료·삭제되자(실제로 0행이 됐다) 테스트는 영구 실패로 바뀌었고,
//     그때부터는 실패가 결함 신호가 아니라 '원래 저래' 로 읽혔다 — 게이트로서 죽은 것이다.
//     그래서 이제 로그인한 업주 자격으로 러닝 클락을 직접 만들고, 끝나면 되돌린다.
//     service key 가 아니라 앱과 같은 사용자 토큰을 쓰므로 RLS 를 우회하지 않는다.
// 환경변수: E2E_EMAIL / E2E_PASSWORD (테스트 업주 계정), E2E_WATCHDOG_VENUE(선택)
//
// 실행: npx playwright test e2e/clock-watchdog.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs, dismissOverlays, restAs, type E2ESession } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const LEVEL_SEC = 6; // 짧은 레벨 — 25초 안에 3~4번 경계를 넘게 한다

/** 6초짜리 레벨 40개 — 테스트 도중 레벨이 동나지 않게 넉넉히 */
function shortLevels() {
  return Array.from({ length: 40 }, (_, i) => ({
    kind: 'level' as const,
    sb: 100 * (i + 1), bb: 200 * (i + 1), ante: 0,
    minutes: LEVEL_SEC / 60,
  }));
}

/** 업주 자격으로 '지금 돌고 있는 클락' 을 심는다. 반환값은 정리용 venueId. */
async function seedRunningClock(session: E2ESession): Promise<string> {
  const uid = (session.user as { id: string }).id;
  const venueId = process.env.E2E_WATCHDOG_VENUE
    ?? (await restAs(session, `venues?select=id&owner_id=eq.${uid}&limit=1`) as { id: string }[])[0]?.id;
  if (!venueId) throw new Error('테스트 계정이 소유한 매장을 찾지 못했다 — E2E_WATCHDOG_VENUE 로 직접 지정하라');

  await restAs(session, 'clock_states', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates', // PK(venue_id, game_seq) 기준 upsert
    body: {
      venue_id: venueId,
      game_seq: 1,
      session_date: new Date().toLocaleDateString('en-CA'),
      title: 'E2E 워치독',
      running: true,
      current_index: 0,
      // 첫 경계를 5초 뒤로 둔다 — 테스트가 곧바로 전진을 관찰할 수 있게
      ends_at: new Date(Date.now() + 5_000).toISOString(),
      remaining_ms: 5_000,
      config: {
        title: 'E2E 워치독', startStack: 30000, rebuyStack: 30000, addonStack: 30000,
        isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0,
        regCloseLevel: 99, maxLevel: 40, earlyDoubleLevel: 0, earlySingleLevel: 0,
        earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
        prizes: [], levels: shortLevels(),
      },
    },
  });
  return venueId;
}

/** 심어둔 클락을 멈춘다 — 실패해도 테스트 결과를 덮지 않게 조용히 넘어간다 */
async function stopClock(session: E2ESession, venueId: string) {
  await restAs(session, `clock_states?venue_id=eq.${venueId}&game_seq=eq.1`, {
    method: 'PATCH', body: { running: false },
  }).catch(() => { /* 정리 실패는 무시 */ });
}

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
    const session = await loginAs(page, EMAIL!, PASSWORD!);
    // ── 픽스처: 지금 돌고 있는 클락을 직접 심는다(끝나면 반드시 멈춘다) ────────
    const venueId = await seedRunningClock(session);
    try {
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
    } finally {
      // 실패하든 성공하든 반드시 멈춘다 — 켜진 채로 남으면 다음 실행이 오염되고,
      // 무엇보다 '테스트가 남긴 유령 대회' 가 라이브 목록에 뜬다.
      await stopClock(session, venueId);
    }
  });
});
