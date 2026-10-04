// dummy-1004 실서버 실연 결함 F4-01·F4-04(2026-10-04, store-team) — 전 빌드 FAIL · 후 빌드 PASS 로 재는 스펙.
//   원문: Documents/누리홀덤_영상분석_0930/dummy-1004/RUN-REPORT.md
//
//  F4-01 장부 시작이 만든 클락 행이 session_date=null(단독 클락)이라 TV 가 PLAYERS 0/0 을 송출했다.
//        → 장부 시작이 보내는 clock_states upsert 의 session_date 가 그 장부 날짜인가.
//  F4-04 카드단가를 받고 헤더에 '카드 6만원' 을 띄웠지만 기록은 현금단가(2026-09-11 오너 규칙). 안내만 틀렸다.
//        → 폼 안내·장부 헤더가 '현금단가로 기록' 을 말하고 '카드 6만원' 을 말하지 않는가.
//
// ⚠ 목킹 세션(_mockOwner) — 화면·요청 모양만 잰다(서버 트리거 20260929t 가 live_stats 를 채우는 것은 서버 몫, 여기서 못 본다).
//   쓰기(ledger_sessions·clock_states)는 이 스펙이 직접 받아 준다. 운영 DB 로 나가는 쓰기 0.
import { test, expect } from './_fixtures';
import type { Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE } from './_mockOwner';

type Row = Record<string, unknown>;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');

test('🔴 F4-01·F4-04 — 장부 시작: 클락 행이 장부 날짜에 연동되고, 카드단가는 참고용이라고 말한다', async ({ page }) => {
  test.setTimeout(120_000);
  const sessions: Row[] = [];
  const clockWrites: Row[] = [];
  await bootOwner(page, {
    viewport: { width: 1280, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      // 상태 있는 ledger_sessions — 시작(upsert)한 행을 다음 조회가 돌려준다.
      await p.route(/\/rest\/v1\/ledger_sessions/, (r) => {
        const req = r.request();
        if (req.method() === 'POST') {
          const body = req.postDataJSON() as Row | Row[];
          for (const row of Array.isArray(body) ? body : [body]) sessions.push(row);
          return r.fulfill(json([{ opened_at: new Date().toISOString() }], 201));
        }
        if (req.method() === 'GET') {
          const u = new URL(req.url());
          const date = u.searchParams.get('session_date');
          const rows = sessions.filter((s) => !date || date === `eq.${String(s.session_date)}` || date.startsWith('gte.') || date.startsWith('lte.'));
          return r.fulfill(json(isSingle(r) ? (rows[0] ?? null) : rows));
        }
        return r.fulfill(json([]));
      });
      // 클락: 행 없음 → 장부 시작이 새 행을 upsert 한다(그 본문을 받는다).
      await p.route(/\/rest\/v1\/clock_states/, (r) => {
        const req = r.request();
        if (req.method() === 'GET') return r.fulfill(json(isSingle(r) ? null : []));
        if (req.method() === 'POST') { clockWrites.push(req.postDataJSON() as Row); return r.fulfill(json([], 201)); }
        return r.fulfill(json([]));
      });
    },
  });
  await openMyStore(page);
  await page.getByRole('tablist', { name: '매장 단계 이동' }).getByRole('tab', { name: /장부/ }).click({ timeout: 30_000 });
  const start = page.getByRole('button', { name: '장부 시작', exact: true });
  await expect(start, '장부 시작 설정 폼이 안 열렸다').toBeVisible({ timeout: 20_000 });

  // F4-04 — 폼 안내
  await expect(page.getByText('카드단가(만원) · 참고용')).toBeVisible();
  await expect(page.getByText('바인은 현금·카드·이체 모두 현금단가로 기록합니다.', { exact: false })).toBeVisible();

  const cash = page.locator("xpath=//span[normalize-space(text())='현금단가(만원) *']/following-sibling::input").first();
  const card = page.locator("xpath=//span[normalize-space(text())='카드단가(만원) · 참고용']/following-sibling::input").first();
  await cash.fill('5');
  await card.fill('6');
  await start.click();

  // F4-01 — 클락 upsert 의 session_date 가 장부 날짜
  await expect.poll(() => clockWrites.length, { message: '장부 시작이 클락 행을 쓰지 않았다', timeout: 15_000 }).toBeGreaterThan(0);
  const w = clockWrites[0];
  expect(w.venue_id).toBe(MOCK_VENUE);
  expect(w.session_date, '장부 시작이 만든 클락이 단독 클락(session_date null)이다 — F4-01').toBe(MOCK_DAY);

  // F4-04 — 시작 뒤 장부 헤더: 현금단가로 기록 · 카드단가는 참고용
  await expect.poll(() => sessions.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(sessions[0].card_amount, '카드단가 저장값(참고용)은 그대로 남아야 한다 — 기능 보존').toBe(60_000);
  const head = page.getByText(/현금 5만원/).first();
  await expect(head).toBeVisible({ timeout: 20_000 });
  await expect(head).toContainText('카드·이체 동일');
  await expect(head).toContainText('카드단가 6만원(참고용)');
  await expect(head, "헤더가 '카드 6만원' 으로 기록 단가를 잘못 안내한다 — F4-04").not.toContainText(' · 카드 6만원');
});
