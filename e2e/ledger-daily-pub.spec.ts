// 데일리 펍 장부 동선 — 오너 1b(2026-10-02): 하루 장부 10건+ 매장.
//
// 감사(audit-mystore-ui-1002 §1-3) 실측 결함과 계약:
//   ① 진입 착지 — 단계 바 '장부'로 들어오면 그날 **진행 중(마감 전) 마지막 게임**에 선다(종전: 마감된 메인).
//   ② 게임 선택 줄은 **하나**(종전: 셸 '오늘 게임' + 판 안 '게임' 두 줄).
//   ③ 고른 칩이 줄 안에 보인다(종전: 15번째를 골라도 scrollLeft 0 — 화면 밖).
//   ④ 6개 이상이면 [게임 이동] 선택으로 한 번에 간다.
//   ⑤ 목록 모드 — 진행 중이 위, 마감 4개 이상은 '마감 N개 보기' 로 접힌다.
// 전부 목킹(운영 쓰기 0).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const RAIL = '[data-mystore-rail]';
const TITLES = Array.from({ length: 15 }, (_, i) => `데일리 ${i + 1}부`);
const sessions = TITLES.map((t, i) => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: i + 1, title: t, buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], reg_closed: i < 10, closed: i < 10, closed_at: i < 10 ? `${MOCK_DAY}T20:00:00+09:00` : null,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${MOCK_DAY}T01:00:00Z`,
}));
const players = (seq: number) => ['김철수', '이영희', '박민수'].map((n, i) => ({ id: `ffffffff-0000-4000-8000-${String(seq * 10 + i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: seq, name: n, visitor_type: null, note: null, sort_order: i }));

async function open(page: Page, w: number, h: number, o: { vouchers?: boolean } = {}) {
  const seqs: number[] = [];
  page.on('request', (r) => { const m = /ledger_sessions\?.*game_seq=eq\.(\d+)/.exec(r.url()); if (m) seqs.push(Number(m[1])); });
  await bootOwner(page, {
    viewport: { width: w, height: h },
    // 이용권(본인인증 통합) 스위치가 켜져야 장부 옆 레일이 서고, ≥1440 폭 상한 풀기가 걸린다(⑦)
    ...(o.vouchers ? { appSettings: { identity_voucher_enabled: 'on' } } : {}),
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const m = /game_seq=eq\.(\d+)/.exec(r.request().url());
        const rows = m ? sessions.filter((s) => s.game_seq === Number(m[1])) : sessions;
        return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
      });
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const m = /game_seq=eq\.(\d+)/.exec(r.request().url());
        return r.fulfill(json(players(m ? Number(m[1]) : 1)));
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-testid="ledger-date"]').first(), '장부 보드가 안 열렸다').toBeVisible({ timeout: 20_000 });
  return { seqs };
}

const chipInView = (page: Page, name: RegExp) => page.evaluate((src) => {
  const rx = new RegExp(src);
  const g = [...document.querySelectorAll<HTMLElement>('[role=group]')].filter((e) => e.getClientRects().length && /게임 선택$/.test(e.getAttribute('aria-label') ?? ''));
  const b = g.flatMap((x) => [...x.querySelectorAll<HTMLElement>('button')]).find((x) => rx.test(x.textContent ?? ''));
  if (!b) return null;
  const a = b.closest<HTMLElement>('[role=group]')!.getBoundingClientRect(); const r = b.getBoundingClientRect();
  return { inView: r.left >= a.left - 1 && r.right <= a.right + 1, pressed: b.getAttribute('aria-pressed') };
}, name.source);

