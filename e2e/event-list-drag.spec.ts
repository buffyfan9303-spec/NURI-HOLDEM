// 이벤트 **목록만** 아래로 끌어 닫기(E1~E4) 전용 회귀 게이트.
//
// 왜 따로 필요한가: E1~E4 구현(`src/components/features/EventListPage.tsx`)은 2026-09-21 에 들어갔는데
//   **제스처 자체를 재는 검사가 한 건도 없었다.** 기존 `event-entry`·`event-backnav`·`event-enter` 는
//   클릭·딥링크·히스토리 축이라, 목록의 드래그 코드를 통째로 지워도 전부 초록이다(실측 확인).
//   설계서 §5 '추가 회귀 계약' ①~⑩ 이 이 파일의 내용이다.
//
// 🔴 **Playwright 의 `click`/`tap` 으로는 이 부류를 절대 재현하지 못한다.** 누름이 0ms 라
//   touchstart→touchmove→touchend 사이에 시간이 없어 8px 히스테리시스도 `releaseVelocity` 도 작동하지
//   않는다(같은 이유로 `e2e/pill-press.spec.ts` 가 CDP 를 쓴다). 여기서는 CDP `Input.dispatchTouchEvent` 로
//   **실제 손가락의 시간축**을 만든다.
//
// 🔴 **기존 목록 fixture 는 캠페인 1개뿐이라 스크롤 반례(③)를 만들 수 없다.** 그래서 이 파일은
//   `event_campaigns` 를 `page.route` 로 가로채 **뷰포트보다 훨씬 긴 30개**를 돌려준다
//   (`listEvents()` 가 `.limit(30)` 이므로 30이 상한이다 — 더 넣어도 30개만 그려진다).
//
// 운영 DB 에는 쓰지 않는다 — 목록·보드 요청을 전부 route 로 가로채므로 네트워크가 나가지 않는다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack } from './_session';

const EVENTS_LIST = /\/rest\/v1\/event_campaigns\?/;
const EVENT_RPC = /\/rest\/v1\/rpc\/event_board/;
const LIST = '[data-testid="event-list-page"]';
const ITEM = '[data-testid="event-list-page"] [data-testid="event-list-item"]';
const GRIP = '[data-testid="event-list-drag-grip"]';
const DIALOG = '[role="dialog"][aria-label="이벤트"]';
const MENU = 'home-event-menu';

const j = (body: unknown, status = 200) => ({ status, contentType: 'application/json' as const, body: JSON.stringify(body) });

/** 뷰포트보다 긴 목록 — 카드 하나가 약 68px 이라 30개면 2,000px 이 넘는다(가장 긴 812px 뷰포트의 2배 이상).
 *  `status:'live'`·기간 null 은 `evaluateEvent` 가 '진행 중'으로 판정하는 조합이다(event-entry.spec 의 LISTED 와 같다). */
const MANY = Array.from({ length: 30 }, (_, i) => ({
  slug: `e2e-drag-${String(i + 1).padStart(2, '0')}`,
  title: `드래그 캠페인 ${i + 1}`,
  subtitle: null, status: 'live', hidden_at: null, starts_at: null, ends_at: null,
}));

/** 보드는 내용이 관심사가 아니다 — 열렸는지만 본다. 어떤 slug 로 물어도 같은 판을 돌려준다. */
const BOARD = {
  slug: MANY[0].slug, title: MANY[0].title, subtitle: null, status: 'live',
  venueId: '00000000-0000-0000-0000-000000000000', startsAt: null, endsAt: null,
  voucherTitle: '매장이용권',
  cards: [{ idx: 1, opened: true, tier: 1, count: 1, by: '누군가' }],
  myTickets: 0, remainByTier: {}, totalByTier: { 1: 1 }, voucherByTier: { 1: 1 },
};

/** 보드 RPC 로 나간 `p_slug` 를 순서대로 모은다 — ④⑤⑥ 의 단언 근거다.
 *  ⚠ 길이만 세지 않고 **slug 까지** 모은다: "열리긴 했는데 엉뚱한 캠페인" 을 길이로는 못 잡는다.
 *
 *  🔴 **0 부터 세지 마라.** 실측(2026-09-21): 홈에서는 0건인데 **목록이 열리는 순간 1건**이 나간다 —
 *     앱이 '지금 열려 있는 캠페인'(`getCurrentEventSlug` → `event_board`)을 미리 물어보기 때문이다.
 *     이걸 모르고 `toEqual([])` 로 단언하면 구현이 멀쩡해도 빨개진다(첫 작성 때 실제로 그랬다).
 *     → 재기 직전에 `asked.length = 0` 으로 **기준선을 끊고 증가분만** 본다. */
