// e2e/venue-notice-card-1009.spec.ts — 매장 페이지 '포스터' 탭 공지 카드의 한쪽 두꺼운 색 띠 제거 회귀 가드.
//
// 오너 결정(2026-10-09): "매장 페이지 카드 디자인 — 너가 생각해, 과한 디자인은 안 된다."
// 대상: VenuePage.tsx PostersPanel 의 공지 카드(<li>). 왼쪽만 2px 강조색 띠(side-tab)였다.
// 계약: ① 네 변 테두리 두께가 같고 1px 이하(한쪽 띠 없음) — 같은 패널의 포스터 카드와 같은 얇은 테두리 계열.
//       ② 내용 위치 불변 — 제목 글자의 카드 안쪽 여백(왼 2px+0.625rem · 위 0.5rem · 오른 0.625rem)이 수정 전과 같다.
//       ③ 제목·본문 글자 대비 AA(4.5) 이상 — 실제로 깔린 면(카드 배경) 기준, 다크·라이트 모두.
// 음성 대조: 공지 <li> 를 수정 전 클래스(`px-2.5 py-2 … border-l-2 border-accent-400/50`)로 되돌리면 ① 이 빨개진다.
// ⚠ 운영 DB 무접촉 — 매장·공지·일정은 page.route 로 답한다. 로그인 없음.
// 스크린샷이 필요하면 NOTICE_SHOT_DIR=<폴더> 를 준다(없으면 찍지 않는다).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack } from './_session';

const VENUE_ID = '99999999-3333-4333-8333-999999999999';
const VENUE_ROW = {
  id: VENUE_ID, name: '공지 카드 홀덤', region: '서울', address: '서울 1', approved: true, status: 'active',
  verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 0, rating: null,
};
// 2026-10-09 VEN-03: 이 카드의 공지는 플랫폼 공지(marketplace_notices)가 아니라 **이 매장 공지(venue_notices)** 다.
//   매장 공지에는 제목 칸이 없어 첫 줄을 제목, 나머지를 본문으로 그린다 — 카드 모양(제목 p + 본문 p)은 그대로다.
const NOTICES = [
  { id: 'n1', venue_id: VENUE_ID, author_id: null, author_name: '운영',
    content: '10월 운영 시간 안내\n평일 18시~새벽 4시, 주말 14시~새벽 6시로 운영합니다. 공휴일은 주말과 같습니다.', created_at: '2026-10-02T00:00:00Z' },
  { id: 'n2', venue_id: VENUE_ID, author_id: null, author_name: '운영', content: '제목만 있는 공지', created_at: '2026-10-01T00:00:00Z' },
];
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const SHOT_DIR = process.env.NOTICE_SHOT_DIR;

async function open(page: Page, theme: 'dark' | 'light', width: number) {
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 저장소 차단 */ } }, theme);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/venue_notices/, (r) =>
    r.request().method() === 'GET' ? r.fulfill(json(NOTICES)) : r.fulfill(json({ message: 'blocked' }, 403)));
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? VENUE_ROW : [VENUE_ROW]));
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?venue=${VENUE_ID}`);
  const dlg = page.getByRole('dialog', { name: /매장 페이지/ });
  await expect(dlg).toBeVisible({ timeout: 20_000 });
  await dlg.getByRole('tab', { name: '포스터' }).click();
  const toggle = dlg.getByRole('button', { name: /금일 포스터/ });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const title = dlg.getByText('10월 운영 시간 안내', { exact: true });
  await expect(title).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600); // 아코디언 펼침 전환이 끝난 뒤 잰다
  return { dlg, title };
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440]) {
    test(`🔴 매장 공지 카드 — 한쪽 두꺼운 색 띠 없음 · 내용 위치 불변 · 글자 대비 AA (${theme} ${width})`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const { title } = await open(page, theme, width);

      const m = await title.evaluate((p) => {
        const li = p.closest('li') as HTMLElement;
        const body = li.querySelector('p + p') as HTMLElement | null;
        const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const cs = getComputedStyle(li);
        const lum = (c: string) => {
          const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
            const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m1, m2) => m2 - m1); return (x + 0.05) / (y + 0.05); };
        const lr = li.getBoundingClientRect(); const tr = p.getBoundingClientRect();
        return {
          fs,
          borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat),
          borderLeftColor: cs.borderLeftColor, borderTopColor: cs.borderTopColor, bg: cs.backgroundColor,
          li: { x: lr.x, y: lr.y, w: lr.width, h: lr.height },
          insetLeft: tr.left - lr.left, insetTop: tr.top - lr.top, insetRight: lr.right - tr.right,
          titleContrast: ratio(getComputedStyle(p).color, cs.backgroundColor),
          bodyContrast: body ? ratio(getComputedStyle(body).color, cs.backgroundColor) : null,
        };
      });
      console.log(`[notice-card ${theme} ${width}] ${JSON.stringify(m)}`);
      if (SHOT_DIR) await title.locator('xpath=ancestor::ul[1]').screenshot({ path: `${SHOT_DIR}/notice-${theme}-${width}.png` });

      const [t, r, b, l] = m.borders;
      expect(l, `왼쪽 테두리 ${l}px 가 나머지(${t}/${r}/${b})와 다르다 — 한쪽 두꺼운 띠가 남아 있다`).toBe(t);
      expect([t, r, b, l].every((w) => w === t && w <= 1), `네 변 두께가 같고 1px 이하여야 한다: ${m.borders.join('/')}`).toBe(true);
      expect(Math.abs(m.insetLeft - (0.625 * m.fs + 2)), `제목 왼쪽 여백 ${m.insetLeft} — 수정 전 위치에서 움직였다`).toBeLessThan(0.05);
      expect(Math.abs(m.insetTop - 0.5 * m.fs), `제목 위 여백 ${m.insetTop} — 수정 전 위치에서 움직였다`).toBeLessThan(0.05);
      expect(Math.abs(m.insetRight - 0.625 * m.fs), `제목 오른쪽 여백 ${m.insetRight} — 수정 전 위치에서 움직였다`).toBeLessThan(0.05);
      expect(m.titleContrast, '제목 대비').toBeGreaterThanOrEqual(4.5);
      expect(m.bodyContrast ?? 0, '본문 대비').toBeGreaterThanOrEqual(4.5);
      expect(errors, `페이지 오류: ${errors.join(' | ')}`).toEqual([]);
    });
  }
}
