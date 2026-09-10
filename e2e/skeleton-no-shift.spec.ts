// 스켈레톤 게이트(useSkeletonGate) — 200ms 동안 '빈칸'을 그리지 않는다.
//
// 오너 상시 지시(home-cls.spec 머리): "멈췄다가 주르륵 콘텐츠가 아래로 나오는 건 절대 안 됨."
//
// 무엇이 문제였나(MO-B): 게이트 구간에 소비처가 null 을 그려 높이 0 → 응답이 200ms 를 넘으면
//   스켈레톤이 뒤늦게 끼어들며 그 아래(오늘 곧 시작·더보기·BusinessFooter)가 통째로 내려갔다.
//   탭 클릭 500ms 안의 이동이라 layout-shift 의 hadRecentInput 으로 CLS 합계에서 빠져 perf.spec 이 못 잡는다.
//
// 잠그는 것(소비처 3곳 — 라이브 탭 · 커뮤니티 실시간 · 커뮤니티 장터):
//   응답을 일부러 늦춰도, 패널이 보이는 첫 프레임부터 게이트가 열린 뒤까지 **푸터의 문서 y 가 같다**
//   = 자리는 첫 렌더부터 예약되고(첫 프레임에 스켈레톤 높이 > 0), 200ms 게이트는 pulse 노출(visibility)만 정한다.
//
// 측정은 페이지 안 rAF 샘플러(voucher-sheet-open.spec 조리법) — Playwright 왕복(수십 ms)으로는
//   200ms 게이트 안쪽 프레임을 놓친다. 응답은 목킹한다(운영 DB 에 쓰지 않는다 — _fixtures 가드).
// ⚠ 프리마운트(App·CommunityTab 의 idle 숨김 마운트)가 먼저 돌면 게이트가 이미 열린 채 보이므로 '빈칸→스켈레톤'이
//   애초에 없다(재현 불가 = 통과). tools.spec 조리법으로 idle 을 늦춰 '눌러서 처음 마운트되는' 경로를 잰다.
import { test, expect } from './_fixtures';
import { type Page, type Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
/** 응답을 ms 만큼 늦춘다 — 측정 창(패널 표시 후 650ms) 안에서는 아직 '로딩 중'이어야 한다.
 *  길게 두는 이유: 프리마운트로 요청이 먼저 나갔더라도 응답(스켈레톤→본문 교체)이 창 안에 떨어지지 않게. */
const slow = (body: unknown, ms: number) => async (r: Route) => {
  await new Promise((x) => setTimeout(x, ms));
  try { await r.fulfill(json(body)); } catch { /* 테스트가 먼저 끝나 페이지가 닫혔다 */ }
};

interface Frame { t: number; attached: boolean; y: number | null; skelH: number; vis: string }

/** 매 프레임: 패널이 실제로 표시 중일 때만 푸터의 **레이아웃 y**(offsetParent 사슬 합 — transform 무시)와
 *  스켈레톤 래퍼의 높이·visibility 를 적는다.
 *  ⚠ getBoundingClientRect 를 쓰면 안 된다 — 서브탭 전환 때 푸터를 감싼 컨테이너의 진입 애니메이션(translate)이
 *    첫 프레임에 7~18px 를 만들어 '이동'으로 잡힌다(2026-09-10 실측: 레이아웃 y 1149 불변, rect y 1153→1167).
 *    CLS 정의도 transform 은 이동으로 치지 않는다. 여기서 잠그는 것은 **레이아웃**이 밀리는 것(null→스켈레톤 삽입)이다.
 *  display:none(keep-alive 숨김)·Suspense 폴백 프레임은 y=null 로 제외 — 그건 이동이 아니라 아직 안 온 것이다. */
async function armSampler(page: Page, panel: string, skel: string) {
  await page.evaluate(([panelSel, skelSel]) => {
    const w = window as unknown as { __frames: Frame[]; __raf: number };
    const frames: Frame[] = [];
    w.__frames = frames;
    const layoutY = (el: HTMLElement | null) => { let e = el; let y = 0; while (e) { y += e.offsetTop; e = e.offsetParent as HTMLElement | null; } return y; };
    const tick = () => {
      const p = document.querySelector<HTMLElement>(panelSel);
      const shown = !!p && p.offsetParent !== null;
      const f = document.querySelector<HTMLElement>('footer');
      const s = p ? p.querySelector<HTMLElement>(skelSel) : null;
      frames.push({
        t: Math.round(performance.now()),
        attached: !!p,
        y: shown && f ? layoutY(f) : null,
        skelH: s ? Math.round(s.getBoundingClientRect().height) : 0,
        vis: s ? getComputedStyle(s).visibility : '',
      });
      w.__raf = requestAnimationFrame(tick);
    };
    w.__raf = requestAnimationFrame(tick);
  }, [panel, skel] as [string, string]);
}

async function readSampler(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __raf: number };
    cancelAnimationFrame(w.__raf);
    return w.__frames;
  });
}

