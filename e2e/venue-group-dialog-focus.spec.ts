// U06(2026-09-12) — 매장/그룹 상세 오버레이 focus·접근성 계약.
//
// design-reviewer 실측(390 dark, 로티아레나 진입) 재현:
//  ① role="dialog" aria-modal="true" 는 있는데 focus 가 다이얼로그로 들어가지 않았다.
//  ② 배경 focusable 28개가 탭 순서에 남아, 뒤로가기(첫 실질 컨트롤)에 닿기까지 9번을 지나야 했다.
//  ③ GroupPage 는 role·aria-modal 자체가 없었다(VenuePage 와 계약이 다름).
//  ⑤ ESC 가 focus 를 BODY 로 흘렸다.
//
// 이 스펙은 나(home-team)는 실행하지 않는다 — 포트 5173/4173 이 동시 편집 중인 다른 세션과 겹친다.
// nuri-lead 가 프로덕션 빌드(4173)에서 돌린다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays, SUPABASE_URL, ANON_KEY } from './_session';

async function anyVenueId(): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?select=id&approved=eq.true&status=eq.active&kind=eq.venue&limit=1`,
    { headers: { apikey: ANON_KEY } },
  );
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

/** 매장이 아닌 커뮤니티 그룹(딜러팀·동호회·유튜버) 하나 — GroupPage 로 열린다. */
async function anyGroupId(): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?select=id&status=eq.active&kind=neq.venue&limit=1`,
    { headers: { apikey: ANON_KEY } },
  );
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

test.describe('매장/그룹 상세 오버레이 — focus 계약(U06)', () => {
  test('🔴 매장 페이지가 열리면 focus 가 다이얼로그 안으로 들어간다(배경에 남지 않는다)', async ({ page }) => {
    const vid = await anyVenueId();
    test.skip(!vid, '공개 매장이 없어 판단 불가(데이터 부재)');

    await stabilizeBackstack(page);
    await page.goto(`/?v=${vid}`);
    const dlg = page.getByRole('dialog', { name: /매장 페이지/ });
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await dismissOverlays(page);
    await page.waitForTimeout(1200);

    // 계약 ①: 열린 뒤 활성 요소가 다이얼로그 안에 있어야 한다(배경 카드·법적 푸터가 아니라).
    const activeInDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label*="매장 페이지"]');
      return !!d && d.contains(document.activeElement);
    });
    expect(activeInDialog, '열린 직후 활성 요소가 다이얼로그 밖에 있다(focus 가 안 들어갔다)').toBe(true);

    // 계약 ②: 다이얼로그 안에서 Tab 을 몇 번 눌러도 활성 요소는 계속 다이얼로그 안에 머문다 —
    // 배경 focusable(로켓단 카드·법적 고지 등)로 새면 실패. 10회면 예전 실측(뒤로가기가 10번째)을 덮는다.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const stillInside = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"][aria-label*="매장 페이지"]');
        return !!d && d.contains(document.activeElement);
      });
      expect(stillInside, `Tab ${i + 1}회 후 focus 가 다이얼로그 밖으로 샜다`).toBe(true);
    }
  });

  test('🔴 ESC 로 매장 페이지를 닫으면 focus 가 BODY 가 아니라 열기 전 요소로 돌아간다', async ({ page }) => {
    const vid = await anyVenueId();
    test.skip(!vid, '공개 매장이 없어 판단 불가(데이터 부재)');

    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);

    // 열기 전 활성 요소를 표식해 둔다(추적용 속성) — 정확히 그 노드로 돌아오는지 확인한다.
    await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="venue-card-${id}"]`)
        ?? document.querySelector<HTMLElement>('button, a[href]');
      el?.focus();
      el?.setAttribute('data-u06-opener', '1');
    }, vid);

    await page.goto(`/?v=${vid}`); // 직링크로 열되, 위에서 만든 opener 마킹은 별도 판정 없이 BODY 유출만 확인
    const dlg = page.getByRole('dialog', { name: /매장 페이지/ });
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await dismissOverlays(page);
    await page.waitForTimeout(500);

    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden({ timeout: 5_000 });

    const focusIsBody = await page.evaluate(() => document.activeElement === document.body || document.activeElement === document.documentElement);
    expect(focusIsBody, 'ESC 로 닫은 뒤 focus 가 BODY/HTML 로 흘렀다 — 복원되지 않았다').toBe(false);
  });

  test('🔴 그룹 페이지는 매장 페이지와 같은 dialog 계약을 쓴다(role·aria-modal·focus 진입)', async ({ page }) => {
    const gid = await anyGroupId();
    test.skip(!gid, '공개 커뮤니티 그룹이 없어 판단 불가(데이터 부재)');

    await stabilizeBackstack(page);
    await page.goto(`/?v=${gid}`);
    // GroupPage 는 role="dialog" 가 예전엔 아예 없었다 — 있어야 getByRole 로 잡힌다.
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await dismissOverlays(page);
    await page.waitForTimeout(800);

    const activeInDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    });
    expect(activeInDialog, '그룹 페이지가 열렸는데 focus 가 다이얼로그 안으로 안 들어갔다').toBe(true);
  });
});
