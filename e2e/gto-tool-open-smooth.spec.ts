// GTO-TOOL-OPEN-JANK(오너 2026-09-24 "GTO 탭에서 눌러서 열면 드드득 끊기는 모션 최대한 줄여줘").
//
// 실측 원인 셋(root-cause-debugger, 390·CPU 6배):
//   ① lazy 도구(gto·startrank·spot·replay) 첫 열기 — '불러오는 중…'(148px) 이 ~300ms 붙잡혔다가 본문으로 튄다.
//      React 가 **새 Suspense 경계**의 폴백을 최소 300ms 유지하기 때문(청크가 캐시에 있어도, startTransition 으로도 안 됨).
//      → lazyWithReload.preload() 로 미리 받고, 받아졌으면 lazy 를 건너뛰어 동기로 그린다.
//   ② 페이지 모달 진입 fade-in 에 blur 가 섞여 **합성 스레드로 못 갔다**(compositeFailed=4096) — 메인 스레드가 바쁘면 멈췄다.
//   ③ TDA 는 열 때마다 스켈레톤 → 본문 계단, 스팟은 400ms 자동저장 줄이 끼며 본문이 한 번 더 늘었다.
//
// ⚠ 클릭은 `page.evaluate(() => el.click())` — locator.click 은 대상까지 자동 스크롤해 측정을 오염시킨다(CLAUDE.md 메모).
// ⚠ 헤드리스는 소프트웨어 합성기라 '프레임 수' 비교는 결론이 안 된다 — 여기서는 **상태**(폴백·스켈레톤·높이·합성 실패)만 단언한다.
import { test, expect } from './_fixtures';
import { bootOwner } from './_mockOwner';
import type { Page } from '@playwright/test';

interface Frame { t: number; open: boolean; fb: boolean; busy: boolean; h: number }

/** 카드를 눌러 열고 ms 동안 매 rAF 의 도구 본문 상태를 기록한다. */
async function openAndRecord(page: Page, testId: string, ms = 1200): Promise<Frame[]> {
  return page.evaluate(async ({ testId, ms }) => {
    const frames: Frame[] = [];
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const step = () => {
        const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
        const body = dlg?.querySelector<HTMLElement>('.px-page-x') ?? null;
        const first = body?.firstElementChild ?? null;
        frames.push({
          t: Math.round(performance.now() - t0),
          open: !!dlg,
          // Suspense 폴백은 자식 없는 텍스트 div 하나다(ToolsPanel). 큰 DOM 에서 textContent 를 매 프레임 읽지 않게 자식 수부터 본다.
          fb: !!first && first.childElementCount === 0 && /불러오는 중/.test(first.textContent ?? ''),
          busy: !!body?.querySelector('[aria-busy="true"]'),
          h: body ? Math.round(body.getBoundingClientRect().height) : -1,
        });
        if (performance.now() - t0 < ms) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
      document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click();
    });
    return frames;
  }, { testId, ms });
}

async function closeTool(page: Page) {
  await page.evaluate(() => document.querySelector<HTMLElement>('[role="dialog"] button[aria-label="닫기"]')?.click());
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0, { timeout: 5_000 });
}

async function bootTools(page: Page) {
  await bootOwner(page, { viewport: { width: 390, height: 844 } });
  await page.goto('/?tab=tools');
  await expect(page.locator('[data-testid="tool-gto"]')).toBeVisible({ timeout: 30_000 });
  // GTO 판이 보인 뒤 유휴 시간에 미리 받는다(requestIdleCallback timeout 3s) — 청크 도착까지 넉넉히 기다린다.
  await page.waitForTimeout(4_500);
}

