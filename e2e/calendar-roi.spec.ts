// 캘린더 — 개인 ROI(WP11-roi-calendar). 두 가지를 잠근다:
//  ① 참가비가 적힌 기록에서 참가·총 참가비·순결과·ROI·ITM 이 화면에 닿는가(계산은 src/lib/roi.test.ts 가 못 박는다).
//     서버가 옛 스키마(ROI 컬럼 없음)로 준 행도 섞여 있다 — 읽기는 절대 깨지지 않아야 한다.
//  ② 마이그레이션(20260909b) 전 서버: 참가비를 넣은 insert 가 컬럼 부재(PGRST204)로 거절되면
//     새 필드 없이 한 번 더 시도하고, '금액·메모만 먼저 기록됩니다' 를 말한다.
//
// 세션은 가짜(voucher-sheet-open.spec 의 3종 세트), 조회는 전부 route 로 갈아끼운다. insert 도 route 가
// 응답을 위조하므로 운영 DB 에는 닿지 않는다(page.route 가 _fixtures 의 context.route 보다 먼저 잡는다).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-00000000c01a';
/** 서명 없는 JWT — supabase-js 는 클라이언트에서 **디코드만** 한다(검증은 서버 몫). 아무 문자열이면 세션을 버린다. */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: UID, aud: 'authenticated', role: 'authenticated', email: 'roi@example.com',
    app_metadata: {}, user_metadata: { name: 'ROI' }, created_at: new Date().toISOString(),
  },
};
/** 앱의 '오늘'은 KST — 캘린더의 '이번 달' 범위도 KST 달이다(settle-pane.spec 과 같은 이유). */
const DAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

/** 이번 달 참가 3건 + 옛 스키마 행 1건(ROI 컬럼 키 자체가 없다).
 *  invested = 100000 + 200000 + 50000 = 350000 · net = -100000 + 300000 - 50000 = 150000
 *  → ROI 42.9% · 입상 1/3 → ITM 33% · 결과 합 500000 · 최고 500000 */
const ROWS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', entry_date: DAY, amount: -100000, memo: '', buy_in: 100000, rebuy: 0, addon: 0, venue_name: '강남', game_name: '데일리', created_at: `${DAY}T10:00:00Z` },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', entry_date: DAY, amount: 300000, memo: '', buy_in: 100000, rebuy: 100000, addon: 0, venue_name: '강남', game_name: '데일리', created_at: `${DAY}T11:00:00Z` },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', entry_date: DAY, amount: -50000, memo: '', buy_in: 50000, rebuy: 0, addon: 0, venue_name: '홍대', game_name: '터보', created_at: `${DAY}T12:00:00Z` },
  // 옛 행 — 마이그레이션 전 서버가 주는 모양 그대로(buy_in 등 키 없음). 지표에서는 빠지고 손익에는 들어간다.
  { id: 'aaaaaaaa-0000-4000-8000-000000000004', entry_date: '2026-01-05', amount: 12345, memo: '옛 행', created_at: '2026-01-05T10:00:00Z' },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });   // 유저 = 모바일 99%
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  // ⚠ getMyProfile 은 .single() — 객체 하나여야 한다(배열이면 user.id 만 undefined 인 반쪽 로그인).
  //   role 'user' + venue 없음 → 5번째 칸이 '내 매장' 이 아니라 '캘린더' 다.
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: 'ROI', nickname: 'ROI', role: 'user', status: 'active', activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.route(/\/rest\/v1\/schedule_likes\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/schedule_reservations\?/, (r) => r.fulfill(json([])));
});

async function openCalendar(page: Page) {
  await page.goto('/');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: /^캘린더/ }).first().click();
  await expect(page.locator('[data-tab="calendar"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-tab="calendar"] input[type="date"][aria-label="날짜"]'), '내가 적는 기록 카드가 안 뜬다').toBeVisible({ timeout: 20_000 });
}