/** 패널이 보인 첫 프레임부터 windowMs 동안의 프레임 — 그 안에서 푸터가 움직였는가 */
function judge(frames: Frame[], label: string, windowMs = 650) {
  const shown = frames.filter((f) => f.y != null);
  expect(shown.length, `${label}: 패널이 한 번도 표시되지 않았다`).toBeGreaterThan(0);
  const first = shown[0];
  const tAttach = frames.find((f) => f.attached)?.t ?? first.t;
  const win = shown.filter((f) => f.t - first.t <= windowMs);
  const ys = win.map((f) => f.y as number);
  const opened = win.find((f) => f.vis === 'visible');
  console.log(`[${label}] 마운트→표시 ${first.t - tAttach}ms · 첫 프레임`, JSON.stringify(first),
    '· 게이트 열림', JSON.stringify(opened ?? null), '· 푸터 y', `${Math.min(...ys)}~${Math.max(...ys)}`, `(${win.length}프레임)`);
  // 푸터가 움직인 프레임만 — 무엇이 같이 바뀌었는지(스켈레톤 높이·패널 높이·폰트 상태·vis) 원인을 가른다
  win.forEach((f, i) => { if (i > 0 && f.y !== win[i - 1].y) console.log(`[${label}] y 이동 프레임`, JSON.stringify(win[i - 1]), '→', JSON.stringify(f)); });
  // ① 자리는 첫 렌더부터 — 보이는 첫 프레임에 이미 스켈레톤이 높이를 차지한다(null 을 그리면 0)
  expect(first.skelH, `${label}: 첫 프레임에 스켈레톤 자리가 없다(게이트 동안 null 을 그린다)`).toBeGreaterThan(0);
  // ② 게이트는 pulse 노출만 — 마운트 직후엔 숨김(빠른 응답이면 번쩍이지 않는다), 200ms 뒤엔 보인다.
  //    숨긴 채 프리마운트된 뒤 한참 있다 보인 경우는 게이트가 이미 열린 것이 정상이라 '숨김' 단정을 건너뛴다.
  if (first.t - tAttach <= 150) {
    expect(first.vis, `${label}: 마운트 직후부터 시머가 보인다(200ms 게이트가 사라졌다)`).toBe('hidden');
  }
  expect(opened, `${label}: 게이트가 열린 뒤에도 스켈레톤이 보이지 않는다`).toBeTruthy();
  // ③ 그 사이 아래(푸터)가 움직이지 않았다 — 오너 지시의 그 '주르륵'
  expect(Math.max(...ys) - Math.min(...ys), `${label}: 스켈레톤이 끼어들며 푸터가 밀렸다`).toBeLessThanOrEqual(4);
}

const NAV = 'nav[aria-label="하단 내비게이션"]';
const DELAY = 10_000;