async function stub(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route(EVENTS_LIST, (r) => r.fulfill(j(MANY)));
  await page.route(EVENT_RPC, (r) => {
    try {
      const body = r.request().postData();
      const slug = body ? (JSON.parse(body) as { p_slug?: string }).p_slug : undefined;
      asked.push(typeof slug === 'string' ? slug : '(없음)');
    } catch { asked.push('(파싱실패)'); }
    return r.fulfill(j(BOARD));
  });
  return asked;
}

/** 목록을 연다 — 홈의 이벤트 칸이 정본 진입이다(`event-entry.spec.ts` 와 같은 경로). */
async function openList(page: Page): Promise<void> {
  await stabilizeBackstack(page);
  await page.goto('/');
  const menu = page.getByTestId(MENU);
  await expect(menu, '홈의 이벤트 진입 칸이 없다 — 목록으로 가는 길이 사라졌다').toBeVisible({ timeout: 20_000 });
  await menu.click();
  await expect(page.locator(LIST), '이벤트 칸을 눌렀는데 목록이 안 열린다').toBeVisible({ timeout: 20_000 });
  // 목록은 열릴 때마다 listEvents() 를 다시 부른다 — 카드가 그려진 뒤라야 좌표를 잡을 수 있다.
  await expect(page.locator(ITEM).first(), '목록에 카드가 하나도 그려지지 않았다').toBeVisible({ timeout: 20_000 });
}

/** computed transform 의 translateY(px). 요소가 없으면 -1(없음을 0 과 구분한다). */
async function translateY(page: Page, sel = LIST): Promise<number> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return -1;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    const m = /matrix\(([^)]+)\)/.exec(t);
    if (m) return Number(m[1].split(',')[5]);
    const m3 = /matrix3d\(([^)]+)\)/.exec(t);
    return m3 ? Number(m3[1].split(',')[13]) : 0;
  }, sel);
}

interface Cdp { send(method: string, params: unknown): Promise<unknown> }

/** touchStart → steps 회 touchMove. 손은 아직 떼지 않는다. 총 소요 ≈ steps × stepMs. */
async function dragStart(page: Page, x: number, y: number, dx: number, dy: number, steps = 8, stepMs = 16): Promise<Cdp> {
  const cdp = await page.context().newCDPSession(page) as unknown as Cdp;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }],
    });
    await page.waitForTimeout(stepMs);
  }
  return cdp;
}
const dragEnd = (cdp: Cdp) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

/** 한 번에 끝나는 드래그. */
async function drag(page: Page, x: number, y: number, dx: number, dy: number, steps = 8, stepMs = 16): Promise<void> {
  const cdp = await dragStart(page, x, y, dx, dy, steps, stepMs);
  await dragEnd(cdp);
}

/** 짧은 탭(손가락) — 60ms 누르고 뗀다. Playwright 의 click 과 달리 누름 시간이 있다. */
async function tap(page: Page, x: number, y: number, holdMs = 60): Promise<void> {
  const cdp = await page.context().newCDPSession(page) as unknown as Cdp;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 드래그를 시작해도 안전한 지점 — 헤더 제목(h1) 한가운데. 닫기 버튼·카드가 아니라
 *  "무엇을 눌렀는가" 와 "제스처가 먹는가" 를 섞지 않는다. */
async function headerPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(`${LIST} h1`).first().boundingBox();
  expect(box, '목록 헤더 제목을 찾지 못했다 — 셀렉터가 깨졌다').not.toBeNull();
  return { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) };
}

async function cardPoint(page: Page, nth: number): Promise<{ x: number; y: number }> {
  const box = await page.locator(ITEM).nth(nth).boundingBox();
  expect(box, `${nth + 1}번째 카드를 찾지 못했다`).not.toBeNull();
  return { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) };
}

