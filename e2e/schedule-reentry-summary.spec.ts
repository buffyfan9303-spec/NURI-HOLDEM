// 일정 상세 요약 칸의 '리엔트리' — 계단 스택이 **한 줄**로 그려지고(오너: 칸 문구 줄바꿈은 결함) 전체 계단은 게임 정보 행에 남는다.
// 운영 데이터를 읽지 않는다(schedules 목킹). 폭 3종(390·360·320)에서 잰다.
import { test, expect } from './_fixtures';
import { kstToday } from '../src/lib/kst';

const ROW = {
  id: 'bbbbbbbb-0000-4000-8000-000000000009', title: '리엔트리 스택 시연 데일리',
  venue_id: null, pub_name: '누리 테스트 홀덤펍', region: '서울', address: '서울 어딘가 1', date: kstToday(Date.now()), start_time: '23:00:00', duration: '4시간',
  format: 'NLH', guaranteed: false, prize_pool: null, prize_percent: null, is_competition: false, grade: null, blinds: null,
  buy_in: { amount: 100000, gameType: '홀덤', startStack: 50000, rebuy: 100000, rebuyStack: 60000, rebuyStacks: [70000, 70000, 80000, 90000, 100000], rebuyLimit: 3 },
  display_order: 0, is_premium: false, owner_id: 'x', approved: true, unread_qna_count: 0, view_count: 1, premium_until: null, reg_close_time: '12LV 00:30',
  structure: null, description: null, side_events: null, ranking_prizes: null, partners: null, promotions: null, payment_methods: null, rules: null,
  poster_url: null, poster_color: null, seats: null, rejected_at: null, reject_reason: null,
};

for (const width of [390, 360, 320]) {
  test(`리엔트리 요약 칸은 ${width}px 에서 한 줄이고 넘치지 않는다 — 전체 계단은 게임 정보 행에`, async ({ page }) => {
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      const json = (b: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      if (/\/rest\/v1\/schedules/.test(url)) return json([ROW]);
      if (/\/rest\/v1\//.test(url)) return json([]);
      if (/supabase\.co/.test(url)) return json({});
      return route.abort('blockedbyclient');
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '전체 일정' }).first().click({ timeout: 15_000 });
    const card = page.locator('main[data-tab="browse"] article.cv-card-list').first();
    await card.waitFor({ timeout: 20_000 });
    await card.getByRole('heading').click();
    const panel = page.locator('[data-sched-panel]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const cell = page.getByTestId('sched-sum-reentry');
    await expect(cell).toContainText('70,000 → 100,000');
    const m = await cell.evaluate((el) => {
      const val = [...el.querySelectorAll('span')].find((n) => /→/.test(n.textContent ?? '')) as HTMLElement;
      const cr = el.getBoundingClientRect(), vr = val.getBoundingClientRect(), lh = parseFloat(getComputedStyle(val).lineHeight);
      const sub = [...el.querySelectorAll('span')].find((n) => /단계/.test(n.textContent ?? '')) as HTMLElement;
      return { text: val.textContent, lines: Math.round(vr.height / lh), textRight: vr.left + val.scrollWidth, cellRight: cr.right,
        overflowX: val.scrollWidth - val.clientWidth, sub: sub?.textContent, subLines: sub ? Math.round(sub.getBoundingClientRect().height / parseFloat(getComputedStyle(sub).lineHeight)) : 0,
        docOverflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(m.text, '요약 칸 값').toBe('70,000 → 100,000');
    expect(m.lines, `값이 ${m.lines}줄로 접혔다`).toBe(1);
    expect(m.overflowX, '값이 칸을 넘친다').toBeLessThanOrEqual(0);
    expect(m.textRight, '값이 칸 오른쪽 경계를 넘는다').toBeLessThanOrEqual(m.cellRight + 0.5);
    expect(m.sub, '보조 줄(단계·한도)').toBe('4단계 · 최대 3회');
    expect(m.subLines, '보조 줄이 접혔다').toBe(1);
    expect(m.docOverflow, '문서가 가로로 넘친다').toBeLessThanOrEqual(0);
    // 전체 계단 — 게임 정보 행(여러 줄 허용)
    await expect(panel).toContainText('70,000 → 80,000 → 90,000 → 100,000 · 최대 3회');
  });
}
