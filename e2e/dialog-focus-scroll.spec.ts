// e2e/dialog-focus-scroll.spec.ts — POSTER-RESERVE-SCROLL-TOP(2026-09-24) 회귀 가드.
//
// 오너 신고: 포스터 상세를 아래로 내려서 '예약하기'를 누르면 화면이 맨 위로 튄다.
// 원인(root-cause-debugger 조사, .claude/agent-memory-local/root-cause-debugger/dialog-focusout-scroll-top.md):
//   탭한 버튼이 사라지거나(헤더 접힘 CTA → setExpanded(true)로 unmount) disabled 되면
//   (StatefulActionButton 은 클릭 즉시 disabled) Chrome 이 blur 하고, useDialogFocus.ts 의
//   focusout 복구가 preventScroll 없이 첫 포커스 가능 요소로 focus() 를 걸어 스크롤러가 0 으로 간다.
//
// ⚠ 반드시 page.touchscreen.tap 으로 눌러야 재현된다 — locator.click()/evaluate(el.click()) 은
//   포커스를 주지 않아(브라우저가 synthetic click 에는 focus 를 걸지 않는다) focusout 이 안 나고
//   거짓으로 통과한다(위 메모의 음성 대조 실측).
// ⚠ 운영 쓰기 0 — schedules/venues/clock_states 는 고정 픽스처로 목킹하고, create_reservation 류
//   RPC 는 500 으로 막는다(schedule-card-clicks.spec.ts 와 같은 단일 핸들러 규칙 — 핸들러가 겹치면
//   route.continue() 가 조용히 운영으로 샌다).
import { test, expect } from './_fixtures';
import type { Locator, Page } from '@playwright/test';
import { kstDay } from './_schedules';

const TITLE = 'DIALOG 포커스 스크롤 회귀';
// 🔴 venue_id 를 반드시 채운다 — ScheduleDetailModal 은 venueId 가 있을 때만 본문 맨 위에
//   '매장명' 버튼(focusables()[0] 이 되는 실제 대상)을 그린다. 없으면 그 자리를 다른 요소(주소
//   링크 등, 화면 중간)가 대신 차지해 focus() 가 걸려도 스크롤이 거의 안 움직여 이 스펙이
//   증상을 하나도 못 잡고 거짓 통과했다(2026-09-24 실측 — 진단: diag-pathA.cjs, __internal 없이
//   HTMLElement.prototype.focus 를 직접 계측해 first-focusable 이 주소 A 태그로 바뀐 것을 확인).
const VENUE_ID = '99999999-9999-4999-8999-999999999999';
const VENUE_ROW = {
  id: VENUE_ID, name: '목킹 홀덤펍', region: '서울', address: '서울 어딘가 1',
  approved: true, status: 'active', is_paid_ad: false, display_order: 1,
  follower_count: 0, rating: null,
};

const ROWS = [
  {
    id: 'dddddddd-0000-4000-8000-000000000001',
    title: TITLE,
    venue_id: VENUE_ID,
    pub_name: '목킹 홀덤펍', region: '서울', address: '서울 어딘가 1',
    // 내일 날짜 고정 — '진행 중/종료' 로 갈리면 예약 박스 자체가 안 뜬다(ReserveBox 는 ended=false 필요).
    date: kstDay(1), start_time: '19:00:00', duration: '6시간',
    format: 'NLH', guaranteed: true, prize_pool: 1_000_000, prize_percent: null,
    is_competition: false, grade: null, blinds: null,
    buy_in: { amount: 30_000 }, seats: null,
    display_order: 0, is_premium: false, owner_id: 'e2e-mock-owner', approved: true,
    unread_qna_count: 0, view_count: 0, premium_until: null, reg_close_time: null,
    structure: null, description: null, side_events: null, ranking_prizes: null,
    partners: null, promotions: null, payment_methods: null, rules: null,
    poster_url: null, poster_color: null, rejected_at: null, reject_reason: null,
  },
];

/** 단일 핸들러 — schedule-card-clicks.spec.ts 와 같은 규칙(겹치면 조용히 샌다). 쓰기는 전부 500/차단. */
async function mockAll(page: Page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) return json(ROWS);
    if (/\/rest\/v1\/clock_states/.test(url)) return json([]);
    if (/\/rest\/v1\/venues/.test(url)) return json([VENUE_ROW]);
    // 예약 생성/취소/바인 요청 — 운영 쓰기 0. StatefulActionButton 은 이 실패를 catch 해 idle 로 복귀한다.
    if (/\/rpc\/(create_reservation|request_buyin|cancel_my_reservation)/.test(url)) return json({ message: 'blocked' }, 500);
    if (/\/rest\/v1\/rpc\//.test(url)) return json([]);
    if (/\/rest\/v1\//.test(url)) return json([]);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
}

async function openPoster(page: Page): Promise<Locator> {
  await page.addInitScript(() => {
    try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 저장소 차단 환경 */ }
  });
  await mockAll(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '전체 일정', exact: false }).first().click({ timeout: 15_000 });
  const card = page.locator('main[data-tab="browse"] article.cv-card-list').first();
  await card.waitFor({ timeout: 20_000 });
  await card.getByRole('heading').click();
  // 포스터 상세 컨테이너 — Modal.tsx variant="page": role=dialog 요소 자신이 data-scroll-lock 을 가진다.
  // hasText 로 좁히는 이유: 안쪽에서 로그인 시트(AuthModal)가 위에 겹쳐 뜨면 그것도 같은
  // [role=dialog][data-scroll-lock] 이라 두 개가 매칭될 수 있다 — 우리 대상은 제목이 있는 쪽 하나뿐이다.
  const dialog = page.locator('[role="dialog"][data-scroll-lock]').filter({ hasText: TITLE });
  await expect(dialog, '포스터 상세가 안 열렸다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900); // useDialogFocus 최초 focus() 의 setTimeout(50) 등 안정화
  return dialog;
}