// ──────────────────────────────────────────────────────────────────────────────
// ① 성공 경로 — 맨 위에서 아래로 끌면 닫힌다
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ① 맨 위에서 130ms 아래로 끌면 목록이 닫힌다 (E1)', async ({ page }) => {
  await stub(page);
  await openList(page);
  expect(await translateY(page), '드래그 전인데 목록에 이미 transform 이 걸려 있다').toBe(0);

  const p = await headerPoint(page);
  // 8스텝 × 16ms ≈ 130ms 동안 250px — landing 이 120px 을 훌쩍 넘고 속도도 600px/s 를 넘는다.
  const cdp = await dragStart(page, p.x, p.y, 0, 250);
  // 손이 아직 닿아 있는 동안 **실제로 따라 내려왔는지** 먼저 본다.
  // "닫혔다" 만 보면 제스처 없이 onClose 를 불러도 통과한다 — 손가락 추종이 E1 의 본체다.
  const following = await translateY(page);
  expect(following, `끄는 동안 목록이 손가락을 따라오지 않았다 (translateY=${following})`).toBeGreaterThan(100);
  await dragEnd(cdp);

  await expect(page.locator(LIST), '아래로 끌어 놓았는데 목록이 닫히지 않았다').toBeHidden({ timeout: 10_000 });
  // 목록은 주소를 갖지 않는다(보드만 ?event= 를 쓴다) — 닫은 뒤에도 그 계약이 유지되어야 한다.
  await expect(page).toHaveURL((u) => !u.searchParams.has('event'));
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' }),
    '목록을 닫았는데 뒤 화면이 살아 있지 않다').toBeVisible({ timeout: 10_000 });
});

test('🔴 ① 그립이 모바일에 보인다 — 조작 가능성을 알리는 유일한 표식이다', async ({ page }) => {
  await stub(page);
  await openList(page);
  await expect(page.locator(GRIP), '모바일 목록에 드래그 그립이 없다').toBeVisible({ timeout: 10_000 });
});

// ──────────────────────────────────────────────────────────────────────────────
// ② 무동작 — 8px 미만 · 가로 · 위 방향
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ② 8px 미만·가로·위 방향은 목록을 닫지도 움직이지도 않는다 (E2 히스테리시스)', async ({ page }) => {
  await stub(page);
  await openList(page);
  const p = await headerPoint(page);

  const cases: { name: string; dx: number; dy: number }[] = [
    { name: '8px 미만 아래(6px)', dx: 0, dy: 6 },
    { name: '가로 우세(가로 80 · 세로 20)', dx: 80, dy: 20 },
    { name: '위 방향(-120px)', dx: 0, dy: -120 },
  ];
  const failures: string[] = [];
  for (const c of cases) {
    await drag(page, p.x, p.y, c.dx, c.dy);
    // 바운스백(springTo response 0.3s)이 끝날 시간을 준다 — 제자리로 **돌아오는 것**까지가 계약이다.
    await page.waitForTimeout(600);
    if (!(await page.locator(LIST).isVisible())) { failures.push(`${c.name}: 목록이 닫혔다`); break; }
    const y = await translateY(page);
    if (Math.abs(y) > 1) failures.push(`${c.name}: 제자리로 돌아오지 않았다 (translateY=${y})`);
  }
  expect(failures.join(' | '), '탭·가로 스크롤·위로 당기기가 닫기로 오인됐다').toBe('');
});

// ──────────────────────────────────────────────────────────────────────────────
// ③ 스크롤 중에는 닫기가 아니라 스크롤이다
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ③ scrollTop>0 에서 아래로 끌면 닫히지 않고 자연 스크롤이 돌아온다 (E2)', async ({ page }) => {
  await stub(page);
  await openList(page);
  // 30개 fixture 가 있어야 성립하는 케이스다 — 목록이 실제로 뷰포트보다 긴지 먼저 단언한다.
  // (캠페인 1개짜리 기존 fixture 로는 scrollTop 을 0 보다 크게 만들 수 없어 이 반례가 성립하지 않는다.)
  const over = await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement | null;
    return el ? el.scrollHeight - el.clientHeight : -1;
  }, LIST);
  expect(over, '목록이 뷰포트보다 길지 않다 — 스크롤 반례를 만들 수 없다(fixture 확인)').toBeGreaterThan(200);

  await page.evaluate((s) => { (document.querySelector(s) as HTMLElement).scrollTop = 200; }, LIST);
  expect(await page.evaluate((s) => (document.querySelector(s) as HTMLElement).scrollTop, LIST)).toBeGreaterThan(1);

  const p = await headerPoint(page);
  await drag(page, p.x, p.y, 0, 250);
  await page.waitForTimeout(600);

  await expect(page.locator(LIST), '스크롤 중이었는데 아래로 끌자 목록이 닫혔다 — 읽다가 사라진다').toBeVisible();
  expect(Math.abs(await translateY(page)), '스크롤 중이었는데 패널이 통째로 따라 내려갔다').toBeLessThanOrEqual(1);
  // 그리고 손짓은 삼켜지지 않고 **스크롤로 쓰였다** — preventDefault 를 걸지 않았다는 증거다.
  const after = await page.evaluate((s) => (document.querySelector(s) as HTMLElement).scrollTop, LIST);
  expect(after, `아래로 끌었는데 스크롤 위치가 그대로다(${after}) — 제스처가 삼켜졌다`).toBeLessThan(200);
});

