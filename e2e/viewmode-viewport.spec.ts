// 표 모드의 뷰포트 가드 — "목록이 통째로 사라지는" 실패 모드를 막는다.
//
// 배경: 표 모드는 md(768px) 를 경계로 '표' 와 '모바일 리스트' 두 벌로 갈린다. 예전에는 둘 다
// 렌더하고 CSS 로 한쪽만 감췄다(보이지 않는 카드 120장이 그대로 렌더됨). 성능을 위해 폭에 맞는
// 쪽만 렌더하도록 바꿨는데, 이 방식의 실패 모드가 고약하다 — JS 가 판단한 폭이 실제와 어긋나면
// CSS 가 감추는 쪽만 렌더돼 **일정 목록이 빈 화면이 된다**.
//
// 왜 유닛이 아니라 여기인가: 이 결함은 'matchMedia 구독이 실제 폭을 따라가는가' 에 달려 있어
// 진짜 뷰포트 변경이 필요하다. 실제로 브라우저 뷰포트 에뮬레이션 중에는 matchMedia 의 change 도
// resize 도 발화하지 않는 환경이 있었다(2026-08-28 실측) — 그런 환경에서는 이 결함이 안 보인다.
// Playwright 의 setViewportSize 는 실제로 이벤트를 발생시키므로 여기서만 정직하게 잡힌다.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

test('표 모드 — 1440/900/375 어디서도 일정이 화면에 보인다', async ({ page }) => {
  await page.goto('/?tab=browse');
  await page.locator('button[aria-label^="알림"]').first().waitFor({ timeout: 30_000 });

  const tableBtn = page.locator('button[aria-label="표 보기"]');
  await tableBtn.waitFor({ timeout: 15_000 });
  await tableBtn.click();
  await page.waitForTimeout(600);

  // 데이터 의존: 예정 대회가 0건인 날엔 '행이 사라졌는가' 를 잴 수 없다 — 빈 상태 문구가 보이면 skip
  if (await page.getByText(/예정 대회가 아직 없|일정이 없/).first().isVisible().catch(() => false)) {
    test.skip(true, '표시할 일정 0건 — 라이브 데이터 의존');
  }
  for (const w of [1440, 900, 375, 1200, 375]) {
    await page.setViewportSize({ width: w, height: 820 });
    await page.waitForTimeout(500);
    // 표(td) 든 리스트 카드든, '보이는' 일정 행이 최소 1개는 있어야 한다
    const visibleRows = await page.evaluate(() => {
      const seen = new Set<string>();
      for (const el of document.querySelectorAll('table tbody tr, [class*="divide-y"] > *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (el.textContent || '').trim().length > 4) {
          seen.add((el.textContent || '').trim().slice(0, 24));
        }
      }
      return seen.size;
    });
    expect(visibleRows, `폭 ${w}px 에서 보이는 일정 행이 0개 — 목록이 사라졌다`).toBeGreaterThan(0);
  }
});
