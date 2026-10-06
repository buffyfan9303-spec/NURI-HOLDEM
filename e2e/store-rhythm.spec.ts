// 내 매장 — 세로 리듬 계약: **같은 크기 글자는 같은 행간**.
//
// 무엇을 막나: 같은 크기 글자가 화면마다 다른 행간을 갖는 것. 한 카드 안에서도 문단마다 호흡이
//   달라지면 "간격이 들쭉날쭉하다"로 보인다(오너 2026-09-07). 눈으로는 1~3px 차이라 리뷰에서 안 걸린다.
//   2026-10-06(오너 "18px 글자의 줄 간격이 두 가지로 섞여 있음 — 싹 해") 실측: 18px 이 제목 24 · KPI 18 · 숫자·본문 26,
//   13px 이 탭 18 · 설정 칩·정렬 탭 13, 12px 이 16 · 15 · 16.5 · 19.5, 15px 이 22 · 18.75 · 20 으로 갈려 있었다(1440 전 섹션 12개 크기 묶음 충돌).
//   고친 뒤 0. 정본은 index.css 의 크기별 행간 하나(text-2xs 12/16 · xs 13/18 · sm 15/22 · base 16/24 · lg 18/26 …).
//
// ⚠ 예전 판은 E2E_EMAIL/PASSWORD 가 있어야 돌았는데 그 계정은 2026-09-10 은퇴해 **늘 skip** 이었다.
//   이제 목킹 업주(_mockOwner) + 장부 픽스처로 계정 없이 매번 돈다(운영 쓰기 0 — _fixtures 가드).
//
// 예외(명시로만):
//   ① 행간을 글자 크기로 죽인(leading-none) **숫자 KPI·번호 배지**(숫자·기호, 끝에 만/원/명/회/건/장/점/T/% 단위 하나까지)와
//      **두 글자 이하 글리프**(＋ ✕ · 아바타 이니셜) — 고정 칸 안 한 줄 숫자/기호라 행간이 상자 계산이다.
//   ② TV 16:9 미리보기(.aspect-video) 안 — em·cqmin 으로 축소한 송출 화면 복제라 화면 글자 리듬 밖이다(TV 레이아웃 계약이 따로 지킨다).
//   ③ 오류 카드([role=alert] — atoms/LoadErrorCard)의 설명문 p 는 leading-relaxed(1.625배)까지 허용 — 서버가 준 실패 이유가 여러 줄로
//      오는 자리라 가독성용 넓은 행간이 의도다(리드 판정 2026-10-06). 다른 배수(예: 16.5 · 18.75)는 여기서도 위반이다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const SESSION = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 메인', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], schedule_id: null, tournament_start: null,
};
const buyin = (i: number, name: string, entry: number, over: Record<string, unknown> = {}) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, player_name: name, entry_no: entry,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T12:0${i}:00+09:00`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
  ...over,
});
// 장부·정산·통계 판이 숫자를 그리도록 — 김철수 2회 · 이영희 1회 미수 · 박민수 1회 카드
const BUYINS = [buyin(1, '김철수', 1), buyin(2, '김철수', 2), buyin(3, '이영희', 1, { is_unpaid: true }), buyin(4, '박민수', 1, { payment_method: 'card', cash_amount: 0, card_amount: 100_000 })];
const PLAYERS = ['김철수', '이영희', '박민수'].map((n, i) => ({ id: `dddddddd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: n, visitor_type: 'regular', note: null, sort_order: i }));
const bySeq = <T extends { game_seq: number }>(url: string, rows: T[]) => { const m = /game_seq=eq\.(\d+)/.exec(url); return m ? rows.filter((x) => x.game_seq === Number(m[1])) : rows; };
async function seed(p: Page) {
  await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
  await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const rows = bySeq(r.request().url(), [SESSION]);
    return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
  });
  await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(bySeq(r.request().url(), BUYINS)))));
  await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(bySeq(r.request().url(), PLAYERS)))));
}