// ──────────────────────────────────────────────────────────────────────────────
// ④ 카드 탭 — 고른 slug 만 열린다
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ④ 카드를 짧게 탭하면 그 slug 의 보드만 열린다 (E3)', async ({ page }) => {
  const asked = await stub(page);
  await openList(page);
  const p = await cardPoint(page, 2); // 3번째 카드 — 첫 카드로 고정하면 "무조건 첫 개" 결함을 못 잡는다
  asked.length = 0;                   // 목록 열림 프리페치를 기준선에서 끊는다(stub 머리말 참고)
  await tap(page, p.x, p.y);

  await expect(page.locator(DIALOG), '카드를 탭했는데 보드가 안 열린다').toBeVisible({ timeout: 15_000 });
  await expect(page, '보드가 떴는데 주소에 event 가 없다').toHaveURL((u) => u.searchParams.get('event') === MANY[2].slug);
  // 판이 뜨는 것과 그 slug 를 실제로 물어보는 것은 다른 사건이다 — RPC 는 판보다 늦게 나갈 수 있다.
  await expect.poll(() => asked, {
    message: `보드 RPC 가 고른 카드의 slug 를 묻지 않았다 — ${JSON.stringify(asked)}`, timeout: 15_000,
  }).toContain(MANY[2].slug);
});

// ──────────────────────────────────────────────────────────────────────────────
// ⑤ 드래그 뒤 합성 click 이 상세를 열지 않는다 + 가드가 다음 탭을 막지 않는다
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ⑤ 카드 위에서 끌면 상세가 안 열리고, 바로 다음 탭은 정상으로 열린다 (E3 합성 click 가드 + 리셋)', async ({ page }) => {
  const asked = await stub(page);
  await openList(page);
  const p = await cardPoint(page, 1);

  asked.length = 0; // 목록 열림 프리페치를 기준선에서 끊는다(stub 머리말 참고)
  // 🔴 **바운스백이 되는 드래그**를 쓴다 — 8px 는 넘겨 '드래그 확정'시키되(가드가 걸린다)
  //    landing 이 120px 을 못 넘게 천천히 30px 만 민다. 닫히는 드래그를 쓰면 목록이 사라져
  //    "가드가 리셋되는가" 를 같은 화면에서 이어서 볼 수 없다(리셋 누락은 실제로 지적된 위험이다).
  await drag(page, p.x, p.y, 0, 30, 10, 30);
  await page.waitForTimeout(700); // 제자리 복귀 + 브라우저가 합성 click 을 보낼 시간

  await expect(page.locator(LIST), '30px 만 천천히 끌었는데 목록이 닫혔다 — 놓기 판정이 너무 무르다').toBeVisible();
  expect(Math.abs(await translateY(page)), '끌다 놓았는데 제자리로 안 돌아왔다').toBeLessThanOrEqual(1);
  await expect(page.locator(DIALOG), '드래그 뒤 합성 click 이 카드를 열었다 — 끌기만 했는데 상세로 들어간다').toBeHidden();
  expect(asked, `드래그만 했는데 보드 RPC 가 나갔다 — ${JSON.stringify(asked)}`).toEqual([]);

  // 🔴 여기부터가 '가드 리셋' — 같은 카드를 다시 짧게 탭하면 정상으로 열려야 한다.
  //    suppressClick 을 touchstart 첫 줄에서 풀지 않으면 바운스백 뒤 카드 탭이 **영영** 안 먹는다.
  const p2 = await cardPoint(page, 1);
  await tap(page, p2.x, p2.y);
  await expect(page.locator(DIALOG), '바운스백 뒤 같은 카드를 탭했는데 안 열린다 — 합성 click 가드가 리셋되지 않았다')
    .toBeVisible({ timeout: 15_000 });
  await expect.poll(() => asked, {
    message: `재탭이 엉뚱한 slug 를 물었다 — ${JSON.stringify(asked)}`, timeout: 15_000,
  }).toContain(MANY[1].slug);
});