test('🔴 ROI 지표 — 이번 달 3건에서 참가·총 참가비·순결과·ROI·ITM 이 뜨고, 옛 스키마 행이 섞여도 읽기가 깨지지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json(ROWS)));
  await openCalendar(page);

  const pane = page.locator('[data-tab="calendar"]');
  const stats = pane.getByTestId('roi-stats');
  await expect(stats).toBeVisible({ timeout: 15_000 });
  // 2026-09-10: 라벨을 바꿨으므로(참가→참가 횟수 · 결과→총 회수액 · 순결과→순손익) 셀렉터를
  // data-stat 으로 교체했다 — CLAUDE.md 규약(라벨 결합 셀렉터는 같은 커밋에서 testid 로).
  // 칸 = [값, 라벨, 서브] p 셋. 값은 여전히 첫 p 다.
  // 주지표 3칸(순손익·ROI·ITM)은 값이 칸의 첫 <p>, 보조 3값은 한 줄 요약 안의 <b> 다.
  const valueOf = (key: string) => pane.locator(`[data-stat="${key}"] > p:first-child`);
  const inlineOf = (key: string) => pane.locator(`[data-stat="${key}"]`);
  await expect(inlineOf('events')).toHaveText('3회');
  await expect(inlineOf('invested')).toHaveText('350,000');
  await expect(inlineOf('result')).toHaveText('500,000');
  await expect(valueOf('net')).toHaveText('+150,000');
  await expect(valueOf('roi')).toHaveText('42.9%');
  await expect(valueOf('itm')).toHaveText('33%');
  // 새 라벨이 화면에 그대로 떠 있는지도 잠근다(§6 워딩 정본)
  for (const label of ['순손익', 'ROI', 'ITM']) {
    await expect(pane.locator(`p:text-is("${label}")`).first(), `라벨 '${label}' 이 없다`).toBeVisible();
  }
  // 보조 지표는 칸이 아니라 한 줄이다 — 2026-09-10 오너 지시(칸이 길어지고 320px 에서 꺾였다)
  await expect(pane.getByText(/회 참가 · 참가비 .* · 회수/), '보조 지표 한 줄 요약이 없다').toBeVisible();
  await expect(pane.getByTestId('roi-stats-sub'), '보조 3칸이 아직 남아 있다').toHaveCount(0);
  // 구획 제목이 '전체 누계'와 '선택 기간 분석'을 갈라 놓는다 — 같은 '순손익'이 두 범위로 뜨기 때문
  await expect(pane.locator('p:text-is("전체 누계")')).toBeVisible();
  await expect(pane.locator('p:text-is("선택 기간 분석")')).toBeVisible();
  // 3건이라 부족 안내는 없다
  await expect(pane.getByTestId('roi-notice')).toHaveCount(0);

  // 매장 필터 — '홍대' 1건뿐이면 ROI 는 3건 미만이라 — 로 접고 이유를 말한다
  await pane.getByLabel('ROI 매장').selectOption({ value: '홍대' });
  await expect(inlineOf('events')).toHaveText('1회');
  await expect(valueOf('roi')).toHaveText('—');
  await expect(pane.getByTestId('roi-notice')).toContainText('기록 3건부터');
  await pane.getByLabel('ROI 매장').selectOption({ value: '' });

  // 전체 기간 — 옛 행(참가비 없음)은 지표에 안 들어가고, 월별 추세 막대가 뜬다
  await pane.getByLabel('ROI 기간').selectOption({ value: 'all' });
  await expect(inlineOf('events')).toHaveText('3회');
  await expect(valueOf('net')).toHaveText('+150,000');
  const trend = pane.getByTestId('roi-trend');
  await expect(trend).toBeVisible();
  await expect(trend.locator('li')).toHaveCount(1);
  await expect(trend).toContainText(DAY.slice(0, 7).replace('-', '.'));

  // 전체 누계 히어로(옛 '손익 3칸' 기능 보존) — 옛 행의 12,345 가 수익에 들어간다.
  // 필터를 '전체 기간·홍대'로 움직여도 이 값은 변하지 않는다(모집단이 다르다는 것이 이 구획의 요지).
  const hero = pane.locator('[data-aura-level="hero"]').first();
  await expect(hero, '전체 누계에 LED 가 켜지지 않았다(기록이 있는데 Aura 0)').toBeVisible();
  // 수익 = 300,000 + 12,345(옛 행) · 손실 = -100,000 + -50,000 · 순손익 = +162,345
  await expect(hero).toContainText('+312,345');
  await expect(hero).toContainText('-150,000');
  await expect(hero.locator('p').nth(1), '순손익이 주 지표로 서 있지 않다').toHaveText('+162,345');
  await expect(hero, '순손익 > 0 인데 emerald 가 아니다').toHaveAttribute('data-aura-variant', 'emerald');
});

