// Phase 10 게이트 — 매장 페이지 3계층 IA.
//
// 문서 검증 기준: ① 첫 뷰포트 인터랙티브 요소 ≤ 6 (콘텐츠 레벨 — 내비게이션인
// 뒤로가기·탭바는 제외하고 센다) ② 비로그인 사용자에게 단골 전용 UI(내 활동)가
// display:none 이 아니라 **DOM 미렌더**일 것.
import { test, expect } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays, SUPABASE_URL, ANON_KEY } from './_session';

/** 공개 매장 하나를 익명 REST 로 가져온다(테스트가 데이터에 결혼하지 않게) */
async function anyVenueId(): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?select=id&approved=eq.true&status=eq.active&limit=1`,
    { headers: { apikey: ANON_KEY } },
  );
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

test.describe('매장 페이지 — 3계층 IA', () => {
  test('🔴 비로그인 첫 뷰포트: 행동 요소 ≤6 · QR 체크인 존재 · 내 활동 미렌더', async ({ page }) => {
    const vid = await anyVenueId();
    test.skip(!vid, '공개 매장이 없어 판단 불가(데이터 부재)');

    await stabilizeBackstack(page);
    await page.goto(`/?v=${vid}`);
    await dismissOverlays(page);
    await expect(page.getByRole('dialog', { name: /매장 페이지/ })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);

    // Tier1 프라이머리 — QR 체크인이 스크롤 없이 보인다
    const checkin = page.getByRole('button', { name: /QR 체크인/ });
    await expect(checkin, 'Tier1 [QR 체크인] 이 없다').toBeVisible();
    const box = await checkin.boundingBox();
    expect(box!.y, 'QR 체크인이 첫 뷰포트(915px) 밖이다 — Tier1 이 아니다').toBeLessThan(915);

    // 첫 뷰포트 콘텐츠 레벨 인터랙티브 ≤ 6 (뒤로가기·탭바 role=tab 제외)
    const count = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-label*="매장 페이지"]');
      if (!dlg) return -1;
      let n = 0;
      for (const el of dlg.querySelectorAll<HTMLElement>('button, a, [role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top >= 915 || r.bottom <= 0) continue;               // 첫 뷰포트 밖
        if (el.getAttribute('role') === 'tab') continue;            // 내비게이션 탭
        if (el.getAttribute('aria-label') === '뒤로 가기') continue; // 내비게이션
        if (el.closest('summary')) continue;                         // 계층을 여는 손잡이 = 디스클로저(행동 아님)
        n += 1;
      }
      return n;
    });
    expect(count, `첫 뷰포트 행동 요소가 ${count}개 — 6개 이하여야 한다(계층이 무너짐)`).toBeLessThanOrEqual(6);
    expect(count).toBeGreaterThan(0);

    // Tier3 '내 활동' 은 비로그인에게 DOM 자체가 없다(미렌더 원칙)
    expect(await page.locator('text=🙋 내 활동').count(), '비로그인인데 내 활동 블록이 DOM 에 있다').toBe(0);
  });
});
