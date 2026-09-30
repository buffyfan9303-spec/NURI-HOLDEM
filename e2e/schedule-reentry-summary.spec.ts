// 일정 상세 요약 칸의 '리엔트리' — 계단 스택이 **한 줄**로 그려지고(오너: 칸 문구 줄바꿈은 결함) 전체 계단은 게임 정보 행에 남는다.
// 운영 데이터를 읽지 않는다(schedules 목킹). 폭 3종(390·360·320)에서 잰다.
// 2026-09-30 CI 실패: 320 에서 `70,000 → 100,000` 이 5px 넘쳤다(윈도우 여유 0.95px — 글꼴 경계값). 화살표 값은 K/M 축약.
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
// 백만 단위 계단 — 축약 전에는 390 에서도 21px 넘쳤다(음성 대조 입력).
const BIG = { ...ROW, id: 'bbbbbbbb-0000-4000-8000-000000000010', title: '백만 스택 시연 메인',
  buy_in: { amount: 330000, gameType: '홀덤', startStack: 1000000, rebuy: 330000, rebuyStacks: [1000000, 1500000], rebuyLimit: 2 } };
const CASES = [
  { row: ROW, value: '70K → 100K', sub: '4단계 · 최대 3회', full: '70,000 → 80,000 → 90,000 → 100,000 · 최대 3회' },
  { row: BIG, value: '1M → 1.5M', sub: '최대 2회', full: '1,000,000 → 1,500,000 · 최대 2회' },
];

for (const width of [390, 360, 320]) for (const c of CASES) {
  test(`리엔트리 요약 칸(${c.value})은 ${width}px 에서 한 줄이고 넘치지 않는다 — 전체 계단은 게임 정보 행에`, async ({ page }) => {
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      const json = (b: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      if (/\/rest\/v1\/schedules/.test(url)) return json([c.row]);
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
    await expect(cell).toContainText(c.value);
    const m = await cell.evaluate((el) => {
      const val = [...el.querySelectorAll('span')].find((n) => /→/.test(n.textContent ?? '')) as HTMLElement;
      const cr = el.getBoundingClientRect(), vr = val.getBoundingClientRect(), lh = parseFloat(getComputedStyle(val).lineHeight);
      const sub = [...el.querySelectorAll('span')].find((n) => /단계|최대/.test(n.textContent ?? '')) as HTMLElement;
      const r = document.createRange(); r.selectNodeContents(val);
      return { text: val.textContent, lines: Math.round(vr.height / lh), spare: vr.width - r.getBoundingClientRect().width, textRight: vr.left + val.scrollWidth, cellRight: cr.right,
        overflowX: val.scrollWidth - val.clientWidth, sub: sub?.textContent, subLines: sub ? Math.round(sub.getBoundingClientRect().height / parseFloat(getComputedStyle(sub).lineHeight)) : 0,
        docOverflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(m.text, '요약 칸 값').toBe(c.value);
    expect(m.lines, `값이 ${m.lines}줄로 접혔다`).toBe(1);
    expect(m.overflowX, '값이 칸을 넘친다').toBeLessThanOrEqual(0);
    expect(m.textRight, '값이 칸 오른쪽 경계를 넘는다').toBeLessThanOrEqual(m.cellRight + 0.5);
    // 글꼴 경계값 방지 — CI 리눅스는 같은 값을 윈도우보다 약 6px 넓게 그린다(2026-09-30 실측 0.95 → −5).
    expect(m.spare, `값 여유 ${m.spare.toFixed(2)}px — 플랫폼 글꼴 차를 못 견딘다`).toBeGreaterThanOrEqual(12);
    expect(m.sub, '보조 줄(단계·한도)').toBe(c.sub);
    expect(m.subLines, '보조 줄이 접혔다').toBe(1);
    expect(m.docOverflow, '문서가 가로로 넘친다').toBeLessThanOrEqual(0);
    // 전체 계단 — 게임 정보 행(여러 줄 허용)
    await expect(panel).toContainText(c.full);
  });
}