test('🔴 마이그레이션 전 서버 — 참가비 insert 가 PGRST204 면 새 필드 없이 재시도하고 그 사실을 말한다', async ({ page }) => {
  test.setTimeout(60_000);
  const posted: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/bankroll_entries(\?|$)/, async (r) => {
    if (r.request().method() !== 'POST') return r.fulfill(json(ROWS));
    // supabase-js 는 단건 insert 를 객체로 보낸다 — 배열로 바뀌어도 첫 행을 본다
    const raw = JSON.parse(r.request().postData() || '{}') as Record<string, unknown> | Record<string, unknown>[];
    const body = Array.isArray(raw) ? raw[0] : raw;
    posted.push(body);
    // 옛 스키마 서버의 실제 거절 모양 — 새 컬럼이 실려 있을 때만 400
    if ('buy_in' in body) {
      return r.fulfill(json({ code: 'PGRST204', message: "Could not find the 'buy_in' column of 'bankroll_entries' in the schema cache", details: null, hint: null }, 400));
    }
    return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await openCalendar(page);

  const pane = page.locator('[data-tab="calendar"]');
  await pane.locator('input[aria-label="금액"]').fill('70000');
  await pane.getByTestId('roi-inputs').locator('summary').click();
  await pane.locator('input[aria-label="참가비"]').fill('30000');
  await pane.locator('input[aria-label="매장 이름"]').fill('강남');
  await pane.getByRole('button', { name: '플러스로 기록' }).click();

  await expect(page.getByText(/서버 업데이트 중입니다/), '컬럼 부재 폴백을 사용자에게 말하지 않았다').toBeVisible({ timeout: 10_000 });
  expect(posted, '재시도가 없었다').toHaveLength(2);
  expect(posted[0]).toMatchObject({ amount: 70000, buy_in: 30000, venue_name: '강남' });
  expect(posted[1]).toMatchObject({ amount: 70000 });
  expect(posted[1], '재시도에 새 필드가 남아 있다').not.toHaveProperty('buy_in');
  expect(posted[1]).not.toHaveProperty('venue_name');
  // 폴백 뒤 입력칸은 비워진다(저장은 됐다)
  await expect(pane.locator('input[aria-label="금액"]')).toHaveValue('');
});

test('옛 호출 그대로 — 새 필드를 비우면 payload 에 ROI 컬럼이 아예 없다(옛 스키마와 호환)', async ({ page }) => {
  test.setTimeout(60_000);
  const posted: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/bankroll_entries(\?|$)/, async (r) => {
    if (r.request().method() !== 'POST') return r.fulfill(json(ROWS));
    const raw = JSON.parse(r.request().postData() || '{}') as Record<string, unknown> | Record<string, unknown>[];
    posted.push(Array.isArray(raw) ? raw[0] : raw);
    return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await openCalendar(page);
  const pane = page.locator('[data-tab="calendar"]');
  await pane.locator('input[aria-label="금액"]').fill('5000');
  await pane.getByRole('button', { name: '마이너스로 기록' }).click();
  await expect(page.getByText('마이너스로 기록했어요')).toBeVisible({ timeout: 10_000 });
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ amount: -5000, memo: '' });
  for (const k of ['buy_in', 'rebuy', 'addon', 'venue_name', 'game_name']) expect(posted[0]).not.toHaveProperty(k);
});
