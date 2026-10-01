// 캘린더 조회가 실패하면 오류 카드가 요약 **위에** 끼어들어 첫 화면이 통째로 밀리던 것 (R-06 · audit-regress-1001 · 2026-10-01).
//
// 실측(수정 전 · 390 · 목 로그인 = 조회 401): 진입 +700~970ms 에 LoadErrorCard(182px) 삽입 → 요약·그리드 +190px, CLS 0.1913.
//   입력(탭 누름) 뒤 500ms 창 밖이라 전부 계상된다. 정상 세션에선 안 나는 **오류 경로 한정**이다.
// 잠그는 것: 오류 카드가 실제로 뜬 상태에서(전제 — 0건 거짓 통과 방지) 진입 뒤 입력 밖 layout-shift 합 < 0.01,
//   그리고 오류 카드 등장 전후로 요약(cal-summary)의 화면 위치가 그대로다.
import { test, expect } from './_fixtures';
import { stubLogin } from './_session';

test.use({ viewport: { width: 390, height: 844 } });

test('🔴 캘린더 조회 실패 — 오류 카드가 첫 화면을 밀지 않는다', async ({ page }) => {
  await stubLogin(page); // 서명 없는 세션 — 캘린더 조회(찜·예약·뱅크롤)가 401 로 실패한다
  await page.goto('/');
  await expect(page.locator('nav[aria-label="하단 내비게이션"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as unknown as { __ls: { v: number; src: string[] } };
    w.__ls = { v: 0, src: [] };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
        if (e.hadRecentInput) continue;
        w.__ls.v += e.value;
        for (const s of e.sources ?? []) { const n = s.node as HTMLElement | undefined; w.__ls.src.push(n ? `${n.nodeName}[${n.getAttribute?.('data-testid') ?? ''}].${String(n.className ?? '').slice(0, 30)}` : '?'); }
      }
    }).observe({ type: 'layout-shift' });
  });
  // 저가폰에서 실패 응답은 누름 뒤 0.7~1초에 온다(감사 CPU6 실측) — 입력 창(500ms) 밖에 도착하게 늦춘다.
  //   빠른 PC 에선 카드가 입력 창 안에 들어와 결함이 가려진다(수정 전 빌드도 통과 — 음성 대조로 확인한 함정).
  await page.route(/\/rest\/v1\//, async (r) => { await new Promise((res) => setTimeout(res, 900)); return r.fallback(); });
  await page.locator('nav[aria-label="하단 내비게이션"] button').filter({ hasText: /^캘린더$/ }).click();
  const pane = page.locator('main[data-tab="calendar"]');
  const summary = pane.getByTestId('cal-summary');
  await expect(summary).toBeVisible({ timeout: 15_000 });
  // boundingBox 는 가려진(visibility) 요소에 null 을 준다 — 수정 뒤 요약은 실패 줄 밑에 가려진 채 자리만 지킨다.
  const yOf = () => summary.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  const y0 = await yOf();
  await expect(pane.getByRole('alert').first(), '전제: 조회 실패 카드가 떠야 이 결함 경로를 잰다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  const y1 = await yOf();
  const r = await page.evaluate(() => (window as unknown as { __ls: { v: number; src: string[] } }).__ls);
  expect.soft(Math.abs(y1 - y0), `오류 카드가 요약을 ${y1 - y0}px 밀었다`).toBeLessThan(1);
  expect(r.v, `CLS ${r.v.toFixed(4)} · 원인 ${[...new Set(r.src)].join(' | ')}`).toBeLessThan(0.01);
});
