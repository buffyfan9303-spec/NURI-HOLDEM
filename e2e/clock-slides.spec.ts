// 클락 TV 왼쪽 칸 슬라이드(K단계, 2026-09-30) — 시상 → 추가 A → 추가 B(팀 점수 W-11) → 광고.
//
// 요구 원문: .claude/handoff/specs-0930/PLAN-AB-exec.md §5-1 · W-defects.md#W-11.
// 계약:
//   ① 순서·머무름 — 시상 30초 → 추가 페이지 30초씩 → 광고 10초 → 다시 시상(서버 시각 기준이라 페이지 시계로 결정적).
//   ② 시상 문구(text)는 금액 대신 그대로, 메모는 줄 아래.
//   ③ 팀 점수 페이지는 팀 합산 점수로 정렬해 순위를 붙인다.
//   ④ 못 불러오는 광고는 건너뛴다(빈 장을 걸지 않는다).
//   ⑤ 시상만 있는 매장은 종전 화면 그대로(장 표시 없음 · 머리말 Prize Pool).
// 쓰기 0 — clock_states·clock_ads 조회만 갈아끼운다. server_now 는 _fixtures 가 끊어 오프셋 0 → 서버 시각 = 페이지 시계.
import { test, expect } from './_fixtures';
import { TV_VENUE as VENUE, serveClock } from './_clock';
import { PAID_EXPOSURE_ON } from '../src/lib/paidExposure';

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const AD_OK = 'https://ads.e2e.invalid/ok.png';
const AD_BAD = 'https://ads.e2e.invalid/missing.png';

const LEVELS = [
  { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
];

function row(extra: Record<string, unknown>, endsAt: number) {
  return {
    venue_id: VENUE, game_seq: 1, session_date: null, title: '깐부 팀전',
    config: {
      title: '깐부 팀전', startStack: 50_000, rebuyStack: 0, addonStack: 0, isAddon: false,
      earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 0, maxLevel: 2,
      earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
      prizes: [{ place: '1st', amount: 0, text: '시드권 + 트로피', note: '결승 직행' }, { place: '2nd', amount: 300_000 }],
      levels: LEVELS, ...extra,
    },
    current_index: 0, running: true, ends_at: new Date(endsAt).toISOString(), remaining_ms: 0,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0,
    live_stats: { entries: 12, rebuys: 0, alive: 12, avgStack: 50_000, totalStack: 600_000, buyInAmount: 50_000 },
  };
}

async function serveAds(page: import('@playwright/test').Page, urls: string[]) {
  const far = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await page.route(/\/rest\/v1\/clock_ads/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(urls.map((u, i) => ({ id: `ad${i}`, image_url: u, starts_at: past, ends_at: far, venue_ids: null, sort_order: i }))),
  }));
  await page.route(AD_OK, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  await page.route(AD_BAD, (r) => r.fulfill({ status: 404, body: '' }));
}

const shownSheet = (page: import('@playwright/test').Page) =>
  page.getByTestId('clk-prize-track').locator(':scope > div:not([aria-hidden])');

// page.clock.install 은 시계를 멈추지 않는다 — 설치 뒤에도 페이지 시간은 실제 시간만큼 흐른다(스크린샷 3장이 7~9초).
// runFor 합계만으로 "지금 바퀴의 몇 초인가" 를 세면 느린 러너에서 8초 넘게 앞서가 광고 칸(10초 폭)을 지나친다(main CI 22/22 갈림, 2026-10-04).
// 그래서 바퀴 시작(wheelStart) 기준 절대 위치로 센다 — 페이지 현재 시각을 읽고 목표까지 남은 만큼만 감는다. 단언은 그대로다.
function clockAdvancer(page: import('@playwright/test').Page, wheelStart: number) {
  let at = 1_000;   // 바퀴 안 위치(ms) — 스펙은 바퀴 시작 1초 뒤에서 출발한다
  return async (ms: number) => {
    at += ms;
    const now = await page.evaluate(() => Date.now());
    await page.clock.runFor(Math.max(0, wheelStart + at - now));
  };
}