for (const [W, H] of [[1366, 768], [390, 844]] as const) {
  test(`${W} — ① 진행 중 마지막 게임 착지 · ② 게임 줄 하나 · ③ 고른 칩 보임 · ④ 게임 이동 선택`, async ({ page }) => {
    test.setTimeout(120_000);
    const { seqs } = await open(page, W, H);
    // ① 15게임 중 11~15 진행 → 마지막 진행(15 = 사이드14)
    await expect.poll(() => chipInView(page, /^사이드14/).then((x) => x?.pressed), { message: '진행 중 마지막 게임(사이드14)에 착지하지 않았다', timeout: 10_000 }).toBe('true');
    await expect.poll(() => seqs.includes(15), { message: '장부가 사이드14(game_seq=15) 보드를 조회하지 않았다', timeout: 10_000 }).toBe(true);
    // ② 게임 선택 줄은 하나
    await expect(page.getByRole('group', { name: /게임 선택$/ }), '게임 선택 줄이 두 벌이다').toHaveCount(1);
    // ③ 착지한 칩이 줄 안에 보인다(15번째라 가로 스크롤 끝 쪽이다)
    expect((await chipInView(page, /^사이드14/))?.inView, '고른 칩(사이드14)이 줄 밖에 있다').toBe(true);
    // ③-b 다른 끝(메인)을 고르면 그 칩이 보인다
    await page.getByRole('group', { name: /게임 선택$/ }).getByRole('button', { name: /^메인/ }).evaluate((b) => (b as HTMLElement).click());
    await expect.poll(() => chipInView(page, /^메인/), { message: '메인을 골랐는데 선택·보임이 아니다', timeout: 10_000 }).toEqual({ inView: true, pressed: 'true' });
    // ④ 게임 이동 선택(6개 이상)
    const sel = page.getByRole('combobox', { name: /게임으로 이동/ });
    await expect(sel, '게임이 15개인데 게임 이동 선택이 없다').toBeVisible();
    await sel.selectOption('6');
    await expect.poll(() => chipInView(page, /^사이드5/), { message: '게임 이동 선택으로 사이드5 에 가지 않았다', timeout: 10_000 }).toEqual({ inView: true, pressed: 'true' });
    await expect.poll(() => seqs.includes(6), { message: '사이드5(game_seq=6) 보드를 조회하지 않았다', timeout: 10_000 }).toBe(true);
  });
}

test('1366 — ⑤ 목록: 진행 중이 위 · 마감 10개 접힘 → 펼치기', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 1366, 768);
  await page.getByRole('button', { name: '목록으로' }).first().evaluate((b) => (b as HTMLElement).click());
  const today = page.locator('[data-pane="ledger"] ul').first();
  await expect(today, '장부 목록이 안 열렸다').toBeVisible({ timeout: 15_000 });
  const rows = await today.locator(':scope > li').allTextContents();
  console.log('[목록]', JSON.stringify(rows.map((r) => r.replace(/\s+/g, ' ').slice(0, 30))));
  expect(rows.slice(0, 5).every((t) => /진행중/.test(t)), '진행 중 5개가 맨 위가 아니다').toBe(true);
  expect(rows.filter((t) => /마감/.test(t) && !/보기/.test(t)).length, '마감 10개가 접히지 않았다').toBe(0);
  await today.getByRole('button', { name: /마감 10개 보기/ }).evaluate((b) => (b as HTMLElement).click());
  await expect(today.locator(':scope > li'), '펼쳤는데 15개가 아니다').toHaveCount(15);
});