test('① lazy 도구 4개 — 첫 열기에 "불러오는 중…" 폴백 프레임이 0 이다', async ({ page }) => {
  test.setTimeout(90_000);
  await bootTools(page);
  for (const key of ['gto', 'startrank', 'spot', 'replay']) {
    const frames = await openAndRecord(page, `tool-${key}`);
    const fb = frames.filter((f) => f.fb);
    expect(frames.some((f) => f.open && f.h > 150 && !f.fb), `${key}: 본문이 그려지지 않았다`).toBe(true);
    expect(fb.length, `${key}: 폴백 ${fb.length}프레임(${fb[0]?.t}~${fb.at(-1)?.t}ms) — 새 Suspense 경계의 300ms 스로틀이 다시 보인다`).toBe(0);
    await closeTool(page);
  }
});

test('② 페이지 모달 fade-in 이 합성 스레드에서 돈다(compositeFailed 0)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP 트레이스는 Chromium 전용');
  await bootTools(page);
  const cdp = await page.context().newCDPSession(page);
  const events: Array<{ name: string; args?: { data?: { displayName?: string; compositeFailed?: number } } }> = [];
  cdp.on('Tracing.dataCollected', (e) => events.push(...(e.value as unknown as typeof events)));
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'blink.animations', transferMode: 'ReportEvents' });
  await openAndRecord(page, 'tool-pot', 600);
  await cdp.send('Tracing.end');
  await done;
  // Animation 이벤트는 displayName 을 싣는 시작 이벤트 뒤에 compositeFailed 를 싣는 이벤트가 온다.
  const results: Array<{ name: string; cf: number }> = [];
  let last = '';
  for (const e of events.filter((x) => x.name === 'Animation')) {
    const d = e.args?.data;
    if (d?.displayName) last = d.displayName;
    if (d?.compositeFailed != null) results.push({ name: last, cf: d.compositeFailed });
  }
  const fade = results.filter((r) => r.name === 'fade-in');
  expect(fade.length, `fade-in 애니메이션 트레이스를 못 잡았다: ${JSON.stringify(results)}`).toBeGreaterThan(0);
  expect(fade.filter((r) => r.cf !== 0), 'fade-in 이 합성에 실패했다 — 키프레임에 filter(blur) 같은 비합성 속성이 다시 들어왔나').toEqual([]);
});

test('③ TDA 규칙 — 두 번째 열기부터 스켈레톤이 한 프레임도 없다', async ({ page }) => {
  test.setTimeout(60_000);
  await bootTools(page);
  // 첫 열기 — 모듈이 캐시에 들어갈 때까지 연다(미리 받기가 늦었더라도 여기서 채워진다).
  await openAndRecord(page, 'tool-tda', 400);
  await expect(page.getByRole('heading', { name: '2026 TDA 규칙', level: 3 })).toBeVisible({ timeout: 15_000 });
  await closeTool(page);
  const frames = await openAndRecord(page, 'tool-tda', 900);
  const busy = frames.filter((f) => f.open && f.busy);
  expect(frames.some((f) => f.open && f.h > 400), 'TDA 본문이 그려지지 않았다').toBe(true);
  expect(busy.length, `두 번째 열기에 스켈레톤 ${busy.length}프레임(${busy[0]?.t}ms~) — 규칙 모듈 캐시가 안 먹는다`).toBe(0);
});

test('④ 누리 스팟 — 열고 0~800ms 동안 본문 높이가 변하지 않는다(자동저장 줄 자리 예약)', async ({ page }) => {
  test.setTimeout(60_000);
  await bootTools(page);
  const frames = await openAndRecord(page, 'tool-spot', 1000);
  const content = frames.filter((f) => f.open && !f.fb && f.h > 150 && f.t <= 800 + (frames.find((x) => x.open && !x.fb && x.h > 150)?.t ?? 0));
  const heights = [...new Set(content.map((f) => f.h))];
  expect(content.length, '스팟 본문이 그려지지 않았다').toBeGreaterThan(0);
  expect(heights, `본문 높이가 ${heights.join('→')}px 로 바뀌었다 — '임시 저장됨' 줄이 늦게 끼어든다`).toHaveLength(1);
});