test.describe('클락 TV — K단계 슬라이드', () => {
  test('시상 30초 → 바운티 30초 → 팀 점수 30초 → 광고 10초 → 시상, 못 불러오는 광고는 건너뜀', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    // 한 바퀴 = 30 + 30 + 30 + 10 = 100초. 바퀴 시작 1초 뒤에서 시작한다(시상 칸).
    // 유료 노출이 꺼져 있으면(lib/paidExposure, 2026-10-09 오너 결정) 광고 장이 없다 — 90초 바퀴 · 3장.
    const AD = PAID_EXPOSURE_ON;
    const N = AD ? 4 : 3;
    const WHEEL = AD ? 100_000 : 90_000;
    const T0 = Math.floor(Date.now() / WHEEL) * WHEEL + WHEEL + 1_000;
    await page.clock.install({ time: T0 });
    const advance = clockAdvancer(page, T0 - 1_000);
    await serveClock(page, row({
      extraPages: [
        { kind: 'bounty', title: '바운티 안내', rows: [{ label: '헤드 바운티', content: '1만 칩', note: '탈락시킨 사람에게' }] },
        { kind: 'team', title: '깐부 팀 순위', points: [14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
          rows: [{ label: 'A팀', content: '2, 9', note: '김·이' }, { label: 'B팀', content: '1, 12' }, { label: 'C팀', content: '3, 4' }] },
      ],
    }, T0 + 15 * 60_000));
    await serveAds(page, [AD_BAD, AD_OK]);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    const aside = page.getByTestId('clk-prizes');

    // ① 시상 칸 + ② 문구·메모
    await expect(aside.locator('p').first()).toHaveText(/prize pool/i);
    await expect(shownSheet(page)).toContainText('시드권 + 트로피');
    await expect(shownSheet(page)).toContainText('결승 직행');
    await expect(shownSheet(page)).toContainText('300,000');
    // 문구 줄은 합계에 안 들어간다 — 총액 = 300,000
    await expect(page.getByTestId('clk-prize-total')).toHaveText('300,000');
    await expect(page.getByTestId('clk-prize-page')).toHaveText(`1 / ${N}`);
    await page.screenshot({ path: 'test-results/clock-shots/k-1-prize.png' });

    await advance(30_000);
    await expect(aside.locator('p').first()).toHaveText(/bounty/i);
    await expect(shownSheet(page)).toContainText('헤드 바운티');
    await expect(aside).toContainText('바운티 안내');
    await expect(page.getByTestId('clk-prize-page')).toHaveText(`2 / ${N}`);
    await advance(1_000);
    await page.screenshot({ path: 'test-results/clock-shots/k-2-bounty.png' });

    // ③ 팀 점수 — C 19 · A 16 · B 15
    await advance(30_000);
    await expect(aside.locator('p').first()).toHaveText(/team score/i);
    const lis = shownSheet(page).locator('li');
    await expect(lis).toHaveCount(3);
    await expect(lis.nth(0)).toContainText('1. C팀');
    await expect(lis.nth(0)).toContainText('19 PTS');
    await expect(lis.nth(1)).toContainText('2. A팀');
    await expect(lis.nth(1)).toContainText('김·이');
    await expect(lis.nth(2)).toContainText('3. B팀');
    await page.screenshot({ path: 'test-results/clock-shots/k-3-team.png' });

    // ④ 광고 — 404 주소는 빠지고 살아 있는 한 장만 건다(10초). 유료 노출이 꺼져 있으면 광고가 등록돼 있어도 장이 없다.
    if (AD) {
      await advance(30_000);
      await expect(aside.locator('p').first()).toHaveText(/sponsor/i);
      const img = shownSheet(page).locator('img');
      await expect(img).toHaveAttribute('src', AD_OK);
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: 'test-results/clock-shots/k-4-ad.png' });
      await advance(10_000);
      await expect(aside.locator('p').first()).toHaveText(/prize pool/i);
      await expect(page.getByTestId('clk-prize-page')).toHaveText(`1 / ${N}`);
    } else {
      await advance(30_000);
      await expect(aside.locator('p').first()).toHaveText(/prize pool/i);
      await expect(page.getByTestId('clk-prize-page')).toHaveText(`1 / ${N}`);
      await expect(page.getByTestId('clk-prize-track').locator('[data-ad-sheet]'), '유료 노출이 꺼졌는데 광고 장이 섰다').toHaveCount(0);
      await advance(10_000);
    }

    // 머리말 높이가 장마다 같다 — 들썩임 없음
    const topY = async () => (await page.getByTestId('clk-prize-track').boundingBox())!.y;
    const y0 = await topY();
    await advance(30_000);
    await advance(1_000);
    expect(Math.abs((await topY()) - y0), '장이 바뀌며 트랙이 세로로 움직였다').toBeLessThanOrEqual(2);
    expect(errors, `페이지 오류: ${errors.join(' | ')}`).toEqual([]);
    await page.screenshot({ path: 'test-results/clock-shots/k-slides.png' });
  });

  test('시상만 있으면 종전 화면 — 장 표시 없음 · 광고 표 없음(42P01)이어도 그대로', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await serveClock(page, row({}, Date.now() + 15 * 60_000));
    await page.route(/\/rest\/v1\/clock_ads/, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: 'not found' }) }));
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('clk-prizes').locator('p').first()).toHaveText(/prize pool/i);
    await expect(page.getByTestId('clk-prize-page')).toHaveCount(0);
    await expect(page.getByTestId('clk-prize-track').locator('[data-extra-sheet],[data-ad-sheet]')).toHaveCount(0);
  });
});

