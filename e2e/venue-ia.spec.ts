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
    await expect(page.getByRole('dialog', { name: /매장 페이지/ })).toBeVisible({ timeout: 15_000 });
    // 다이얼로그가 뜬 '뒤에' 오버레이를 걷는다 — 2026-08-28 dismissOverlays 의 1.6s 선대기 제거로
    // goto 직후 호출은 아직 안 뜬 다이얼로그에 no-op 이 됐다. 이 정리는 첫 방문 코치마크(확인 버튼)를
    // 계수 전에 걷어내던 종전 게이트 의미를 유지한다(코치마크는 1회성 팁이지 IA 행동 요소가 아니다).
    await dismissOverlays(page);
    await page.waitForTimeout(1200);

    // Tier1 프라이머리 — QR 체크인이 스크롤 없이 보인다
    const checkin = page.getByRole('button', { name: /QR 체크인/ });
    await expect(checkin, 'Tier1 [QR 체크인] 이 없다').toBeVisible();
    const box = await checkin.boundingBox();
    expect(box!.y, 'QR 체크인이 첫 뷰포트(915px) 밖이다 — Tier1 이 아니다').toBeLessThan(915);

    // 첫 뷰포트 콘텐츠 레벨 인터랙티브 ≤ 6 (뒤로가기·탭바 role=tab 제외)
    const { count, navShuttles } = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-label*="매장 페이지"]');
      if (!dlg) return { count: -1, navShuttles: 0 };
      let n = 0, shuttles = 0;
      for (const el of dlg.querySelectorAll<HTMLElement>('button, a, [role="button"]')) {
        // ⚠ 크기 0 필터만으로는 부족해졌다 — Chrome 148+ 는 닫힌 <details> 내부(::details-content
        //   content-visibility:hidden)도 rect 를 반환한다(hidden=until-found 계열 변경).
        //   checkVisibility() 가 '사용자에게 보이는가'의 정본 — 게이트 의미(보이는 행동 요소 ≤6)는 동일.
        if (el.checkVisibility && !el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top >= 915 || r.bottom <= 0) continue;               // 첫 뷰포트 밖
        if (el.getAttribute('role') === 'tab') continue;            // 내비게이션 탭
        if (el.getAttribute('aria-label') === '뒤로 가기') continue; // 내비게이션
        if (el.closest('summary')) continue;                         // 계층을 여는 손잡이 = 디스클로저(행동 아님)
        // 페이지 '자기 탭'으로의 셔틀(예: 시즌 선두 배너 → 랭킹 탭) — 행동이 탭 전환뿐이라
        // role=tab 제외와 동일 근거의 내비게이션 레벨. 앱이 data-nav="venue-tab" 으로 명시 선언한
        // 요소만 제외한다(콘텐츠 행동 버튼에 이 속성을 붙이는 것은 게이트 무력화 — 금지).
        if (el.getAttribute('data-nav') === 'venue-tab') { shuttles += 1; continue; }
        n += 1;
      }
      return { count: n, navShuttles: shuttles };
    });
    // 제외 자체에도 상한을 둔다 — 이 속성을 여기저기 붙여 게이트를 비우는 우회를 원천 차단.
    // (탭 셔틀은 설계상 '시즌 선두 배너' 하나뿐이다)
    expect(navShuttles, `탭 셔틀(data-nav) 이 ${navShuttles}개 — 1개를 넘으면 게이트 우회다`).toBeLessThanOrEqual(1);
    expect(count, `첫 뷰포트 행동 요소가 ${count}개 — 6개 이하여야 한다(계층이 무너짐)`).toBeLessThanOrEqual(6);
    expect(count).toBeGreaterThan(0);

    // Tier3 '내 활동' 은 비로그인에게 DOM 자체가 없다(미렌더 원칙)
    // ⚠ 종전 셀렉터는 `text=🙋 내 활동` 이었다 — 이모지에 결합돼 있어서, 아이콘 교체(ICON-2)만으로도
    //   무조건 0건이 되어 **이 단언이 조용히 항상 통과**하게 된다(게이트 무력화). 앱이 명시 선언한
    //   data-testid 로 옮긴다(셀렉터를 느슨하게 푸는 게 아니라 결합 지점을 바꾸는 것).
    expect(await page.getByTestId('venue-my-activity').count(), '비로그인인데 내 활동 블록이 DOM 에 있다').toBe(0);
  });
});