// ──────────────────────────────────────────────────────────────────────────────
// ⑥ A/B 교차선택
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ⑥ 카드 A 를 열고 돌아와 카드 B 를 열면 각각 제 slug 로 간다 (E3)', async ({ page }) => {
  const asked = await stub(page);
  await openList(page);

  const a = await cardPoint(page, 0);
  asked.length = 0; // 목록 열림 프리페치를 기준선에서 끊는다
  await tap(page, a.x, a.y);
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL((u) => u.searchParams.get('event') === MANY[0].slug);
  await expect.poll(() => asked, { message: `A 의 보드 RPC 가 안 나갔다 — ${JSON.stringify(asked)}`, timeout: 15_000 })
    .toContain(MANY[0].slug);

  // 뒤로가기 1회 — 보드만 닫히고 목록이 그대로 드러난다(event-backnav.spec.ts 의 두 겹 계약).
  await page.goBack();
  await expect(page.locator(DIALOG)).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(LIST), '보드를 닫았는데 목록까지 사라졌다').toBeVisible({ timeout: 15_000 });

  const b = await cardPoint(page, 4);
  asked.length = 0; // 🔴 여기서 다시 끊는다 — 돌아온 목록이 A 를 한 번 더 프리페치한다(실측).
  await tap(page, b.x, b.y);
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
  await expect(page, 'B 를 눌렀는데 주소가 A 그대로다 — 두 번째 선택이 먹지 않는다')
    .toHaveURL((u) => u.searchParams.get('event') === MANY[4].slug);
  await expect.poll(() => asked, {
    message: `B 의 보드 RPC 가 나가지 않았다 — ${JSON.stringify(asked)}`, timeout: 15_000,
  }).toContain(MANY[4].slug);
});

// ──────────────────────────────────────────────────────────────────────────────
// ⑦ 상세(보드)에는 스와이프 닫기가 없다 — 오너 명시 금지
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ⑦ 이벤트 상세 본문을 아래로 쓸어도 닫히지 않는다 (E4 — 상세에는 제스처 금지)', async ({ page }) => {
  await stub(page);
  await openList(page);
  const p = await cardPoint(page, 0);
  await tap(page, p.x, p.y);
  const dlg = page.locator(DIALOG);
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500); // 판이 정착한 뒤에 잰다

  const box = await dlg.boundingBox();
  expect(box, '이벤트 판의 좌표를 잡지 못했다').not.toBeNull();
  // 본문 한가운데에서 목록과 **똑같은** 손짓을 보낸다 — 목록이면 닫히는 그 동작이다.
  const x = Math.round(box!.x + box!.width / 2);
  const y = Math.round(box!.y + Math.min(box!.height * 0.45, 320));
  await drag(page, x, y, 0, 250);
  await page.waitForTimeout(700);

  await expect(dlg, '이벤트 상세가 아래 스와이프로 닫혔다 — 오너가 금지한 동작이다').toBeVisible();
  await expect(page, '상세가 떠 있는데 주소에서 event 가 빠졌다').toHaveURL((u) => u.searchParams.has('event'));
  expect(Math.abs(await translateY(page, DIALOG)),
    '상세 판이 손가락을 따라 움직였다 — 드래그 핸들러가 상세에도 붙었다').toBeLessThanOrEqual(1);
});

// ──────────────────────────────────────────────────────────────────────────────
// ⑧ 상세 Back → 목록 → 목록 스와이프 닫기
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ⑧ 상세에서 Back 으로 목록에 돌아온 뒤에도 목록 스와이프가 살아 있다 (E1 재진입)', async ({ page }) => {
  await stub(page);
  await openList(page);
  const p = await cardPoint(page, 0);
  await tap(page, p.x, p.y);
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });

  await page.goBack();
  await expect(page.locator(DIALOG)).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(LIST)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(ITEM).first()).toBeVisible({ timeout: 15_000 });
  expect(Math.abs(await translateY(page)), '보드에서 돌아온 목록에 transform 이 남아 있다').toBeLessThanOrEqual(1);

  const h = await headerPoint(page);
  await drag(page, h.x, h.y, 0, 250);
  await expect(page.locator(LIST),
    '보드를 거쳐 돌아온 목록은 스와이프로 닫히지 않는다 — 재진입에서 리스너가 죽었다').toBeHidden({ timeout: 10_000 });
  await expect(page).toHaveURL((u) => !u.searchParams.has('event'));
});

