// 내 매장 모바일 단계 바 전환 — "요약·포스터·장부·클락 이렇게 움직이면 하단 전체 콘텐츠가 위로 올라갔다가 내려와"(오너 2026-10-01).
//
// 원인(수정 전 빌드 실측 · 목킹 업주 · rAF 시계열): 모바일 섹션 헤더는 설명이 제목 아래로 내려가는데 **단계마다 줄 수가 달랐다**.
//   헤더 높이 포스터·장부·순위 78 / 클락·정산 59(390) · 412 에선 78·78·46·59·46 → 레일 아래 판 윗변이
//   172→172→140→154→140 으로 단계를 옮길 때마다 오르내렸다. PC 는 헤더가 한 줄 48 고정이라 안 생긴다.
// 고침: VenueManageTab.tsx — 게임 단계 5개 헤더를 같은 격자 칸에 겹쳐 두고 지금 단계만 보이게(칸 높이 = 최댓값).
//
// 재는 것: 전환마다 rAF 프레임별 「판 윗변 − 레일 밑변」(스크롤과 무관한 상대값), scrollY, scrollHeight.
//   ① 게임 단계 5개의 정착 오프셋이 전부 같다(±1px) — 수정 전 빌드에서 32px 차로 빨갛다.
//   ② 한 전환 안에서 새 판이 선 뒤 오프셋이 한 방향으로라도 1px 넘게 움직이지 않는다(오르내림 0).
// 탭은 DOM click(page.evaluate) — Playwright click 의 자동 스크롤이 scrollY 를 오염시키지 않게.
// 요약(대시보드 헤더 숨김, 2026-09-24 오너 결정)·이용권(게임 칩 줄 없음)은 다른 섹션이라 ①의 대상이 아니다 — 시계열만 기록한다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE } from './_mockOwner';

const RAIL = '[data-mystore-rail]';
const GAME = ['포스터', '장부', '클락', '순위', '정산'] as const;
const SEQ = ['포스터', '장부', '클락', '순위', '정산', '이용권', '정산', '순위', '클락', '장부', '포스터', '요약'] as const;

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const get = (body: unknown[]) => (r: Route) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(isSingle(r) ? (body[0] ?? null) : body)));
const session = (seq: number, title: string) => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: seq, title, buyin_amount: 100_000, card_amount: null,
  target_entries: 40, game_type: 'gtd', max_entries: 0, is_addon: false, addon_stack: 0, addon_amount: 0,
  operators: [], discounts: [], early_double_min: 0, early_single_min: 0, tournament_start: null,
  opened_by: null, opened_at: new Date().toISOString(), reg_closed: false, closed: false, schedule_id: null, voucher_issued: 0,
});

async function open(page: Page, w: number) {
  await bootOwner(page, {
    viewport: { width: w, height: 844 }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      // 메인+사이드 = 칩 줄이 뜨는 날(실매장 흔한 상태)
      await p.route(/\/rest\/v1\/ledger_sessions\?/, get([session(1, '수요 딥스택'), session(2, '사이드 터보')]));
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '목킹 업주로 내 매장 단계 바를 열지 못했다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
}

type Frame = { t: number; off: number | null; pane: string | null; y: number; H: number };
/** 레일 칸 하나를 DOM click 하고 1.2s 동안 rAF 프레임마다 잰다. 칸이 없으면 null(호출부가 실패시킨다). */
const step = (page: Page, name: string) => page.evaluate(async ([sel, n]) => {
  const rail = document.querySelector<HTMLElement>(sel);
  const btn = rail && [...rail.querySelectorAll<HTMLElement>('button')].find((x) => getComputedStyle(x).display !== 'none' && x.textContent?.trim() === n);
  if (!rail || !btn) return null;
  const out: { t: number; off: number | null; pane: string | null; y: number; H: number }[] = [];
  const t0 = performance.now();
  const snap = () => {
    const pane = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] [data-pane]')].find((e) => e.getClientRects().length > 0);
    out.push({ t: Math.round(performance.now() - t0), pane: pane?.dataset.pane ?? null,
      off: pane ? Math.round((pane.getBoundingClientRect().top - rail.getBoundingClientRect().bottom) * 10) / 10 : null,
      y: Math.round(scrollY), H: document.scrollingElement!.scrollHeight });
  };
  btn.click();
  await new Promise<void>((res) => { const f = () => { snap(); if (performance.now() - t0 < 1200) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return out;
}, [RAIL, name] as const);

const PANE: Record<string, string> = { 포스터: 'posters', 장부: 'ledger', 클락: 'clock', 순위: 'ranking', 정산: 'settle', 이용권: 'voucher', 요약: 'dashboard' };

for (const [W, Y] of [[360, 0], [390, 0], [412, 0], [390, 600]] as const) {
  test(`${W}px · scroll ${Y} — 게임 단계 전환에서 레일 아래 콘텐츠가 오르내리지 않는다`, async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, W);
    const settled: Record<string, number[]> = {};
    const osc: string[] = [];
    let measured = 0;
    for (const n of SEQ) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), Y);
      await page.waitForTimeout(300);
      const fr: Frame[] | null = await step(page, n);
      expect(fr, `레일에 «${n}» 칸이 없다`).not.toBeNull();
      const mine = fr!.filter((f) => f.pane === PANE[n] && f.off != null);
      expect(mine.length, `«${n}» 판이 1.2s 안에 서지 않았다 — 빈 검사`).toBeGreaterThan(5);
      measured++;
      const fin = mine[mine.length - 1].off!;
      (settled[n] ??= []).push(fin);
      // ② 새 판이 선 뒤의 모든 프레임이 정착값과 같아야 한다(위로 갔다 내려옴 = 중간 프레임이 정착값과 다름)
      const off = mine.filter((f) => Math.abs(f.off! - fin) > 1);
      if (off.length) osc.push(`${n}: ${off.slice(0, 4).map((f) => `t${f.t} ${f.off}`).join(', ')} → ${fin}`);
      console.log(`${W}/${Y} → ${n}: off ${mine[0].off}→${fin} · y ${fr![0].y}→${fr![fr!.length - 1].y} · H ${fr![0].H}→${fr![fr!.length - 1].H}`);
    }
    expect(measured, '전환을 다 재지 못했다').toBe(SEQ.length);
    expect(osc, '전환 도중 레일 아래 판이 움직였다').toEqual([]);
    // ① 게임 단계끼리 레일 아래 위치가 같다(정방향·역방향 양쪽 값 모두)
    const g = GAME.flatMap((n) => settled[n] ?? []);
    expect(g.length, '게임 단계 정착값이 모자란다').toBe(GAME.length * 2);
    expect(Math.max(...g) - Math.min(...g), `게임 단계별 레일 아래 위치가 다르다: ${GAME.map((n) => `${n} ${settled[n]}`).join(' · ')}`).toBeLessThanOrEqual(1);
  });
}
