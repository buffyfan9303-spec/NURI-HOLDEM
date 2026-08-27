// 모션 게이트 — '열 때만 앱이고 닫을 때는 웹페이지'가 되지 않게.
//
// 감사가 짚은 구조적 원인: 모션 '어휘'(easing·duration 토큰)는 잘 갖춰져 있는데
// 열림/닫힘 '상태기계'가 없어서 화면마다 반쪽씩 발명했다. 구체적으로:
//  · 시트 26개가 아래에서 올라오지 않고 반투명하게 번쩍 나타났다(진입이 8px 넛지인데 이탈은 100% 이동).
//  · 그립 핸들은 있는데 드래그 핸들러가 page 변형에만 붙어 있어 잡아끌어도 무반응이었다(UI 가 거짓말).
//  · 끌어내려 닫으면 setDragY(0) 이 먼저 돌아 원위치로 튀어오르며 사라졌다.
//
// 모션은 눈으로 보는 것이라 자동화가 어렵지만, '규칙이 걸려 있는가'는 계산된 스타일로 잴 수 있다.
import { test, expect } from '@playwright/test';
import { stabilizeBackstack } from './_session';

test.describe('모션 — 시트가 아래에서 올라오고 손끝을 따라온다', () => {
  test('🔴 sheet-up 키프레임이 실제로 존재한다(100% → 0 이동)', async ({ page }) => {
    await page.goto('/');
    const kf = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const r of Array.from(rules)) {
          if (r instanceof CSSKeyframesRule && r.name === 'sheet-up') return r.cssText;
        }
      }
      return null;
    });
    expect(kf, 'sheet-up 키프레임이 없다 — 시트가 아래에서 올라오지 않고 번쩍인다').toBeTruthy();
    expect(kf!, 'sheet-up 이 화면 밖(100%)에서 출발해야 한다').toMatch(/translateY\(100%\)/);
  });

  test('🔴 시트가 열릴 때 sheet-up 애니메이션이 걸린다', async ({ page }) => {
    await stabilizeBackstack(page);
    // 예전엔 '첫 방문자에게 자동으로 뜨는 온보딩 시트'를 대상으로 썼다(버튼 경로는 온보딩이
    // 클릭을 가로채 불안정했기 때문). 온보딩(#29)이 2026-08-28 오너 지시로 삭제되며 그 전제와
    // 가로채기 문제가 함께 사라졌다 — 이제 실제 사용자 경로인 Cmd/Ctrl+K 통합 검색
    // (GlobalSearchModal, Modal variant="sheet")을 연다: 비로그인·데이터 무관·결정적.
    await page.goto('/');
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 15_000 }); // 앱 마운트 마커
    await page.keyboard.press('Control+k');

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const anim = await dialog.evaluate((el) => getComputedStyle(el).animationName);
    // sheet 변형이면 sheet-up, center 변형이면 slide-up — 둘 중 하나는 반드시 걸려야 한다.
    // (none 이면 '번쩍 나타나는' 예전 상태로 되돌아간 것)
    expect(['sheet-up', 'slide-up'], `모달에 진입 애니메이션이 없다(animationName=${anim})`).toContain(anim);
  });

  test('시트에 손끝 추종용 드래그 핸들러가 배선돼 있다', async ({ page }) => {
    // 그립 핸들이 '끌 수 있다'고 말해 놓고 반응이 없으면 UI 가 거짓말을 하는 것이다.
    // 터치 제스처 자체는 자동화가 불안정하므로, 최소한 '핸들 영역이 터치를 받도록 설정됐는지'를 본다.
    // 대상 시트는 위 테스트와 동일 — 온보딩(#29) 삭제(2026-08-28) 후 Cmd/Ctrl+K 검색 시트.
    await stabilizeBackstack(page);
    await page.goto('/');
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 15_000 }); // 앱 마운트 마커
    await page.keyboard.press('Control+k');
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ⚠ 전제(sheet 변형인가)를 먼저 확정하고, 그 다음엔 반드시 실패하게 한다.
    //   처음엔 `test.skip(!grip)` 으로 썼다가, 드래그 배선을 지워도 '실패'가 아니라 'skip' 이 되는 걸
    //   회귀 주입 실험에서 발견했다 — 조용히 통과하는 테스트는 아무것도 지키지 않는다.
    const anim = await dialog.evaluate((el) => getComputedStyle(el).animationName);
    test.skip(anim !== 'sheet-up', `이 모달은 sheet 변형이 아니다(animationName=${anim})`);

    const grip = await dialog.evaluate((el) =>
      Array.from(el.querySelectorAll<HTMLElement>('div'))
        .some((d) => getComputedStyle(d).touchAction === 'none' && !!d.querySelector('div')));
    expect(grip, '시트인데 그립 영역이 터치를 받지 못한다 — 끌어도 브라우저 스크롤에 먹혀 핸들이 거짓말을 한다').toBe(true);
  });

  test('전환 곡선이 iOS 감각(감속 위주)으로 통일돼 있다', async ({ page }) => {
    await page.goto('/');
    const easing = await page.evaluate(() => {
      const b = document.querySelector('button');
      return b ? getComputedStyle(b).transitionTimingFunction : '';
    });
    // cubic-bezier(0.32, 0.72, 0, 1) — 빠르게 출발해 부드럽게 안착. linear/ease 면 '웹페이지' 느낌이 난다.
    expect(easing, `버튼 전환 곡선이 기대와 다르다: ${easing}`).toContain('cubic-bezier(0.32, 0.72, 0, 1)');
  });

  test('prefers-reduced-motion 을 존중한다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const respected = await page.evaluate(() => {
      // 규칙이 스타일시트에 있는지 확인(계산 스타일은 요소마다 달라 대표성이 없다)
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const r of Array.from(rules)) {
          if (r instanceof CSSMediaRule && /prefers-reduced-motion/.test(r.conditionText)) return true;
        }
      }
      return false;
    });
    expect(respected, 'prefers-reduced-motion 대응 규칙이 없다 — 멀미·전정기관 이슈가 있는 사용자에게 필요하다').toBe(true);
  });
});
