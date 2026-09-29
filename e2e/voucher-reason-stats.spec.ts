// V2(오너 2026-09-24) — '보유자 현황·통계' 안의 **유형별 발급 표**. 목킹 RPC 응답으로 렌더 계약만 본다.
//   서버 정의·권한은 supabase/migrations/20260924c_voucher_reason_stats.sql(라이브 리허설 완료)이 정본이다 —
//   여기 응답은 그 반환 컬럼 모양을 흉내낼 뿐 권한의 근거가 아니다.
// 보는 것: 360(발급·보유·사용 3열) · 1440(5열) · 합계 행 · 0인 과거 유형 숨김 · 타일 재계산(B2) ·
//   기간 칩이 KST 날짜를 서버로 보냄 · 보유자 미사용분 유형 라벨(B3) · 권한 오류(42501)는 '0' 이 아니라 오류 카드.
// 실행: E2E_BASE_URL=http://localhost:4315 npx playwright test e2e/voucher-reason-stats.spec.ts --output=<scratch>
import { test, expect } from './_fixtures';
import { devices, type Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const SHOT = process.env.VSTAT_SHOT_DIR;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const row = (reason_key: string, issued: number, held: number, used: number, expired: number, revoked: number, holders: number) =>
  ({ reason_key, issued, held, used, expired, revoked, other_status: 0, holders });
const ALL = [row('event_card', 3, 1, 1, 1, 0, 2), row('grant', 5, 2, 2, 0, 1, 3), row('visit', 2, 0, 2, 0, 0, 1)];
const RANGE = [row('grant', 1, 1, 0, 0, 0, 1)];
const now = new Date().toISOString();
const V = (id: string, status: string, reason: string | null, campaign: string | null = null) => ({
  id, venue_id: MOCK_VENUE, issued_by: 'x', holder_user_id: 'u1', holder_name: '홍길동', title: '매장이용권', status,
  used_venue_id: status === 'used' ? MOCK_VENUE : null, used_at: status === 'used' ? now : null, created_at: now,
  expires_at: null, issue_reason: reason, event_campaign_id: campaign, venue: { name: '테스트 홀덤펍' }, used_venue: null,
});

async function open(page: Page, w: number, h: number, reason: 'ok' | 'denied', calls: Record<string, unknown>[] = []) {
  await bootOwner(page, {
    viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json([V('a', 'active', 'event', 'camp-1'), V('b', 'active', 'grant'), V('c', 'used', 'grant')])) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_stats/, (r) => r.fulfill(json([{ holder_count: 1, active_count: 9, used_count: 1 }])));
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_profiles/, (r) => r.fulfill(json([{ user_id: 'u1', real_name: '홍길동', nickname: '길동' }])));
      await p.route(/\/rest\/v1\/rpc\/voucher_issue_approved/, (r) => r.fulfill(json(true)));
      await p.route(/\/rest\/v1\/rpc\/get_voucher_quota/, (r) => r.fulfill(json(100)));
      await p.route(/\/rest\/v1\/rpc\/venue_voucher_reason_stats/, (r) => {
        const body = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
        calls.push(body);
        if (reason === 'denied') return r.fulfill(json({ code: '42501', message: '이 매장의 이용권 통계를 볼 권한이 없습니다', details: null, hint: null }, 403));
        return r.fulfill(json(body.p_from ? RANGE : ALL));
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]'), '목킹 업주로 내 매장을 열지 못했다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button')]
    .find((b) => getComputedStyle(b).display !== 'none' && b.textContent?.trim() === '이용권')?.click());
  const toggle = page.getByRole('button', { name: /보유자 현황·통계/ });
  await expect(toggle, '보유자 현황·통계 버튼이 없다').toBeVisible({ timeout: 15_000 });
  await toggle.evaluate((b) => (b as HTMLElement).click());
  await page.waitForTimeout(800);
}
const shot = async (page: Page, name: string) => {
  if (!SHOT) return;
  await page.getByRole('button', { name: /보유자 현황·통계/ }).evaluate((b) => { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT}/${name}.png` });
};
/** 보이는 칸의 글자만(모바일에서 숨긴 열은 뺀다). */
const visibleCells = (page: Page, label: string) => page.getByTestId('voucher-reason-stats').locator('tr')
  .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) }).first()
  .locator('th,td').evaluateAll((cs) => cs.filter((c) => getComputedStyle(c).display !== 'none').map((c) => c.textContent?.trim()));

test.describe('이용권 유형별 전송 표(V2)', () => {
  for (const [W, H] of [[360, 780], [390, 844], [1440, 900]] as const) {
    const narrow = W < 768;
    const pick = (a: string[]) => (narrow ? a.slice(0, 4) : a);
    test(`${W}px — 표·합계·타일·기간 칩·미사용 라벨`, async ({ page }) => {
      test.setTimeout(120_000);
      const calls: Record<string, unknown>[] = [];
      await open(page, W, H, 'ok', calls);
      await shot(page, `${W}-${SHOT_TAG()}`);
      const table = page.getByTestId('voucher-reason-stats');
      await expect(table, '유형별 표가 없다').toBeVisible();
      const heads = await table.locator('thead th').evaluateAll((ths) => ths.filter((t) => getComputedStyle(t).display !== 'none').map((t) => t.textContent?.trim()));
      expect(heads).toEqual(pick(['유형', '전송', '보유', '사용', '만료', '전송 취소']));
      expect(await visibleCells(page, '이벤트 카드 당첨')).toEqual(pick(['이벤트 카드 당첨', '3', '1', '1', '1', '0']));
      expect(await visibleCells(page, '방문 감사'), '0 이 아닌 과거 유형은 보여야 한다').toEqual(pick(['방문 감사', '2', '0', '2', '0', '0']));
      expect(await visibleCells(page, '서비스 보상'), '현재 유형은 0 이어도 보여야 한다').toEqual(pick(['서비스 보상', '0', '0', '0', '0', '0']));
      await expect(table.getByText('첫 방문 환영', { exact: true }), '0 인 과거 유형이 보인다').toHaveCount(0);
      await expect(table.getByText('근거 미기록', { exact: true }), '0 인 근거 미기록이 보인다').toHaveCount(0);
      expect(await visibleCells(page, '합계')).toEqual(pick(['합계', '10', '3', '5', '1', '1']));
      await expect(page.getByText('삭제한 미사용 이용권은 집계되지 않습니다', { exact: false })).toBeVisible();
      // B2 — 타일은 합계에서 다시 센다(구 RPC 의 active 9 = 만료 포함 값을 쓰지 않는다)
      const tile = (label: string) => page.locator('[data-stat-tile]').filter({ has: page.locator(`[data-stat-label="${label}"]`) }).locator('[data-stat-val]');
      await expect(tile('전송'), '전송 타일은 전송 취소를 뺀 수(9)').toHaveText('9');
      await expect(page.getByText('전송 취소한 이용권을 뺀 수', { exact: false }), '전송 취소 제외 설명이 안내문에 없다').toBeVisible();
      await expect(page.getByText('전송(전송 취소 제외)', { exact: true }), '두 줄로 접히던 옛 라벨이 남아 있다').toHaveCount(0);
      // 오너: 타일 라벨 줄바꿈 금지 — 세 타일 높이 같고, 라벨은 한 줄(글자 폭 ≤ 칸 폭, 여유 px 기록)
      const tm = await page.locator('[data-stat-tile]').evaluateAll((ts) => ts.map((t) => {
        const l = t.querySelector<HTMLElement>('[data-stat-label]')!;
        const r = document.createRange(); r.selectNodeContents(l);
        const lh = parseFloat(getComputedStyle(l).lineHeight);
        return { h: t.getBoundingClientRect().height, text: r.getBoundingClientRect().width, box: l.clientWidth, lines: Math.round(l.getBoundingClientRect().height / lh) };
      }));
      console.log(`[타일 ${W}]`, JSON.stringify(tm.map((x) => ({ ...x, 여유: +(x.box - x.text).toFixed(2) }))));
      expect(tm, '타일이 3개가 아니다 — 빈 검사').toHaveLength(3);
      expect(Math.max(...tm.map((x) => x.h)) - Math.min(...tm.map((x) => x.h)), '타일 높이가 서로 다르다').toBeLessThanOrEqual(0.5);
      for (const x of tm) {
        expect(x.lines, '타일 라벨이 한 줄이 아니다').toBe(1);
        expect(x.box - x.text, `타일 라벨이 칸보다 넓다(여유 ${x.box - x.text}px)`).toBeGreaterThanOrEqual(0);
      }
      await expect(tile('잔여 이용권')).toHaveText('3');
      await expect(page.getByText('활성 이용권', { exact: true }), '옛 타일 이름이 남아 있다').toHaveCount(0);
      // 기간 칩 — KST 날짜로 서버에 보낸다
      const chip = page.getByRole('button', { name: '최근 30일', exact: true });
      // 알약 한 기준(2026-09-24): 보이는 32 · 누름 44 — 칩 중심 x 에서 위아래를 훑어 이 칩이 잡히는 세로 구간을 잰다
      const ch = await chip.evaluate((b) => {
        // elementFromPoint 는 뷰포트 밖이면 null → 누름=보이는 높이로 거짓 실패한다(리뷰어 실행에서 실제로 32 로 떨어짐). 먼저 화면 가운데로.
        b.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = b.getBoundingClientRect(); const x = r.left + r.width / 2; let top = r.top, bot = r.bottom;
        for (let y = r.top; y > r.top - 20; y -= 0.25) { const e = document.elementFromPoint(x, y); if (e && (e === b || b.contains(e))) top = y; else break; }
        for (let y = r.bottom - 0.01; y < r.bottom + 20; y += 0.25) { const e = document.elementFromPoint(x, y); if (e && (e === b || b.contains(e))) bot = y; else break; }
        return { h: r.height, hit: bot - top };
      });
      expect(ch.h, '기간 칩 보이는 높이는 32').toBeCloseTo(32, 0);
      expect(ch.hit, `기간 칩 누름 높이 ${ch.hit}px — 44 미만`).toBeGreaterThanOrEqual(44);
      await chip.evaluate((b) => (b as HTMLElement).click());
      await expect.poll(() => calls.some((c) => typeof c.p_from === 'string')).toBe(true);
      const c = calls.find((x) => typeof x.p_from === 'string')!;
      const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
      expect(c.p_to).toBe(kst(Date.now()));
      expect(c.p_from).toBe(kst(Date.now() - 29 * 86_400_000));
      await expect.poll(() => visibleCells(page, '합계')).toEqual(pick(['합계', '1', '1', '0', '0', '0']));
      await expect(tile('잔여 이용권'), '타일은 기간과 무관한 현재 현황이다').toHaveText('3');
      // B3 — 보유자별 목록 미사용분에도 유형 라벨
      await page.getByRole('button', { name: '관리', exact: true }).first().evaluate((b) => (b as HTMLElement).click());
      // 라벨 문구가 아니라 서버 reason_key 로 겨눈다(문구가 바뀌어도 안 깨지게, 2026-09-29 용어 통일 후속).
      const unused = page.getByTestId('holder-unused');
      await expect(unused.locator('[data-reason="event_card"]')).toBeVisible();
      await expect(unused.locator('[data-reason="grant"]')).toBeVisible();
      if (SHOT) await page.screenshot({ path: `${SHOT}/${W}-${SHOT_TAG()}-range-holder.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '문서가 가로로 넘친다').toBeLessThanOrEqual(0);
    });
  }

  // PR #51 verifier 참고 1(2026-09-30) — 보유자 목록은 예전엔 hidden 으로 접혀 **DOM 이 남았다**. Fold 로 바꾸며 닫을 때 언마운트돼
  //   펼친 보유자 행·스크롤 등 DOM 상태가 사라졌다 → keepMounted. 같은 노드가 살아 있는지(표식)로 본다.
  test('보유자 현황을 닫았다 다시 열어도 목록 DOM 이 그대로다(keepMounted)', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 390, 844, 'ok');
    await page.getByRole('button', { name: '관리', exact: true }).first().evaluate((b) => (b as HTMLElement).click());
    const unused = page.getByTestId('holder-unused');
    await expect(unused, '보유자를 펼치지 못했다').toBeVisible();
    await unused.evaluate((u) => { (u as HTMLElement & { __keep?: number }).__keep = 1; });
    const toggle = page.getByRole('button', { name: /보유자 현황·통계/ });
    await toggle.evaluate((b) => (b as HTMLElement).click());
    await expect(unused, '닫았는데 목록이 보인다').toBeHidden();
    await page.waitForTimeout(600);
    await toggle.evaluate((b) => (b as HTMLElement).click());
    await expect(unused, '다시 열었는데 목록이 안 보인다').toBeVisible();
    await page.waitForTimeout(600);
    expect(await unused.evaluate((u) => (u as HTMLElement & { __keep?: number }).__keep ?? 0), '다시 열자 목록이 새로 그려졌다(언마운트됨)').toBe(1);
    const h = await unused.evaluate((u) => u.closest('[hidden]') ? -1 : u.getBoundingClientRect().height);
    expect(h, '다시 연 목록이 높이 0 에 갇혔다').toBeGreaterThan(0);
  });

  test('권한 오류(42501)는 0 이 아니라 오류 카드', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 1440, 900, 'denied');
    await shot(page, `1440-${SHOT_TAG()}-denied`);
    await expect(page.getByText('유형별 통계 열람 권한이 없습니다')).toBeVisible();
    await expect(page.getByTestId('voucher-reason-stats'), '권한 오류인데 표(0장)가 그려졌다').toHaveCount(0);
    await expect(page.locator('[data-stat-tile]'), '권한 오류인데 타일(0)이 그려졌다').toHaveCount(0);
  });
});

