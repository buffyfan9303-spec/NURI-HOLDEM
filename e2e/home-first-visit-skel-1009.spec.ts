// e2e/home-first-visit-skel-1009.spec.ts — 홈 첫 방문 일정 뼈대 높이(오픈 점검 H-01, P3).
//
// 결함: 지난 방문 기록(nuri:upcoming-seen)이 없는 첫 방문자에게 일정 뼈대가 기본 4줄(322px)로 그려졌다가
//   실제 1건(114px)으로 줄며 '오늘의 운세'(home-mind)와 푸터가 208px 위로 튀었다(운영 느린 망 CLS 0.0706, 3/3).
//   운영은 대회가 있는 날 모두 하루 1건이다(10-09 읽기 전용 조회) → 첫 방문 기본값을 1줄로 맞췄다.
// 계약: 저장소가 빈 첫 방문 · 오늘 1건 · 일정 응답 1.5초 지연(느린 망 대용 — 뼈대가 반드시 한 번 그려진다)에서
//   ① 뼈대 높이 ≈ 실제 목록 높이(±2px) ② home-mind 의 위치가 뼈대 → 목록 사이에 움직이지 않는다(±2px).
// 음성 대조(2026-10-09): origin/main(기본 4줄) 같은 목 — 뼈대 322 · 목록 114.25 · home-mind 764→556 · CLS 0.068 → ①② 실패.
//   이 빌드: 뼈대 115 · 목록 114.25 · home-mind 556→556 · CLS 0.0001 (scratchpad home.cjs, 3/3).
// ⚠ 운영 DB 무접촉 — 일정은 page.route 로 답한다. 쓰기 0.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';
import { kstDay } from './_schedules';
import { mockScheduleRow } from './_mocks';

test('🔴 H-01 홈 첫 방문(오늘 1건) — 일정 뼈대가 실제 목록 높이와 같아 아래가 튀지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/schedules\?/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    await new Promise((res) => setTimeout(res, 1500));
    const row = { ...mockScheduleRow(), date: kstDay(0), start_time: '23:50:00' };
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
  });
  await page.goto('/?tab=home');
  expect(await page.evaluate(() => { try { return localStorage.getItem('nuri:upcoming-seen'); } catch { return 'blocked'; } }), '첫 방문이어야 한다').toBeNull();

  const skel = page.getByTestId('home-schedule-skeleton');
  await expect(skel, '뼈대가 그려지지 않았다(응답 지연 목이 안 먹음)').toBeVisible({ timeout: 20_000 });
  // home-mind 위치는 **일정 칸 위 끝 기준**으로 잰다 — 위쪽 구역(운영 클락 '지금 등록 가능' 등)이 늦게 와도 이 단언이 흔들리지 않게.
  const before = await page.evaluate(() => {
    const sk = document.querySelector('[data-testid="home-schedule-skeleton"]')!.getBoundingClientRect();
    const mind = document.querySelector('[data-testid="home-mind"]')?.getBoundingClientRect().top;
    return { skelH: sk.height, mind: mind == null ? null : mind - sk.top };
  });
  await expect(skel).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('home-schedule-count')).toHaveText('대회 1개');
  const after = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="home-schedule-title"]')!.closest('header')!.nextElementSibling!.getBoundingClientRect();
    const mind = document.querySelector('[data-testid="home-mind"]')?.getBoundingClientRect().top;
    return { listH: list.height, mind: mind == null ? null : mind - list.top };
  });
  console.log(`[h01] ${JSON.stringify({ before, after })}`);
  expect(Math.abs(before.skelH - after.listH), `뼈대 ${before.skelH} ≠ 실제 목록 ${after.listH} — 첫 방문 밀림`).toBeLessThanOrEqual(2);
  expect(before.mind, 'home-mind 가 없다').not.toBeNull();
  expect(Math.abs(before.mind! - after.mind!), `home-mind ${before.mind}→${after.mind} — 아래가 튀었다`).toBeLessThanOrEqual(2);
});
