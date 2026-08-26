import { test, expect } from '@playwright/test';

// W1-5 TB2 — 탭바 자동숨김 재작성 머지 게이트(§15.2 #5: 실기기는 오너 QA, 여기선 3케이스).
// 구 리스너의 4가지 고장(느린 끌기 무판정 · 문서끝 감지 부재 · 가짜 음수 dy · 탭 복원 거대 dy) 회귀 가드.
// 실기기(갤럭시 삼성인터넷) 검증은 오너 QA로 분리 — 이 스펙은 로직 계약만 잠근다.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('nuri_onboarding_v1', '1'); } catch { /* noop */ } });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' })).toBeVisible();
  // 데이터 양과 무관하게 스크롤 공간을 보장 — 리스너는 scrollHeight 만 읽으므로 계약 검증에 유효
  await page.evaluate(() => {
    const pad = document.createElement('div');
    pad.id = 'e2e-scroll-pad';
    pad.style.height = '3000px';
    document.body.appendChild(pad);
  });
});

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: '하단 내비게이션' });

/** 느린 끌기 시뮬레이션 — 이벤트당 8px(구 리스너의 dy>14 무판정 구간)로 바닥까지 */
async function slowScrollToBottom(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    while (window.scrollY < max() - 2) {
      window.scrollBy(0, 8);
      await new Promise((r) => setTimeout(r, 16));
      if (window.scrollY > max()) break;
    }
    window.scrollTo(0, max());
    await new Promise((r) => setTimeout(r, 120));
  });
}

test('① 천천히 끌어 바닥까지 → 탭바가 반드시 숨는다(문서끝 무조건 숨김)', async ({ page }) => {
  await slowScrollToBottom(page);
  await expect(nav(page)).toHaveClass(/translate-y-\[120%\]/);
});

test('② 바닥에서 위로 살짝 튕기면 복귀한다(누적 -24px 임계)', async ({ page }) => {
  await slowScrollToBottom(page);
  await expect(nav(page)).toHaveClass(/translate-y-\[120%\]/);
  // 단일 evaluate 내 루프는 헤드리스에서 rAF 처리가 씹힐 수 있어 개별 스텝 + 실제 대기로 분리
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, -10));
    await page.waitForTimeout(40);
  }
  await expect(nav(page)).toHaveClass(/translate-y-0/);
});

test('③ 깊은 스크롤 상태로 탭 전환해도 탭바가 증발하지 않는다(복원 억제창 300ms)', async ({ page }) => {
  // 깊이 내려가되 위로 살짝 올려 '표시' 상태를 만든다
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(80);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, -12));
    await page.waitForTimeout(40);
  }
  await expect(nav(page)).toHaveClass(/translate-y-0/);
  // 라이브(스크롤 0) → 일정(깊은 위치 복원): 구 리스너는 복원 거대 dy 로 탭바가 사라졌다
  await nav(page).getByRole('button', { name: '라이브', exact: true }).click();
  await page.waitForTimeout(400);
  await nav(page).getByRole('button', { name: '홈', exact: true }).click();
  await page.waitForTimeout(400);
  await expect(nav(page)).toHaveClass(/translate-y-0/);
});