// 🔴 ⑧-0 (2026-09-26 root-cause) — ⑧ 이 간헐(로컬 10/20)로 빨갛던 근본 원인: **판이 화면에 뜬 뒤에야 뒤로가기 칸이 생겼다.**
//   useBackClose 가 useEffect(=페인트 뒤)로 pushState 를 해서, 보드가 그려지고 30~110ms 동안 history 에 보드 칸이 없었다.
//   그 창에 누른 Back 은 보드가 아니라 **목록 칸**을 소비해 목록이 닫히고, 보드는 뒤늦게 칸을 잡아 그대로 남는다.
//   ⑧ 은 이걸 타이밍 운으로만 잡는다 — 여기서는 **판이 DOM 에 들어오는 순간의 history.state** 를 직접 본다(결정적).
test('🔴 ⑧-0 목록·보드가 DOM 에 나타나는 순간 이미 제 뒤로가기 칸을 갖고 있다 (Back 선점 창 0)', async ({ page }) => {
  await stub(page);
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const seen: Record<string, number> = ((window as unknown as { __layerAt: Record<string, number> }).__layerAt = {});
    const layer = () => { const s = history.state as { __layer?: unknown } | null; return s && typeof s.__layer === 'number' ? s.__layer : 0; };
    // MutationObserver 콜백은 커밋 직후 마이크로태스크다 — 레이아웃 단계(동기)의 pushState 는 이미 끝났고,
    //   페인트 뒤로 밀린 useEffect 의 pushState 는 아직이다. 즉 이 시점의 칸 번호가 곧 "Back 을 눌렀을 때 닫힐 겹" 이다.
    new MutationObserver(() => {
      for (const [k, sel] of [['list', '[data-testid="event-list-page"]'], ['board', '[role="dialog"][aria-label="이벤트"]']] as const) {
        if (!(k in seen) && document.querySelector(sel)) seen[k] = layer();
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-label'] });
  });
  await openList(page);
  const p = await cardPoint(page, 0);
  await tap(page, p.x, p.y);
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
  const at = await page.evaluate(() => (window as unknown as { __layerAt: Record<string, number> }).__layerAt);
  expect(at.list, `목록이 뜬 순간 뒤로가기 칸이 없었다(__layer=${at.list}) — 그 창의 Back 은 목록이 아니라 아래 탭을 닫는다`).toBeGreaterThan(0);
  expect(at.board, `보드가 뜬 순간 칸이 여전히 목록 것이었다(목록 ${at.list} · 보드 ${at.board}) — 그 창의 Back 은 보드 대신 목록을 닫는다(⑧ 간헐 실패의 원인)`)
    .toBeGreaterThan(at.list);
});

// ──────────────────────────────────────────────────────────────────────────────
// ⑨ 취소 · 빠른 Back · 두 번째 터치 — transform 0 · URL 정합 · 늦은 onClose 0회
// ──────────────────────────────────────────────────────────────────────────────
test('🔴 ⑨-a 멀티터치로 취소하면 제자리로 돌아오고 닫히지 않는다', async ({ page }) => {
  await stub(page);
  await openList(page);
  const p = await headerPoint(page);

  const cdp = await page.context().newCDPSession(page) as unknown as Cdp;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y + i * 20 }] });
    await page.waitForTimeout(16);
  }
  // 두 번째 손가락이 닿고 **움직인다** — 핀치 줌으로 시작한 손짓은 닫기가 아니다.
  // ⚠ 대고 가만히 있으면 안 된다: 취소 판정은 `touchmove` 안에서 `e.touches.length > 1` 을 보고 내려진다.
  //   대기만 하면 구현이 멀쩡해도 취소 지점을 지나가지 않아 빨개진다(첫 작성 때 실제로 그랬다).
  //   실제 사람도 두 손가락을 댄 채 가만히 있지 않는다 — 핀치는 곧 움직임이다.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: p.x, y: p.y + 100 }, { x: p.x + 120, y: p.y + 100 }],
  });
  for (let i = 1; i <= 3; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: p.x - i * 8, y: p.y + 100 + i * 8 }, { x: p.x + 120 + i * 8, y: p.y + 100 + i * 8 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);

  await expect(page.locator(LIST), '두 손가락이 닿자 목록이 닫혔다').toBeVisible();
  expect(Math.abs(await translateY(page)), '취소된 드래그가 제자리로 돌아오지 않고 굳었다').toBeLessThanOrEqual(1);
});