// PR #51 재검토 N1(2026-09-30) — keepMounted 판은 닫힘 끝에 inline display:none 이 남는다. 재열림 판정이 그 상태(rect 0)로
//   '누른 요소가 판 아래인가' 를 재서 참이 됐고, pin 보정·overflowAnchor none 이 켜져 1440 에서 재열림마다 scrollY 가 −1 씩 샜다(449→448→447).
//   판은 토글 **아래**에 있으므로 재열림에도 보정이 켜지면 안 된다 — 앵커링을 한 프레임이라도 끄는지와 scrollY 를 같이 본다.
test.describe('보유자 현황 재열림 스크롤(1440 데스크톱)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, userAgent: devices['Desktop Chrome'].userAgent });
  test('닫았다 다시 열기 3회 — scrollY 그대로, 앵커링 안 끔', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, 1440, 900, 'ok');
    const toggle = page.getByRole('button', { name: /보유자 현황·통계/ });
    await toggle.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const w = window as Window & { __anchorOff?: number };
      w.__anchorOff = 0;
      const f = () => { if ((document.scrollingElement as HTMLElement).style.overflowAnchor === 'none') w.__anchorOff!++; requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
    const sy0 = await page.evaluate(() => scrollY);
    const press = async () => {
      const b = (await toggle.boundingBox())!;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { delay: 120 });
      await page.waitForTimeout(700);
    };
    const ys: number[] = [];
    for (let i = 0; i < 3; i++) { await press(); await press(); ys.push(await page.evaluate(() => scrollY)); }
    await expect(page.getByTestId('voucher-reason-stats'), '다시 열었는데 표가 안 보인다').toBeVisible();
    expect(ys, `재열림마다 scrollY 가 샌다(시작 ${sy0})`).toEqual([sy0, sy0, sy0]);
    expect(await page.evaluate(() => (window as Window & { __anchorOff?: number }).__anchorOff), '토글 아래 판을 다시 여는데 스크롤 앵커링을 껐다(누른 요소가 판 아래라고 오판)').toBe(0);
  });
});
function SHOT_TAG() { return process.env.VSTAT_SHOT_TAG ?? 'after'; }