function scroller(dialog: Locator): Locator {
  return dialog.locator(':scope > div.overflow-y-auto').first();
}

/** 스크롤러를 가능한 만큼(최대 400px) 내리고, 텍스트가 일치하는 버튼을 touchscreen.tap 으로 누른다. 누르기 직전 scrollTop 반환. */
async function scrollDownAndTap(dialog: Locator, page: Page, buttonText: string) {
  const sc = scroller(dialog);
  const pre = await sc.evaluate((el, text) => {
    const btn = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
    if (!btn) return { top: el.scrollTop, x: 0, y: 0, found: false };
    el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, 400);
    const r = btn.getBoundingClientRect();
    return { top: el.scrollTop, x: r.x + r.width / 2, y: r.y + r.height / 2, found: true };
  }, buttonText);
  expect(pre.found, `${buttonText} 버튼을 스크롤러 안에서 못 찾았다`).toBe(true);
  // 접힌 상태의 예약 박스는 스크롤 가능 범위가 400px 에 못 미칠 수 있다(실측: 접힌 화면 227px) —
  //   '충분히 내려간 상태에서 누른다'는 조건만 지키면 되므로, 가능한 최댓값(≤400)까지 내려가는지 재되
  //   임계값은 0에 가깝지 않은 값(100px)으로 완화한다. 펼친 뒤(경로 B)는 여유가 충분해 400을 채운다.
  expect(pre.top, '스크롤러를 의미 있게(100px+) 못 내렸다').toBeGreaterThan(100);
  await page.touchscreen.tap(pre.x, pre.y);
  return pre.top;
}

// eslint(playwright/expect-expect) 은 헬퍼 안의 expect 를 못 본다 — 그래서 단언은 여기서
// **값만 재서 반환**하고, 실제 expect() 호출은 각 test 본문에 직접 둔다.
async function readScrollAndFocusAfter(dialog: Locator, page: Page) {
  await page.waitForTimeout(600); // focusout 복구는 setTimeout(0), 게다가 StatefulActionButton catch 까지 기다린다
  const after = await scroller(dialog).evaluate((el) => el.scrollTop);
  const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? null);
  return { after, activeTag };
}

test.describe('POSTER-RESERVE-SCROLL-TOP 회귀', () => {
  test('경로 A — 헤더 접힘 예약하기(unmount) 탭 후에도 스크롤 위치가 유지된다', async ({ page }) => {
    const dialog = await openPoster(page);
    const before = await scrollDownAndTap(dialog, page, '예약하기');
    const { after, activeTag } = await readScrollAndFocusAfter(dialog, page);
    expect(Math.abs(after - before), `스크롤이 ${before}에서 ${after}로 튀었다 — POSTER-RESERVE-SCROLL-TOP 재발`).toBeLessThanOrEqual(2);
    // 계약 ③ — 포커스가 새면(BODY 로) 되잡아야 한다. 트랩이 깨져 BODY 에 머물면 안 된다.
    expect(activeTag, '포커스가 BODY 로 떨어졌다 — 포커스 트랩 계약 위반').not.toBe('BODY');
  });

  test('경로 B — 펼친 뒤 안쪽 예약하기(StatefulActionButton, 비로그인 disabled) 탭 후에도 스크롤 위치가 유지된다', async ({ page }) => {
    const dialog = await openPoster(page);
    // 먼저 헤더 CTA 를 프로그램적으로(포커스를 안 주는 click()) 펼친다 — 여기서 경로 A 의 버그가
    // 섞여 들어오면 이 테스트가 무엇을 재는지 애매해진다(음성 대조: el.click() 은 포커스를 안 준다).
    await scroller(dialog).evaluate(() => {
      const btn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '예약하기');
      btn?.click();
    });
    await page.waitForTimeout(400);
    const before = await scrollDownAndTap(dialog, page, '예약하기');
    const { after, activeTag } = await readScrollAndFocusAfter(dialog, page);
    expect(Math.abs(after - before), `스크롤이 ${before}에서 ${after}로 튀었다 — POSTER-RESERVE-SCROLL-TOP 재발`).toBeLessThanOrEqual(2);
    expect(activeTag, '포커스가 BODY 로 떨어졌다 — 포커스 트랩 계약 위반').not.toBe('BODY');
  });

  test('대조 — 포커스를 주지 않는 el.click() 으로는 이 버그가 재현되지 않는다(위 두 검사가 항상 참이 아님을 증명)', async ({ page }) => {
    const dialog = await openPoster(page);
    const sc = scroller(dialog);
    const before = await sc.evaluate((el) => {
      const btn = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '예약하기');
      el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, 400);
      btn?.click();
      return el.scrollTop;
    });
    expect(before, '스크롤러를 의미 있게(100px+) 못 내렸다').toBeGreaterThan(100);
    await page.waitForTimeout(600);
    const after = await sc.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before), 'el.click() 만으로도 스크롤이 튀었다 — 대조가 대상과 안 갈린다').toBeLessThanOrEqual(2);
  });
});