test('🔴 ⑨-b 닫히는 도중 Back 을 눌러도 늦은 onClose 가 화면을 한 겹 더 삼키지 않는다', async ({ page }) => {
  await stub(page);
  await openList(page);
  const p = await headerPoint(page);

  // 닫기 애니메이션(response 0.3s)이 **끝나기 전에** Back 을 던진다 — 언마운트 cleanup 이 WAAPI 를
  // cancel() 하고, springTo 의 "취소된 애니는 완료 Promise 를 resolve 하지 않는다" 불변식 덕에
  // 옛 then(onClose) 가 나중에 되살아나면 안 된다. 되살아나면 history 가 한 칸 더 빠져 앱을 떠난다.
  const cdp = await dragStart(page, p.x, p.y, 0, 250);
  await dragEnd(cdp);
  await page.waitForTimeout(60);
  await page.goBack();
  await page.waitForTimeout(1_500); // 늦은 onClose 가 있었다면 이 사이에 터진다

  await expect(page.locator(LIST), '뒤로가기 뒤에도 목록이 남아 있다').toBeHidden({ timeout: 10_000 });
  await expect(page).toHaveURL((u) => !u.searchParams.has('event'));
  // 🔴 **앱을 떠나지 않았다** — 늦은 onClose 가 history.back() 을 한 번 더 부르면 여기서 빈 화면이 된다.
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' }),
    '닫기 애니 중 Back 뒤에 화면이 사라졌다 — onClose 가 두 번 불려 히스토리를 한 칸 더 먹었다')
    .toBeVisible({ timeout: 10_000 });
  expect(page.url(), `앱 밖으로 나갔다 — ${page.url()}`).toContain('/');
});

test('🔴 ⑨-c 닫히는 도중 다시 잡으면 그 자리에서 멈춘다 (presentationY 를 먼저 읽는다)', async ({ page }) => {
  await stub(page);
  await openList(page);
  const vp = page.viewportSize()!;
  const x = Math.round(vp.width / 2);
  const y1 = Math.round(vp.height * 0.10); // 끌기 시작점 — 맨 위(scrollTop 0 조건)
  const y2 = Math.round(vp.height * 0.85); // 🔴 다시 잡는 지점은 **화면 아래쪽**이어야 한다(아래 설명)
  const DIST = 250;

  // 🔴 이 검사는 **닫힘 애니 도중**에 재야만 의미가 있다. 두 번 헛발을 디뎠다(2026-09-21):
  //   ① 원래 좌표에서 다시 잡으면 패널이 이미 그만큼 내려가 있어 **터치가 뒤 화면에 닿는다**
  //      (567 → 821 로 그냥 흘러내렸다). → 다시 잡는 지점을 화면 아래쪽(0.85vh)으로 둔다.
  //   ② 바운스백(30px) 도중에 재면 **결함을 못 잡는다.** 그 구간에서는 인라인 transform(마지막 손가락
  //      위치)과 애니 진행값이 거의 같아서, 순서를 뒤집어도 차이가 안 난다 — 음성 대조에서 실제로
  //      순서를 뒤집은 빌드가 **그대로 통과했다.** 잘못된 통과라 이 판정 방식을 버렸다.
  //
  //   무엇을 재나: touchstart 가 `presentationY` 를 **먼저 읽으면** 지금 눈에 보이는 위치(애니 진행값,
  //   250px 을 한참 넘어선 값)를 이어받는다. `cancel()` 을 먼저 하면 효과가 지워져 인라인 transform
  //   (= 손가락이 마지막으로 있던 250px)이 읽히고 패널이 **뒤로 점프**한다. 그래서 `> DIST + 50` 이다.
  //   ⚠ 절대 위치의 앞뒤 차이로는 재지 마라 — `newCDPSession()` 과 `evaluate` 왕복에만 ~57ms 가 들고
  //     애니는 그 사이에도 ms 당 ~3px 움직여, 멀쩡한 구현에서도 170px 차이가 나온다(이것도 실제로 겪었다).
  const cdp2 = await page.context().newCDPSession(page) as unknown as Cdp; // 미리 만들어 둔다(생성 지연 배제)

  const cdp = await dragStart(page, x, y1, 0, DIST);
  await dragEnd(cdp);
  await page.waitForTimeout(50); // 닫히는 중 — 이 시점 오프셋은 DIST 를 이미 넘어섰고 y2 보다는 작다
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y2 }] });

  const s1 = await translateY(page);
  await page.waitForTimeout(150);
  const s2 = await translateY(page);
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  expect(s1,
    `다시 잡았더니 패널이 ${s1}px 로 뒤로 점프했다(손가락이 마지막에 있던 ${DIST}px 부근) — ` +
    'presentationY 를 읽기 전에 cancel() 한 순서 결함이다').toBeGreaterThan(DIST + 50);
  expect(Math.abs(s2 - s1),
    `다시 잡았는데 패널이 계속 흘러내린다 (${s1} → ${s2}) — 진행 중이던 닫기 애니가 취소되지 않았다`).toBeLessThanOrEqual(2);
  // 다시 잡았다 그대로 떼면(이동 8px 미만) 닫히던 판은 **되돌아온다** — 사용자가 마음을 바꾼 경우다.
  await expect(page.locator(LIST), '닫히던 판을 다시 잡았다 뗐는데 그대로 닫혔다').toBeVisible({ timeout: 10_000 });
  await expect.poll(() => translateY(page).then(Math.abs), {
    message: '다시 잡았다 뗀 뒤 제자리로 안 돌아왔다', timeout: 10_000,
  }).toBeLessThanOrEqual(1);
});

