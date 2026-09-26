import { test, expect } from './_fixtures';

// W1-5 TB2 — 탭바 자동숨김 재작성 머지 게이트(§15.2 #5: 실기기는 오너 QA, 여기선 3케이스).
// 구 리스너의 4가지 고장(느린 끌기 무판정 · 문서끝 감지 부재 · 가짜 음수 dy · 탭 복원 거대 dy) 회귀 가드.
// 실기기(갤럭시 삼성인터넷) 검증은 오너 QA로 분리 — 이 스펙은 로직 계약만 잠근다.

// rAF 타이밍 의존 스펙은 병렬 워커 CPU 경합에 취약(단독 실행 그린) — 판정 조건은 그대로, 재시도만 허용
test.describe.configure({ retries: 2 });

/** 페이지별 진행 중 요청 수 — settleLayout 이 '응답이 다 왔다' 를 재는 신호. */
const inflight = new WeakMap<import('@playwright/test').Page, { n: number }>();

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000); // 병렬 부하에서 마운트 대기(≤30s)가 기본 타임아웃을 소진한다
  const net = { n: 0 };
  inflight.set(page, net);
  page.on('request', () => { net.n += 1; });
  page.on('requestfinished', () => { net.n -= 1; });
  page.on('requestfailed', () => { net.n -= 1; });
  // (온보딩 시트 #29 는 2026-08-28 삭제 — 'nuri_onboarding_v1' 시드는 죽은 전제라 제거)
  await page.goto('/');
  // 병렬 스위트 부하에서 마운트가 늦으면 nav 대기가 기본 타임아웃을 넘긴다 — 마운트 마커로 명시 대기
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' })).toBeVisible({ timeout: 15_000 });
  // 데이터 양과 무관하게 스크롤 공간을 보장 — 리스너는 scrollHeight 만 읽으므로 계약 검증에 유효
  await page.evaluate(() => {
    const pad = document.createElement('div');
    pad.id = 'e2e-scroll-pad';
    pad.style.height = '3000px';
    document.body.appendChild(pad);
  });
});

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: '하단 내비게이션' });

/** 스크롤 한 걸음이 **자기 프레임**에서 판정되게 기다린다(두 번의 rAF = 앱의 useScrollY 방송이 끝난 뒤).
 *  리스너는 프레임당 1회로 합쳐 읽는다(src/lib/useScrollY.ts) — 고정 40ms 대기는 느린 러너에서 프레임 경계를 보장하지 못한다. */
const nextFrame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** 🔴 2026-09-26 CI(7433a4c3 · 2f2a7dcf 에서도 flaky) ③ 66줄 — 늦게 도착한 홈 데이터가 **지금 위치 위**에서 자라면
 *  브라우저 스크롤 앵커링이 scrollY 를 그만큼 밀어 올린다(실측: scrollHeight 4283→4343 · scrollY 1164→1225 = +61).
 *  리스너는 그것을 '아래로 긁음(+48 초과)' 으로 읽어 숨기고, 남은 위로 걸음(12px 하나)으로는 복귀 임계를 못 넘는다.
 *  이 스펙은 네트워크를 목킹하지 않아 CI 의 느린 응답에서만 그 순간이 준비 구간에 떨어졌다(응답 1.5s 지연 주입 시 3/3 재현).
 *  → '깊이 내려간 상태' 를 만든 뒤 **요청이 끝나고 문서가 멈출 때까지** 기다렸다가 손짓을 시작한다. 판정 조건은 그대로다. */
async function settleLayout(page: import('@playwright/test').Page) {
  const net = inflight.get(page)!;
  await expect.poll(async () => {
    const a = await page.evaluate(() => `${document.documentElement.scrollHeight}:${Math.round(scrollY)}`);
    await page.waitForTimeout(250);
    const b = await page.evaluate(() => `${document.documentElement.scrollHeight}:${Math.round(scrollY)}`);
    return net.n === 0 && a === b;
  }, { timeout: 20_000, message: '요청이 끝나지 않았거나 문서 높이·스크롤이 멈추지 않았다' }).toBe(true);
}

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
    await nextFrame(page);
  }
  await expect(nav(page)).toHaveClass(/translate-y-0/);
});

test('③ 깊은 스크롤 상태로 탭 전환해도 탭바가 증발하지 않는다(복원 억제창 300ms)', async ({ page }) => {
  // 깊이 내려가되 위로 살짝 올려 '표시' 상태를 만든다
  await page.evaluate(() => window.scrollTo(0, 1200));
  await settleLayout(page);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, -12));
    await nextFrame(page);
  }
  await expect(nav(page)).toHaveClass(/translate-y-0/);
  // 라이브(스크롤 0) → 일정(깊은 위치 복원): 구 리스너는 복원 거대 dy 로 탭바가 사라졌다
  await nav(page).getByRole('button', { name: /^라이브/ /* 진행 중 게임이 있으면 배지 숫자가 접근성 이름에 붙는다('라이브 1') — exact 는 저녁마다 깨진다 */ }).click();
  await page.waitForTimeout(400);
  await nav(page).getByRole('button', { name: '홈', exact: true }).click();
  await page.waitForTimeout(400);
  await expect(nav(page)).toHaveClass(/translate-y-0/);
});