type Leaf = { size: string; lh: string; text: string; where: string };
/** 보이는 잎 글자의 (크기, 행간) — 예외 ①② 는 여기서 거른다. */
const collect = (where: string): Leaf[] => {
  const NUM = /^(?:[+\-−–]?[\d.,:/%·×\s]*\d[\d.,:/%·×\s]*(?:만원|만|억|원|명|회|건|장|점|T|%)?|[—–\-·]+)$/u;
  const root = document.querySelector('[data-tab="my-store"]');
  const out: Leaf[] = [];
  if (!root) return out;
  for (const e of [...root.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,span,dt,dd,li')]) {
    if (e.offsetParent === null || e.children.length > 0 || e.closest('.aspect-video')) continue;
    const t = (e.textContent || '').trim();
    if (!t) continue;
    const cs = getComputedStyle(e);
    const size = parseFloat(cs.fontSize).toFixed(2);
    const lh = parseFloat(cs.lineHeight).toFixed(2);
    if (lh === size && (NUM.test(t) || [...t].length <= 2)) continue; // 예외 ①
    if (e.tagName === 'P' && e.closest('[role="alert"]') && lh === (parseFloat(cs.fontSize) * 1.625).toFixed(2)) continue; // 예외 ③
    out.push({ size, lh, text: t.slice(0, 24), where });
  }
  return out;
};

function violations(leaves: Leaf[]): string[] {
  const g = new Map<string, Map<string, string>>();
  for (const l of leaves) {
    const m = g.get(l.size) ?? new Map<string, string>();
    if (!m.has(l.lh)) m.set(l.lh, `${l.where}:«${l.text}»`);
    g.set(l.size, m);
  }
  return [...g].filter(([, m]) => m.size > 1).map(([size, m]) => `${size}px → ${[...m].map(([lh, ex]) => `${lh} ${ex}`).join(' / ')}`);
}

const MSG = '같은 크기 글자에 행간이 둘 이상이다 — leading-* 를 개별로 걸지 말고 크기별 정본(text-* · t-desc · t-tab)을 써라(숫자 KPI 의 leading-none · 오류 카드 설명문만 예외)';

test.describe('내 매장 — 세로 리듬(같은 크기 = 같은 행간)', () => {
  // 375 = 모바일(메뉴 시트로 이동) · 1440 = 업주 PC(사이드바). 두 폭 모두 **전 섹션 + 하위 탭**을 돈다 —
  //   대시보드 한 판만 보면 목 데이터에서 18px 충돌이 안 드러난다(2026-10-06 실측: 375 대시보드만으로는 수정 전 빌드도 통과).
  for (const vp of [{ w: 375, h: 812 }, { w: 1440, h: 900 }]) {
    test(`🔴 ${vp.w} 전 섹션 · 하위 탭`, async ({ page }) => {
      test.setTimeout(150_000);
      const pc = vp.w >= 1024;
      await bootOwner(page, { viewport: { width: vp.w, height: vp.h }, extra: seed });
      await openMyStore(page);
      await expect(page.locator('[data-mystore-secpanel]')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      const leaves: Leaf[] = await page.evaluate(collect, 'dashboard');
      // 모바일은 nav 가 '…메뉴' 버튼 뒤 시트에 있다(PC 는 사이드바).
      const bar = pc ? '[data-mystore-secbar] button' : '.animate-slide-up button';
      const openMenu = async () => {
        if (pc) return;
        await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.offsetParent !== null && (b.textContent ?? '').trim().endsWith('메뉴'))?.click(); });
        await page.waitForTimeout(400);
      };
      const click = (sel: string, label: string) => page.evaluate(([sel, label]) => {
        const b = [...document.querySelectorAll<HTMLElement>(sel)].find((x) => x.getClientRects().length && (x.textContent ?? '').trim() === label);
        b?.click(); return !!b;
      }, [sel, label] as [string, string]);
      // 성숙도로 접힌 메뉴(매출·손님 등)까지 연다
      await openMenu();
      await page.evaluate((bar) => { [...document.querySelectorAll<HTMLElement>(bar)].find((b) => b.getClientRects().length && /고급 기능 모두 보기/.test(b.textContent ?? ''))?.click(); }, bar);
      await page.waitForTimeout(400);
      const labels = (await page.evaluate((bar) => [...document.querySelectorAll<HTMLElement>(bar)].filter((b) => b.getClientRects().length).map((b) => (b.textContent ?? '').trim()), bar))
        .filter((l) => l && !/고급 기능|기본 메뉴/.test(l));
      expect(labels.length, '섹션 메뉴를 못 찾았다').toBeGreaterThan(6);
      if (!pc) await page.keyboard.press('Escape');
      for (const l of labels) {
        await openMenu();
        expect(await click(bar, l), `섹션 버튼 '${l}'`).toBe(true);
        await page.waitForTimeout(1400);
        leaves.push(...await page.evaluate(collect, l));
        const subs = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] [role=tab]')]
          .filter((x) => x.getClientRects().length).map((x) => (x.textContent ?? '').trim()));
        for (const s of subs.slice(1)) {
          await click('[data-mystore-rail] [role=tab]', s);
          await page.waitForTimeout(1200);
          leaves.push(...await page.evaluate(collect, `${l}~${s}`));
        }
      }
      expect(leaves.length, '잎 글자를 못 모았다 — 이 검사가 아무것도 안 잰 것').toBeGreaterThan(500);
      expect(violations(leaves), MSG).toEqual([]);
    });
  }
});