// ──────────────────────────────────────────────────────────────────────────────
// ⑩ 폭별 · PC · reduced-motion · 포커스 복귀
// ──────────────────────────────────────────────────────────────────────────────
for (const width of [320, 390, 412]) {
  test(`🔴 ⑩ ${width}px 에서도 아래로 끌면 닫힌다`, async ({ page }) => {
    await stub(page);
    await page.setViewportSize({ width, height: 812 });
    await openList(page);
    const p = await headerPoint(page);
    await drag(page, p.x, p.y, 0, 250);
    await expect(page.locator(LIST), `${width}px 에서 목록이 스와이프로 닫히지 않았다`).toBeHidden({ timeout: 10_000 });
  });
}

test('🔴 ⑩ PC 1440px — 같은 손짓을 보내도 목록이 움직이지도 닫히지도 않는다', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page);
  await expect(page.locator(GRIP), 'PC 에 드래그 그립이 보인다 — lg:hidden 이 풀렸다').toBeHidden();

  const p = await headerPoint(page);
  await drag(page, p.x, p.y, 0, 250);
  await page.waitForTimeout(700);
  await expect(page.locator(LIST), 'PC 에서 터치 손짓에 목록이 닫혔다 — 1024px 이상 가드가 풀렸다').toBeVisible();
  expect(Math.abs(await translateY(page)), 'PC 에서 목록이 손가락을 따라 움직였다').toBeLessThanOrEqual(1);
});

test('🔴 ⑩ reduced-motion 에서도 끌어 닫기가 동작한다 — 모션을 줄인다고 기능을 잃지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stub(page);
  await openList(page);
  const p = await headerPoint(page);
  await drag(page, p.x, p.y, 0, 250);
  await expect(page.locator(LIST), 'reduced-motion 에서 끌어 닫기가 먹지 않는다').toBeHidden({ timeout: 10_000 });
});

test('🔴 ⑩ 끌어 닫은 뒤 포커스가 뒤 화면으로 돌아온다 — 키보드 사용자가 갇히지 않는다', async ({ page }) => {
  await stub(page);
  await openList(page);
  // 목록이 떠 있는 동안 포커스는 목록 안에 있다(useDialogFocus 의 트랩).
  // ⚠ **즉시 읽지 마라.** `useDialogFocus` 는 50ms 타이머 뒤에 첫 포커스를 잡는데, 카드 렌더 대기가
  //   그보다 먼저 끝날 수 있다 — 구현이 멀쩡해도 false 가 나온다(첫 작성 때 실제로 그랬다).
  //   poll 로 바꾼다: 끝내 안 들어오면 여전히 실패하므로 단언이 약해지지 않는다.
  await expect.poll(
    () => page.evaluate((s) => !!document.activeElement?.closest(s), LIST),
    { message: '목록이 떠 있는데 포커스가 끝내 그 안으로 안 들어온다 — 포커스 트랩이 깨졌다', timeout: 10_000 },
  ).toBe(true);

  const p = await headerPoint(page);
  await drag(page, p.x, p.y, 0, 250);
  await expect(page.locator(LIST)).toBeHidden({ timeout: 10_000 });
  await page.waitForTimeout(400);

  const where = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { tag: el?.tagName ?? null, body: el === document.body, inList: !!el?.closest('[data-testid="event-list-page"]') };
  });
  expect(where.inList, '목록이 닫혔는데 포커스가 사라진 목록 안에 남아 있다').toBe(false);
  expect(where.body, `닫은 뒤 포커스가 body 로 떨어졌다 — 진입 칸으로 돌아와야 한다 (${JSON.stringify(where)})`).toBe(false);
});