// 리드 검토 반영(2026-09-30) — design-reviewer ①②③. 수정 전 빌드(5aa08f93)에서 셋 다 FAIL 이었다.
test.describe('클락 TV — K단계 검토 반영', () => {
  const AD2 = 'https://ads.e2e.invalid/ok2.png';
  // 상한 꽉 채운 추가 페이지 — 제목 12 · 줄 8 · 이름표 14 · 내용 16 · 메모 20
  const FULL = {
    kind: 'notice', title: '가나다라마바사아자차카타',
    rows: Array.from({ length: 8 }, (_, i) => ({ label: `이름표${i}가나다라마바사아자`.slice(0, 14), content: `내용${i}가나다라마바사아자차카타파`.slice(0, 16), note: `메모${i}가나다라마바사아자차카타파하거너`.slice(0, 20) })),
  };

  test('① 광고 2개 — 광고→시상으로 빠지는 동안 광고 장은 방금 보인 광고 그대로다', async ({ page }) => {
    test.skip(!PAID_EXPOSURE_ON, '유료 노출 꺼짐(2026-10-09 오너 결정) — 광고 장 없음은 위 K단계 ④ 가 단언한다');
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const T0 = Math.floor(Date.now() / 40_000) * 40_000 + 40_000 + 1_000;   // 시상 30 + 광고 10 = 40초 바퀴
    await page.clock.install({ time: T0 });
    const advance = clockAdvancer(page, T0 - 1_000);
    await serveClock(page, row({}, T0 + 15 * 60_000));
    await serveAds(page, [AD_OK]);
    await page.route(AD2, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
    await page.route(/\/rest\/v1\/clock_ads/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([AD_OK, AD2].map((u, i) => ({ id: `a${i}`, image_url: u, starts_at: new Date(Date.now() - 86_400_000).toISOString(), ends_at: new Date(Date.now() + 86_400_000).toISOString(), venue_ids: null, sort_order: i }))) }));
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    const adImg = page.getByTestId('clk-prize-track').locator('[data-ad-sheet] img');
    await advance(30_000);                       // 광고 칸
    await expect(page.getByTestId('clk-prizes').locator('p').first()).toHaveText(/sponsor/i);
    const shown = await adImg.getAttribute('src');
    await advance(10_000);                       // 시상으로 — 빠지는 첫 프레임부터 같은 광고여야 한다
    await expect(page.getByTestId('clk-prizes').locator('p').first()).toHaveText(/prize pool/i);
    expect(await adImg.getAttribute('src'), '광고가 빠지는 동안 다음 광고로 바뀌었다(번쩍)').toBe(shown);
    await advance(30_000);                       // 다음 바퀴 광고 칸에서만 다음 광고로
    expect(await adImg.getAttribute('src')).not.toBe(shown);
  });

  for (const [vw, vh] of [[1920, 1080], [1280, 720]] as const) {
    test(`②③ 상한 꽉 채운 추가 페이지 — 제목·줄·총액이 잘리지 않는다 ${vw}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: vw, height: vh });
      const T0 = Math.floor(Date.now() / 60_000) * 60_000 + 60_000 + 31_000;   // 시상 30 + 추가 30 = 60초 바퀴 · 추가 칸 1초
      await page.clock.install({ time: T0 });
      await serveClock(page, row({ extraPages: [FULL] }, T0 + 15 * 60_000));
      await serveAds(page, []);
      await page.goto(`/?display=${VENUE}&g=1&auto=0`);
      await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
      const aside = page.getByTestId('clk-prizes');
      await expect(aside.locator('p').first()).toHaveText(/notice/i);
      await page.waitForTimeout(600);
      const m = await aside.evaluate((el) => {
        const cut = (e: Element) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1;
        const head = el.querySelectorAll(':scope > p')[1] as HTMLElement;
        const sheet = el.querySelector('[data-extra-sheet="0"]')!;
        const a = el.getBoundingClientRect();
        // 마크업과 무관하게 글자를 가진 잎 요소를 잰다(수정 전 판은 span, 수정 후 판은 p).
        const lines = [...sheet.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim());
        return {
          titleCut: cut(head), titleText: head.textContent,
          linesCut: lines.filter(cut).map((p) => p.textContent),
          outside: lines.filter((p) => { const r = p.getBoundingClientRect(); return r.bottom > a.bottom + 1 || r.bottom > innerHeight; }).length,
          lines: lines.length,
        };
      });
      expect(m.lines).toBe(24);
      expect.soft(m.titleCut, `제목이 잘렸다: ${m.titleText}`).toBe(false);
      expect.soft(m.linesCut, '줄이 잘렸다').toEqual([]);
      expect.soft(m.outside, '줄이 칸 밖으로 나갔다').toBe(0);
      // 시상 칸으로 돌아가도 총액이 눌리지 않는다
      await page.clock.runFor(30_000);
      await expect(aside.locator('p').first()).toHaveText(/prize pool/i);
      const tot = page.getByTestId('clk-prize-total');
      const t = await tot.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }));
      expect.soft(t.sh <= t.ch + 1 && t.sw <= t.cw + 1, `총액이 잘렸다 ${JSON.stringify(t)}`).toBe(true);
      await page.screenshot({ path: `test-results/clock-shots/k-full-${vw}.png` });
    });
  }

  test('② 상한 이전에 저장된 긴 글(40자 · 10줄 · 메모) — 칸 밖으로 넘치지 않고 총액이 눌리지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const T0 = Math.floor(Date.now() / 60_000) * 60_000 + 60_000 + 31_000;
    await page.clock.install({ time: T0 });
    const long = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초';
    await serveClock(page, row({ extraPages: [{ kind: 'notice', title: long.slice(0, 30),
      rows: Array.from({ length: 10 }, (_, i) => ({ label: `${i}${long}`.slice(0, 20), content: long.slice(0, 40), note: long.slice(0, 40) })) }] }, T0 + 15 * 60_000));
    await serveAds(page, []);
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    const aside = page.getByTestId('clk-prizes');
    await expect(aside.locator('p').first()).toHaveText(/notice/i);
    await page.waitForTimeout(600);
    const out = await aside.evaluate((el) => {
      const a = el.getBoundingClientRect();
      const sheet = el.querySelector('[data-extra-sheet="0"]')!;
      const leaves = [...sheet.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim());
      return leaves.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > a.bottom + 1 || r.bottom > innerHeight; }).length;
    });
    expect.soft(out, `긴 글 ${out}줄이 칸 밖으로 나갔다`).toBe(0);
    await page.clock.runFor(30_000);
    await expect(aside.locator('p').first()).toHaveText(/prize pool/i);
    const t = await page.getByTestId('clk-prize-total').evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize) }));
    expect.soft(t.h >= t.fs * 0.99 && t.sh <= t.ch + 1, `총액이 눌려 잘렸다 ${JSON.stringify(t)}`).toBe(true);
  });
});