// ⑥ F-3(design-reviewer 2026-10-02) — 재진입 착지. 예전엔 첫 진입이 남긴 시드(메인)가 이겨 클락·순위를 다녀오면 마감된 메인에 섰다.
//   고르지 않았으면 진행 중 게임(사이드14)으로, 직접 고른 게임(사이드12)은 다녀와도 그대로.
const railStep = async (page: Page, label: string) => {
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: label }).first().evaluate((b) => (b as HTMLElement).click());
  await page.waitForTimeout(600);
};
for (const [W, H] of [[1366, 768], [390, 844]] as const) {
  test(`${W} — ⑥ 재진입: 클락·순위를 다녀와도 진행 게임/고른 게임에 선다`, async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, W, H);
    await expect.poll(() => chipInView(page, /^사이드14/).then((x) => x?.pressed), { message: '첫 진입이 사이드14 가 아니다', timeout: 10_000 }).toBe('true');
    await railStep(page, '클락'); await railStep(page, '장부');
    await expect.poll(() => chipInView(page, /^사이드14/).then((x) => x?.pressed), { message: '클락을 다녀오니 진행 게임(사이드14)이 아니다(마감 메인으로 돌아감)', timeout: 10_000 }).toBe('true');
    await page.getByRole('combobox', { name: /게임으로 이동/ }).selectOption('13');
    await expect.poll(() => chipInView(page, /^사이드12/).then((x) => x?.pressed), { timeout: 10_000 }).toBe('true');
    await railStep(page, '클락'); await railStep(page, '장부');
    await expect.poll(() => chipInView(page, /^사이드12/).then((x) => x?.pressed), { message: '직접 고른 사이드12 가 클락을 다녀오니 사라졌다', timeout: 10_000 }).toBe('true');
    await railStep(page, '순위'); await railStep(page, '장부');
    await expect.poll(() => chipInView(page, /^사이드12/).then((x) => x?.pressed), { message: '직접 고른 사이드12 가 순위를 다녀오니 사라졌다', timeout: 10_000 }).toBe('true');
  });
}

// ⑦ F-2(design-reviewer 2026-10-02, 리드 결정 a) — ≥1440 에서 단계를 옮길 때 헤더·단계 바가 가로로 튀지 않는다.
//   예전엔 장부 판이 보일 때만 앱 프레임 상한을 풀어 장부↔클락마다 105px(1440)·345px(1920) 움직였다. 이제 내 매장 탭 단위로 푼다.
test.describe('마우스 PC', () => {
  test.use({ isMobile: false, hasTouch: false });
  for (const [W, H] of [[1440, 900], [1920, 1080]] as const) {
    test(`${W} — ⑦ 장부↔클락↔순위 이동 중 셸 가로 위치 불변(rAF 표본)`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, W, H, { vouchers: true });
      await expect(page.locator('[data-ledger-workspace="rail"]'), '≥1440 인데 레일이 표 옆에 서지 않았다(이 검사의 전제)').toHaveCount(1, { timeout: 15_000 });
      await page.waitForTimeout(800);
      const xs = () => page.evaluate(() => {
        const x = (s: string) => { const e = [...document.querySelectorAll(s)].find((n) => n.getClientRects().length); return e ? Math.round(e.getBoundingClientRect().left) : null; };
        return { header: x('header'), rail: x('[data-mystore-rail]') };
      });
      const base = await xs();
      expect(base.header, '헤더를 못 쟀다 — 빈 검사').not.toBeNull();
      expect(base.rail, '단계 바를 못 쟀다 — 빈 검사').not.toBeNull();
      // 전환 중 매 프레임 — 한 프레임이라도 다른 x 가 나오면 튄 것이다
      const sample = () => page.evaluate(`new Promise((res) => { const t0 = performance.now(); const f = new Set(); const tick = () => { const x = (s) => { const e = [...document.querySelectorAll(s)].find((n) => n.getClientRects().length); return e ? Math.round(e.getBoundingClientRect().left) : 'none'; }; f.add(x('header') + '|' + x('[data-mystore-rail]')); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res([...f]); }; requestAnimationFrame(tick); })`) as Promise<string[]>;
      const want = `${base.header}|${base.rail}`;
      for (const label of ['클락', '장부', '순위', '장부']) {
        const p = sample();
        await page.locator(`${RAIL} [role=tab]`).filter({ hasText: label }).first().evaluate((b) => (b as HTMLElement).click());
        expect(await p, `'${label}' 로 옮기는 동안 헤더·단계 바가 가로로 움직였다`).toEqual([want]);
      }
      expect(await xs(), '단계를 오간 뒤 셸 위치가 처음과 다르다').toEqual(base);
    });
  }
});
