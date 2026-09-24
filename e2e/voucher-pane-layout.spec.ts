// 오너 2026-09-24 — 내 매장 '이용권 · QR' 화면 세 가지:
//   ① 사이드(PC)·전체 메뉴(모바일)에서 '내 캘린더' 는 '운영' 이 아니라 '관리' 그룹
//   ② 처음 들어가면 '매장 QR' 은 접힘, '매장이용권 발급' 은 **항상 펼침**(접는 토글 없음)
//   ③ '이용 내역' 목록은 20줄 높이까지만 보이고 그 안에서 스크롤 — 20개를 넘는 줄도 **사라지지 않는다**(종전 30줄 절단)
// 목킹 25장(분마다 1장 → 발급 25줄)으로 360·1440 실측. 서버 권한의 근거로 쓰지 않는다.
// 실행: E2E_BASE_URL=http://localhost:4315 npx playwright test e2e/voucher-pane-layout.spec.ts --output=<scratch>
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const SHOT = process.env.VSTAT_SHOT_DIR;
const N = 25;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const base = Date.parse('2026-09-20T03:00:00Z');
const rows = Array.from({ length: N }, (_, i) => ({
  id: `v${i}`, venue_id: MOCK_VENUE, issued_by: 'x', holder_user_id: `u${i}`, holder_name: `손님${i + 1}`,
  title: `이용권${String(i + 1).padStart(2, '0')}`, status: 'active', used_venue_id: null, used_at: null,
  created_at: new Date(base + i * 60_000).toISOString(), expires_at: null, issue_reason: 'grant', event_campaign_id: null,
  venue: { name: '테스트 홀덤펍' }, used_venue: null,
}));

async function open(page: Page, w: number, h: number) {
  await bootOwner(page, {
    viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(rows)) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_stats/, (r) => r.fulfill(json([{ holder_count: N, active_count: N, used_count: 0 }])));
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_profiles/, (r) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/rpc\/voucher_issue_approved/, (r) => r.fulfill(json(true)));
      await p.route(/\/rest\/v1\/rpc\/get_voucher_quota/, (r) => r.fulfill(json(100)));
      await p.route(/\/rest\/v1\/rpc\/venue_voucher_reason_stats/, (r) => r.fulfill(json([])));
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]').first(), '목킹 업주로 내 매장을 열지 못했다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
}

/** 그룹 이름 → 그 그룹 안 메뉴 라벨들(PC 사이드바 또는 모바일 전체 메뉴). */
const groups = (page: Page, root: string) => page.evaluate((sel) => {
  const out: Record<string, string[]> = {};
  const r = document.querySelector(sel);
  if (!r) return out;
  for (const p of r.querySelectorAll<HTMLElement>('p')) {
    const g = p.textContent?.trim() ?? '';
    if (!['운영', '분석', '관리'].includes(g)) continue;
    out[g] = [...p.parentElement!.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
  }
  return out;
}, root);

test.describe('이용권 · QR 화면 — 메뉴 그룹 · 접힘 기본값 · 이용 내역 20줄 스크롤', () => {
  for (const [W, H] of [[360, 780], [1440, 900]] as const) {
    test(`${W}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, W, H);
      // ① 내 캘린더 = 관리
      let g: Record<string, string[]>;
      if (W >= 1024) g = await groups(page, '[data-mystore-secbar]');
      else {
        await page.getByRole('button', { name: /전체 메뉴/ }).first().evaluate((b) => (b as HTMLElement).click());
        await page.waitForTimeout(400);
        g = await groups(page, '[data-tab="my-store"]');
      }
      expect.soft(Object.keys(g).length, '메뉴 그룹을 못 찾았다 — 빈 검사').toBeGreaterThanOrEqual(2);
      expect.soft(g['관리'] ?? [], "'내 캘린더' 가 '관리' 그룹에 없다").toContain('내 캘린더');
      expect.soft(g['운영'] ?? [], "'내 캘린더' 가 아직 '운영' 그룹에 있다").not.toContain('내 캘린더');
      // 이용권 · QR 로
      const vbtn = page.locator('button:visible', { hasText: /이용권\s*·\s*QR/ }).first();
      await vbtn.evaluate((b) => (b as HTMLElement).click());
      await page.waitForTimeout(2000);
      if (SHOT) await page.screenshot({ path: `${SHOT}/pane-${W}-${process.env.VSTAT_SHOT_TAG ?? 'after'}.png`, fullPage: true });
      const issue = page.getByTestId('voucher-issue');
      await expect(issue, '발급 칸이 없다').toBeVisible({ timeout: 15_000 });
      // ② 발급은 펼친 채로 시작 · 접는 토글 없음 / 매장 QR 은 접힌 채로 시작
      await expect(issue.getByRole('group', { name: '발급 근거' }), '발급 칸이 펼쳐져 있지 않다').toBeVisible();
      // 칸 제목이 접기 버튼이 아니다(안쪽의 다른 펼침 요소 — 한도 요청 등 — 는 별개)
      const head = page.getByTestId('voucher-issue-head');
      expect(await head.evaluate((h) => h.tagName), '발급 칸 제목이 버튼(접기 토글)이다').not.toBe('BUTTON');
      await expect(head.locator('button, [aria-expanded]'), '발급 칸 제목에 접기 토글이 있다').toHaveCount(0);
      const qrBtn = page.getByRole('button', { name: /매장 QR/ }).first();
      await expect(qrBtn).toHaveAttribute('aria-expanded', 'false');
      // ③ 이용 내역 — 25줄 전부 그려지고, 보이는 창은 20줄, 나머지는 스크롤로 닿는다
      const feed = page.getByTestId('voucher-feed');
      const m = await feed.evaluate((ul) => {
        const lis = [...ul.children] as HTMLElement[];
        const top = ul.getBoundingClientRect().top + ul.clientTop;
        const fullyIn = lis.filter((li) => li.getBoundingClientRect().bottom <= top + ul.clientHeight + 0.5).length;
        return { n: lis.length, fullyIn, sh: ul.scrollHeight, ch: ul.clientHeight, oy: getComputedStyle(ul).overflowY };
      });
      console.log(`[이용 내역 ${W}]`, JSON.stringify(m));
      expect(m.n, `이용 내역이 ${m.n}줄 — ${N}장이 전부 그려지지 않았다(절단)`).toBe(N);
      expect(m.fullyIn, '스크롤 없이 보이는 줄이 20이 아니다').toBe(20);
      expect(m.sh, '20줄을 넘는데 스크롤이 생기지 않았다').toBeGreaterThan(m.ch);
      expect(m.oy).toBe('auto');
      // 목록 안을 끝까지 스크롤하면 가장 오래된 줄(이용권01)이 목록 창 안에 들어온다 — 20개 넘는 줄이 사라지지 않았다
      const last = await feed.evaluate((ul) => {
        ul.scrollTop = ul.scrollHeight;
        const li = ul.lastElementChild as HTMLElement; const u = ul.getBoundingClientRect(), r = li.getBoundingClientRect();
        return { text: li.textContent ?? '', inside: r.top >= u.top - 0.5 && r.bottom <= u.bottom + 0.5, scrolled: ul.scrollTop };
      });
      expect(last.scrolled, '목록이 스크롤되지 않았다').toBeGreaterThan(0);
      expect(last.text, '맨 아래 줄이 가장 오래된 이용권이 아니다').toContain('이용권01');
      expect(last.inside, '맨 아래(가장 오래된) 줄에 스크롤로 닿지 못한다').toBe(true);
    });
  }
});
