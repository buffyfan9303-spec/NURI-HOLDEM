// 장부 클락 위젯(NuriPosLedger ClockRemoteBar) — 긴 브레이크 라벨이 남은 시간을 잘라 먹지 않는다 (review-251 P2-②, 2026-10-09).
//
// 왜: 라벨과 카운트다운이 한 `truncate` 문단 안에 있어, 포스터 원문 라벨이 장부 시작 경로로 클락에 실리자(PR #251 label 보존)
//   390 폭에서 'BREAK 10 MINS & REG …' 로 잘리며 **남은 시간(07:55)이 사라졌다**(scrollWidth 464 / clientWidth 192).
// 고침: 라벨 span(min-w-0 truncate) + 시간 span(shrink-0) 두 칸 — 시간은 절대 안 잘리고 라벨만 말줄임.
// 계약: ① 남은 시간 글자가 문단 안에 다 보인다 ② 문단 높이는 짧은 라벨·레벨(블라인드)과 같다(줄바꿈·레이아웃 이동 0).
// 음성 대조: 종전 마크업(한 `truncate` 문단 안 라벨+시간) 빌드에서 390 의 ① 이 실패한다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/ledger-clock-bar-label.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const LONG = 'BREAK 10 MINS & REG CLOSE · 1,000칩 레이스 (03:40)';
const level = (sb: number, bb: number) => ({ kind: 'level', sb, bb, ante: bb, minutes: 20 });
const clockRow = (idx: number) => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: MOCK_DAY, title: '수요 딥스택',
  config: {
    title: '수요 딥스택', startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false,
    earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 12, maxLevel: 18,
    earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [],
    levels: [level(100, 200), { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 10, label: LONG }, level(200, 400), { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 10 }],
  },
  current_index: idx, running: true, ends_at: new Date(Date.now() + 8 * 60_000).toISOString(), remaining_ms: 0,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null,
  updated_at: new Date().toISOString(),
});
const sessionRow = () => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '수요 딥스택', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: new Date(Date.now() - 3_600_000).toISOString(), tournament_start: null, schedule_id: null,
});

/** 위젯의 카운트다운(mm:ss) 글자와 그 문단 — 종전·수정 마크업 모두 같은 식으로 찾는다. */
async function measure(page: Page, w: number, h: number, idx: number) {
  await bootOwner(page, {
    viewport: { width: w, height: h }, clock: clockRow(idx),
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? sessionRow() : [sessionRow()]) });
      });
    },
  });
  await openMyStore(page);
  await expect.poll(() => page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLElement>('button,[role=tab]')].find((x) => x.innerText?.trim() === '장부' && x.getBoundingClientRect().width > 0);
    b?.click(); return !!b;
  }), { timeout: 20_000 }).toBe(true);
  await expect(page.getByRole('button', { name: '이전 레벨' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const prev = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '이전 레벨')!;
    const row = prev.parentElement!;
    const cd = [...row.querySelectorAll<HTMLElement>('span')].find((s) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(s.textContent?.trim() ?? ''))!;
    const para = cd.closest('p')!;
    const pr = para.getBoundingClientRect(); const cr = cd.getBoundingClientRect();
    return {
      cdText: cd.textContent?.trim() ?? '', cdL: cr.left, cdR: cr.right, cdW: cr.width,
      pL: pr.left, pR: pr.right, pTop: pr.top, pH: pr.height,
      text: para.textContent ?? '',
    };
  });
}

for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]] as const) {
  test(`🔴 ${w}×${h} · 긴 브레이크 라벨 — 남은 시간이 다 보이고, 문단 높이는 레벨일 때와 같다`, async ({ page }) => {
    const lvl = await measure(page, w, h, 0);
    const brk = await measure(page, w, h, 1);
    expect(brk.text, '긴 라벨이 위젯에 실리지 않았다(픽스처 확인)').toContain('BREAK 10 MINS');
    expect(brk.cdW, '남은 시간 글자 폭이 0').toBeGreaterThan(10);
    expect(brk.cdR, `남은 시간(${brk.cdText})이 문단 오른쪽 밖(${(brk.cdR - brk.pR).toFixed(0)}px)으로 잘린다`).toBeLessThanOrEqual(brk.pR + 0.5);
    expect(brk.cdL, '남은 시간이 문단 왼쪽 밖').toBeGreaterThanOrEqual(brk.pL - 0.5);
    expect(Math.abs(brk.pH - lvl.pH), `문단 높이가 레벨(${lvl.pH}) 대비 바뀐다(${brk.pH}) — 줄바꿈/레이아웃 이동`).toBeLessThan(0.6);
    expect(Math.abs(brk.pTop - lvl.pTop), '문단 위치가 레벨 대비 움직인다').toBeLessThan(0.6);
  });
}