async function boot(page: Page) {
  await stabilizeBackstack(page);
  // idle 프리마운트를 폴백 타이머로 미룬다(App 5s · 커뮤니티 섹션 600ms) — 눌러서 처음 마운트되는 경로가 측정 대상이다.
  await page.addInitScript(() => { if (window.top === window) delete (window as unknown as Record<string, unknown>).requestIdleCallback; });
  await page.goto('/');
  await dismissOverlays(page);
}

test.describe('스켈레톤 게이트 — 늦은 응답에도 아래가 밀리지 않는다', () => {
  test('🔴 라이브 탭 — clock_states 지연', async ({ page }) => {
    test.setTimeout(60_000);
    // 오늘 곧 시작(schedules 파생)이 측정 중에 끼어들지 않게 일정은 즉시 비운다 — 재는 건 클락 스켈레톤뿐이다.
    await page.route(/\/rest\/v1\/schedules\?/, (r) => r.fulfill(json([])));
    await page.route(/\/rest\/v1\/clock_states\?/, slow([], DELAY));
    await boot(page);

    await armSampler(page, '[data-live-panel]', '[aria-busy="true"]');
    await page.locator(NAV).getByRole('button', { name: /^라이브/ }).first().click();
    await expect(page.locator('[data-live-panel]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(900);
    judge(await readSampler(page), '라이브');
  });

  test('🔴 커뮤니티 실시간 — live_wall 지연', async ({ page }) => {
    test.setTimeout(60_000);
    await page.route(/\/rest\/v1\/live_wall\?/, slow([], DELAY));
    await boot(page);
    await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
    const tab = page.getByRole('button', { name: '실시간', exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 15_000 });

    await armSampler(page, '[data-sec="live"]', 'ul[aria-hidden="true"]');
    await tab.click();
    await expect(page.locator('[data-sec="live"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(900);
    judge(await readSampler(page), '실시간');
  });

  test('🔴 커뮤니티 장터 — marketplace_listings 지연', async ({ page }) => {
    test.setTimeout(60_000);
    // 목록은 부팅 일괄 조회(loadDeferred)에서 시작된다 — 장터를 여는 시점까지 확실히 '로딩 중'이도록 길게 늦춘다.
    await page.route(/\/rest\/v1\/marketplace_listings\?/, slow([], DELAY));
    // 공지가 측정 중에 도착하면 목록 위에 NoticeBoard 가 끼어든다 — 즉시 비워 변수를 없앤다.
    await page.route(/\/rest\/v1\/marketplace_notices\?/, (r) => r.fulfill(json([])));
    await boot(page);
    await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
    const tab = page.getByRole('button', { name: '장터', exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 15_000 });

    await armSampler(page, '[data-market-panel]', '[aria-hidden="true"]');
    await tab.click();
    await expect(page.locator('[data-market-panel]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(900);
    judge(await readSampler(page), '장터');
  });
});

// ── 라이브 탭 — 조회 실패를 '진행 중인 게임이 없습니다'로 위장하지 않는다(STATE-01) ─────────────
// api/clock.ts 는 일부러 throw 하는데 화면이 `[]` 로 되받아 빈 상태 + '대회 일정 보기' 유도를 그렸다.
// load-failure.spec(게시판)과 같은 계약: 오류 카드 + 다시 시도, 그리고 거짓말 0.
test('🔴 라이브 탭 — 클락 조회가 실패하면 빈 상태가 아니라 오류·다시 시도가 보인다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(/\/rest\/v1\/clock_states\?/, (r) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"injected"}' }));
  await boot(page);
  await page.locator(NAV).getByRole('button', { name: /^라이브/ }).first().click();

  const panel = page.locator('[data-live-panel]');
  await expect(panel.getByRole('button', { name: /다시 시도/ }), '조회 실패인데 재시도 버튼이 없다').toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText('진행 중인 게임이 없습니다'), '실패를 빈 상태로 위장했다').toHaveCount(0);
});
